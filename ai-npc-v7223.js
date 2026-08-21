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

    const ENDPOINT = 'api/npc';
    const MAX_HISTORY = 6;

    const AiNpc = {
        histories: new Map(),          // npc name -> recent turns
        lastNpc: null,
        pending: false,
        lastSpoken: '',                // duplicate-response guard
        lastSpokenAt: 0,

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

        /** Resolve which NPC should answer, preferring an explicit name match. */
        resolveNpc(query) {
            const here = this.localNpcs();
            if (!here.length) return null;
            const text = String(query || '').toLowerCase();
            const named = here.find(npc => text.includes(npc.name.toLowerCase()));
            if (named) return named;
            if (this.lastNpc) {
                const previous = here.find(npc => npc.name === this.lastNpc);
                if (previous) return previous;
            }
            return here[0];
        },

        /** Strip a leading NPC name so it is not repeated back in the question. */
        stripName(message, npc) {
            const pattern = new RegExp(`^\\s*${npc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,:]?\\s*`, 'i');
            return message.replace(pattern, '').trim() || message.trim();
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
            if (this.pending) {
                game.addNarrative('Wait for the current reply before asking again.', 'system');
                return false;
            }

            this.pending = true;
            this.lastNpc = npc.name;
            const question = this.stripName(message, npc);
            const history = this.histories.get(npc.name) || [];

            // Tell the player something is happening: silence is confusing with
            // a screen reader.
            game.addNarrative(`You ask ${npc.name}: "${question}"`, 'npc');
            const thinking = `${npc.name} is thinking...`;
            game.addNarrative(thinking, 'system');

            let reply = '';
            let ai = false;
            try {
                const response = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: question,
                        npcName: npc.name,
                        npcRole: npc.role || 'a villager of Kandor',
                        history,
                        game: this.buildGameSnapshot()
                    }),
                    signal: AbortSignal.timeout(28000)
                });
                const data = await response.json();
                reply = this.sanitizeReply(data?.reply || '');
                ai = Boolean(data?.ai);
            } catch {
                reply = '';
            } finally {
                this.pending = false;
            }

            if (!reply) {
                reply = `${npc.name} says: "I cannot answer that right now. Please try again shortly."`;
            }

            // Remember the exchange so the conversation has continuity.
            const updated = [...history, { role: 'user', content: question }, { role: 'assistant', content: reply }];
            this.histories.set(npc.name, updated.slice(-MAX_HISTORY));

            const spoken = `${npc.name} says: ${reply}`;
            // Duplicate-response guard: if the exact same reply was spoken a
            // moment ago, do not log or speak it a second time.
            const nowMs = Date.now();
            if (spoken === this.lastSpoken && nowMs - this.lastSpokenAt < 2500) {
                this.aiAvailable = ai;
                return true;
            }
            this.lastSpoken = spoken;
            this.lastSpokenAt = nowMs;
            // emitGameEvent writes the log AND routes through centralized TTS,
            // so the TTS OFF setting is honoured automatically.
            game.emitGameEvent?.(spoken, 'npc', { eventId: `npc:${npc.name}:${nowMs}` })
                || game.addNarrative(spoken, 'npc');
            window.MusicSystem?.playSFX?.('coin');
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
