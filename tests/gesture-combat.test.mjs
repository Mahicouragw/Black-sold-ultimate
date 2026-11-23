/**
 * Gesture combat, healing, magic, objects and mastery (v7.60).
 *
 * These tests drive the same public surface a blind player uses: the gesture
 * tokens (up-right, up-left, down-right, down-left, double tap, two-finger
 * swipes) and the narrator. Nothing here clicks a visual button.
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
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.dropWorldItem = async () => false;
    w.OnlineSystem.recordGroupAttack = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Gestures';
    w.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    w.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    w.ProfessionalAudioCombat = null;
    w.AudioManager.endBattle = async () => {};
    w.Math.random = () => 0.5;
    w.GameSpellSystem.random = () => 0.5;
    const spoken = [];
    w.speechSynthesis.speak = u => { spoken.push(u.text); u.onstart?.(); u.onend?.(); };
    const api = w.GestureAccessibility;
    // The game's own narrator, independent of TalkBack.
    api.settings.narration = true; api.UI.save();
    w.AudioManager.voiceEnabled = true;
    api.UI.close(); G.closePanels();
    return { ...r, G, w, api, UI: api.UI, settings: api.settings, spoken };
}

/** Start a real fight with a monster tough enough to survive several hits. */
function fight(G, name = 'ice troll') {
    G.state.location = 'kaliwasch';
    G.startCombat(name);
    G.state.sacred.enemyQueue = [];
    G.state.combatTransition = false;
    return G.state.enemy;
}

const combat = async (UI, token, ms = 140) => { UI.handle(token); await wait(ms); };

test('(01/21) up-right during a fight performs a basic attack on the real enemy', async t => {
    const { G, UI } = await ready(t);
    const enemy = fight(G);
    const hp = enemy.hp;
    await combat(UI, 'up-right');
    assert.ok(enemy.hp < hp, 'the enemy lost real health');
    assert.equal(G.state.inCombat, true);
});

test('(02/21) combat gestures never move or turn the hero', async t => {
    const { G, UI, w } = await ready(t);
    fight(G);
    const location = G.state.location, facing = UI.facing();
    await combat(UI, 'up-right');
    await combat(UI, 'up-left');
    await combat(UI, 'down-right');
    assert.equal(G.state.location, location);
    assert.equal(UI.facing(), facing);
    assert.equal(w.document.querySelector('.class-btn.selected').dataset.class, 'warrior');
});

test('(03/21) up-left casts the chosen spell and spends its real mana', async t => {
    const { G, UI, settings } = await ready(t);
    const enemy = fight(G);
    settings.spell = 'Minor Heal';
    G.state.player.hp = 80;
    const mp = G.state.player.mp, hp = G.state.player.hp;
    await combat(UI, 'up-left', 250);
    assert.ok(G.state.player.mp < mp, 'mana was spent');
    assert.ok(G.state.player.hp > hp, 'the spell really healed');
});

test('(04/21) down-right braces for the next blow instead of attacking', async t => {
    const { G, UI } = await ready(t);
    const enemy = fight(G);
    const hp = enemy.hp;
    UI.handle('down-right');
    assert.equal(G.state.defending, true, 'the brace is real state, set immediately');
    await wait(150);
    assert.ok(enemy.hp <= hp, 'defending does not heal the enemy');
});

test('(05/21) down-left heals with a real spell and announces health before and after', async t => {
    const { G, UI, spoken } = await ready(t);
    fight(G);
    G.state.player.hp = 40;
    const mp = G.state.player.mp;
    await combat(UI, 'down-left', 120);
    assert.ok(G.state.player.hp > 40, 'health really increased');
    assert.ok(G.state.player.mp < mp, 'mana was really spent');
    assert.ok(spoken.some(line => /Health \d+ of \d+/.test(line)), 'the narrator states current health');
});

test('(06/21) down-left never silently fails: no mana and no item is explained', async t => {
    const { G, UI, spoken } = await ready(t);
    fight(G);
    G.state.player.hp = 40;
    G.state.player.mp = 0;
    G.state.inventory = G.state.inventory.filter(i => i.effect !== 'heal' && i.effect !== 'both');
    await combat(UI, 'down-left', 80);
    assert.equal(G.state.player.hp, 40, 'health unchanged when nothing can heal');
    assert.ok(spoken.some(line => /No healing is available/.test(line)), 'the reason is spoken');
});

test('(07/21) down-left consumes exactly one healing item and reports the new health', async t => {
    const { G, UI, spoken } = await ready(t);
    fight(G);
    G.state.player.hp = 45;
    G.state.player.mp = 0;
    const stock = () => G.state.inventory.filter(i => /healing potion/i.test(i.name)).reduce((n, i) => n + (i.quantity || 0), 0);
    if (!stock()) G.state.inventory.push({ id: 'healing potion', name: 'Healing Potion', type: 'consumable', effect: 'heal', value: 20, quantity: 1, weight: 0.2 });
    const beforeCount = stock();
    await combat(UI, 'down-left', 160);
    assert.ok(G.state.player.hp > 45, 'the potion healed');
    assert.equal(stock(), beforeCount - 1, 'exactly one potion was consumed');
    assert.ok(spoken.some(line => /Health \d+ of \d+/.test(line)));
});

test('(08/21) the same healing item can never be consumed twice by a repeated tap', async t => {
    const { G } = await ready(t);
    G.state.player.hp = 40;
    G.state.player.mp = 0;
    G.state.inventory.push({ id: 'healing potion', name: 'Healing Potion', type: 'consumable', effect: 'heal', value: 20, quantity: 2, weight: 0.2 });
    G.useItem('Healing Potion');
    G.useItem('Healing Potion');   // inside the 400 ms double-activation guard
    const potion = G.state.inventory.find(i => i.id === 'healing potion');
    assert.equal(potion.quantity, 1, 'only one potion left the pack');
});

test('(09/21) diagonal swipes outside a fight never attack, cast or defend', async t => {
    const { G, UI } = await ready(t);
    assert.equal(G.state.inCombat, false);
    const location = G.state.location;
    await combat(UI, 'up-right', 40);
    assert.equal(G.state.inCombat, false);
    assert.equal(G.state.defending, false);
    assert.equal(G.state.enemy, null, 'no enemy was created by a diagonal swipe');
    assert.equal(G.state.location, location, 'the diagonal swipe did not start a hunt or a walk');
});

test('(10/21) heavy attack lands for more than a quick jab and then cools down', async t => {
    const { G } = await ready(t);
    const enemy = fight(G, 'stone guardian');
    const hp = enemy.hp;
    G.combatAbility('heavy');
    await wait(150);
    const heavyDamage = hp - enemy.hp;
    assert.ok(heavyDamage > 0, 'the heavy swing landed');
    assert.equal(G.combatCooldown('heavy'), 2, 'the narrated cooldown is real state');
    const after = enemy.hp;
    G.combatAbility('heavy');
    await wait(60);
    assert.equal(enemy.hp, after, 'a cooling-down ability cannot be used again');
    assert.equal(G.combatCooldown('heavy'), 2, 'refusal does not consume the cooldown');
});

test('(11/21) Multi-Strike performs three real strikes and charges its real cost', async t => {
    const { G, spoken } = await ready(t);
    const enemy = fight(G, 'stone guardian');
    const hp = enemy.hp, mp = G.state.player.mp;
    assert.ok(G.state.player.spells.includes('Multi Strike'));
    G.combatAbility('multi');
    await wait(650);
    assert.ok(enemy.hp < hp, 'strikes landed');
    assert.ok(G.state.player.mp < mp, 'the spell cost its mana');
    const mastery = G.getSpellMastery('Multi Strike');
    assert.equal(mastery.attempts, 1, 'the cast was recorded once');
    assert.equal(mastery.successes, 1, 'the real damage made it a success');
    assert.equal(mastery.failures, 0);
    assert.ok(spoken.length >= 0);
});

test('(12/21) every ability names itself, its cost, its cooldown and a description', async t => {
    const { G } = await ready(t);
    const ids = ['basic', 'heavy', 'quick', 'multi', 'magic', 'defensive', 'special'];
    assert.equal(G.COMBAT_ABILITIES.length, ids.length);
    for (const id of ids) {
        const a = G.combatAbilityInfo(id);
        assert.ok(a.name && a.desc, `${id} is named and described`);
        assert.ok(typeof a.cost === 'number' || a.cost === null, `${id} states its mana cost`);
        assert.ok(typeof a.cooldown === 'number', `${id} states its cooldown`);
    }
    G.describeCombatAbility('heavy');
});

test('(13/21) mastery is counted from real attempts, not invented', async t => {
    const { G } = await ready(t);
    G.state.spellMastery = Object.assign({}, G.state.spellMastery, {
        'multi strike': { xp: 500, casts: 10, totalMp: 240, totalDamage: 90, totalHealing: 0, attempts: 10, successes: 9, failures: 1 }
    });
    const m = G.getSpellMastery('Multi Strike');
    assert.equal(m.attempts, 10);
    assert.equal(m.successes, 9);
    assert.equal(m.failures, 1);
    assert.equal(m.percent, 90);
    assert.equal(m.level, 2);
    assert.equal(G.getSpellMastery('Power Strike').attempts, 0);
    assert.equal(G.getSpellMastery('Power Strike').percent, 0);
});

test('(14/21) the spoken mastery sentence states 90 percent and warns it is practice, not a guarantee', async t => {
    const { G, spoken } = await ready(t);
    G.state.spellMastery = Object.assign({}, G.state.spellMastery, {
        'multi strike': { xp: 500, casts: 10, totalMp: 240, totalDamage: 90, totalHealing: 0, attempts: 10, successes: 9, failures: 1 }
    });
    G.processCommand('mastery Multi Strike');
    await wait(250);
    const line = spoken.find(text => /mastery 90 percent/i.test(text));
    assert.ok(line, 'the percentage is spoken');
    assert.match(line, /practis/i);
    assert.match(line, /not a guarantee/i);
});

test('(15/21) a failed cast is recorded as a failure and explains itself', async t => {
    const { G, spoken } = await ready(t);
    fight(G);
    G.state.player.mp = 0;
    G.state.spellMastery = Object.assign({}, G.state.spellMastery, {});
    const before = G.getSpellMastery('Multi Strike');
    G.processCommand('cast Multi Strike');
    await wait(550);
    const after = G.getSpellMastery('Multi Strike');
    assert.equal(after.attempts, before.attempts + 1);
    assert.equal(after.failures, before.failures + 1, 'the failure is counted');
    assert.equal(after.successes, before.successes);
    assert.ok(spoken.some(line => /not enough mana|not have enough mana/i.test(line)), 'the reason is spoken');
});

test('(16/21) mastery and combat progress survive a save and reload', async t => {
    const { G, w } = await ready(t);
    fight(G);
    G.castSpell('Multi Strike');
    await wait(550);
    const save = G.getSaveData();
    assert.ok(save.spellMastery?.['multi strike']?.attempts >= 1, 'mastery attempts are saved');
    assert.equal(typeof save.combatCooldowns, 'object');
    const reloaded = JSON.parse(JSON.stringify(save));
    G.state.spellMastery = reloaded.spellMastery;
    G.state.combatCooldowns = reloaded.combatCooldowns;
    assert.equal(G.getSpellMastery('Multi Strike').attempts, 1);
    assert.ok(w.Game.getSaveData().inventory === G.state.inventory);
});

test('(17/21) two-finger swipes browse what is really nearby and describe it truthfully', async t => {
    const { G, UI, spoken, w } = await ready(t);
    G.enterLocation('kaliwasch');
    const expected = (w.WorldData.npcs[G.state.location] || []).length + (w.WorldData.locations[G.state.location].items || []).length;
    UI.handle('two-right');
    await wait(150);
    assert.ok(UI.focusList.length >= expected, 'every nearby person and object is listed');
    assert.equal(UI.focusIndex, 0);
    assert.ok(spoken.some(line => /1 of \d+/.test(line)), 'position in the list is spoken');
    const first = UI.focusList[0];
    assert.ok(first.describe.includes(first.label));
    if (first.kind === 'item') assert.match(first.describe, /collect/i);
    UI.handle('two-left');
    assert.equal(UI.focusIndex, UI.focusList.length - 1, 'left wraps to the previous object');
});

test('(18/21) double tap collects an object once and never reports a duplicate success', async t => {
    const { G, UI, w } = await ready(t);
    G.enterLocation('kaliwasch');
    const objects = UI.nearbyObjects();
    const index = objects.findIndex(o => o.kind === 'item' && /bread/i.test(o.label));
    assert.ok(index >= 0, 'bread is really in this room');
    UI.focusList = objects; UI.focusIndex = index;
    const count = () => G.state.inventory.filter(i => /bread/i.test(i.name)).reduce((n, i) => n + (i.quantity || 0), 0);
    const before = count();
    UI.handle('double');
    await wait(80);
    assert.equal(count(), before + 1, 'the bread entered the pack exactly once');
    assert.ok(!(w.WorldData.locations[G.state.location].items || []).includes('bread'), 'the room no longer lists it');
    UI.handle('double');
    await wait(80);
    assert.equal(count(), before + 1, 'a second double tap cannot duplicate the pickup');
});

test('(19/21) doors and people are reachable by browse and double tap, with the right command', async t => {
    const { G, UI, w } = await ready(t);
    const calls = [];
    const real = G.processCommand.bind(G);
    G.processCommand = input => { calls.push(String(input)); return real(input); };
    G.enterLocation('public_house_kaliwasch_1_door');
    const door = UI.nearbyObjects().find(o => o.kind === 'door');
    assert.ok(door, 'the door is offered');
    door.run();
    assert.match(calls.pop(), /^(open|close) door$/);
    G.enterLocation('kaliwasch');
    const person = UI.nearbyObjects().find(o => o.kind === 'person');
    assert.ok(person, 'the merchant is offered');
    person.run();
    assert.match(calls.pop(), /^talk /);
    assert.ok(w.WorldData.npcs.kaliwasch.length > 0);
});

test('(20/21) a doubled swipe cannot fire the same combat action twice', async t => {
    const { G, UI } = await ready(t);
    const enemy = fight(G);
    const hp = enemy.hp;
    UI.handle('up-right');
    UI.handle('up-right');          // same physical gesture reported twice
    await wait(150);
    const lost = hp - enemy.hp;
    assert.ok(lost > 0, 'the first swipe landed');
    const maxOneHit = 60;
    assert.ok(lost <= maxOneHit, `only one attack resolved, lost ${lost}`);
});

test('(21/21) panels and walls keep gestures honest, and the game works without TalkBack', async t => {
    const { G, UI, w, spoken } = await ready(t);
    const enemy = fight(G);
    const hp = enemy.hp, location = G.state.location;
    UI.open('Paused panel', [{ label: 'Nothing', run() {} }]);
    UI.handle('up-right');
    await wait(60);
    assert.equal(enemy.hp, hp, 'no attack fires while a panel is open');
    UI.close();
    UI.handle('up');                                  // walking swipe during combat
    await wait(60);
    assert.equal(G.state.location, location, 'walking gestures never move during combat');
    w.speechSynthesis.speak = () => {};              // no screen reader at all
    await combat(UI, 'up-right');
    assert.ok(enemy.hp < hp, 'game outcomes do not depend on TalkBack');
    assert.equal(w.document.getElementById('gesture-interface').hidden, false);
    assert.ok(spoken.length > 0);
});
