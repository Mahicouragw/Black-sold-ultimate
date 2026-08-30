import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../seasonal-events-v729.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const online = readFileSync(new URL('../online.js', import.meta.url), 'utf8');

function loadSeasonal() {
    const sandbox = { console, window: {}, document: { addEventListener() {}, getElementById() { return null; } }, setInterval() { return 0; }, clearInterval() {} };
    sandbox.window = sandbox;
    sandbox.Game = { enterLocation() {}, processCommand() {}, addNarrative() {}, _v729Seasonal: false, state: { flags: {}, location: 'city_cemetery' } };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.window.SeasonalEvents;
}

test('v729 index has one html close and seasonal script', () => {
    assert.equal((html.match(/<\/html>/g) || []).length, 1);
    assert.match(html, /seasonal-events-v729\.js/);
    assert.match(html, /settings-guest-google/);
    assert.match(html, /btn-delete-account/);
});

test('v729 hides Google link when already linked', () => {
    assert.match(online, /signIn\.hidden = Boolean\(this\.linked\)/);
    assert.match(online, /guestBox\.classList\.toggle\('hidden', this\.linked\)/);
    assert.match(online, /linkedBox\.classList\.toggle\('hidden', !this\.linked\)/);
    assert.doesNotMatch(online, /Restore Google Heroes/);
});

test('v729 halloween window and Oct 31 climax', () => {
    const S = loadSeasonal();
    const oct = S.activeEvents(new Date('2026-10-15T12:00:00+05:30'));
    assert.ok(oct.some(e => e.id === 'halloween' && !e.climax));
    const eve = S.activeEvents(new Date('2026-10-31T20:00:00+05:30'));
    assert.ok(eve.some(e => e.id === 'halloween' && e.climax));
    const nov = S.activeEvents(new Date('2026-11-01T12:00:00+05:30'));
    assert.equal(nov.some(e => e.id === 'halloween'), false);
});

test('v729 christmas new year easter india', () => {
    const S = loadSeasonal();
    assert.ok(S.activeEvents(new Date('2026-12-25T12:00:00+05:30')).some(e => e.id === 'christmas'));
    assert.ok(S.activeEvents(new Date('2026-12-31T23:00:00+05:30')).some(e => e.id === 'newyear'));
    assert.ok(S.activeEvents(new Date('2026-01-10T12:00:00+05:30')).some(e => e.id === 'newyear'));
    const easter2026 = S.westernEaster(2026);
    assert.equal(easter2026.m, 4);
    assert.equal(easter2026.d, 5);
    assert.ok(S.activeEvents(new Date('2026-04-01T12:00:00+05:30')).some(e => e.id === 'easter'));
    assert.ok(S.activeEvents(new Date('2026-04-08T12:00:00+05:30')).some(e => e.id === 'easter'));
    assert.equal(S.activeEvents(new Date('2026-04-09T12:00:00+05:30')).some(e => e.id === 'easter'), false);
    assert.ok(S.activeEvents(new Date('2026-08-15T12:00:00+05:30')).some(e => e.id === 'independence' && e.climax));
    assert.ok(S.activeEvents(new Date('2026-01-26T12:00:00+05:30')).some(e => e.id === 'republic' && e.climax));
});
