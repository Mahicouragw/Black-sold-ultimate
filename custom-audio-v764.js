/**
 * 7.64.0 — the owner's published sounds.
 *
 * The owner can upload a recorded effect or music track in the in-game Sound
 * Studio. The studio stores it and lists it in `bsu-audio`; this module reads
 * that list at start-up and teaches `MusicSystem` the new file. Nothing is
 * generated: a published cue always points at the owner's own recording.
 *
 * If the list cannot be read, the built-in recordings stay exactly as they are.
 */
(() => {
    'use strict';

    const DEFAULT_API = 'https://tmkpdvljhnlnvbckbnsc.supabase.co/functions/v1/bsu-audio';
    const api = () => window.BLACK_SWORD_BACKEND_CONFIG?.audioUrl || DEFAULT_API;

    const state = { loaded: false, failed: false, cues: [], applied: [] };

    const tell = (text, focus = false) => {
        try {
            if (window.GestureAccessibility?.speak) window.GestureAccessibility.speak(text, focus, 'system');
            else window.Game?.addNarrative?.(text, 'system');
        } catch { /* narration is optional */ }
    };

    function apply(cues) {
        const system = window.MusicSystem;
        if (!system || !Array.isArray(cues)) return [];
        const applied = [];
        for (const row of cues) {
            if (!row || !row.cue || !row.url) continue;
            // Story narration is played by StoryIntro, never as a sound effect.
            if (row.kind === 'story') { applied.push(row.cue); continue; }
            if (row.kind === 'music') {
                const track = system.music?.[row.cue];
                if (track) { track.src = row.url; applied.push(row.cue); }
                continue;
            }
            // A published cue may replace a built-in sound or add a new one.
            system.sfx[row.cue] = [row.url];
            system.sfxBuffers[row.url] = undefined;
            applied.push(row.cue);
        }
        state.applied = applied;
        return applied;
    }

    async function load({ announce = false } = {}) {
        if (window.OnlineRequired?.blocked) return state.cues;
        try {
            const response = await fetch(`${api()}?list=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
            if (!response.ok) throw new Error(`list ${response.status}`);
            const body = await response.json();
            const cues = Array.isArray(body?.data?.cues) ? body.data.cues : [];
            state.cues = cues;
            state.loaded = true;
            state.failed = false;
            const applied = apply(cues);
            if (announce && applied.length) tell(`${applied.length} published sound${applied.length === 1 ? '' : 's'} loaded from the studio.`);
            return cues;
        } catch {
            state.failed = true;
            return state.cues;
        }
    }

    function status() {
        return {
            loaded: state.loaded,
            failed: state.failed,
            count: state.cues.length,
            applied: [...state.applied],
            cues: state.cues.map(row => ({ ...row }))
        };
    }

    window.CustomAudio = { load, apply, status, api };

    document.addEventListener('DOMContentLoaded', () => {
        // Let the game finish its own start-up first; the studio is an extra.
        setTimeout(() => { load(); }, 1200);
    }, { once: true });
    window.addEventListener('online', () => { if (!state.loaded) load(); });
})();
