/**
 * 7.63.0 — audio catalogue and a spoken sound test.
 *
 * The owner asked for an audit: every sound the game plays must be a genuine
 * recording, never a generated tone, and a failed action must never borrow the
 * sound of a successful one. This module makes the catalogue inspectable and
 * gives players (and the owner) a way to hear every cue by name.
 *
 *   sound test              play every recorded effect, one by one, with names
 *   sound test <name>       play one recorded effect
 *   stop sound test         stop the walk-through
 */
(() => {
    'use strict';

    const G = () => window.Game;
    const MS = () => window.MusicSystem;

    const state = { unknown: new Map(), running: false, token: 0 };

    function cues() {
        const table = MS()?.sfx;
        return table && typeof table === 'object' ? Object.keys(table).sort() : [];
    }

    function record(cue) {
        const name = String(cue || '').trim();
        if (!name) return;
        const table = MS()?.sfx || {};
        if (table[name]) return;
        state.unknown.set(name, (state.unknown.get(name) || 0) + 1);
    }

    function unknownCues() {
        return [...state.unknown.entries()].map(([name, count]) => ({ name, count }));
    }

    function files(cue) {
        const list = MS()?.sfx?.[cue];
        return Array.isArray(list) ? [...list] : [];
    }

    function say(text, focus = false) {
        try {
            if (window.GestureAccessibility?.speak) window.GestureAccessibility.speak(text, focus, 'system');
            else if (window.Narration?.say) window.Narration.say(text, 'system');
            else G()?.addNarrative?.(text, 'system');
        } catch { /* narration is optional */ }
    }

    function stop() {
        state.token += 1;
        state.running = false;
        say('Sound test stopped.');
    }

    async function walk(list, token) {
        state.running = true;
        say(`Sound test. ${list.length} recorded effects. Say stop sound test to end.`, true);
        for (const cue of list) {
            if (token !== state.token) return;
            say(cue);
            try { await MS()?.playSFXAndWait?.(cue); } catch { /* a missing file is reported below */ }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (token !== state.token) return;
        state.running = false;
        say('Sound test finished.');
    }

    function run(arg) {
        const table = MS()?.sfx;
        if (!table) { say('Sounds are still loading. Try again in a moment.'); return false; }
        const wanted = String(arg || '').trim().toLowerCase();
        if (wanted) {
            const cue = cues().find(name => name.toLowerCase() === wanted)
                || cues().find(name => name.toLowerCase().startsWith(wanted));
            if (!cue) {
                say(`There is no recorded effect called ${wanted}. Say sound test to hear the list.`);
                return false;
            }
            record(cue);
            say(`${cue}. ${files(cue).length} recording${files(cue).length === 1 ? '' : 's'}.`);
            MS()?.playSFX?.(cue, { allowDuplicate: true });
            return true;
        }
        const token = ++state.token;
        walk(cues(), token);
        return true;
    }

    function install() {
        const game = G();
        if (!game || game._audioAuditInstalled) return;
        game._audioAuditInstalled = true;

        const system = MS();
        if (system && !system._audioAuditWrapped) {
            system._audioAuditWrapped = true;
            const original = system.playSFX;
            system.playSFX = function (type, options) {
                record(type);
                return original.call(this, type, options);
            };
        }

        const originalCommand = game.processCommand;
        if (typeof originalCommand === 'function') {
            game.processCommand = function (input) {
                const text = String(input || '').trim();
                const match = /^sound test(?:\s+(.+))?$/i.exec(text);
                if (match) {
                    if (window.OnlineRequired?.blocked) return false;
                    return run(match[1]);
                }
                if (/^stop sound test$/i.test(text)) {
                    if (window.OnlineRequired?.blocked) return false;
                    if (!state.running) return false;
                    stop();
                    return true;
                }
                return originalCommand.call(this, input);
            };
        }
    }

    window.AudioCatalog = {
        cues,
        files,
        run,
        stop,
        unknownCues,
        get running() { return state.running; },
        install
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();
