/**
 * 7.76.0 — Christmas City, inhabited.
 *
 * The cast, the Herald, the food they hand out, the carols at the arch, the
 * printed posters, a wish at the tree, cocoa, and the chapel bells.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;
const since = (w, mark) => narrative(w).slice(String(mark).length);

async function ready(t, { iso = '2026-12-14T10:00:00Z', at = 'kaliwasch', gold = 200, diamonds = 20 } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [iso])); } };
    const G = w.Game;
    G.state.player = {
        name: 'Town Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 3, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = []; G.state.quests = []; G.state.buffs = {};
    G.state.location = at;
    G.save = () => true; G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    // Build the seasonal city the way the fair does when the calendar turns.
    // Use the window's clock, which the test has pinned to the festival.
    const now = new w.Date();
    w.StarlightFair.sync(G, now);
    w.ChristmasTown.sync(G, now);
    G.state.christmasTown = { fed: {}, carols: {}, wishes: [], bells: {}, heraldSeen: {} };
    return { w, G };
}

const castAt = (w, place) => (w.WorldData.npcs[place] || []).map(npc => npc.name);

/* ───────────────────────────────── the cast ───────────────────────────────── */

test('Christmas City has people in it, in their own rooms, with their own words', async t => {
    const { w, G } = await ready(t);
    assert.ok(w.WorldData.locations.starlight_city_0_0, 'the city exists in December');
    assert.equal(w.ChristmasTown.cast.length, 10);
    for (const person of w.ChristmasTown.cast) {
        assert.ok(w.WorldData.locations[person.place], `${person.name} stands somewhere real`);
        assert.ok(castAt(w, person.place).includes(person.name), `${person.name} is in ${person.place}`);
        assert.equal(person.dialog.length, 3, `${person.name} has three lines of their own`);
        for (const key of ['news', 'food', 'carols', 'tree', 'gifts', 'poster']) {
            assert.ok(person.topics[key], `${person.name} answers about ${key}`);
        }
        const handed = w.WorldData.items[person.food.id] || w.WorldData.items[person.food.id.replace(/_/g, ' ')];
        assert.ok(handed, `${person.name} hands out a real thing`);
    }
    const names = new Set(w.ChristmasTown.cast.map(person => person.name));
    assert.equal(names.size, 10, 'ten different people');
});

test('a person feeds a hero once a day, and no more', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_0_4' });
    assert.ok(castAt(w, 'starlight_city_0_4').includes('Bram Kettle'));
    let mark = narrative(w);
    G.talkToNPC('Bram Kettle');
    const first = since(w, mark);
    assert.match(first, /Bram Kettle/, 'he speaks first');
    assert.match(first, /cocoa/i, 'and puts a cup in your hand');
    assert.ok(G.state.inventory.some(item => item.id === 'cocoa_cup'), 'the cup is really in the bag');

    mark = narrative(w);
    G.talkToNPC('Bram Kettle');
    const second = since(w, mark);
    assert.doesNotMatch(second, /goes into your bag/, 'the second visit of the day brings no second cup');
    assert.equal(G.state.inventory.filter(item => item.id === 'cocoa_cup').length, 1);

    // A different person still has their own thing to give.
    w.Game.enterLocation?.('starlight_city_0_0');
    G.state.location = 'starlight_city_0_0';
    G.talkToNPC('Ilse Marrow');
    assert.ok(G.state.inventory.some(item => item.id === 'sugarplum'), 'Ilse has a sweet of her own');
});

test('asking one of them about the world gets an answer about the world', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_0_1' });
    G.processCommand('ask tamsin about gifts');
    assert.match(narrative(w), /Tamsin Vey: “/);
    assert.match(narrative(w), /gift”, then their name/i, 'she explains the road a present takes');

    const mark = narrative(w);
    G.processCommand('ask about the tree');
    assert.match(since(w, mark), /tree/i);
    G.processCommand('ask about nothing in particular');
    assert.match(narrative(w), /news, the food, the carols, the tree, the gifts/);
});

test('nobody answers from a room they are not standing in', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.processCommand('ask doran about the poster');
    assert.match(narrative(w), /Doran Axle is not here/);
    assert.match(narrative(w), /Sleighwright Yard/);
});

/* ──────────────────────────────── the Herald ──────────────────────────────── */

test('the Herald is one bulletin a day and the same for every hero', async t => {
    const { w, G } = await ready(t);
    G.processCommand('news');
    const first = narrative(w);
    assert.match(first, /The Starlight Herald — December 14/);
    assert.match(first, /weather|frost|snow|thaw|wind/i);

    const other = await ready(t);
    other.G.processCommand('news');
    const a = [...w.ChristmasTown.heraldLines(new w.Date())].map(row => row.line);
    const b = [...other.w.ChristmasTown.heraldLines(new other.w.Date())].map(row => row.line);
    assert.deepEqual(a, b, 'two heroes read the same sheet');

    // A different day is a different sheet.
    const tomorrow = new w.Date('2026-12-15T10:00:00Z');
    assert.notDeepEqual(a, [...w.ChristmasTown.heraldLines(tomorrow)].map(r => r.line));
});

test('the first person you speak to adds the day’s line, once', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_4_0' });
    let mark = narrative(w);
    G.talkToNPC('Captain Hesper Rell');
    assert.match(since(w, mark), /adds, in passing/, 'she passes on the news');
    mark = narrative(w);
    G.talkToNPC('Captain Hesper Rell');
    assert.doesNotMatch(since(w, mark), /adds, in passing/, 'and does not repeat it all evening');
});

/* ──────────────────────────────── the posters ──────────────────────────────── */

test('posters hang on real walls and can be read in full', async t => {
    const { w, G } = await ready(t);
    const places = Object.keys(w.ChristmasTown.posters);
    assert.ok(places.length >= 10, 'ten walls at least');
    for (const place of places) {
        assert.ok(w.WorldData.locations[place], `${place} is a real place`);
        assert.ok((w.WorldData.locations[place].features || []).includes('Christmas poster'), `${place} shows the poster`);
    }
    // Market Square's poster is readable outside the city too.
    G.state.location = 'kaliwasch';
    G.processCommand('read poster');
    const text = narrative(w);
    assert.match(text, /A printed sheet, pasted flat to the wall/);
    assert.match(text, /CHRISTMAS CITY IS OPEN/);
    assert.match(text, /One door on Advent Row opens each night/);
    assert.match(text, /does not discuss the contents/, 'and repeats the shopkeeper’s silence');

    // Somewhere with no wall has nothing to read.
    G.state.location = 'forest';
    G.processCommand('read poster');
    assert.match(narrative(w), /no printed sheet on this wall/i);
    G.processCommand('posters');
    assert.match(narrative(w), /Printed sheets are pasted in \d+ places/);
});

test('each poster is its own sheet, not one sheet copied about', async t => {
    const { w } = await ready(t);
    const titles = new Set(Object.values(w.ChristmasTown.posters).map(poster => poster.title));
    assert.equal(titles.size, Object.keys(w.ChristmasTown.posters).length);
    for (const [place, poster] of Object.entries(w.ChristmasTown.posters)) {
        assert.ok(poster.lines.length >= 4, `${place} says something worth reading`);
    }
});

/* ───────────────────────────────── the carols ───────────────────────────────── */

test('four carols, sung verse by verse, and the last verse earns the bell', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_0_0' });
    G.processCommand('carols');
    assert.match(narrative(w), /Deck the Halls/);
    assert.match(narrative(w), /Silent Night/);
    assert.match(narrative(w), /We Wish You a Merry Christmas/);
    assert.match(narrative(w), /O Christmas Tree/);

    let mark = narrative(w);
    G.processCommand('sing deck the halls');
    assert.match(since(w, mark), /Deck the halls with boughs of holly/);
    for (let i = 0; i < 3; i += 1) G.processCommand('sing deck the halls');
    assert.match(narrative(w), /Ilse presses a small brass bell|whole/);
    assert.ok(G.state.inventory.some(item => item.id === 'christmas_bell'), 'the arch gives a bell for a whole carol');
    assert.equal(G.state.christmasTown.carols.round, 1);
});

test('a carol sung away from the arch only reaches the pigeons', async t => {
    const { w, G } = await ready(t, { at: 'forest' });
    G.processCommand('sing');
    assert.match(narrative(w), /Carolers’ Arch/);
});

/* ───────────────────────────── wishes, cocoa, bells ───────────────────────────── */

test('a wish said at the tree is kept and given back', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_4_2' });
    G.processCommand('wish for a dry road home');
    assert.match(narrative(w), /a dry road home/);
    assert.deepEqual(G.state.christmasTown.wishes.map(wish => wish.text), ['a dry road home']);
    const mark = narrative(w);
    G.processCommand('wish');
    assert.match(since(w, mark), /say it again, the way it was said the first time: “a dry road home”/);

    G.state.location = 'kaliwasch';
    G.processCommand('wish for anything');
    assert.match(narrative(w), /at the trunk of the Grand Christmas Tree, and nowhere else/);
});

test('cocoa is sold for rupees at the terrace', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_0_4', gold: 20 });
    G.processCommand('buy cocoa');
    assert.equal(G.state.player.gold, 14, 'six rupees');
    assert.ok(G.state.inventory.some(item => item.id === 'cocoa_cup'));
    assert.match(narrative(w), /pay Bram 6 rupees/);

    G.state.player.gold = 2;
    G.processCommand('buy cocoa');
    assert.match(narrative(w), /A cup is 6 rupees and you carry 2/);
    assert.equal(G.state.player.gold, 2);
});

test('the chapel bells answer once a night and then keep quiet', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_1_0' });
    const played = [];
    w.MusicSystem.playSFX = name => played.push(name);
    assert.equal(G.ringCandleBells(new w.Date()), true);
    assert.match(narrative(w), /the arch answers from across the city/);
    assert.deepEqual(played, ['game-win'], 'a recorded bell, not a synthesised one');
    assert.equal(G.ringCandleBells(new w.Date()), false);
    assert.match(narrative(w), /already answered tonight/);

    G.state.location = 'kaliwasch';
    assert.equal(G.ringCandleBells(new w.Date()), false);
    assert.match(narrative(w), /bells hang in the Candle Chapel/);
});

/* ───────────────────────── the season closes the city ───────────────────────── */

test('outside December there is no cast and no posters', async t => {
    const { w, G } = await ready(t, { iso: '2026-07-14T10:00:00Z' });
    w.ChristmasTown.sync(G, new Date());
    const names = new Set(w.ChristmasTown.cast.map(person => person.name));
    for (const [place, list] of Object.entries(w.WorldData.npcs)) {
        for (const npc of list) assert.equal(names.has(npc.name), false, `${npc.name} is not here in July (${place})`);
    }
    for (const place of Object.keys(w.ChristmasTown.posters)) {
        assert.equal((w.WorldData.locations[place]?.features || []).includes('Christmas poster'), false, `${place} has no poster in July`);
    }
    G.processCommand('read poster');
    assert.match(narrative(w), /no printed sheet on this wall/i);
});

test('the town’s state travels with the hero', async t => {
    const { w, G } = await ready(t, { at: 'starlight_city_4_2' });
    G.processCommand('wish for snow on the twenty-fifth');
    const saved = G.getSaveData();
    assert.deepEqual([...saved.christmasTown.wishes].map(wish => wish.text), ['snow on the twenty-fifth']);
    assert.ok(w.ChristmasTown.dayKey(new w.Date()).startsWith('2026-12-14'));
});
