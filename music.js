/**
 * Black Sword Ultimate v7.21 — centralized, bounded audio manager.
 *
 * Two reusable HTMLAudioElements are reserved for world and overlay music.
 * SFX normally use cached Web Audio buffers and have a four-element bounded
 * fallback pool. No gameplay path creates an unlimited number of Audio objects.
 * All bundled works and their exact licences are recorded in AUDIO_CREDITS.md
 * and assets/audio/audio-manifest.json.
 */

class AudioManagerController {
    constructor() {
        this.storageKey = 'black_sword_audio_settings_v1';
        this.settings = {
            musicEnabled: true,
            musicVolume: 0.32,
            sfxEnabled: true,
            sfxVolume: 0.55,
            voiceEnabled: false,
            voiceVolume: 0.9,
            voiceRate: 1,
            shuffle: true
        };
        this.initialized = false;
        this.worldAudio = null;
        this.overlayAudio = null;
        this.currentTrack = null;
        this.currentKey = null;
        this.currentContext = null;
        this.worldContext = null;
        this.overlayContext = null;
        this.overlayMode = null;
        this.battleActive = false;
        this.pendingPlayback = null;
        this.playbackSession = 0;
        this.pageSuspended = false;
        this.activeSFX = new Set();
        this.fadeTokens = new WeakMap();
        this.playlistState = new Map();
        this.globalHistory = [];
        this.directTrack = false;
        this.specialResolver = null;
        this.duckRequests = new Map();
        this.speechQueue = []; // Unified narration/effect/reaction event queue.
        this.voiceProcessing = false;
        this.activeSpeechCancel = null;
        this.activeSFXCancels = new Set();
        this.legacySFXPending = [];
        this.legacySFXFlushScheduled = false;
        this.recentSFX = new Map();
        this.recentAudioEvents = new Map();
        this.audioEventIds = new Set();
        this.audioEventSequence = 0;
        this.audioQueueGeneration = 0;
        this.voicePaused = false;
        this.lastVoiceText = "";
        this.recentVoice = new Map();
        this.speaking = false;
        this.currentUtterance = null;
        this.currentSpeechItem = null;
        // One authoritative state machine: world -> transition -> battle ->
        // victory -> restore -> world. This is diagnostic state, not a second
        // playback engine.
        this.audioState = 'idle';
        this.visibilityResume = null;

        this.audioCtx = null;
        this.sfxGain = null;
        this.sfxBuffers = Object.create(null);
        this.sfxDecodePromises = Object.create(null);
        this.sfxFallbackPool = [];
        this.sfxLoopPool = [];
        this.activeSFXLoops = new Map();
        this.sfxFallbackCursor = 0;

        this.music = {
            town: { src: 'assets/audio/music/town.mp3', title: 'Fantasy Music - Night Town' },
            inn: { src: 'assets/audio/music/inn.mp3', title: 'The Old Tower Inn' },
            exploration: { src: 'assets/audio/music/exploration.mp3', title: 'Epic Departure' },
            darkForest: { src: 'assets/audio/music/dark-forest.mp3', title: 'Cathedral in the Forest' },
            temple: { src: 'assets/audio/music/Fantasy-Choir-1.mp3', title: 'A Winter Tale' },
            palace: { src: 'assets/audio/music/Fantasy-Choir-2.mp3', title: 'A New Town' },
            epicExplore: { src: 'assets/audio/music/Fantasy-Choir-3.mp3', title: 'Beyond the Frozen Veil' },
            intro: { src: 'assets/audio/music/adventure-intro.wav', title: 'Adventure Intro Title' },
            dungeon: { src: 'assets/audio/music/dungeon.ogg', title: 'RPG Ambience - Dungeon' },
            battle: { src: 'assets/audio/music/battle.ogg', title: 'Battle March' },
            battleFast: { src: 'assets/audio/music/battle-fast.mp3', title: 'Battle in the Stratosphere' },
            battleCinematic: { src: 'assets/audio/music/determined-pursuit.mp3', title: 'Determined Pursuit' },
            boss: { src: 'assets/audio/music/boss.mp3', title: 'A Slave To No One' },
            townThemeRpg: { src: 'assets/audio/music/town-theme-rpg.mp3', title: 'Town Theme RPG' },
            naturalForest: { src: 'assets/audio/music/natural-forest-theme.mp3', title: 'Natural Forest Fantasy Music' },
            battleThemeA: { src: 'assets/audio/music/battle-theme-a.mp3', title: 'Battle Theme A' },
            bossBattleTheme: { src: 'assets/audio/music/boss-battle-theme.mp3', title: 'Battle RPG Theme' },
            finalBossTheme: { src: 'assets/audio/music/final-boss-theme.ogg', title: 'Battle RPG Theme Variation' },
            victory: { src: 'assets/audio/music/victory.mp3', title: 'Victory' }
        };

        // Every requested category has at least two context-compatible real tracks.
        // Tracks may intentionally serve more than one related category.
        this.playlists = {
            CITY: ['town', 'townThemeRpg', 'palace', 'inn'],
            CITY_MARKET: ['townThemeRpg', 'town', 'inn', 'palace'],
            MARKET: ['townThemeRpg', 'inn', 'town', 'palace'],
            VILLAGE: ['inn', 'townThemeRpg', 'town', 'palace'],
            FOREST: ['naturalForest', 'darkForest', 'exploration', 'epicExplore'],
            PASTURE: ['exploration', 'palace', 'town'],
            ISLAND: ['exploration', 'epicExplore', 'darkForest'],
            MOUNTAIN: ['epicExplore', 'exploration', 'temple'],
            CAVE: ['dungeon', 'darkForest', 'temple'],
            DUNGEON: ['dungeon', 'darkForest', 'temple'],
            TEMPLE: ['temple', 'palace', 'epicExplore'],
            PALACE: ['palace', 'temple', 'epicExplore'],
            CEMETERY: ['darkForest', 'dungeon', 'temple'],
            MYSTERIOUS: ['darkForest', 'dungeon', 'temple'],
            EXPLORATION: ['exploration', 'epicExplore', 'darkForest'],
            TRAVEL: ['exploration', 'town', 'epicExplore'],
            DISCOVERY: ['palace', 'exploration', 'epicExplore'],
            JOURNEY: ['exploration', 'epicExplore', 'town'],
            WONDER: ['epicExplore', 'temple', 'palace'],
            INSPIRATIONAL: ['temple', 'palace', 'epicExplore'],
            MOTIVATIONAL: ['epicExplore', 'intro', 'palace'],
            HEROIC_INSPIRATION: ['intro', 'epicExplore', 'temple'],
            EMOTIONAL_INSPIRATION: ['temple', 'darkForest', 'palace'],
            VICTORY_INSPIRATION: ['victory', 'intro', 'epicExplore'],
            EPIC_ADVENTURE: ['epicExplore', 'intro', 'exploration'],
            EPIC_FANTASY: ['epicExplore', 'temple', 'palace'],
            HEROIC: ['intro', 'epicExplore', 'battleCinematic'],
            POWERFUL: ['battleCinematic', 'boss', 'epicExplore'],
            CINEMATIC_FANTASY: ['intro', 'epicExplore', 'temple'],
            // Combat pools have separate identities. World tracks never enter
            // these pools and normal battle music cannot leak into final bosses.
            BATTLE_NORMAL: ['battle', 'battleFast', 'battleThemeA'],
            BATTLE_INTENSE: ['battleFast', 'battleThemeA', 'battleCinematic'],
            BATTLE_BOSS: ['bossBattleTheme', 'boss', 'battleCinematic'],
            BATTLE_FINAL_BOSS: ['finalBossTheme', 'boss', 'battleCinematic'],
            DANGER: ['battleCinematic', 'darkForest', 'dungeon'],
            BATTLE_VICTORY: ['victory', 'intro'],
            SPECIAL_QUEST_COMPLETE: ['victory', 'palace'],
            SPECIAL_LEVEL_UP: ['victory', 'intro'],
            SPECIAL_DEATH: ['darkForest', 'dungeon'],
            SPECIAL_REVIVAL: ['temple', 'palace'],
            SPECIAL_CEREMONY: ['temple', 'palace'],
            SPECIAL_TREASURE: ['victory', 'inn'],
            SPECIAL_RARE_DISCOVERY: ['intro', 'epicExplore']
        };

        this.contextAliases = {
            city: 'CITY', kaliwasch: 'CITY_MARKET', market: 'CITY_MARKET', marketplace: 'CITY_MARKET',
            city_market: 'CITY_MARKET', tavern: 'VILLAGE', inn: 'VILLAGE', village: 'VILLAGE',
            forest: 'FOREST', pasture: 'PASTURE', plains: 'PASTURE', island: 'ISLAND',
            wilderness: 'EXPLORATION', exploration: 'EXPLORATION', travel: 'TRAVEL', journey: 'JOURNEY',
            mountains: 'MOUNTAIN', mountain: 'MOUNTAIN', cave: 'CAVE', swamp: 'MYSTERIOUS',
            ruins: 'MYSTERIOUS', dungeon: 'DUNGEON', depths: 'DUNGEON', temple: 'TEMPLE',
            palace: 'PALACE', cemetery: 'CEMETERY', cemeteryhorror: 'CEMETERY', ghostchoir: 'CEMETERY',
            mysterious: 'MYSTERIOUS', 'epic-exploration': 'EPIC_ADVENTURE', epic: 'EPIC_FANTASY',
            battle: 'BATTLE_NORMAL', combat: 'BATTLE_NORMAL', boss: 'BATTLE_BOSS',
            finalboss: 'BATTLE_FINAL_BOSS', victory: 'BATTLE_VICTORY', 'game-hall': 'VILLAGE'
        };

        this.sfx = {
            attack: ['assets/audio/sfx/attack.wav', 'assets/audio/sfx/attack-heavy.wav', 'assets/audio/sfx/attack-fast.wav'],
            hit: ['assets/audio/sfx/hit.wav', 'assets/audio/sfx/hit-metal-1.wav', 'assets/audio/sfx/hit-metal-2.wav'],
            'enemy-hit': ['assets/audio/sfx/monster-hit.wav', 'assets/audio/sfx/monster-roar.wav'],
            treasure: ['assets/audio/sfx/coin.wav'], coin: ['assets/audio/sfx/coin.wav'],
            levelup: ['assets/audio/sfx/levelup.wav'], exp: ['assets/audio/sfx/exp.wav'],
            magic: ['assets/audio/sfx/magic.wav', 'assets/audio/sfx/spell-cast.wav', 'assets/audio/sfx/spell-arcane.wav'],
            death: ['assets/audio/sfx/death.wav', 'assets/audio/sfx/monster-roar.wav'],
            victory: ['assets/audio/music/victory.mp3'], door: ['assets/audio/sfx/door.wav'],
            pickup: ['assets/audio/sfx/pickup.wav'], heal: ['assets/audio/sfx/heal.wav'],
            eat: ['assets/audio/sfx/eat.ogg'], drink: ['assets/audio/sfx/drink.ogg'],
            blessing: ['assets/audio/sfx/magic.wav'], chip: ['assets/audio/sfx/ui-click.wav'],
            click: ['assets/audio/sfx/ui-click.wav'], button: ['assets/audio/sfx/ui-click.wav'],
            swipe: ['assets/audio/sfx/music-transition.wav'], 'goblin-reaction': ['assets/audio/sfx/goblin-reaction.ogg'],
            'weapon-hit': ['assets/audio/sfx/hit.wav'], 'music-transition': ['assets/audio/sfx/music-transition.wav'],
            'engine-low': ['assets/audio/sfx/engine-low.wav'], 'engine-high': ['assets/audio/sfx/engine-high.wav'],
            'car-start': ['assets/audio/sfx/car-start.mp3'], 'car-horn': ['assets/audio/sfx/car-horn.mp3'],
            'car-collision': ['assets/audio/sfx/car-collision.mp3'], 'car-skid': ['assets/audio/sfx/car-skid.ogg'],
            'car-door-open': ['assets/audio/sfx/car-door-open.ogg'], 'car-door-close': ['assets/audio/sfx/car-door-close.ogg'],
            'race-beep': ['assets/audio/sfx/race-beep.mp3'], 'race-checkpoint': ['assets/audio/sfx/race-checkpoint.mp3'],
            'heal-chain': ['assets/audio/sfx/heal-chain.wav'],
            'step-leaves': ['assets/audio/sfx/step-leaves-1.ogg', 'assets/audio/sfx/step-leaves-2.ogg'],
            explore: ['assets/audio/sfx/explore.wav', 'assets/audio/sfx/step-leaves-1.ogg', 'assets/audio/sfx/step-leaves-2.ogg', 'assets/audio/sfx/step-stone.ogg', 'assets/audio/sfx/step-wood.ogg', 'assets/audio/sfx/step-gravel.ogg', 'assets/audio/sfx/step-mud.ogg'],
            miss: ['assets/audio/sfx/miss.wav'], 'body-fall': ['assets/audio/sfx/body-fall.wav'],
            check: ['assets/audio/sfx/check.wav'], checkmate: ['assets/audio/sfx/checkmate.wav'],
            'chess-move': ['assets/audio/sfx/chess-move.wav'], 'card-flip': ['assets/audio/sfx/card-flip.wav'],
            'carrom-strike': ['assets/audio/sfx/carrom-strike.wav'], 'coin-collision': ['assets/audio/sfx/coin-collision.wav'],
            'ghost-scream': ['assets/audio/sfx/ghost-scream.wav'], 'ghost-moan': ['assets/audio/sfx/ghost-moan.wav'],
            'goblin-cackle': ['assets/audio/sfx/goblin-cackle.wav'], 'haunted-wind': ['assets/audio/sfx/haunted-wind.wav'],
            'monster-roar': ['assets/audio/sfx/monster-roar.wav'], 'monster-hit': ['assets/audio/sfx/monster-hit.wav'],
            'board-dice': ['assets/audio/sfx/board-dice.wav'], 'board-piece': ['assets/audio/sfx/board-piece.wav'],
            'board-turn': ['assets/audio/sfx/board-turn.wav'], 'board-error': ['assets/audio/sfx/board-error.wav'],
            'card-shuffle': ['assets/audio/sfx/card-shuffle.wav'], 'card-draw': ['assets/audio/sfx/card-draw.wav'],
            'multi-strike': ['assets/audio/sfx/attack-fast.wav', 'assets/audio/sfx/carrom-strike.wav'],
            shark: ['assets/audio/sfx/haunted-wind.wav', 'assets/audio/sfx/monster-roar.wav'],
            'shark-hit': ['assets/audio/sfx/hit-metal-2.wav', 'assets/audio/sfx/body-fall.wav'],
            summon: ['assets/audio/sfx/ghost-moan.wav', 'assets/audio/sfx/spell-cast.wav'],
            command: ['assets/audio/sfx/monster-roar.wav', 'assets/audio/sfx/goblin-cackle.wav']
        };

        // ProfessionalAudioCombat passes filename-like IDs. Resolve every one
        // through the same registry rather than creating a second audio engine.
        for (const src of new Set(Object.values(this.sfx).flat())) {
            const key = src.split('/').pop().replace(/\.(wav|ogg|mp3)$/i, '');
            if (!this.sfx[key]) this.sfx[key] = [src];
        }
    }

    get musicEnabled() { return this.settings.musicEnabled; }
    set musicEnabled(value) { this.settings.musicEnabled = Boolean(value); }
    get sfxEnabled() { return this.settings.sfxEnabled; }
    set sfxEnabled(value) { this.settings.sfxEnabled = Boolean(value); }
    get voiceEnabled() { return this.settings.voiceEnabled; }
    set voiceEnabled(value) { this.settings.voiceEnabled = Boolean(value); }
    get volume() { return this.settings.musicVolume; }
    set volume(value) { this.settings.musicVolume = this.clamp(value); }
    get sfxVolume() { return this.settings.sfxVolume; }
    set sfxVolume(value) { this.settings.sfxVolume = this.clamp(value); }
    get voiceVolume() { return this.settings.voiceVolume; }
    set voiceVolume(value) { this.settings.voiceVolume = this.clamp(value); }

    clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

    isDocumentHidden() { return typeof document === 'undefined' || !document || document.hidden; }

    loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved && typeof saved === 'object') {
                for (const key of Object.keys(this.settings)) {
                    if (typeof saved[key] === typeof this.settings[key]) this.settings[key] = saved[key];
                }
            }
        } catch { /* private mode or malformed legacy data */ }
    }

    persistSettings() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.settings)); } catch { /* storage may be disabled */ }
        this.syncSettingsUI();
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.loadSettings();

        this.worldAudio = new Audio();
        this.overlayAudio = new Audio();
        for (const audio of [this.worldAudio, this.overlayAudio]) {
            audio.preload = 'auto';
            audio.loop = false;
            audio.addEventListener('error', () => this.handleMusicError(audio));
        }
        this.worldAudio.addEventListener('ended', () => this.handleTrackEnded('world'));
        this.overlayAudio.addEventListener('ended', () => this.handleTrackEnded('overlay'));

        // Eight additional bounded players are reserved for continuous recorded
        // loops (vehicle engine/surface/contact layers), never for event overlap.
        for (let index = 0; index < 8; index++) {
            const loop = new Audio(); loop.preload = 'auto'; loop.loop = true;
            loop.addEventListener('error', () => {
                const id = loop.dataset.loopId; if (id) this.stopSFXLoop(id);
                loop.dataset.busy = 'false';
            });
            this.sfxLoopPool.push(loop);
        }

        // A fixed fallback pool prevents leaked Audio elements when Web Audio is
        // unavailable or a buffer is still decoding.
        for (let index = 0; index < 4; index++) {
            const effect = new Audio();
            effect.preload = 'auto';
            const clean = () => {
                effect.pause();
                effect.removeAttribute('src');
                effect.load();
                effect.dataset.busy = 'false';
            };
            effect.addEventListener('ended', clean);
            effect.addEventListener('error', clean);
            this.sfxFallbackPool.push(effect);
        }

        const unlock = () => {
            if(this.isDocumentHidden()||this.pageSuspended)return;
            this.unlockAudioContext();
            if (this.pendingPlayback && this.musicEnabled) {
                const pending = this.pendingPlayback;
                this.pendingPlayback = null;
                pending.audio.play().catch(() => { this.pendingPlayback = pending; });
            }
        };
        document.addEventListener('pointerdown', unlock, { passive: true });
        document.addEventListener('keydown', unlock);
        // Android Chrome/PWA can freeze media while backgrounded. Pause the two
        // bounded music elements and resume the exact prior layer when the page
        // returns; autoplay rejection falls back to the normal gesture unlock.
        document.addEventListener('visibilitychange', () => {
            if (this.isDocumentHidden()) { this.pausePageAudio(); return; }
            this.pageSuspended = false;
            this.processVoiceQueue();
            const prior = this.visibilityResume;
            this.visibilityResume = null;
            if (!this.musicEnabled || !prior) return;
            const audio = prior.overlay && this.battleActive ? this.overlayAudio : prior.world ? this.worldAudio : null;
            if (audio) audio.play().catch(() => { this.pendingPlayback = { audio, layer: audio === this.overlayAudio ? 'overlay' : 'world' }; });
        });
        window.addEventListener('pagehide',()=>this.pausePageAudio());
        window.addEventListener('pageshow',()=>{if(!this.isDocumentHidden()){this.pageSuspended=false;this.processVoiceQueue();}});
        this.bindSettingsUI();
        this.preloadSFX();
        this.syncSettingsUI();
        console.log('AudioManager initialized: bounded players, smart playlists, Web Audio SFX and device TTS.');
    }

    pausePageAudio() {
        if(this.pageSuspended)return;
        this.visibilityResume={world:Boolean(this.worldAudio&&!this.worldAudio.paused),overlay:Boolean(this.overlayAudio&&!this.overlayAudio.paused)};
        this.pageSuspended=true;++this.playbackSession;this.pendingPlayback=null;
        this.worldAudio?.pause();this.overlayAudio?.pause();this.stopVoice();this.stopSFX();
        this.audioCtx?.suspend?.().catch(()=>{});
    }

    stopSFX({ includeLoops = true } = {}) {
        for (const cancel of [...this.activeSFXCancels]) { try { cancel(); } catch {} }
        this.activeSFXCancels.clear();
        // Pending sound-only events must not play later after audio is re-enabled.
        this.speechQueue = this.speechQueue.filter(item => {
            if (item.text) return true;
            item.cancelled = true; item.resolve(false); return false;
        });
        for(const node of this.activeSFX){try{node.stop();node.disconnect();}catch{}}this.activeSFX.clear();
        for(const audio of this.sfxFallbackPool){audio.pause();audio.currentTime=0;audio.dataset.busy='false';}
        if (includeLoops) for (const id of [...this.activeSFXLoops.keys()]) this.stopSFXLoop(id);
    }

    trackSFX(node){this.activeSFX.add(node);node.addEventListener?.('ended',()=>{this.activeSFX.delete(node);try{node.disconnect();}catch{}},{once:true});return node;}

    bindSettingsUI() {
        const bindCheck = (id, key, onChange) => {
            const element = document.getElementById(id);
            if (!element || element.dataset.audioBound) return;
            element.dataset.audioBound = 'true';
            element.addEventListener('change', () => {
                this.settings[key] = element.checked;
                onChange?.(element.checked);
                this.persistSettings();
            });
        };
        const bindRange = (id, key, setter) => {
            const element = document.getElementById(id);
            if (!element || element.dataset.audioBound) return;
            element.dataset.audioBound = 'true';
            element.addEventListener('input', () => {
                const value = this.clamp(Number(element.value) / 100);
                this.settings[key] = value;
                setter.call(this, value, false);
                const output = document.getElementById(`${id}-value`);
                if (output) output.textContent = `${Math.round(value * 100)}%`;
                this.persistSettings();
            });
        };
        bindCheck('setting-music-enabled', 'musicEnabled', enabled => enabled ? this.resumeWorldMusic() : this.stopMusic());
        bindRange('setting-music-volume', 'musicVolume', this.setMusicVolume);
        bindCheck('setting-sfx-enabled', 'sfxEnabled', enabled => this.setSFXEnabled(enabled, false));
        bindRange('setting-sfx-volume', 'sfxVolume', this.setSFXVolume);
        bindCheck('setting-voice-enabled', 'voiceEnabled', enabled => this.setVoiceEnabled(enabled, false));
        bindRange('setting-voice-volume', 'voiceVolume', this.setVoiceVolume);
        bindCheck('setting-music-shuffle', 'shuffle', () => this.playlistState.clear());
    }

    syncSettingsUI() {
        const checks = {
            'setting-music-enabled': this.musicEnabled,
            'setting-sfx-enabled': this.sfxEnabled,
            'setting-voice-enabled': this.voiceEnabled,
            'setting-music-shuffle': this.settings.shuffle
        };
        for (const [id, checked] of Object.entries(checks)) {
            const element = document.getElementById(id);
            if (element) element.checked = checked;
        }
        const ranges = {
            'setting-music-volume': this.volume,
            'setting-sfx-volume': this.sfxVolume,
            'setting-voice-volume': this.voiceVolume
        };
        for (const [id, value] of Object.entries(ranges)) {
            const element = document.getElementById(id);
            if (element) element.value = String(Math.round(value * 100));
            const output = document.getElementById(`${id}-value`);
            if (output) output.textContent = `${Math.round(value * 100)}%`;
        }
        for (const [id, enabled] of [['btn-music', this.musicEnabled], ['btn-sfx', this.sfxEnabled], ['btn-hud-music', this.musicEnabled]]) {
            const button = document.getElementById(id);
            if (button) {
                button.classList.toggle('active', enabled);
                button.setAttribute('aria-pressed', String(enabled));
            }
        }
    }

    normalizeContext(context) {
        if (Array.isArray(context)) {
            for (const candidate of context) {
                const normalized = this.normalizeContext(candidate);
                if (this.playlists[normalized]) return normalized;
            }
            return 'EXPLORATION';
        }
        if (context && typeof context === 'object') {
            return this.normalizeContext(context.musicContext || context.musicContexts || context.music || context.locationType);
        }
        const raw = String(context || 'EXPLORATION').trim();
        const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
        if (this.playlists[upper]) return upper;
        return this.contextAliases[raw.toLowerCase().replace(/[\s-]+/g, '_')] || 'EXPLORATION';
    }

    selectContextPlaylist(context, { force = false } = {}) {
        this.init();
        const normalized = this.normalizeContext(context);
        if (normalized.startsWith('BATTLE_')) return this.beginBattle(normalized);
        if (!this.musicEnabled) {
            this.worldContext = normalized;
            return normalized;
        }
        if (!force && this.worldContext === normalized && this.worldAudio && !this.worldAudio.paused) return normalized;
        this.worldContext = normalized;
        this.currentContext = normalized;
        this.directTrack = false;
        if (!this.battleActive && !this.overlayMode) {
            this.audioState = 'transition';
            this.transitionWorldPlaylist(normalized);
        }
        return normalized;
    }

    async transitionWorldPlaylist(context) {
        const session = ++this.playbackSession;
        if (this.worldAudio && !this.worldAudio.paused && this.worldAudio.src) {
            this.playSFX('music-transition');
            await this.fadeOut(this.worldAudio, 500, { pause: true, clear: false });
        }
        if (session !== this.playbackSession || this.battleActive || !this.musicEnabled) return;
        const trackKey = this.nextTrack(context);
        if (trackKey) await this.startMusicLayer('world', trackKey, { fadeMs: 600 });
    }

    play(context) {
        const normalized = this.normalizeContext(context);
        if (normalized.startsWith('BATTLE_')) return this.beginBattle(normalized);
        if (this.battleActive || this.overlayMode === 'battle') return this.endBattle({ worldContext: normalized });
        return this.selectContextPlaylist(normalized);
    }

    resolveTrack(context) {
        const normalized = this.normalizeContext(context);
        const pool = this.playlists[normalized] || this.playlists.EXPLORATION;
        return pool[0];
    }

    playMusic(context) { return this.play(context); }

    playTrack(trackKey, forceRestart = false) {
        this.init();
        if (!this.musicEnabled || !this.music[trackKey]) return;
        if (!forceRestart && this.currentKey === trackKey && this.currentTrack && !this.currentTrack.paused) return;
        this.worldContext = 'DIRECT';
        this.currentContext = 'DIRECT';
        this.directTrack = true;
        ++this.playbackSession;
        return this.startMusicLayer('world', trackKey, { fadeMs: 350, forceRestart });
    }

    async startMusicLayer(layer, trackKey, { fadeMs = 450, forceRestart = false } = {}) {
        if (this.pageSuspended || this.isDocumentHidden() || !this.musicEnabled || !this.music[trackKey]) return false;
        const audio = layer === 'overlay' ? this.overlayAudio : this.worldAudio;
        const config = this.music[trackKey];
        if (!audio) return false;
        if (forceRestart || audio.dataset.trackKey !== trackKey) {
            audio.pause();
            audio.src = config.src;
            audio.dataset.trackKey = trackKey;
            audio.currentTime = 0;
            audio.load();
        }
        // Exploration music is stable: it loops until the world context changes.
        // Battle/special overlays end naturally so their smart-shuffled playlist
        // can advance without ever layering a second engine.
        audio.loop = layer === 'world' && !this.directTrack && this.worldContext !== 'DIRECT';
        audio.volume = 0;
        this.currentTrack = audio;
        this.currentKey = trackKey;
        try {
            await audio.play();
            if(this.pageSuspended||this.isDocumentHidden()){audio.pause();return false;}
            this.pendingPlayback = null;
            await this.fadeIn(audio, fadeMs);
            if (layer === 'world') this.audioState = 'world';
            else if (this.overlayMode === 'battle') this.audioState = 'battle';
            return true;
        } catch (error) {
            if (error?.name !== 'AbortError') this.pendingPlayback = { audio, trackKey, layer };
            return false;
        }
    }

    async beginBattle(requestedContext = 'BATTLE_NORMAL') {
        this.init();
        this.audioState = 'transition';
        if (!this.musicEnabled) {
            this.battleActive = true;
            this.overlayContext = this.battleContextFromGame(requestedContext);
            this.audioState = 'battle';
            return;
        }
        const context = this.battleContextFromGame(requestedContext);
        if (this.battleActive && this.overlayContext === context && !this.overlayAudio.paused) return;
        this.battleActive = true;
        this.overlayMode = 'battle';
        this.overlayContext = context;
        const session = ++this.playbackSession;
        if (this.worldAudio && !this.worldAudio.paused) {
            await this.fadeTo(this.worldAudio, Math.max(0.02, this.effectiveMusicVolume() * 0.12), 450);
            if (session === this.playbackSession) this.worldAudio.pause();
        }
        if (session !== this.playbackSession || !this.battleActive) return;
        const trackKey = this.nextTrack(context);
        if (trackKey) await this.startMusicLayer('overlay', trackKey, { fadeMs: 400 });
    }

    battleContextFromGame(requested) {
        const enemy = window.Game?.state?.enemy;
        if (enemy?.finalBoss) return 'BATTLE_FINAL_BOSS';
        if (enemy?.boss) return 'BATTLE_BOSS';
        const normalized = this.normalizeContext(requested);
        return normalized.startsWith('BATTLE_') ? normalized : 'BATTLE_NORMAL';
    }

    async endBattle({ victory = false, worldContext } = {}) {
        this.init();
        if (worldContext) this.worldContext = this.normalizeContext(worldContext);
        const hadBattle = this.battleActive || this.overlayMode === 'battle';
        this.battleActive = false;
        ++this.playbackSession;
        if (this.overlayAudio && !this.overlayAudio.paused) await this.fadeOut(this.overlayAudio, 350, { pause: true, clear: false });

        if (victory && this.musicEnabled) {
            this.audioState = 'victory';
            this.overlayMode = 'special';
            this.overlayContext = 'BATTLE_VICTORY';
            const trackKey = this.nextTrack('BATTLE_VICTORY');
            if (trackKey) {
                await this.startMusicLayer('overlay', trackKey, { fadeMs: 180, forceRestart: true });
                await new Promise(resolve => {
                    const timer = setTimeout(resolve, 6500);
                    this.specialResolver = () => { clearTimeout(timer); resolve(); };
                });
                this.specialResolver = null;
                await this.fadeOut(this.overlayAudio, 250, { pause: true, clear: true });
            }
        }
        this.overlayMode = null;
        this.overlayContext = null;
        this.audioState = 'restore';
        if (this.musicEnabled && (hadBattle || worldContext)) await this.resumeWorldMusic();
        else this.audioState = this.musicEnabled ? 'world' : 'idle';
    }

    async resumeWorldMusic() {
        if(this.pageSuspended||this.isDocumentHidden())return;
        if (!this.musicEnabled) { this.audioState = 'idle'; return; }
        this.init();
        this.audioState = 'restore';
        const context = this.worldContext && this.worldContext !== 'DIRECT' ? this.worldContext : this.normalizeContext(window.Game?.getLocationMusic?.() || 'CITY');
        this.worldContext = context;
        if (!this.worldAudio.dataset.trackKey || !this.music[this.worldAudio.dataset.trackKey]) {
            const next = this.nextTrack(context);
            if (next) return this.startMusicLayer('world', next, { fadeMs: 550 });
            return;
        }
        this.currentTrack = this.worldAudio;
        this.currentKey = this.worldAudio.dataset.trackKey;
        try {
            await this.worldAudio.play();
            if(this.pageSuspended||this.isDocumentHidden()){this.worldAudio.pause();return;}
            await this.fadeIn(this.worldAudio, 550);
            this.audioState = 'world';
        } catch { this.pendingPlayback = { audio: this.worldAudio, layer: 'world' }; }
    }

    async playSpecial(context, { resume = 'world', maximumMs = 6500 } = {}) {
        this.init();
        const normalized = this.normalizeContext(context);
        if (!normalized.startsWith('SPECIAL_') && normalized !== 'BATTLE_VICTORY') return false;
        if (!this.musicEnabled) return false;
        const priorBattle = this.battleActive;
        if (this.worldAudio && !this.worldAudio.paused) await this.fadeOut(this.worldAudio, 300, { pause: true, clear: false });
        if (this.overlayAudio && !this.overlayAudio.paused) await this.fadeOut(this.overlayAudio, 250, { pause: true, clear: false });
        this.overlayMode = 'special';
        this.overlayContext = normalized;
        const track = this.nextTrack(normalized);
        if (!track) return false;
        await this.startMusicLayer('overlay', track, { fadeMs: 180, forceRestart: true });
        await new Promise(resolve => {
            const timer = setTimeout(resolve, maximumMs);
            this.specialResolver = () => { clearTimeout(timer); resolve(); };
        });
        this.specialResolver = null;
        await this.fadeOut(this.overlayAudio, 250, { pause: true, clear: true });
        this.overlayMode = priorBattle && resume === 'battle' ? 'battle' : null;
        if (priorBattle && resume === 'battle') return this.beginBattle(this.overlayContext || 'BATTLE_NORMAL');
        if (resume === 'world') await this.resumeWorldMusic();
        return true;
    }

    handleTrackEnded(layer) {
        if (layer === 'overlay') {
            if (this.overlayMode === 'special') {
                this.specialResolver?.();
                return;
            }
            if (this.overlayMode === 'battle' && this.battleActive && this.musicEnabled) {
                const next = this.nextTrack(this.overlayContext || 'BATTLE_NORMAL');
                if (next) this.startMusicLayer('overlay', next, { fadeMs: 350 });
            }
            return;
        }
        if (this.directTrack || this.worldContext === 'DIRECT') {
            this.currentTrack = null;
            this.currentKey = null;
            return;
        }
        if (!this.battleActive && this.musicEnabled && this.worldContext) {
            const next = this.nextTrack(this.worldContext);
            if (next) this.startMusicLayer('world', next, { fadeMs: 500 });
        }
    }

    handleMusicError(audio) {
        const failed = audio.dataset.trackKey;
        if (failed) this.rememberHistory(`failed:${failed}`);
        if (audio === this.overlayAudio && this.overlayMode === 'special') this.specialResolver?.();
        else this.handleTrackEnded(audio === this.overlayAudio ? 'overlay' : 'world');
    }

    nextTrack(context = this.currentContext || this.worldContext || 'EXPLORATION') {
        const normalized = this.normalizeContext(context);
        const pool = [...new Set((this.playlists[normalized] || []).filter(key => this.music[key]))];
        if (!pool.length) return null;
        let state = this.playlistState.get(normalized);
        if (!state) state = { queue: [], history: [], index: 0 };
        if (!this.settings.shuffle) {
            let selected = pool[state.index % pool.length];
            state.index = (state.index + 1) % pool.length;
            if (selected === state.history.at(-1) && pool.length > 1) {
                selected = pool[state.index % pool.length];
                state.index = (state.index + 1) % pool.length;
            }
            state.history.push(selected);
            state.history = state.history.slice(-Math.min(6, pool.length));
            this.playlistState.set(normalized, state);
            this.rememberHistory(selected);
            return selected;
        }
        if (!state.queue.length) {
            state.queue = this.shuffle(pool);
            const last = state.history.at(-1) || this.globalHistory.at(-1);
            if (state.queue.length > 1 && state.queue[0] === last) {
                const swap = 1 + Math.floor(Math.random() * (state.queue.length - 1));
                [state.queue[0], state.queue[swap]] = [state.queue[swap], state.queue[0]];
            }
        }
        let selected = state.queue.shift();
        if (pool.length > 1 && selected === state.history.at(-1)) {
            const alternative = state.queue.findIndex(key => key !== selected);
            if (alternative >= 0) {
                state.queue.push(selected);
                selected = state.queue.splice(alternative, 1)[0];
            }
        }
        state.history.push(selected);
        state.history = state.history.slice(-Math.min(6, pool.length));
        this.playlistState.set(normalized, state);
        this.rememberHistory(selected);
        return selected;
    }

    shuffle(items) {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const swap = Math.floor(Math.random() * (index + 1));
            [result[index], result[swap]] = [result[swap], result[index]];
        }
        return result;
    }

    rememberHistory(trackKey) {
        this.globalHistory.push(trackKey);
        this.globalHistory = this.globalHistory.slice(-12);
    }

    effectiveMusicVolume() {
        if (!this.musicEnabled) return 0;
        let multiplier = 1;
        for (const value of this.duckRequests.values()) multiplier = Math.min(multiplier, value);
        return this.volume * multiplier;
    }

    fadeTo(audio, target, duration = 500) {
        if (!audio) return Promise.resolve();
        const safeTarget = this.clamp(target);
        const token = Symbol('fade');
        this.fadeTokens.set(audio, token);
        const start = Number(audio.volume) || 0;
        const startedAt = performance.now();
        return new Promise(resolve => {
            const tick = now => {
                if (this.fadeTokens.get(audio) !== token) return resolve();
                const progress = duration <= 0 ? 1 : Math.min(1, (now - startedAt) / duration);
                audio.volume = this.clamp(start + (safeTarget - start) * progress);
                if (progress >= 1) return resolve();
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    fadeIn(audio = this.currentTrack, duration = 500) { return this.fadeTo(audio, this.effectiveMusicVolume(), duration); }

    async fadeOut(audio = this.currentTrack, duration = 500, { pause = true, clear = false } = {}) {
        if (!audio) return;
        await this.fadeTo(audio, 0, duration);
        if (pause) audio.pause();
        if (clear) {
            audio.removeAttribute('src');
            audio.load();
            delete audio.dataset.trackKey;
        }
    }

    duckMusic(amount = 0.25, reason = 'general') {
        this.duckRequests.set(reason, this.clamp(amount));
        const target = this.effectiveMusicVolume();
        for (const audio of [this.worldAudio, this.overlayAudio]) {
            if (audio && !audio.paused) this.fadeTo(audio, target, 260);
        }
    }

    restoreMusic(reason = 'general') {
        this.duckRequests.delete(reason);
        const target = this.effectiveMusicVolume();
        for (const audio of [this.worldAudio, this.overlayAudio]) {
            if (audio && !audio.paused) this.fadeTo(audio, target, 420);
        }
    }

    setMusicVolume(value, persist = true) {
        this.volume = value;
        const target = this.effectiveMusicVolume();
        for (const audio of [this.worldAudio, this.overlayAudio]) if (audio && !audio.paused) this.fadeTo(audio, target, 120);
        if (persist) this.persistSettings();
    }

    setSFXVolume(value, persist = true) {
        this.sfxVolume = value;
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
        for (const loop of this.activeSFXLoops.values()) loop.audio.volume = this.sfxVolume * loop.level;
        if (persist) this.persistSettings();
    }

    setVoiceVolume(value, persist = true) {
        this.voiceVolume = value;
        if (persist) this.persistSettings();
    }

    setMusicEnabled(value, persist = true) {
        this.musicEnabled = Boolean(value);
        if (this.musicEnabled) this.resumeWorldMusic(); else this.stopMusic();
        if (persist) this.persistSettings();
        return this.musicEnabled;
    }

    setSFXEnabled(value, persist = true) {
        this.sfxEnabled = Boolean(value);
        if(!this.sfxEnabled)this.stopSFX();
        window.dispatchEvent(new CustomEvent('black-sword-sfx-change', { detail: { enabled: this.sfxEnabled } }));
        if (persist) this.persistSettings();
        return this.sfxEnabled;
    }

    setVoiceEnabled(value, persist = true) {
        this.voiceEnabled = Boolean(value);
        if (!this.voiceEnabled) this.disableVoicePlayback();
        if (persist) this.persistSettings();
        return this.voiceEnabled;
    }

    /** Narration OFF is independent from recorded effects and continuous loops. */
    disableVoicePlayback() {
        clearTimeout(this.voiceWatchdog);
        this.voicePaused = false;
        this.speechQueue = this.speechQueue.filter(item => {
            if (!item.text) return true;
            if (item.effects.length && this.sfxEnabled) { item.text = ''; return true; }
            item.cancelled = true; item.resolve(false); return false;
        });
        const active = this.currentSpeechItem;
        if (active?.text) {
            // Let the existing event continuation release its matching effects;
            // narration-only events settle immediately without playing them.
            active.text = '';
            active.cancelSpeech?.();
        }
        this.activeSpeechCancel = null;
        if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch {} }
        this.currentUtterance = null;
        this.speaking = false;
        this.restoreMusic('voice');
        this.processVoiceQueue();
    }

    toggle() {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled) this.resumeWorldMusic(); else this.stopMusic();
        this.persistSettings();
        return this.musicEnabled;
    }

    toggleSFX() {
        this.sfxEnabled = !this.sfxEnabled;
        if(!this.sfxEnabled)this.stopSFX();
        window.dispatchEvent(new CustomEvent('black-sword-sfx-change', { detail: { enabled: this.sfxEnabled } }));
        this.persistSettings();
        return this.sfxEnabled;
    }

    toggleVoice() {
        return this.setVoiceEnabled(!this.voiceEnabled);
    }

    stopMusic() {
        this.init();
        ++this.playbackSession;
        this.pendingPlayback = null;
        for (const audio of [this.worldAudio, this.overlayAudio]) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            delete audio.dataset.trackKey;
        }
        this.currentTrack = null;
        this.currentKey = null;
        this.overlayMode = null;
        this.battleActive = false;
    }

    stop() { return this.stopMusic(); }

    ensureAudioContext() {
        if (this.audioCtx) return this.audioCtx;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        try {
            this.audioCtx = new AudioContextClass();
            this.sfxGain = this.audioCtx.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.audioCtx.destination);
        } catch {
            this.audioCtx = null;
            this.sfxGain = null;
        }
        return this.audioCtx;
    }

    unlockAudioContext() {
        const context = this.ensureAudioContext();
        if (context?.state === 'suspended') context.resume().catch(() => {});
        return context;
    }

    loadSFXBuffer(src) {
        const cached = this.sfxBuffers[src];
        if (cached && cached !== 'loading' && cached !== 'failed') return Promise.resolve(cached);
        if (this.sfxDecodePromises[src]) return this.sfxDecodePromises[src];
        const context = this.ensureAudioContext();
        if (!context) return Promise.resolve(null);
        this.sfxBuffers[src] = 'loading';
        const promise = fetch(src)
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
            .then(bytes => context.decodeAudioData(bytes))
            .then(buffer => { this.sfxBuffers[src] = buffer; return buffer; })
            .catch(() => { this.sfxBuffers[src] = 'failed'; return null; })
            .finally(() => { delete this.sfxDecodePromises[src]; });
        this.sfxDecodePromises[src] = promise;
        return promise;
    }

    preloadSFX() {
        // Small, frequently used effects first. Remaining effects decode lazily.
        const frequent = ['attack', 'hit', 'enemy-hit', 'explore', 'magic', 'heal', 'pickup', 'victory', 'miss'];
        for (const src of new Set(frequent.flatMap(key => this.sfx[key] || []))) this.loadSFXBuffer(src);
    }

    startSFXLoop(id, type, { volume = 1, playbackRate = 1 } = {}) {
        if (!id || !this.sfxEnabled || this.pageSuspended || this.isDocumentHidden()) return null;
        this.init();
        const existing = this.activeSFXLoops.get(id);
        if (existing) { existing.setVolume(volume); existing.setPlaybackRate(playbackRate); return existing; }
        const src = this.resolveSFX(type), audio = this.sfxLoopPool.find(player => player.dataset.busy !== 'true');
        if (!src || !audio) return null;
        const handle = {
            id, type, audio, level: Math.max(0, Math.min(1, Number(volume) || 0)),
            setVolume(value) { this.level = Math.max(0, Math.min(1, Number(value) || 0)); this.audio.volume = AudioManager.sfxVolume * this.level; },
            setPlaybackRate(value) { this.audio.playbackRate = Math.max(0.5, Math.min(2, Number(value) || 1)); },
            stop: () => this.stopSFXLoop(id)
        };
        audio.dataset.busy = 'true'; audio.dataset.loopId = id; audio.loop = true;
        audio.src = src; audio.currentTime = 0;
        handle.setVolume(volume); handle.setPlaybackRate(playbackRate);
        this.activeSFXLoops.set(id, handle);
        audio.play().catch(() => this.stopSFXLoop(id));
        return handle;
    }

    stopSFXLoop(id) {
        const handle = this.activeSFXLoops.get(id);
        if (!handle) return false;
        this.activeSFXLoops.delete(id);
        const { audio } = handle;
        try { audio.pause(); audio.currentTime = 0; audio.removeAttribute('src'); audio.load(); } catch {}
        audio.dataset.busy = 'false'; delete audio.dataset.loopId;
        return true;
    }

    cancelAudioChannel(channel) {
        if (!channel) return;
        this.legacySFXPending = this.legacySFXPending.filter(entry => entry.options.channel !== channel);
        this.speechQueue = this.speechQueue.filter(item => {
            if (item.channel !== channel) return true;
            item.cancelled = true; item.resolve(false); return false;
        });
        const active = this.currentSpeechItem;
        if (active?.channel === channel) {
            active.cancelled = true; active.cancelSpeech?.(); active.cancelEffect?.();
            if (active.text && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch {} }
        }
    }

    resolveSFX(type) {
        if (String(type || '').startsWith('assets/audio/')) return String(type);
        const choices = this.sfx[type];
        if (!choices?.length) return null;
        const viable = choices.filter(src => this.sfxBuffers[src] !== 'failed');
        const pool = viable.length ? viable : choices;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /**
     * Compatibility entry point for older gameplay modules. The effect is
     * flushed in a microtask so a narration emitted later in the same action
     * still enters the authoritative queue first. No second player is created.
     */
    playSFX(type, options = {}) {
        if (!this.sfxEnabled || this.pageSuspended || this.isDocumentHidden() || !this.resolveSFX(type)) return false;
        this.init();
        const now = Date.now();
        const choices = this.sfx[type];
        // Aliases such as button/click/chip share one recording and must not
        // double-fire when a button handler and the document click bubble both
        // report the same physical activation.
        const dedupKey = options.dedupKey || (choices?.length === 1 ? choices[0] : String(type));
        if (!options.allowDuplicate && now - (this.recentSFX.get(dedupKey) || 0) < 80) return false;
        this.recentSFX.set(dedupKey, now);
        if (this.recentSFX.size > 100) this.recentSFX.delete(this.recentSFX.keys().next().value);
        this.legacySFXPending.push({ type, options });
        if (!this.legacySFXFlushScheduled) {
            this.legacySFXFlushScheduled = true;
            queueMicrotask(() => {
                this.legacySFXFlushScheduled = false;
                const pending = this.legacySFXPending.splice(0);
                if (this.pageSuspended || this.isDocumentHidden()) return;
                for (const entry of pending) {
                    this.enqueueAudioEvent({ effects: [entry.type], priority: entry.options.priority || false, channel: entry.options.channel || '' });
                }
            });
        }
        return true;
    }

    /** Immediate low-level compatibility helper. New event code uses the queue. */
    playSFXSource(src) {
        if (!this.sfxEnabled || this.pageSuspended || this.isDocumentHidden() || !src) return false;
        this.init();
        const buffer = this.sfxBuffers[src];
        if (buffer && buffer !== 'loading' && buffer !== 'failed' && this.audioCtx) {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
            const node = this.trackSFX(this.audioCtx.createBufferSource());
            node.buffer = buffer;
            node.connect(this.sfxGain);
            node.start(0);
            return true;
        }
        if (buffer !== 'failed') this.loadSFXBuffer(src);
        // Never steal a busy element: doing so truncates the preceding effect.
        const effect = this.sfxFallbackPool.find(audio => audio.dataset.busy !== 'true');
        if (!effect) return false;
        effect.pause();
        effect.src = src;
        effect.volume = this.sfxVolume;
        effect.currentTime = 0;
        effect.dataset.busy = 'true';
        effect.play().catch(() => { effect.dataset.busy = 'false'; });
        return true;
    }

    /** Play one recording to its real ended event, with only a hung-engine watchdog. */
    async playSFXSourceAndWait(src, item = null) {
        if (!this.sfxEnabled || this.pageSuspended || this.isDocumentHidden() || item?.cancelled || !src) return false;
        this.init();
        this.duckMusic(0.3, 'sfx-wait');
        try {
            let buffer = this.sfxBuffers[src];
            if (!buffer || buffer === 'loading') buffer = await this.loadSFXBuffer(src);
            if (!this.sfxEnabled || this.pageSuspended || this.isDocumentHidden() || item?.cancelled) return false;
            if (buffer && buffer !== 'failed' && this.audioCtx) {
                if (this.audioCtx.state === 'suspended') await this.audioCtx.resume().catch(() => {});
                return await new Promise(resolve => {
                    let settled = false;
                    let watchdog = null;
                    let node = null;
                    const finish = success => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(watchdog);
                        this.activeSFXCancels.delete(cancel);
                        if (item?.cancelEffect === cancel) item.cancelEffect = null;
                        if (node) this.activeSFX.delete(node);
                        try { node?.disconnect(); } catch {}
                        resolve(success);
                    };
                    const cancel = () => { try { node?.stop(); } catch {} finish(false); };
                    try {
                        node = this.trackSFX(this.audioCtx.createBufferSource());
                        node.buffer = buffer;
                        node.connect(this.sfxGain);
                        node.addEventListener('ended', () => finish(true), { once: true });
                        this.activeSFXCancels.add(cancel);
                        if (item) item.cancelEffect = cancel;
                        // This is deliberately beyond the recording's full duration;
                        // it recovers a missing ended event without clipping normal audio.
                        watchdog = setTimeout(cancel, Math.max(5000, Math.ceil((Number(buffer.duration) || 0) * 1000) + 2000));
                        node.start(0);
                    } catch { finish(false); }
                });
            }

            // HTMLMediaElement fallback: wait for ended/error and never reuse a
            // busy pool member. The bounded pool remains four elements total.
            const effect = this.sfxFallbackPool.find(audio => audio.dataset.busy !== 'true');
            if (!effect) return false;
            return await new Promise(resolve => {
                let settled = false;
                let watchdog = null;
                const finish = success => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(watchdog);
                    effect.removeEventListener?.('ended', onEnded);
                    effect.removeEventListener?.('error', onError);
                    this.activeSFXCancels.delete(cancel);
                    if (item?.cancelEffect === cancel) item.cancelEffect = null;
                    effect.dataset.busy = 'false';
                    resolve(success);
                };
                const onEnded = () => finish(true);
                const onError = () => finish(false);
                const cancel = () => { try { effect.pause(); } catch {} finish(false); };
                try {
                    effect.pause();
                    effect.src = src;
                    effect.volume = this.sfxVolume;
                    effect.currentTime = 0;
                    effect.dataset.busy = 'true';
                    effect.addEventListener('ended', onEnded, { once: true });
                    effect.addEventListener('error', onError, { once: true });
                    this.activeSFXCancels.add(cancel);
                    if (item) item.cancelEffect = cancel;
                    const knownDuration = Number(effect.duration);
                    watchdog = setTimeout(cancel, Number.isFinite(knownDuration) && knownDuration > 0 ? Math.ceil(knownDuration * 1000) + 3000 : 30000);
                    const playing = effect.play();
                    if (playing?.catch) playing.catch(() => finish(false));
                } catch { finish(false); }
            });
        } finally {
            this.restoreMusic('sfx-wait');
        }
    }

    async playSFXNow(type, item = null) {
        const src = this.resolveSFX(type);
        return src ? this.playSFXSourceAndWait(src, item) : false;
    }

    /** Await the complete queued recording; maximumMs is retained for API compatibility, not clipping. */
    playSFXAndWait(type, maximumMs = 2200, options = {}) { // maximumMs is compatibility-only, never a clip timer
        if (!this.sfxEnabled || this.pageSuspended || this.isDocumentHidden() || !this.resolveSFX(type)) return Promise.resolve(false);
        this.init();
        return this.enqueueAudioEvent({ effects: [type], channel: options.channel || '', priority: options.priority || false });
    }

    /**
     * One bounded event queue for narration, matching effects and reactions.
     * Each item finishes speech before its first effect and each effect before
     * the next. Controls never await this queue unless their own logic chooses to.
     */
    enqueueAudioEvent({ text = '', effects = [], voiceId = 'system:default', language = 'en-US', priority = false, channel = '', eventId = '', requireVoice = false } = {}) {
        text = String(text || '').trim();
        effects = (Array.isArray(effects) ? effects : [effects]).filter(Boolean).map(String);
        if (this.pageSuspended || this.isDocumentHidden() || (!text && !effects.length)) return Promise.resolve(false);
        if (text && requireVoice && !this.voiceEnabled) return Promise.resolve(false);
        if (!text && !this.sfxEnabled) return Promise.resolve(false);
        if (text && this.voiceEnabled && (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance)) {
            this.voiceStatus('Speech engine unavailable. Use text controls or install a browser/device voice.');
            if (!effects.length || requireVoice) return Promise.resolve(false);
        }

        if (eventId && this.audioEventIds.has(eventId)) return Promise.resolve(false);
        const now = Date.now();
        const signature = eventId ? `id:${eventId}` : text ? `event:${text}|${effects.join(',')}` : '';
        const recent = signature ? this.recentAudioEvents.get(signature) : 0;
        if (signature && recent && now - recent < 600) return Promise.resolve(false);
        if (text) {
            if (this.recentVoice.has(text) && now - this.recentVoice.get(text) < 600 && !effects.length) return Promise.resolve(false);
            this.recentVoice.set(text, now);
            this.lastVoiceText = text;
            if (this.recentVoice.size > 100) this.recentVoice.delete(this.recentVoice.keys().next().value);
        }
        if (eventId) {
            this.audioEventIds.add(eventId);
            if (this.audioEventIds.size > 300) this.audioEventIds.delete(this.audioEventIds.values().next().value);
        }
        if (signature) {
            this.recentAudioEvents.set(signature, now);
            if (this.recentAudioEvents.size > 300) this.recentAudioEvents.delete(this.recentAudioEvents.keys().next().value);
        }

        const critical = priority === 'critical';
        if (critical) this.interruptVoiceForCritical();
        return new Promise(resolve => {
            if (channel) {
                this.speechQueue = this.speechQueue.filter(queued => {
                    if (queued.channel !== channel) return true;
                    queued.cancelled = true;
                    queued.resolve(false);
                    return false;
                });
            }
            const item = {
                id: ++this.audioEventSequence, channel, eventId, text: text.slice(0, 600), effects,
                voiceId, language, priority: critical ? 'critical' : priority ? 'high' : 'normal',
                resolve, cancelled: false, cancelSpeech: null, cancelEffect: null
            };
            while (this.speechQueue.length >= 12) {
                const ordinary = this.speechQueue.findIndex(queued => queued.priority === 'normal');
                if (ordinary < 0 && !priority) { resolve(false); return; }
                const dropped = this.speechQueue.splice(ordinary < 0 ? 0 : ordinary, 1)[0];
                dropped.cancelled = true;
                dropped.resolve(false);
            }
            if (priority) {
                const at = this.speechQueue.findIndex(queued => queued.priority === 'normal');
                this.speechQueue.splice(at < 0 ? this.speechQueue.length : at, 0, item);
            } else this.speechQueue.push(item);
            this.processVoiceQueue();
        });
    }

    playVoice(text, options = {}) {
        if (this.pageSuspended || this.isDocumentHidden() || !this.voiceEnabled || !String(text || '').trim()) return Promise.resolve(false);
        return this.enqueueAudioEvent({ ...options, text, effects: [], requireVoice: true });
    }

    playAction(text, effects = [], options = {}) {
        const reaction = options.reaction ? (Array.isArray(options.reaction) ? options.reaction : [options.reaction]) : [];
        const allEffects = [...(Array.isArray(effects) ? effects : [effects]), ...reaction].filter(Boolean);
        // With no effect this retains playVoice's absolute OFF behaviour. With
        // an effect, disabled/unavailable speech is skipped and sound continues.
        return this.enqueueAudioEvent({ ...options, text, effects: allEffects, requireVoice: !allEffects.length });
    }

    speakCritical(text, options = {}) {
        return this.playVoice(text, { ...options, priority: 'critical' });
    }

    interruptVoiceForCritical() {
        this.stopVoice();
    }

    async processVoiceQueue() {
        if (this.voiceProcessing || this.voicePaused || this.pageSuspended || this.isDocumentHidden() || !this.speechQueue.length) return;
        const item = this.speechQueue.shift();
        if (!item || item.cancelled) { if (this.speechQueue.length) queueMicrotask(() => this.processVoiceQueue()); return; }
        this.voiceProcessing = true;
        this.currentSpeechItem = item;
        item.queueGeneration = this.audioQueueGeneration;
        let success = true;
        try {
            if (item.text && this.voiceEnabled && !item.cancelled) success = await this.speakQueuedItem(item);
            // A real engine error resolves the speech stage and allows the
            // matching recording to recover. Cancellation/page hide skips it.
            if (!item.cancelled && this.sfxEnabled && !this.pageSuspended && !this.isDocumentHidden()) {
                for (const effect of item.effects) {
                    if (item.cancelled || !this.sfxEnabled || this.pageSuspended || this.isDocumentHidden()) break;
                    const played = await this.playSFXNow(effect, item);
                    if (!played && !item.cancelled) success = false;
                }
            }
        } catch {
            success = false;
        } finally {
            // Critical speech may cancel this item and start its replacement in
            // the same task. A stale continuation must never clear the new
            // utterance, watchdog or processing lock.
            const currentGeneration = item.queueGeneration === this.audioQueueGeneration;
            if (currentGeneration) {
                clearTimeout(this.voiceWatchdog);
                if (this.currentSpeechItem === item) this.currentSpeechItem = null;
                this.currentUtterance = null;
                this.speaking = false;
                this.voiceProcessing = false;
                this.restoreMusic('voice');
            }
            item.resolve(!item.cancelled && success);
            if (currentGeneration) setTimeout(() => this.processVoiceQueue(), 40);
        }
    }

    speakQueuedItem(item) {
        if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return Promise.resolve(false);
        return new Promise(resolve => {
            let settled = false;
            const utterance = new SpeechSynthesisUtterance(item.text);
            const finish = success => {
                if (settled) return;
                settled = true;
                clearTimeout(this.voiceWatchdog);
                this.activeSpeechCancel = null;
                item.cancelSpeech = null;
                if (this.currentUtterance === utterance) this.currentUtterance = null;
                this.speaking = false;
                resolve(success);
            };
            const cancel = () => finish(false);
            utterance.lang = item.language || 'en-US';
            utterance.volume = this.voiceVolume;
            utterance.rate = Math.max(0.5, Math.min(2, this.settings.voiceRate || 1));
            let voices = [];
            try { voices = speechSynthesis.getVoices() || []; } catch {}
            const requestedName = item.voiceId?.startsWith('system:') ? item.voiceId.slice(7) : '';
            const language = utterance.lang.toLowerCase();
            const exact = voices.filter(voice => voice.lang?.toLowerCase() === language);
            const base = voices.filter(voice => voice.lang?.toLowerCase().startsWith(language.slice(0, 2)));
            utterance.voice = (requestedName && requestedName !== 'default' ? voices.find(voice => voice.name === requestedName) : null) || exact[0] || base[0] || voices[0] || null;
            utterance.onstart = () => {
                if (this.currentSpeechItem !== item || item.cancelled) return;
                this.voiceStatus('Narrator speaking.');
                this.duckMusic(0.2, 'voice');
            };
            utterance.onend = () => finish(true);
            utterance.onerror = event => {
                if (this.currentSpeechItem !== item || item.cancelled) return;
                this.voiceStatus(`Speech failed: ${event.error || 'engine error'}. Tap Test narrator to retry; text controls remain available.`);
                finish(false);
            };
            this.speaking = true;
            this.currentUtterance = utterance;
            this.activeSpeechCancel = cancel;
            item.cancelSpeech = cancel;
            this.voiceWatchdog = setTimeout(() => {
                if (this.currentSpeechItem !== item || item.cancelled || this.voicePaused) return;
                this.voiceStatus('Speech engine did not finish. Narration stopped; matching action audio can continue.');
                try { speechSynthesis.cancel(); } catch {}
                finish(false);
            }, Math.max(20000, Math.ceil(item.text.length * 250 / utterance.rate)));
            try { speechSynthesis.speak(utterance); }
            catch {
                this.voiceStatus('Speech engine failed. Text controls remain available.');
                finish(false);
            }
        });
    }

    voiceStatus(text) {
        window.dispatchEvent(new CustomEvent('black-sword-speech-status', { detail: { text } }));
    }

    pauseVoice() {
        this.voicePaused = true;
        clearTimeout(this.voiceWatchdog);
        if ('speechSynthesis' in window) speechSynthesis.pause?.();
        this.voiceStatus('Narrator paused.');
    }

    resumeVoice() {
        this.voicePaused = false;
        if ('speechSynthesis' in window) speechSynthesis.resume?.();
        if (this.currentSpeechItem?.text && this.speaking) {
            clearTimeout(this.voiceWatchdog);
            this.voiceWatchdog = setTimeout(() => {
                this.voiceStatus('Speech engine did not resume. The event was cancelled; text controls remain available.');
                this.stopVoice();
            }, 90000);
        }
        this.processVoiceQueue();
    }

    repeatVoice() {
        const text = this.lastVoiceText;
        this.recentVoice.delete(text);
        for (const key of this.recentAudioEvents.keys()) if (key.includes(text)) this.recentAudioEvents.delete(key);
        return this.playVoice(text, { priority: 'critical' });
    }

    stopVoice() {
        ++this.audioQueueGeneration;
        clearTimeout(this.voiceWatchdog);
        this.voicePaused = false;
        this.legacySFXPending.splice(0);
        this.speechQueue.splice(0).forEach(item => { item.cancelled = true; item.resolve(false); });
        const active = this.currentSpeechItem;
        if (active) {
            active.cancelled = true;
            active.cancelSpeech?.();
            active.cancelEffect?.();
        }
        this.activeSpeechCancel?.();
        this.activeSpeechCancel = null;
        if ('speechSynthesis' in window) {
            try { speechSynthesis.cancel(); } catch {}
        }
        this.currentSpeechItem = null;
        this.voiceProcessing = false;
        this.speaking = false;
        this.currentUtterance = null;
        this.stopSFX({ includeLoops: false });
        this.restoreMusic('voice');
    }
}

const AudioManager = new AudioManagerController();
// Compatibility alias retained for all stabilized game modules.
const MusicSystem = AudioManager;
window.AudioManager = AudioManager;
window.MusicSystem = MusicSystem;
// Hidden developer diagnostic: no button, no automatic speech, no TalkBack
// assumptions. Run GAME_TTS_TEST.run() from developer tools when explicitly
// testing the game's own speech queue.
window.GAME_TTS_TEST = Object.freeze({
    snapshot: () => ({ supported: 'speechSynthesis' in window, enabled: AudioManager.voiceEnabled, speaking: AudioManager.speaking, queued: AudioManager.speechQueue.length, ducked: AudioManager.duckRequests.has('voice') }),
    run: () => {
        if (!AudioManager.voiceEnabled) {
            window.Game?.addNarrative?.('Application text to speech is off. Turn on "Device voice and TTS" in Settings to run this diagnostic.', 'system');
            return Promise.resolve(false);
        }
        return AudioManager.playVoice('Game text to speech diagnostic. First queued sentence.')
            .then(() => AudioManager.playVoice('Second queued sentence. The diagnostic is complete.'));
    }
});
console.log('AudioManager v7.22.2 loaded with licensed contextual playlists.');
