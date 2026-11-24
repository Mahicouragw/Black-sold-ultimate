import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

/* 7.64.0 — the rule the owner asked for, locked in a test:
 *   signed in with Google  → that account's own hero and saves;
 *   not signed in          → a guest hero that stays on this device.
 * The two never mix, and signing out returns to the guest heroes. */

async function guest(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true;
    w.OnlineSystem.syncActiveHero = () => {};
    w.OnlineSystem.linked = false;
    w.OnlineSystem.user = null;
    G.forgetAccount();
    return { w, G };
}

function createGuestHero(w, G, name) {
    G.startNewHero();
    w.document.getElementById('char-name').value = name;
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    G.save();
    return G.state.activeHeroId;
}

test('a player who is not signed in uses guest saves on this device', async t => {
    const { w, G } = await guest(t);
    assert.equal(G.state.saveKey, 'black_sword_ultimate_save');
    assert.equal(G.state.rosterKey, 'black_sword_hero_roster_v2');
    const id = createGuestHero(w, G, 'Guest Hero');
    assert.ok(id);
    assert.equal(w.localStorage.getItem(G.state.rosterKey) !== null, true);
});

test('signing in with Google switches to that account\'s own heroes', async t => {
    const { w, G } = await guest(t);
    const guestHero = createGuestHero(w, G, 'Guest Hero');
    w.OnlineSystem.linked = true;
    w.OnlineSystem.user = { id: 'uid-google-1', email: 'owner@example.com' };
    const accountSave = G.state.saveKey;
    assert.match(accountSave, /:uid-google-1$/, 'the saves are account-scoped');
    assert.match(G.state.rosterKey, /:uid-google-1$/);
    assert.notEqual(accountSave, 'black_sword_ultimate_save');
    // The guest hero was carried to the account once, not copied.
    const roster = G.getRoster();
    assert.ok(roster.heroes[guestHero], 'the hero made before signing in came along');
    assert.equal(w.localStorage.getItem('black_sword_hero_roster_v2'), null, 'the guest copy was moved, not duplicated');
});

test('signing out returns to the guest saves and never shows the Google heroes', async t => {
    const { w, G } = await guest(t);
    createGuestHero(w, G, 'Guest Hero');
    w.OnlineSystem.linked = true;
    w.OnlineSystem.user = { id: 'uid-google-2' };
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Google Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    G.save();
    const googleHeroes = Object.keys(G.getRoster().heroes);
    assert.ok(googleHeroes.length >= 1);

    w.OnlineSystem.linked = false;
    w.OnlineSystem.user = null;
    G.forgetAccount();
    assert.equal(G.state.saveKey, 'black_sword_ultimate_save');
    const guestRoster = G.getRoster();
    assert.ok(guestRoster.heroes, 'guest storage still exists');
    assert.deepEqual(Object.keys(guestRoster.heroes), [], 'the guest sees no Google heroes after signing out');
});

test('a guest is never described as signed in to Google', async t => {
    const { w, G } = await guest(t);
    w.OnlineSystem.ready = true;
    w.OnlineSystem.connecting = false;
    w.OnlineSystem.updateIndicators();
    const status = w.document.getElementById('settings-account-status').textContent;
    assert.match(status, /Guest account/);
    assert.doesNotMatch(status, /Signed in with Google/);
    assert.doesNotMatch(w.document.getElementById('title-account-status').textContent, /Signed in with Google/);
});
