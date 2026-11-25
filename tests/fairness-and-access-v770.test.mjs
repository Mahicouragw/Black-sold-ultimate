/**
 * 7.70.0 — fairness, honest sounds and a house anyone can actually buy.
 *
 * Three things the owner reported after playing:
 *  - a locked door played the sound of a door opening;
 *  - "buy house" answered "Buy houses only from an estate agent on House Lane"
 *    with no way to find one, so the action felt missing;
 *  - battles could delete a full-health hero in a single blow, and advent doors
 *    were lost forever if a night was missed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t, { iso = '2026-12-07T10:00:00Z', gold = 5000, diamonds = 400 } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [iso])); } };
    const G = w.Game;
    G.state.player = {
        name: 'Fair Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 1, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = [];
    G.state.quests = [];
    G.state.inQuest = false;
    G.state.location = 'kaliwasch';
    G.save = () => true;
    G.updateHUD = () => {};
    return { w, G };
}

/* ───────────────────────────── locked doors ───────────────────────────── */

test('a locked private door does not sound like an opening door', async t => {
    const { w, G } = await ready(t);
    const played = [];
    const real = w.MusicSystem.playSFX.bind(w.MusicSystem);
    w.MusicSystem.playSFX = (name, options) => { played.push(name); return real(name, options); };

    G.state.location = 'private_house_kaliwasch_door';
    G.state.housing = { houses: {} };
    G.openPhysicalDoor();
    assert.ok(!played.includes('door'), `no door-opening sound when the door stays locked (heard: ${played.join(', ') || 'nothing'})`);
    assert.ok(played.includes('board-error'), 'the refusal has its own honest sound');
    assert.match(w.document.getElementById('narrative').textContent, /locked/i);

    // The owner's own door does open, and does sound like it.
    G.state.housing = { houses: { kaliwasch: { ownedAt: Date.now(), taxPaidUntil: Date.now() + 86400000, storage: [] } } };
    played.length = 0;
    G.openPhysicalDoor();
    assert.ok(played.includes('door'), 'the owner hears the key turn');
    assert.match(w.document.getElementById('narrative').textContent, /key turns/i);
});

/* ───────────────────────────── buying a house ───────────────────────────── */

test('houses for sale names every city, its price and where the agent stands', async t => {
    const { w, G } = await ready(t);
    w.document.getElementById('narrative').replaceChildren();
    G.processCommand('houses for sale');
    const text = w.document.getElementById('narrative').textContent;
    for (const city of ['Kaliwasch', 'Aurora City', 'Ironspire City', 'Seabreeze City']) assert.match(text, new RegExp(city));
    assert.match(text, /Kaliwasch: 100 diamonds/);
    assert.match(text, /You carry 400 diamonds/, 'a deed is paid in diamonds, never money');
    assert.match(text, /buy house/i, 'the command to use is named');
});

test('the estate agent can be found from anywhere, with the real route', async t => {
    const { w, G } = await ready(t);
    w.document.getElementById('narrative').replaceChildren();
    G.processCommand('estate agent');
    const text = w.document.getElementById('narrative').textContent;
    assert.match(text, /second street of every city grid/i);
    assert.match(text, /district street 2/i);
    assert.match(text, /buy house kaliwasch/i, 'the distance purchase is offered too');
});

test('the estate agent street offers the purchase as a button', async t => {
    const { w, G } = await ready(t);
    G.state.housing = { houses: {} };
    G.enterLocation('kaliwasch_district_2');
    const box = w.document.getElementById('context-actions');
    assert.match(box.innerHTML, /Houses for Sale/);
    assert.match(box.innerHTML, /Buy This House — 100 Diamonds/);
});

test('a house can be bought at the agent, or from a distance by naming the city', async t => {
    const { w, G } = await ready(t);
    G.state.housing = { houses: {} };

    // At the agent, no city named.
    G.enterLocation('kaliwasch_district_2');
    const gold = G.state.player.gold, diamonds = G.state.player.diamonds;
    assert.equal(G.buyHouse(), true);
    assert.equal(G.state.player.diamonds, diamonds - 100, 'the deed cost diamonds');
    assert.equal(G.state.player.gold, gold, 'and no rupees at all');
    assert.ok(G.state.housing.houses.kaliwasch, 'the deed is recorded');
    assert.match(w.document.getElementById('narrative').textContent, /purchase the Kaliwasch private house/i);

    // From the other side of the world, naming the city.
    G.state.location = 'forest';
    assert.equal(G.buyHouse('aurora'), true);
    assert.ok(G.state.housing.houses.aurora, 'the named city is bought');
    assert.equal(G.buyHouse('aurora'), false, 'and never bought twice');
    assert.match(w.document.getElementById('narrative').textContent, /already own/i);
});

test('a purse that is too light is told exactly how much is missing', async t => {
    const { w, G } = await ready(t, { diamonds: 20 });
    G.state.housing = { houses: {} };
    assert.equal(G.buyHouse('kaliwasch'), false);
    const text = w.document.getElementById('narrative').textContent;
    assert.match(text, /costs 100 diamonds/i);
    assert.match(text, /80 diamonds are still missing/i);
    assert.match(text, /Wrapped Parcel|rune shop|bounty board/i, 'a way forward is offered');
    assert.match(text, /diamonds/i);
});

test('an unknown city signs no deed and lists the real cities', async t => {
    const { w, G } = await ready(t);
    G.state.housing = { houses: {} };
    assert.equal(G.buyHouse('atlantis'), false);
    const text = w.document.getElementById('narrative').textContent;
    assert.match(text, /No deed was signed/i);
    assert.match(text, /Kaliwasch \(100 diamonds\)/);
    assert.match(text, /buy house kaliwasch/i);
});

/* ───────────────────────────── battle fairness ───────────────────────────── */

test('one blow can never take more than two fifths of the hero’s health', async t => {
    const { w, G } = await ready(t);
    G.state.inCombat = true;
    G.state.enemy = { name: 'Doom Titan', hp: 900, maxHp: 900, attack: 400, xp: 10, gold: 10, boss: false, braceTurns: 1, roarActive: true };
    G.state.player.dex = 0;
    w.Math.random = () => 0.99;                       // never miss, never brace
    await G.enemyAttack();
    await wait(30);
    assert.equal(G.state.player.hp, 60, 'capped at exactly 40 of 100');
    assert.match(w.document.getElementById('narrative').textContent, /glances off/i);
});

test('a boss may take half, and no more', async t => {
    const { w, G } = await ready(t);
    G.state.inCombat = true;
    G.state.enemy = { name: 'Crowned Titan', hp: 900, maxHp: 900, attack: 400, xp: 10, gold: 10, boss: true, braceTurns: 1, roarActive: true };
    G.state.player.dex = 0;
    w.Math.random = () => 0.99;
    await G.enemyAttack();
    await wait(30);
    assert.equal(G.state.player.hp, 50, 'capped at exactly half');
});

test('no creature starts a fight able to empty the hero, however it scales', async t => {
    const { w, G } = await ready(t);
    const base = w.WorldData.enemies.wolf;
    assert.ok(base, 'the wolf exists in the world data');
    G.state.player.level = 40;
    G.startCombat('wolf');
    const e = G.state.enemy;
    assert.ok(e.hp > base.hp * 3, `endurance still scales (${e.hp} against ${base.hp})`);
    assert.ok(e.attack <= Math.floor(G.state.player.maxHp * 0.4), `the swing is capped (${e.attack} against a 100-health hero)`);
    const status = G.fairnessStatus();
    assert.equal(status.worstSingleBlow, 40);
    G.state.inCombat = false;
});

test('the fairness command explains the rule in plain words', async t => {
    const { w, G } = await ready(t);
    w.document.getElementById('narrative').replaceChildren();
    G.processCommand('fairness');
    assert.match(w.document.getElementById('narrative').textContent, /two fifths of your health/);
    assert.match(w.document.getElementById('narrative').textContent, /40 of 100/);
});

test('a companion struck in the same turn is a rarer, lighter blow', async t => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../game.js', import.meta.url), 'utf8'));
    assert.match(source, /Math\.random\(\) < 0\.25/, 'the splash chance is one in four');
    assert.match(source, /Math\.floor\(e\.attack \* 0\.5\)/, 'and the splash is half a blow');
});

/* ───────────────────────────── Christmas fairness ───────────────────────────── */

test('advent doors stay open after their night, and the future stays sealed', async t => {
    const { w, G } = await ready(t, { iso: '2026-12-20T10:00:00Z' });
    const A = w.AdventCalendar;
    w.StarlightFair.sync(G);
    A.sync(G);
    assert.equal(A.doorState(3), 'past');
    assert.equal(A.doorOpen(3), true, 'a missed night can still be walked');
    assert.equal(A.doorOpen(1), true);
    assert.equal(A.doorOpen(21), false, 'tomorrow is still sealed');
    assert.equal(A.doorState(21), 'sealed');

    // Walking into a past door really works, and the future one really refuses.
    G.state.location = 'starlight_advent_row_3';
    G.processCommand('christmas open');
    assert.equal(G.state.location, 'starlight_advent_room_3');
    G.state.location = 'starlight_advent_row_21';
    G.processCommand('christmas open');
    assert.equal(G.state.location, 'starlight_advent_row_21');
    assert.match(w.document.getElementById('narrative').textContent, /December 21/);
});

test('every door still gives its story, secret and present', async t => {
    const { w, G } = await ready(t, { iso: '2026-12-20T10:00:00Z' });
    const A = w.AdventCalendar;
    w.StarlightFair.sync(G);
    A.sync(G);
    G.state.location = 'starlight_advent_room_3';
    G.processCommand('christmas story');
    assert.ok(A.journal(G).heard[3], 'a past door still tells its story');
});
