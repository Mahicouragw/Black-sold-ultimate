/**
 * 7.73.0 — a lost connection is not a lost account.
 *
 * What the owner asked for:
 *  - going offline must show one plain sentence, "You lost internet. Please try
 *    again.", and nothing else — no account list, no "Continue with Google";
 *  - a device that was already signed in with Google must come back signed in
 *    by itself when the internet returns, without asking again.
 *
 * The tests drive the real sign-in object, with the backend client replaced so
 * the decisions (what to show, whether to create a guest) can be seen directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t, { online = true, remembered = false } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    Object.defineProperty(w.navigator, 'onLine', { value: online, configurable: true });
    if (remembered) w.localStorage.setItem('black_sword_google_linked', 'true');
    // The test runtime deliberately leaves the backend out, so the two pieces
    // the sign-in reads are supplied here and nothing else is faked.
    w.BLACK_SWORD_BACKEND_CONFIG = {
        provider: 'firebase', firebase: { apiKey: 'test', projectId: 'test' },
        dataUrl: 'https://example.test/bsu-data', audioUrl: 'https://example.test/bsu-audio', gameServerUrl: ''
    };
    w.BlackSwordBackend = { createClient: async () => O.client || null, wrapUser: user => user, slug: x => x, normalName: x => x, nameKey: x => x };
    const O = w.OnlineSystem;
    O.client = null;
    O.ready = false;
    O.connecting = false;
    O.linked = false;
    O.user = null;
    const setOnline = value => Object.defineProperty(w.navigator, 'onLine', { value, configurable: true });
    return { w, O, setOnline };
}


/** A backend client whose calls answer, or fail, exactly as the test needs. */
function fakeClient({ session = null, onAnonymous = () => {} } = {}) {
    const chain = new Proxy(function () {}, {
        get: (_, prop) => {
            if (prop === 'then') return resolve => resolve({ data: null, error: 'no-schema' });
            return () => chain;
        },
        apply: () => chain
    });
    return {
        auth: {
            getSession: async () => ({ data: { session } }),
            signInAnonymously: async () => { onAnonymous(); return { data: { session: { user: { id: 'guest' } } }, error: null }; },
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => {}
        },
        from: () => chain,
        rpc: async () => ({ data: null, error: 'no-schema' }),
        channel: () => ({ on() { return this; }, subscribe() {} })
    };
}

const signInButton = w => w.document.getElementById('btn-google-signin');

test('offline, the game says one sentence and never offers a Google list', async t => {
    const { w, O } = await ready(t, { online: false });
    await O.init();
    assert.equal(O.client, null, 'no sign-in client is created without a connection');
    assert.equal(signInButton(w).hidden, true, 'Continue with Google is not shown');
    assert.equal(w.document.getElementById('settings-account-status').textContent.includes('Google'), false);
    assert.match(w.document.getElementById('title-account-status').textContent, /You lost internet\. Please try again\./);
    // The connection notice is the only thing over the game.
    w.OnlineRequired.check();
    const panel = w.document.getElementById('online-required');
    assert.equal(panel.style.display, 'flex');
    assert.equal(panel.querySelector('#online-required-text').textContent, 'You lost internet. Please try again.');
    assert.doesNotMatch(panel.textContent, /Continue with Google/i);
    assert.equal(panel.querySelectorAll('button').length, 1, 'one choice: try again');
    assert.equal(panel.querySelector('button').textContent.trim(), 'Try again');
});

test('a Google device that loses the internet is not shown a sign-in button', async t => {
    const { w, O, setOnline } = await ready(t, { online: true, remembered: true });
    setOnline(false);
    await O.init();
    assert.equal(O.linked, true, 'the remembered account keeps the device signed in');
    assert.equal(signInButton(w).hidden, true, 'no sign-in is asked for');
    assert.match(w.document.getElementById('title-account-status').textContent, /You lost internet/);
    w.localStorage.removeItem('black_sword_google_linked');
});

test('opening the Google panel while offline keeps the account list closed', async t => {
    const { w, O, setOnline } = await ready(t, { online: true });
    setOnline(false);
    O.openGoogleDialog(false);
    assert.equal(w.document.getElementById('google-login-panel').classList.contains('hidden'), true, 'the panel never opens');
    assert.match(O.status, /You lost internet\. Please try again\./);
});

test('with the connection back, the saved Google session restores itself', async t => {
    const { w, O, setOnline } = await ready(t, { online: true, remembered: true });
    setOnline(false);
    await O.init();
    // The player's phone comes back onto the network and the stored session is
    // still good: the game signs itself in without a single tap.
    const signedIn = { id: 'google-uid', email: 'hero@example.com', identities: [{ provider: 'google' }], is_anonymous: false };
    let anonymousCalls = 0;
    O.client = fakeClient({ session: { user: signedIn }, onAnonymous: () => { anonymousCalls += 1; } });
    setOnline(true);
    await O.init();
    assert.equal(O.linked, true, 'the Google account is signed in again');
    assert.equal(O.connecting, false, 'the sign-in spinner is gone');
    assert.equal(anonymousCalls, 0, 'no guest was created over the Google account');
    assert.equal(signInButton(w).hidden, true, 'Continue with Google is not offered');
    assert.equal(w.localStorage.getItem('black_sword_google_linked'), 'true', 'the device remembers the account');
});

test('a remembered device whose saved sign-in has expired asks for Google instead of becoming a guest', async t => {
    const { w, O } = await ready(t, { online: true, remembered: true });
    let anonymousCalls = 0;
    O.client = fakeClient({ session: null, onAnonymous: () => { anonymousCalls += 1; } });
    await O.init();
    assert.equal(anonymousCalls, 0, 'an expired Google sign-in is never replaced by a guest');
    assert.equal(signInButton(w).hidden, false, 'the one case where the button belongs');
    assert.match(O.status, /Continue with Google/, 'and the line says why');
    w.localStorage.removeItem('black_sword_google_linked');
});

test('a sign-out forgets the remembered account, so the button returns', async t => {
    const { w, O } = await ready(t, { online: true, remembered: true });
    O.ready = true;
    O.linked = true;
    O.client = { auth: { signOut: async () => {} } };
    w.Game.state.player = null;
    await O.signOut({ reload: false });
    assert.equal(w.localStorage.getItem('black_sword_google_linked'), null, 'the device no longer claims a Google account');
    O.updateIndicators();
    assert.equal(signInButton(w).hidden, false, 'Continue with Google is offered again');
});
