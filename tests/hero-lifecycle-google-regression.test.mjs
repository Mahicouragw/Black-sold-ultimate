import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

async function fixture(t, { mockCloud = true } = {}) {
    const runtime = await createRuntime();
    const { window, dom } = runtime;
    t.after(() => dom.window.close());
    if (mockCloud) window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.releaseHeroName = async () => true;
    window.OnlineSystem.updatePresence = async () => {};
    return runtime;
}

function makeHero(window, name) {
    const { Game, document } = window;
    Game.startNewHero();
    document.getElementById('char-name').value = name;
    document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    assert.notEqual(Game.createCharacter(false), false);
    return Game.state.activeHeroId;
}

function roster(window) {
    return JSON.parse(window.localStorage.getItem(window.Game.state.rosterKey));
}

test('create, switch and delete keep each hero isolated and never auto-switch after deletion', async t => {
    const { window } = await fixture(t);
    const { Game, localStorage } = window;
    const first = makeHero(window, 'Alpha');
    Game.state.player.gold = 777;
    Game.state.completedQuests = ['alpha-only'];
    Game.state.slainEnemies = { forest: { wolf: 3 } };
    Game.state.racing = { xp: 900, selectedCar: 'alpha-car' };
    Game.state.housing = { houses: { kaliwasch: { storage: ['alpha-item'] } } };
    Game.state.spellMastery = { heal: { xp: 500 } };
    Game.save();

    const second = makeHero(window, 'Beta');
    assert.notEqual(second, first);
    assert.equal(Game.state.player.name, 'Beta');
    let saved = roster(window);
    assert.equal(saved.heroes[first].player.gold, 777);
    assert.deepEqual(saved.heroes[first].completedQuests, ['alpha-only']);
    assert.notEqual(saved.heroes[second].player.gold, 777, 'new hero does not inherit the old wallet');
    assert.equal(saved.heroes[second].completedQuests.includes('alpha-only'), false);
    assert.deepEqual(saved.heroes[second].slainEnemies, {});
    assert.equal(saved.heroes[second].racing, null);
    assert.deepEqual(saved.heroes[second].housing, { houses: {} });
    assert.deepEqual(saved.heroes[second].spellMastery, {});

    Game.state.player.gold = 888;
    Game.playHero(first);
    assert.equal(Game.state.player.name, 'Alpha');
    assert.equal(roster(window).heroes[second].player.gold, 888, 'switching saves the outgoing hero');
    assert.equal(Game.state.player.gold, 777);
    assert.deepEqual(Array.from(Game.state.completedQuests), ['alpha-only']);

    Game.playHero(second);
    const pendingDelete = Game.deleteHero(second);
    window.document.getElementById('confirm-dialog-yes').click();
    await pendingDelete;
    saved = roster(window);
    assert.ok(saved.heroes[first]);
    assert.equal(saved.heroes[second], undefined);
    assert.equal(saved.activeHeroId, null, 'deletion waits for an explicit hero choice');
    assert.equal(Game.state.activeHeroId, null);
    assert.equal(Game.state.player, null, 'deleted hero cannot remain loaded and overwrite another slot');
    assert.equal(localStorage.getItem(Game.state.saveKey), null);

    Game.playHero(first);
    assert.equal(Game.state.player.name, 'Alpha');
    assert.equal(Game.state.player.gold, 777);
});

test('deleting an inactive hero preserves the loaded active hero', async t => {
    const { window } = await fixture(t);
    const { Game } = window;
    const first = makeHero(window, 'Alpha');
    const second = makeHero(window, 'Beta');
    Game.state.player.gold = 456;
    Game.save();

    const pendingDelete = Game.deleteHero(first);
    window.document.getElementById('confirm-dialog-yes').click();
    await pendingDelete;

    const saved = roster(window);
    assert.equal(saved.activeHeroId, second);
    assert.equal(Game.state.activeHeroId, second);
    assert.equal(Game.state.player.name, 'Beta');
    assert.equal(saved.heroes[second].player.gold, 456);
});

test('cloud writes are serialized so an older roster cannot overwrite a newer one', async t => {
    const { window } = await fixture(t, { mockCloud: false });
    const { OnlineSystem } = window;
    const resolvers = [];
    const calls = [];
    OnlineSystem.ready = true;
    OnlineSystem.user = { id: 'user-one' };
    OnlineSystem.client = {
        from(table) {
            assert.equal(table, 'game_saves');
            return {
                upsert(payload) {
                    calls.push(payload);
                    return new Promise(resolve => resolvers.push(() => resolve({ error: null })));
                }
            };
        }
    };

    const first = OnlineSystem.saveGame({ version: 2, heroes: { first: { player: { name: 'Old' } } } });
    const second = OnlineSystem.saveGame({ version: 2, heroes: { second: { player: { name: 'New' } } } });
    await wait(0);
    assert.equal(calls.length, 1, 'second write waits for the first');
    resolvers.shift()();
    await first;
    await wait(0);
    assert.equal(calls.length, 2);
    resolvers.shift()();
    await second;
    assert.deepEqual(calls.map(call => Object.keys(call.save_data.heroes)), [['first'], ['second']]);
});

test('a queued save can never be written into a different signed-in account', async t => {
    const { window } = await fixture(t, { mockCloud: false });
    const { OnlineSystem } = window;
    const resolvers = [];
    const calls = [];
    OnlineSystem.ready = true;
    OnlineSystem.user = { id: 'old-account' };
    OnlineSystem.client = {
        from() {
            return { upsert(payload) { calls.push(payload); return new Promise(resolve => resolvers.push(() => resolve({ error: null }))); } };
        }
    };
    const first = OnlineSystem.saveGame({ heroes: { old: {} } });
    const queued = OnlineSystem.saveGame({ heroes: { private: {} } });
    await wait(0);
    OnlineSystem.user = { id: 'new-account' };
    resolvers.shift()();
    await first;
    await queued;
    assert.equal(calls.length, 1, 'stale queued writes are discarded after account change');
});

test('background startup cache does not overwrite an existing local roster', async t => {
    const { window } = await fixture(t);
    const { Game, OnlineSystem } = window;
    const local = makeHero(window, 'Local Hero');
    Game.state.player = null;
    OnlineSystem.ready = true;
    OnlineSystem.linked = true;
    OnlineSystem.user = { id: 'user-one' };
    OnlineSystem.profile = {};
    OnlineSystem.client = { from() { return { update() { return { eq() { return { then(resolve) { resolve({ error: null }); } }; } }; } }; } };
    OnlineSystem.loadCloudSave = async () => ({
        save_data: { version: 2, activeHeroId: 'cloud', heroes: { cloud: { player: { name: 'Cloud Hero' }, inventory: [], location: 'kaliwasch' } } },
        updated_at: '2000-01-01T00:00:00.000Z'
    });

    await OnlineSystem.cacheCloudSave();
    assert.ok(roster(window).heroes[local]);
    assert.equal(roster(window).heroes.cloud, undefined);
    assert.equal(Game.state.activeHeroId, local);
});

test('Google merge snapshots a title-screen roster even before a hero is loaded', async t => {
    const { window } = await fixture(t);
    const { Game, OnlineSystem, localStorage } = window;
    makeHero(window, 'Guest Hero');
    Game.state.player = null;
    OnlineSystem.googleMergeRequested = true;
    OnlineSystem.client = { auth: { signInWithIdToken: async () => ({ data: { user: { id: 'google-user' } }, error: null }) } };
    OnlineSystem.welcomeSignedInPlayer = async () => {};

    await OnlineSystem.handleGoogleCredential({ credential: 'valid-test-token' });
    const pending = JSON.parse(localStorage.getItem('black_sword_pending_google_merge'));
    assert.equal(Object.values(pending.heroes)[0].player.name, 'Guest Hero');
});

test('blocked Google origin feedback uses the visible login status element', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem, document } = window;
    OnlineSystem.isPreviewHost = () => true;
    OnlineSystem.checkGoogleOriginAllowed();
    assert.match(document.getElementById('google-login-status').textContent, /temporary preview/i);
});

test('late name-check responses cannot change a newer hero name decision', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem, Game, document } = window;
    const pending = new Map();
    OnlineSystem.ready = true;
    OnlineSystem.client = { rpc(_name, args) { return new Promise(resolve => pending.set(args.desired_name, resolve)); } };
    Game.startNewHero();

    OnlineSystem.scheduleHeroNameCheck('Alpha', Game.state.pendingHeroId);
    await wait(320);
    OnlineSystem.scheduleHeroNameCheck('Beta', Game.state.pendingHeroId);
    await wait(320);
    pending.get('Beta')({ data: true, error: null });
    await wait(0);
    pending.get('Alpha')({ data: false, error: null });
    await wait(0);

    assert.equal(OnlineSystem.heroNameAvailable, true);
    assert.match(document.getElementById('hero-name-status').textContent, /available/i);
});

test('Begin Adventure is single-flight while the unique name is reserved', async t => {
    const { window } = await fixture(t);
    const { Game, OnlineSystem, document } = window;
    Game.startNewHero();
    document.getElementById('char-name').value = 'Single Flight';
    document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    OnlineSystem.heroNameAvailable = true;
    const reservations = [];
    let calls = 0;
    OnlineSystem.reserveHeroName = () => { calls++; return new Promise(resolve => reservations.push(resolve)); };

    const first = Game.beginCharacterCreation(false);
    const second = Game.beginCharacterCreation(false);
    reservations.forEach(resolve => resolve({ ok: true }));
    const results = await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(Game.state.player.name, 'Single Flight');
});

test('leaving hero creation cannot create a delayed hero after Back', async t => {
    const { window } = await fixture(t);
    const { Game, OnlineSystem, document } = window;
    Game.startNewHero();
    document.getElementById('char-name').value = 'Too Late';
    document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    let finish;
    let released = false;
    OnlineSystem.reserveHeroName = () => new Promise(resolve => { finish = resolve; });
    OnlineSystem.releaseHeroName = async () => { released = true; };
    const creating = Game.beginCharacterCreation(false);
    Game.showScreen('title-screen');
    finish({ ok: true });
    assert.equal(await creating, false);
    assert.equal(Game.state.player, null);
    assert.equal(Object.keys(roster(window)?.heroes || {}).length, 0);
    assert.equal(released, true);
});

test('Google welcome is single-flight across duplicate auth callbacks', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem } = window;
    let calls = 0;
    OnlineSystem.performSignedInWelcome = async () => { calls++; await wait(25); };
    await Promise.all([OnlineSystem.welcomeSignedInPlayer(), OnlineSystem.welcomeSignedInPlayer()]);
    assert.equal(calls, 1);
    assert.equal(OnlineSystem._googleWelcomeInFlight, false);
});

test('auth listener cannot restore or navigate while Google callback is in flight', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem } = window;
    let listener;
    let restores = 0;
    OnlineSystem.client = { auth: { onAuthStateChange(callback) { listener = callback; } } };
    OnlineSystem.user = { id: 'guest-user' };
    OnlineSystem.loadProfile = async () => {};
    OnlineSystem.refreshIdentityStatus = async () => { OnlineSystem.linked = true; };
    OnlineSystem.cacheCloudSave = async () => { restores++; };
    OnlineSystem.updateIndicators = () => {};
    OnlineSystem._googleAuthCallback = true;
    OnlineSystem.registerAuthListener();
    await listener('SIGNED_IN', { user: { id: 'google-user' } });
    assert.equal(restores, 0);
});

test('cloud restore unloads the previous account before playing the restored slot', async t => {
    const { window } = await fixture(t);
    const { Game, OnlineSystem } = window;
    const id = makeHero(window, 'Local Version');
    const cloudHero = {
        player: { name: 'Cloud Version', race: 'elf', class: 'mage', level: 4, hp: 60, maxHp: 60, mp: 100, maxMp: 100, spells: [] },
        inventory: [], location: 'kaliwasch', visited: ['kaliwasch'], quests: [], completedQuests: [], slainEnemies: {}
    };
    OnlineSystem.ready = true;
    OnlineSystem.linked = true;
    OnlineSystem.user = { id: 'google-user' };
    OnlineSystem.profile = {};
    OnlineSystem.loadCloudSave = async () => ({ save_data: { version: 2, activeHeroId: id, heroes: { [id]: cloudHero } } });
    OnlineSystem.client = { from() { return { update() { return { eq() { return { then(resolve) { resolve({ error: null }); } }; } }; } }; } };

    await OnlineSystem.restoreRosterFromCloud();
    Game.playHero(id);
    assert.equal(Game.state.player.name, 'Cloud Version');
    assert.equal(roster(window).heroes[id].player.name, 'Cloud Version');
});

test('Google app redirect preserves the GitHub Pages deployment path', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem } = window;
    let options;
    OnlineSystem.client = { auth: { signInWithOAuth: async payload => { options = payload.options; return { error: null }; } } };
    await OnlineSystem.startGoogleRedirect(false);
    const redirect = new URL(options.redirectTo);
    assert.equal(redirect.pathname, '/Black-sold-ultimate/');
    assert.equal(redirect.searchParams.get('source'), 'app');
});

test('retrying a guest merge does not duplicate an identical hero slot', async t => {
    const { window } = await fixture(t);
    const { OnlineSystem } = window;
    const hero = { player: { name: 'Same Guest' } };
    const cloud = { version: 2, activeHeroId: 'guest-1', heroes: { 'guest-1': hero } };
    const pending = { activeHeroId: 'guest-1', heroes: { 'guest-1': hero } };
    const merged = OnlineSystem.mergeRosterSnapshots(cloud, pending);
    assert.deepEqual(Object.keys(merged.heroes), ['guest-1']);
    assert.equal(merged.activeHeroId, 'guest-1');
});
