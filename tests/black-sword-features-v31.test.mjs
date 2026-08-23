import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('20 named equipment sets exist without duplicate set ids', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { BASIC_SETS, ADV_SETS } = window.BlackSwordFeatures;
    assert.equal(BASIC_SETS.length, 10);
    assert.equal(ADV_SETS.length, 10);
    const ids = [...BASIC_SETS, ...ADV_SETS].map(s => s.id);
    assert.equal(new Set(ids).size, 20);
    assert.ok(window.WorldData.items['wolf gloves']);
    assert.equal(window.WorldData.items['wolf gloves'].slot, 'gloves');
    assert.ok(window.WorldData.items['direwolf cape']);
    assert.ok(window.WorldData.items['chainmail hauberk']);
    assert.ok(window.WorldData.items['pine torch'].damage >= 5);
    assert.equal(window.WorldData.items['silver left earring'].slot, 'leftEar');
    assert.equal(window.WorldData.items['horn-rim spectacles'].slot, 'eyes');
});

test('black search finds palace and black sword; empty and miss', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const lines = [];
    window.Game.addNarrative = (m) => lines.push(m);
    window.BlackSwordFeatures.blackSearch(window.Game, 'palace');
    assert.ok(lines.some(l => /palace/i.test(l)));
    lines.length = 0;
    window.BlackSwordFeatures.blackSearch(window.Game, 'black sword');
    assert.ok(lines.some(l => /shadow chamber/i.test(l)));
    lines.length = 0;
    window.BlackSwordFeatures.blackSearch(window.Game, '');
    assert.ok(lines.some(l => /type search/i.test(l)));
    lines.length = 0;
    window.BlackSwordFeatures.blackSearch(window.Game, 'zzzz-no-such');
    assert.ok(lines.some(l => /nothing/i.test(l)));
});

test('search dialog and action button are keyboard accessible', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const btn = window.document.getElementById('btn-black-search');
    const dlg = window.document.getElementById('black-search-dialog');
    const input = window.document.getElementById('black-search-input');
    assert.ok(btn);
    assert.match(btn.getAttribute('aria-label') || '', /search/i);
    assert.ok(dlg);
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.ok(input);
});

test('rope without a climb still works and torch is a right-hand weapon', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game;
    G.state.player = { name: 'H', hp: 50, maxHp: 50, initiative: 10 };
    G.state.inventory = [{ id: 'hemp rope', name: 'Hemp Rope', quantity: 1 }];
    G.state.location = 'kaliwasch';
    G.addNarrative = () => {};
    window.BlackSwordFeatures.useRope(G);
    assert.equal(window.WorldData.items['pine torch'].hands, 'right');
    assert.equal(window.WorldData.items['round shield'].hands, 'left');
    assert.equal(window.WorldData.items['steel greatsword'].hands, 'both');
});

test('set bonuses are idempotent and drop when a piece is removed', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game;
    G.state.player = { name: 'H', str: 10, dex: 10, int: 10, wis: 10, hp: 50, maxHp: 50, mp: 20, maxMp: 20, defense: 2, initiative: 10 };
    G.state.player.gloves = 'Wolf Gloves';
    G.state.player.back = 'Wolf Cape';
    window.BlackSwordFeatures.applySetBonuses(G);
    const dex1 = G.state.player.dex;
    window.BlackSwordFeatures.applySetBonuses(G);
    assert.equal(G.state.player.dex, dex1);
    assert.ok(G.state.player.activeSets.some(s => /Wolf/.test(s)));
    G.state.player.back = null;
    window.BlackSwordFeatures.applySetBonuses(G);
    assert.equal(G.state.player.dex, 10);
});

test('two-handed weapon blocks a left-hand shield', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game;
    const lines = [];
    G.addNarrative = (m) => lines.push(m);
    G.state.player = { name: 'H', str: 10, dex: 10, int: 10, wis: 10, hp: 40, maxHp: 40, defense: 1, initiative: 10, rightHand: 'Steel Greatsword', leftHand: '(holding two-handed)' };
    G.state.inventory = [{ id: 'round shield', name: 'Round Shield', quantity: 1, hands: 'left', slot: 'leftHand', type: 'shield' }];
    G.equipItem('round shield');
    assert.ok(lines.some(l => /two-handed|both hands/i.test(l)));
    assert.notEqual(G.state.player.leftHand, 'Round Shield');
});

test('palace increaseAttribute accepts initiative and refuses a second spend', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game;
    G.state.location = 'royal_palace';
    G.state.player = { name: 'H', str: 10, dex: 10, int: 10, wis: 10, hp: 40, maxHp: 40, initiative: 10 };
    G.state.sacred = { unspentAttributePoints: 1, pendingPalaceAdvancements: 0 };
    G.increaseAttribute('initiative');
    assert.equal(G.state.sacred.unspentAttributePoints, 0);
    assert.ok((G.state.player.initiative || 0) >= 12);
    const init = G.state.player.initiative;
    G.increaseAttribute('dexterity');
    assert.equal(G.state.player.initiative, init);
    assert.equal(G.state.player.dex, 10);
});
