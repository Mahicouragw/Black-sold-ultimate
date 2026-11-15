// v7.57 — a player who signed in with Google must never be shown as "Guest mode",
// and the cloud save goes straight to the Firebase database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';
import { createFakeFirestore, createFakeSdk, googleUser } from './helpers/fake-firebase.mjs';

const backendSource = readFileSync('firebase-backend.js', 'utf8');

async function start(t, { user, shared = createFakeFirestore() } = {}) {
    const runtime = await createRuntime();
    const { window, dom } = runtime;
    t.after(() => dom.window.close());
    const sdk = createFakeSdk(shared, user);
    window.eval(backendSource);
    window.BLACK_SWORD_BACKEND_CONFIG = { provider: 'firebase', firebase: { projectId: 'test' }, firebaseSdk: sdk, gameServerUrl: '' };
    const O = window.OnlineSystem;
    O.ready = false; O.client = null; O.user = null; O.linked = false; O.profile = null; O.subscription = null;
    return { window, O, sdk, shared };
}
const statusLine = window => window.document.getElementById('title-account-status').textContent;

test('a returning Google player is shown as signed in with Google, not as a guest', async t => {
    const { window, O, shared } = await start(t, { user: googleUser('uid-mahi', 'Mahi') });
    await O.init();
    assert.equal(O.user.id, 'uid-mahi');
    assert.equal(O.linked, true);
    assert.equal(O.ready, true);
    assert.match(O.status, /Google/);
    assert.doesNotMatch(statusLine(window), /Guest mode/i);
    assert.equal(window.document.getElementById('btn-google-signin').hidden, true, 'the Google button is not offered again');
    assert.match(O.getPlayerCode(), /^KND-/);
    assert.equal(shared.store.get('profiles/uid-mahi').id, 'uid-mahi', 'the profile was created in the database');
});

test('if the database cannot be reached, a Google player is still not called a guest', async t => {
    const shared = createFakeFirestore();
    shared.db.collection = () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); };
    const { window, O } = await start(t, { user: googleUser('uid-mahi', 'Mahi'), shared });
    await O.init();
    assert.equal(O.linked, true);
    assert.equal(O.ready, false, 'online features stay off, the game plays from the device');
    assert.match(O.status, /Signed in with Google/);
    assert.doesNotMatch(statusLine(window), /Guest mode/i);
    assert.equal(window.document.getElementById('btn-google-signin').hidden, true);
    // Hero names can still be chosen while the database is away.
    assert.equal(await O.checkHeroNameAvailability('Mahi the Brave'), true);
});

test('the new status line exists in English, Telugu and Hindi', async t => {
    const shared = createFakeFirestore();
    shared.db.collection = () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
    const { window, O } = await start(t, { user: googleUser('uid-mahi', 'Mahi'), shared });
    const seen = {};
    for (const lang of ['en', 'te', 'hi']) {
        window.Narration.lang = () => lang;
        O.ready = false;
        await O.init();
        seen[lang] = O.status;
    }
    assert.match(seen.en, /^Signed in with Google\./);
    assert.match(seen.te, /Google తో సైన్ ఇన్/);
    assert.match(seen.hi, /Google से साइन इन/);
    assert.equal(new Set(Object.values(seen)).size, 3);
});

test('a guest is an online guest; after the Google popup the same player is linked', async t => {
    const { window, O, sdk } = await start(t, { user: null });
    await O.init();
    assert.equal(O.linked, false);
    assert.equal(O.ready, true);
    assert.match(O.status, /Online guest/);
    assert.equal(window.document.getElementById('btn-google-signin').hidden, false);
    const guestId = O.user.id;
    sdk.nextGoogleUser = googleUser('uid-google', 'Mahi');
    await O.startGoogleRedirect(false);
    await wait(700);
    assert.equal(O.user.id, 'uid-google');
    assert.notEqual(O.user.id, guestId);
    assert.equal(O.linked, true);
    assert.doesNotMatch(O.status, /Guest mode/i);
    assert.doesNotMatch(statusLine(window), /Guest mode/i);
    assert.equal(window.document.getElementById('btn-google-signin').hidden, true);
});

test('the automatic cloud save is written to the Firebase database and can be read back', async t => {
    const { window, O, shared } = await start(t, { user: googleUser('uid-mahi', 'Mahi') });
    await O.init();
    const { Game, document, BSUServer } = window;
    Game.startNewHero();
    document.getElementById('char-name').value = 'Mahi';
    document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    assert.notEqual(Game.createCharacter(false), false);
    await wait(50);
    assert.equal(BSUServer.canCall(), false, 'there is no separate game server');
    assert.equal(BSUServer.cloudReady(), true);
    BSUServer.state.lastCloudAt = 0;
    assert.equal(await BSUServer.flushCloud(), true);
    assert.ok(shared.store.get('game_saves/uid-mahi').parts >= 1);
    const cloud = await O.loadCloudSave();
    const heroes = Object.values(cloud.save_data.heroes);
    assert.equal(heroes.length, 1);
    assert.equal(heroes[0].player.name, 'Mahi');
    assert.equal(shared.store.get('profiles/uid-mahi').display_name, 'Mahi', 'other players see the hero name');
});
