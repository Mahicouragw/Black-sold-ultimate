import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../scripts/load-world.mjs';

let fixture;
test.before(async () => { fixture = await loadWorld(); });

const opposite = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up' };

test('finite locations expose the complete world schema', () => {
    const locations = fixture.world.locations;
    assert.equal(fixture.graphReport.finite, true);
    assert.ok(Object.keys(locations).length > 1000);
    for (const [id, location] of Object.entries(locations)) {
        assert.equal(location.id, id);
        for (const field of ['name', 'region', 'coordinates', 'description', 'exits', 'locationType', 'musicContext', 'accessibleDescription']) assert.ok(location[field], `${id}.${field}`);
    }
});

test('physical exits resolve and reverse without overwriting classified one-way doors', () => {
    const locations = fixture.world.locations;
    for (const [id, location] of Object.entries(locations)) {
        for (const [direction, destination] of Object.entries(location.exits)) {
            assert.ok(locations[destination], `${id}.${direction} -> ${destination}`);
            const kind = location.exitMetadata?.[direction]?.kind;
            if (['intentional-one-way', 'conditional-door', 'portal'].includes(kind)) continue;
            assert.equal(locations[destination].exits[opposite[direction]], id, `${id}.${direction} reverse`);
        }
    }
});

test('no cardinal chain exceeds six moves', () => {
    const locations = fixture.world.locations;
    for (const direction of ['north', 'south', 'east', 'west']) {
        for (const start of Object.keys(locations)) {
            let current = start, count = 0;
            const seen = new Set([start]);
            while (locations[current].exits[direction] && !seen.has(locations[current].exits[direction])) {
                current = locations[current].exits[direction];
                seen.add(current); count++;
            }
            assert.ok(count <= 6, `${start} has ${count} consecutive ${direction} moves`);
        }
    }
});

test('Market Square branches and Wayfinder route steps are executable', () => {
    const locations = fixture.world.locations;
    assert.deepEqual(Object.keys(locations.kaliwasch.exits).sort(), ['east', 'north', 'south', 'west']);
    const route = (start, target) => {
        const queue = [[start, []]], seen = new Set([start]);
        while (queue.length) {
            const [id, path] = queue.shift();
            if (id === target) return path;
            for (const [direction, next] of Object.entries(locations[id].exits)) {
                if (!seen.has(next)) { seen.add(next); queue.push([next, [...path, direction]]); }
            }
        }
        return null;
    };
    const directions = route('kaliwasch', 'shadow_chamber');
    assert.ok(directions?.length);
    let current = 'kaliwasch';
    for (const direction of directions) {
        const next = locations[current].exits[direction];
        assert.ok(next, `${current} accepts ${direction}`);
        current = next;
    }
    assert.equal(current, 'shadow_chamber');
});
