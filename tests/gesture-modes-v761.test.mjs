import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.61.0 — gesture contexts. Each gesture belongs to exactly one mode:
 * exploration, combat, inventory, object, chess, snakes or ludo. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true; w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Modes Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    const api = w.GestureAccessibility;
    api.settings.scheme = 'walk'; api.UI.save();
    const spoken = [];
    api.settings.narration = true;
    w.AudioManager.playVoice = text => { spoken.push(String(text)); return Promise.resolve(true); };
    api.UI.close();
    G.enterLocation('kaliwasch');
    return { w, G, UI: api.UI, M: w.GestureModes, spoken };
}

function selectItem(M, name) {
    const ci = M.inventory.categories.findIndex(group => group.items.some(item => item.name === name));
    assert.ok(ci >= 0, `${name} is in a real category`);
    M.inventory.ci = ci;
    M.inventory.ii = M.inventory.categories[ci].items.findIndex(item => item.name === name);
    return M.inventory.categories[ci].items[M.inventory.ii];
}

const add = (w, G, id, times = 1) => {
    for (let i = 0; i < times; i++) G.addItemToInventory(id, w.WorldData.items[id]);
    return G.state.inventory.find(item => item.id === id);
};

test('inventory mode browses real categories and items only', async t => {
    const { w, G, M } = await ready(t);
    add(w, G, 'healing potion'); add(w, G, 'goblin axe'); add(w, G, 'skeleton key');
    M.open();
    assert.equal(M.current(), 'inventory');
    const names = M.inventory.categories.map(group => group.name);
    assert.ok(names.includes('Weapons'));
    assert.ok(names.includes('Healing'));
    assert.ok(names.includes('Keys'));
    const healing = M.inventory.categories[M.inventory.ci].items;
    assert.ok(healing.every(item => G.state.inventory.includes(item)), 'categories list carried stacks, not copies');
    M.browseCategory(1);
    assert.equal(M.inventory.ii, 0, 'changing category resets the item cursor');
});

test('inventory mode consumes its own swipes and never walks or turns', async t => {
    const { w, G, UI, M } = await ready(t);
    add(w, G, 'bread');
    const before = G.state.location;
    M.open();
    UI.handle('up');
    UI.handle('left');
    UI.handle('two-right');
    assert.equal(G.state.location, before, 'inventory swipes must not move the hero');
    assert.equal(M.current(), 'inventory');
});

test('double tap inspects, long press offers real actions and two finger tap closes', async t => {
    const { w, G, M, spoken } = await ready(t);
    add(w, G, 'healing potion');
    M.open();
    selectItem(M, 'Healing Potion');
    M.inspect();
    await wait(20);
    assert.ok(spoken.some(line => /Healing Potion/.test(line)), 'inspection names the item');
    assert.ok(spoken.some(line => /Quantity 1/.test(line)), 'inspection reads the real quantity');
    M.actions();
    const labels = M ? w.GestureAccessibility.UI.menu.choices.map(c => c.label) : [];
    assert.ok(labels.some(label => /Use Healing Potion/.test(label)));
    assert.ok(labels.some(label => /Drop one Healing Potion/.test(label)));
    w.GestureAccessibility.UI.close();
    M.close();
    assert.equal(M.current(), 'exploration');
});

test('equip announces the replaced item and reads the real new attributes', async t => {
    const { w, G, M, spoken } = await ready(t);
    const sword = add(w, G, 'iron sword');
    const axe = add(w, G, 'goblin axe');
    G.equipItem('iron sword');
    assert.equal(G.state.player.weapon, 'Iron Sword');
    spoken.length = 0;
    M.equip(axe);
    await wait(20);
    assert.equal(G.state.player.weapon, 'Goblin Axe', 'the real weapon changed');
    assert.equal(G.state.player.weaponDamage, 12);
    assert.ok(spoken.some(line => /Replacing Iron Sword/.test(line)), 'the player hears what was replaced');
    assert.ok(spoken.some(line => /Goblin Axe/.test(line)), 'the new weapon is named');
    assert.ok(sword && axe);
});

test('unequip changes real state and protected items cannot be dropped', async t => {
    const { w, G, M, spoken } = await ready(t);
    const axe = add(w, G, 'goblin axe');
    const scroll = add(w, G, 'ancient scroll');
    M.equip(axe);
    assert.equal(G.state.player.weapon, 'Goblin Axe');
    M.unequip(axe);
    assert.notEqual(G.state.player.weapon, 'Goblin Axe');
    spoken.length = 0;
    await M.drop(scroll);
    assert.equal(G.state.inventory.find(item => item.id === 'ancient scroll')?.quantity, 1, 'quest items never leave the bag');
    assert.ok(spoken.some(line => /cannot be dropped/i.test(line)));
});

test('drop asks for confirmation, then moves exactly one item to the ground', async t => {
    const { w, G, M, UI } = await ready(t);
    add(w, G, 'healing potion', 2);
    const potion = G.state.inventory.find(item => item.id === 'healing potion');
    const before = potion.quantity;
    M.open();
    selectItem(M, 'Healing Potion');
    // Long press menu: drop opens a confirm menu, the item is not gone yet.
    M.actions();
    const dropChoice = UI.menu.choices.find(choice => /Drop one Healing Potion/.test(choice.label));
    dropChoice.run();
    assert.match(UI.menu.title, /Drop one Healing Potion/);
    assert.equal(G.state.inventory.find(item => item.id === 'healing potion').quantity, before, 'nothing dropped before confirmation');
    await UI.menu.choices.find(choice => choice.label === 'Confirm').run();
    assert.equal(G.state.inventory.find(item => item.id === 'healing potion').quantity, before - 1, 'exactly one left the bag');
    assert.equal(w.GroundLoot.groundHere().length, 1);
    assert.equal(w.GroundLoot.groundHere()[0].id, 'healing potion');
    assert.ok(potion);
});

test('a dropped item can be picked up again and is saved with the hero', async t => {
    const { w, G } = await ready(t);
    add(w, G, 'healing potion', 2);
    const before = G.state.inventory.find(item => item.id === 'healing potion').quantity;
    const dropped = await w.GroundLoot.drop(G.state.inventory.find(item => item.id === 'healing potion'));
    assert.equal(dropped.ok, true);
    assert.equal(G.state.inventory.find(item => item.id === 'healing potion').quantity, before - 1);
    assert.equal(w.GroundLoot.take('healing potion'), true);
    assert.equal(G.state.inventory.find(item => item.id === 'healing potion').quantity, before);
    const save = G.getSaveData();
    assert.ok('groundLoot' in save && 'worldChests' in save, 'save carries object state');
});

test('pickup is announced only after the bag really holds the item, and a second tap does not duplicate it', async t => {
    const { w, G, M, spoken } = await ready(t);
    G.enterLocation('forest');
    const before = G.state.inventory.find(item => item.id === 'acorn')?.quantity || 0;
    const acorn = M.objects().find(entry => entry.kind === 'item' && entry.label === 'Acorn');
    assert.ok(acorn, 'the acorn is a real ground item in the forest');
    acorn.run();
    await wait(10);
    assert.equal(G.state.inventory.find(item => item.id === 'acorn').quantity, before + 1);
    assert.ok(spoken.some(line => /Collected Acorn\. You now carry/.test(line)), spoken.at(-1));
    const again = M.objects().find(entry => entry.kind === 'item' && entry.label === 'Acorn');
    assert.equal(again, undefined, 'the taken item left the room list');
    acorn.run();
    assert.equal(G.state.inventory.find(item => item.id === 'acorn').quantity, before + 1, 'a stale double tap cannot duplicate the pickup');
});

test('combat mode reports the real fight and exploration is restored afterwards', async t => {
    const { G, M } = await ready(t);
    assert.equal(M.current(), 'exploration');
    G.state.inCombat = true;
    assert.equal(M.current(), 'combat');
    M.sync();
    assert.equal(M.state.mode, 'combat');
    G.state.inCombat = false;
    assert.equal(M.current(), 'exploration');
});

test('object mode enters on browsing, exits on two finger swipe down', async t => {
    const { G, UI, M } = await ready(t);
    G.enterLocation('forest');
    UI.handle('two-right');
    assert.equal(M.current(), 'object');
    UI.handle('go_down');
    assert.equal(M.current(), 'exploration');
    assert.equal(UI.focusIndex, -1);
});

test('only one context answers a gesture: board mode wins while a game is open', async t => {
    const { w, G, M } = await ready(t);
    const panel = w.document.createElement('div');
    panel.id = 'game-hall-panel'; panel.className = 'panel';
    w.document.body.appendChild(panel);
    let rolls = 0;
    w.HallPlay = {
        match: { game: 'snakes', status: 'active' }, mySeat: 0,
        view: { players: [{ seat: 0, name: 'You', color: 'Red' }] },
        shown: { fen: '', pos: [12], turn: 0 },
        myTurn: () => true,
        roll: async () => { rolls++; },
        describe: async () => {}
    };
    assert.equal(M.current(), 'snakes');
    const before = G.state.location;
    w.GestureAccessibility.UI.handle('double');
    assert.equal(rolls, 1, 'double tap rolled exactly once');
    assert.equal(G.state.location, before, 'the roll did not walk the hero');
    delete w.HallPlay;
});
