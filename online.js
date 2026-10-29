/** Neon-backed guest identity, cloud saves, friends and chat. */
const OnlineSystem = {
    client: null,
    user: null,
    profile: null,
    linked: false,
    ready: false,
    status: 'Connecting…',
    subscription: null,
    messageCache: [],
    messageExpiryTimer: null,
    socialRefreshTimer: null,
    socialRefreshInFlight: false,
    socialRefreshQueued: false,
    lastMessageAt: 0,
    activeCombatGroup: null,
    suggestionResults: {},
    selectedHeroTarget: null,
    searchTimer: null,
    googleMergeRequested: false,
    googleButtonInitialized: false,
    nameCheckTimer: null,
    nameCheckRequest: 0,
    heroNameAvailable: null,
    cloudSaveChains: new Map(),
    authRevision: 0,
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
        const config = window.BLACK_SWORD_BACKEND_CONFIG;
        const hasFirebase = config?.provider === 'firebase' && config?.firebase;
        const hasNeonAuth = config?.authUrl && config?.dataApiUrl;
        if (!config || !window.BlackSwordBackend?.createClient || (!hasFirebase && !hasNeonAuth)) {
            this.status = 'Guest mode';
            this.ensureLocalCode();
            this.updateIndicators();
            return;
        }
        try {
            // createClient may return a Promise (Firebase) or sync object (Neon).
            const maybePromise = window.BlackSwordBackend.createClient(config);
            this.client = maybePromise && typeof maybePromise.then === 'function'
                ? await maybePromise : maybePromise;
            if (!this.client) throw new Error('No auth provider configured');
            console.log('Auth: client created, attempting session...');
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
            if (oauthError) this.clearGoogleFlow();
            if (oauthError) this.status = `Google linking needs attention: ${decodeURIComponent(oauthError.replace(/\+/g, ' '))}. Your local heroes are safe; please try Google sign-in again.`;
            await this.updatePresence();
            // Returning from the in-app Google page? Run the full welcome flow.
            if (this.linked && localStorage.getItem('black_sword_google_login_requested') === 'true') {
                this.subscribe();
                this.updateIndicators();
                this.registerAuthListener();
                await this.welcomeSignedInPlayer().catch(e => this.onboardingFallback(e));
                return;
            }
            await this.cacheCloudSave();
            this.subscribe();
            this.updateIndicators();
            this.registerAuthListener();
            console.log('Neon: fully connected as', this.user?.id);
        } catch (error) {
            // All technical details go to console only — never to the game UI.
            console.error('Online initialization failed:', error);
            const msg = String(error?.message || '');
            if (/Neon SDK|NeonBackend|createClient|SupabaseAuthAdapter/i.test(msg)) {
                console.warn('Neon SDK failed to load. The game will run in local/offline mode.');
            }
            this.status = 'Guest mode';
            this.ensureLocalCode();
            this.updateIndicators();
        }
    },

    registerAuthListener() {
        if(!this.client||this._authListenerClient===this.client)return;
        this._authListenerClient=this.client;
        this.client.auth.onAuthStateChange(async(event,newSession)=>{
            try{
                if(!newSession?.user)return;
                const previousUserId=this.user?.id;
                const accountChanged=Boolean(previousUserId&&previousUserId!==newSession.user.id);
                if(accountChanged)this.authRevision++;
                this.user=newSession.user;
                await this.loadProfile().catch(()=>{});
                await this.refreshIdentityStatus();
                this.status=this.linked?'Online — Google linked':'Online guest — link Google for social actions';
                // The explicit Google credential/welcome flow owns restore and
                // navigation. A second auth-listener restore must not pull the
                // player back to the roster after auto-continue.
                if(this._googleAuthCallback||this._googleWelcomeInFlight||localStorage.getItem('black_sword_google_login_requested')==='true'){
                    this.updateIndicators();
                    return;
                }
                await this.cacheCloudSave(accountChanged&&event==='SIGNED_IN').catch(()=>{});
                this.updateIndicators();
                if(window.Game?.state?.player)this.saveGame(window.Game.getCloudData());
            }catch(authListenerError){console.warn('Auth listener issue:',authListenerError?.message||authListenerError);}
        });
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
        const auto=document.getElementById('chat-auto-speak');if(auto)auto.checked=localStorage.getItem('black_sword_auto_speak')==='true';
    },

    setVoiceProfile(id) {
        if (!id.startsWith('system:') && !this.voiceProfiles.some(v => v.id === id)) return;
        this.selectedVoice = id;
        localStorage.setItem('black_sword_chat_voice', id);
        ['chat-voice','settings-chat-voice'].forEach(selectId => { const el=document.getElementById(selectId); if(el) el.value=id; });
    },

    speakText(text, voiceId = this.selectedVoice, language = 'en-US', options = {}) {
        if (!window.AudioManager || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
            window.Game?.addNarrative?.('Spoken chat is not supported by this browser.', 'system');
            return Promise.resolve(false);
        }
        // AudioManager owns one serialized device-TTS queue and ducks music for
        // the utterance lifetime. It chooses an exact-language, base-language,
        // then default installed voice fallback without cancelling other speech.
        return window.AudioManager.playVoice(String(text).slice(0, 600), {
            voiceId,
            language,
            priority: Boolean(options.priority)
        });
    },

    testSelectedVoice() { if(!window.AudioManager?.voiceEnabled){window.Game?.addNarrative?.('Application text to speech is off. Turn on "Device voice and TTS" in Settings to hear the voice test.','system');return;} const name=this.selectedVoice.startsWith('system:')?this.selectedVoice.slice(7):this.voiceProfiles.find(v=>v.id===this.selectedVoice)?.label;this.speakText(`This is ${name&&name!=='default'?name:'the default device voice'} in Black Sword chat.`,this.selectedVoice,'en-US'); },
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
        const providers = identities.map(identity => String(identity.provider || '').toLowerCase());
        this.linked = providers.includes('google')
            || providers.some(p => p && p !== 'anonymous' && p !== 'credential')
            || this.user?.app_metadata?.provider === 'google'
            || this.user?.is_anonymous === false;
        // Neon session responses do not embed provider identities. The
        // owner-only RPC reads neon_auth.account without exposing credentials.
        if(!this.linked&&this.client&&this.user){
            const {data,error}=await this.client.rpc('has_linked_identity');
            if(!error&&typeof data==='boolean')this.linked=data;
        }
    },

    async updatePresence() {
        if (!this.ready || !this.user) return;
        const player = window.Game?.state?.player;
        const heroName = player?.name?.trim() || this.profile?.display_name || 'Wandering Hero';
        const updateData = {
            display_name: heroName,
            level: player?.level || this.profile?.level || 1,
            current_location: window.WorldData?.locations?.[window.Game?.state?.location]?.name || this.profile?.current_location || 'Kaliwasch City',
            last_seen: new Date().toISOString()
        };
        // Sync stats if available (columns may not exist in older schemas)
        if (player) {
            if (player.str !== undefined) updateData.str = player.str;
            if (player.dex !== undefined) updateData.dex = player.dex;
            if (player.int !== undefined) updateData.int = player.int;
            if (player.wis !== undefined) updateData.wis = player.wis;
            if (player.hp !== undefined) updateData.hp = player.hp;
            if (player.maxHp !== undefined) updateData.max_hp = player.maxHp;
            if (player.weapon) updateData.weapon = player.weapon;
            if (player.armor) updateData.armor = player.armor;
            if (player.class) updateData.hero_class = player.class;
            if (player.race) updateData.hero_race = player.race;
        }
        const { error } = await this.client.from('profiles').update(updateData).eq('id', this.user.id);
        if (error) { console.warn('Hero sync failed:', error.message); return; }
        await this.loadProfile(false).catch(() => {});
        this.updateIndicators();
    },

    async syncActiveHero(retry = 0) {
        // Continuing or switching an existing hero must never run create-name validation.
        // Atomic reservation is performed only by Create Hero and Rename Hero.
        if (this.ready && this.user) return this.updatePresence();
        if (retry < 10) setTimeout(() => this.syncActiveHero(retry + 1), 500);
    },

    cancelHeroNameChecks() {
        clearTimeout(this.nameCheckTimer);
        this.nameCheckTimer=null;
        this.nameCheckRequest++;
        this.heroNameAvailable=null;
    },
    async checkHeroNameAvailability(name,slot=null,request=null) {
        const status=document.getElementById('hero-name-status'),clean=name.trim();
        const currentRequest=request??++this.nameCheckRequest;
        const isCurrent=()=>currentRequest===this.nameCheckRequest;
        if(clean.length<2){if(isCurrent()){this.heroNameAvailable=null;if(status){status.textContent='Enter at least two characters.';status.className='name-status';}}return false;}
        if(!this.ready){if(isCurrent()){this.heroNameAvailable=true;if(status){status.textContent='Guest mode — name saved locally.';status.className='name-status available';}}return true;}
        let result;
        try{result=await this.client.rpc('hero_name_available',{desired_name:clean,current_slot:slot});}
        catch(error){result={data:null,error};}
        // Network responses can arrive in any order. Only the newest typed name
        // and newest creation form may enable Begin Adventure.
        if(!isCurrent())return false;
        const {data,error}=result;
        if(error){this.heroNameAvailable=false;if(status){status.textContent='Name check unavailable. Check your connection and try again.';status.className='name-status unavailable';}window.Game?.updateCharButton?.();return false;}
        this.heroNameAvailable=Boolean(data);if(status){status.textContent=data?'Name is available.':'The name already exists. Please choose another name.';status.className=`name-status ${data?'available':'unavailable'}`;}window.Game?.updateCharButton?.();return Boolean(data);
    },
    scheduleHeroNameCheck(name,slot=null){
        clearTimeout(this.nameCheckTimer);
        const request=++this.nameCheckRequest;
        this.heroNameAvailable=null;
        window.Game?.updateCharButton?.();
        this.nameCheckTimer=setTimeout(()=>this.checkHeroNameAvailability(name,slot,request),300);
    },
    async reserveHeroName(name,slot){if(!this.ready)return{ok:true,local:true};const {error}=await this.client.rpc('reserve_hero_name',{desired_name:name.trim(),target_slot:slot});return error?{ok:false,error:error.message,migration:/reserve_hero_name|schema cache|function/i.test(error.message||'')}:{ok:true};},
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

    localHeroCount() {
        try{return Object.keys(window.Game?.getRoster?.().heroes||{}).length;}catch{return 0;}
    },

    shouldMergeGuestHeroes() {
        if(this.linked||this.localHeroCount()<1)return false;
        try{
            // Heroes downloaded from another owned account must not leak into a
            // different Google account on a shared device. Ordinary guest heroes
            // are preserved automatically when their owner first signs in.
            return localStorage.getItem('black_sword_roster_was_linked')!=='true'
                &&localStorage.getItem('black_sword_recovered_by_id')!=='true';
        }catch{return true;}
    },

    prepareGoogleMerge() {
        if(!window.Game)return false;
        const snapshot=window.Game.getCloudData();
        if(!snapshot?.heroes||!Object.keys(snapshot.heroes).length)return false;
        localStorage.setItem('black_sword_pending_google_merge',JSON.stringify(snapshot));
        localStorage.setItem('black_sword_merge_requested','true');
        return true;
    },

    clearGoogleFlow({ keepPending = false } = {}) {
        localStorage.removeItem('black_sword_google_login_requested');
        localStorage.removeItem('black_sword_merge_requested');
        if(!keepPending)localStorage.removeItem('black_sword_pending_google_merge');
    },

    async signInGoogle() {
        if (!this.client) await this.init();
        if (!this.client) { this.status = 'Guest mode'; this.updateIndicators(); return; }
        if(this.linked){localStorage.setItem('black_sword_google_login_requested','true');this.status=`Restoring ${this.profile?.display_name||'your Google account'} heroes…`;this.updateIndicators();await this.cacheCloudSave(true);return;}
        this.openGoogleDialog(this.shouldMergeGuestHeroes());
    },

    // App mode: the APK wrapper loads the game with ?source=app. In app mode we
    // use a full-page secure Google redirect instead of the popup button — the
    // popup IFRAME is what used to get stuck inside WebViews after choosing an
    // account. The flag persists so the return trip keeps working.
    isAppMode() {
        try {
            const q = new URLSearchParams(location.search || '');
            if (q.get('source') === 'app') localStorage.setItem('black_sword_app_mode', 'true');
            return localStorage.getItem('black_sword_app_mode') === 'true';
        } catch { return false; }
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
        this.googleMergeRequested=merge;const panel=document.getElementById('google-login-panel'),status=document.getElementById('google-login-status'),config=window.BLACK_SWORD_BACKEND_CONFIG;panel?.classList.remove('hidden');
        const isFirebase = String(config?.provider || '') === 'firebase';
        // Google refuses OAuth inside in-app WebViews (our APK): guide the player
        // instead of looping on a script Google will never finish serving.
        if(this.isEmbeddedWebView()){
            if(status)status.textContent='Google sign-in is blocked inside app WebViews by Google. Open https://black-sold-ultimate.vercel.app in Chrome, sign in once with the same Google account — your heroes then sync to the app automatically. Guest mode keeps working meanwhile.';
            this.status='To link Google: open the game in Chrome once';this.updateIndicators();return;
        }
        if(isFirebase){
            // Firebase: always use popup — simple, stays on page, no redirect.
            const target=document.getElementById('google-signin-render');
            if(target && !target.querySelector('button')){
                target.innerHTML='';
                const btn=document.createElement('button');
                btn.className='menu-btn google-btn';
                btn.setAttribute('aria-label','Continue with Google — secure sign-in popup');
                btn.innerHTML='<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
                btn.addEventListener('click',()=>this.startGoogleRedirect(this.googleMergeRequested));
                target.appendChild(btn);
            }
            if(status)status.textContent=merge
                ?'Tap Continue with Google. A popup will ask you to pick your account, then guest heroes merge automatically.'
                :'Tap Continue with Google. A popup will ask you to pick your account.';
            return;
        }
        if(this.isAppMode()||config?.authMode==='redirect'){
            // Neon legacy: full-page redirect flow.
            const target=document.getElementById('google-signin-render');
            if(target && !target.querySelector('button')){
                target.innerHTML='';
                const btn=document.createElement('button');
                btn.className='menu-btn google-btn';
                btn.setAttribute('aria-label','Continue with Google — opens the secure sign-in page');
                btn.innerHTML='<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
                btn.addEventListener('click',()=>this.startGoogleRedirect(this.googleMergeRequested));
                target.appendChild(btn);
            }
            if(status)status.textContent=merge
                ?'Tap Continue with Google. After you choose your account you come straight back here, and guest heroes are merged.'
                :'Tap Continue with Google. Secure sign-in returns you to the game automatically.';
            return;
        }
        if(!window.google?.accounts?.id){
            if(this._gisLoadFailed||retry===10)this.loadGisScript(true);else this.loadGisScript();
            if(status)status.textContent='Loading Google sign-in…';
            if(retry<40)setTimeout(()=>this.openGoogleDialog(merge,retry+1),300);
            else if(status)status.textContent='Google sign-in could not load on this network/device. Guest mode still works — try again on Wi-Fi or in Chrome.';
            return;
        }
        this._gisLoadFailed=false;
        try{
            if(!this.googleButtonInitialized){google.accounts.id.initialize({client_id:config.googleClientId,callback:response=>this.handleGoogleCredential(response),auto_select:false,cancel_on_tap_outside:false,use_fedcm_for_prompt:false});this.googleButtonInitialized=true;}
            const target=document.getElementById('google-signin-render');if(target){target.innerHTML='';google.accounts.id.renderButton(target,{theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:300});}
            if(status)status.textContent=merge?'Sign in to the existing Google account; guest heroes will be merged.':'Sign in to restore the heroes linked to this Google account.';
        }catch(err){
            if(status)status.textContent=`Google sign-in could not start in this browser (${err.message}). Open https://black-sold-ultimate.vercel.app in Chrome and try there — guest heroes are kept.`;
        }
        // Google reports origin problems asynchronously to the console, not to
        // this catch block, so surface a readable explanation for the player.
        this.checkGoogleOriginAllowed();
    },

    async startGoogleRedirect(merge) {
        const status=document.getElementById('google-login-status');
        if(status)status.textContent='Opening secure Google sign-in…';
        try{
            if(merge)this.prepareGoogleMerge();
            localStorage.setItem('black_sword_google_login_requested','true');
            const isFirebase = String(window.BLACK_SWORD_BACKEND_CONFIG?.provider || '') === 'firebase';
            if (isFirebase) {
                // Firebase: simple popup, stays on the page.
                const { data, error } = await this.client.auth.signInWithOAuth({
                    provider: 'google',
                    options: { queryParams: { prompt: 'select_account' } }
                });
                if (error) throw error;
                if (!data?.session) return; // User cancelled popup — no action needed.
                // Popup succeeded — handle the signed-in user directly.
                this._googleAuthCallback = true;
                try {
                    this.user = data.session.user;
                    this.linked = true;
                    this.ready = true;
                    if (status) status.textContent = '✅ Successfully logged in! Preparing your adventure…';
                    document.getElementById('google-login-panel')?.classList.add('hidden');
                    // Auto-clear the success message after 4 seconds.
                    setTimeout(() => { if (status) status.textContent = ''; }, 4000);
                    await this.welcomeSignedInPlayer().catch(welcomeErr => {
                        console.warn('Welcome flow issue:', welcomeErr);
                        this.onboardingFallback(welcomeErr);
                    });
                } finally {
                    this._googleAuthCallback = false;
                }
            } else {
                // Neon legacy: full-page redirect.
                const back=new URL(location.href);
                back.hash='';
                for(const key of [...back.searchParams.keys()])back.searchParams.delete(key);
                back.searchParams.set('source','app');
                const {error}=await this.client.auth.signInWithOAuth({
                    provider:'google',
                    options:{redirectTo:back.toString(),queryParams:{prompt:'select_account'}}
                });
                if(error)throw error;
            }
        }catch(e){
            this.clearGoogleFlow();
            const code = String(e?.code || e?.status || '');
            const isBlocked = code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request';
            const isNotConfigured = /not.configured|not.enabled|403|api[_-]?key/i.test(String(e?.message || code));
            if (status) {
                status.textContent = isBlocked
                    ? 'Google sign-in was blocked by your browser. Allow pop-ups for this site and try again. Your guest heroes are safe.'
                    : isNotConfigured
                        ? 'Google sign-in isn\u2019t set up yet. Your guest heroes are safe \u2014 play as a guest, or finish Firebase setup to enable Google.'
                        : 'Google sign-in couldn\u2019t open on this device. Your guest heroes are safe \u2014 try again on Wi-Fi or in Chrome.';
            }
            console.error('Google sign-in failed:', e?.message || e?.code || e);
        }
    },

    /**
     * Detect the most common Google sign-in failure: this exact origin is not
     * listed in the OAuth client's Authorized JavaScript origins. Google only
     * logs that to the console, which a blind player can never see, so we
     * explain it in the interface instead.
     */
    /**
     * True for a throwaway Vercel preview deployment. Preview addresses change
     * on every push, so they can never be registered as a Google origin.
     */
    isPreviewHost(hostname) {
        const host = String(hostname || '');
        if (host === 'black-sold-ultimate.vercel.app') return false;
        if (host === 'mahicouragw.github.io') return false;
        return /-git-/.test(host) || /\.vercel\.app$/.test(host);
    },

    checkGoogleOriginAllowed() {
        if (this._originCheckDone) return;
        this._originCheckDone = true;
        // A Vercel PREVIEW deployment (contains "-git-" or a team suffix) can
        // never be an authorized Google origin, because its address changes on
        // every push. Send the player to the stable production address instead
        // of leaving them stuck on origin_mismatch.
        if (this.isPreviewHost(location.hostname)) {
            const message = 'This is a temporary preview address, so Google sign-in cannot work here. '
                + 'Open the main game at https://black-sold-ultimate.vercel.app and sign in there. '
                + 'Your heroes are safe.';
            document.querySelectorAll('#google-login-status,#google-signin-status').forEach(status=>{status.textContent=message;});
            window.Game?.addNarrative?.(message, 'system');
            return;
        }
        setTimeout(() => {
            const rendered = document.getElementById('google-signin-render');
            // A blocked origin renders no button at all.
            if (!rendered || rendered.children.length > 0) return;
            // Friendly message — no raw origin URL or console details.
            const message = 'Google sign-in isn\u2019t available on this site yet. You can still play as a guest, or try again later.';
            document.querySelectorAll('#google-login-status,#google-signin-status').forEach(status=>{status.textContent=message;});
            window.Game?.addNarrative?.(message, 'system');
            console.warn('Google origin not authorized:', location.origin);
        }, 2500);
    },

    async handleGoogleCredential(response) {
        // Fully guarded sign-in: after the player taps "Continue with Google" the
        // game must ALWAYS reach a clear next step — never a stuck spinner or a
        // silent error. Google already verifies the player, so there is NO
        // verification code / email step anywhere in this flow.
        const status=document.getElementById('google-login-status');
        const say=(msg)=>{ if(status)status.textContent=msg; };
        if(!response?.credential){say('Google did not return an identity token. Please tap the Google button again — your guest progress is safe.');return;}
        if(this._googleAuthCallback){say('Google sign-in is already finishing. Please wait.');return;}
        this._googleAuthCallback=true;
        try{
            say('Google verified. Preparing your adventure…');
            if(this.googleMergeRequested)this.prepareGoogleMerge();
            localStorage.setItem('black_sword_google_login_requested','true');
            let data,error;
            try{({data,error}=await this.client.auth.signInWithIdToken({provider:'google',token:response.credential}));}
            catch(e){data=null;error=e;}
            if(error||!data?.user){
                this.clearGoogleFlow();
                say(`Google sign-in could not finish: ${error?.message||'network error — check your connection'}. Tap the Google button to try again; your guest progress is safe.`);
                return;
            }
            if(this.user?.id!==data.user.id)this.authRevision++;
            this.user=data.user;this.linked=true;this.ready=true;
            document.getElementById('google-login-panel')?.classList.add('hidden');
            // 20-second watchdog: cloud hiccups can never strand a blind player.
            const finish=this.welcomeSignedInPlayer().catch(e=>{console.warn('Welcome flow issue:',e);this.onboardingFallback(e);});
            let watchdog;
            await Promise.race([finish,new Promise(resolve=>{watchdog=setTimeout(resolve,20000);})]);
            clearTimeout(watchdog);
        }finally{this._googleAuthCallback=false;}
    },

    // Greet the player the moment Google sign-in succeeds. Auth callbacks and
    // the credential callback can arrive together; only one welcome/restore may
    // control the screen and active hero.
    async welcomeSignedInPlayer() {
        if(this._welcomePromise)return this._welcomePromise;
        this._googleWelcomeInFlight=true;
        const run=this.performSignedInWelcome();
        this._welcomePromise=run;
        try{return await run;}
        finally{this._welcomePromise=null;this._googleWelcomeInFlight=false;}
    },

    async performSignedInWelcome() {
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
                ?(rosterInfo.mergeSynced===false
                    ?`Your guest heroes are merged on this device, but cloud confirmation failed. Keep the game online and use Save to Cloud. Welcome back, ${heroName}.`
                    :`Your guest heroes were merged into your Google account. Welcome back, ${heroName}. Taking you into the adventure…`)
                :`You signed in again. Thank you! Welcome back, ${heroName}. Taking you into the adventure…`);
            const heroId=rosterInfo.activeHeroId&&rosterInfo.heroes[rosterInfo.activeHeroId]?rosterInfo.activeHeroId:Object.keys(rosterInfo.heroes)[0];
            this.updateIndicators();
            if(heroId&&window.Game){window.Game.playHero(heroId);return;}
            window.Game?.showHeroRoster?.();
            return;
        }
        // ---- Brand-new Google account ----
        // Auto-create hero using Google display name. No creation screen needed.
        const googleName = this.user?.displayName || this.profile?.display_name || 'Hero';
        const safeName = googleName.replace(/[^\w\s'-]/g, '').trim().slice(0, 30) || 'Hero';
        this.status='Online — Google linked; creating your hero…';
        this.updateIndicators();
        this.announceToPlayer(`Welcome to Black Sword! Creating your hero ${safeName}. Your adventure begins now.`);
        if(window.Game){
            try{window.MusicSystem?.playTrack?.('intro');}catch{}
            const heroId = window.Game.autoCreateHero(safeName);
            if(heroId){
                // Save to cloud immediately
                const roster = window.Game.getRoster();
                this.saveGame(roster).catch(()=>{});
            }
        }
    },

    // Last-resort path when the cloud cannot be reached after Google sign-in:
    // still take the player to a clear screen, nothing hidden, nothing stuck.
    onboardingFallback(err) {
        const reason=(err?.message||'the cloud is unreachable').toString();
        let localHeroes=0;try{localHeroes=Object.keys(window.Game?.getRoster?.().heroes||{}).length;}catch{}
        this.status='Online — playing on this device';
        this.updateIndicators();
        if(localHeroes>0){
            this.announceToPlayer(`Welcome back! Using your saved heroes. They will sync to the cloud when connection is available.`);
            try{const roster=window.Game.getRoster();const id=roster.activeHeroId&&roster.heroes[roster.activeHeroId]?roster.activeHeroId:Object.keys(roster.heroes)[0];if(id){window.Game.playHero(id);return;}}catch{}
            window.Game?.showHeroRoster?.();
            return;
        }
        // New account — auto-create hero from Google name
        const googleName = this.user?.displayName || this.profile?.display_name || 'Hero';
        const safeName = googleName.replace(/[^\w\s'-]/g, '').trim().slice(0, 30) || 'Hero';
        this.announceToPlayer(`Welcome to Black Sword! Creating your hero ${safeName}. Your adventure begins now.`);
        if(window.Game){
            try{window.MusicSystem?.playTrack?.('intro');}catch{}
            window.Game.autoCreateHero(safeName);
        }
    },

    // Speak + narrate so TalkBack players hear the welcome, sighted players see it.
    announceToPlayer(text) {
        // Material connection/profile changes only. Repeated identical text is
        // never re-announced, so gameplay is not interrupted on every render,
        // movement, battle, chat refresh or state update.
        if(this._lastAnnouncement===text)return;
        this._lastAnnouncement=text;
        try{window.Game?.addNarrative?.(text,'npc');}catch{}
        try{if(localStorage.getItem('black_sword_auto_speak')==='true')this.speakText(text);}catch{}
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

    mergeRosterSnapshots(cloudRoster,pending) {
        const merged={...cloudRoster,version:2,activeHeroId:pending.activeHeroId,heroes:{...(cloudRoster.heroes||{})}};
        for(const [id,hero] of Object.entries(pending.heroes||{})){
            let target=id;
            const existing=merged.heroes[target];
            // Retrying after an uncertain network result is idempotent: the same
            // guest slot is not duplicated under a fresh generated ID.
            if(existing&&JSON.stringify(existing)===JSON.stringify(hero)){
                if(id===pending.activeHeroId)merged.activeHeroId=target;
                continue;
            }
            while(merged.heroes[target])target=`guest_${Date.now().toString(36)}_${target}`;
            merged.heroes[target]=hero;
            if(id===pending.activeHeroId)merged.activeHeroId=target;
        }
        return merged;
    },

    // Fetch the cloud roster, apply a pending guest merge, persist locally.
    // Throws on real network failure so callers can pick the fallback path.
    async restoreRosterFromCloud() {
        const cloud=await this.loadCloudSave();
        const payload=cloud?.save_data;
        let roster=payload?.heroes?payload:(payload?.player?{version:2,activeHeroId:'hero_cloud_legacy',heroes:{hero_cloud_legacy:payload}}:{version:2,activeHeroId:null,heroes:{}});
        const mergeRequested=localStorage.getItem('black_sword_merge_requested')==='true';
        let pending=null;try{pending=JSON.parse(localStorage.getItem('black_sword_pending_google_merge'));}catch{}
        let mergeSynced=true;
        if(mergeRequested&&pending?.heroes){
            roster=this.mergeRosterSnapshots(roster,pending);
            mergeSynced=await this.saveGame(roster);
            if(mergeSynced){
                localStorage.removeItem('black_sword_merge_requested');
                localStorage.removeItem('black_sword_pending_google_merge');
            }
            localStorage.setItem('black_sword_merged_this_login','true');
        }
        localStorage.removeItem('black_sword_google_login_requested');
        const restoredCount=Object.keys(roster.heroes||{}).length;
        if(restoredCount>0){
            if(!roster.activeHeroId||!roster.heroes[roster.activeHeroId])roster.activeHeroId=Object.keys(roster.heroes)[0];
            window.Game.storeRoster(roster,{touch:false});
            localStorage.setItem(window.Game.state.saveKey,JSON.stringify(roster.heroes[roster.activeHeroId]));
            // The previously loaded account must be unloaded before playHero;
            // otherwise its outgoing-save protection could overwrite this cloud slot.
            window.Game.resetHeroRuntime();
            window.Game.state.activeHeroId=roster.activeHeroId;
            try{localStorage.setItem('black_sword_roster_was_linked',this.linked?'true':'false');}catch{}
            const active=roster.heroes[roster.activeHeroId];
            if(active?.player?.name){this.profile=this.profile||{};this.profile.display_name=active.player.name;this.client.from('profiles').update({display_name:active.player.name,level:active.player.level||1,last_seen:new Date().toISOString()}).eq('id',this.user.id).then(()=>{});}
        }
        return {heroes:roster.heroes||{},activeHeroId:roster.activeHeroId||null,restoredCount,mergeSynced};
    },

    async mergeWithGoogle() {
        if (!this.client) await this.init();if(!this.client)return;this.openGoogleDialog(true);
    },

    async linkGoogle() {
        if (!this.client) await this.init();
        if (!this.client) { this.status = 'Guest mode'; this.updateIndicators(); return; }
        if(this.linked){this.status='Google is already connected. Restoring cloud heroes…';this.updateIndicators();await this.cacheCloudSave(true);return;}
        // Direct token sign-in remains available for compatible auth modes.
        // The current guest roster is merged into the selected Google account.
        this.openGoogleDialog(true);
    },

    // ---- Player ID + PIN recovery (server functions verified live) ----
    async setRecoveryPin(pin) {
        const status=document.getElementById('settings-pin-status');
        const say=(m)=>{ if(status)status.textContent=m; try{window.Game?.addNarrative?.(m,'system');}catch{} };
        pin=(pin||'').trim();
        if(!/^\d{6}$/.test(pin)){say('PIN must be exactly 6 digits — numbers only.');return false;}
        if(!this.client||!this.ready){say('Still connecting… try again in a moment.');return false;}
        say('Saving your PIN…');
        try{
            const {error}=await this.client.rpc('set_player_recovery_pin',{new_pin:pin,current_save:window.Game?window.Game.getCloudData():{}});
            if(error)throw error;
            try{localStorage.setItem('black_sword_pin_configured','true');}catch{}
            say('PIN saved! You can now sign in from any device using your Player ID + this PIN.');
            return true;
        }catch(e){say(`Could not save PIN: ${e.message||'network error'}`);return false;}
    },

    async loginWithPlayerPin(code,pin) {
        const status=document.getElementById('settings-pin-status');
        const say=(m)=>{ if(status)status.textContent=m; try{window.Game?.addNarrative?.(m,'system');}catch{} };
        code=(code||'').trim().toUpperCase();pin=(pin||'').trim();
        if(!code){say('Enter your Player ID (copy it from Settings on the other device).');return false;}
        if(!/^\d{6}$/.test(pin)){say('PIN is exactly 6 digits.');return false;}
        if(!this.client||!this.ready){say('Still connecting… try again in a moment.');return false;}
        say('Checking Player ID and PIN…');
        try{
            const {data,error}=await this.client.rpc('recover_progress_with_pin',{code,supplied_pin:pin});
            if(error)throw error;
            const payload=data||{};
            let roster=payload.heroes?payload:(payload.player?{version:2,activeHeroId:'hero_cloud_legacy',heroes:{hero_cloud_legacy:payload}}:{version:2,activeHeroId:null,heroes:{}});
            const count=Object.keys(roster.heroes||{}).length;
            if(!count){say('That account has no saved heroes yet.');return false;}
            if(!roster.activeHeroId||!roster.heroes[roster.activeHeroId])roster.activeHeroId=Object.keys(roster.heroes)[0];
            if(window.Game){
                localStorage.setItem(window.Game.state.rosterKey,JSON.stringify(roster));
                localStorage.setItem(window.Game.state.saveKey,JSON.stringify(roster.heroes[roster.activeHeroId]));
                window.Game.state.activeHeroId=roster.activeHeroId;
                localStorage.setItem('black_sword_recovered_by_id','true');
                const hero=roster.heroes[roster.activeHeroId];
                this.updateHeroEntryPoints(true);
                this.status=`Online — recovered ${count} hero${count===1?'':'es'} via Player ID`;
                this.updateIndicators();
                say(`Signed in with Player ID! Welcome back, ${hero?.player?.name||'hero'} — your heroes were restored on this device.`);
                document.getElementById('settings-panel')?.classList.add('hidden');
                window.Game.showHeroRoster();
            }
            return true;
        }catch(e){
            const msg=e.message||'network error';
            say(msg.includes('Too many attempts')?msg:'Invalid Player ID or PIN. Check both carefully — the PIN is 6 digits set on the original device.');
            return false;
        }
    },

    async signOut({ reload = true, flush = true } = {}) {
        if(flush)await Promise.race([this.flushCloudSaves(),new Promise(resolve=>setTimeout(resolve,5000))]);
        try{await this.client?.auth?.signOut?.({scope:'local'});}
        catch(error){console.warn('Sign-out cleanup warning:',error?.message||error);}
        this.authRevision++;
        this.ready=false;this.user=null;this.profile=null;this.linked=false;
        this.clearGoogleFlow();
        try{localStorage.removeItem('black_sword_recovered_by_id');}catch{}
        if(reload)location.reload();
    },

    requireLinked(action) {
        if (this.linked) return true;
        window.Game?.addNarrative?.(`Link Google in Settings before you can ${action}. Guests can still play and read public chat.`, 'system');
        this.showSettings();
        return false;
    },

    saveGame(saveData) {
        if (!this.ready || !this.user || !saveData || !this.client) return Promise.resolve(false);
        const userId=this.user.id;
        const authRevision=this.authRevision;
        const client=this.client;
        let snapshot;
        try{snapshot=JSON.parse(JSON.stringify(saveData));}
        catch(error){console.warn('Cloud save could not be serialized:',error?.message||error);return Promise.resolve(false);}
        // Backend requests do not necessarily finish in invocation order. A
        // per-account chain prevents an old create/switch/delete snapshot from
        // overwriting the newest roster. Account IDs are captured up front so a
        // queued guest save can never be written into a newly selected account.
        const previous=this.cloudSaveChains.get(userId)||Promise.resolve();
        const task=previous.catch(()=>false).then(async()=>{
            if(this.user?.id!==userId||this.client!==client||this.authRevision!==authRevision)return false;
            try{
                const {error}=await client.from('game_saves').upsert({
                    user_id:userId,save_data:snapshot,updated_at:new Date().toISOString()
                },{onConflict:'user_id'});
                if(error){console.warn('Cloud save failed:',error.message);return false;}
                // Keep the optional Player ID + PIN recovery copy in the same
                // ordered transaction sequence. Missing legacy RPCs or an
                // unconfigured PIN never turn a successful cloud save into an
                // unhandled rejection.
                if(typeof client.rpc==='function'){
                    try{await client.rpc('update_recovery_save',{current_save:snapshot});}catch{}
                }
                try{localStorage.setItem('black_sword_roster_was_linked',this.linked?'true':'false');}catch{}
                if(this.user?.id===userId&&this.client===client&&this.authRevision===authRevision)await this.updatePresence().catch(()=>{});
                return true;
            }catch(error){console.warn('Cloud save failed:',error?.message||error);return false;}
        });
        this.cloudSaveChains.set(userId,task);
        task.finally(()=>{if(this.cloudSaveChains.get(userId)===task)this.cloudSaveChains.delete(userId);});
        return task;
    },

    async flushCloudSaves() {
        const id=this.user?.id;
        const pending=id?this.cloudSaveChains.get(id):null;
        if(pending)await pending.catch(()=>false);
    },

    async loadCloudSave() {
        if (!this.ready || !this.user) return null;
        const { data, error } = await this.client.from('game_saves').select('save_data,updated_at').eq('user_id', this.user.id).maybeSingle();
        if (error) throw error;
        return data;
    },

    async cacheCloudSave(forceRestore = false) {
        if (!this.ready || !window.Game) return false;
        try {
            const loginRequested=forceRestore||localStorage.getItem('black_sword_google_login_requested')==='true';
            const localRoster=window.Game.getRoster();
            const localCount=Object.keys(localRoster.heroes||{}).length;
            const cloud=await this.loadCloudSave();
            const payload=cloud?.save_data;
            let roster=payload?.heroes?payload:(payload?.player?{version:2,activeHeroId:'hero_cloud_legacy',heroes:{hero_cloud_legacy:payload}}:{version:2,activeHeroId:null,heroes:{}});
            let mergeRequested=localStorage.getItem('black_sword_merge_requested')==='true';
            let pending=null;try{pending=JSON.parse(localStorage.getItem('black_sword_pending_google_merge'));}catch{}
            if(mergeRequested&&!pending?.heroes){localStorage.removeItem('black_sword_merge_requested');mergeRequested=false;}
            if(mergeRequested){
                roster=this.mergeRosterSnapshots(roster,pending);
                const synced=await this.saveGame(roster);
                if(synced){localStorage.removeItem('black_sword_merge_requested');localStorage.removeItem('black_sword_pending_google_merge');}
                this.status=synced?'Online — Google linked; guest heroes merged successfully':'Guest heroes are merged locally; cloud confirmation failed';
            }
            const restoredCount=Object.keys(roster.heroes||{}).length;
            if(!restoredCount){
                localStorage.removeItem('black_sword_google_login_requested');
                if(localCount&&!loginRequested){
                    // An empty cloud row must not disable or erase an existing
                    // local roster. Repair the empty backup in serialized order.
                    this.status='Online — local heroes kept; repairing the empty cloud save';
                    this.updateHeroEntryPoints(true);this.updateIndicators();
                    await this.saveGame(localRoster);
                }else{
                    this.status=this.linked?'Google account connected; no cloud heroes were found. Create the first hero.':'No cloud heroes were found.';
                    this.updateHeroEntryPoints(localCount>0);this.updateIndicators();
                }
                return false;
            }
            if(!roster.activeHeroId||!roster.heroes[roster.activeHeroId])roster.activeHeroId=Object.keys(roster.heroes)[0]||null;
            const localTime=Date.parse(localRoster.updatedAt||'')||0;
            const cloudTime=Date.parse(payload?.updatedAt||cloud?.updated_at||'')||0;
            const cloudIsNewer=localTime>0&&cloudTime>localTime;
            const shouldApply=Boolean(mergeRequested||loginRequested||!localCount||(cloudIsNewer&&!window.Game.state.player));
            if(!shouldApply){this.updateHeroEntryPoints(true);this.updateIndicators();return true;}

            window.Game.storeRoster(roster,{touch:false});
            const active=roster.heroes[roster.activeHeroId];
            if(loginRequested)window.Game.resetHeroRuntime();
            window.Game.state.activeHeroId=roster.activeHeroId;
            localStorage.setItem(window.Game.state.saveKey,JSON.stringify(active));
            try{localStorage.setItem('black_sword_roster_was_linked',this.linked?'true':'false');}catch{}
            if(active?.player?.name){
                this.profile=this.profile||{};
                this.profile.display_name=active.player.name;
                this.client.from('profiles').update({display_name:active.player.name,level:active.player.level||1,last_seen:new Date().toISOString()}).eq('id',this.user.id).then(()=>{});
            }
            this.updateHeroEntryPoints(true);
            if(!mergeRequested)this.status=`Online — Google linked; restored ${restoredCount} cloud hero${restoredCount===1?'':'es'}`;
            localStorage.removeItem('black_sword_google_login_requested');
            this.updateIndicators();
            if(loginRequested||forceRestore)window.Game.showHeroRoster();
            return true;
        }catch(error){
            localStorage.removeItem('black_sword_google_login_requested');
            this.status=`Cloud restore failed: ${error?.message||'connection failed'}`;
            this.updateIndicators();console.warn('Cloud restore check failed:',error?.message||error);
            return false;
        }
    },

    updateHeroEntryPoints(hasRoster = null) {
        let roster={heroes:{},activeHeroId:null};try{roster=window.Game?.getRoster?.()||roster;}catch{}
        const rosterCount=Object.keys(roster.heroes||{}).length;
        const activeAvailable=Boolean(roster.activeHeroId&&roster.heroes[roster.activeHeroId]);
        const available=hasRoster===false?false:activeAvailable;
        // Only protect the roster when a real online account is linked.
        // Offline/local guests can always start a New Adventure.
        const protectedRoster=rosterCount>0&&this.linked;
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

    checkChatContent(body) {
        const text=String(body||'').trim();
        if(/https?:\/\/|www\.|javascript:|data:text\/html|\b[a-z0-9-]+\.(?:com|net|org|io|ru|xyz|gg|ly)\b/i.test(text))return'Links are not allowed in temporary chat.';
        if(/(.)\1{7,}/i.test(text)||/\b(\w+)(?:\s+\1){3,}\b/i.test(text))return'Repeated spam is not allowed.';
        if(/\b(?:kill|hurt|attack|find|rape)\s+(?:you|your family)\b|\b(?:kill yourself|go die)\b/i.test(text))return'Threatening messages are not allowed.';
        if(/\byou(?:'re| are)\s+(?:an?\s+)?(?:idiot|stupid|worthless|trash|ugly|pathetic)\b/i.test(text))return'Harassing messages are not allowed.';
        if(/\b(?:fuck|shit|bitch|cunt|nigger|faggot|retard|porn)\w*\b/i.test(text))return'Abusive, profane, or inappropriate messages are not allowed.';
        return'';
    },

    async sendMessage(targetQuery, body) {
        const text = body.trim().slice(0, 300);
        if (!text) return false;
        const moderation=this.checkChatContent(text);if(moderation){window.Game.addNarrative(moderation,'system');return false;}
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

    // Public hero projection. Only these fields may ever leave the server for
    // another player: no account ids, emails, player codes, PINs, tokens,
    // recovery answers or internal UUIDs.
    PUBLIC_HERO_FIELDS: Object.freeze(['display_name','level','current_location','last_seen','hero_class','hero_race','titles','achievements','str','dex','int','wis','hp','max_hp','weapon','armor']),
    toPublicHero(row) {
        const safe={};
        for(const field of this.PUBLIC_HERO_FIELDS) if(row&&row[field]!==undefined) safe[field]=row[field];
        // Never include: id, email, player_code, pin, tokens, or any internal UUIDs
        return safe;
    },

    async listOnlineHeroes() {
        if (!this.ready) return [];
        const since=new Date(Date.now()-10*60*1000).toISOString();
        const {data,error}=await this.client.from('profiles').select('display_name,level,current_location,last_seen').gte('last_seen',since).order('last_seen',{ascending:false}).limit(30);
        if(error){window.Game?.addNarrative?.(error.message,'system');return [];}
        return (data||[]).map(row=>this.toPublicHero(row));
    },

    async sendFeedback(category,message) {
        const clean=String(message||'').trim().slice(0,1000);if(!clean){window.Game?.addNarrative?.('Add a message after the feedback command.','system');return false;}
        if(!this.ready||!this.user){window.Game?.addNarrative?.('Feedback is still connecting. Try again shortly.','system');return false;}
        const allowed=['gameplay','bug','accessibility','moderation','suggestion','praise'],kind=allowed.includes(category)?category:'gameplay';
        const {data,error}=await this.client.rpc('submit_game_feedback',{feedback_category:kind,feedback_message:clean});
        if(error){window.Game.addNarrative(`Feedback could not be stored: ${error.message}`,'system');return false;}
        window.Game.addNarrative(`Thank you. Feedback ${data} was securely routed to the moderator/developer inbox.`,'treasure');return true;
    },

    async showModeratorInbox() {
        if(!this.ready){window.Game?.addNarrative?.('Moderator inbox is still connecting.','system');return false;}
        const {data,error}=await this.client.rpc('list_moderator_feedback',{row_limit:50});
        if(error){window.Game?.addNarrative?.(/not authorized/i.test(error.message||'')?'This account is not assigned an active moderator or developer role.':error.message,'system');return false;}
        const panel=document.getElementById('moderator-inbox-panel'),list=document.getElementById('moderator-inbox-list');if(!panel||!list)return false;list.replaceChildren();
        for(const item of data||[]){const card=document.createElement('article');card.className='moderator-feedback-card';card.setAttribute('role','listitem');const heading=document.createElement('h4');heading.textContent=`${item.category} — ${item.status}`;const meta=document.createElement('p');meta.textContent=`Feedback ID ${item.feedback_id}; sender ${item.sender_id}; created ${new Date(item.created_at).toLocaleString()}; assigned ${item.assigned_to||'unassigned'}; expires ${item.expires_at||'not applicable'}.`;const body=document.createElement('p');body.textContent=item.message;const note=document.createElement('p');note.textContent=`Private resolution note: ${item.resolution_note||'none'}`;card.append(heading,meta,body,note);list.appendChild(card);}if(!data?.length)list.textContent='No feedback is waiting.';panel.classList.remove('hidden');window.Game?.addNarrative?.(`Moderator inbox opened with ${data?.length||0} item${data?.length===1?'':'s'}.`,'system');return true;
    },

    async moderateFeedback(id,status,note='') {
        if(!this.ready)return false;const {error}=await this.client.rpc('moderate_game_feedback',{feedback_id:id,new_status:status,private_note:String(note||'').slice(0,1000)});if(error){window.Game?.addNarrative?.(error.message,'system');return false;}window.Game?.addNarrative?.(`Feedback ${id} updated to ${status}.`,'treasure');await this.showModeratorInbox();return true;
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
    isFreshMessage(message,now=Date.now()){const expires=message?.expires_at?new Date(message.expires_at).getTime():new Date(message?.created_at||0).getTime()+300000;return Number.isFinite(expires)&&expires>now;},
    scheduleMessageExpiry(){clearTimeout(this.messageExpiryTimer);const expiries=this.messageCache.map(m=>new Date(m.expires_at||new Date(m.created_at).getTime()+300000).getTime()).filter(Number.isFinite);if(!expiries.length)return;const next=Math.min(...expiries);this.messageExpiryTimer=setTimeout(()=>{this.messageCache=this.messageCache.filter(m=>this.isFreshMessage(m));this.refreshOpenSocial();this.scheduleMessageExpiry();},Math.max(0,next-Date.now()+30));},

    async listMessages() {
        if (!this.ready) return [];
        const { data, error } = await this.client.from('messages')
            .select('*,sender:profiles!messages_sender_id_fkey(display_name)')
            .gt('expires_at',new Date().toISOString())
            .order('created_at', { ascending: false }).limit(30);
        if (error) { console.warn(error.message); return []; }
        this.messageCache=(data || []).filter(m=>this.isFreshMessage(m)).reverse().map(m=>this.normalizeLanguageMessage(m));this.scheduleMessageExpiry();return this.messageCache;
    },

    async subscribe() {
        if (!this.client || this.subscription) return;
        const membershipResult=await this.client.from('combat_group_members').select('group_id').eq('user_id',this.user.id).limit(1).maybeSingle();
        const hasV6=!membershipResult.error;this.activeCombatGroup=membershipResult.data?.group_id||null;
        let channel=this.client.channel('black-sword-social')
            .on('postgres_changes',{event:'*',schema:'public',table:'messages'},payload=>{if(payload.eventType==='DELETE'){this.messageCache=this.messageCache.filter(m=>String(m.id)!==String(payload.old?.id));this.refreshOpenSocial();return;}const raw=payload.new;if(payload.eventType!=='INSERT'||!this.isFreshMessage(raw))return;const authorized=raw.receiver_id===null||raw.sender_id===this.user?.id||raw.receiver_id===this.user?.id;if(!authorized)return;this.refreshOpenSocial();const m=this.normalizeLanguageMessage(raw);if(m.sender_id!==this.user?.id&&localStorage.getItem('black_sword_auto_speak')==='true'){const task=window.TranslationService?.translate?.(m.body,m.source_language||'en')||Promise.resolve(m.body);task.then(text=>{if(this.isFreshMessage(m))this.speakText(text,m.voice_id||'system:default',window.TranslationService?.target||'en');});}})
            .on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>this.refreshOpenSocial());
        if(hasV6) channel=channel
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'group_battle_actions'},payload=>{const a=payload.new,g=window.Game;if(a.group_id!==this.activeCombatGroup||a.user_id===this.user?.id||!g?.state?.inCombat||!g.state.enemy)return;if(g.state.enemy.name.toLowerCase()!==String(a.monster_name).toLowerCase())return;g.applyEnemyDamage(a.damage,null);g.updateEnemyHUD();if(g.state.enemy.hp<=0)g.enemyDefeated();})
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'guild_invites'},()=>this.refreshOpenSocial())
            .on('postgres_changes',{event:'INSERT',schema:'public',table:'combat_group_invites'},()=>this.refreshOpenSocial());
        this.subscription=channel.subscribe();
    },

    refreshOpenSocial() {
        if(document.getElementById('social-panel')?.classList.contains('hidden'))return;
        this.socialRefreshQueued=true;
        clearTimeout(this.socialRefreshTimer);
        this.socialRefreshTimer=setTimeout(()=>{this.socialRefreshQueued=false;window.Game?.showSocial?.({background:true});},250);
    },

    updateIndicators() {
        const activeName = window.Game?.state?.player?.name || this.profile?.display_name || 'No hero selected';
        const line = `${activeName} • ${this.status}`;
        // Static status area only. Writing identical text would re-fire the live
        // region and interrupt TalkBack on every render, so it is skipped.
        const el = document.getElementById('online-status');
        if (el && el.textContent !== line) el.textContent = line;
        const titleStatus = document.getElementById('title-account-status');
        if (titleStatus && titleStatus.textContent !== line) titleStatus.textContent = line;
        const signIn = document.getElementById('btn-google-signin');
        if (signIn) {
            signIn.hidden = Boolean(this.linked);
            signIn.disabled = Boolean(this.linked);
            if (!this.linked) {
                signIn.innerHTML = '<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
            }
        }
        const code = document.getElementById('settings-player-code');
        if (code) code.textContent = this.getPlayerCode();
        const heroName = document.getElementById('settings-hero-name');
        if (heroName) heroName.textContent = activeName;
        // Account status row — hide entirely after login (user doesn't need to see it)
        const account = document.getElementById('settings-account-status');
        if (account) {
            if (this.linked) {
                account.parentElement.hidden = true; // Hide the entire row
            } else {
                account.textContent = this.ready ? 'Guest account' : 'Local/offline guest';
            }
        }
        // Player ID row — hide after login
        const codeRow = document.getElementById('settings-player-code')?.parentElement;
        if (codeRow) codeRow.hidden = Boolean(this.linked);
        // Account note — hide after login
        const accountNote = document.getElementById('settings-account-note');
        if (accountNote) accountNote.hidden = Boolean(this.linked);
        const google = document.getElementById('btn-link-google');
        if (google) { google.disabled = true; google.hidden = true; }
        const merge = document.getElementById('btn-google-merge');
        if (merge) { merge.disabled = true; merge.hidden = true; }
        const guestBox = document.getElementById('settings-guest-google');
        if (guestBox) { guestBox.classList.add('hidden'); guestBox.hidden = true; }
        const linkedBox = document.getElementById('settings-linked-google');
        if (linkedBox) linkedBox.classList.toggle('hidden', !this.linked);
        const pinLogin = document.getElementById('settings-pin-login');
        if (pinLogin) pinLogin.classList.toggle('hidden', this.linked);
        // Copy Player ID button — hide after login
        const copyIdBtn = document.getElementById('btn-copy-player-id');
        if (copyIdBtn) copyIdBtn.hidden = Boolean(this.linked);
        // PIN setup section — hide after login
        const pinSetup = document.getElementById('btn-set-pin')?.parentElement;
        if (pinSetup) pinSetup.hidden = Boolean(this.linked);
        const pinLabel = document.querySelector('label[for="settings-pin-input"]');
        if (pinLabel) pinLabel.hidden = Boolean(this.linked);
        const pinInput = document.getElementById('settings-pin-input');
        if (pinInput) pinInput.hidden = Boolean(this.linked);
        const signOut = document.getElementById('btn-account-signout');
        if (signOut) signOut.hidden = false;
        this.populateVoiceSelectors();
        this.updateHeroEntryPoints();
    },

    showSettings() {
        this.updateIndicators();
        document.getElementById('settings-panel')?.classList.remove('hidden');
    }
};
window.OnlineSystem = OnlineSystem;
