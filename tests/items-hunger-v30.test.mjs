import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

test('food restores satiety and strength, not HP', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const { Game, WorldData, ItemHunger } = window;
    Game.state.player = { name: 'Hero', hp: 40, maxHp: 100, mp: 10, maxMp: 50, str: 10, satiety: 20, hungerStrPenalty: 4, spells: [] };
    Game.state.inventory = [{ ...WorldData.items.bread, id: 'bread', name: 'Bread', quantity: 1, type: 'food', effect: 'hunger', satiety: 24 }];
    Game.addNarrative = () => {};
    ItemHunger.eatFood(Game, Game.state.inventory[0]);
    assert.equal(Game.state.player.hp, 40);
    assert.equal(Game.state.player.mp, 10);
    assert.ok(Game.state.player.satiety > 20);
    assert.ok(Game.state.player.hungerStrPenalty < 4 || Game.state.player.satiety > 40);
});

test('thorium spear and silver arrow exist with unique real descriptions', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const items = window.WorldData.items;
    assert.ok(items['thorium spear']);
    assert.ok(items['silver arrow']);
    assert.match(items['thorium spear'].desc, /thorium/i);
    assert.match(items['silver arrow'].desc, /silver/i);
    assert.doesNotMatch(items['thorium spear'].name, /whale/i);
    const added = Object.values(window.ItemHunger.NEW_ITEMS);
    const names = added.map(i => i.name);
    const descs = added.map(i => i.desc);
    assert.equal(new Set(names).size, names.length, 'duplicate new item names');
    assert.equal(new Set(descs).size, descs.length, 'duplicate new item descriptions');
});

test('exact movement commands are never rewritten to map or anything else', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const g = window.ItemHunger.guessCommand;
    assert.equal(g('up'), 'up');
    assert.equal(g('down'), 'down');
    assert.equal(g('u'), 'u');
    assert.equal(g('n'), 'n');
    assert.equal(g('map'), 'map');
    assert.equal(g('examine'), 'examine');
    assert.equal(g('loook'), 'look');
    assert.equal(g('nort'), 'north');
    assert.equal(g('xyzzy'), null);
});

test('typed up moves up instead of opening the map', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const G = window.Game;
    const seen = [];
    const prev = G.processCommand.bind(G);
    G.processCommand = function (raw) {
        seen.push(String(raw));
        return prev(raw);
    };
    window.ItemHunger; // ensure bound
    // Re-enter through the live engine (already wrapped).
    G.processCommand = prev;
    const lines = [];
    const add = G.addNarrative.bind(G);
    G.addNarrative = (m, t) => { lines.push(String(m)); return add(m, t); };
    G.state.location = 'kaliwasch';
    G.state.inCombat = false;
    G.processCommand('up');
    assert.equal(lines.some(l => /treating that as/i.test(l)), false);
    assert.equal(lines.some(l => /world map|text map/i.test(l)), false);
});

test('fuzzy command maps loook to look', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    assert.equal(window.ItemHunger.guessCommand('loook'), 'look');
    assert.equal(window.ItemHunger.guessCommand('attak'), 'attack');
});

test('hunger announcement when satiety is low', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const lines = [];
    const Game = window.Game;
    Game.state.player = { name: 'Hero', hp: 50, maxHp: 100, mp: 20, maxMp: 20, str: 12, satiety: 18, hungerStrPenalty: 0 };
    Game.addNarrative = (t) => lines.push(t);
    Game.emitGameEvent = (t) => { lines.push(t); return Promise.resolve(false); };
    window.ItemHunger.hungerTick(Game, 1);
    assert.ok(lines.some(l => /you are hungry/i.test(l)));
});
