import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function runtime(t) {
    const fixture = await createRuntime();
    t.after(() => {
        try { fixture.window.AudioManager.pausePageAudio(); } catch {}
        fixture.dom.window.close();
    });
    return fixture.window;
}

test('a real goblin hit emits exact narration, one weapon impact and one reaction', async t => {
    const window = await runtime(t), G = window.Game;
    G.state.player = {
        name: 'Audio Audit', hp: 100, maxHp: 100, mp: 50, maxMp: 50,
        weaponDamage: 8, str: 10, dex: 10, defense: 1, weapon: '', spells: []
    };
    G.state.enemy = { name: 'root goblin', hp: 100, maxHp: 100, dex: 8, defense: 0, attack: 4 };
    G.state.inCombat = true;
    G.state.sacred = { ...(G.state.sacred || {}), enemyQueue: [] };
    G.companionTurn = () => {}; G.enemyAttack = () => {};
    G.updateEnemyHUD = () => {}; G.updateHUD = () => {};
    window.OnlineSystem.recordGroupAttack = () => {};
    window.Math.random = () => .5; // hit, ordinary variance, no critical
    const events = [], legacy = [];
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return Promise.resolve(true); };
    window.MusicSystem.playSFX = type => { legacy.push(type); return true; };
    G.playerAttack();
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{
        text: 'You hit root goblin for 18 damage.', type: 'combat',
        options: { sfx: ['weapon-hit'], reaction: ['goblin-reaction'] }
    }]);
    assert.deepEqual(legacy, [], 'the old effect-first path must not duplicate the hit');
    assert.equal(G.state.enemy.hp, 82);
});

test('trade gold and settlement use narration-first coin events once', async t => {
    const window = await runtime(t), G = window.Game, Trading = window.Trading;
    G.state.player = { ...(G.state.player || {}), gold: 100 };
    const events = [];
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return Promise.resolve(true); };
    Trading.draft = { heroName: 'Raven', items: [], gold: 0 };
    assert.equal(Trading.addGold('25'), true);
    assert.deepEqual([...events[0].options.sfx], ['coin']);
    window.OnlineSystem.ready = true;
    window.OnlineSystem.user = { id: 'audio-audit' };
    window.OnlineSystem.client = { rpc: async (name, args) => ({ data: name === 'create_trade_offer' ? 'trade-1' : null, error: null, args }) };
    assert.equal(await Trading.send(), true);
    assert.equal(Trading.draft, null);
    assert.equal(events.length, 2);
    assert.match(events[1].text, /^Trade offer sent to Raven\./);
    assert.deepEqual([...events[1].options.sfx], ['coin']);
});

test('real bread consumption emits eat only and never a healing effect', async t => {
    const window = await runtime(t), G = window.Game;
    G.state.player = {
        name: 'Audio Audit', hp: 40, maxHp: 100, mp: 10, maxMp: 50,
        str: 10, satiety: 20, hungerStrPenalty: 4, spells: []
    };
    G.state.inventory = [{ ...window.WorldData.items.bread, id: 'bread', name: 'Bread', quantity: 2, type: 'food', effect: 'hunger', satiety: 24 }];
    G.updateHUD = () => {}; G.save = () => {};
    const events = [];
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return Promise.resolve(true); };
    G.useItem('bread');
    assert.equal(G.state.player.satiety, 44);
    assert.equal(G.state.player.hp, 40);
    assert.equal(G.state.inventory[0].quantity, 1);
    assert.equal(events.length, 1);
    assert.match(events[0].text, /you eat bread/i);
    assert.deepEqual([...events[0].options.sfx], ['eat']);
    assert.equal(events[0].options.sfx.includes('heal'), false);
});

test('committed movement narrates first and selects the destination terrain recording', async t => {
    const window = await runtime(t), G = window.Game;
    window.WorldData.locations.audio_origin = { name: 'Origin', description: 'A quiet room.', exits: { north: 'audio_mud' }, features: [], safe: true };
    window.WorldData.locations.audio_mud = { name: 'Muddy Bog', description: 'A wet marsh with soft mud.', exits: {}, features: [], safe: true };
    G.state.location = 'audio_origin'; G.state.inCombat = false; G._movementPending = false;
    G.enterLocation = id => { G.state.location = id; };
    const events = [];
    G.emitGameEvent = (text, type, options) => { events.push({ text, type, options }); return Promise.resolve(true); };
    G.move('north'); await wait(350);
    assert.equal(G.state.location, 'audio_mud');
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{ text: 'You moved north to Muddy Bog.', type: 'location', options: { sfx: ['step-mud'] } }]);
    assert.equal(G.getFootstepSFX({ name: 'Forest Grove', features: ['canopy'] }), 'step-leaves');
    assert.equal(G.getFootstepSFX({ name: 'Old House', features: ['wooden floorboards'] }), 'step-wood');
    assert.equal(G.getFootstepSFX({ name: 'Mountain Trail' }), 'step-gravel');
    assert.equal(G.getFootstepSFX({ name: 'City Street' }), 'step-stone');
});
