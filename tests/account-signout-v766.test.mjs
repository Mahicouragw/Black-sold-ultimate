/**
 * 7.66.0 — sign-out really signs out, and saving is automatic.
 *
 * The owner reported three things after signing out in Settings: the Sign Out
 * button stayed on screen, the previous Google name kept appearing, and a
 * manual "Save to Cloud" button was still there. A fourth bug was found while
 * fixing them: hiding the PIN block hid the whole settings card, so a signed-in
 * player could not see heroes, version or the Sound Studio at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function ready(t) {
    const r = await createRuntime();
    t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game, d = w.document;
    const saved = [];
    w.OnlineSystem.saveGame = async data => { saved.push(data); return true; };
    w.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    d.getElementById('char-name').value = 'Signed Hero';
    d.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    d.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    G.save();
    const O = w.OnlineSystem;
    O.ready = true;
    O.connecting = false;
    O.linked = false;
    O.user = null;
    O.profile = null;
    O.client = { auth: { signOut: async () => {} } };
    return { w, G, d, O, saved };
}

/** Put the page into the signed-in state the owner saw. */
function signIn(O, name = 'Mahi Couragwn') {
    O.linked = true;
    O.ready = true;
    O.connecting = false;
    O.user = { id: 'uid-owner', displayName: name };
    O.profile = { display_name: name };
    O.updateIndicators();
}

test('while Google is linked the settings card stays visible and the PIN box hides', async t => {
    const { d, O } = await ready(t);
    signIn(O);
    const card = d.querySelector('#settings-panel .settings-card');
    assert.ok(card, 'the account card exists');
    assert.equal(card.hidden, false, 'the settings card is not hidden while signed in');
    assert.equal(d.getElementById('settings-pin-box').hidden, true, 'a Google account needs no PIN box');
    assert.equal(d.getElementById('btn-account-signout').hidden, false, 'Sign Out is offered while signed in');
    assert.deepEqual(d.getElementById('settings-version').textContent.match(/^\d+\.\d+\.\d+$/)?.[0] !== undefined, true, 'the version row is still readable');
});

test('signing out hides Sign Out, brings back Google sign-in and never shows the old name', async t => {
    const { d, O, G } = await ready(t);
    signIn(O);
    await O.signOut({ reload: false });
    O.updateIndicators();

    assert.equal(d.getElementById('btn-account-signout').hidden, true, 'Sign Out is gone for a guest');
    const signInButton = d.getElementById('btn-google-signin');
    assert.equal(signInButton.hidden, false, 'Continue with Google is offered again');
    assert.equal(G.state.player, null, 'the signed-out hero is no longer loaded');
    assert.equal(d.getElementById('settings-hero-name').textContent, 'No hero selected');
    const account = d.getElementById('settings-account-status').textContent;
    assert.doesNotMatch(account, /Mahi Couragwn/, 'the Google display name is gone');
    assert.doesNotMatch(account, /Signed in with Google/, 'the page never claims to be signed in');
    assert.match(account, /guest|not signed in/i);
    assert.equal(d.getElementById('settings-pin-box').hidden, false, 'a guest may set or update a recovery PIN');
    assert.match(d.getElementById('btn-set-pin').textContent, /Create or update recovery PIN/);
});

test('there is no manual cloud-save button: progress saves itself', async t => {
    const { d, G, saved } = await ready(t);
    assert.equal(d.getElementById('btn-cloud-save'), null, 'the manual Save to Cloud button is gone');
    assert.equal(d.getElementById('cloud-save-result'), null, 'and its status line is gone');
    assert.match(d.getElementById('settings-autosave-note').textContent, /automatically/i, 'the player is told saving is automatic');
    const before = saved.length;
    G.save();
    await wait(20);
    assert.ok(saved.length > before, 'a normal save already went to the online account');
});

test('sign-out returns the device to the title screen, not the old account hero', async t => {
    const { d, G, O } = await ready(t);
    signIn(O);
    G.showScreen('game-screen');
    await O.signOut({ reload: false });
    assert.equal(G.state.player, null);
    assert.equal(d.getElementById('game-screen').classList.contains('active'), false, 'the game screen is left behind');
    assert.equal(d.getElementById('title-screen').classList.contains('active'), true, 'the title screen is shown');
    assert.equal(G.state.saveKey, 'black_sword_ultimate_save', 'the guest saves are active again');
});

test('the guest account starts from the beginning when the guest has no hero', async t => {
    const { G, O, w } = await ready(t);
    signIn(O);
    // A first Google login moves the guest hero into the account.
    w.OnlineSystem.linked = true;
    G.adoptAccount('uid-owner2');
    await O.signOut({ reload: false });
    G.forgetAccount();
    const roster = G.getRoster();
    assert.deepEqual(Object.keys(roster.heroes), [], 'no Google hero is visible to the guest');
    assert.equal(G.state.player, null, 'so the guest begins with character creation');
});

test('Settings offers "Sign in with Google" again after signing out and hides it while signed in', async t => {
    const { d, O } = await ready(t);
    signIn(O);
    assert.equal(d.getElementById('btn-settings-google-signin').hidden, true, 'no second sign-in button while signed in');
    await O.signOut({ reload: false });
    O.updateIndicators();
    const button = d.getElementById('btn-settings-google-signin');
    assert.ok(button, 'the Settings sign-in button exists');
    assert.equal(button.hidden, false, 'Settings offers Google sign-in after signing out');
    assert.equal(button.disabled, false);
    assert.match(button.textContent, /Sign in with Google/);
    let asked = 0;
    O.signInGoogle = () => { asked += 1; };
    button.click();
    assert.equal(asked, 1, 'the button really starts the Google sign-in');
});

test('signing back in restores the account’s own hero at its own last location', async t => {
    const { d, G, O } = await ready(t);
    signIn(O);
    const cloudHero = {
        savedAt: Date.now(),
        player: { name: 'Palace Hero', race: 'human', class: 'warrior', level: 6, hp: 41, maxHp: 70, mp: 6, maxMp: 25, x: 4, y: 9 },
        inventory: [], location: 'royal_palace', visited: ['kaliwasch', 'royal_palace'],
        quests: [], completedQuests: ['palace_royal_hunt'], kills: 12, slainEnemies: {},
        companions: [], guild: null, combatGroup: [], racing: null
    };
    const cloudRoster = { version: 2, activeHeroId: 'hero_cloud', heroes: { hero_cloud: cloudHero }, updatedAt: new Date().toISOString() };
    O.loadCloudSave = async () => ({ save_data: cloudRoster, updated_at: new Date().toISOString() });
    O.client = { from: () => ({ update: () => ({ eq: () => Promise.resolve({}) }) }) };
    const restored = await O.cacheCloudSave(true);
    assert.equal(restored, true, 'the cloud save was restored');
    assert.equal(G.state.activeHeroId, 'hero_cloud');
    assert.equal(d.getElementById('heroes-screen').classList.contains('active'), true, 'the returning player picks their hero');
    G.playHero('hero_cloud');
    assert.equal(G.state.player.name, 'Palace Hero');
    assert.equal(G.state.location, 'royal_palace', 'the hero stands where it stopped, not at the start');
    assert.equal(G.state.player.x, 4, 'and at the same square of that place');
    assert.equal(G.state.player.y, 9);
});
