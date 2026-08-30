import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const prayer = readFileSync(new URL('../context-actions-houses-prayer-v10.js', import.meta.url), 'utf8');
const online = readFileSync(new URL('../online.js', import.meta.url), 'utf8');

test('settings lists create, manage, and delete hero instead of merge', () => {
    assert.match(html, /btn-settings-create-hero/);
    assert.match(html, /btn-settings-manage-heroes/);
    assert.match(html, /btn-settings-delete-hero/);
    assert.match(html, /settings-guest-google" class="hidden" hidden/);
    assert.match(html, /btn-google-merge[^>]*hidden/);
});

test('settings never keep Google merge visible after indicator update', () => {
    assert.match(online, /google\.hidden = true/);
    assert.match(online, /merge\.hidden = true/);
});

test('permanent blessing does not nag after it is complete', () => {
    assert.doesNotMatch(prayer, /already received the permanent/);
});
