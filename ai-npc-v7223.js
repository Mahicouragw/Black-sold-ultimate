/**
 * v7.22.3 — Conversational AI NPCs.
 *
 * Lets the player hold a real conversation with any NPC in the world, in
 * English, Telugu, Hindi or another language. Questions about the game and
 * general questions both work. The reply is spoken through the existing
 * centralized TTS (so the TTS OFF setting is respected) and written into the
 * normal narrative log for TalkBack.
 *
 * Commands:
 *   ask <question>              -> ask the NPC you are talking to
 *   ask <npc name> <question>   -> address a specific NPC here
 *   say <anything>              -> same as ask
 *
 * No API key ever reaches the browser: the request goes to /api/npc, which
 * calls the model server-side. If no key is configured the server returns a
 * scripted fallback, so an NPC is never silent.
 */
(() => {
    'use strict';

    const ENDPOINT = window.location.hostname === 'mahicouragw.github.io' ? 'https://black-sold-ultimate.vercel.app/api/npc' : 'api/npc';
    const MAX_HISTORY = 6;

    const AiNpc = {
        histories: new Map(),          // npc name -> recent turns
        lastNpc: null,
        pending: false,
        lastSpoken: '',                // duplicate-response guard
        lastSpokenAt: 0,
        lastCall: null,                // { provider, ai, ms, at } of the last answer

        /** Plain-language report of the AI service, for "ai status". */
        statusLine() {
            if (!this.lastCall) return 'No question has been sent to the AI service yet. Ask someone something and I will report back.';
            const { provider, ai, ms, at } = this.lastCall;
            const when = at ? at.toLocaleTimeString() : 'just now';
            const voices = window.CharacterVoices;
            const voiceLine = voices?.lastEngine === 'neural'
                ? ' Characters are speaking with their own synthetic voices.'
                : voices?.neuralAvailable === false
                    ? ' No voice service key is configured, so the device voice is reading the answers.'
                    : ' The device voice is reading until the synthetic voice service answers.';
            return (ai
                ? `The AI service answered at ${when} through ${provider}, in ${Math.round(ms / 100) / 10} seconds.`
                : `The AI service did not answer at ${when} (${provider}, ${Math.round(ms / 100) / 10} seconds). Characters answered from the game's own knowledge instead. Check the internet connection, then ask again.`) + voiceLine;
        },

        /**
         * A small, sanitized snapshot of the player's real game state sent to
         * the server so player-specific questions ("how much gold do I have?")
         * are answered from actual data, never hallucinated. No credentials,
         * tokens, emails or identifiers ever leave the device in this payload.
         */
        buildGameSnapshot() {
            const G = window.Game;
            const p = G?.state?.player;
            if (!p) return null;
            const loc = window.WorldData?.locations?.[G.state.location];
            return {
                gold: Number(p.gold) || 0,
                hp: Number(p.hp) || 0, maxHp: Number(p.maxHp) || 0,
                mp: Number(p.mp) || 0, maxMp: Number(p.maxMp) || 0,
                level: Number(p.level) || 1,
                location: loc?.name || G.state.location || '',
                weapon: p.weapon || '',
                spells: Array.isArray(p.spells) ? p.spells : [],
                quests: (G.state.quests || []).map(q => (typeof q === 'string' ? q : q?.name)).filter(Boolean),
                companions: (G.state.companions || []).map(c => c?.name).filter(Boolean),
                inventory: (G.state.inventory || []).map(i => ({ name: i?.name || i?.id, qty: Number(i?.quantity) || 1 }))
            };
        },

        /** NPCs standing in the player's current location. */
        localNpcs() {
            return (window.WorldData?.npcs?.[window.Game?.state?.location]) || [];
        },

        /** True when the player typed this person's name, or part of it. */
        matchesName(npc, text) {
            const said = ` ${String(text || '').toLowerCase()} `;
            const name = String(npc.name || '').toLowerCase().trim();
            if (!name) return false;
            if (said.includes(name)) return true;
            return name.split(/\s+/).filter(word => word.length > 3)
                .some(word => new RegExp(`\\b${word}\\b`).test(said));
        },

        /** Resolve which NPC should answer, preferring an explicit name match. */
        resolveNpc(query) {
            const here = this.localNpcs();
            if (!here.length) return null;
            const said = String(query || '').toLowerCase().trim();
            // An exact name wins, so "Mira" never goes to "Mira the Elder".
            const exact = here.find(npc => String(npc.name || '').toLowerCase() === said);
            if (exact) return exact;
            const named = here.find(npc => this.matchesName(npc, query));
            if (named) return named;
            if (this.lastNpc) {
                const previous = here.find(npc => npc.name === this.lastNpc);
                if (previous) return previous;
            }
            return here[0];
        },

        /** Strip the NPC name so it is not repeated back in the question. */
        stripName(message, npc) {
            const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let out = String(message || '');
            const name = String(npc?.name || '');
            if (name) {
                out = out.replace(new RegExp(escape(name), 'ig'), ' ');
                for (const word of name.split(/\s+/).filter(part => part.length > 3)) {
                    out = out.replace(new RegExp(`\\b${escape(word)}\\b`, 'ig'), ' ');
                }
            }
            out = out.replace(/^\s*(?:talk\s+to|speak\s+to|ask|say)\s+/i, '')
                .replace(/^[\s,:;.!?-]+/, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            return out || String(message || '').trim();
        },

        /** Everyone standing here, so the player can choose who answers. */
        whoIsHere() {
            const here = this.localNpcs();
            if (!here.length) return 'There is no one here to talk to. Walk to a village, city or guild hall and ask again.';
            const list = here.map(npc => (npc.role ? `${npc.name}, ${npc.role}` : npc.name)).join('; ');
            const first = here[0].name;
            return `Standing here with you: ${list}. Say talk to ${first} to hear that person, or say ${first}, and then your question.`;
        },

        /**
         * Game knowledge answered at once, in the speaker's voice, without
         * waiting for the network. This keeps NPCs talking even when the AI
         * service is slow or offline.
         */
        localAnswer(npc, question, game) {
            const q = String(question || '').toLowerCase();
            const room = window.WorldData?.locations?.[game?.state?.location];
            const place = room?.name || 'here';
            const date = new Date();
            const christmas = window.SeasonalEvents?.activeEvents?.(date)?.some(event => event.id === 'christmas');
            const player = game?.state?.player || {};
            // Only the questions whose answers live in the game itself are
            // answered without the AI: where and when things are. Anything
            // broader ("what will you do for Christmas?") reaches the model,
            // so a character never gives one canned reply to every subject.
            const asksPlaceOrDate = /where|when|which date|what date|open|close|opens|closes|start|begin|season|dates?/.test(q);
            const asksHow = /how (do|can|does)|what can i|how to/.test(q);
            if (asksPlaceOrDate && /christmas|advent|xmas|santa|crier|starlight/.test(q)) {
                if (christmas) {
                    return `Christmas City is open today. Walk northeast from Kaliwasch Market Square to Starlight Fair; Crier Bell stands on the square and in the tavern with the news, and Advent Row runs from door one to door twenty-five.`;
                }
                const day = `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })}`;
                const variants = [
                    `Christmas City opens on the first of December and closes on the twenty-fifth. Today is ${day}, so Crier Bell is not on the square yet: on December the first he takes his place on Kaliwasch Market Square and in the tavern.`,
                    `The season runs from the first to the twenty-fifth of December. Today is ${day}, so the Christmas city is still closed and the crier will not be at the market square until December the first.`,
                    `Not yet — Christmas opens on December the first and closes on the twenty-fifth. Today is ${day}. Crier Bell waits with the news on Kaliwasch Market Square and in the tavern once the season begins.`
                ];
                return variants[this.hash(npc.name + q) % variants.length];
            }
            if ((asksPlaceOrDate || asksHow) && /game hall|chess|ludo|carrom|snake|blackjack/.test(q)) {
                return 'The Christmas Game Hall is off Advent Gate, with rooms for chess, carrom, snakes and ladders, ludo and blackjack. Stand in the hall and say play chess, or use the actions menu.';
            }
            if ((asksPlaceOrDate || asksHow) && /cook|recipe|ingredient|scroll|kitchen/.test(q)) {
                return 'The kitchen lives at Greta\'s tavern. Cooking scrolls drop in Christmas fights and the candy cane stall sells ingredients. Say christmas kitchen to see what you carry, and christmas read scroll to open a scroll.';
            }
            if (/\b(gold|money|coins)\b/.test(q)) return `You carry ${Number(player.gold) || 0} gold.`;
            if (/\b(health|hit points|hurt|wounded)\b/.test(q)) return `You have ${Number(player.hp) || 0} of ${Number(player.maxHp) || 0} health.`;
            if (/\b(quest|mission|task)\b/.test(q)) {
                const quests = (game?.state?.quests || []).map(item => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
                return quests.length ? `Your open quests are: ${quests.join('; ')}.` : 'You have no open quests right now. Say quests at any time to check.';
            }
            if (/\b(exit|exits|direction|directions|way out|which way|road out)\b/.test(q) || /^where am i\b/.test(q)) {
                return room ? `${place}. ${game.describeExits(room)}` : 'I cannot see the road from here.';
            }
            if (/who.*(here|talk)|anyone here|people here/.test(q)) return this.whoIsHere();
            return '';
        },

        /** Stable small hash, used to pick between equally good phrasings. */
        hash(text) {
            let h = 2166136261;
            for (const ch of String(text || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
            return h >>> 0;
        },

        /** Keep the last few turns so a character can refer back. */
        remember(npc, question, reply) {
            const history = this.histories.get(npc.name) || [];
            this.histories.set(npc.name, [...history, { role: 'user', content: question }, { role: 'assistant', content: reply }].slice(-MAX_HISTORY));
        },

        /**
         * Defense in depth: even though the server sanitizes, clean anything
         * that still looks like leaked chain-of-thought or markdown so a blind
         * player never hears it. Returns '' when nothing usable remains.
         */
        sanitizeReply(raw) {
            let text = String(raw || '')
                .replace(/```[\s\S]*?```/g, ' ')
                .replace(/`([^`]*)`/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
                .replace(/^#{1,6}\s*/gm, '')
                .replace(/^\s*[-*+]\s+/gm, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (/i am (an? )?(ai )?(language|large language) model|language model developed by|i (was |am )?(developed|created|trained) by (nvidia|openai|google|anthropic)/i.test(text)) {
                return 'I am the Black Soul Ultimate AI, the AI assistant and NPC intelligence system built for this game.';
            }
            if (/thinking process|chain[- ]of[- ]thought|reasoning|step[- ]by[- ]step|let me think|stay in character|never discuss|never repeat|system prompt|analy[sz]e user input/i.test(text)) {
                // Try to salvage a real answer after a common marker.
                const marker = text.match(/final (?:answer|reply)\s*:?\s*/i);
                if (marker && marker.index !== undefined) {
                    const candidate = text.slice(marker.index + marker[0].length).trim();
                    if (candidate && candidate.length > 3) return candidate;
                }
                return '';
            }
            return text;
        },

        /**
         * Render web-derived sources as real, keyboard- and TalkBack-accessible
         * links below the answer. Raw URLs are never spoken or dumped into the
         * dialogue; each link is a labelled, tap-safe target.
         */
        renderSources(sources) {
            if (!Array.isArray(sources) || !sources.length) return;
            const narrative = window.document.getElementById('narrative');
            if (!narrative) return;
            const wrap = window.document.createElement('p');
            wrap.className = 'npc-sources';
            wrap.setAttribute('aria-label', 'Sources');
            const label = window.document.createElement('span');
            label.textContent = 'Sources: ';
            label.setAttribute('role', 'text');
            wrap.appendChild(label);
            sources.forEach((s, i) => {
                if (!s || !s.url) return;
                const a = window.document.createElement('a');
                a.href = s.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = `${i + 1}. ${s.title || 'Untitled'}`;
                a.setAttribute('aria-label', `Source ${i + 1}: ${s.title || 'Untitled'}${s.domain ? ' from ' + s.domain : ''}`);
                wrap.appendChild(a);
                if (i < sources.length - 1) wrap.appendChild(window.document.createTextNode(' · '));
            });
            narrative.appendChild(wrap);
            narrative.scrollTop = narrative.scrollHeight;
        },

        /** A greeting, thanks or farewell written for this moment — not a clip. */
        smallTalk(npc, question) {
            const said = String(question || '').toLowerCase().replace(/[!.?,]/g, ' ').trim();
            const greeting = /^(hi|hello|hey|yo|greetings|namaste|namaskaram|good (morning|afternoon|evening|day))\b/.test(said)
                || /\b(how are you|how do you do)\b/.test(said);
            const thanks = /\b(thank(s| you)|much obliged)\b/.test(said);
            const bye = /\b(bye|goodbye|farewell|see you|good night)\b/.test(said);
            if (!greeting && !thanks && !bye) return '';
            const game = window.Game;
            const room = window.WorldData?.locations?.[game?.state?.location];
            const place = room?.name || 'this place';
            const role = npc.role ? `${npc.name}, ${npc.role},` : npc.name;
            if (thanks) return `You are very welcome. ${npc.name} is glad to help — ask anything else and I will answer out loud.`;
            if (bye) return `Safe roads, traveller. You will find ${npc.name} right here in ${place} when you return.`;
            return `Well met. I am ${role} here in ${place}. Ask me anything and I will speak the answer in my own voice.`;
        },

        /** A stable device-voice profile per character, used for every answer so
         *  arbitrary text can be read aloud — no clip has to exist first. */
        profileFor(name) {
            const profile = window.CharacterVoices?.profile?.(name);
            if (profile) return profile;
            let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
            return { voiceId: 'system:default', pitch: 1, rate: 1, voice: '', hash: h };
        },

        /** Back-compat: the voice id part of the character profile. */
        voiceFor(name) {
            return this.profileFor(name).voiceId || '';
        },

        /**
         * Log the answer and speak exactly those words in the character's own
         * device voice. Any sentence can be read, so any question gets a live
         * answer; no clip has to exist first and none is substituted.
         */
        announce(game, npc, reply) {
            const spoken = `${npc.name} says: ${reply}`;
            const nowMs = Date.now();
            if (spoken === this.lastSpoken && nowMs - this.lastSpokenAt < 2500) return false;
            this.lastSpoken = spoken;
            this.lastSpokenAt = nowMs;
            const profile = this.profileFor(npc.name);
            const emitted = game.emitGameEvent?.(spoken, 'npc', {
                eventId: `npc:${npc.name}:${nowMs}`,
                voiceId: profile.voiceId,
                pitch: profile.pitch,
                rate: profile.rate,
                character: true
            });
            if (!emitted) game.addNarrative(spoken, 'npc');
            return true;
        },

        async ask(rawMessage) {
            const game = window.Game;
            const message = String(rawMessage || '').trim();
            if (!message) {
                game.addNarrative('Ask a question, for example: ask where can I find the forest entrance.', 'system');
                return false;
            }
            const npc = this.resolveNpc(message);
            if (!npc) {
                game.addNarrative('There is no one here to talk to. Find a village, city or guild hall.', 'system');
                window.MusicSystem?.playSFX?.('board-error');
                return false;
            }
            // A stuck request must never silence the characters: release it.
            if (this.pending && Date.now() - (this.pendingSince || 0) > 15000) this.pending = false;
            if (this.pending) {
                game.addNarrative(`${npc.name} is still answering your last question. Give it a moment.`, 'system');
                return false;
            }

            this.lastNpc = npc.name;
            const question = this.stripName(message, npc);
            game.addNarrative(`You ask ${npc.name}: "${question}"`, 'npc');

            // Greetings: words written for this moment, read aloud in their voice.
            const small = this.smallTalk(npc, question);
            if (small) {
                this.announce(game, npc, small);
                this.aiAvailable = true;
                return true;
            }

            // Game and world questions: answered at once, in the speaker's voice,
            // so the player never waits on a network round trip to hear someone.
            const local = this.localAnswer(npc, question, game);
            if (local) {
                this.remember(npc, question, local);
                this.announce(game, npc, local);
                this.aiAvailable = false;
                return true;
            }

            let reply = '';
            let ai = false;
            let sources = [];
            this.pending = true;
            this.pendingSince = Date.now();
            const startedAt = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => { try { controller.abort(); } catch {} }, 12000);
            try {
                const response = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: question,
                        npcName: npc.name,
                        npcRole: npc.role || 'a villager of Kandor',
                        history: this.histories.get(npc.name) || [],
                        game: this.buildGameSnapshot()
                    }),
                    signal: controller.signal
                });
                const data = await response.json();
                reply = this.sanitizeReply(data?.reply || '');
                ai = Boolean(data?.ai);
                sources = Array.isArray(data?.sources) ? data.sources : [];
                this.lastCall = { provider: data?.provider || 'unknown', ai, ms: Date.now() - startedAt, at: new Date() };
            } catch {
                reply = '';
                this.lastCall = { provider: 'unreachable', ai: false, ms: Date.now() - startedAt, at: new Date() };
            } finally {
                clearTimeout(timer);
                this.pending = false;
                this.pendingSince = 0;
            }

            if (!reply) {
                const room = window.WorldData?.locations?.[game.state.location];
                reply = npc.dialog?.length ? game.npcDialog(npc)
                    : `Welcome to ${room?.name || 'this place'}. Ask me about the road, the shops or the season, and I will answer.`;
            }

            this.remember(npc, question, reply);
            // Speak the answer itself, word for word, in this character's voice.
            this.announce(game, npc, reply);
            if (sources.length) this.renderSources(sources);
            this.aiAvailable = ai;
            return true;
        }
    };

    window.AiNpc = AiNpc;

    const bind = () => {
        if (!window.Game || window.Game._aiNpcBound) return false;
        window.Game._aiNpcBound = true;

        const previous = window.Game.processCommand.bind(window.Game);
        window.Game.processCommand = function (cmd) {
            const raw = String(cmd || '');
            const lower = raw.toLowerCase().trim();

            const game = this?.state ? this : window.Game;
            if (/^(?:ai|npc|tts|voice) status$/.test(lower)) {
                const report = AiNpc.statusLine();
                const spoken = game.emitGameEvent?.(report, 'system', { character: false });
                if (!spoken) game.addNarrative(report, 'system');
                return;
            }
            if (/^(?:ai|npc) (?:test|diagnose)$/.test(lower)) {
                AiNpc.ask('hello there, can you hear me');
                return;
            }
            // Who is standing here, and how to address one of them.
            if (/^(?:who is here|who's here|who is there|who can i talk to|people here|npcs)\??$/.test(lower)) {
                const roster = AiNpc.whoIsHere();
                const spoken = game.emitGameEvent?.(roster, 'system');
                if (!spoken) game.addNarrative(roster, 'system');
                return;
            }
            const talkTo = lower.match(/^(?:talk to|speak to|talk with)\s+(.+)$/);
            if (talkTo) {
                const npc = AiNpc.resolveNpc(talkTo[1]);
                if (npc && AiNpc.matchesName(npc, talkTo[1])) {
                    AiNpc.lastNpc = npc.name;
                    const greeting = AiNpc.smallTalk(npc, 'hello');
                    game.addNarrative(`You turn to ${npc.name}.`, 'system');
                    AiNpc.announce(game, npc, greeting);
                    return;
                }
            }
            // "ask ..." / "say ..." reach the AI NPC. Plain "talk" keeps the
            // existing scripted dialog so nothing that worked is removed.
            const match = lower.match(/^(?:ask|say)\s+(.+)$/);
            if (match) {
                const original = raw.trim().replace(/^(?:ask|say)\s+/i, '');
                AiNpc.ask(original);
                return;
            }
            if (lower === 'ask' || lower === 'say') {
                this.addNarrative('Ask a question, for example: ask how do I finish this quest.', 'system');
                return;
            }
            return previous(cmd);
        };
        console.log('v7.22.3 AI NPC conversation active');
        return true;
    };

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let tries = 0;
        const timer = setInterval(() => { if (bind() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
