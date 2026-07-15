/**
 * The Black Sword Chronicles — licensed audio engine
 *
 * Music and effects are real CC0 recordings/tracks bundled under assets/audio.
 * The engine deliberately owns exactly ONE music Audio element. Every category
 * change invalidates the previous playback session, pauses it, removes its
 * source and only then starts the next track, preventing location-music overlap.
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

    music: {
        town: { src: 'assets/audio/music/town.mp3', loop: true, title: 'Town' },
        inn: { src: 'assets/audio/music/inn.mp3', loop: true, title: 'The Old Tower Inn' },
        exploration: { src: 'assets/audio/music/exploration.mp3', loop: true, title: 'Unexplored Expansion' },
        darkForest: { src: 'assets/audio/music/dark-forest.mp3', loop: true, title: 'Dark Forest Theme' },
        temple: { src: 'assets/audio/music/Fantasy-Choir-1.mp3', loop: true, title: 'Fantasy Choir I' },
        palace: { src: 'assets/audio/music/Fantasy-Choir-2.mp3', loop: true, title: 'Fantasy Choir II' },
        dungeon: { src: 'assets/audio/music/dungeon.ogg', loop: true, title: 'Loopable Dungeon Ambience' },
        battle: { src: 'assets/audio/music/battle.ogg', loop: true, title: 'Battle RPG Theme Variation' },
        battleFast: { src: 'assets/audio/music/battle-fast.wav', loop: true, title: 'Fast Fight Battle Loop' },
        boss: { src: 'assets/audio/music/boss.mp3', loop: true, title: 'Battle RPG Theme' },
        victory: { src: 'assets/audio/music/victory.mp3', loop: false, title: 'Victory' }
    },

    sfx: {
        attack: ['assets/audio/sfx/attack.wav', 'assets/audio/sfx/attack-heavy.wav', 'assets/audio/sfx/attack-fast.wav'],
        hit: ['assets/audio/sfx/hit.wav', 'assets/audio/sfx/hit-metal-1.wav', 'assets/audio/sfx/hit-metal-2.wav', 'assets/audio/sfx/monster-hit.wav'],
        treasure: ['assets/audio/sfx/coin.wav'],
        coin: ['assets/audio/sfx/coin.wav'],
        levelup: ['assets/audio/sfx/levelup.wav'],
        magic: ['assets/audio/sfx/magic.wav', 'assets/audio/sfx/spell-cast.wav', 'assets/audio/sfx/spell-arcane.wav'],
        death: ['assets/audio/sfx/death.wav', 'assets/audio/sfx/monster-roar.wav'],
        victory: ['assets/audio/music/victory.mp3'],
        door: ['assets/audio/sfx/door.wav'],
        pickup: ['assets/audio/sfx/pickup.wav'],
        heal: ['assets/audio/sfx/heal.wav'],
        explore: ['assets/audio/sfx/explore.wav']
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

        // Retry a track once the player interacts if the browser blocked autoplay.
        const unlock = () => {
            if (this.pendingKey && this.musicEnabled) {
                const key = this.pendingKey;
                this.pendingKey = null;
                this.playTrack(key, true);
            }
        };
        document.addEventListener('pointerdown', unlock, { passive: true });
        document.addEventListener('keydown', unlock);
        console.log('🎵 Licensed CC0 audio system initialized.');
    },

    resolveTrack(locationType) {
        if (locationType === 'combat' || locationType === 'battle') return Math.random() < 0.5 ? 'battle' : 'battleFast';
        const trackMap = {
            city: 'town',
            tavern: 'inn',
            inn: 'inn',
            temple: 'temple',
            palace: 'palace',
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

    playSFX(type) {
        if (!this.sfxEnabled) return;
        this.init();
        const choices = this.sfx[type];
        if (!choices?.length) return;
        const src = choices[Math.floor(Math.random() * choices.length)];
        const effect = new Audio(src);
        effect.preload = 'auto';
        effect.volume = this.sfxVolume;
        effect.play().catch(error => {
            if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                console.warn(`Could not play sound effect: ${type}`, error);
            }
        });
    }
};

window.MusicSystem = MusicSystem;
console.log('🎵 Real CC0 cinematic music and RPG sound effects loaded.');
