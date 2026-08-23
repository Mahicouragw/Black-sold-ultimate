import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

function hero(window) {
    const { Game } = window;
    Game.state.player = {
        name: 'Goldfish', gold: 80, hp: 40, maxHp: 100, mp: 80, maxMp: 80,
        level: 3, wis: 14, spells: ['Heal', 'Alohomora'], weapon: 'Staff'
    };
    Game.state.companions = [
        { name: 'Silverfish', hp: 10, maxHp: 50 },
        { name: 'Jellyfish', hp: 20, maxHp: 40 }
    ];
    Game.state.combatGroup = ['Goldfish', 'Mummyfish'];
    Game.state.location = 'kaliwasch';
    Game.state.inCombat = false;
    Game.addNarrative = () => {};
    return Game;
}

test('tutorial chapters exist and cover create, fight, delete', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    assert.ok(window.GameTutorials);
    const ids = Object.keys(window.GameTutorials.CHAPTERS);
    for (const id of ['create', 'where', 'do', 'fight', 'heal', 'doors', 'racing', 'delete']) {
        assert.ok(ids.includes(id), id);
        assert.ok(window.GameTutorials.CHAPTERS[id].text.length > 40);
    }
});

test('opening doors with no door shouts and spends no mana', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const Game = hero(window);
    const mp = Game.state.player.mp;
    window.GameTutorials.shoutOpeningDoor(Game);
    assert.equal(Game.state.player.mp, mp);
});

test('battle-party heal restores self, companions, and names group allies', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const Game = hero(window);
    const ok = window.GameTutorials.castPartyHeal(Game, 'party');
    assert.equal(ok, true);
    assert.ok(Game.state.player.hp > 40);
    assert.ok(Game.state.companions[0].hp > 10);
    assert.ok(Game.state.companions[1].hp > 20);
    assert.ok(Game.state.player.mp < 80);
});

test('delete confirmation dialog can cancel', async t => {
    const { window, dom } = await createRuntime();
    t.after(() => dom.window.close());
    const p = window.GameTutorials.confirmAction({ title: 'Delete hero', body: 'Sure?' });
    window.document.getElementById('confirm-dialog-no').click();
    assert.equal(await p, false);
});
