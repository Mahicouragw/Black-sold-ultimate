import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.62.1 — a spell that fails must sound like a failure. The door-opening
 * recording belongs to a door that really opens, never to a shout in an empty
 * room. Every cue here is a genuine recording already shipped in
 * assets/audio/sfx; nothing is synthesised. */

function narrative(w) { return w.document.getElementById('narrative')?.textContent || ''; }

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Sound Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    const played = [];
    const original = w.MusicSystem.playSFX.bind(w.MusicSystem);
    w.MusicSystem.playSFX = (name, ...rest) => { played.push(String(name)); return original(name, ...rest); };
    return { w, G, played };
}

const doorRoom = 'drakkar_keep_2';
const plainRoom = 'kaliwasch';

test('Alohomora in a room with no magical door makes no door sound and costs no mana', async t => {
    const { w, G, played } = await ready(t);
    G.enterLocation(plainRoom);
    G.state.player.mp = 30;
    played.length = 0;
    G.castSpell('alohomora');
    await wait(500);
    assert.ok(!played.includes('door'), `no door recording, heard ${played.join(', ')}`);
    assert.deepEqual(played, ['board-error'], 'the recorded failure cue');
    assert.equal(G.state.player.mp, 30, 'nothing was spent on an empty room');
    const text = narrative(w);
    assert.ok(!/releases the lock|door opens|swings open/i.test(text), `the words never claim a door opened: ${text}`);
});

test('the same command typed by the player also stays honest', async t => {
    const { G, played } = await ready(t);
    G.enterLocation(plainRoom);
    played.length = 0;
    G.processCommand('alohomora');
    await wait(500);
    assert.ok(!played.includes('door'), `no door recording, heard ${played.join(', ')}`);
    assert.ok(played.includes('board-error'));
    G.processCommand('opening doors');
    await wait(500);
    assert.ok(!played.includes('door'));
});

test('at the rune door the door recording plays once and the door opens', async t => {
    const { w, G, played } = await ready(t);
    G.enterLocation(doorRoom);
    G.state.player.mp = 40;
    played.length = 0;
    G.castSpell('alohomora');
    await wait(500);
    assert.equal(played.filter(name => name === 'door').length, 1, 'one recorded door click');
    assert.ok(played.includes('magic'));
    assert.equal(G.state.player.mp, 32, 'the spell cost was paid');
    assert.equal(w.WorldData.locations[doorRoom].specialDoor.open, true);
});

test('a second attempt at an already open door never repeats the door recording', async t => {
    const { G, played } = await ready(t);
    G.enterLocation(doorRoom);
    G.state.player.mp = 40;
    G.castSpell('alohomora');
    await wait(500);
    played.length = 0;
    const mp = G.state.player.mp;
    G.castSpell('alohomora');
    await wait(500);
    assert.deepEqual(played, ['board-error']);
    assert.equal(G.state.player.mp, mp, 'an open door costs nothing');
});

test('every spell cue is a shipped recording, not a synthesised tone', async t => {
    const { w } = await ready(t);
    const system = w.MusicSystem;
    for (const name of ['door', 'board-error', 'magic', 'miss', 'heal', 'heal-chain', 'card-draw', 'card-flip', 'pickup', 'levelup', 'hit-metal-1', 'attack-fast', 'attack-heavy', 'monster-roar', 'ghost-moan', 'ghost-scream', 'goblin-cackle']) {
        assert.ok(Array.isArray(system.sfx[name]) && system.sfx[name].length, `${name} is mapped to a file`);
        for (const src of system.sfx[name]) {
            assert.match(src, /^assets\/audio\/sfx\/[\w.-]+\.(wav|ogg|mp3)$/, `${name} points at a recording`);
        }
    }
});
