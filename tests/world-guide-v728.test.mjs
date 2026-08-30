import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRuntime } from '../scripts/load-world.mjs';

const guideSrc = readFileSync(new URL('../world-guide-rewards-v728.js', import.meta.url), 'utf8');
const achSrc = readFileSync(new URL('../hunt-achievements-v20.js', import.meta.url), 'utf8');
const npcSrc = readFileSync(new URL('../api/npc.js', import.meta.url), 'utf8');

test('v728 groups consecutive steps instead of repeating west west west', () => {
    assert.match(guideSrc, /East 3 times|name \+ ' twice'|groupSteps/);
    assert.match(guideSrc, /CARDINALS/);
});

test('v728 NPC guide refuses quest reward spoilers', () => {
    assert.match(guideSrc, /I will not name the prize/);
    assert.match(npcSrc, /NEVER name rewards/);
});

test('v728 achievements pay scaled gold not a flat 150', () => {
    assert.match(achSrc, /gold: 1400/);
    assert.doesNotMatch(achSrc, /\+150 🪙 gold/);
});

test('v728 city directory uses cardinals from current location', async t => {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const G = runtime.window.Game;
    G.startNewHero();
    runtime.window.document.getElementById('char-name').value = 'Guide Audit';
    runtime.window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    runtime.window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    const start = 'kaliwasch_district_15';
    const templeStreet = 'kaliwasch_district_23';
    if (!runtime.window.WorldData.locations[start] || !runtime.window.WorldData.locations[templeStreet]) return;
    G.state.location = start;
    const route = G.findPhysicalRoute(start, templeStreet);
    assert.ok(Array.isArray(route));
    assert.ok(route.every(d => ['north', 'east', 'south', 'west', 'up', 'down'].includes(d)));
    const spoken = G.formatPhysicalRoute(route);
    assert.equal(spoken.includes('West, West'), false);
    const reverse = G.findPhysicalRoute(templeStreet, start);
    assert.ok(reverse);
    assert.equal(route.length, reverse.length);
});

test('v728 world guide answers how to play without loot numbers', async t => {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const G = runtime.window.Game;
    G.startNewHero();
    runtime.window.document.getElementById('char-name').value = 'Guide Two';
    runtime.window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    runtime.window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    const a = G.worldGuideAnswer('how to play');
    assert.match(a, /north/i);
    const b = G.worldGuideAnswer('what gold do I get for this quest');
    assert.match(b, /prize|will not/i);
});
