// v7.55 — prayer in battle, the emergency prayer and its four angels, the rooms
// of the Royal Palace, and saves kept apart for each Google account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRuntime } from '../scripts/load-world.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = window => [...window.document.querySelectorAll('#narrative p')].map(node => node.textContent);
const clearLog = window => { window.document.getElementById('narrative').innerHTML = ''; };
const has = (window, pattern) => lines(window).some(line => pattern.test(line));

async function liveGame(t) {
    const runtime = await createRuntime();
    t.after(() => runtime.dom.window.close());
    const { window } = runtime, { Game } = window;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.dropWorldItem = async () => false;
    window.OnlineSystem.init = () => {};
    Game.init();
    Game.startNewHero();
    window.document.getElementById('char-name').value = 'Asha';
    window.document.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    window.document.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    Game.state.quests = [];
    window.InterfaceMode.apply('sighted');
    window.AudioManager.endBattle = async () => {};
    await wait(30);
    clearLog(window);
    return { window, G: Game, N: window.Narration };
}

/** A fight against one very tough monster, with the monster's turns counted. */
async function battle(window, { hp = 99999 } = {}) {
    const G = window.Game;
    G.state.location = 'forest';
    G.startCombat('root goblin');
    G.state.sacred.enemyQueue = [];
    G.state.enemy.hp = G.state.enemy.maxHp = hp;
    const counter = { turns: 0 };
    const original = G.enemyGroupTurn.bind(G);
    G.enemyGroupTurn = function () { counter.turns++; return original(); };
    await wait(40);
    clearLog(window);
    return counter;
}

/* ───────────────────────── the emergency prayer ───────────────────────── */

test('at 15% health or lower a prayer in battle brings four angels: full health and magic, then they fight for five turns', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    const counter = await battle(window);
    p.hp = Math.floor(p.maxHp * 0.15); p.mp = 0;
    assert.ok(p.hp / p.maxHp <= 0.15);
    const enemyHp = G.state.enemy.hp;

    assert.equal(await G.pray(''), true);
    await wait(60);
    const arrival = lines(window).find(line => /Four angels descend/.test(line));
    assert.ok(arrival, 'the arrival is narrated');
    for (const name of ['Angel of Light', 'Angel of Grace', 'Angel of Strength', 'Angel of Wisdom']) assert.match(arrival, new RegExp(name));
    assert.match(arrival, new RegExp(`You have ${p.maxHp} health and ${p.maxMp} magic`), 'health and magic were restored in full');
    assert.ok(has(window, /fight beside you for 5 turns/));
    assert.equal(p.mp, p.maxMp, 'magic is full');
    assert.ok(p.hp > p.maxHp * 0.5, 'health was restored (the monster has had one turn since)');
    assert.equal(counter.turns, 1, 'praying uses the turn: the monsters act exactly once');
    assert.ok(G.state.enemy.hp < enemyHp, 'the angels struck in the same round');
    assert.ok(has(window, /The four angels strike root goblin for \d+ damage\./));
    assert.equal(G.angelsWithHero(), 4, 'four turns are left');

    // Rounds two to five: the angels strike once a round, then leave.
    for (let round = 2; round <= 5; round++) {
        const before = G.state.enemy.hp, turnsBefore = counter.turns;
        clearLog(window);
        G.processCommand('defend');
        await wait(60);
        assert.equal(counter.turns, turnsBefore + 1, `round ${round}: one monster turn`);
        assert.ok(G.state.enemy.hp < before, `round ${round}: the angels struck`);
        assert.equal(lines(window).filter(line => /The four angels strike/.test(line)).length, 1, `round ${round}: one strike line, not four`);
        if (round === 4) assert.ok(has(window, /The angels will stay for one more turn\./));
    }
    assert.ok(has(window, /The four angels ascend back to the heavens\./));
    assert.equal(G.angelsWithHero(), 0);
    assert.equal(G.state.sacred.angels, undefined);

    // Round six: no angels any more.
    const before = G.state.enemy.hp;
    clearLog(window);
    G.processCommand('defend');
    await wait(60);
    assert.equal(G.state.enemy.hp, before, 'the angels are gone');
    assert.ok(!has(window, /angels strike/));
});

test('the angels come once in each battle, and a new battle makes them available again', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    await battle(window);
    p.hp = 1;
    assert.equal(await G.pray(''), true);
    await wait(60);
    for (let round = 2; round <= 5; round++) { G.processCommand('defend'); await wait(50); }
    assert.equal(G.angelsWithHero(), 0);

    // Low again in the same battle: no second rescue, but the battle prayer is still there once.
    p.hp = 1; clearLog(window);
    assert.equal(await G.pray(''), true, 'the ordinary battle prayer is given instead');
    await wait(60);
    assert.ok(has(window, /The angels have already answered you in this battle/));
    assert.ok(!has(window, /Four angels descend/));
    assert.ok(has(window, /You pray in the middle of the battle/));
    assert.ok(p.hp < p.maxHp, 'no full refill');
    await wait(450);
    p.hp = 1; clearLog(window);
    assert.equal(await G.pray(''), false, 'nothing is left in this battle');
    assert.ok(has(window, /The angels have already answered you in this battle/));
    assert.equal(G.angelsWithHero(), 0);

    // A new battle.
    G.state.inCombat = false; G.state.enemy = null;
    await battle(window);
    p.hp = 1;
    assert.equal(await G.pray(''), true);
    await wait(60);
    assert.ok(has(window, /Four angels descend/));
});

test('when the angels strike the last blow the battle is won', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    await battle(window, { hp: 3 });
    p.hp = 1;
    const kills = G.state.kills || 0;
    await G.pray('');
    for (let i = 0; i < 80 && G.state.inCombat; i++) await wait(25);
    assert.equal(G.state.inCombat, false, 'the fight is over');
    assert.ok(p.hp > 0, 'the hero lives');
    assert.ok((G.state.kills || 0) > kills || has(window, /defeated/i), 'the monster counts as defeated');
});

test('outside battle the angels come once and wait for the next battle; the prayer cannot be repeated as a refill', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    assert.notEqual(G.state.location, 'grand_temple');
    p.hp = Math.max(1, Math.floor(p.maxHp * 0.1)); p.mp = 1;
    G.processCommand('pray');
    await wait(40);
    assert.equal(p.hp, p.maxHp); assert.equal(p.mp, p.maxMp);
    assert.ok(has(window, /Four angels descend/));
    assert.ok(has(window, /fight beside you for 5 turns in your next battle/));
    assert.equal(G.angelsWithHero(), 5);
    assert.equal(G.getSaveData().sacred.angels.turns, 5, 'the waiting angels are part of the save');

    p.hp = 1; clearLog(window);
    G.processCommand('pray');
    await wait(40);
    assert.equal(p.hp, 1, 'no second refill');
    assert.ok(has(window, /The angels are already with you\. They will fight beside you for 5 turns in your next battle\./));

    // They join the next battle.
    p.hp = p.maxHp;
    G.state.location = 'forest';
    clearLog(window);
    G.startCombat('root goblin');
    G.state.sacred.enemyQueue = [];
    G.state.enemy.hp = G.state.enemy.maxHp = 99999;
    await wait(40);
    assert.ok(has(window, /The four angels stand beside you in this battle\. They will fight for 5 turns\./));
    const before = G.state.enemy.hp;
    G.processCommand('defend');
    await wait(60);
    assert.ok(G.state.enemy.hp < before);
    assert.equal(G.angelsWithHero(), 4);
    // …and that counts as this battle's visit.
    p.hp = 1; clearLog(window);
    await G.pray('');
    await wait(60);
    assert.ok(has(window, /The angels are already with you\. They have \d turns left\./));
    assert.ok(!has(window, /Four angels descend/));
});

test('"emergency prayer" and "call the angels" explain themselves when health is not low', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    p.hp = p.maxHp;
    G.processCommand('call the angels');
    await wait(30);
    assert.ok(has(window, /Your health is at 100 percent\. The angels come when it is at 15 percent or lower\./));
    assert.equal(G.angelsWithHero(), 0);
    p.hp = 1; clearLog(window);
    G.processCommand('emergency prayer');
    await wait(30);
    assert.ok(has(window, /Four angels descend/));
});

test('inside a temple a plain "pray" still opens the temple prayers; the emergency prayer is asked for by name', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    G.state.location = 'grand_temple';
    p.hp = 5; p.mp = 0;
    await G.pray('');
    assert.ok(has(window, /What would you like to pray about\?/));
    assert.equal(p.hp, 5, 'opening the list does nothing to the hero');
    assert.equal(G.angelsWithHero(), 0);
    clearLog(window);
    G.processCommand('emergency prayer');
    await wait(30);
    assert.ok(has(window, /Four angels descend/));
    assert.equal(p.hp, p.maxHp);
});

/* ───────────────────────── the battle prayer ───────────────────────── */

test('above 15% health a prayer in battle restores a fifth of health and magic, once per battle, and uses the turn', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    const counter = await battle(window);
    p.hp = Math.floor(p.maxHp * 0.5); p.mp = 0;
    const hpBefore = p.hp, expectedHp = Math.max(5, Math.floor(p.maxHp * 0.2)), expectedMp = Math.max(3, Math.floor(p.maxMp * 0.2));
    G.processCommand('pray');
    await wait(60);
    assert.ok(has(window, new RegExp(`You pray in the middle of the battle\\. You recover ${expectedHp} health and ${expectedMp} magic\\. You have ${hpBefore + expectedHp} health\\.`)), lines(window).join(' | '));
    assert.ok(p.mp >= expectedMp && p.mp <= expectedMp + 2, 'magic came back too');
    assert.equal(counter.turns, 1, 'the monsters act once');
    assert.ok(!has(window, /Prayer is offered inside a temple/), 'prayer is no longer refused in battle');
    assert.ok(!has(window, /angels descend/i));

    p.hp = hpBefore; clearLog(window);
    G.processCommand('pray');
    await wait(60);
    assert.ok(p.hp <= hpBefore, 'no second battle prayer');
    assert.ok(!has(window, /You pray in the middle of the battle/));
    assert.equal(counter.turns, 1, 'a refused prayer does not cost the turn');
    assert.ok(has(window, /You have already prayed in this battle/));

    await wait(450);                                  // the game drops an identical line repeated within 0.4 s
    clearLog(window);
    G.processCommand('battle prayer');
    await wait(60);
    assert.ok(has(window, /You have already prayed in this battle/), 'the older command gives the same prayer');

    // The next battle has its own prayer.
    G.state.inCombat = false; G.state.enemy = null;
    await battle(window);
    p.hp = hpBefore; clearLog(window);
    G.processCommand('battle prayer');
    await wait(60);
    assert.ok(has(window, /You pray in the middle of the battle/));
});

test('the battle has a Pray button that runs the same command', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    const button = window.document.querySelector('#combat-actions [data-combat-command="pray"]');
    assert.ok(button, 'the button exists');
    assert.equal(button.getAttribute('accesskey'), '9');
    const keys = [...window.document.querySelectorAll('#combat-actions [accesskey]')].map(node => node.getAttribute('accesskey'));
    assert.equal(new Set(keys).size, keys.length, 'no two battle buttons share an access key');
    await battle(window);
    G.updateCombatActionAvailability();
    assert.equal(button.disabled, false);
    p.hp = Math.floor(p.maxHp * 0.5);
    button.click();
    await wait(60);
    assert.ok(has(window, /You pray in the middle of the battle\. You recover \d+ health\. You have \d+ health\./), 'magic was full, so only health is mentioned');
    window.Narration.setLang('te', { announce: false });
    assert.match(button.textContent, /[\u0C00-\u0C7F]/, 'the label follows the game language');
});

test('away from a temple and in good health, praying is refused and the emergency prayer is explained', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    p.hp = p.maxHp;
    G.processCommand('pray');
    await wait(30);
    assert.ok(has(window, /Prayer is offered inside a temple/));
    assert.ok(has(window, /If your health falls to 15 percent or lower, pray anywhere, even in battle, and four angels will come to your aid\./));
    assert.equal(p.hp, p.maxHp);
});

test('the angel and battle-prayer lines are spoken in Telugu and Hindi', async t => {
    const { window, G, N } = await liveGame(t), p = G.state.player;
    for (const [lang, script] of [['te', /[\u0C00-\u0C7F]/], ['hi', /[\u0900-\u097F]/]]) {
        N.setLang(lang, { announce: false });
        G.state.inCombat = false; G.state.enemy = null; delete G.state.sacred.angels;
        await battle(window);
        p.hp = Math.floor(p.maxHp * 0.5);
        await G.pray(''); await wait(50);
        p.hp = 1;
        await G.pray(''); await wait(50);
        const spoken = lines(window).filter(line => /\d/.test(line) && script.test(line));
        assert.ok(spoken.length >= 3, `${lang}: battle prayer, arrival and strike are in the chosen language: ${lines(window).join(' | ')}`);
        for (const key of ['angel.descend', 'angel.stayBattle', 'angel.stayLater', 'angel.join', 'angel.strike', 'angel.heal', 'angel.oneLeft', 'angel.ascend', 'angel.usedBattle', 'angel.present', 'angel.waiting', 'angel.hint', 'angel.stable', 'battlePrayer.done', 'battlePrayer.hpOnly', 'battlePrayer.mpOnly', 'battlePrayer.full', 'battlePrayer.used', 'battlePrayer.notInBattle', 'angel.light', 'angel.grace', 'angel.strength', 'angel.wisdom']) {
            assert.match(N.t(key, { names: 'x', enemy: 'x', turns: 5, damage: 1, amount: 1, hp: 1, mp: 1, now: 1, percent: 50 }, lang), script, `${key} has a ${lang} line`);
        }
    }
});

test('a Shock spell gives the monsters one turn, not two', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;
    const counter = await battle(window);
    p.spells.push('Shock'); p.mp = p.maxMp = 200; G.state.spellCooldowns = {};
    for (const [roll, label] of [[0.01, 'failed cast'], [0.99, 'successful cast']]) {
        counter.turns = 0; G.state.spellCooldowns = {};
        window.GameSpellSystem.random = () => roll;
        window.GameSpellSystem.castShock(G);
        await wait(80);
        assert.equal(counter.turns, 1, label);
    }
});

/* ───────────────────────── the palace ───────────────────────── */

const ROUTE = [
    ['north', 'kaliwasch_palace_great_hall'], ['north', 'kaliwasch_palace_throne_room'], ['south', 'kaliwasch_palace_great_hall'],
    ['west', 'kaliwasch_palace_chapel'], ['east', 'kaliwasch_palace_great_hall'], ['south', 'royal_palace'],
    ['east', 'kaliwasch_palace_armory'], ['west', 'royal_palace'], ['west', 'kaliwasch_palace_library'], ['east', 'royal_palace'],
    ['south', 'kaliwasch_palace_courtyard'], ['north', 'royal_palace'], ['down', 'kaliwasch_district_11'], ['up', 'royal_palace']
];

test('the palace is a building of seven rooms that can be walked through and left again', async t => {
    const { window, G } = await liveGame(t), W = window.WorldData.locations;
    assert.deepEqual([...window.PalaceRooms.rooms].sort(), ['kaliwasch_palace_armory', 'kaliwasch_palace_chapel', 'kaliwasch_palace_courtyard', 'kaliwasch_palace_great_hall', 'kaliwasch_palace_library', 'kaliwasch_palace_throne_room']);
    G.state.location = 'royal_palace';
    for (const [direction, expected] of ROUTE) {
        clearLog(window);
        assert.equal(G.move(direction), true, `${direction} is accepted`);
        await wait(380);                              // a step takes about a third of a second
        assert.equal(G.state.location, expected, `${direction} leads to ${expected}`);
        assert.ok(!has(window, /You did not move/), `${direction} was not blocked`);
    }
    for (const id of window.PalaceRooms.rooms) {
        const room = W[id];
        for (const field of ['id', 'name', 'region', 'coordinates', 'description', 'exits', 'locationType', 'musicContext', 'accessibleDescription']) assert.ok(room[field], `${id}.${field}`);
        assert.equal(room.safe, true, `${id} is safe`);
        assert.equal(room.enemies.length, 0, `${id} has no monsters`);
        assert.ok((window.WorldData.npcs[id] || []).length, `${id} has someone to talk to`);
        for (const [direction, to] of Object.entries(room.exits)) {
            const back = { north: 'south', south: 'north', east: 'west', west: 'east' }[direction];
            assert.equal(W[to].exits[back], id, `${id} ${direction} is a two-way door`);
        }
    }
    assert.match(W.royal_palace.description, /great hall and the throne room are to the north/i, 'the entrance hall says where the rooms are');
    assert.equal(W.royal_palace.exits.down, 'kaliwasch_district_11', 'the way out is unchanged');
    // A blocked direction inside the palace still gives the reason and the real exits.
    G.state.location = 'kaliwasch_palace_throne_room'; clearLog(window);
    G.move('north');
    await wait(15);
    assert.equal(G.state.location, 'kaliwasch_palace_throne_room');
    assert.ok(has(window, /^You did not move\./));
    assert.ok(has(window, /south/i));
});

test('each palace room does what its description says: chapel prayer, armory shop, throne-room quests, people to talk to', async t => {
    const { window, G } = await liveGame(t), p = G.state.player;

    // Chapel: prayer is accepted as in a temple.
    G.state.location = 'kaliwasch_palace_chapel';
    assert.equal(G.isPrayerPlace(), true);
    p.hp = p.maxHp;
    assert.equal(await G.pray('courage'), true, 'a prayer in the chapel is accepted');
    assert.ok(!has(window, /Prayer is offered inside a temple/));
    assert.ok(!has(window, /If your health falls to 15 percent/), 'no "go to a temple" hint in the chapel');
    G.state.location = 'kaliwasch_palace_library';
    assert.equal(G.isPrayerPlace(), false);

    // Armory: a weapons shop.
    G.state.location = 'kaliwasch_palace_armory';
    assert.equal(window.WorldData.locations.kaliwasch_palace_armory.shop, 'weapons');
    assert.ok(window.ExpansionData.shopStock.weapons.length > 0);
    G.showShop?.();
    const shop = window.document.getElementById('shop-content') || window.document.querySelector('.shop-row')?.parentElement;
    if (shop) assert.ok(!/There is no shop at this location/.test(shop.textContent), 'the shop opens in the armory');

    // Throne room: the King gives palace quests in person.
    G.state.location = 'kaliwasch_palace_throne_room'; clearLog(window);
    await G.palaceQuest();
    await wait(30);
    assert.ok(!has(window, /Go to the Royal Palace first/), 'quests are given in the throne room');
    assert.ok(lines(window).length > 0, 'the King answers');
    G.state.location = 'kaliwasch_palace_courtyard'; clearLog(window);
    await G.palaceQuest();
    assert.ok(has(window, /Go to the Royal Palace first/), 'but not in the courtyard');

    // Talking.
    G.state.location = 'kaliwasch_palace_throne_room'; clearLog(window);
    G.processCommand('talk king');
    await wait(30);
    assert.ok(has(window, /^King Aldric says: "/), lines(window).join(' | '));
});

/* ───────────────────────── saves for each account ───────────────────────── */

test('heroes saved on the device are kept apart for each Google account', async t => {
    const { window, G } = await liveGame(t), O = window.OnlineSystem, store = window.localStorage;
    const ROSTER = 'black_sword_hero_roster_v2', SAVE = 'black_sword_ultimate_save';
    G.save();
    const names = () => Object.values(G.getRoster().heroes).map(hero => hero.player.name).sort();

    // Guest: the plain keys.
    assert.equal(G.accountId(), null);
    assert.equal(G.state.rosterKey, ROSTER);
    assert.equal(G.state.saveKey, SAVE);
    assert.deepEqual(names(), ['Asha']);

    // Account A signs in: the heroes already on the device become A's (moved, not copied).
    O.user = { id: 'account-A' }; O.linked = true;
    assert.equal(G.state.rosterKey, `${ROSTER}:account-A`);
    assert.equal(G.state.saveKey, `${SAVE}:account-A`);
    assert.deepEqual(names(), ['Asha'], 'nothing is lost on first sign-in');
    assert.equal(store.getItem(ROSTER), null, 'the guest copy is gone');
    assert.equal(store.getItem(SAVE), null);
    assert.equal(store.getItem('black_sword_local_account'), 'account-A');
    G.save();
    assert.ok(store.getItem(`${ROSTER}:account-A`).includes('Asha'), 'saving writes to A');

    // The account is remembered while sign-in is still being confirmed (start-up, offline).
    O.user = null; O.linked = false;
    assert.equal(G.state.rosterKey, `${ROSTER}:account-A`);
    assert.deepEqual(names(), ['Asha']);

    // Sign-out: back to the guest saves, which are empty; A's heroes stay under A's key.
    G.forgetAccount();
    assert.equal(G.state.rosterKey, ROSTER);
    assert.deepEqual(names(), [], 'a signed-out device does not show the account\'s heroes');
    assert.ok(store.getItem(`${ROSTER}:account-A`).includes('Asha'));

    // Account B signs in on the same device: it does not receive A's heroes.
    O.user = { id: 'account-B' }; O.linked = true;
    assert.equal(G.state.rosterKey, `${ROSTER}:account-B`);
    assert.deepEqual(names(), []);
    const roster = G.getRoster();
    roster.heroes.hero_b = { player: { name: 'Bala' } }; roster.activeHeroId = 'hero_b';
    store.setItem(G.state.rosterKey, JSON.stringify(roster));
    assert.deepEqual(names(), ['Bala']);

    // Switching straight from B to A (no sign-out): each sees only its own heroes.
    O.user = { id: 'account-A' };
    assert.deepEqual(names(), ['Asha']);
    O.user = { id: 'account-B' };
    assert.deepEqual(names(), ['Bala']);

    // A guest who plays after sign-out keeps guest heroes apart from an account that already has saves here.
    G.forgetAccount(); O.user = null; O.linked = false;
    store.setItem(ROSTER, JSON.stringify({ version: 2, activeHeroId: 'hero_g', heroes: { hero_g: { player: { name: 'Guest' } } } }));
    assert.deepEqual(names(), ['Guest']);
    O.user = { id: 'account-A' }; O.linked = true;
    assert.deepEqual(names(), ['Asha'], 'A keeps its own roster');
    assert.ok(store.getItem(ROSTER).includes('Guest'), 'the guest heroes are not deleted');

    // A guest signed in anonymously (not linked to Google) stays on the plain keys.
    G.forgetAccount(); O.user = { id: 'anonymous-1' }; O.linked = false;
    assert.equal(G.state.rosterKey, ROSTER);
});

test('a fresh Google login does not take heroes that were downloaded for another Google account', async t => {
    const { window, G } = await liveGame(t), O = window.OnlineSystem, store = window.localStorage;
    const ROSTER = 'black_sword_hero_roster_v2';
    G.save();
    // The device holds a roster that came from a Google account (an older version of the game kept it under the plain key).
    store.setItem('black_sword_roster_was_linked', 'true');
    // Somebody starts a new Google login.
    store.setItem('black_sword_google_login_requested', 'true');
    O.user = { id: 'account-Y' }; O.linked = true;
    assert.equal(G.state.rosterKey, `${ROSTER}:account-Y`);
    assert.equal(Object.keys(G.getRoster().heroes).length, 0, 'the new account starts without the other account\'s heroes');
    assert.ok(store.getItem(ROSTER).includes('Asha'), 'and nothing was deleted');

    // The same roster with the same account simply coming back (no new login) is kept: an update must not hide a player's heroes.
    G.forgetAccount(); store.removeItem('black_sword_google_login_requested');
    O.user = { id: 'account-X' };
    assert.equal(G.state.rosterKey, `${ROSTER}:account-X`);
    assert.deepEqual(Object.values(G.getRoster().heroes).map(hero => hero.player.name), ['Asha']);
});

test('signing out tells the game to go back to the guest saves', async t => {
    const { window, G } = await liveGame(t), O = window.OnlineSystem;
    O.user = { id: 'account-A' }; O.linked = true;
    assert.match(G.state.saveKey, /:account-A$/);
    O.client = { auth: { signOut: async () => ({ error: null }) } };
    await O.signOut({ reload: false, flush: false });
    assert.equal(window.localStorage.getItem('black_sword_local_account'), null);
    assert.equal(G.state.saveKey, 'black_sword_ultimate_save');
});

/* ───────────────────────── shipping ───────────────────────── */

test('the new files are loaded, precached, and the Android build carries the game version', () => {
    const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const index = read('index.html'), version = JSON.parse(read('package.json')).version;
    for (const file of ['palace-rooms-v755.js', 'prayer-angels-v755.js']) {
        assert.ok(index.includes(`src="${file}"`), `${file} is loaded by index.html`);
        for (const worker of ['service-worker.js', 'sw.js']) assert.ok(read(worker).includes(`'${file}'`), `${file} is precached by ${worker}`);
    }
    assert.ok(index.indexOf('src="survival-v755.js"') < index.indexOf('src="prayer-angels-v755.js"'), 'the angels wrap the temple prayer, so they load after it');
    const gradle = read('android/app/build.gradle');
    assert.match(gradle, new RegExp(`versionName "${version.replace(/\./g, '\\.')}"`));
    assert.ok(Number(/versionCode (\d+)/.exec(gradle)[1]) > 20, 'the version code went up');
});
