import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true; w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    G.startNewHero(); w.document.getElementById('char-name').value = 'Gesture Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected'); G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    w.Math.random = () => .99; w.GameSpellSystem.random = () => .99;
    w.ProfessionalAudioCombat = null; w.AudioManager.endBattle = async () => {};
    const api = w.GestureAccessibility;
    api.UI.close(); G.closePanels();
    return { ...r, ...api, G, w };
}
const evt = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', preventDefault() {}, currentTarget: { setPointerCapture() {} } });

test('real launch enables independent narration and leaves saves intact', async t => {
    const { w, G, UI, settings } = await ready(t);
    const before = G.getSaveData().player.name;
    const spoken = []; w.speechSynthesis.speak = u => { spoken.push(u.text); u.onstart?.(); u.onend?.(); };
    UI.enable(); assert.equal(settings.narration, true); assert.equal(w.AudioManager.voiceEnabled, true);
    assert.equal(w.document.getElementById('gesture-interface').hidden, false);
    await wait(80); assert.ok(spoken.length); assert.equal(G.getSaveData().player.name, before);
    UI.menu.choices.find(c => /Continue/.test(c.label)).run();
    assert.ok(UI.menu.choices.length > 1);
});

test('cardinal swipes use actual graph and blocked routes never move', async t => {
    const { G, UI, w } = await ready(t);
    const next = w.WorldData.locations[G.state.location].exits.north;
    UI.handle('up'); await wait(360); assert.equal(G.state.location, next);
    const id = G.state.location;
    const blocked = Object.keys({ north: 1, south: 1, east: 1, west: 1 }).find(d => !w.WorldData.locations[id].exits[d]);
    if (blocked) { UI.move(blocked); await wait(350); assert.equal(G.state.location, id); }
});

test('one swipe emits one committed movement despite pointer and click lifecycle', async t => {
    const { G, Gestures } = await ready(t);
    Gestures.down(evt(1, 100, 120)); Gestures.move(evt(1, 100, 30)); Gestures.up(evt(1, 100, 30));
    const pending = G._movementPending; assert.equal(pending, true);
    await wait(360); assert.equal(G.state.location, 'kaliwasch_district_3');
    assert.equal(G._movementPending, false);
});

test('swipe hold repeats, release cancels pending step and never walks afterwards', async t => {
    const { G, Gestures, settings } = await ready(t);
    settings.interval = 450;
    G.enterLocation('kaliwasch_district_1');
    Gestures.down(evt(1, 100, 120)); Gestures.move(evt(1, 200, 120));
    await wait(1900);
    assert.ok(['kaliwasch_district_3', 'kaliwasch_district_4'].includes(G.state.location), 'hold commits repeated steps, not just its first step');
    Gestures.up(evt(1, 200, 120)); const stopped = G.state.location;
    await wait(950); assert.equal(G.state.location, stopped); assert.equal(G._movementPending, false);
});

test('cancellation, app blur and interface switch stop held walking', async t => {
    const { G, Gestures, w, UI } = await ready(t);
    for (const stop of [() => Gestures.reset(), () => w.dispatchEvent(new w.Event('blur')), () => w.InterfaceMode.apply('sighted')]) {
        w.InterfaceMode.apply('blind'); UI.close();
        Gestures.down(evt(1, 100, 120)); Gestures.move(evt(1, 100, 20)); await wait(580);
        stop(); const origin = G.state.location; await wait(400); assert.equal(G.state.location, origin);
    }
});

test('diagonal thresholds and menu mapping are deterministic; double tap executes once', async t => {
    const { Gestures, UI } = await ready(t);
    assert.equal(Gestures.direction(10, 10), null); assert.equal(Gestures.direction(80, -80), 'up-right');
    assert.equal(Gestures.direction(-90, 0), 'left');
    let calls = 0; UI.open('Test', [{ label: 'Choose', run: () => calls++ }]);
    Gestures.down(evt(1, 90, 90)); Gestures.up(evt(1, 90, 90));
    Gestures.down(evt(2, 92, 90)); Gestures.up(evt(2, 92, 90)); await wait(380);
    assert.equal(calls, 1);
});

test('two finger tap opens inventory, two finger swipe cancels and never moves', async t => {
    const { Gestures, G, UI } = await ready(t);
    Gestures.down(evt(1, 80, 80)); Gestures.down(evt(2, 120, 80));
    Gestures.up(evt(1, 80, 80)); Gestures.up(evt(2, 120, 80));
    assert.match(UI.menu.title, /Inventory/);
    Gestures.down(evt(1, 80, 80)); Gestures.down(evt(2, 120, 80));
    Gestures.move(evt(1, 80, 160)); Gestures.up(evt(1, 80, 160)); Gestures.up(evt(2, 120, 160));
    await wait(360); assert.equal(G.state.location, 'kaliwasch');
});

test('physical doors execute existing functions; private locked doors do not offer Open', async t => {
    const { G, UI, w } = await ready(t);
    G.enterLocation('public_house_kaliwasch_1_door'); UI.context();
    UI.menu.choices.find(c => c.label === 'Open door').run(); await wait(0);
    assert.equal(w.WorldData.locations[G.state.location].exits.up, 'public_house_kaliwasch_1_foyer');
    G.enterLocation('private_house_kaliwasch_door'); UI.context();
    assert.equal(UI.menu.choices.some(c => c.label === 'Open door'), false);
});

test('posture requires actual local furniture, blocks walking and preserves saves', async t => {
    const { G, UI } = await ready(t);
    UI.posture('lie'); assert.equal(G.state.player.gesturePosture, null);
    G.enterLocation('public_house_kaliwasch_1_double_bedroom'); UI.posture('lie');
    assert.equal(G.state.player.gesturePosture.action, 'lie'); const id = G.state.location;
    G.move('down'); await wait(350); assert.equal(G.state.location, id);
    assert.equal(G.getSaveData().player.gesturePosture.location, id);
    UI.posture('stand'); G.move('down'); await wait(360); assert.notEqual(G.state.location, id);
});

test('inventory exposes valid actions, confirms drop, and performs real healing', async t => {
    const { G, w, UI } = await ready(t);
    const potion = { ...w.WorldData.items['healing potion'], id: 'healing potion', quantity: 2 };
    G.state.inventory = [potion]; G.state.player.hp = 1;
    UI.itemActions(potion);
    assert.equal(UI.menu.choices.some(c => /Equip|Throw/.test(c.label)), false);
    UI.menu.choices.find(c => c.label.startsWith('Drop')).run();
    assert.equal(potion.quantity, 2); assert.match(UI.menu.choices[0].label, /Cancel/);
    UI.itemActions(potion); UI.menu.choices.find(c => c.label.startsWith('Use')).run(); await wait(0);
    assert.ok(G.state.player.hp > 1); assert.equal(potion.quantity, 1);
});

test('real equipment can be equipped and unequipped without losing it', async t => {
    const { G, w } = await ready(t);
    const weapon = { ...w.WorldData.items['steel greatsword'], id: 'steel greatsword', quantity: 1 };
    G.state.inventory = [weapon]; G.state.player.leftHand = null;
    G.equipItem(weapon.name); assert.equal(G.state.player.weapon, weapon.name);
    G.unequipItem(weapon.name); assert.equal(G.state.player.weapon, null); assert.equal(G.state.player.leftHand, null);
    assert.equal(G.state.inventory[0].quantity, 1);
});

test('combat menu, mana failures, defend and real damage share original engine', async t => {
    const { G, UI, w } = await ready(t);
    G.enterLocation('forest'); G.startCombat('root goblin'); G.state.sacred.enemyQueue = [];
    w.Math.random = () => .5;
    const enemy = G.state.enemy; enemy.hp = enemy.maxHp = 10000;
    UI.context(); assert.match(UI.menu.title, /Combat/);
    UI.menu.choices.find(c => c.label === 'Attack current enemy').run(); await wait(50);
    assert.ok(enemy.hp < 10000);
    const mp = G.state.player.mp = 0; G.processCommand('cast shock'); assert.equal(G.state.player.mp, mp);
    assert.match(w.document.getElementById('narrative').textContent, /mana|know/i);
    const id = G.state.location; UI.move('north'); await wait(350); assert.equal(G.state.location, id);
});

test('routes recompute from actual exits, never from synthetic bearings', async t => {
    const { UI, G, w } = await ready(t);
    UI.destination = 'kaliwasch_district_3'; UI.routeStep(); await wait(360);
    assert.equal(G.state.location, 'kaliwasch_district_3'); assert.equal(UI.destination, null);
    assert.equal(w.WorldData.locations.kaliwasch.exits.north, G.state.location);
});

test('ordinary narration reaches speech once, queue is bounded, OFF is absolute', async t => {
    const { G, w, settings } = await ready(t);
    settings.narration = true; w.AudioManager.setVoiceEnabled(true);
    const spoken = []; w.speechSynthesis.speak = u => { spoken.push(u); u.onstart?.(); };
    G.emitGameEvent('One real game event.', 'combat'); assert.equal(spoken.length, 1);
    for (let i = 0; i < 40; i++) G.addNarrative(`Event ${i}`, 'system');
    assert.ok(w.AudioManager.speechQueue.length <= 12);
    w.AudioManager.setVoiceEnabled(false); G.addNarrative('Must remain silent.', 'combat'); assert.equal(spoken.length, 1);
});

test('speech rate, pause, resume, repeat and engine error expose real state', async t => {
    const { w, settings, UI } = await ready(t);
    settings.narration = true; w.AudioManager.setVoiceEnabled(true);
    const spoken = []; let paused = 0, resumed = 0;
    w.speechSynthesis.pause = () => paused++; w.speechSynthesis.resume = () => resumed++;
    w.speechSynthesis.speak = u => { spoken.push(u); u.onstart?.(); };
    UI.rate(.2); assert.equal(spoken[0].rate, 1.2);
    w.AudioManager.pauseVoice(); w.AudioManager.resumeVoice(); assert.equal(paused, 1); assert.equal(resumed, 1);
    w.AudioManager.repeatVoice(); assert.equal(spoken.length, 2);
    spoken.at(-1).onerror({ error: 'voice-unavailable' });
    assert.match(w.document.getElementById('gesture-speech-status').textContent, /voice-unavailable/);
});
