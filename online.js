/** Supabase-backed guest identity, cloud saves, friends and chat. */
const OnlineSystem = {
    client: null,
    user: null,
    profile: null,
    linked: false,
    ready: false,
    status: 'Connecting…',
    subscription: null,
    messageCache: [],
    lastMessageAt: 0,
    activeCombatGroup: null,
    voiceProfiles: Array.from({ length: 20 }, (_, i) => ({
        id: `${i < 10 ? 'boy' : 'girl'}-${(i % 10) + 1}`,
        label: `${i < 10 ? 'Boy' : 'Girl'} Voice ${(i % 10) + 1}`,
        pitch: i < 10 ? 0.78 + (i % 10) * 0.045 : 1.08 + (i % 10) * 0.045,
        rate: 0.82 + (i % 5) * 0.07,
        voiceIndex: i % 10
    })),
    selectedVoice: localStorage.getItem('black_sword_chat_voice') || 'boy-1',

    async init() {
        if (this.ready) return;
        this.populateVoiceSelectors();
        const config = window.SUPABASE_CONFIG;
        if (!config || !window.supabase?.createClient) {
            this.status = 'Offline mode — online library unavailable';
            this.ensureLocalCode();
            this.updateIndicators();
            return;
        }
        try {
            this.client = window.supabase.createClient(config.url, config.publishableKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
            const { data: { session } } = await this.client.auth.getSession();
            let activeSession = session;
            if (!activeSession) {
                const result = await this.client.auth.signInAnonymously({
                    options: { data: { display_name: this.defaultDisplayName() } }
                });
                if (result.error) throw result.error;
                activeSession = result.data.session;
            }
            this.user = activeSession.user;
            await this.loadProfile();
            await this.refreshIdentityStatus();
            this.ready = true;
            this.status = this.linked ? 'Online — Google linked' : 'Online guest — link Google for social actions';
            const oauthParams = new URLSearchParams(`${location.search || ''}&${(location.hash || '').replace(/^#/, '')}`);
            const oauthError = oauthParams.get('error_description') || oauthParams.get('error_code');
            if (oauthError) this.status = `Google linking needs attention: ${decodeURIComponent(oauthError.replace(/\+/g, ' '))}. If this Google account already exists, use “sign in & merge heroes” in Settings.`;
            await this.updatePresence();
            await this.cacheCloudSave();
            this.subscribe();
            this.updateIndicators();
            this.client.auth.onAuthStateChange(async (_event, newSession) => {
                if (!newSession) return;
                this.user = newSession.user;
                await this.loadProfile();
                await this.refreshIdentityStatus();
                this.status = this.linked ? 'Online — Google linked' : 'Online guest — link Google for social actions';
                await this.cacheCloudSave();
                this.updateIndicators();
                if (window.Game?.state?.player) this.saveGame(window.Game.getCloudData());
            });
        } catch (error) {
            console.error('Online initialization failed:', error);
            this.status = error.message?.toLowerCase().includes('anonymous')
                ? 'Setup needed: enable Anonymous Sign-Ins in Supabase'
                : `Offline mode — ${error.message || 'connection failed'}`;
            this.ensureLocalCode();
            this.updateIndicators();
        }
    },

    defaultDisplayName() {
        return window.Game?.state?.player?.name || 'Wandering Hero';
    },

    ensureLocalCode() {
        let code = localStorage.getItem('black_sword_guest_code');
        if (!code) {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            code = `LOCAL-${part()}-${part()}`;
            localStorage.setItem('black_sword_guest_code', code);
        }
        this.profile ||= { player_code: code, display_name: this.defaultDisplayName() };
    },

    populateVoiceSelectors() {
        const options = this.voiceProfiles.map(v => `<option value="${v.id}">${v.label}</option>`).join('');
        ['chat-voice','settings-chat-voice'].forEach(id => {
            const select = document.getElementById(id);
            if (select) { select.innerHTML = options; select.value = this.selectedVoice; }
        });
        const auto = document.getElementById('chat-auto-speak');
        if (auto) auto.checked = localStorage.getItem('black_sword_auto_speak') !== 'false';
    },

    setVoiceProfile(id) {
        if (!this.voiceProfiles.some(v => v.id === id)) return;
        this.selectedVoice = id;
        localStorage.setItem('black_sword_chat_voice', id);
        ['chat-voice','settings-chat-voice'].forEach(selectId => { const el=document.getElementById(selectId); if(el) el.value=id; });
    },

    speakText(text, voiceId = this.selectedVoice) {
        if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
            window.Game?.addNarrative?.('Spoken chat is not supported by this browser.', 'system'); return;
        }
        const profile = this.voiceProfiles.find(v => v.id === voiceId) || this.voiceProfiles[0];
        const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 300));
        utterance.pitch = profile.pitch; utterance.rate = profile.rate; utterance.volume = 0.9;
        const voices = speechSynthesis.getVoices();
        const boyHints=['male','david','daniel','george','james','ravi','microsoft mark'];
        const girlHints=['female','zira','samantha','victoria','karen','veena','google uk english female'];
        const hints = profile.id.startsWith('girl') ? girlHints : boyHints;
        const preferred = voices.filter(v => hints.some(h => v.name.toLowerCase().includes(h)));
        const pool = preferred.length ? preferred : voices;
        if (pool.length) utterance.voice = pool[profile.voiceIndex % pool.length];
        speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    },

    testSelectedVoice() { this.speakText(`This is ${this.voiceProfiles.find(v=>v.id===this.selectedVoice)?.label || 'your selected voice'} in Black Sword chat.`); },
    speakMessageById(id) { const m=this.messageCache.find(x=>String(x.id)===String(id)); if(m)this.speakText(`${m.sender?.display_name || 'Hero'} says: ${m.body}`,m.voice_id||'boy-1'); },

    async loadProfile(retry = true) {
        let { data, error } = await this.client.rpc('get_my_profile');
        if (!error && Array.isArray(data)) data=data[0]||null;
        // Backward compatibility until the v7 privacy migration is installed.
        if (error && /get_my_profile|schema cache|function/i.test(error.message||'')) ({data,error}=await this.client.from('profiles').select('id,player_code,display_name,level,current_location,last_seen').eq('id',this.user.id).maybeSingle());
        if (error) throw error;
        if (!data && retry) { await new Promise(resolve=>setTimeout(resolve,500)); return this.loadProfile(false); }
        if (!data) throw new Error('Database schema is not installed yet');
        this.profile=data;
    },

    async refreshIdentityStatus() {
        const identities = this.user?.identities || [];
        this.linked = identities.some(identity => identity.provider && identity.provider !== 'anonymous') || this.user?.is_anonymous === false;
    },

    async updatePresence() {
        if (!this.ready || !this.user) return;
        const player = window.Game?.state?.player;
        const heroName = player?.name?.trim() || this.profile?.display_name || 'Wandering Hero';
        const { error } = await this.client.from('profiles').update({
            display_name: heroName,
            level: player?.level || this.profile?.level || 1,
            current_location: window.WorldData?.locations?.[window.Game?.state?.location]?.name || this.profile?.current_location || 'Kaliwasch City',
            last_seen: new Date().toISOString()
        }).eq('id', this.user.id);
        if (error) { console.warn('Hero-name sync failed:', error.message); return; }
        await this.loadProfile(false).catch(() => {});
        this.updateIndicators();
    },

    syncActiveHero(retry = 0) {
        if (this.ready && this.user) return this.updatePresence();
        if (retry < 10) setTimeout(() => this.syncActiveHero(retry + 1), 500);
    },

    getPlayerCode() {
        if (!this.profile) this.ensureLocalCode();
        return this.profile.player_code;
    },

    async copyPlayerCode() {
        const code = this.getPlayerCode();
        try { await navigator.clipboard.writeText(code); }
        catch { window.prompt('Copy your Player ID:', code); }
        window.Game?.addNarrative?.(`Player ID copied: ${code}`, 'system');
    },

    async signInGoogle() {
        if (!this.client) await this.init();
        if (!this.client) { this.status='Online service is not connected.'; this.updateIndicators(); return; }
        localStorage.setItem('black_sword_google_login_requested','true');
        if (this.linked) {
            this.status=`Restoring ${this.profile?.display_name || 'your Google account'} heroes…`;
            this.updateIndicators();
            await this.cacheCloudSave(true);
            return;
        }
        const {error}=await this.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}${location.pathname}`}});
        if(error){localStorage.removeItem('black_sword_google_login_requested');this.status=`Google sign-in failed: ${error.message}`;this.updateIndicators();}
    },

    async mergeWithGoogle() {
        if (!this.client) await this.init();
        if (!this.client) return;
        if (window.Game?.state?.player) localStorage.setItem('black_sword_pending_google_merge', JSON.stringify(window.Game.getCloudData()));
        localStorage.setItem('black_sword_merge_requested', 'true');
        const { error } = await this.client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:`${location.origin}${location.pathname}` } });
        if (error) { this.status=`Google merge sign-in failed: ${error.message}`; this.updateIndicators(); }
    },

    async linkGoogle() {
        if (!this.client) await this.init();
        if (!this.client) { this.status = 'Online service is not connected.'; this.updateIndicators(); return; }
        if (this.linked) { this.status = 'Google is already linked.'; this.updateIndicators(); return; }
        const { error } = await this.client.auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: `${location.origin}${location.pathname}` }
        });
        if (error) {
            this.status = `Google linking failed: ${error.message}`;
            this.updateIndicators();
        }
    },

    async signOut() {
        if (!this.client) return;
        await this.client.auth.signOut();
        this.ready = false; this.user = null; this.profile = null; this.linked = false;
        location.reload();
    },

    requireLinked(action) {
        if (this.linked) return true;
        window.Game?.addNarrative?.(`Link Google in Settings before you can ${action}. Guests can still play and read public chat.`, 'system');
        this.showSettings();
        return false;
    },

    async saveGame(saveData) {
        if (!this.ready || !this.user || !saveData) return;
        const { error } = await this.client.from('game_saves').upsert({
            user_id: this.user.id, save_data: saveData, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) console.warn('Cloud save failed:', error.message);
        else this.updatePresence();
    },

    async loadCloudSave() {
        if (!this.ready || !this.user) return null;
        const { data, error } = await this.client.from('game_saves').select('save_data,updated_at').eq('user_id', this.user.id).maybeSingle();
        if (error) throw error;
        return data;
    },

    async cacheCloudSave(forceRestore = false) {
        if (!this.ready || !window.Game) return;
        try {
            const loginRequested=forceRestore||localStorage.getItem('black_sword_google_login_requested')==='true';
            const cloud = await this.loadCloudSave();
            const payload = cloud?.save_data;
            let roster = payload?.heroes ? payload : (payload?.player ? { version:2, activeHeroId:'hero_cloud_legacy', heroes:{ hero_cloud_legacy:payload } } : { version:2, activeHeroId:null, heroes:{} });
            const mergeRequested = localStorage.getItem('black_sword_merge_requested') === 'true';
            let pending = null;
            try { pending = JSON.parse(localStorage.getItem('black_sword_pending_google_merge')); } catch {}
            if (mergeRequested && pending?.heroes) {
                const merged = { version:2, activeHeroId:pending.activeHeroId, heroes:{...roster.heroes} };
                Object.entries(pending.heroes).forEach(([id,hero]) => {
                    let target=id; while(merged.heroes[target]) target=`guest_${Date.now().toString(36)}_${target}`;
                    merged.heroes[target]=hero; if(id===pending.activeHeroId) merged.activeHeroId=target;
                });
                roster=merged; localStorage.removeItem('black_sword_merge_requested'); localStorage.removeItem('black_sword_pending_google_merge');
                await this.saveGame(roster); this.status=`Online — Google linked; guest heroes merged successfully`;
            }
            if (!Object.keys(roster.heroes || {}).length) {
                localStorage.removeItem('black_sword_google_login_requested');
                this.status=this.linked?'Google account connected; no cloud heroes were found. Create the first hero.':'No cloud heroes were found.';
                this.updateHeroEntryPoints(false);this.updateIndicators();return;
            }
            if (!window.Game.state.player || mergeRequested || loginRequested) {
                localStorage.setItem(window.Game.state.rosterKey, JSON.stringify(roster));
                const active = roster.heroes[roster.activeHeroId] || Object.values(roster.heroes)[0];
                if (active) {
                    localStorage.setItem(window.Game.state.saveKey, JSON.stringify(active));
                    if (active.player?.name) {
                        this.profile.display_name = active.player.name;
                        this.client.from('profiles').update({ display_name:active.player.name, level:active.player.level||1, last_seen:new Date().toISOString() }).eq('id',this.user.id).then(()=>{});
                    }
                }
                window.Game.state.activeHeroId=roster.activeHeroId;
                if(loginRequested){window.Game.state.player=null;window.Game.state.inCombat=false;window.Game.state.enemy=null;}
                this.updateHeroEntryPoints(true);
                if(!mergeRequested)this.status=`Online — Google linked; restored ${Object.keys(roster.heroes).length} cloud hero${Object.keys(roster.heroes).length===1?'':'es'}`;
                localStorage.removeItem('black_sword_google_login_requested');
                this.updateIndicators();
                if(loginRequested||forceRestore)window.Game.showHeroRoster();
            }
        } catch (error) { localStorage.removeItem('black_sword_google_login_requested');this.status=`Cloud restore failed: ${error.message}`;this.updateIndicators();console.warn('Cloud restore check failed:', error.message); }
    },

    updateHeroEntryPoints(hasRoster = null) {
        let rosterCount=0;try{rosterCount=Object.keys(window.Game?.getRoster?.().heroes||{}).length;}catch{}
        const available=hasRoster===null?rosterCount>0:Boolean(hasRoster);
        const protectedRoster=available&&(this.linked||localStorage.getItem('black_sword_recovered_by_id')==='true');
        const newButton=document.getElementById('btn-new');if(newButton)newButton.hidden=protectedRoster;
        const continueButton=document.getElementById('btn-continue');if(continueButton)continueButton.disabled=!available;
        const heroesButton=document.getElementById('btn-heroes');if(heroesButton)heroesButton.hidden=false;
    },

    async findProfile(query) {
        if (!this.ready) return null;
        const clean=query.trim();
        if(/^KND-/i.test(clean)) throw new Error('Player IDs are private login/recovery credentials. Search using the exact hero name.');
        let {data,error}=await this.client.rpc('find_heroes_by_name',{hero_name:clean});
        if(error&&/find_heroes_by_name|schema cache|function/i.test(error.message||'')) ({data,error}=await this.client.from('profiles').select('id,display_name,level,current_location,last_seen').ilike('display_name',clean).limit(5));
        if(error)throw error;const matches=data||[];
        if(matches.length>1)throw new Error(`More than one hero is named “${clean}”. Ask the player to choose a more distinctive hero name.`);
        return matches[0]||null;
    },

    async sendFriendRequest(query) {
        if (!this.requireLinked('send friend requests')) return false;
        try {
            const target = await this.findProfile(query);
            if (!target) throw new Error('Hero not found. Use the exact public hero name.');
            if (target.id === this.user.id) throw new Error('You cannot send a request to yourself.');
            const { error } = await this.client.from('friend_requests').insert({ sender_id: this.user.id, receiver_id: target.id });
            if (error) throw error;
            window.Game.addNarrative(`Friend request sent to ${target.display_name}.`, 'npc');
            return true;
        } catch (error) { window.Game.addNarrative(error.message, 'system'); return false; }
    },

    async listFriendRequests() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('friend_requests')
            .select('id,status,sender_id,receiver_id,created_at,sender:profiles!friend_requests_sender_id_fkey(display_name),receiver:profiles!friend_requests_receiver_id_fkey(display_name)')
            .order('created_at', { ascending: false }).limit(50);
        if (error) { console.warn(error.message); return []; }
        return data || [];
    },

    async respondToRequest(id, status) {
        if (!['accepted','rejected'].includes(status)) return;
        const { error } = await this.client.from('friend_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('receiver_id', this.user.id);
        if (error) window.Game.addNarrative(error.message, 'system');
        else window.Game.addNarrative(`Friend request ${status}.`, status === 'accepted' ? 'npc' : 'system');
        window.Game.showSocial();
    },

    async sendMessage(targetQuery, body) {
        const text = body.trim().slice(0, 300);
        if (!text) return false;
        if (!this.ready || !this.user) { window.Game.addNarrative('Chat is still connecting.', 'system'); return false; }
        if (Date.now() - this.lastMessageAt < 2000) { window.Game.addNarrative('Please wait two seconds between messages.', 'system'); return false; }
        try {
            let receiverId = null;
            if (targetQuery && !['public','all','world'].includes(targetQuery.toLowerCase())) {
                const target = await this.findProfile(targetQuery);
                if (!target) throw new Error('Message recipient not found.');
                receiverId = target.id;
            }
            let { error } = await this.client.from('messages').insert({ sender_id:this.user.id, receiver_id:receiverId, body:text, voice_id:this.selectedVoice });
            // Backward-compatible until features_v5_voice_chat.sql is installed.
            if (error && /voice_id|schema cache/i.test(error.message || '')) ({ error } = await this.client.from('messages').insert({ sender_id:this.user.id, receiver_id:receiverId, body:text }));
            if (error) throw error;
            this.lastMessageAt=Date.now(); return true;
        } catch (error) { window.Game.addNarrative(error.message, 'system'); return false; }
    },

    async listOnlineHeroes() {
        if (!this.ready) return [];
        const since=new Date(Date.now()-10*60*1000).toISOString();
        const {data,error}=await this.client.from('profiles').select('display_name,level,current_location,last_seen').gte('last_seen',since).order('last_seen',{ascending:false}).limit(30);
        if(error){window.Game?.addNarrative?.(error.message,'system');return [];}return data||[];
    },

    async sendFeedback(kind,message) {
        if(!this.ready||!message?.trim())return false;
        const {error}=await this.client.from('game_feedback').insert({user_id:this.user.id,kind:kind==='bug'?'bug':'feedback',message:message.trim().slice(0,1000)});
        if(error){window.Game.addNarrative(`Feedback could not be stored: ${error.message}`,'system');return false;}
        window.Game.addNarrative('Thank you. Your report was securely stored.','treasure');return true;
    },

    async myBrotherhood() {
        const {data,error}=await this.client.from('guild_members').select('role,guild:guilds(id,name,owner_id,rupees)').eq('user_id',this.user.id).limit(1).maybeSingle();
        if(error) return null; return data;
    },
    async inviteBrotherhood(query) {
        if(!this.requireLinked('invite heroes to a brotherhood'))return;
        const [membership,target]=await Promise.all([this.myBrotherhood(),this.findProfile(query)]);
        if(!membership?.guild||!target){window.Game.addNarrative('Brotherhood membership or target hero not found.','system');return;}
        const {error}=await this.client.from('guild_invites').insert({guild_id:membership.guild.id,sender_id:this.user.id,receiver_id:target.id});
        window.Game.addNarrative(error?error.message:`Brotherhood invitation sent to ${target.display_name}.`,error?'system':'npc');
    },
    async listBrotherhoodInvites() {
        const {data,error}=await this.client.from('guild_invites').select('id,status,guild:guilds(id,name),sender:profiles!guild_invites_sender_id_fkey(display_name)').eq('receiver_id',this.user.id).eq('status','pending');
        return error?[]:(data||[]);
    },
    async respondBrotherhoodInvite(id,accept=true) {
        const {data:invite,error}=await this.client.from('guild_invites').select('id,guild_id').eq('id',id).eq('receiver_id',this.user.id).single();if(error)return;
        await this.client.from('guild_invites').update({status:accept?'accepted':'rejected',updated_at:new Date().toISOString()}).eq('id',id);
        if(accept)await this.client.from('guild_members').insert({guild_id:invite.guild_id,user_id:this.user.id,role:'member'});
        window.Game.addNarrative(`Brotherhood invitation ${accept?'accepted':'rejected'}.`,'npc');
    },

    async createCombatGroup(name='Hero Combat Group') {
        if(!this.requireLinked('create an online combat group'))return null;
        const {data:g,error}=await this.client.from('combat_groups').insert({name:name.slice(0,40),owner_id:this.user.id}).select('*').single();if(error){window.Game.addNarrative(error.message,'system');return null;}
        await this.client.from('combat_group_members').insert({group_id:g.id,user_id:this.user.id,role:'leader'});this.activeCombatGroup=g.id;window.Game.addNarrative(`Online combat group created: ${g.name}.`,'treasure');return g;
    },
    async inviteCombatGroup(query) {
        if(!this.activeCombatGroup){const {data}=await this.client.from('combat_group_members').select('group_id').eq('user_id',this.user.id).eq('role','leader').limit(1).maybeSingle();this.activeCombatGroup=data?.group_id;}
        const target=await this.findProfile(query);if(!this.activeCombatGroup||!target){window.Game.addNarrative('Create a combat group and provide an exact hero name.','system');return;}
        const {error}=await this.client.from('combat_group_invites').insert({group_id:this.activeCombatGroup,sender_id:this.user.id,receiver_id:target.id});window.Game.addNarrative(error?error.message:`Combat-group invitation sent to ${target.display_name}.`,error?'system':'npc');
    },
    async listCombatGroupInvites(){const {data,error}=await this.client.from('combat_group_invites').select('id,status,group:combat_groups(id,name),sender:profiles!combat_group_invites_sender_id_fkey(display_name)').eq('receiver_id',this.user.id).eq('status','pending');return error?[]:(data||[]);},
    async respondCombatGroupInvite(id,accept=true){const {data:i,error}=await this.client.from('combat_group_invites').select('id,group_id').eq('id',id).eq('receiver_id',this.user.id).single();if(error)return;await this.client.from('combat_group_invites').update({status:accept?'accepted':'rejected',updated_at:new Date().toISOString()}).eq('id',id);if(accept){await this.client.from('combat_group_members').insert({group_id:i.group_id,user_id:this.user.id,role:'member'});this.activeCombatGroup=i.group_id;}window.Game.addNarrative(`Combat-group invitation ${accept?'accepted':'rejected'}.`,'npc');},
    async recordGroupAttack(monster,damage){if(!this.ready||!this.activeCombatGroup||damage<=0)return;await this.client.from('group_battle_actions').insert({group_id:this.activeCombatGroup,user_id:this.user.id,monster_name:monster,damage});},

    async createGuild(name) {
        if (!this.requireLinked('create a guild')) return null;
        const clean = name.trim().slice(0, 32);
        try {
            const { data: guild, error } = await this.client.from('guilds').insert({ name: clean, owner_id: this.user.id }).select('id,name,owner_id,rupees').single();
            if (error) throw error;
            const { error: memberError } = await this.client.from('guild_members').insert({ guild_id: guild.id, user_id: this.user.id, role: 'owner' });
            if (memberError) throw memberError;
            window.Game.addNarrative(`Online guild created: ${guild.name}.`, 'treasure');
            return guild;
        } catch (error) { window.Game.addNarrative(error.message, 'system'); return null; }
    },

    async listMyGuilds() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('guild_members')
            .select('role,joined_at,guild:guilds(id,name,owner_id,rupees)').eq('user_id', this.user.id);
        if (error) { console.warn(error.message); return []; }
        return data || [];
    },

    async listMessages() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('messages')
            .select('*,sender:profiles!messages_sender_id_fkey(display_name)')
            .order('created_at', { ascending: false }).limit(30);
        if (error) { console.warn(error.message); return []; }
        this.messageCache=(data || []).reverse(); return this.messageCache;
    },

    async subscribe() {
        if (!this.client || this.subscription) return;
        const membershipResult=await this.client.from('combat_group_members').select('group_id').eq('user_id',this.user.id).limit(1).maybeSingle();
        const hasV6=!membershipResult.error;this.activeCombatGroup=membershipResult.data?.group_id||null;
        let channel=this.client.channel('black-sword-social')
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{this.refreshOpenSocial();const m=payload.new;if(m.sender_id!==this.user?.id&&localStorage.getItem('black_sword_auto_speak')!=='false')this.speakText(m.body,m.voice_id||'boy-1');})
            .on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>this.refreshOpenSocial());
        if(hasV6) channel=channel
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'group_battle_actions'},payload=>{const a=payload.new,g=window.Game;if(a.group_id!==this.activeCombatGroup||a.user_id===this.user?.id||!g?.state?.inCombat||!g.state.enemy)return;if(g.state.enemy.name.toLowerCase()!==String(a.monster_name).toLowerCase())return;g.state.enemy.hp-=a.damage;g.addNarrative(`⚔ Cooperative ally deals ${a.damage} damage to ${a.monster_name}!`,'combat');g.updateEnemyHUD();if(g.state.enemy.hp<=0)g.enemyDefeated();})
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'guild_invites'},()=>this.refreshOpenSocial())
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'combat_group_invites'},()=>this.refreshOpenSocial());
        this.subscription=channel.subscribe();
    },

    refreshOpenSocial() {
        if (!document.getElementById('social-panel')?.classList.contains('hidden')) window.Game?.showSocial?.();
    },

    updateIndicators() {
        const activeName = window.Game?.state?.player?.name || this.profile?.display_name || 'No hero selected';
        const el = document.getElementById('online-status');
        if (el) el.textContent = `${activeName} • ${this.status}`;
        const titleStatus = document.getElementById('title-account-status');
        if (titleStatus) titleStatus.textContent = `${activeName} • ${this.status}`;
        const signIn = document.getElementById('btn-google-signin');
        if (signIn) {
            signIn.disabled=false;
            signIn.innerHTML=this.linked
                ? '<span class="google-mark" aria-hidden="true">G</span> Restore Google Heroes'
                : '<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
        }
        const code = document.getElementById('settings-player-code');
        if (code) code.textContent = this.getPlayerCode();
        const heroName = document.getElementById('settings-hero-name');
        if (heroName) heroName.textContent = activeName;
        const account = document.getElementById('settings-account-status');
        if (account) account.textContent = this.linked ? 'Google linked' : (this.ready ? 'Guest account' : 'Local/offline guest');
        const google = document.getElementById('btn-link-google');
        if (google) google.disabled = this.linked;
        const merge = document.getElementById('btn-google-merge');
        if (merge) merge.disabled = this.linked;
        this.populateVoiceSelectors();
        this.updateHeroEntryPoints();
    },

    showSettings() {
        this.updateIndicators();
        document.getElementById('settings-panel')?.classList.remove('hidden');
    }
};
window.OnlineSystem = OnlineSystem;
