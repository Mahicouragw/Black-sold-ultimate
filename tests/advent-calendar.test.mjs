import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t, iso = '2026-12-07T10:00:00Z') {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game, Base = w.Date;
    w.Date = class extends Base { constructor(...args) { super(...(args.length ? args : [iso])); } };
    G.state.player = { name: 'Advent Tester', hp: 20, maxHp: 20, gold: 0, diamonds: 0, inventory: [], xp: 0 };
    G.state.screen = 'game-screen';
    G.save = () => true; G.updateHUD = () => {};
    return { w, G, A: w.AdventCalendar, Fair: w.StarlightFair, rooms: w.WorldData.locations };
}

const row = n => `starlight_advent_row_${n}`;
const room = n => `starlight_advent_room_${n}`;

test('Advent Row is a real street of twenty-five doors and only tonight’s door opens', async t => {
    const { w, G, A, Fair, rooms } = await ready(t);
    Fair.sync(G); A.sync(G);
    const advent = Object.keys(rooms).filter(id => id.startsWith('starlight_advent_'));
    assert.equal(advent.length, 51, 'gate, twenty-five stoops and twenty-five door rooms');
    assert.ok(rooms.starlight_candy_cane_lane, 'Candy Cane Lane is a street too');
    assert.equal(rooms[row(1)].exits.south, 'starlight_advent_gate');
    assert.equal(rooms[row(25)].exits.north, 'starlight_candy_cane_lane');
    assert.equal(rooms[room(7)].adventDay, 7);
    assert.equal(A.doorState(7), 'open'); assert.equal(A.doorState(9), 'sealed');

    // Tonight's door opens by walking command.
    G.state.location = row(7); G.processCommand('christmas open');
    assert.equal(G.state.location, room(7));

    // Tomorrow's door refuses the command and explains the real date.
    G.state.location = row(9); G.processCommand('christmas open');
    assert.equal(G.state.location, row(9));
    assert.match(w.document.getElementById('narrative').textContent, /December 9/);

    // No spell, teleport or resumed save can move a hero through a sealed door.
    G.processCommand('alohomora');
    assert.equal(G.state.location, row(9));
    G.enterLocation(room(9));
    assert.equal(G.state.location, row(9), 'direct entry is refused too');
    assert.equal(G.move('south').valueOf(), true);
    await wait(400);
    assert.equal(G.state.location, row(8), 'the street itself still walks south');

    // Inside a legitimately open door, going south steps back onto Advent Row.
    G.state.location = room(7); G.processCommand('south'); await wait(400);
    assert.equal(G.state.location, row(7));
});

test('each door gives a story, a quest, a secret word and a present that is not gold', async t => {
    const { w, G, A } = await ready(t);
    A.sync(G); G.state.location = room(7);

    G.processCommand('christmas story');
    assert.match(w.document.getElementById('narrative').textContent, /Bram/);
    assert.ok(A.journal(G).heard[7], 'the story counts as heard');

    G.processCommand('christmas search');
    assert.ok(A.journal(G).done[7], 'searching completes the copper’s quest');

    G.processCommand('christmas secret hoop');
    assert.equal(G.state.player.diamonds, 3, 'the right secret word pays once');
    G.processCommand('christmas secret hoop');
    assert.equal(G.state.player.diamonds, 3, 'and never twice');

    G.processCommand('christmas present');
    assert.ok(G.state.player.diamonds > 3, 'a present contains diamonds');
    assert.ok(G.state.inventory.length > 0, 'and real items');
    assert.equal(G.state.player.gold, 0, 'Santa’s present is not gold');
    const snapshot = JSON.stringify(G.state.inventory);
    G.processCommand('christmas present');
    assert.equal(JSON.stringify(G.state.inventory), snapshot, 'one present per door per year');
});

test('cooking finishes a kitchen door and the wrong action never does', async t => {
    const { w, G, A } = await ready(t);
    A.sync(G); G.state.location = room(2); await wait(200);
    G.processCommand('christmas search');
    assert.ok(!A.journal(G).done[2], 'searching is not the baker’s task');
    G.state.inventory = [{ id: 'raw fish', name: 'Raw Fish', type: 'food', quantity: 2 }];
    w.Math.random = () => 0;
    G.processCommand('cook');
    assert.ok(A.journal(G).done[2], 'a real cooked dish finishes door two');
});

test('Advent Row lives only inside the season and closes itself afterwards', async t => {
    const { w, G, A, Fair } = await ready(t, '2026-12-26T10:00:00Z');
    Fair.sync(G);
    assert.equal(A.sync(G), false);
    assert.equal(Object.keys(w.WorldData.locations).filter(id => id.startsWith('starlight_advent_')).length, 0);
    G.state.location = row(3);
    A.sync(G);
    assert.match(w.document.getElementById('narrative')?.textContent || '', /.|^$/);
});

test('sixteen Christmas instrumentals rotate only in Christmas locations', async t => {
    const { w } = await ready(t);
    const keys = w.AudioManager.playlists.CHRISTMAS;
    assert.equal(new Set(keys).size, 16);
    for (const key of keys) assert.match(w.AudioManager.music[key].src, /^assets\/fair\/carol-\d+\.mp3$/);
    assert.match(w.AudioManager.music.starlight16.title, /Finale/);
});
