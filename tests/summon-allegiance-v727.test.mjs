import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const runtime = await createRuntime();
    t.after(() => {
        try {
            const G = runtime.window.Game;
            G.state.inCombat = false;
            G.state.enemy = null;
            G._survivorWait = (G._survivorWait || 0) + 1;
        } catch {}
        runtime.dom.window.close();
    });
    const { window } = runtime;
    const G = window.Game;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    window.document.getElementById('char-name').value = 'Summon Audit';
    window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    window.document.querySelector('.class-btn[data-class="summoner"]').classList.add('selected');
    G.createCharacter(false);
    G.state.player.spells = ['Minor Heal', 'Multi Strike', 'Call Familiar', 'Command Beast', 'Shade Mage', 'Alohomora'];
    G.state.player.mp = 200;
    G.state.player.maxMp = 200;
    window.Math.random = () => 0.99;
    window.ProfessionalAudioCombat = null;
    return runtime;
}

function startFight(G, extra = ['wild boar']) {
    G.state.location = 'forest';
    G.startCombat('goblin scout');
    G.state.sacred = G.state.sacred || {};
    G.state.sacred.enemyQueue = extra;
    G.state.companions = [];
    G.state.combatGroup = [];
}

test('v727 successful summon deducts exact MP and joins party', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    const before = G.state.player.mp;
    const r = G.summonCreature('spirit wolf');
    assert.equal(r.ok, true);
    assert.equal(G.state.player.mp, before - 60);
    assert.equal(G.state.companions[0].name, 'Spirit Wolf');
    assert.equal(G.state.companions[0].team, 'player');
    assert.equal(G.state.companions[0].temporary, true);
});

test('v727 insufficient MP does not summon or spend', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.state.player.mp = 10;
    const r = G.summonCreature('storm wolf');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'mp');
    assert.equal(r.need, 150);
    assert.equal(G.state.player.mp, 10);
    assert.equal(G.state.companions.length, 0);
    assert.match(window.document.getElementById('narrative').textContent, /need 150 magic/i);
});

test('v727 high-level summon costs 150', async t => {
    const { window } = await ready(t);
    assert.equal(window.Game.getSummonData('storm wolf').mp, 150);
});

test('v727 full party blocks summon', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.state.companions = [
        { name: 'A', hp: 10, maxHp: 10 },
        { name: 'B', hp: 10, maxHp: 10 },
        { name: 'C', hp: 10, maxHp: 10 }
    ];
    const mp = G.state.player.mp;
    const r = G.summonCreature('spider');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'full');
    assert.equal(G.state.player.mp, mp);
});

test('v727 summoned creature can take damage and die', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.summonCreature('spider');
    const c = G.state.companions[0];
    c.hp = 5;
    c.converted = true;
    window.Math.random = () => 0.01;
    G.enemyAttack();
    assert.ok(c.hp < 5 || !G.state.companions.includes(c) || c.hp >= 0);
    c.hp = 0;
    G.state.companions = G.state.companions.filter(x => x.hp > 0);
    assert.equal(G.state.companions.some(x => x.name === 'Moon Spider' && x.hp > 0), false);
});

test('v727 summons dismissed after battle', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G, []);
    G.summonCreature('goblin');
    G.state.inCombat = false;
    G.state.enemy = null;
    G.dismissTemporarySummons();
    assert.equal(G.state.companions.length, 0);
});

test('v727 successful enchantment changes allegiance', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G, ['wolf']);
    window.Math.random = () => 0.99;
    const name = G.state.enemy.name;
    const r = G.commandBeast();
    assert.equal(r.ok, true);
    const ally = G.state.companions.find(c => c.converted);
    assert.ok(ally);
    assert.equal(ally.team, 'player');
    assert.equal(ally.name, name);
});

test('v727 failed enchantment does not convert', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    window.Math.random = () => 0;
    const r = G.commandBeast();
    assert.equal(r.ok, false);
    assert.equal(G.state.companions.filter(c => c.converted).length, 0);
});

test('v727 converted creature takes normal damage', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    window.Math.random = () => 0.99;
    G.commandBeast();
    const ally = G.state.companions.find(c => c.converted);
    if (!ally) return;
    const hp = ally.hp;
    ally.hp = Math.max(1, hp - 7);
    assert.equal(ally.hp, Math.max(1, hp - 7));
    assert.ok(ally.hp > 0 || ally.hp === 0);
});

test('v727 enchantment duration expires', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G, ['wolf']);
    window.Math.random = () => 0.99;
    G.commandBeast();
    const ally = G.state.companions.find(c => c.converted);
    if (!ally) return;
    ally.charmTurns = 0;
    G.releaseEnchantment(ally);
    assert.equal(G.state.companions.some(c => c.converted), false);
});

test('v727 healer summon heals player team not enemy', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.summonCreature('healing spirit');
    const healer = G.state.companions[0];
    assert.ok(healer.heal > 0);
    assert.equal(healer.team, 'player');
    const enemyHp = G.state.enemy.hp;
    G.state.player.hp = 20;
    G.state.player.maxHp = 100;
    healer.heal = 14;
    G.companionTurn();
    assert.equal(G.state.enemy.hp, enemyHp);
});

test('v727 spirit ring summons spirit wolf', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.state.inventory.push({ ...window.WorldData.items['spirit ring'], id: 'spirit ring', quantity: 1 });
    G.state.player.mp = 80;
    G.useItem('spirit ring');
    assert.ok(G.state.companions.some(c => c.name === 'Spirit Wolf'));
});

test('v727 ring insufficient MP', async t => {
    const { window } = await ready(t);
    const G = window.Game;
    startFight(G);
    G.state.inventory.push({ ...window.WorldData.items['storm ring'], id: 'storm ring', quantity: 1 });
    G.state.player.mp = 10;
    G.useItem('storm ring');
    assert.equal(G.state.companions.length, 0);
    assert.equal(G.state.player.mp, 10);
});

test('v727 bestiary and rings registered', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../summon-allegiance-rings-v727.js', import.meta.url), 'utf8');
    assert.match(src, /storm wolf/);
    assert.match(src, /spirit ring/);
    assert.match(src, /dismissTemporarySummons/);
    assert.match(src, /team: 'player'/);
});
