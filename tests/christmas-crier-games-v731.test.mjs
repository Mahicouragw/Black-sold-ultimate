import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t, iso = '2026-12-07T10:00:00Z') {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game, Base = w.Date;
    w.Date = class extends Base { constructor(...args) { super(...(args.length ? args : [iso])); } };
    G.state.player = { name: 'Crier Tester', hp: 20, maxHp: 20, gold: 100, diamonds: 0, inventory: [], xp: 0 };
    G.state.screen = 'game-screen'; G.save = () => true; G.updateHUD = () => {};
    w.StarlightFair.sync(G); w.AdventCalendar.sync(G);
    const played = [];
    const Base2 = w.Audio;
    w.Audio = class extends Base2 { constructor(src) { super(src); played.push(String(src)); } };
    return { w, G, A: w.AdventCalendar, C: w.ChristmasCrier, Games: w.ChristmasGames, Fair: w.StarlightFair, played };
}

const narrative = w => w.document.getElementById('narrative').textContent;

test('Crier Bell stands in the tavern and on the market square and speaks recorded answers', async t => {
    const { w, G, C, played } = await ready(t);
    C.sync(G);
    assert.ok(w.WorldData.npcs.kaliwasch.some(n => n.name === 'Crier Bell'), 'market square crier');
    assert.ok(w.WorldData.npcs.kaliwasch_tavern.some(n => n.name === 'Crier Bell'), 'tavern crier');
    for (let i = 1; i <= 8; i++) assert.ok(existsSync(`assets/crier/line-0${i}.mp3`), `recorded line ${i} ships`);

    G.state.location = 'kaliwasch';
    G.processCommand('say hello');
    assert.match(narrative(w), /Crier Bell/, 'the crier answers a greeting');
    assert.ok(played.some(src => src.endsWith('line-01.mp3')), 'with his own recorded voice, not the device voice');

    G.processCommand('say where is the map');
    assert.ok(played.some(src => src.endsWith('line-02.mp3')), 'map answer is recorded');
    G.processCommand('christmas news');
    assert.ok(played.some(src => src.endsWith('line-07.mp3')), 'news answer is recorded');
    assert.match(narrative(w), /twenty-five date-locked doors/i);

    G.state.location = 'kaliwasch_tavern';
    G.processCommand('say tell me about the games');
    assert.ok(played.some(src => src.endsWith('line-06.mp3')), 'tavern crier answers about the game hall');

    // Outside the season the crier is not standing there.
    const Base = w.Date; w.Date = class extends Base { constructor(...a) { super(...(a.length ? a : ['2027-03-02T10:00:00Z'])); } };
    C.sync(G);
    assert.ok(!w.WorldData.npcs.kaliwasch.some(n => n.name === 'Crier Bell'));
});

test('the game hall is walkable and every arcade game opens from its room', async t => {
    const { w, G, Games } = await ready(t);
    Games.sync(G);
    assert.ok(w.WorldData.locations.starlight_game_hall, 'hall lobby exists');
    assert.equal(w.WorldData.locations.starlight_advent_gate.exits.south, 'starlight_game_hall');
    for (const key of ['chess', 'ludo', 'snakes', 'carrom', 'blackjack']) {
        assert.ok(w.WorldData.locations[`starlight_game_hall_${key}`], `${key} room exists`);
        assert.equal(JSON.parse(JSON.stringify(w.WorldData.locations[`starlight_game_hall_${key}`].features)).join('|'), `game hall room|${key}`);
    }
    let opened = 0;
    w.GameHall = { open: () => opened++, select: () => opened++ };
    G.state.location = 'starlight_game_hall';
    G.processCommand('play chess');
    await wait(10);
    assert.equal(G.state.location, 'starlight_game_hall_chess', 'play chess walks you into the chess room');
    assert.ok(opened >= 2, 'and opens the shipped accessible game panel');
    G.state.location = 'starlight_game_hall';
    G.processCommand('christmas games');
    assert.ok(opened >= 3);
});

test('levers, number keys, hidden vaults and cooking scrolls all work', async t => {
    const { w, G, A } = await ready(t);
    A.sync(G);
    // The lever opens the toymaker's vault.
    G.state.location = 'starlight_candy_cane_lane';
    G.processCommand('christmas pull lever');
    assert.equal(w.WorldData.locations.starlight_candy_cane_lane.exits.north, 'starlight_toy_vault');
    G.enterLocation('starlight_toy_vault');
    G.processCommand('christmas open chest');
    assert.ok(G.state.inventory.length > 0, 'the hidden chest holds a real present');
    const before = G.state.inventory.length;
    G.processCommand('christmas open chest');
    assert.equal(G.state.inventory.length, before, 'the chest opens once');

    // The clock strongroom needs the secret word from door twelve.
    G.state.location = 'starlight_city_1_2';
    G.processCommand('christmas use key');
    assert.equal(w.WorldData.locations.starlight_city_1_2.exits.up, undefined, 'locked without the number');
    A.journal(G).secret[12] = 1;
    G.processCommand('christmas use key');
    assert.equal(w.WorldData.locations.starlight_city_1_2.exits.up, 'starlight_clock_vault');
    G.enterLocation('starlight_clock_vault');
    const gold = G.state.player.gold;
    G.processCommand('christmas take scrolls');
    assert.equal(G.state.player.gold, gold + 40);
    assert.equal(G.state.inventory.filter(i => i.id === 'christmas cooking scroll').reduce((n, i) => n + i.quantity, 0), 2);

    // Reading a scroll restocks real cooking ingredients.
    G.processCommand('christmas read scroll');
    const foods = G.state.inventory.filter(i => ['winter apples', 'honey jar', 'ginger root', 'flour sack'].includes(i.id));
    assert.equal(foods.length, 2, 'two ingredients from the scroll');
    assert.equal(G.state.inventory.filter(i => i.id === 'christmas cooking scroll').reduce((n, i) => n + i.quantity, 0), 1);
});

test('the market stall sells ingredients for gold, and a battle can win a scroll', async t => {
    const { w, G, A } = await ready(t);
    A.sync(G);
    G.state.location = 'starlight_candy_stall';
    G.processCommand('christmas buy apples');
    assert.equal(G.state.player.gold, 88);
    assert.equal(G.state.inventory.find(i => i.name === 'Winter Apples')?.quantity, 1);
    G.processCommand('christmas kitchen');
    assert.match(narrative(w), /Winter Apples/);

    // A victory in Christmas City can drop a scroll or an ingredient.
    w.Math.random = () => .1;
    G.state.location = 'starlight_city_2_2';
    const dropped = A.battleDrop(G);
    const drops = G.state.inventory.filter(i => i.id === 'christmas cooking scroll' || i.type === 'food');
    assert.ok(dropped && drops.length > 0, 'battle drops cooking material');
    G.state.location = 'kaliwasch';
    assert.equal(A.battleDrop(G), false, 'ordinary world battles drop nothing');
});

test('the Google button always answers a click, even when the provider cannot load', async t => {
    const { w } = await ready(t);
    const O = w.OnlineSystem;
    O.client = null; O.init = async () => {};
    w.Game.bindEvents();
    w.document.getElementById('btn-google-signin').click();
    await wait(30);
    assert.equal(w.document.getElementById('google-login-panel').classList.contains('hidden'), false, 'the panel opens');
    const status = w.document.getElementById('google-login-status').textContent;
    assert.ok(status.length > 20, 'and explains what happened instead of doing nothing');
    assert.match(status, /guest|Chrome|connection/i);
});

test('greetings use the character audio and never a "thinking" placeholder', async t => {
    const { w } = await ready(t);
    const line = w.AiNpc.smallTalk({ name: 'Tavern Keeper Greta' }, 'hello');
    assert.ok(line, 'a recorded greeting is chosen');
    assert.ok(w.CharacterRecordings.has('Tavern Keeper Greta', line));
    assert.equal(w.AiNpc.smallTalk({ name: 'Tavern Keeper Greta' }, 'where is the forest'), '');
    assert.ok(w.AiNpc.voiceFor('Tavern Keeper Greta').startsWith('system:') || w.AiNpc.voiceFor('Tavern Keeper Greta') === '');
});
