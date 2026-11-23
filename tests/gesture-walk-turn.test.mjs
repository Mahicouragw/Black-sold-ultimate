/**
 * Walk-and-turn gestures (v7.59).
 *
 * The player walks like a person, not like a compass keypad: swiping up walks
 * where they are facing, left and right turn on the spot, down steps backward
 * without turning round, a tap starts or stops continuous walking, a long press
 * walks while held, two fingers stop instantly, and a circle turns around.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime();
    t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Walker';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    w.AudioManager.endBattle = async () => {};
    const api = w.GestureAccessibility;
    api.UI.close(); G.closePanels();
    return { ...r, ...api, G, w, api };
}

const evt = (id, x, y) => ({
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0,
    preventDefault() {}, currentTarget: { setPointerCapture() {} }
});

async function swipe(api, from, to, waitMs = 380) {
    api.Gestures.down(evt(1, from.x, from.y));
    api.Gestures.move(evt(1, to.x, to.y));
    api.Gestures.up(evt(1, to.x, to.y));
    await wait(waitMs);
}

test('walking and turning are the default, and the hero starts facing north', async t => {
    const { api } = await ready(t);
    assert.equal(api.settings.scheme, 'walk');
    assert.equal(api.UI.facing(), 'north');
});

test('swipe up walks forward into the real next room', async t => {
    const { G, UI, api, w } = await ready(t);
    const next = w.WorldData.locations[G.state.location].exits.north;
    await swipe(api, { x: 100, y: 140 }, { x: 100, y: 40 });
    assert.equal(G.state.location, next, 'one swipe is one step forward');
    assert.equal(UI.facing(), 'north', 'walking forward keeps the facing');
});

test('turning changes only the facing, never the room', async t => {
    const { G, UI, api } = await ready(t);
    const before = G.state.location;
    await swipe(api, { x: 60, y: 100 }, { x: 160, y: 100 });
    assert.equal(G.state.location, before, 'turning does not move the player');
    assert.equal(UI.facing(), 'east');
    await swipe(api, { x: 160, y: 100 }, { x: 60, y: 100 });
    assert.equal(UI.facing(), 'north', 'turning left comes back round');
    assert.equal(G.state.location, before);
});

test('after turning, forward follows the new facing', async t => {
    const { G, UI, api, w } = await ready(t);
    const east = w.WorldData.locations[G.state.location].exits.east;
    await swipe(api, { x: 60, y: 100 }, { x: 160, y: 100 });    // face east
    assert.equal(UI.facing(), 'east');
    await swipe(api, { x: 100, y: 140 }, { x: 100, y: 40 });    // walk forward
    assert.equal(G.state.location, east);
});

test('swipe down steps backward without turning round', async t => {
    const { G, UI, api, w } = await ready(t);
    await swipe(api, { x: 60, y: 100 }, { x: 160, y: 100 });    // face east
    const west = w.WorldData.locations[G.state.location].exits.west;
    await swipe(api, { x: 100, y: 40 }, { x: 100, y: 140 });    // backward
    assert.equal(G.state.location, west);
    assert.equal(UI.facing(), 'east', 'backing up does not turn the hero');
});

test('a blocked step says why, and does not move or turn', async t => {
    const { G, UI, api, w } = await ready(t);
    const loc = w.WorldData.locations[G.state.location];
    const missing = ['northeast', 'northwest', 'southeast', 'southwest'].find(d => !loc.exits[d]);
    if (!missing) return t.skip('this room has every diagonal exit');
    UI.setFacing(missing);
    const before = G.state.location;
    await swipe(api, { x: 100, y: 140 }, { x: 100, y: 40 });
    assert.equal(G.state.location, before, 'a blocked step never moves');
    assert.equal(UI.facing(), missing, 'and never silently turns the hero');
});

test('a single tap starts continuous walking, and two fingers stop it at once', async t => {
    const { G, api, UI } = await ready(t);
    UI.toggleWalk();
    assert.equal(UI.walking, true, 'tap starts walking');
    await wait(700);
    assert.notEqual(G.state.location, 'kaliwasch', 'the hero really walked');
    api.Gestures.down(evt(1, 80, 80)); api.Gestures.down(evt(2, 120, 80));
    api.Gestures.up(evt(1, 80, 80)); api.Gestures.up(evt(2, 120, 80));
    const stopped = G.state.location;
    assert.equal(UI.walking, false, 'two fingers stop walking');
    await wait(600);
    assert.equal(G.state.location, stopped, 'nothing moves after the stop');
});

test('a long press walks while held and stops on release', async t => {
    const { G, api, UI } = await ready(t);
    api.settings.interval = 450;
    api.Gestures.down(evt(1, 100, 120));
    await wait(700);                                    // hold past the 550 ms mark
    assert.equal(UI.walking, true, 'holding walks');
    api.Gestures.up(evt(1, 100, 120));
    const stopped = G.state.location;
    await wait(700);
    assert.equal(G.state.location, stopped, 'release stops the walking');
});

test('drawing a circle turns the hero around', async t => {
    const { G, UI, api } = await ready(t);
    UI.setFacing('north');
    const before = G.state.location;
    api.Gestures.down(evt(1, 140, 100));
    for (const [x, y] of [[140, 60], [180, 100], [140, 140], [100, 100], [140, 60]]) {
        api.Gestures.move(evt(1, x, y));
    }
    api.Gestures.up(evt(1, 140, 60));
    assert.equal(UI.facing(), 'south', 'a full circle turns around');
    assert.equal(G.state.location, before);
});

test('swipe sensitivity changes how far a finger must travel', async t => {
    const { api, UI } = await ready(t);
    api.settings.swipe = 'low';                          // needs 60 px
    api.Gestures.down(evt(1, 100, 100));
    api.Gestures.move(evt(1, 140, 100));                 // 40 px only
    api.Gestures.up(evt(1, 140, 100));
    await wait(10);
    assert.equal(UI.facing(), 'north', 'a short swipe is not a turn');
    api.settings.swipe = 'high';                         // needs 22 px
    await swipe(api, { x: 100, y: 100 }, { x: 140, y: 100 });
    assert.equal(UI.facing(), 'east', 'the same swipe counts at high sensitivity');
});

test('turning is announced with what is really ahead', async t => {
    const { UI, api, w } = await ready(t);
    const said = [];
    w.AudioManager.playVoice = async text => { said.push(String(text)); return true; };
    api.settings.narration = true;
    UI.setFacing('north');
    UI.turn(2);
    assert.equal(UI.facing(), 'east');
    assert.ok(said.some(line => /Facing east\./.test(line)), 'the new facing is spoken');
    assert.ok(said.some(line => /Ahead:|No path straight ahead/.test(line)), 'and what is really ahead');
});

test('the older compass swipes remain available', async t => {
    const { api, UI, G } = await ready(t);
    api.settings.scheme = 'compass';
    await swipe(api, { x: 60, y: 100 }, { x: 160, y: 100 });   // east
    assert.equal(UI.facing(), 'north', 'compass swipes do not change the facing');
    assert.match(G.state.location, /kaliwasch_district/);
});

test('gestures are ignored while a panel is open, so a menu is never walked through', async t => {
    const { G, UI, api } = await ready(t);
    UI.open('Test panel', [{ label: 'Choose', run: () => {} }]);
    const before = G.state.location;
    await swipe(api, { x: 100, y: 140 }, { x: 100, y: 40 });
    assert.equal(G.state.location, before);
});

test('no sound effect is synthesised: the swipe uses a real recording', async t => {
    const source = readFileSync('gesture-accessibility.js', 'utf8');
    const start = source.indexOf('playSwipeSound()');
    const body = source.slice(start, source.indexOf('},', start));
    assert.doesNotMatch(body, /AudioContext|createBuffer|Math\.random/, 'no generated noise');
    assert.match(body, /playSFX\('swipe'\)/, 'a recorded swipe is used');

    const { api, w } = await ready(t);
    const played = [];
    w.AudioManager.playSFX = (name, options) => { played.push(name); return true; };
    api.Gestures.handle ? api.Gestures.handle('left') : api.UI.handle('left');
    assert.ok(played.includes('swipe'), 'the real swipe recording was requested');
});

test('the facing is part of the save, so a reload keeps the direction', async t => {
    const { G, UI } = await ready(t);
    UI.turn(2);
    const saved = G.getSaveData();
    assert.equal(saved.player.facing, 'east');
});
