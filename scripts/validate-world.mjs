import { mkdir, writeFile } from 'node:fs/promises';
import { loadWorld } from './load-world.mjs';

const { world, graphReport } = await loadWorld();
const locations = world.locations || {};
const ids = Object.keys(locations);
const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down'];
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up' };
const issues = [];
const warnings = [];
const addIssue = (check, location, detail) => issues.push({ check, location, detail });

// 1–4, 13–15: destination, schema, reverse links, duplicate/conflicting exits, vertical links.
for (const [id, location] of Object.entries(locations)) {
    for (const field of ['id', 'name', 'region', 'coordinates', 'description', 'exits', 'locationType', 'musicContext', 'accessibleDescription']) {
        if (location[field] === undefined || location[field] === null || location[field] === '') addIssue('missing-location-field', id, field);
    }
    if (location.id !== id) addIssue('conflicting-id', id, `declared ${location.id}`);
    const destinations = new Map();
    for (const [direction, destination] of Object.entries(location.exits || {})) {
        if (!DIRECTIONS.includes(direction)) addIssue('invalid-direction', id, direction);
        if (!locations[destination]) {
            addIssue('invalid-destination', id, `${direction} -> ${destination}`);
            continue;
        }
        if (destinations.has(destination)) addIssue('duplicate-exit-destination', id, `${destinations.get(destination)} and ${direction} -> ${destination}`);
        destinations.set(destination, direction);
        const reverse = OPPOSITE[direction];
        const reverseDestination = locations[destination].exits?.[reverse];
        const metadata = location.exitMetadata?.[direction] || {};
        const allowedOneWay = ['intentional-one-way', 'conditional-door', 'portal'].includes(metadata.kind);
        if (reverseDestination !== id && !allowedOneWay) addIssue('accidental-one-way-edge', id, `${direction} -> ${destination}; ${reverse} returns to ${reverseDestination || 'nothing'}`);
        if (reverseDestination && reverseDestination !== id && !allowedOneWay) addIssue('conflicting-reverse-exit', id, `${destination}.${reverse} -> ${reverseDestination}`);
        if ((direction === 'up' || direction === 'down') && reverseDestination !== id && metadata.kind !== 'conditional-door' && metadata.kind !== 'portal') {
            addIssue('impossible-vertical-link', id, `${direction} -> ${destination}`);
        }
    }
}

// 5: maximum same-direction chains. Exactly six is permitted; seven is not.
const longestChains = {};
for (const direction of DIRECTIONS) {
    let longest = [];
    for (const start of ids) {
        const path = [start], seen = new Set(path);
        let current = start;
        while (locations[current]?.exits?.[direction] && locations[locations[current].exits[direction]] && !seen.has(locations[current].exits[direction])) {
            current = locations[current].exits[direction];
            seen.add(current); path.push(current);
        }
        if (path.length > longest.length) longest = path;
    }
    longestChains[direction] = { edges: Math.max(0, longest.length - 1), path: longest };
    if (longest.length - 1 > 6) addIssue('excessive-same-direction-chain', longest[0], `${direction}: ${longest.length - 1} edges`);
}

// 6–8: alternating directional oscillation. Ordinary reciprocal backtracking is
// classified, not deleted; a closed component with no third exit is accidental.
let intentionalLoops = 0;
const accidentalOscillations = [];
const countedPairs = new Set();
for (const [id, location] of Object.entries(locations)) {
    for (const [direction, destination] of Object.entries(location.exits || {})) {
        const pair = [id, destination].sort().join('|');
        if (countedPairs.has(pair) || locations[destination]?.exits?.[OPPOSITE[direction]] !== id) continue;
        countedPairs.add(pair);
        const degreeA = new Set(Object.values(location.exits || {})).size;
        const degreeB = new Set(Object.values(locations[destination].exits || {})).size;
        if (degreeA === 1 && degreeB === 1) accidentalOscillations.push({ from: id, direction, to: destination });
        else intentionalLoops++;
    }
}
for (const loop of accidentalOscillations) addIssue('accidental-two-node-oscillation', loop.from, `${loop.direction} -> ${loop.to} has no branch or onward route`);

// 9: enumerate short non-backtracking cycles and classify by available branches.
const canonicalCycle = cycle => {
    const body = cycle.slice(0, -1);
    const variants = [];
    for (const sequence of [body, [...body].reverse()]) {
        for (let index = 0; index < sequence.length; index++) variants.push([...sequence.slice(index), ...sequence.slice(0, index)].join('|'));
    }
    return variants.sort()[0];
};
const cycles = new Map();
for (const start of ids) {
    const walk = (current, path) => {
        if (path.length > 5) return;
        for (const next of new Set(Object.values(locations[current].exits || {}))) {
            if (!locations[next]) continue;
            if (next === start && path.length >= 3) {
                const cycle = [...path, start];
                cycles.set(canonicalCycle(cycle), cycle);
            } else if (!path.includes(next) && next >= start) walk(next, [...path, next]);
        }
    };
    walk(start, [start]);
}
let validRoutes = 0, accidentalLoops = 0;
for (const cycle of cycles.values()) {
    const members = new Set(cycle.slice(0, -1));
    const hasBranch = [...members].some(id => Object.values(locations[id].exits || {}).some(destination => !members.has(destination)));
    if (hasBranch) validRoutes++;
    else {
        accidentalLoops++;
        addIssue('meaningless-closed-cycle', cycle[0], cycle.join(' -> '));
    }
}

// 10–11: directed reachability. Conditional locked rooms are not expected to be
// reachable until their door state is opened; important locations always are.
const reachable = new Set(['kaliwasch']);
const queue = ['kaliwasch'];
while (queue.length) {
    const current = queue.shift();
    for (const destination of Object.values(locations[current]?.exits || {})) {
        if (locations[destination] && !reachable.has(destination)) { reachable.add(destination); queue.push(destination); }
    }
}
const conditionalLocked = new Set();
const unexpectedUnreachable = new Set();
for (const [id, location] of Object.entries(locations)) {
    const important = Boolean(location.boss || location.finalBoss || /market|temple|palace|dungeon|city gate|village/i.test(`${location.locationType} ${location.name}`));
    const conditional = id.includes('public_house_') || id.includes('private_house_') || Object.values(location.exitMetadata || {}).some(metadata => metadata.kind === 'conditional-door');
    if (!reachable.has(id) && conditional) conditionalLocked.add(id);
    if (!reachable.has(id) && !conditional) unexpectedUnreachable.add(id);
    if (important && !conditional && !reachable.has(id)) addIssue('unreachable-important-location', id, location.name);
    if (!Object.keys(location.exits || {}).length) addIssue('isolated-location', id, location.name);
}

// 12: a boundary exit must always resolve to a real interior or neighbouring
// region. Boundary labels are data, not extra generated destinations.
for (const [id, location] of Object.entries(locations)) {
    for (const boundary of location.regionBoundary || []) {
        const destination = location.exits?.[boundary];
        if (destination && !locations[destination]) addIssue('impossible-boundary-exit', id, `${boundary} -> ${destination}`);
    }
}

const directionCounts = Object.fromEntries(DIRECTIONS.map(direction => [direction, 0]));
let edgeCount = 0;
for (const location of Object.values(locations)) {
    for (const direction of Object.keys(location.exits || {})) { directionCounts[direction]++; edgeCount++; }
}
const cardinalTotal = directionCounts.north + directionCounts.south + directionCounts.east + directionCounts.west;
const cardinalPercent = Object.fromEntries(['north', 'south', 'east', 'west'].map(direction => [direction, cardinalTotal ? Number((directionCounts[direction] * 100 / cardinalTotal).toFixed(2)) : 0]));
const report = {
    status: issues.length ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    finite: graphReport.finite === true,
    locations: ids.length,
    regions: new Set(Object.values(locations).map(location => location.region)).size,
    edges: edgeCount,
    reachable: reachable.size,
    conditionalLockedLocations: conditionalLocked.size,
    unexpectedUnreachableLocations: unexpectedUnreachable.size,
    directionCounts,
    cardinalPercent,
    longestChains,
    loopClassification: { INTENTIONAL_LOOP: intentionalLoops, VALID_ROUTE: validRoutes, ACCIDENTAL_LOOP: accidentalLoops + accidentalOscillations.length },
    runtimeRepairs: graphReport.repairs?.length || 0,
    issues,
    warnings
};
await mkdir('reports', { recursive: true });
await writeFile('reports/world-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(`World validation: ${report.status}`);
console.log(`${report.locations} locations, ${report.regions} regions, ${report.edges} directed exits, ${report.reachable} currently reachable, ${report.conditionalLockedLocations} behind closed/owned doors.`);
console.log(`Directions: ${Object.entries(directionCounts).map(([direction, count]) => `${direction}=${count}`).join(', ')}`);
console.log(`Longest cardinal chains: N=${longestChains.north.edges}, S=${longestChains.south.edges}, E=${longestChains.east.edges}, W=${longestChains.west.edges}.`);
console.log(`Loops: intentional=${intentionalLoops}, valid routes=${validRoutes}, accidental=${accidentalLoops + accidentalOscillations.length}.`);
if (issues.length) {
    for (const issue of issues.slice(0, 80)) console.error(`- ${issue.check}: ${issue.location}: ${issue.detail}`);
    if (issues.length > 80) console.error(`... ${issues.length - 80} more issue(s); see reports/world-validation.json`);
    process.exitCode = 1;
}
