import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.61.0 — chests, doors and ground loot as real world objects. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true; w.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Objects Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    const spoken = [];
    w.GestureAccessibility.settings.narration = true;
    w.AudioManager.playVoice = text => { spoken.push(String(text)); return Promise.resolve(true); };
    w.GestureAccessibility.UI.close();
    return { w, G, spoken };
}

const carry = (w, G, id, times = 1) => {
    for (let i = 0; i < times; i++) G.addItemToInventory(id, w.WorldData.items[id]);
    return G.state.inventory.find(item => item.id === id);
};

test('chests exist only in the rooms that were authored for them', async t => {
    const { w, G } = await ready(t);
    const chests = w.WorldChests.CHESTS;
    assert.deepEqual(Object.keys(chests).sort(), ['goblin_camp', 'ruins', 'witch_hut']);
    for (const [room, def] of Object.entries(chests)) {
        assert.ok(w.WorldData.locations[room], `${room} is a real room`);
        for (const entry of def.loot) assert.ok(w.WorldData.items[entry.id], `${entry.id} is a real catalogue item`);
    }
    G.enterLocation('forest');
    assert.equal(w.WorldChests.chestAt('forest'), null);
    G.processCommand('open chest');
    await wait(10);
    assert.ok(w.GestureAccessibility.settings.narration);
});

test('a locked chest stays shut without its real key', async t => {
    const { w, G, spoken } = await ready(t);
    G.enterLocation('ruins');
    const chest = w.WorldChests.chestAt('ruins');
    assert.equal(chest.def.locked, true);
    assert.equal(chest.def.key, 'skeleton key');
    assert.equal(w.WorldChests.openChest('ruins'), false);
    assert.equal(w.WorldChests.chestAt('ruins').stored.opened, false, 'no silent opening');
    await wait(10);
    assert.ok(spoken.some(line => /locked/.test(line)));
    assert.ok(spoken.some(line => /Skeleton Key/.test(line)));
    w.WorldChests.collect('ruins', 'chainmail');
    assert.equal(G.state.inventory.find(item => item.id === 'chainmail'), undefined, 'loot cannot be taken from a closed chest');
});

test('the skeleton key opens the chest, stays in the bag and the contents are real', async t => {
    const { w, G, spoken } = await ready(t);
    G.enterLocation('ruins');
    carry(w, G, 'skeleton key');
    assert.equal(w.WorldChests.openChest('ruins'), true);
    assert.equal(w.WorldChests.chestAt('ruins').stored.opened, true);
    assert.equal(G.state.inventory.find(item => item.id === 'skeleton key').quantity, 1, 'the key is not consumed');
    await wait(10);
    const line = spoken.at(-1);
    assert.match(line, /Ancient Chest opens/);
    assert.match(line, /Chainmail/);
    assert.match(line, /Blessed Amulet/);
    assert.match(line, /Sky Feather/);
});

test('collecting takes exactly one item and cannot be repeated on an empty slot', async t => {
    const { w, G } = await ready(t);
    G.enterLocation('ruins');
    carry(w, G, 'skeleton key');
    w.WorldChests.openChest('ruins');
    assert.equal(G.state.inventory.find(item => item.id === 'sky feather'), undefined);
    w.WorldChests.collect('ruins', 'sky feather');
    const feathers = G.state.inventory.find(item => item.id === 'sky feather');
    assert.equal(feathers.quantity, 1);
    assert.deepEqual({ ...w.WorldChests.chestAt('ruins').stored.remaining.find(row => row.id === 'sky feather') }, { id: 'sky feather', quantity: 1 });
    w.WorldChests.collect('ruins', 'sky feather');
    assert.equal(G.state.inventory.find(item => item.id === 'sky feather').quantity, 2);
    w.WorldChests.collect('ruins', 'sky feather');
    assert.equal(G.state.inventory.find(item => item.id === 'sky feather').quantity, 2, 'nothing appears out of an empty chest');
});

test('an opened chest, what is left in it, and the ground loot survive a reload', async t => {
    const { w, G } = await ready(t);
    G.enterLocation('ruins');
    carry(w, G, 'skeleton key');
    w.WorldChests.openChest('ruins');
    w.WorldChests.collect('ruins', 'chainmail');
    G.enterLocation('forest');
    carry(w, G, 'healing potion', 2);
    await w.GroundLoot.drop(G.state.inventory.find(item => item.id === 'healing potion'));
    G.save();
    G.continueGame();
    await wait(10);
    G.enterLocation('ruins');
    const stored = w.WorldChests.chestAt('ruins').stored;
    assert.equal(stored.opened, true, 'the chest stays open');
    assert.equal(stored.remaining.some(row => row.id === 'chainmail'), false, 'taken loot does not come back');
    G.enterLocation('forest');
    assert.equal(w.GroundLoot.groundHere().length, 1, 'the dropped item is still on the ground');
    assert.equal(w.GroundLoot.groundHere()[0].id, 'healing potion');
    assert.equal(w.GroundLoot.take('healing potion'), true);
    assert.equal(w.GroundLoot.groundHere().length, 0);
});

test('object mode lists the chest and its contents with truthful wording', async t => {
    const { w, G } = await ready(t);
    G.enterLocation('ruins');
    const locked = w.GestureModes.objects().find(entry => entry.kind === 'chest');
    assert.ok(locked);
    assert.match(locked.describe, /locked, and it needs the Skeleton Key/);
    carry(w, G, 'skeleton key');
    w.WorldChests.openChest('ruins');
    const entries = w.GestureModes.objects();
    const open = entries.find(entry => entry.kind === 'chest');
    assert.match(open.describe, /open, holding/);
    const loot = entries.filter(entry => entry.kind === 'loot');
    assert.equal(loot.length, 3);
    assert.match(loot[0].describe, /left in Ancient Chest/);
});

test('dropped loot appears as a real object and is picked up by its own action', async t => {
    const { w, G } = await ready(t);
    G.enterLocation('forest');
    carry(w, G, 'healing potion', 2);
    const before = G.state.inventory.find(item => item.id === 'healing potion').quantity;
    await w.GroundLoot.drop(G.state.inventory.find(item => item.id === 'healing potion'));
    const ground = w.GestureModes.objects().find(entry => entry.kind === 'ground');
    assert.ok(ground);
    assert.match(ground.describe, /One Healing Potion lying on the ground/);
    ground.run();
    assert.equal(G.state.inventory.find(item => item.id === 'healing potion').quantity, before);
    assert.equal(w.GroundLoot.groundHere().length, 0);
});

test('a rune door is described with its real requirement and never claims a false open', async t => {
    const { w, G, spoken } = await ready(t);
    const room = Object.entries(w.WorldData.locations).find(([, loc]) => loc.specialDoor);
    assert.ok(room, 'the world has a rune door');
    const [roomId, location] = room;
    G.enterLocation(roomId);
    const door = w.GestureModes.objects().find(entry => entry.kind === 'door');
    assert.ok(door, 'the door is an object in the room');
    assert.match(door.describe, /runed door/);
    assert.match(door.describe, /(Alohomora|already open|magic)/);
    const before = Boolean(location.specialDoor.open) || Boolean(G.state.specialDoors?.[location.specialDoor.id]?.open);
    door.run();
    await wait(80);
    const now = Boolean(w.WorldData.locations[roomId].specialDoor.open) || Boolean(G.state.specialDoors?.[location.specialDoor.id]?.open);
    if (now && !before) {
        // If the spell really opened it, the real exit must exist too.
        assert.ok(w.WorldData.locations[roomId].exits[location.specialDoor.direction] || location.specialDoor.open, 'an open door really is a way through');
        assert.ok(spoken.some(line => /(Alohomora|door|open)/i.test(line)), spoken.join(' | '));
    } else {
        assert.ok(spoken.some(line => /(locked|does not answer|magic|mana|already open|spell)/i.test(line)), spoken.join(' | '));
    }
});
