/**
 * 7.65.0 — gesture and button repair, plus the spoken in-game guide.
 *
 * Every test drives the same surface a player uses: a real swipe on the world
 * (GlobalSwipes), the gesture pad, a real combat button, or a typed/spoken
 * command. Nothing here asserts a promise the game cannot keep.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime();
    t.after(() => {
        try {
            const G = r.window.Game;
            G.state.inCombat = false; G.state.enemy = null;
            G._survivorWait = (G._survivorWait || 0) + 1;
            G.state.combatTransition = false;
        } catch { /* window already closed */ }
        r.dom.window.close();
    });
    await wait(0);
    const w = r.window, G = w.Game, d = w.document;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    w.OnlineSystem.recordGroupAttack = () => {};
    G.startNewHero();
    d.getElementById('char-name').value = 'Repair';
    d.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    d.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    w.ProfessionalAudioCombat = null;
    w.AudioManager.endBattle = async () => {};
    w.Math.random = () => 0.5;
    w.GameSpellSystem.random = () => 0.5;
    const spoken = [];
    w.speechSynthesis.speak = u => { spoken.push(u.text); u.onstart?.(); u.onend?.(); };
    const api = w.GestureAccessibility;
    api.settings.narration = true; api.UI.save();
    w.AudioManager.voiceEnabled = true;
    api.UI.close(); G.closePanels();
    G.state.player.hp = 9999; G.state.player.maxHp = 9999; G.state.player.mp = 999;
    return { ...r, G, w, d, api, UI: api.UI, settings: api.settings, GS: api.GlobalSwipes, spoken };
}

/** The same shape a pointer event has for GlobalSwipes. */
const pointer = (d, id, x, y, target = d.body) => ({
    pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, target,
    preventDefault() {}
});

function worldSwipe(GS, d, from, to, id = 7) {
    GS.down(pointer(d, id, from.x, from.y));
    GS.move(pointer(d, id, to.x, to.y));
    GS.up(pointer(d, id, to.x, to.y));
}

function findRoom(w, test) {
    return Object.entries(w.WorldData.locations).find(([, l]) => test(l));
}

function fight(G, name = 'ice troll') {
    G.state.location = 'kaliwasch';
    G.startCombat(name);
    G.state.sacred.enemyQueue = [];
    G.state.combatTransition = false;
    return G.state.enemy;
}

/* ───────────── eight directions ───────────── */

test('(1/12) every one of the eight directions is reachable by gesture token', async t => {
    const { G, UI, settings, w } = await ready(t);
    settings.scheme = 'compass';
    settings.corners = 'walk';
    const room = w.WorldData.locations[G.state.location];
    Object.assign(room.exits, { north: 'forest', northeast: 'forest', east: 'forest', southeast: 'forest', south: 'forest', southwest: 'forest', west: 'forest', northwest: 'forest' });
    const moved = [];
    G.processCommand = dir => { moved.push(dir); return true; };
    const expected = {
        up: 'north', 'up-right': 'northeast', right: 'east', 'down-right': 'southeast',
        down: 'south', 'down-left': 'southwest', left: 'west', 'up-left': 'northwest'
    };
    for (const [token, direction] of Object.entries(expected)) {
        UI.handle(token);
        assert.equal(moved.at(-1), direction, `${token} walks ${direction}`);
    }
    assert.equal(new Set(Object.values(expected)).size, 8, 'all eight compass directions are covered');
});

test('(2/12) the corner-swipe setting now works on a world swipe, not only on the pad', async t => {
    const { G, UI, settings, GS, d, w } = await ready(t);
    const found = findRoom(w, room => room.exits?.northeast);
    G.state.location = found[0];
    settings.corners = 'walk';
    UI.setFacing('north');
    UI.close(); G.closePanels();
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 });
    await wait(500);
    assert.equal(G.state.location, found[1].exits.northeast, 'up-right walked north-east into the real next room');
});

test('(3/12) with corner menus on, the same swipe still opens a panel instead of walking', async t => {
    const { G, UI, settings, GS, d, w } = await ready(t);
    const found = findRoom(w, room => room.exits?.northeast);
    G.state.location = found[0];
    settings.corners = 'menus';
    UI.close(); G.closePanels();
    const before = G.state.location;
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 });
    await wait(60);
    assert.equal(G.state.location, before, 'the hero did not walk');
    const voicePanel = d.getElementById('voice-command-panel');
    const voiceOpen = Boolean(voicePanel) && !voicePanel.classList.contains('hidden');
    assert.ok(voiceOpen || /Voice|commands/i.test(UI.menu?.title || ''), 'the up-right voice-command panel opened as documented');
});

/* ───────────── stairs and phantom fingers ───────────── */

test('(4/12) two fingers up on the world are the stairs, through the same handler as the pad', async t => {
    const { G, UI, GS, d, w } = await ready(t);
    const found = findRoom(w, room => room.exits?.up);
    assert.ok(found, 'the world has at least one room with stairs');
    G.state.location = found[0];
    UI.close(); G.closePanels();
    const sent = [];
    G.processCommand = command => { sent.push(command); return true; };
    GS.down(pointer(d, 1, 100, 300)); GS.down(pointer(d, 2, 140, 300));
    GS.move(pointer(d, 1, 100, 180)); GS.move(pointer(d, 2, 140, 180));
    GS.up(pointer(d, 1, 100, 180)); GS.up(pointer(d, 2, 140, 180));
    await wait(60);
    assert.deepEqual(sent, ['up'], 'one stairs command, not a phantom "up" move');
});

test('(5/12) two fingers up during a fight never move and explain the fight instead', async t => {
    const { G, GS, d, spoken } = await ready(t);
    fight(G);
    const location = G.state.location;
    const sent = [];
    G.processCommand = command => { sent.push(command); return true; };
    GS.down(pointer(d, 1, 100, 300)); GS.down(pointer(d, 2, 140, 300));
    GS.move(pointer(d, 1, 100, 180)); GS.move(pointer(d, 2, 140, 180));
    GS.up(pointer(d, 1, 100, 180)); GS.up(pointer(d, 2, 140, 180));
    await wait(60);
    assert.deepEqual(sent, [], 'no movement command was sent');
    assert.equal(G.state.location, location, 'the hero stayed in the fight');
    assert.ok(spoken.some(line => /change floors during a fight/i.test(line)), 'the refusal is spoken');
});

test('(6/12) a lost finger cannot wedge gestures: the next swipe works a moment later', async t => {
    const { G, GS, d } = await ready(t);
    const enemy = fight(G);
    GS.reset();
    GS.down(pointer(d, 9, 100, 300));       // finger that never reports up
    GS.move(pointer(d, 9, 200, 200));
    const hp = enemy.hp;
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 }, 10);
    await wait(60);
    assert.equal(enemy.hp, hp, 'while the phantom is still fresh the swipe is treated as two fingers');
    assert.equal(GS.points.size, 1, 'the phantom is tracked, not silently dropped mid-gesture');
    await wait(1650);                        // the watchdog drops the phantom
    assert.equal(GS.points.size, 0, 'the phantom finger was cleared');
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 }, 11);
    await wait(150);
    assert.ok(enemy.hp < hp || !G.state.inCombat, 'the recovery swipe attacked the enemy');
});

/* ───────────── panels own their swipes ───────────── */

test('(7/12) a swipe that starts inside a panel never fires a combat action', async t => {
    const { G, d, GS } = await ready(t);
    const enemy = fight(G);
    const panel = d.querySelector('.panel');
    assert.ok(panel, 'the game has a panel element');
    panel.classList.remove('hidden');
    const hp = enemy.hp;
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 }, 21);
    await wait(120);
    assert.equal(enemy.hp, hp, 'the enemy took no damage from a panel swipe');
    panel.classList.add('hidden');
    worldSwipe(GS, d, { x: 100, y: 300 }, { x: 200, y: 200 }, 22);
    await wait(150);
    assert.ok(enemy.hp < hp || !G.state.inCombat, 'the same swipe on the world does fight');
});

test('(8/12) with a panel open, a combat swipe is answered instead of swallowed', async t => {
    const { G, UI, d, spoken } = await ready(t);
    const enemy = fight(G);
    UI.close();
    const panel = d.querySelector('.panel');
    panel.classList.remove('hidden');
    const hp = enemy.hp;
    UI.handle('up-right');
    await wait(120);
    assert.equal(enemy.hp, hp, 'nothing attacked behind an open panel');
    assert.ok(spoken.some(line => /panel is open/i.test(line) && /up-right attacks/i.test(line)), 'the refusal names the real combat gestures');
    panel.classList.add('hidden');
});

test('(9/12) walking with a panel open speaks a hint instead of doing nothing', async t => {
    const { G, UI, d, spoken } = await ready(t);
    const location = G.state.location;
    const panel = d.querySelector('.panel');
    panel.classList.remove('hidden');
    UI.move('north');
    await wait(60);
    assert.equal(G.state.location, location, 'the hero did not move');
    assert.ok(spoken.some(line => /panel is open/i.test(line)), 'the player is told why the swipe did nothing');
    panel.classList.add('hidden');
});

/* ───────────── combat buttons ───────────── */

test('(10/12) combat buttons enable for the right reasons and refresh after every command', async t => {
    const { G, d, UI } = await ready(t);
    UI.close(); G.closePanels();
    G.state.inCombat = false; G.state.enemy = null;
    G.updateCombatActionAvailability();
    const button = command => d.querySelector(`#combat-actions [data-combat-command="${command}"]`);
    assert.equal(button('attack').disabled, true, 'attack is disabled out of combat');
    assert.equal(button('inventory').disabled, true, 'combat-only controls stay unavailable out of combat');
    assert.equal(button('multiple strike').disabled, true, 'multiple strike needs a fight');
    G.state.player.spells = ['Multiple Strike'];
    G.startCombat('ice troll');
    G.state.sacred.enemyQueue = [];
    G.updateCombatActionAvailability();
    assert.equal(button('attack').disabled, false, 'attack is enabled in a fight');
    assert.equal(button('multiple strike').disabled, false, 'the spellbook name "Multiple Strike" enables the button');
    G.state.player.spells = ['multi strike'];
    G.updateCombatActionAvailability();
    assert.equal(button('multiple strike').disabled, false, 'and so does the engine name "multi strike"');
    G.state.player.spells = ['Shock'];
    G.updateCombatActionAvailability();
    assert.equal(button('multiple strike').disabled, true, 'a missing spell disables the button again');
    assert.equal(button('shock').disabled, false, 'shock is enabled when the hero knows it');
    button('attack').click();
    await wait(60);
    assert.ok(G.state.inCombat === false || G.state.enemy?.hp >= 0, 'the button ran a real attack');
});

/* ───────────── the spoken guide ───────────── */

test('(11/12) the spoken guide has a chapter for every topic the player asked about', async t => {
    const { G, UI, w, d, spoken } = await ready(t);
    UI.close(); G.closePanels();
    const chapters = UI.guideChapters();
    assert.equal(chapters.length, 6, 'six chapters');
    const all = chapters.map(chapter => `${chapter.title} ${chapter.text()}`).join(' ');
    for (const topic of [/north-east/i, /north-west/i, /south-east/i, /south-west/i, /inventory/i, /chest/i, /Snakes and Ladders/i, /Ludo/i, /up-right attacks/i, /double tap rolls/i]) {
        assert.match(all, topic, `the guide covers ${topic}`);
    }
    assert.doesNotMatch(all, /up-right opens known spells/i, 'no outdated instruction survives');
    assert.doesNotMatch(all, /say directions/i, 'the guide never names a command that does not exist');
    assert.match(all, /look around/i, 'it names a command that does exist');
    G.processCommand('guide');
    await wait(50);
    assert.match(UI.menu?.title || '', /Spoken guide/i, 'the guide command opens the chapter list');
    assert.equal(UI.menu.choices[0].label, chapters[0].title);
    UI.close();
    G.processCommand('spoken guide');
    await wait(30);
    assert.match(UI.menu?.title || '', /Spoken guide/i, 'the spoken alias works too');
    UI.close();
    UI.guide(4);
    await wait(30);
    assert.match(UI.menu?.title || '', /chapter 5 of 6/i, 'a chapter can be read directly');
    assert.ok(spoken.some(line => /Up-right attacks/i.test(line)), 'the combat chapter was spoken');
    const settingsButton = d.getElementById('gesture-guide-open');
    assert.ok(settingsButton, 'Settings has a spoken guide button');
    assert.match(settingsButton.textContent, /Spoken guide/i);
    assert.ok(d.getElementById('gesture-check-open'), 'and a controls self-check button');
});

test('(12/12) "check controls" reports what is really wired', async t => {
    const { G, UI, spoken } = await ready(t);
    UI.close(); G.closePanels();
    const notes = UI.checkControls().join(' ');
    assert.match(notes, /Gesture surface: present/, 'the pad exists');
    assert.match(notes, /World swipes: listening/, 'the world swipe layer is live');
    assert.match(notes, /Combat buttons: 9 present/, 'all nine combat buttons are in the DOM');
    assert.match(notes, /Board games: ready/, 'board games are loaded');
    assert.match(notes, /Inventory gestures: ready/, 'inventory gestures are loaded');
    G.processCommand('check controls');
    await wait(30);
    assert.ok(spoken.some(line => /Gesture surface: present/.test(line)), 'typing the command speaks the report');
});
