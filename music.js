/**
 * The Black Sword Chronicles - Ultimate Music System
 * Uses royalty-free music from Battle Explorer, Incompetech, Pixabay, etc.
 */

const MusicSystem = {
    audioContext: null,
    isPlaying: false,
    currentTrack: null,
    volume: 0.3,
    musicEnabled: true,
    sfxEnabled: true,
    
    // Audio elements for different music tracks
    tracks: {},
    
    init() {
        if (this.audioContext) return;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.loadTracks();
    },
    
    loadTracks() {
        // Royalty-free ambient music sources (direct audio URLs)
        // These are placeholder URLs - in production, use actual royalty-free tracks
        
        // Using procedural audio generation for reliable playback
        // In production, replace with actual royalty-free URLs from:
        // - battleexplorer.com
        // - incompetech.com
        // - pixabay.com/music
        // - freemusicarchive.org
        
        console.log('🎵 Music System Initialized');
        console.log('Royalty-free music sources: Battle Explorer, Incompetech, Pixabay, Free Music Archive');
    },
    
    toggle() {
        this.musicEnabled = !this.musicEnabled;
        if (!this.musicEnabled) {
            this.stop();
        }
        return this.musicEnabled;
    },
    
    toggleSFX() {
        this.sfxEnabled = !this.sfxEnabled;
        return this.sfxEnabled;
    },
    
    stop() {
        this.isPlaying = false;
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },
    
    // Play music for specific location/situation
    play(locationType) {
        if (!this.musicEnabled) return;
        
        this.init();
        
        const trackMap = {
            'city': 'tavern',
            'kaliwasch': 'tavern',
            'forest': 'forest',
            'mountains': 'wilderness',
            'swamp': 'dungeon',
            'ruins': 'dungeon',
            'dungeon': 'dungeon',
            'depths': 'boss',
            'combat': 'battle',
            'victory': 'victory',
            'boss': 'boss'
        };
        
        const track = trackMap[locationType] || 'tavern';
        this.playTrack(track);
    },
    
    playTrack(trackName) {
        this.stop();
        this.isPlaying = true;
        
        // Play procedural music based on track type
        this.playProcedural(trackName);
    },
    
    // Procedural music generation for reliable playback
    // Replace with actual royalty-free URLs in production
    playProcedural(trackType) {
        this.init();
        
        const configs = {
            'tavern': { tempo: 90, baseNote: 220, chordProgression: [[220, 277, 330], [196, 247, 294], [175, 220, 262]] },
            'forest': { tempo: 70, baseNote: 330, chordProgression: [[330, 392, 494], [294, 370, 440], [262, 330, 392]] },
            'wilderness': { tempo: 60, baseNote: 196, chordProgression: [[196, 247, 294], [175, 220, 262], [165, 208, 247]] },
            'dungeon': { tempo: 50, baseNote: 110, chordProgression: [[110, 138, 165], [98, 123, 147], [82, 110, 138]] },
            'battle': { tempo: 140, baseNote: 165, chordProgression: [[165, 196, 220], [147, 175, 196], [138, 165, 196]] },
            'victory': { tempo: 120, baseNote: 262, chordProgression: [[262, 330, 392], [294, 370, 440], [330, 392, 494], [523, 659, 784]] },
            'boss': { tempo: 100, baseNote: 147, chordProgression: [[147, 175, 220], [138, 165, 196], [110, 147, 196]] }
        };
        
        const config = configs[trackType] || configs.tavern;
        this.playAmbientLoop(config);
    },
    
    playAmbientLoop(config) {
        if (!this.isPlaying) return;
        
        let chordIndex = 0;
        const playChord = () => {
            if (!this.isPlaying) return;
            
            const chord = config.chordProgression[chordIndex];
            chord.forEach(freq => {
                this.playChord(freq, 1.5);
            });
            
            chordIndex = (chordIndex + 1) % config.chordProgression.length;
            
            // Schedule next chord
            const interval = (60 / config.tempo) * 2000;
            setTimeout(playChord, interval);
        };
        
        playChord();
    },
    
    playChord(frequency, duration) {
        if (!this.sfxEnabled) return;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.frequency.value = frequency;
        osc.type = 'sine';
        
        gain.gain.setValueAtTime(0.05, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
    },
    
    // Sound Effects
    playSFX(sfxType) {
        if (!this.sfxEnabled) return;
        
        this.init();
        
        const sfx = {
            'attack': () => this.playAttackSound(),
            'hit': () => this.playHitSound(),
            'treasure': () => this.playTreasureSound(),
            'levelup': () => this.playLevelUpSound(),
            'magic': () => this.playMagicSound(),
            'death': () => this.playDeathSound(),
            'victory': () => this.playVictorySound(),
            'door': () => this.playDoorSound(),
            'pickup': () => this.playPickupSound(),
            'heal': () => this.playHealSound(),
            'coin': () => this.playCoinSound(),
            'explore': () => this.playExploreSound()
        };
        
        if (sfx[sfxType]) {
            sfx[sfxType]();
        }
    },
    
    playAttackSound() {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, this.audioContext.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
    },
    
    playHitSound() {
        const noise = this.audioContext.createBufferSource();
        const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 0.1, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        
        gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        noise.start();
        noise.stop(this.audioContext.currentTime + 0.1);
    },
    
    playTreasureSound() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.3);
            }, i * 100);
        });
    },
    
    playLevelUpSound() {
        const notes = [392, 494, 587, 784, 988];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'triangle';
                gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.4);
            }, i * 150);
        });
    },
    
    playMagicSound() {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = 400 + Math.random() * 400;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.2);
            }, i * 50);
        }
    },
    
    playDeathSound() {
        const notes = [400, 350, 300, 250, 200];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.3);
            }, i * 150);
        });
    },
    
    playVictorySound() {
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'square';
                gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.5);
            }, i * 200);
        });
    },
    
    playDoorSound() {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.frequency.value = 100;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.5);
    },
    
    playPickupSound() {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.frequency.setValueAtTime(300, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.1);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.15);
    },
    
    playHealSound() {
        const notes = [440, 550, 660, 880];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                osc.start();
                osc.stop(this.audioContext.currentTime + 0.3);
            }, i * 100);
        });
    },
    
    playCoinSound() {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.frequency.value = 1200;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
    },
    
    playExploreSound() {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.frequency.value = 200;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.08, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.5);
    }
};

// Royalty-free music sources for reference:
// 1. Battle Explorer - https://battleexplorer.com/ (Game music)
// 2. Incompetech - https://incompetech.com/ (Kevin MacLeod)
// 3. Pixabay Music - https://pixabay.com/music/ (Free to use)
// 4. Free Music Archive - https://freemusicarchive.org/ (Various licenses)
// 5. OpenGameArt - https://opengameart.org/ (Game assets)

console.log('🎵 Music System loaded. Using procedural audio.');
console.log('For production, add royalty-free tracks from:');
console.log('- battleexplorer.com');
console.log('- incompetech.com');
console.log('- pixabay.com/music');
console.log('- freemusicarchive.org');
console.log('- opengameart.org');
