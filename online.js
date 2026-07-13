/** Supabase-backed guest identity, cloud saves, friends and chat. */
const OnlineSystem = {
    client: null,
    user: null,
    profile: null,
    linked: false,
    ready: false,
    status: 'Connecting…',
    subscription: null,

    async init() {
        if (this.ready) return;
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
                if (window.Game?.state?.player) this.saveGame(window.Game.getSaveData());
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

    async loadProfile(retry = true) {
        const { data, error } = await this.client.from('profiles').select('id,player_code,display_name,level,current_location,last_seen').eq('id', this.user.id).maybeSingle();
        if (error) throw error;
        if (!data && retry) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return this.loadProfile(false);
        }
        if (!data) throw new Error('Database schema is not installed yet');
        this.profile = data;
    },

    async refreshIdentityStatus() {
        const identities = this.user?.identities || [];
        this.linked = identities.some(identity => identity.provider && identity.provider !== 'anonymous') || this.user?.is_anonymous === false;
    },

    async updatePresence() {
        if (!this.ready || !this.user) return;
        const player = window.Game?.state?.player;
        await this.client.from('profiles').update({
            display_name: player?.name || this.profile.display_name,
            level: player?.level || 1,
            current_location: window.WorldData?.locations?.[window.Game?.state?.location]?.name || 'Kaliwasch City',
            last_seen: new Date().toISOString()
        }).eq('id', this.user.id);
        await this.loadProfile(false).catch(() => {});
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
        if (!this.client) { this.status = 'Online service is not connected.'; this.updateIndicators(); return; }
        if (this.linked) {
            this.status = `Already signed in as ${this.profile?.display_name || 'a Google player'}.`;
            this.updateIndicators();
            return;
        }
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${location.origin}${location.pathname}` }
        });
        if (error) {
            this.status = `Google sign-in failed: ${error.message}`;
            this.updateIndicators();
        }
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

    async cacheCloudSave() {
        if (!this.ready || !window.Game) return;
        try {
            const cloud = await this.loadCloudSave();
            if (!cloud?.save_data?.player) return;
            const key = window.Game.state.saveKey;
            const localRaw = localStorage.getItem(key);
            const local = localRaw ? JSON.parse(localRaw) : null;
            // A signed-in account's cloud save is restored on a new device. During
            // active local play, do not replace newer in-memory progress abruptly.
            if (!local?.player || !window.Game.state.player) {
                localStorage.setItem(key, JSON.stringify(cloud.save_data));
                const button = document.getElementById('btn-continue');
                if (button) button.disabled = false;
                this.status = 'Online — Google linked; cloud adventure found';
            }
        } catch (error) {
            console.warn('Cloud restore check failed:', error.message);
        }
    },

    async findProfile(query) {
        if (!this.ready) return null;
        const clean = query.trim();
        let request = this.client.from('profiles').select('id,player_code,display_name,level,current_location').limit(1);
        request = clean.toUpperCase().startsWith('KND-') ? request.eq('player_code', clean.toUpperCase()) : request.ilike('display_name', clean);
        const { data, error } = await request.maybeSingle();
        if (error) throw error;
        return data;
    },

    async sendFriendRequest(query) {
        if (!this.requireLinked('send friend requests')) return false;
        try {
            const target = await this.findProfile(query);
            if (!target) throw new Error('Player not found. Use their exact Player ID or hero name.');
            if (target.id === this.user.id) throw new Error('You cannot send a request to yourself.');
            const { error } = await this.client.from('friend_requests').insert({ sender_id: this.user.id, receiver_id: target.id });
            if (error) throw error;
            window.Game.addNarrative(`Friend request sent to ${target.display_name} (${target.player_code}).`, 'npc');
            return true;
        } catch (error) { window.Game.addNarrative(error.message, 'system'); return false; }
    },

    async listFriendRequests() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('friend_requests')
            .select('id,status,sender_id,receiver_id,created_at,sender:profiles!friend_requests_sender_id_fkey(display_name,player_code),receiver:profiles!friend_requests_receiver_id_fkey(display_name,player_code)')
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
        if (!this.requireLinked('send messages')) return false;
        const text = body.trim().slice(0, 300);
        if (!text) return false;
        try {
            let receiverId = null;
            if (targetQuery && !['public','all','world'].includes(targetQuery.toLowerCase())) {
                const target = await this.findProfile(targetQuery);
                if (!target) throw new Error('Message recipient not found.');
                receiverId = target.id;
            }
            const { error } = await this.client.from('messages').insert({ sender_id: this.user.id, receiver_id: receiverId, body: text });
            if (error) throw error;
            return true;
        } catch (error) { window.Game.addNarrative(error.message, 'system'); return false; }
    },

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
            .select('id,body,created_at,sender_id,receiver_id,sender:profiles!messages_sender_id_fkey(display_name,player_code)')
            .order('created_at', { ascending: false }).limit(30);
        if (error) { console.warn(error.message); return []; }
        return (data || []).reverse();
    },

    subscribe() {
        if (!this.client || this.subscription) return;
        this.subscription = this.client.channel('black-sword-social')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => this.refreshOpenSocial())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => this.refreshOpenSocial())
            .subscribe();
    },

    refreshOpenSocial() {
        if (!document.getElementById('social-panel')?.classList.contains('hidden')) window.Game?.showSocial?.();
    },

    updateIndicators() {
        const el = document.getElementById('online-status');
        if (el) el.textContent = this.status;
        const titleStatus = document.getElementById('title-account-status');
        if (titleStatus) titleStatus.textContent = `${this.status}${this.profile?.player_code ? ` • ${this.profile.player_code}` : ''}`;
        const signIn = document.getElementById('btn-google-signin');
        if (signIn) {
            signIn.disabled = this.linked;
            signIn.innerHTML = this.linked
                ? '<span class="google-mark" aria-hidden="true">G</span> Google account connected'
                : '<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
        }
        const code = document.getElementById('settings-player-code');
        if (code) code.textContent = this.getPlayerCode();
        const account = document.getElementById('settings-account-status');
        if (account) account.textContent = this.linked ? 'Google linked' : (this.ready ? 'Guest account' : 'Local/offline guest');
        const google = document.getElementById('btn-link-google');
        if (google) google.disabled = this.linked;
    },

    showSettings() {
        this.updateIndicators();
        document.getElementById('settings-panel')?.classList.remove('hidden');
    }
};
window.OnlineSystem = OnlineSystem;
