import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.64.0 — every location must describe itself differently. A screen-reader
 * player who hears the same paragraph in two rooms cannot tell where they are. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    return r.window;
}

const descriptions = w => Object.fromEntries(Object.entries(w.WorldData.locations).map(([id, loc]) => [id, String(loc.description || '').trim()]));

test('no two locations share a description', async t => {
    const w = await ready(t);
    w.DistinctPlaces.apply();
    const rows = Object.entries(descriptions(w));
    const seen = new Map();
    const clashes = [];
    for (const [id, text] of rows) {
        if (seen.has(text)) clashes.push([seen.get(text), id]);
        else seen.set(text, id);
    }
    assert.ok(rows.length >= 1100, `the world has ${rows.length} places`);
    assert.deepEqual(clashes, [], 'every description is unique');
});

test('every rewritten description talks about its own place', async t => {
    const w = await ready(t);
    w.DistinctPlaces.apply();
    const locations = w.WorldData.locations;
    for (const id of ['great_forest_path_1', 'great_forest_path_2', 'endless_cave_3', 'private_house_kaliwasch_hall']) {
        const loc = locations[id];
        assert.ok(loc.description.startsWith(loc.name), `${id} starts with its own name`);
        assert.ok(loc.description.length > 60, `${id} has a real description`);
    }
    const first = locations.great_forest_path_1.description;
    const second = locations.great_forest_path_2.description;
    assert.notEqual(first, second);
    assert.match(first, /Ways lead|You can see|forest/i);
});

test('a second pass changes nothing: the rewrite is idempotent', async t => {
    const w = await ready(t);
    // The start-up pass may or may not have run yet, so apply until it reports
    // no further change and then prove that state is stable.
    for (let attempt = 0; attempt < 3 && w.DistinctPlaces.apply().rewritten > 0; attempt++) { /* finish the first pass */ }
    assert.equal(w.DistinctPlaces.apply().rewritten, 0, 'a repeated pass changes nothing');
});

test('the rewrite reports honestly how many places it changed', async t => {
    const w = await ready(t);
    const report = w.DistinctPlaces.report;
    assert.ok(report.duplicates >= 400);
    assert.equal(report.rewritten, report.duplicates, 'each shared place is rewritten once');
});

test('descriptions stay readable and never empty', async t => {
    const w = await ready(t);
    const rows = Object.values(w.WorldData.locations);
    assert.ok(rows.every(loc => String(loc.description || '').trim().length > 0), 'no empty descriptions');
    assert.ok(rows.every(loc => !/undefined|null|\[object/i.test(String(loc.description))), 'no placeholder text leaked in');
    const generated = rows.filter(loc => String(loc.description).startsWith(loc.name));
    assert.ok(generated.length >= 400, `the rewritten places name themselves (${generated.length})`);
    assert.ok(generated.every(loc => String(loc.description).trim().endsWith('.')), 'a rewritten description is a finished sentence');
});
