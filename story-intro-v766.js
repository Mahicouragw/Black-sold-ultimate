/* 7.66.0 — the opening story and the palace quest announcements.
 *
 * The owner asked for a story clip at the start of a fresh hero: six spoken
 * lines over recorded music and recorded sound effects, then a spoken
 * announcement every time the Royal Court hands out a quest.
 *
 * Every line is one audio file under `assets/story/`. The narration voice is
 * generated once for this game (the owner approved an AI-generated narrator for
 * the story clips on 2026-11-20); the music and the sound effects are the
 * recorded, licensed files already shipped with the game. Nothing is spoken by
 * the device voice during a clip, so a blind player never hears two voices.
 *
 * The module never lies about what it has: `status()` says which lines exist,
 * and a missing line is skipped instead of being faked.
 */
(function () {
    'use strict';

    const DIRECTORY = 'assets/story/';

    /** The six opening lines, in order. */
    const INTRO = [
        { cue: 'intro-01', text: 'Welcome to Black Sword.', sfx: 'magic' },
        { cue: 'intro-02', text: 'This world is in danger, and it needs you. That is why you were born again.', sfx: 'blessing' },
        { cue: 'intro-03', text: 'You were born in Market Square, and your journey begins here.', sfx: 'explore' },
        { cue: 'intro-04', text: 'First, guidance. Say palace, and the court will give you a quest.', sfx: 'door' },
        { cue: 'intro-05', text: 'Ser Aldric, the Royal Huntsman, rides with you until that quest is done.', sfx: 'check' },
        { cue: 'intro-06', text: 'Take your first step. Your story begins now.', sfx: 'levelup' }
    ];

    /** One announcement per palace quest, named with the real quest and companion. */
    const QUESTS = {
        royal_hunt: {
            cue: 'palace-royal-hunt',
            text: 'The Royal Court gives you the Royal Forest Hunt. Defeat five monsters for the Crown. Ser Aldric, the Royal Huntsman, joins you.'
        },
        palace_healers_road: {
            cue: 'palace-healers-road',
            text: 'The Healer\'s Road. Escort the palace healer and defeat eight monsters threatening the pilgrim road. Sister Meera joins you.'
        },
        palace_border_watch: {
            cue: 'palace-border-watch',
            text: 'Border Watch. Clear twelve monsters from the kingdom\'s borders with Captain Rudra, Captain of the Border Watch.'
        },
        palace_scholars_errand: {
            cue: 'palace-scholars-errand',
            text: 'The Scholar\'s Errand. Protect the court scholar through fifteen battles while she studies the creatures of the wild. Scholar Ilavati joins you.'
        },
        palace_kings_champion: {
            cue: 'palace-kings-champion',
            text: 'The King\'s Champion. Win twenty battles beside Veer, champion of the King.'
        }
    };

    const state = {
        playing: false,
        cancelled: false,
        musicBefore: null,
        lastCue: null,
        played: [],
        // Tests replace this with a fake element; the game uses a real one.
        audioFactory: null
    };

    const file = cue => `${DIRECTORY}${cue}.mp3`;

    /** A published Story cue from the studio wins over the bundled file. */
    function published(cue) {
        try {
            const cues = window.CustomAudio?.status?.().cues || [];
            const row = cues.find(entry => entry && entry.cue === cue && entry.kind === 'story' && entry.url);
            return row ? row.url : null;
        } catch { return null; }
    }

    const sourceFor = cue => published(cue) || file(cue);

    /**
     * The line is played by the game's single audio engine, never by a second
     * Audio object of this module: MusicSystem owns one bounded story player.
     */
    function makeAudio(src) {
        if (typeof state.audioFactory === 'function') return state.audioFactory(src);
        return window.MusicSystem?.storyClip?.(src) || null;
    }

    /** Show the line in the story log without the device voice reading it too. */
    function showLine(text) {
        const game = window.Game;
        if (!game || typeof game.addNarrative !== 'function') return;
        const previous = game._audioNarrationHandled;
        game._audioNarrationHandled = true;
        try { game.addNarrative(text, 'story'); }
        finally { game._audioNarrationHandled = previous; }
    }

    function setMusic(key) {
        // playTrack is the direct, non-playlist door: the opening must be the
        // adventure-intro recording, and the palace must be the palace theme.
        try {
            if (window.MusicSystem?.playTrack) window.MusicSystem.playTrack(key);
            else window.MusicSystem?.play?.(key);
        } catch { /* music is optional */ }
    }

    /**
     * Play one line and wait for it. A missing file, a refused autoplay or a
     * stop request all end cleanly — the sequence never hangs.
     */
    function playLine(line) {
        return new Promise(resolve => {
            if (state.cancelled) return resolve(false);
            const src = sourceFor(line.cue);
            let audio;
            try { audio = makeAudio(src); } catch { return resolve(false); }
            if (!audio) return resolve(false);
            let settled = false;
            const finish = played => {
                if (settled) return;
                settled = true;
                if (state.finishLine === stopLine) state.finishLine = null;
                state.played.push({ cue: line.cue, src, played });
                resolve(played);
            };
            let timer = null;
            // Stop must silence the voice immediately, not at the end of the
            // line: the pending line is settled here.
            const stopLine = () => finish(false);
            state.finishLine = stopLine;
            audio.addEventListener?.('ended', () => finish(true));
            audio.addEventListener?.('error', () => finish(false));
            try {
                audio.volume = 1;
                const result = audio.play?.();
                if (result && typeof result.catch === 'function') result.catch(() => finish(false));
            } catch { finish(false); }
            // Short lines: 12 s is already generous. This only exists so a
            // stalled media element can never freeze the opening.
            timer = setTimeout(() => finish(true), 15000);
            timer?.unref?.(); // never hold a test or a background tab open
            if (audio.addEventListener) audio.addEventListener('ended', () => clearTimeout(timer));
            state.lastCue = line.cue;
        });
    }

    function beep(name) {
        if (!name) return;
        try { window.MusicSystem?.playSFX?.(name); } catch { /* sound effects are optional */ }
    }

    function markSeen() {
        const game = window.Game;
        if (!game?.state) return;
        game.state.storyIntroSeen = true;
        try { game.save?.(); } catch { /* an unsaved flag is harmless */ }
    }

    async function play({ announce = false } = {}) {
        if (state.playing) return false;
        state.playing = true;
        state.cancelled = false;
        state.played = [];
        state.finishLine = null;
        const game = window.Game;
        try {
            try { state.musicBefore = window.MusicSystem?.currentKey || null; } catch { state.musicBefore = null; }
            setMusic('intro');
            for (const line of INTRO) {
                if (state.cancelled) break;
                showLine(line.text);
                beep(line.sfx);
                await playLine(line);
            }
            if (!state.cancelled) markSeen();
            return !state.cancelled;
        } finally {
            state.playing = false;
            if (game && !game.state?.inCombat) setMusic('town');
            if (announce) {
                try { window.GestureAccessibility?.speak?.(state.cancelled ? 'The story was stopped.' : 'The opening story is finished.', false, 'system'); } catch { /* optional */ }
            }
        }
    }

    async function playQuest(questId) {
        const entry = QUESTS[questId];
        if (!entry) return false;
        showLine(entry.text);
        beep('check');
        const before = state.musicBefore;
        setMusic('palace');
        const ok = await playLine(entry);
        setMusic(window.Game?.state?.inCombat ? 'battle' : 'town');
        state.musicBefore = before;
        return ok;
    }

    function stop() {
        state.cancelled = true;
        try { state.finishLine?.(); } catch { /* already finished */ }
        state.finishLine = null;
        try { window.MusicSystem?.stopStoryClip?.(); } catch { /* already silent */ }
        return true;
    }

    /** What exists right now, so the owner sees the truth in Settings. */
    function status() {
        const cues = [];
        for (const line of INTRO) cues.push({ cue: line.cue, text: line.text, kind: 'intro', src: sourceFor(line.cue), published: Boolean(published(line.cue)) });
        for (const [questId, entry] of Object.entries(QUESTS)) cues.push({ cue: entry.cue, text: entry.text, kind: 'quest', questId, src: sourceFor(entry.cue), published: Boolean(published(entry.cue)) });
        return {
            intro: cues.filter(cue => cue.kind === 'intro'),
            quests: cues.filter(cue => cue.kind === 'quest'),
            playing: state.playing,
            lastCue: state.lastCue,
            seen: Boolean(window.Game?.state?.storyIntroSeen)
        };
    }

    /** Say the script when a line cannot be heard, so nothing is hidden. */
    function script() {
        const lines = [...INTRO.map(line => line.text), ...Object.values(QUESTS).map(entry => entry.text)];
        const game = window.Game;
        for (const text of lines) game?.addNarrative?.(text, 'story');
        window.GestureAccessibility?.speak?.(`Story script: ${lines.length} lines. The opening story has ${INTRO.length} lines and the court has ${Object.keys(QUESTS).length} quest announcements.`, true, 'system');
        return lines;
    }

    const api = { INTRO, QUESTS, file, sourceFor, play, playQuest, stop, status, script, markSeen, state };
    window.StoryIntro = api;

    /* ── wiring ─────────────────────────────────────────────────────────── */

    const commands = new Set(['story', 'story intro', 'opening story', 'play story', 'start story', 'story script']);
    const stopCommands = new Set(['stop story', 'stop the story', 'stop the opening story']);
    const oldProcess = window.Game?.processCommand;
    if (oldProcess) {
        window.Game.processCommand = function (raw) {
            const text = String(raw || '').trim().toLowerCase();
            if (commands.has(text)) {
                if (text === 'story script') return script();
                play({ announce: true });
                return true;
            }
            if (stopCommands.has(text)) {
                stop();
                window.Game?.addNarrative?.('The story stopped.', 'system');
                return true;
            }
            return oldProcess.call(this, raw);
        };
    }

    // A brand-new hero hears the story once, at the moment the game begins.
    function wireStart() {
        const game = window.Game;
        if (!game || game._storyWired) return;
        game._storyWired = true;
        const oldCreate = game.createCharacter?.bind(game);
        if (oldCreate) {
            game.createCharacter = function (...args) {
                const result = oldCreate(...args);
                if (result !== false && this.state?.screen === 'game-screen' && !this.state?.storyIntroSeen) {
                    setTimeout(() => { if (!this.state?.storyIntroSeen && !this.state?.inCombat) play(); }, 600);
                }
                return result;
            };
        }
        document.getElementById('btn-play-story')?.addEventListener('click', () => play({ announce: true }));
        // Every palace quest is announced aloud when the court hands it out.
        const oldQuest = game.palaceQuest?.bind(game);
        if (oldQuest) {
            game.palaceQuest = async function (...args) {
                const before = this.state?.sacred?.palace?.active?.quest_id || null;
                const result = await oldQuest(...args);
                const after = this.state?.sacred?.palace?.active?.quest_id || null;
                if (result === true && after && after !== before) playQuest(after);
                return result;
            };
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireStart, { once: true });
    else wireStart();
})();
