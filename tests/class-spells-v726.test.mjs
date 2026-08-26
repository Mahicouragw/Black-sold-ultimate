import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../class-spells-v726.js', import.meta.url), 'utf8');

test('every class lists four helper spells', () => {
    const block = src.match(/const CLASS_HELPERS = \{([\s\S]*?)\};/)[1];
    const classes = [...block.matchAll(/(\w+):\s*\[([^\]]+)\]/g)];
    assert.ok(classes.length >= 10);
    for (const [, name, list] of classes) {
        const spells = list.split(',').map(s => s.trim()).filter(Boolean);
        assert.equal(spells.length, 4, `${name} should have 4 helpers`);
    }
});

test('shared starters and island shark exist', () => {
    assert.match(src, /SHARED = \['Minor Heal', 'Multi Strike'\]/);
    assert.match(src, /ISLAND_SPELL = 'Shark Tide'/);
    assert.match(src, /Call Familiar/);
    assert.match(src, /Command Beast/);
});

test('guild grants two helpers and island grants shark', () => {
    assert.match(src, /helpersFor\(p\.class\)\.slice\(0, 2\)/);
    assert.match(src, /island_storm_hunt/);
    assert.match(src, /Shark Tide/);
});
