/**
 * The Black Sword Chronicles — licensed audio engine
 *
 * Music and effects are real CC0 recordings/tracks bundled under assets/audio.
 * The engine deliberately owns exactly ONE music Audio element. Every category
 * change invalidates the previous playback session, pauses it, removes its
 * source and only then starts the next track, preventing location-music overlap.
 *
 * ─── SFX SYNC ENGINE (v7.8.5) ────────────────────────────────────────────────
 * Sound effects NO LONGER use `new Audio(src)` per play. Each call used to
 * fetch + decode the file from scratch, so the browser's network/decode time
 * (200ms–1s+, worse on tablets) delayed the sound *after* the game animation —
 * the audible "SFX not syncing" bug.
 *
 * SFX now run through the Web Audio API:
 *   1. Every .wav/.ogg effect is fetched ONCE and decoded into an AudioBuffer
 *      (preload starts at init; buffers are cached forever).
 *   2. Playback = AudioBufferSourceNode.start(0) → sub-10ms latency, so the
 *      sound fires exactly on the game event (dice throw, footstep, hit...).
 *   3. playSFXAndWait() waits on the buffer's REAL duration instead of racing a
 *      blind setTimeout against a still-loading file, so animation pacing
 *      (board steps, card deals) stays locked to the audio.
 *   4. First-use-before-decode falls back to the old HTMLAudio path, and the
 *      AudioContext is created/resumed on the first user gesture to satisfy
 *      browser autoplay policies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MusicSystem = {
    currentTrack: null,
    currentKey: null,
    playbackSession: 0,
    musicEnabled: true,
    sfxEnabled: true,
    volume: 0.32,
    sfxVolume: 0.55,
    initialized: false,
    pendingKey: null,

    /** Web Audio state for the low-latency SFX path. */
    audioCtx: null,
    sfxGain: null,
    /** src -> AudioBuffer | 'loading' | 'failed' */
    sfxBuffers: {},
    /** src -> in-flight decode Promise (de-dupes concurrent loads) */
    sfxDecodePromises: {},

    music: {
        town: { src: 'assets/audio/music/town.mp3', loop: true, title: 'Town' },
        inn: { src: 'assets/audio/music/inn.mp3', loop: true, title: 'The Old Tower Inn' },
        exploration: { src: 'assets/audio/music/exploration.mp3', loop: true, title: 'Unexplored Expansion' },
        darkForest: { src: 'assets/audio/music/dark-forest.mp3', loop: true, title: 'Dark Forest Theme' },
        temple: { src: 'assets/audio/music/Fantasy-Choir-1.mp3', loop: true, title: 'Fantasy Choir I' },
        palace: { src: 'assets/audio/music/Fantasy-Choir-2.mp3', loop: true, title: 'Fantasy Choir II' },
        epicExplore: { src: 'assets/audio/music/Fantasy-Choir-3.mp3', loop: true, title: 'Fantasy Choir III' },
        intro: { src: 'assets/audio/music/adventure-intro.wav', loop: false, title: 'Adventure Intro' },
        dungeon: { src: 'assets/audio/music/dungeon.ogg', loop: true, title: 'Loopable Dungeon Ambience' },
        battle: { src: 'assets/audio/music/battle.ogg', loop: true, title: 'Battle RPG Theme Variation' },
        battleFast: { src: 'assets/audio/music/battle-fast.wav', loop: true, title: 'Fast Fight Battle Loop' },
        battleCinematic: { src: 'assets/audio/music/determined-pursuit.wav', loop: true, title: 'Determined Pursuit' },
        boss: { src: 'assets/audio/music/boss.mp3', loop: true, title: 'Battle RPG Theme' },
        victory: { src: 'assets/audio/music/victory.mp3', loop: false, title: 'Victory' }
    },

    sfx: {
        attack: ['assets/audio/sfx/attack.wav', 'assets/audio/sfx/attack-heavy.wav', 'assets/audio/sfx/attack-fast.wav'],
        hit: ['assets/audio/sfx/hit.wav', 'assets/audio/sfx/hit-metal-1.wav', 'assets/audio/sfx/hit-metal-2.wav'],
        'enemy-hit': ['assets/audio/sfx/monster-hit.wav', 'assets/audio/sfx/monster-roar.wav'],
        treasure: ['assets/audio/sfx/coin.wav'],
        coin: ['assets/audio/sfx/coin.wav'],
        levelup: ['assets/audio/sfx/levelup.wav'],
        magic: ['assets/audio/sfx/magic.wav', 'assets/audio/sfx/spell-cast.wav', 'assets/audio/sfx/spell-arcane.wav'],
        death: ['assets/audio/sfx/death.wav', 'assets/audio/sfx/monster-roar.wav'],
        victory: ['assets/audio/music/victory.mp3'],
        door: ['assets/audio/sfx/door.wav'],
        pickup: ['assets/audio/sfx/pickup.wav'],
        heal: ['assets/audio/sfx/heal.wav'],
        'heal-chain': ['assets/audio/sfx/heal-chain.wav'],
        explore: ['assets/audio/sfx/explore.wav','assets/audio/sfx/step-leaves-1.ogg','assets/audio/sfx/step-leaves-2.ogg','assets/audio/sfx/step-stone.ogg','assets/audio/sfx/step-wood.ogg','assets/audio/sfx/step-gravel.ogg','assets/audio/sfx/step-mud.ogg'],
        'board-dice':['assets/audio/sfx/board-dice.wav'],'board-piece':['assets/audio/sfx/board-piece.wav'],'card-shuffle':['assets/audio/sfx/card-shuffle.wav'],'card-draw':['assets/audio/sfx/card-draw.wav'],'board-turn':['assets/audio/sfx/board-turn.wav'],'board-error':['assets/audio/sfx/board-error.wav']
    },

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // Preload metadata without downloading every large track immediately.
        Object.values(this.music).forEach(track => {
            const audio = new Audio();
            audio.preload = 'metadata';
            audio.src = track.src;
        });

        // Kick off SFX decode immediately — fetching/decoding needs no gesture,
        // only playback does, so effects are ready the moment the player acts.
        this.preloadSFX();

        // Retry a track once the player interacts if the browser blocked autoplay,
        // and (re)activate the SFX context on that same gesture.
        const unlock = () => {
            this.unlockAudioContext();
            if (this.pendingKey && this.musicEnabled) {
                const key = this.pendingKey;
                this.pendingKey = null;
                this.playTrack(key, true);
            }
        };
        document.addEventListener('pointerdown', unlock, { passive: true });
        document.addEventListener('keydown', unlock);
        console.log('🎵 Licensed CC0 audio system initialized (Web Audio SFX engine).');
    },

    /* ── Web Audio SFX engine ─────────────────────────────────────────────── */

    /** Lazily create the AudioContext + master SFX gain node. */
    ensureAudioContext() {
        if (this.audioCtx) return this.audioCtx;
        const CtxClass = window.AudioContext || window.webkitAudioContext;
        if (!CtxClass) return null;
        try {
            this.audioCtx = new CtxClass();
            this.sfxGain = this.audioCtx.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.audioCtx.destination);
        } catch (error) {
            this.audioCtx = null;
            this.sfxGain = null;
        }
        return this.audioCtx;
    },

    /** Call from any user gesture: creates + resumes the context. */
    unlockAudioContext() {
        const ctx = this.ensureAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        return ctx;
    },

    /**
     * Fetch + decode one effect into the buffer cache. Decoding is idempotent
     * and concurrent calls share a single in-flight request.
     */
    loadSFXBuffer(src) {
        const cached = this.sfxBuffers[src];
        if (cached && cached !== 'loading' && cached !== 'failed') {
            return Promise.resolve(cached);
        }
        if (this.sfxDecodePromises[src]) return this.sfxDecodePromises[src];
        if (!this.ensureAudioContext()) return Promise.resolve(null);

        this.sfxBuffers[src] = 'loading';
        const promise = fetch(src)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.arrayBuffer();
            })
            .then(bytes => new Promise((resolve, reject) => {
                // Support both promise and callback forms of decodeAudioData.
                const decoded = this.audioCtx.decodeAudioData(bytes, resolve, reject);
                if (decoded && typeof decoded.then === 'function') {
                    decoded.then(resolve, reject);
                }
            }))
            .then(buffer => {
                this.sfxBuffers[src] = buffer;
                return buffer;
            })
            .catch(() => {
                this.sfxBuffers[src] = 'failed';
                return null;
            })
            .finally(() => {
                delete this.sfxDecodePromises[src];
            });
        this.sfxDecodePromises[src] = promise;
        return promise;
    },

    /** Decode every registered effect up-front. */
    preloadSFX() {
        const sources = [...new Set(Object.values(this.sfx).flat())];
        sources.forEach(src => this.loadSFXBuffer(src));
    },

    /**
     * Zero-latency play of a decoded buffer. Falls back to HTMLAudio on first
     * use (before its decode finishes) so a sound is never dropped.
     * Subtle pitch jitter keeps repeated hits from sounding robotic.
     */
    playSFXSource(src) {
        const buffer = this.sfxBuffers[src];
        if (buffer && buffer !== 'loading' && buffer !== 'failed' && this.audioCtx) {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
            const node = this.audioCtx.createBufferSource();
            node.buffer = buffer;
            node.playbackRate.value = 0.97 + Math.random() * 0.06;
            node.connect(this.sfxGain);
            node.start(0);
            return true;
        }
        // Not decoded yet: begin decoding now and use the legacy element so the
        // very first occurrence still produces sound (subsequent ones are instant).
        if (this.audioCtx && buffer !== 'failed') this.loadSFXBuffer(src);
        try {
            const effect = new Audio(src);
            effect.preload = 'auto';
            effect.volume = this.sfxVolume;
            const playResult = effect.play();
            if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
        } catch (error) { /* ignore */ }
        return false;
    },

    /* ── Music (unchanged streaming behaviour) ─────────────────────────────── */

    resolveTrack(locationType) {
        if (locationType === 'combat' || locationType === 'battle') return ['battle','battleFast','battleCinematic'][Math.floor(Math.random()*3)];
        if (locationType === 'epic-exploration') return 'epicExplore';
        const trackMap = {
            city: 'town',
            tavern: 'inn',
            inn: 'inn',
            'game-hall': 'inn',
            temple: 'temple',
            palace: 'palace',
            cemetery: 'darkForest',
            kaliwasch: 'town',
            forest: 'darkForest',
            wilderness: 'exploration',
            mountains: 'exploration',
            swamp: 'dungeon',
            ruins: 'dungeon',
            dungeon: 'dungeon',
            depths: 'boss',
            combat: 'battle',
            battle: 'battle',
            boss: 'boss',
            victory: 'victory'
        };
        return trackMap[locationType] || 'exploration';
    },

    play(locationType) {
        if (!this.musicEnabled) return;
        this.init();
        this.playTrack(this.resolveTrack(locationType));
    },

    playTrack(trackKey, forceRestart = false) {
        if (!this.musicEnabled || !this.music[trackKey]) return;

        // Repeated calls for the same location category keep the existing track.
        if (!forceRestart && this.currentKey === trackKey && this.currentTrack && !this.currentTrack.paused) {
            return;
        }

        this.stop();
        const session = this.playbackSession;
        const config = this.music[trackKey];
        const audio = new Audio(config.src);
        audio.loop = config.loop;
        audio.preload = 'auto';
        audio.volume = this.volume;
        audio.dataset.trackKey = trackKey;
        this.currentTrack = audio;
        this.currentKey = trackKey;

        audio.addEventListener('ended', () => {
            if (session === this.playbackSession && !config.loop) {
                this.currentTrack = null;
                this.currentKey = null;
            }
        }, { once: true });

        const promise = audio.play();
        if (promise) {
            promise.catch(error => {
                // AbortError is expected when a rapid location change stops a track.
                if (session !== this.playbackSession || error.name === 'AbortError') return;
                this.pendingKey = trackKey;
                console.warn(`Audio waiting for player interaction: ${config.title}`);
            });
        }
    },

    stop() {
        this.playbackSession += 1;
        this.pendingKey = null;
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack.removeAttribute('src');
            this.currentTrack.load();
            this.currentTrack = null;
        }
        this.currentKey = null;
    },

    toggle() {
        this.musicEnabled = !this.musicEnabled;
        if (!this.musicEnabled) {
            this.stop();
        } else {
            const locationType = window.Game?.getLocationMusic?.() || 'city';
            this.play(locationType);
        }
        return this.musicEnabled;
    },

    toggleSFX() {
        this.sfxEnabled = !this.sfxEnabled;
        return this.sfxEnabled;
    },

    setMusicVolume(value) {
        this.volume = Math.max(0, Math.min(1, Number(value)));
        if (this.currentTrack) this.currentTrack.volume = this.volume;
    },

    setSFXVolume(value) {
        this.sfxVolume = Math.max(0, Math.min(1, Number(value)));
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    },

    playSFX(type) {
        if (!this.sfxEnabled) return;
        this.init();
        const choices = this.sfx[type];
        if (!choices?.length) return;
        const src = choices[Math.floor(Math.random() * choices.length)];
        this.playSFXSource(src);
    },

    /**
     * Plays an effect and resolves when the effect has actually finished
     * (capped at maximumMs). With decoded buffers the wait follows the clip's
     * REAL duration, so board-game pacing (steps, deals, dice) stays in sync
     * with the sound instead of racing a half-downloaded file.
     * Music is ducked to 25% for the duration and always restored.
     */
    async playSFXAndWait(type, maximumMs = 2200) {
        if (!this.sfxEnabled) return Promise.resolve();
        this.init();
        const choices = this.sfx[type];
        if (!choices?.length) return Promise.resolve();
        const src = choices[Math.floor(Math.random() * choices.length)];

        const music = this.currentTrack;
        const originalVolume = music?.volume;
        if (music) music.volume = Math.max(0.03, (originalVolume ?? this.volume) * 0.25);
        const restore = () => {
            if (music && this.currentTrack === music && originalVolume !== undefined) {
                music.volume = originalVolume;
            }
        };

        // Preferred path: decoded buffer → precise duration, instant start.
        if (this.ensureAudioContext()) {
            let buffer = this.sfxBuffers[src];
            if (!buffer || buffer === 'loading' || buffer === 'failed') {
                buffer = await this.loadSFXBuffer(src);
            }
            if (buffer && buffer !== 'failed') {
                const waitMs = Math.min(buffer.duration * 1000, maximumMs);
                if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
                const node = this.audioCtx.createBufferSource();
                node.buffer = buffer;
                node.connect(this.sfxGain);
                node.start(0);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                restore();
                return Promise.resolve();
            }
        }

        // Fallback path: HTMLAudio element (Web Audio unavailable or decode failed).
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                restore();
                resolve();
            };
            const effect = new Audio(src);
            effect.preload = 'auto';
            effect.volume = this.sfxVolume;
            const timer = setTimeout(finish, maximumMs);
            effect.addEventListener('ended', finish, { once: true });
            effect.addEventListener('error', finish, { once: true });
            const playResult = effect.play();
            if (playResult && typeof playResult.catch === 'function') playResult.catch(finish);
        });
    }
};

window.MusicSystem = MusicSystem;
console.log('🎵 Real CC0 cinematic music and RPG sound effects loaded.');
