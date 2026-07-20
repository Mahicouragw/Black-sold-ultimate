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
    suggestionResults: {},
    selectedHeroTarget: null,
    searchTimer: null,
    googleMergeRequested: false,
    googleButtonInitialized: false,
    nameCheckTimer: null,
    heroNameAvailable: null,
    systemVoices: [],
    voiceProfiles: Array.from({ length: 20 }, (_, i) => ({
        id: `${i < 10 ? 'boy' : 'girl'}-${(i % 10) + 1}`,
        label: `${i < 10 ? 'Boy' : 'Girl'} Voice ${(i % 10) + 1}`,
        pitch: i < 10 ? 0.78 + (i % 10) * 0.045 : 1.08 + (i % 10) * 0.045,
        rate: 0.82 + (i % 5) * 0.07,
        voiceIndex: i % 10
    })),
    selectedVoice: (() => { try { return localStorage.getItem('black_sword_chat_voice') || 'system:default'; } catch (error) { return 'system:default'; } })(),

    async init() {
        if (this.ready) return;
        this.populateVoiceSelectors();
        if('speechSynthesis'in window&&!this._voicesListener){speechSynthesis.addEventListener?.('voiceschanged',()=>this.populateVoiceSelectors());this._voicesListener=true;}
        this.setupHeroAutocomplete();
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
                try {
                    if (!newSession) return;
                    this.user = newSession.user;
                    await this.loadProfile().catch(() => {});
                    await this.refreshIdentityStatus();
                    this.status = this.linked ? 'Online — Google linked' : 'Online guest — link Google for social actions';
                    await this.cacheCloudSave().catch(() => {});
                    this.updateIndicators();
                    if (window.Game?.state?.player) this.saveGame(window.Game.getCloudData());
                } catch (authListenerError) { console.warn('Auth listener issue:', authListenerError?.message); }
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
        this.systemVoices=('speechSynthesis'in window?speechSynthesis.getVoices():[]).filter((v,i,a)=>a.findIndex(x=>x.name===v.name&&x.lang===v.lang)===i);
        ['chat-voice','settings-chat-voice'].forEach(id=>{const select=document.getElementById(id);if(!select)return;select.innerHTML='';const base=document.createElement('option');base.value='system:default';base.textContent='Default device voice';select.appendChild(base);this.systemVoices.forEach(v=>{const option=document.createElement('option');option.value=`system:${v.name}`;option.textContent=`${v.name} — ${v.lang}${v.localService?' • installed':''}`;select.appendChild(option);});if([...select.options].some(o=>o.value===this.selectedVoice))select.value=this.selectedVoice;else{this.selectedVoice='system:default';select.value=this.selectedVoice;}});
        const auto=document.getElementById('chat-auto-speak');if(auto)auto.checked=localStorage.getItem('black_sword_auto_speak')!=='false';
    },

    setVoiceProfile(id) {
        if (!id.startsWith('system:') && !this.voiceProfiles.some(v => v.id === id)) return;
        this.selectedVoice = id;
        localStorage.setItem('black_sword_chat_voice', id);
        ['chat-voice','settings-chat-voice'].forEach(selectId => { const el=document.getElementById(selectId); if(el) el.value=id; });
    },

    speakText(text, voiceId = this.selectedVoice, language = 'en-US') {
        if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
            window.Game?.addNarrative?.('Spoken chat is not supported by this browser.', 'system'); return;
        }
        const legacyProfile=this.voiceProfiles.find(v=>v.id===voiceId),systemName=voiceId.startsWith('system:')?voiceId.slice(7):null;
        const utterance=new SpeechSynthesisUtterance(String(text).slice(0,300));utterance.pitch=legacyProfile?.pitch||1;utterance.rate=legacyProfile?.rate||1;utterance.volume=.9;utterance.lang=language;
        const voices=speechSynthesis.getVoices(),languageVoices=voices.filter(v=>v.lang?.toLowerCase().startsWith(language.slice(0,2).toLowerCase()));
        if(systemName&&systemName!=='default')utterance.voice=voices.find(v=>v.name===systemName)||languageVoices[0]||voices[0];
        else if(legacyProfile){const hints=legacyProfile.id.startsWith('girl')?['female','zira','samantha','victoria','karen','veena']:['male','david','daniel','george','james','ravi'];const pool=languageVoices.length?languageVoices:voices,preferred=pool.filter(v=>hints.some(h=>v.name.toLowerCase().includes(h)));if((preferred.length?preferred:pool).length)utterance.voice=(preferred.length?preferred:pool)[legacyProfile.voiceIndex%(preferred.length?preferred:pool).length];}
        else utterance.voice=languageVoices[0]||voices[0];
        speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    },

    testSelectedVoice() { const name=this.selectedVoice.startsWith('system:')?this.selectedVoice.slice(7):this.voiceProfiles.find(v=>v.id===this.selectedVoice)?.label;this.speakText(`This is ${name&&name!=='default'?name:'the default device voice'} in Black Sword chat.`); },
    async speakMessageById(id) { const m=this.messageCache.find(x=>String(x.id)===String(id)); if(m){const text=await (window.TranslationService?.translate?.(m.body,m.source_language||'en')||Promise.resolve(m.body));this.speakText(`${m.sender?.display_name||'Hero'} says: ${text}`,m.voice_id||'system:default',window.TranslationService?.target||'en');} },

    setupHeroAutocomplete() {
        ['social-name','room-player-name'].forEach(inputId=>{
            const input=document.getElementById(inputId);if(!input||input.dataset.autocompleteReady)return;
            input.dataset.autocompleteReady='true';input.setAttribute('autocomplete','off');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
            const box=document.createElement('div');box.id=`${inputId}-suggestions`;box.className='hero-suggestions hidden';box.setAttribute('role','listbox');input.insertAdjacentElement('afterend',box);
            input.addEventListener('input',()=>{this.selectedHeroTarget=null;clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.searchHeroNames(inputId,input.value),250);});
            input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();box.querySelector('button')?.focus();}if(e.key==='Escape')box.classList.add('hidden');});
        });
    },

    async searchHeroNames(inputId, query) {
        const box=document.getElementById(`${inputId}-suggestions`),clean=query.trim().replace(/[%_]/g,'');if(!box)return;
        if(clean.length<2||!this.ready){box.classList.add('hidden');box.innerHTML='';return;}
        const {data,error}=await this.client.from('profiles').select('id,display_name,level,current_location,last_seen').ilike('display_name',`%${clean}%`).neq('id',this.user.id).order('last_seen',{ascending:false}).limit(8);
        if(error){box.innerHTML='<p>Name suggestions are temporarily unavailable.</p>';box.classList.remove('hidden');return;}
        this.suggestionResults[inputId]=data||[];
        if(!data?.length){box.innerHTML=`<p>No hero name matches “${window.Game?.escapeHTML(clean)||clean}”.</p>`;box.classList.remove('hidden');return;}
        box.innerHTML=data.map((hero,index)=>{const online=Date.now()-new Date(hero.last_seen).getTime()<10*60*1000;return `<div class="hero-suggestion" role="option"><button onclick="OnlineSystem.chooseHeroSuggestion('${inputId}',${index})"><strong>${Game.escapeHTML(hero.display_name)}</strong><small>Level ${hero.level} • ${Game.escapeHTML(hero.current_location||'Unknown')} • ${online?'Online':'Offline'}</small></button>${inputId==='social-name'?`<button class="suggestion-friend" onclick="OnlineSystem.sendFriendFromSuggestion('${inputId}',${index})">Add Friend</button>`:''}</div>`;}).join('');box.classList.remove('hidden');
    },

    chooseHeroSuggestion(inputId,index) {
        const hero=this.suggestionResults[inputId]?.[index],input=document.getElementById(inputId),box=document.getElementById(`${inputId}-suggestions`);if(!hero||!input)return;
        input.value=hero.display_name;this.selectedHeroTarget=hero;if(box)box.classList.add('hidden');input.focus();
    },

    async sendFriendFromSuggestion(inputId,index) { this.chooseHeroSuggestion(inputId,index);const hero=this.suggestionResults[inputId]?.[index];if(hero)await this.sendFriendRequest(hero.display_name); },

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

    async syncActiveHero(retry = 0) {
        // Continuing or switching an existing hero must never run create-name validation.
        // Atomic reservation is performed only by Create Hero and Rename Hero.
        if (this.ready && this.user) return this.updatePresence();
        if (retry < 10) setTimeout(() => this.syncActiveHero(retry + 1), 500);
    },

    async checkHeroNameAvailability(name,slot=null) {
        const status=document.getElementById('hero-name-status'),clean=name.trim();
        if(clean.length<2){this.heroNameAvailable=null;if(status){status.textContent='Enter at least two characters.';status.className='name-status';}return false;}
        if(!this.ready){this.heroNameAvailable=false;if(status){status.textContent='Connect online to reserve a multiplayer hero name.';status.className='name-status unavailable';}return false;}
        const {data,error}=await this.client.rpc('hero_name_available',{desired_name:clean,current_slot:slot});
        if(error){this.heroNameAvailable=false;if(status){status.textContent='Name check unavailable. Run the latest database migration.';status.className='name-status unavailable';}return false;}
        this.heroNameAvailable=Boolean(data);if(status){status.textContent=data?'Name is available.':'The name already exists. Please choose another name.';status.className=`name-status ${data?'available':'unavailable'}`;}window.Game?.updateCharButton?.();return Boolean(data);
    },
    scheduleHeroNameCheck(name,slot=null){clearTimeout(this.nameCheckTimer);this.heroNameAvailable=null;this.nameCheckTimer=setTimeout(()=>this.checkHeroNameAvailability(name,slot),300);},
    async reserveHeroName(name,slot){if(!this.ready)return{ok:false,error:'Online connection is required to reserve a multiplayer name.'};const {error}=await this.client.rpc('reserve_hero_name',{desired_name:name.trim(),target_slot:slot});return error?{ok:false,error:error.message,migration:/reserve_hero_name|schema cache|function/i.test(error.message||'')}:{ok:true};},
    async releaseHeroName(slot){if(this.ready&&slot)await this.client.rpc('release_hero_name',{target_slot:slot});},

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
        if(this.linked){localStorage.setItem('black_sword_google_login_requested','true');this.status=`Restoring ${this.profile?.display_name||'your Google account'} heroes…`;this.updateIndicators();await this.cacheCloudSave(true);return;}
        this.openGoogleDialog(false);
    },

    // Detect in-app WebViews — Google blocks OAuth inside embedded WebViews.
    isEmbeddedWebView() {
        const ua = navigator.userAgent || '';
        return /; wv\)|\bwv\)|webView|(iPhone|iPod|iPad).*AppleWebKit(?!.*(Safari|CriOS))/i.test(ua);
    },

    // Robustly load (or force-reload) the Google Identity Services script.
    loadGisScript(force=false) {
        if (window.google?.accounts?.id && !force) return true;
        if (force) {
            document.querySelector('script[data-gis="1"],script[src*="accounts.google.com/gsi/client"]')?.remove();
            try { delete window.google; } catch { window.google = undefined; }
            this._gisScriptRequested = false;
        }
        if (this._gisScriptRequested && !force) return false;
        this._gisScriptRequested = true;
        const s = document.createElement('script');
        s.src = `https://accounts.google.com/gsi/client?ts=${Date.now()}`;
        s.async = true; s.defer = true; s.dataset.gis = '1';
        s.onerror = () => { this._gisLoadFailed = true; this._gisScriptRequested = false; };
        document.head.appendChild(s);
        return false;
    },

    openGoogleDialog(merge=false,retry=0) {
        this.googleMergeRequested=merge;const panel=document.getElementById('google-login-panel'),status=document.getElementById('google-login-status');panel?.classList.remove('hidden');
        // Google refuses OAuth inside in-app WebViews (our APK): guide the player
        // instead of looping on a script Google will never finish serving.
        if(this.isEmbeddedWebView()){
            if(status)status.textContent='Google sign-in is blocked inside app WebViews by Google. Open https://black-sold-ultimate.vercel.app in Chrome, sign in once with the same Google account — your heroes then sync to the app automatically. Guest mode keeps working meanwhile.';
            this.status='To link Google: open the game in Chrome once';this.updateIndicators();return;
        }
        if(!window.google?.accounts?.id){
            if(this._gisLoadFailed||retry===10)this.loadGisScript(true);else this.loadGisScript();
            if(status)status.textContent='Loading Google sign-in…';
            if(retry<40)setTimeout(()=>this.openGoogleDialog(merge,retry+1),300);
            else if(status)status.textContent='Google sign-in could not load on this network/device. Guest mode still works — try again on Wi-Fi or in Chrome.';
            return;
        }
        this._gisLoadFailed=false;
        const config=window.SUPABASE_CONFIG;
        try{
            if(!this.googleButtonInitialized){google.accounts.id.initialize({client_id:config.googleClientId,callback:response=>this.handleGoogleCredential(response),auto_select:false,cancel_on_tap_outside:false,use_fedcm_for_prompt:false});this.googleButtonInitialized=true;}
            const target=document.getElementById('google-signin-render');if(target){target.innerHTML='';google.accounts.id.renderButton(target,{theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:300});}
            if(status)status.textContent=merge?'Sign in to the existing Google account; guest heroes will be merged.':'Sign in to restore the heroes linked to this Google account.';
        }catch(err){
            if(status)status.textContent=`Google sign-in could not start in this browser (${err.message}). Open https://black-sold-ultimate.vercel.app in Chrome and try there — guest heroes are kept.`;
        }
    },

    async handleGoogleCredential(response) {
        // Fully guarded sign-in: after the player taps "Continue with Google" the
        // game must ALWAYS reach a clear next step — never a stuck spinner or a
        // silent error. Google already verifies the player, so there is NO
        // verification code / email step anywhere in this flow.
        const status=document.getElementById('google-login-status');
        const say=(msg)=>{ if(status)status.textContent=msg; };
        if(!response?.credential){say('Google did not return an identity token. Please tap the Google button again — your guest progress is safe.');return;}
        say('Google verified. Preparing your adventure…');
        if(this.googleMergeRequested&&window.Game?.state?.player){localStorage.setItem('black_sword_pending_google_merge',JSON.stringify(window.Game.getCloudData()));localStorage.setItem('black_sword_merge_requested','true');}
        localStorage.setItem('black_sword_google_login_requested','true');
        let data,error;
        try{({data,error}=await this.client.auth.signInWithIdToken({provider:'google',token:response.credential}));}
        catch(e){data=null;error=e;}
        if(error||!data?.user){
            localStorage.removeItem('black_sword_google_login_requested');
            localStorage.removeItem('black_sword_merge_requested');
            say(`Google sign-in could not finish: ${error?.message||'network error — check your connection'} . Tap the Google button to try again; your guest progress is safe.`);
            return;
        }
        this.user=data.user;this.linked=true;this.ready=true;
        document.getElementById('google-login-panel')?.classList.add('hidden');
        // 20-second watchdog: cloud hiccups can never strand a blind player.
        const finish=this.welcomeSignedInPlayer().catch(e=>{console.warn('Welcome flow issue:',e);this.onboardingFallback(e);});
        await Promise.race([finish,new Promise(resolve=>setTimeout(resolve,20000))]);
    },

    // Greet the player the moment Google sign-in succeeds.
    // New Google account → straight to hero creation (name → race → class).
    // Returning Google account → "You signed in again. Thank you." + auto-continue.
    async welcomeSignedInPlayer() {
        try{await this.loadProfile();}
        catch(profileError){console.warn('Profile read failed, creating one:',profileError?.message);await this.ensureProfileRow().catch(()=>{});}
        let rosterInfo={heroes:{},activeHeroId:null,restoredCount:0};
        try{
            rosterInfo=await this.restoreRosterFromCloud();
        }catch(cloudError){
            console.warn('Cloud restore failed:',cloudError?.message);
            return this.onboardingFallback(cloudError);
        }
        localStorage.removeItem('black_sword_google_login_requested'); // restored inline; no reload-restore needed
        const wasMerging=this.googleMergeRequested||localStorage.getItem('black_sword_merged_this_login')==='true';
        this.googleMergeRequested=false;localStorage.removeItem('black_sword_merged_this_login');
        this.updateHeroEntryPoints(rosterInfo.restoredCount>0);
        this.updateIndicators();
        if(rosterInfo.restoredCount>0){
            // ---- Returning player ----
            const active=rosterInfo.heroes[rosterInfo.activeHeroId]||Object.values(rosterInfo.heroes)[0];
            const heroName=active?.player?.name||this.profile?.display_name||'hero';
            this.status=`Online — Google linked; welcome back, ${heroName}`;
            this.announceToPlayer(wasMerging
                ?`Your guest heroes were merged into your Google account. Welcome back, ${heroName}. Taking you into the adventure…`
                :`You signed in again. Thank you! Welcome back, ${heroName}. Taking you into the adventure…`);
            const heroId=rosterInfo.activeHeroId&&rosterInfo.heroes[rosterInfo.activeHeroId]?rosterInfo.activeHeroId:Object.keys(rosterInfo.heroes)[0];
            this.updateIndicators();
            if(heroId&&window.Game){window.Game.playHero(heroId);return;}
            window.Game?.showHeroRoster?.();
            return;
        }
        // ---- Brand-new Google account ----
        this.status='Online — Google linked; create your first hero';
        this.updateIndicators();
        this.announceToPlayer('Welcome to Black Sword! Your Google account is connected — no codes or emails needed. Now choose your hero name, race and class to begin your adventure.');
        if(window.Game){try{window.MusicSystem?.playTrack?.('intro');}catch{}window.Game.startNewHero();}
    },

    // Last-resort path when the cloud cannot be reached after Google sign-in:
    // still take the player to a clear screen, nothing hidden, nothing stuck.
    onboardingFallback(err) {
        const reason=(err?.message||'the cloud is unreachable').toString();
        let localHeroes=0;try{localHeroes=Object.keys(window.Game?.getRoster?.().heroes||{}).length;}catch{}
        this.status='Google connected — cloud sync is slow, continuing on this device';
        this.updateIndicators();
        if(localHeroes>0){
            this.announceToPlayer(`You signed in again. Thank you! Cloud sync is slow (${reason}), so your heroes on this device will be used. They will re-sync later.`);
            try{const roster=window.Game.getRoster();const id=roster.activeHeroId&&roster.heroes[roster.activeHeroId]?roster.activeHeroId:Object.keys(roster.heroes)[0];if(id){window.Game.playHero(id);return;}}catch{}
            window.Game?.showHeroRoster?.();
            return;
        }
        this.announceToPlayer('Welcome to Black Sword! The cloud is slow right now, but you can still create your hero — it will sync automatically when the connection recovers. Choose your hero name, race and class.');
        if(window.Game){try{window.MusicSystem?.playTrack?.('intro');}catch{}window.Game.startNewHero();}
    },

    // Speak + narrate so TalkBack players hear the welcome, sighted players see it.
    announceToPlayer(text) {
        try{window.Game?.addNarrative?.(text,'npc');}catch{}
        try{if(localStorage.getItem('black_sword_auto_speak')!=='false')this.speakText(text);}catch{}
        const titleStatus=document.getElementById('title-account-status');if(titleStatus)titleStatus.textContent=text;
    },

    // Guarantee a profiles row exists even if the signup trigger is delayed.
    async ensureProfileRow() {
        if(!this.client||!this.user)return;
        let code;try{code=localStorage.getItem('black_sword_guest_code');}catch{}
        if(!code){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const part=()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');code=`KND-${part()}-${part()}`;try{localStorage.setItem('black_sword_guest_code',code);}catch{}}
        await this.client.from('profiles').upsert({id:this.user.id,player_code:code,display_name:this.defaultDisplayName(),level:1,current_location:'Kaliwasch City',last_seen:new Date().toISOString()},{onConflict:'id'});
        try{await this.loadProfile(false);}
        catch{this.profile={id:this.user.id,player_code:code,display_name:this.defaultDisplayName(),level:1,current_location:'Kaliwasch City'};}
    },

    // Fetch the cloud roster, apply a pending guest merge, persist locally.
    // Throws on real network failure so callers can pick the fallback path.
    async restoreRosterFromCloud() {
        const cloud=await this.loadCloudSave();
        const payload=cloud?.save_data;
        let roster=payload?.heroes?payload:(payload?.player?{version:2,activeHeroId:'hero_cloud_legacy',heroes:{hero_cloud_legacy:payload}}:{version:2,activeHeroId:null,heroes:{}});
        const mergeRequested=localStorage.getItem('black_sword_merge_requested')==='true';
        let pending=null;try{pending=JSON.parse(localStorage.getItem('black_sword_pending_google_merge'));}catch{}
        if(mergeRequested&&pending?.heroes){
            const merged={version:2,activeHeroId:pending.activeHeroId,heroes:{...roster.heroes}};
            Object.entries(pending.heroes).forEach(([id,hero])=>{let target=id;while(merged.heroes[target])target=`guest_${Date.now().toString(36)}_${target}`;merged.heroes[target]=hero;if(id===pending.activeHeroId)merged.activeHeroId=target;});
            roster=merged;localStorage.removeItem('black_sword_merge_requested');localStorage.removeItem('black_sword_pending_google_merge');
            localStorage.setItem('black_sword_merged_this_login','true');
        }
        localStorage.removeItem('black_sword_google_login_requested');
        const restoredCount=Object.keys(roster.heroes||{}).length;
        if(restoredCount>0){
            if(!roster.activeHeroId||!roster.heroes[roster.activeHeroId])roster.activeHeroId=Object.keys(roster.heroes)[0];
            localStorage.setItem(window.Game.state.rosterKey,JSON.stringify(roster));
            localStorage.setItem(window.Game.state.saveKey,JSON.stringify(roster.heroes[roster.activeHeroId]));
            window.Game.state.activeHeroId=roster.activeHeroId;
            const active=roster.heroes[roster.activeHeroId];
            if(active?.player?.name){this.profile=this.profile||{};this.profile.display_name=active.player.name;this.client.from('profiles').update({display_name:active.player.name,level:active.player.level||1,last_seen:new Date().toISOString()}).eq('id',this.user.id).then(()=>{});}
            if(mergeRequested)await this.saveGame(roster);
        }
        return {heroes:roster.heroes||{},activeHeroId:roster.activeHeroId||null,restoredCount};
    },

    async mergeWithGoogle() {
        if (!this.client) await this.init();if(!this.client)return;this.openGoogleDialog(true);
    },

    async linkGoogle() {
        if (!this.client) await this.init();
        if (!this.client) { this.status='Online service is not connected.';this.updateIndicators();return; }
        if(this.linked){this.status='Google is already connected. Restoring cloud heroes…';this.updateIndicators();await this.cacheCloudSave(true);return;}
        // Direct Google token sign-in avoids exposing a Supabase redirect page.
        // The current guest roster is merged into the selected Google account.
        this.openGoogleDialog(true);
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
        if(this.selectedHeroTarget&&this.selectedHeroTarget.display_name.toLowerCase()===clean.toLowerCase())return this.selectedHeroTarget;
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
            let { error } = await this.client.from('messages').insert({ sender_id:this.user.id, receiver_id:receiverId, body:text, voice_id:this.selectedVoice, source_language:window.TranslationService?.sourceLanguage?.()||'en' });
            // Backward-compatible until features_v5_voice_chat.sql is installed.
            if (error && /voice_id|source_language|schema cache/i.test(error.message || '')) ({ error } = await this.client.from('messages').insert({ sender_id:this.user.id, receiver_id:receiverId, body:`[[lang:${window.TranslationService?.sourceLanguage?.()||'en'}]]${text}` }));
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

    async dropWorldItem(locationId,item) {
        if(!this.ready)return false;const snapshot={...item};delete snapshot.quantity;
        const {error}=await this.client.from('world_drops').insert({location_id:locationId,dropped_by:this.user.id,item_id:item.id,item_snapshot:snapshot,quantity:1});
        if(error){window.Game?.addNarrative?.(`Public drop unavailable: ${error.message}`,'system');return false;}return true;
    },
    async listWorldDrops(locationId) {
        if(!this.ready)return[];const {data,error}=await this.client.from('world_drops').select('id,item_id,item_snapshot,quantity,created_at').eq('location_id',locationId).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100);return error?[]:(data||[]);
    },
    async takeWorldDrop(id) {
        if(!this.ready)return null;const {data,error}=await this.client.rpc('take_world_drop',{drop_uuid:id});if(error){window.Game?.addNarrative?.(error.message,'system');return null;}return data;
    },

    normalizeLanguageMessage(message) { const match=String(message.body||'').match(/^\[\[lang:([a-z-]{2,12})\]\](.*)$/s);if(match){message.source_language=match[1];message.body=match[2];}message.source_language||='en';return message; },

    async listMessages() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('messages')
            .select('*,sender:profiles!messages_sender_id_fkey(display_name)')
            .order('created_at', { ascending: false }).limit(30);
        if (error) { console.warn(error.message); return []; }
        this.messageCache=(data || []).reverse().map(m=>this.normalizeLanguageMessage(m)); return this.messageCache;
    },

    async subscribe() {
        if (!this.client || this.subscription) return;
        const membershipResult=await this.client.from('combat_group_members').select('group_id').eq('user_id',this.user.id).limit(1).maybeSingle();
        const hasV6=!membershipResult.error;this.activeCombatGroup=membershipResult.data?.group_id||null;
        let channel=this.client.channel('black-sword-social')
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{this.refreshOpenSocial();const m=this.normalizeLanguageMessage(payload.new);if(m.sender_id!==this.user?.id&&localStorage.getItem('black_sword_auto_speak')!=='false'){const task=window.TranslationService?.translate?.(m.body,m.source_language||'en')||Promise.resolve(m.body);task.then(text=>this.speakText(text,m.voice_id||'system:default',window.TranslationService?.target||'en'));}})
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
