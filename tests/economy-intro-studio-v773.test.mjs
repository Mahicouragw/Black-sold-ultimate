/**
 * 7.73.0 — the purse, the opening story's recorded effects, and a studio that
 * says why publishing is closed.
 *
 * What the owner asked for:
 *  - the economy shown properly, with incense paid for in diamonds like the
 *    signs it stands beside;
 *  - the opening story played over music and a recorded effect for every line,
 *    with a place for the owner's own recordings to take over;
 *  - the blessing effect checked, and the studio's publish failures named
 *    instead of swallowed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from '../scripts/load-world.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

async function ready(t, { diamonds = 120, gold = 900 } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const G = w.Game;
    G.state.player = {
        name: 'Purse Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        rubies: 2, goldRubies: 1, level: 4, xp: 30, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = []; G.state.quests = []; G.state.buffs = {};
    G.state.economy = { settledTransactions: {}, battlesSinceRuby: 0, ledger: [] };
    G.save = () => true; G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    return { w, G };
}


/** A clip that ends at once, so a test never waits for real audio. */
function fastStory(w) {
    w.StoryIntro.state.audioFactory = src => {
        const listeners = {};
        return {
            src,
            addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
            play() { setTimeout(() => (listeners.ended || []).forEach(listener => listener()), 0); return Promise.resolve(); },
            pause() {}
        };
    };
}

/* ───────────────────────────────── the purse ───────────────────────────────── */

test('the purse shows every coin with what it buys, and where diamonds come from', async t => {
    const { w, G } = await ready(t);
    assert.equal(G.showPurse(), true);
    const panel = w.document.getElementById('shop-panel'), text = w.document.getElementById('shop-content').textContent;
    assert.equal(panel.classList.contains('hidden'), false, 'the purse is a real panel');
    for (const label of ['Diamonds', 'Rupees', 'Rubies', 'Gold rubies']) assert.ok(text.includes(label), `${label} is on the purse`);
    assert.match(text, /120/);
    assert.match(text, /Deeds 100–300 · signs 6–22 · incense 3/);
    assert.match(text, /Where diamonds come from/);
    assert.match(text, /gift shop/i, 'the presents are named as a source');
    const cards = w.document.getElementById('shop-content').querySelectorAll('.purse-card');
    assert.equal(cards.length, 4, 'one card per coin');
    G.processCommand('purse');
    assert.equal(w.document.getElementById('shop-panel').classList.contains('hidden'), false, 'the word "purse" opens it too');
});

test('incense is a diamond curiosity, not a rupee one', async t => {
    const { w, G } = await ready(t);
    const entry = w.SignShop.stock.find(row => row.id === 'incense');
    assert.equal(entry.currency, 'diamonds', 'incense is paid for in diamonds');
    assert.equal(entry.price, 3);
    G.state.location = 'arcane_enchantery';
    G.showRuneShop();
    const text = w.document.getElementById('shop-content').textContent;
    assert.match(text, /Incense3 diamonds/, 'the counter says so plainly');
    const before = G.state.player.diamonds, gold = G.state.player.gold;
    assert.equal(G.buyRuneShopItem('incense'), true);
    assert.equal(G.state.player.diamonds, before - 3, 'three diamonds left the purse');
    assert.equal(G.state.player.gold, gold, 'no rupee was touched');
});

/* ─────────────────────────── the opening story sounds ─────────────────────────── */

test('every line of the opening story has a recorded effect that ships with the game', async t => {
    const { w } = await ready(t);
    const intro = w.StoryIntro;
    assert.equal(intro.INTRO.length, 6);
    const used = new Set();
    for (const line of intro.INTRO) {
        const key = intro.sfxFor(line);
        assert.ok(key, `${line.cue} has an effect`);
        const src = w.MusicSystem.resolveSFX(key);
        assert.equal(typeof src, 'string', `${key} resolves to a recording`);
        const file = join(ROOT, src);
        const info = await stat(file).catch(() => null);
        assert.ok(info && info.size > 0, `${src} really exists`);
        used.add(key);
    }
    assert.equal(used.size, intro.INTRO.length, 'no two lines share an effect');
    const music = w.MusicSystem.music?.['intro'];
    assert.ok(music?.src, 'the story opens over its own music');
    assert.ok((await stat(join(ROOT, music.src)).catch(() => null))?.size > 0, 'and that music ships too');
});

test('the blessing effect is its own recording, and plays for the temple and the story', async t => {
    const { w } = await ready(t);
    const src = w.MusicSystem.resolveSFX('blessing');
    assert.equal(src, 'assets/audio/sfx/heal-chain.wav', 'the blessing no longer borrows the magic zap');
    assert.ok((await stat(join(ROOT, src))).size > 0, 'the recording exists');
    assert.equal(w.StoryIntro.INTRO[1].sfx, 'blessing', 'the second line of the story is the blessing');
    const played = [];
    fastStory(w);
    w.MusicSystem.playSFX = name => played.push(name);
    await w.StoryIntro.play();
    assert.ok(played.includes('blessing'), 'the blessing is heard during the opening');
    assert.equal(played.length >= 6, true, 'every line rings something');
});

test('a recording published for one line takes that line over', async t => {
    const { w } = await ready(t);
    const line = w.StoryIntro.INTRO[1];
    w.MusicSystem.sfx[`${line.cue}-sfx`] = ['https://cdn.example.test/intro-02-sfx.mp3'];
    assert.equal(w.StoryIntro.sfxFor(line), 'intro-02-sfx', 'the studio cue wins');
    const played = [];
    fastStory(w);
    w.MusicSystem.playSFX = name => played.push(name);
    await w.StoryIntro.play();
    assert.ok(played.includes('intro-02-sfx'), 'and it is the one that plays');
    const status = w.StoryIntro.status();
    assert.equal(status.intro[1].sfx, 'intro-02-sfx', 'the owner panel reports the truth');
});

/* ────────────────────────────── publishing, explained ────────────────────────────── */

async function studio(t, handler) {
    const { w } = await ready(t);
    w.OnlineSystem.user = { id: 'owner-uid', getToken: async () => 'id-token' };
    w.fetch = handler;
    w.SoundStudio.open = w.SoundStudio.open || (() => {});
    return { w };
}

test('a studio gateway that was never deployed is named as such', async t => {
    const { w } = await studio(t, async () => ({ ok: false, status: 404, json: async () => { throw new Error('html'); }, text: async () => '<html>not found</html>' }));
    const allowed = await w.SoundStudio.checkPublishing();
    assert.equal(allowed, false);
    const text = w.document.getElementById('sound-studio-status').textContent;
    assert.match(text, /does not answer/);
    assert.match(text, /deployed/i, 'the reason names the fix');
});

test('an account that is not on the owner list is told its id and what to do', async t => {
    const { w } = await studio(t, async (url, options = {}) => {
        if (String(url).includes('list=1')) return { ok: true, status: 200, json: async () => ({ data: { cues: [] } }) };
        const body = JSON.parse(options.body || '{}');
        if (body.action === 'who') return { ok: true, status: 200, json: async () => ({ data: { admin: false, uid: 'abc-123' } }) };
        return { ok: true, status: 200, json: async () => ({ data: {} }) };
    });
    const allowed = await w.SoundStudio.checkPublishing();
    assert.equal(allowed, false);
    const text = w.document.getElementById('sound-studio-status').textContent;
    assert.match(text, /not on the owner list/);
    assert.match(text, /abc-123/, 'the exact id to add');
});

test('the owner is told publishing is open, and how many sounds are live', async t => {
    const { w } = await studio(t, async (url, options = {}) => {
        if (String(url).includes('list=1')) return { ok: true, status: 200, json: async () => ({ data: { cues: [{ cue: 'door' }, { cue: 'coin' }] } }) };
        const body = JSON.parse(options.body || '{}');
        if (body.action === 'who') return { ok: true, status: 200, json: async () => ({ data: { admin: true, uid: 'owner-uid', name: 'Owner' } }) };
        return { ok: true, status: 200, json: async () => ({ data: {} }) };
    });
    assert.equal(await w.SoundStudio.checkPublishing(), true);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /publishing is open/);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /2 sounds published/);
});

test('a server refusal reaches the player as words, never as a silent failure', async t => {
    const { w } = await studio(t, async () => ({ ok: false, status: 413, json: async () => { throw new Error('too large'); } }));
    const allowed = await w.SoundStudio.checkPublishing();
    assert.equal(allowed, false);
    assert.match(w.document.getElementById('sound-studio-status').textContent, /does not answer|too large/i);
});

test('a file too big for the server is refused with the reason', async t => {
    const { w } = await ready(t);
    assert.match(await readFile(join(ROOT, 'sound-studio-v764.js'), 'utf8'), /too large for the server to accept/);
});
