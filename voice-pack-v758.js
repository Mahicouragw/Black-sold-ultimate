/**
 * Unlimited on-device neural voices.
 *
 * Cloud voice services all have a free quota (Gemini's speech preview allows
 * only fifteen requests a day). This module removes the quota entirely: a small
 * open speech model (Kokoro-82M, Apache 2.0) is downloaded once into the
 * browser and then speaks every line on the phone, offline, with no key and no
 * limit.
 *
 * Nothing loads until the player asks for it (`voice pack`), because the first
 * download is about ninety megabytes. Until then — or if the download fails —
 * the game keeps using the cloud voice and then the device voice, exactly as
 * before.
 */
(function () {
    const PREF = 'bsu.voicePack';
    const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
    const SOURCES = [
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
        'https://esm.sh/kokoro-js@1.2.1'
    ];

    // One distinct on-device speaker for every game voice, so the cast stays as
    // varied as it is with the cloud service.
    const SPEAKERS = {
        Kore: 'af_heart',
        Puck: 'am_puck',
        Charon: 'am_onyx',
        Fenrir: 'am_fenrir',
        Aoede: 'af_aoede',
        Leda: 'af_bella',
        Orus: 'am_echo',
        Zephyr: 'af_sky',
        Callirrhoe: 'bf_isabella',
        Autonoe: 'af_nicole',
        Enceladus: 'bm_george',
        Iapetus: 'am_liam',
        Umbriel: 'bf_emma',
        Despina: 'af_sarah',
        Erinome: 'af_nova',
        Algieba: 'bf_lily'
    };

    const ranking = Object.keys(SPEAKERS);
    const hashOf = text => {
        let hash = 2166136261;
        for (let index = 0; index < String(text).length; index += 1) {
            hash ^= String(text).charCodeAt(index);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return hash;
    };

    const preference = {
        read() {
            try { return window.localStorage.getItem(PREF) === 'on'; } catch { return false; }
        },
        write(value) {
            try {
                if (value) window.localStorage.setItem(PREF, 'on');
                else window.localStorage.removeItem(PREF);
            } catch { /* private mode: the pack still works for this visit */ }
        }
    };

    const pack = {
        model: MODEL,
        state: 'off',              // off | loading | ready | failed
        error: '',
        progress: 0,
        lastLine: false,
        /** Replaceable so the tests never touch the network. */
        loader: url => import(url),

        voiceFor(name) {
            const match = SPEAKERS[ranking[hashOf(name) % ranking.length]];
            return match || 'af_heart';
        },

        get ready() {
            return this.state === 'ready' && Boolean(this.engine);
        },

        /** Is the player using this instead of the cloud voice? */
        get wanted() {
            return preference.read();
        },

        /** Load the model. Safe to call twice. */
        async load() {
            if (this.ready) return true;
            if (this.state === 'loading') return this.pending;
            this.state = 'loading';
            this.error = '';
            this.progress = 0;
            this.pending = (async () => {
                for (const url of SOURCES) {
                    try {
                        const module = await this.loader(url);
                        const Kokoro = module?.KokoroTTS || module?.default?.KokoroTTS;
                        if (!Kokoro?.from_pretrained) throw new Error('the voice engine did not load');
                        this.engine = await Kokoro.from_pretrained(MODEL, {
                            dtype: 'q8',
                            device: 'wasm',
                            progress_callback: event => {
                                const done = Number(event?.loaded) || 0;
                                const total = Number(event?.total) || 0;
                                if (total > 0) this.progress = Math.min(99, Math.round((done / total) * 100));
                            }
                        });
                        this.state = 'ready';
                        this.progress = 100;
                        preference.write(true);
                        return true;
                    } catch (error) {
                        this.error = String(error?.message || error || 'the download failed');
                    }
                }
                this.state = 'failed';
                preference.write(false);
                return false;
            })();
            return this.pending;
        },

        /** Forget the choice (the downloaded files stay in the browser cache). */
        disable() {
            preference.write(false);
            this.state = 'off';
            this.engine = null;
        },

        /**
         * Speak one line with the on-device model.
         *
         * This build of the model speaks Latin-script languages only. Telugu,
         * Devanagari, Arabic and CJK lines return false straight away so the
         * cloud voice (or the device voice) reads them, rather than the pack
         * guessing at words it cannot pronounce.
         */
        async speak(name, text, options = {}) {
            if (!this.ready) return false;
            if (/[^\u0000-\u024F\u1E00-\u1EFF\s\d]/.test(String(text))) return false;
            const voices = window.CharacterVoices;
            const chunks = voices?.chunks ? voices.chunks(text, 300) : [String(text)];
            const speaker = this.voiceFor(name);
            for (let index = 0; index < chunks.length; index += 1) {
                try {
                    const audio = await this.engine.generate(chunks[index], { voice: speaker });
                    const blob = audio?.toBlob ? await audio.toBlob()
                        : new window.Blob([audio?.toWav ? audio.toWav() : audio], { type: 'audio/wav' });
                    if (!blob || !blob.size) throw new Error('the voice produced no sound');
                    if (voices?.playBlob) await voices.playBlob(blob);
                    else await this.playLocally(blob, options);
                    this.lastLine = true;
                } catch (error) {
                    this.error = String(error?.message || error);
                    // A later sentence failing must not restart the answer in another voice.
                    return index > 0;
                }
            }
            return chunks.length > 0;
        },

        playLocally(blob, options = {}) {
            return new Promise(resolve => {
                try {
                    const audio = new window.Audio(window.URL.createObjectURL(blob));
                    audio.onended = () => { window.URL.revokeObjectURL(audio.src); resolve(true); };
                    audio.onerror = () => resolve(false);
                    if (options.rate || options.pitch) audio.playbackRate = Number(options.rate) || 1;
                    audio.play().then(() => {}).catch(() => resolve(false));
                } catch { resolve(false); }
            });
        },

        /** One sentence a player can hear in Settings or on request. */
        statusLine() {
            if (this.state === 'ready') return 'On-device voices are ready: unlimited and offline, no key and no quota.';
            if (this.state === 'loading') return `On-device voices are downloading (${this.progress}% of the model so far). Keep this tab open.`;
            if (this.state === 'failed') return `The on-device voice download failed (${this.error || 'unknown reason'}). The cloud and device voices still work.`;
            return 'On-device voices are not downloaded. Say "voice pack" to get unlimited free voices.';
        }
    };

    window.KokoroVoicePack = pack;
})();
