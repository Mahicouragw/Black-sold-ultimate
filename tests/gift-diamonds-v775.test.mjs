/**
 * 7.75.0 — presents are bought with diamonds, worth what they cost, and can be
 * given to another hero.
 *
 * The owner's rules:
 *  - a gift is paid for in diamonds, and it is worth exactly what was paid:
 *    ten in, ten in the paper; twenty-five in, twenty-five; fifty in, fifty;
 *  - a hero can buy a present and give it to another hero, who unwraps it;
 *  - nothing in the game says what a present holds. The player finds out by
 *    opening one, or by being handed one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;
/** Only the words added since the marker, so an earlier line cannot leak in. */
const since = (w, marker) => narrative(w).slice(String(marker).length);
const panelText = w => w.document.getElementById('shop-content').textContent;

async function ready(t, { diamonds = 200, gold = 500, at = 'kaliwasch_district_15', iso = '2026-12-28T10:00:00Z' } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [iso])); } };
    const G = w.Game;
    G.state.player = {
        name: 'Parcel Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 3, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = []; G.state.quests = []; G.state.buffs = {};
    G.state.economy = { settledTransactions: {}, battlesSinceRuby: 0, ledger: [] };
    G.state.location = at;
    G.state.giftShop = { opened: 0, parcels: {}, keepsakes: [] };
    G.save = () => true; G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    return { w, G };
}

const carried = (G, id) => G.state.inventory.filter(i => i.id === id).reduce((n, i) => n + (i.quantity || 0), 0);

/* ─────────────────────────── the counter, in diamonds ─────────────────────────── */

test('the counter sells three presents and every one of them costs diamonds', async t => {
    const { w, G } = await ready(t);
    const sold = w.GiftShop.sold;
    assert.equal(sold.length, 3);
    assert.deepEqual([...sold].map(p => p.price), [10, 25, 50], 'ten, twenty-five, fifty');
    for (const present of sold) {
        assert.equal(present.currency, 'diamonds', `${present.name} is paid for in diamonds`);
        assert.equal(present.diamonds, present.price, `${present.name} is worth what it costs`);
    }
    G.processCommand('gift shop');
    const text = panelText(w);
    for (const present of sold) {
        assert.ok(text.includes(present.name), `${present.name} is on the counter`);
        assert.match(text, new RegExp(`${present.price} diamonds`), `${present.name} shows its price`);
    }
    assert.doesNotMatch(text, /rupee/i, 'no rupee price is left on the counter');
});

test('a present is worth exactly its price: ten in, ten out', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    assert.equal(G.buyPresent('wrapped_parcel'), true);
    assert.equal(G.state.player.diamonds, 90, 'ten diamonds left the purse');
    const opened = G.openGift('wrapped_parcel');
    assert.equal(opened.diamonds, 10);
    assert.equal(G.state.player.diamonds, 100, 'and ten came back out of the paper');
});

test('no run of buying and unwrapping can ever grow a purse', async t => {
    const { w, G } = await ready(t, { diamonds: 500 });
    for (let i = 0; i < 8; i += 1) {
        for (const id of ['wrapped_parcel', 'ribboned_gift', 'grand_present']) {
            assert.equal(G.buyPresent(id), true);
            G.openGift(id);
            assert.equal(G.state.player.diamonds, 500, 'the purse is exactly where it started');
        }
    }
    // And there is no dice in the file at all: nothing here is a lottery.
    const source = await readFile(new URL('../gift-shop-v771.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Math\.random/);
});

test('a purse too light for a present is told the price in diamonds and left alone', async t => {
    const { w, G } = await ready(t, { diamonds: 3 });
    assert.equal(G.buyPresent('grand_present'), false);
    assert.match(narrative(w), /costs 50 diamonds and you carry 3/);
    assert.equal(G.state.player.diamonds, 3);
    assert.equal(carried(G, 'grand_present'), 0);
});

/* ───────────────────── nothing tells the player what it holds ───────────────────── */

test('no card, no message and no item ever says what a present holds', async t => {
    const { w, G } = await ready(t);
    G.processCommand('gift shop');
    const shown = panelText(w);
    assert.doesNotMatch(shown, /holds?:/i, 'no card prints its contents');
    assert.doesNotMatch(shown, /contains|inside is|worth \d+ diamonds to you/i);
    assert.doesNotMatch(shown, /keepsake|locket|charm|pendant/i, 'and no card names the jewellery');
    for (const present of w.GiftShop.presents) {
        assert.equal(w.WorldData.items[present.id].contents, undefined, 'the item data keeps the secret too');
    }

    G.buyPresent('wrapped_parcel');
    let mark = narrative(w);
    const bought = since(w, mark);
    assert.doesNotMatch(bought, /10 diamonds inside|it holds|contains/i, 'buying never says what is inside');
    G.openGift('wrapped_parcel');
    const opened = since(w, mark);
    assert.doesNotMatch(opened, /diamond/i, 'unwrapping never says the word');
    assert.doesNotMatch(opened, /\b10\b|\b25\b|\b50\b/, 'and never a count');
});

test('the shopkeeper will not be drawn on what is in the paper', async t => {
    const { w, G } = await ready(t);
    G.processCommand('gift shop directions');
    const words = narrative(w);
    assert.match(words, /Wrapped Parcel is open beside you/i);
    assert.doesNotMatch(words, /holds|contains|diamonds (are|is) (inside|in the)/i);
    G.state.location = 'forest';
    G.processCommand('gift shop');
    assert.match(panelText(w), /Wrapped Parcel is not here/i);
});

/* ───────────────────── what is under the paper is a surprise ───────────────────── */

test('the first unwrap of each kind leaves something the paper never mentioned', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    const maxHp = G.state.player.maxHp;
    G.buyPresent('wrapped_parcel');
    const first = G.openGift('wrapped_parcel');
    assert.equal(first.blessed, true);
    assert.equal(G.state.player.maxHp, maxHp + 10, 'the first parcel keeps something warm');
    assert.match(narrative(w), /Warmth spreads from the glass/);

    G.buyPresent('wrapped_parcel');
    const second = G.openGift('wrapped_parcel');
    assert.equal(second.blessed, false, 'and it is never given twice');
    assert.equal(G.state.player.maxHp, maxHp + 10, 'the blessing does not stack');
    assert.deepEqual([...w.GiftShop.ownedKeepsakes(G)], ['emberglass_locket']);
});

test('each kind of present keeps a different piece, and the three add up', async t => {
    const { w, G } = await ready(t, { diamonds: 400 });
    const before = { maxHp: G.state.player.maxHp, maxMp: G.state.player.maxMp, defense: G.state.player.defense };
    for (const id of ['wrapped_parcel', 'ribboned_gift', 'grand_present']) {
        G.buyPresent(id); G.openGift(id);
    }
    assert.equal(G.state.player.maxHp, before.maxHp + 10);
    assert.equal(G.state.player.defense, before.defense + 2);
    assert.equal(G.state.player.maxMp, before.maxMp + 10);
    assert.deepEqual([...w.GiftShop.ownedKeepsakes(G)].sort(), ['emberglass_locket', 'frostbell_charm', 'silver_star_pendant']);
    // The three are carried by a hero across a save.
    assert.deepEqual([...G.getSaveData().giftShop.keepsakes].sort(), ['emberglass_locket', 'frostbell_charm', 'silver_star_pendant']);
    assert.ok(w.GiftShop.ownedKeepsakes(G).length === 3);
});

/* ──────────────────────── giving a present to another hero ──────────────────────── */

test('a hero can give a present to another hero, and it leaves the bag', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    const calls = [];
    w.OnlineSystem.ready = true;
    w.OnlineSystem.user = { id: 'hero-a' };
    w.OnlineSystem.client = {
        rpc: async (name, args) => { calls.push({ name, args }); return { data: 'offer-1', error: null }; }
    };
    G.buyPresent('ribboned_gift');
    assert.equal(await G.giveGift('Raven'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'create_trade_offer');
    assert.equal(calls[0].args.target_hero, 'Raven');
    assert.deepEqual([...calls[0].args.offered].map(i => i.id), ['ribboned_gift'], 'the sealed box is what travels');
    assert.equal(calls[0].args.gold_offered, 0, 'nothing is asked in return');
    assert.equal(carried(G, 'ribboned_gift'), 0, 'the present left the bag');
    assert.match(narrative(w), /goes out along the road to Raven/);
});

test('the gift command reads the hero and the parcel', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    const sent = [];
    w.OnlineSystem.ready = true;
    w.OnlineSystem.user = { id: 'hero-a' };
    w.OnlineSystem.client = { rpc: async (name, args) => { sent.push(args); return { data: 'offer-2', error: null }; } };

    G.processCommand('gift');
    assert.match(narrative(w), /You carry no present to give/i, 'with empty hands it says so');

    G.buyPresent('wrapped_parcel');
    G.processCommand('gift parcel to Raven');
    await wait(0); await wait(0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].target_hero, 'raven', 'the hero is read from the sentence');
    assert.deepEqual([...sent[0].offered].map(i => i.id), ['wrapped_parcel']);
    assert.equal(carried(G, 'wrapped_parcel'), 0);
});

test('a present cannot be posted while the world is offline, and it stays in the bag', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    w.OnlineSystem.ready = false;
    G.buyPresent('wrapped_parcel');
    assert.equal(await G.giveGift('Raven'), false);
    assert.match(narrative(w), /road is closed just now/i);
    assert.equal(carried(G, 'wrapped_parcel'), 1, 'the parcel is still yours');
});

test('a failed posting keeps the present and says nothing raw', async t => {
    const { w, G } = await ready(t, { diamonds: 100 });
    w.OnlineSystem.ready = true;
    w.OnlineSystem.user = { id: 'hero-a' };
    w.OnlineSystem.client = { rpc: async () => ({ data: null, error: { message: 'No hero found with that name' } }) };
    G.buyPresent('wrapped_parcel');
    assert.equal(await G.giveGift('Nobody'), false);
    assert.match(narrative(w), /No hero of that name walks the world/);
    assert.equal(carried(G, 'wrapped_parcel'), 1);
});

/* ───────────────────── Crier Bell’s own paper keeps no diamonds ───────────────────── */

test('the crier wraps his own parcels, and they hold Christmas things only', async t => {
    const { w, G } = await ready(t, { diamonds: 40 });
    const crier = w.GiftShop.presents.find(p => p.id === 'criers_parcel');
    assert.equal(crier.sold, false, 'his paper is not for sale on the counter');
    assert.equal(crier.diamonds, 0);
    assert.equal(G.buyPresent('criers_parcel'), false, 'the counter will not sell it');

    G.addItemToInventory('criers_parcel', { ...w.WorldData.items.criers_parcel });
    const opened = G.openGift('criers_parcel');
    assert.equal(opened.diamonds, 0, 'nothing that spends comes out of his paper');
    assert.equal(G.state.player.diamonds, 40);
    assert.ok(G.state.inventory.some(i => i.id === 'gingerbread'));
});

test('a hero who hands the crier a gift is handed something worth less than the gift', async t => {
    const { w, G } = await ready(t, { diamonds: 40 });
    G.state.location = 'kaliwasch';
    G.addItemToInventory('iron mace', { id: 'iron mace', name: 'Iron Mace', type: 'weapon', value: 220 });
    G.processCommand('gift exchange iron mace');
    assert.match(narrative(w), /Crier’s Hamper/);
    assert.ok(G.state.inventory.some(i => i.id === 'criers_hamper'));
    const hamper = w.WorldData.items.criers_hamper;
    assert.ok(Number(hamper.value) < 220, 'the exchange never pays more than it takes');
    assert.equal(w.GiftShop.sold.some(p => p.id === 'criers_hamper'), false);
});

/* ───────────────────────────── the purse and the report ───────────────────────────── */

test('the diamond report lists earned sources and never mentions paper', async t => {
    const { w, G } = await ready(t, { diamonds: 7 });
    G.processCommand('diamonds');
    const text = narrative(w);
    assert.match(text, /Diamonds in your purse: 7/);
    assert.match(text, /fallen monsters and bosses/i);
    assert.match(text, /bounty board/i);
    assert.doesNotMatch(text, /present holds|unwrapp?ed|paper keeps/i, 'the report keeps the shop’s secret');
    assert.match(text, /nobody anywhere sells a diamond for money/i);
});
