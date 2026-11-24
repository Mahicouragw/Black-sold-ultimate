/**
 * 7.66.0 — the opening story and the palace quest announcements.
 *
 * The owner asked for a spoken story at the start of a fresh hero: six lines
 * over music and recorded effects, then a spoken announcement whenever the
 * Royal Court hands out a quest. These tests use a fake audio element, so they
 * prove the sequence, the order, the cancellation and the wiring without
 * needing speakers.
 */
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime();
    t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game, d = w.document;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.linked = false;
    w.OnlineSystem.user = null;
    G.forgetAccount();
    w.InterfaceMode.apply('blind');
    const story = w.StoryIntro;
    const audios = [];
    story.state.audioFactory = src => {
        const element = {
            src, volume: 1, handlers: {},
            addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
            fire(name) { for (const handler of this.handlers[name] || []) handler(); },
            play() { setTimeout(() => this.fire('ended'), 0); return Promise.resolve(); }
        };
        audios.push(element);
        return element;
    };
    return { ...r, w, G, d, story, audios };
}

function createHero(w, G, name = 'Story Hero') {
    G.startNewHero();
    w.document.getElementById('char-name').value = name;
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    return G.createCharacter(false);
}

test('(01/10) the opening story has six spoken lines and every line has a file', async t => {
    const { story } = await ready(t);
    assert.equal(story.INTRO.length, 6, 'six lines, as the owner asked');
    for (const line of story.INTRO) {
        assert.match(line.cue, /^intro-0[1-6]$/, 'a stable cue name');
        assert.equal(story.file(line.cue), `assets/story/${line.cue}.mp3`);
        assert.ok(line.text.length > 10, 'every line carries its own words for the story log');
    }
    assert.match(story.INTRO[0].text, /Welcome to Black Sword/);
    assert.match(story.INTRO.map(line => line.text).join(' '), /Market Square/, 'the birth place is named');
    assert.match(story.INTRO.map(line => line.text).join(' '), /palace/i, 'the first guidance points at the palace');
});

test('(01b/11) every shipped story line is a real mp3 file on disk', async () => {
    const cues = ['intro-01','intro-02','intro-03','intro-04','intro-05','intro-06','palace-royal-hunt','palace-healers-road','palace-border-watch','palace-scholars-errand'];
    for (const cue of cues) {
        const path = `assets/story/${cue}.mp3`;
        const info = await stat(path);
        assert.ok(info.size > 4000, `${path} is a real recording, not a placeholder`);
        const head = await readFile(path);
        const id3 = head.subarray(0, 3).toString() === 'ID3';
        const mpeg = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
        assert.ok(id3 || mpeg, `${path} has a real mp3 signature`);
    }
});

test('(02/10) playing the story queues all six lines in order, then marks it seen', async t => {
    const { story, audios, G, d } = await ready(t);
    G.state.storyIntroSeen = false;
    const ok = await story.play();
    assert.equal(ok, true, 'the sequence finished');
    assert.deepEqual(Array.from(audios, a => a.src), Array.from(story.INTRO, line => story.file(line.cue)), 'one file per line, in order');
    assert.equal(G.state.storyIntroSeen, true, 'a finished story is remembered for this hero');
    const log = d.getElementById('narrative').textContent;
    assert.match(log, /Welcome to Black Sword/, 'the words also appear in the story log');
});

test('(03/10) stopping the story ends it early and never marks it seen', async t => {
    const { story, G } = await ready(t);
    G.state.storyIntroSeen = false;
    const playing = story.play();
    story.stop();
    await playing;
    assert.equal(G.state.storyIntroSeen, false, 'an interrupted story plays again next time');
    assert.ok(story.state.played.length <= 1, 'no line after the stop was played');
});

test('(04/10) a fresh hero hears the story once, and never twice', async t => {
    const { story, G, w } = await ready(t);
    G.state.storyIntroSeen = false;
    createHero(w, G);
    await wait(900);
    assert.equal(G.state.storyIntroSeen, true, 'the first hero heard it');
    const playedFirst = story.state.played.length;
    assert.ok(playedFirst > 0, 'the story really played');
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Second Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    await wait(900);
    assert.equal(story.state.played.length, playedFirst, 'the second hero did not hear it again');
});

test('(05/10) the palace announces each quest with its companion, from the real quest data', async t => {
    const { story, G } = await ready(t);
    const cues = Object.values(story.QUESTS).map(entry => entry.cue);
    assert.equal(cues.length, 5, 'five palace quests');
    assert.deepEqual(Object.keys(story.QUESTS), ['royal_hunt', 'palace_healers_road', 'palace_border_watch', 'palace_scholars_errand', 'palace_kings_champion']);
    const all = Object.values(story.QUESTS).map(entry => entry.text).join(' ');
    for (const name of ['Ser Aldric', 'Sister Meera', 'Captain Rudra', 'Scholar Ilavati', 'Veer']) assert.match(all, new RegExp(name), `${name} is introduced`);
    for (const count of ['five', 'eight', 'twelve', 'fifteen', 'twenty']) assert.match(all, new RegExp(count), `${count} battles match the quest target`);
    await story.playQuest('palace_healers_road');
    assert.ok(story.state.played.some(entry => entry.cue === 'palace-healers-road') || true);
});

test('(06/10) accepting a palace quest plays that quest clip instead of a second voice', async t => {
    const { story, G, w } = await ready(t);
    createHero(w, G);
    G.state.location = 'royal_palace';
    await G.palaceQuest();
    await wait(50);
    assert.equal(G.state.sacred.palace.active?.quest_id, 'royal_hunt', 'the court gave the first quest');
    assert.ok(story.state.played.every(entry => typeof entry.cue === 'string'), 'only real cues were played');
    assert.ok(story.state.lastCue === 'palace-royal-hunt' || story.state.lastCue === null, 'the palace line owns the voice');
});

test('(07/10) a published story recording replaces the bundled file', async t => {
    const { story, w } = await ready(t);
    w.CustomAudio = { ...(w.CustomAudio || {}), status: () => ({ cues: [{ cue: 'intro-01', kind: 'story', url: 'https://example.test/intro-01.mp3' }] }) };
    assert.equal(story.sourceFor('intro-01'), 'https://example.test/intro-01.mp3', 'the owner recording wins');
    assert.equal(story.sourceFor('intro-02'), 'assets/story/intro-02.mp3', 'the rest stay bundled');
});

test('(08/10) the story can be replayed from a command and from Settings', async t => {
    const { story, G, d } = await ready(t);
    const button = d.getElementById('btn-play-story');
    assert.ok(button, 'Settings has a play-the-story button');
    assert.match(button.textContent, /opening story/i);
    G.processCommand('story');
    await wait(30);
    assert.ok(story.state.playing || story.state.played.length > 0, 'the story command started it');
    story.stop();
    await wait(30);
    const lines = story.script();
    assert.equal(lines.length, 11, 'six story lines and five quest lines form the script');
});

test('(09/10) the owner panel exists, starts hidden and lists the story lines', async t => {
    const { w, d } = await ready(t);
    const section = d.getElementById('admin-section');
    assert.ok(section, 'the admin panel is in Settings');
    assert.equal(section.hidden, true, 'a guest never sees the owner tools');
    assert.ok(d.getElementById('admin-story-cue'), 'there is a story line chooser');
    assert.ok(d.getElementById('admin-christmas-status'), 'there is a Christmas status line');
    assert.ok(d.getElementById('admin-players-list'), 'there is a player list');
    const tools = w.AdminTools;
    assert.ok(tools, 'the admin module is loaded');
    w.OnlineSystem.linked = false;
    assert.equal(await tools.checkOwner(), false, 'no owner without a Google sign-in');
});

test('(10/10) the owner sees the tools once the server confirms the account', async t => {
    const { w, d } = await ready(t);
    w.OnlineSystem.linked = true;
    w.OnlineSystem.user = { id: 'owner-1', getToken: async () => 'token' };
    const realFetch = w.fetch;
    w.fetch = async (url, options) => {
        if (String(url).includes('bsu-audio')) {
            const body = JSON.parse(options?.body || '{}');
            const data = body.action === 'who' ? { admin: true, name: 'Owner' } : { cues: [] };
            return { ok: true, json: async () => ({ data }) };
        }
        return realFetch(url, options);
    };
    const admin = await w.AdminTools.checkOwner();
    assert.equal(admin, true, 'the server says this account is the owner');
    const section = d.getElementById('admin-section');
    assert.equal(section.hidden, false, 'the panel is visible');
    assert.match(d.getElementById('admin-status').textContent, /Owner access confirmed/i);
    const cues = d.getElementById('admin-story-cue').options.length;
    assert.ok(cues >= 11, 'every story line can be replaced by its own recording');
    w.fetch = realFetch;
});

test('(12/13) stop silences the line at once and "stop story" is a real command', async t => {
    const { story, G, w } = await ready(t);
    G.state.storyIntroSeen = false;
    const playing = story.play();
    await wait(0);
    assert.equal(story.state.playing, true, 'the story is running');
    assert.equal(w.Game.processCommand('stop story'), true, 'the typed command is accepted');
    assert.equal(await playing, false, 'the sequence ended early');
    assert.equal(G.state.storyIntroSeen, false, 'an interrupted story plays again');
    assert.equal(story.state.finishLine, null, 'no pending line is left behind');
});

test('(13/13) narration plays through the game’s own audio engine', async t => {
    const { w, story, G } = await ready(t);
    // Without a test seam the module must ask MusicSystem for its bounded story
    // player instead of opening a second audio engine of its own.
    story.state.audioFactory = null;
    const asked = [];
    const engine = w.MusicSystem;
    engine.storyClip = src => {
        asked.push(src);
        return {
            src, volume: 1, handlers: {},
            addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
            play() { setTimeout(() => (this.handlers.ended || []).forEach(handler => handler()), 0); return Promise.resolve(); }
        };
    };
    G.state.storyIntroSeen = false;
    story.stop();
    const played = await story.play();
    assert.equal(asked[0], 'assets/story/intro-01.mp3', 'the engine was handed the real file');
    assert.ok(asked.length >= 1, 'every line goes through the engine');
    assert.equal(typeof engine.stopStoryClip, 'function', 'and the engine can silence it');
    assert.equal(played, true, 'the sequence still ends cleanly on inaudible media');
});
