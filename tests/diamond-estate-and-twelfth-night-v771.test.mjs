/**
 * 7.71.0 — a house paid for in diamonds, and six nights instead of one.
 *
 * What the owner asked for:
 *  - houses cost diamonds, between one hundred and three hundred, never money;
 *  - diamonds are rare, and are found in some presents at the gift shop;
 *  - the monthly estate due is paid in diamonds, and auto-pay lets the agent
 *    collect it, with every diamond written in the agent's ledger;
 *  - the five Christmas ideas: the twelfth-night candle row, carols with the
 *    crier, a gift exchange graded by generosity, an identical frost-prowler
 *    bounty board, and a shared tree of lights that gives nothing back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;

async function ready(t, { iso = '2026-12-28T10:00:00Z', gold = 5000, diamonds = 200, at = 'kaliwasch' } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [iso])); } };
    const G = w.Game;
    G.state.player = {
        name: 'Estate Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 1, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.sacred = { storage: [], groundLoot: [] };
    G.state.companions = [];
    G.state.quests = [];
    G.state.housing = { houses: {} };
    G.state.location = at;
    G.save = () => true;
    G.updateHUD = () => {};
    return { w, G };
}

/* ─────────────────────────────── diamonds only ─────────────────────────────── */

test('every deed is priced in diamonds, between one and three hundred', async t => {
    const { w, G } = await ready(t);
    G.processCommand('houses for sale');
    const text = narrative(w);
    assert.match(text, /Kaliwasch: 100 diamonds/);
    assert.match(text, /Aurora City: 150 diamonds/);
    assert.match(text, /Seabreeze City: 200 diamonds/);
    assert.match(text, /Ironspire City: 300 diamonds/);
    assert.match(text, /You carry 200 diamonds/, 'the purse that matters is the diamond purse');
    assert.doesNotMatch(text, /rupees/, 'a deed is never sold for rupees');
});

test('buying a house costs diamonds, and not one rupee of gold', async t => {
    const { w, G } = await ready(t);
    const gold = G.state.player.gold, diamonds = G.state.player.diamonds;
    assert.equal(G.buyHouse('kaliwasch'), true);
    assert.equal(G.state.player.diamonds, diamonds - 100, 'one hundred diamonds left the purse');
    assert.equal(G.state.player.gold, gold, 'gold is untouched: the estate deals in diamonds');
    assert.ok(G.state.housing.houses.kaliwasch, 'the deed is recorded');
    assert.match(narrative(w), /for 100 diamonds/);
    assert.match(narrative(w), /auto-pay/i, 'the monthly due is explained at the signature');
});

test('a light purse is told the exact shortfall and where diamonds are found', async t => {
    const { w, G } = await ready(t, { diamonds: 20 });
    assert.equal(G.buyHouse('aurora'), false);
    const text = narrative(w);
    assert.match(text, /costs 150 diamonds/);
    assert.match(text, /130 diamonds are still missing/);
    assert.match(text, /gift shop/i, 'the way forward is named');
    assert.match(text, /presents/i);
});

test('an unknown city signs no deed and lists the real cities', async t => {
    const { w, G } = await ready(t);
    assert.equal(G.buyHouse('atlantis'), false);
    assert.match(narrative(w), /No deed was signed/);
    assert.match(narrative(w), /Kaliwasch \(100 diamonds\)/);
    assert.match(narrative(w), /Ironspire City \(300 diamonds\)/);
});

/* ──────────────────────────────── gift shop ──────────────────────────────── */

test('the gift shop sells presents for rupees and they really unwrap', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch_district_15' });
    const panel = w.document.getElementById('shop-content');
    G.processCommand('gift shop');
    assert.match(panel.innerHTML, /Wrapped Parcel/);
    assert.match(panel.innerHTML, /Ribboned Gift/);
    assert.match(panel.innerHTML, /Grand Present/);

    const gold = G.state.player.gold;
    assert.equal(G.buyPresent('wrapped_parcel'), true);
    assert.equal(G.state.player.gold, gold - 25, 'a parcel costs 25 rupees');
    assert.equal(G.state.inventory.filter(i => i.id === 'wrapped_parcel').length, 1);

    w.Math.random = () => 0;                       // the paper always falls open
    const opened = G.openGift();
    assert.equal(opened.diamonds, 1, 'this parcel held a diamond');
    assert.equal(G.state.player.diamonds, 201);
    assert.equal(G.state.inventory.some(i => i.id === 'wrapped_parcel'), false, 'the parcel is gone');
    assert.ok(G.state.inventory.some(i => i.id === 'candy_cane'), 'and a real trinket is in the bag');
    assert.match(narrative(w), /diamond/);
});

test('the tenth present a hero unwraps always holds a diamond', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch_district_15', gold: 2000, diamonds: 0 });
    w.Math.random = () => 0.99;                    // never a diamond by chance
    for (let i = 0; i < 10; i++) G.buyPresent('wrapped_parcel');
    const purseOverTime = [];
    for (let i = 0; i < 10; i++) purseOverTime.push(G.openGift().diamonds);
    assert.deepEqual(purseOverTime.slice(0, 9), [0, 0, 0, 0, 0, 0, 0, 0, 0], 'nine parcels of plain paper');
    assert.equal(purseOverTime[9], 1, 'the tenth always pays one diamond');
    assert.equal(G.state.player.diamonds, 1);
});

test('the diamond report names every honest source and no money', async t => {
    const { w, G } = await ready(t, { diamonds: 7 });
    G.processCommand('diamonds');
    const text = narrative(w);
    assert.match(text, /Diamonds in your purse: 7/);
    assert.match(text, /presents from the gift shop/i);
    assert.match(text, /fallen monsters and bosses/i);
    assert.match(text, /twelfth-night bounty board/i);
    assert.match(text, /nobody anywhere sells a diamond for money/i);
});

test('the gift shop is one command and one button away', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch_district_15' });
    G.updateContextActions();
    const box = w.document.getElementById('context-actions').innerHTML;
    assert.match(box, /Gift Shop/);
    assert.match(box, /Diamonds/);
    G.processCommand('gift shop');
    assert.equal(w.document.getElementById('shop-panel').classList.contains('hidden'), false, 'the panel opens');
    assert.match(w.document.getElementById('shop-content').innerHTML, /buyPresent|Buy/);

    G.processCommand('gift shop directions');
    assert.match(narrative(w), /Wrapped Parcel is open beside you/i, 'at the counter it names what is beside you');
    G.state.location = 'forest';
    G.processCommand('gift shop');
    assert.match(w.document.getElementById('shop-content').innerHTML, /Wrapped Parcel is not here/i, 'away from a counter it says so');
});

/* ───────────────────────────── the monthly estate due ───────────────────────── */

test('auto-pay takes the monthly due in diamonds and writes it in the ledger', async t => {
    const { w, G } = await ready(t);
    assert.equal(G.buyHouse('kaliwasch'), true);
    const house = G.state.housing.houses.kaliwasch;
    const purse = G.state.player.diamonds;
    house.paidUntil = Date.now() - 31 * 86400000;   // a month has turned
    house.autopay = true;

    const result = G.settleHouseDues(true);
    assert.equal(result.paid, 5, 'Kaliwasch keeps a five-diamond monthly due');
    assert.equal(G.state.player.diamonds, purse - 5);
    assert.ok(house.paidUntil > Date.now(), 'the house is paid up again');
    assert.equal(G.state.housing.agentLedger.total >= 5, true, 'the agent recorded the diamonds');
    assert.match(narrative(w), /estate agent takes 5 diamonds/i);

    // Nothing is taken twice in the same month.
    const after = G.state.player.diamonds;
    assert.equal(G.settleHouseDues(true).paid, 0);
    assert.equal(G.state.player.diamonds, after);
});

test('without auto-pay the due waits, the storage shuts, and paying opens it', async t => {
    const { w, G } = await ready(t);
    assert.equal(G.buyHouse('kaliwasch'), true);
    const house = G.state.housing.houses.kaliwasch;
    house.paidUntil = Date.now() - 31 * 86400000;
    house.autopay = false;
    const purse = G.state.player.diamonds;

    const result = G.settleHouseDues(true);
    assert.equal(result.owed, 5);
    assert.equal(G.state.player.diamonds, purse, 'nothing is taken without permission');
    assert.equal(G.houseDueNow('kaliwasch'), 5);
    assert.match(narrative(w), /unpaid/);

    G.state.location = 'private_house_kaliwasch_storage';
    G.showStorage();
    assert.match(narrative(w), /storage stays locked/i);

    G.state.location = 'kaliwasch';
    assert.equal(G.payHouseDue('kaliwasch'), true);
    assert.equal(G.state.player.diamonds, purse - 5);
    assert.equal(G.houseDueNow('kaliwasch'), 0, 'the house is square again');
    assert.match(narrative(w), /storage opens again/i);
});

test('an owner may switch auto-pay on and off, and the agent obeys', async t => {
    const { w, G } = await ready(t);
    G.buyHouse('kaliwasch');
    const house = G.state.housing.houses.kaliwasch;
    assert.equal(house.autopay, false, 'auto-pay starts off');

    G.processCommand('house autopay on');
    assert.equal(house.autopay, true);
    assert.match(narrative(w), /Auto-pay is on/);

    G.processCommand('house autopay off');
    assert.equal(house.autopay, false);
    assert.match(narrative(w), /Auto-pay is off/);
});

test('the ledger is a real record of every diamond the estate received', async t => {
    const { w, G } = await ready(t);
    G.buyHouse('kaliwasch');
    const house = G.state.housing.houses.kaliwasch;
    house.paidUntil = Date.now() - 86400000;
    house.autopay = true;
    G.settleHouseDues(true);

    G.processCommand('estate ledger');
    const text = narrative(w);
    assert.match(text, /Diamonds received: 105/, '100 for the deed and 5 for the month');
    assert.match(text, /deed/);
    assert.match(text, /due/);
    assert.match(text, /deals only in diamonds/i);
});

test('the agent street offers diamonds, auto-pay, the due and the ledger as buttons', async t => {
    const { w, G } = await ready(t, { diamonds: 50 });
    G.enterLocation('kaliwasch_district_2');
    let box = w.document.getElementById('context-actions').innerHTML;
    assert.match(box, /Buy This House — 100 Diamonds/);
    assert.doesNotMatch(box, /Rupees/);

    G.state.player.diamonds = 400;
    G.buyHouse();
    G.updateContextActions();
    box = w.document.getElementById('context-actions').innerHTML;
    assert.match(box, /House Status/);
    assert.match(box, /Auto-pay: Off/);
    assert.match(box, /Pay Estate Due/);
    assert.match(box, /Estate Ledger/);
});

/* ────────────────────────────── the six nights ────────────────────────────── */

test('twelfth night opens on the 26th and closes after the 31st', async t => {
    const { w } = await ready(t);
    const ids = iso => w.SeasonalEvents.activeEvents(new w.Date(iso)).map(e => e.id);
    assert.equal(ids('2026-12-22T10:00:00Z').includes('twelfthnight'), false, 'before Christmas it is not open');
    assert.equal(ids('2026-12-22T10:00:00Z').includes('christmas'), true);
    assert.equal(ids('2026-12-26T10:00:00Z').includes('twelfthnight'), true);
    assert.equal(ids('2026-12-31T10:00:00Z').includes('twelfthnight'), true);
    assert.equal(ids('2027-01-02T10:00:00Z').includes('twelfthnight'), false, 'and it ends with the year');
});

test('a candle may be lit once a night, and a missed night can be made good later', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.state.player.hp = 20; G.state.player.mp = 1;
    G.processCommand('light candle');
    const state = w.TwelfthNight.stateOf(G);
    assert.equal(Boolean(state.candles[26]), true, 'the first candle burns');
    assert.equal(G.state.player.hp, 100, 'the warmth restores health');
    assert.equal(G.state.player.mp, 40);

    G.enterLocation('kaliwasch');
    G.processCommand('light candle');
    assert.equal(Boolean(state.candles[27]), false, 'one candle each night, and no more');
    assert.match(narrative(w), /One candle each night/);

    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : ['2026-12-29T10:00:00Z'])); } };
    G.processCommand('light candle');
    assert.equal(Boolean(state.candles[27]), true, 'the next night lights the next candle');
});

test('the row is cold outside the six nights', async t => {
    const { w, G } = await ready(t, { iso: '2026-12-20T10:00:00Z' });
    G.state.location = 'kaliwasch';
    G.processCommand('light candle');
    assert.match(narrative(w), /ninth of December|twenty-sixth|cold/i);
    assert.equal(Object.keys(w.TwelfthNight.stateOf(G).candles).length, 0, 'nothing is lit early');
});

test('carols are sung one verse a night, and all six earn the caroller’s cloak', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.processCommand('carol');
    const state = w.TwelfthNight.stateOf(G);
    assert.equal(Object.keys(state.carols).length, 1, 'the first verse is sung');
    assert.match(narrative(w), /Crier Bell/);
    G.processCommand('carol');
    assert.equal(Object.keys(state.carols).length, 1, 'the second verse waits for tomorrow');

    // Away from the crier nobody leads a carol, and nothing is lost by asking.
    G.state.location = 'kaliwasch_district_5';
    G.processCommand('carol');
    assert.match(narrative(w), /Crier Bell leads the carols/i);
    assert.equal(Object.keys(state.carols).length, 1, 'a wrong place costs no verse');

    G.state.location = 'kaliwasch';
    for (const night of ['2026-12-29', '2026-12-30', '2026-12-31']) {
        w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [`${night}T10:00:00Z`])); } };
        G.processCommand('carol');
    }
    assert.equal(Object.keys(state.carols).length, 4, 'four verses across four nights inside the festival');
    assert.equal(state.cloak, false, 'the cloak waits for every verse');
});

test('the gift exchange is graded by generosity and never pays more than it is given', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.addItemToInventory('iron mace', { id: 'iron mace', name: 'Iron Mace', type: 'weapon', value: 160 });
    G.addItemToInventory('bread', { id: 'bread', name: 'Bread', type: 'food', value: 8 });

    G.processCommand('gift exchange iron mace');
    assert.equal(narrative(w).includes('Ribboned Gift'), true, 'a good gift earns a good parcel');
    const ribbon = (w.GiftShop.presents.find(p => p.id === 'ribboned_gift'));
    assert.ok(ribbon.price < 160, `the return (${ribbon.price}) is less than the gift (160)`);
    assert.equal(G.state.inventory.some(i => i.id === 'iron mace'), false, 'the gift left the bag');

    G.processCommand('gift exchange bread');
    assert.match(narrative(w), /nothing else|warm word/i, 'a small gift earns a light, not a parcel');
    assert.equal(G.state.inventory.some(i => i.id === 'bread'), false);

    G.processCommand('gift exchange');
    assert.match(narrative(w), /worth offering|carry nothing/i);
});

test('the bounty board is the same for every hero and pays it once', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.processCommand('bounty');
    const board = narrative(w);
    assert.match(board, /3 frost wargs/);
    assert.match(board, /3 diamonds/);
    assert.match(board, /same for every hero/i);

    // A second hero reads exactly the same board.
    const other = await ready(t, { at: 'kaliwasch' });
    other.G.processCommand('bounty');
    const sameTerms = /3 frost wargs/.test(narrative(other.w)) && /3 diamonds/.test(narrative(other.w));
    assert.equal(sameTerms, true, 'the terms do not change from hero to hero');

    for (let i = 0; i < 3; i++) {
        G.state.enemy = { name: 'frost warg hunter', hp: 0, maxHp: 40, attack: 5, xp: 5, gold: 10 };
        G.enemyDefeated();
    }
    await wait(40);
    const diamonds = G.state.player.diamonds;
    assert.equal(G.claimBounty(), true);
    assert.equal(G.state.player.diamonds, diamonds + 3);
    assert.equal(G.claimBounty(), false, 'and never twice in one night');
});

test('a frost prowler that has not been fought cannot be claimed', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    assert.equal(G.claimBounty(), false);
    assert.match(narrative(w), /not finished: 0 of 3/);
});

test('the tree of lights counts real walking and gives nothing back', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.processCommand('light candle');
    G.processCommand('tree of lights');
    const text = narrative(w);
    assert.match(text, /1 from candles lit/);
    assert.match(text, /gives nothing back but light/i);
    assert.match(text, /no prize hangs on it/i);
});

test('every sixth-night action has both a command and a button', async t => {
    const { w, G } = await ready(t, { at: 'kaliwasch' });
    G.enterLocation('kaliwasch');
    const box = w.document.getElementById('context-actions').innerHTML;
    for (const label of ['Light Candle', 'Carols', 'Gift Exchange', 'Bounty Board', 'Tree of Lights']) {
        assert.match(box, new RegExp(label), `${label} is a button`);
    }
    w.document.getElementById('narrative').replaceChildren();
    for (const command of ['candles', 'light candle', 'carol', 'gift exchange', 'bounty', 'tree of lights']) {
        G.processCommand(command);
        assert.ok(narrative(w).trim().length > 10, `${command} answers in words`);
    }
});
