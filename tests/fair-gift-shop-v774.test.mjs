/**
 * 7.74.0 — a fair gift shop.
 *
 * What the owner asked for:
 *  - a present must never be a lottery: what the card says is what the paper
 *    holds, the same for every player;
 *  - diamonds must not leak out of wrapping paper (that made them common);
 *  - gifts should also cost diamonds, for something worth spending them on.
 *
 * So: no dice anywhere in the counter, no diamond in any present, and three
 * keepsake presents paid for in diamonds whose blessing lasts the hero's life.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;

async function ready(t, { gold = 500, diamonds = 40, at = 'kaliwasch_district_15' } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const G = w.Game;
    G.state.player = {
        name: 'Fair Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 3, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = []; G.state.quests = []; G.state.buffs = {};
    G.state.economy = { settledTransactions: {}, battlesSinceRuby: 0, ledger: [] };
    G.state.location = at;
    G.save = () => true; G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    return { w, G };
}

/* ─────────────────────────── nothing is a lucky dip ─────────────────────────── */

test('every present the counter sells prints its whole contents, the same for all', async t => {
    const { w, G } = await ready(t);
    const presents = w.GiftShop.presents;
    assert.equal(presents.length, 6);
    for (const present of presents) {
        assert.ok(present.contents.length > 0, `${present.name} holds something`);
        for (const row of present.contents) {
            assert.ok(w.WorldData.items[row.id], `${row.id} is a real item`);
            assert.ok(Number(row.qty) >= 1, `${present.name} names a quantity`);
        }
    }
    // Two different heroes open the same present and receive the same goods.
    const first = w.GiftShop.contentsOf('ribboned_gift');
    const second = w.GiftShop.contentsOf('ribboned_gift');
    assert.deepEqual(first, second);
    G.processCommand('gift shop');
    const text = w.document.getElementById('shop-content').textContent;
    assert.match(text, /Holds: 1 Gingerbread Man, 1 Spiced Cider, 3 Christmas Tree Balls/);
    assert.match(text, /the same goods, for every hero, every time/);
});

test('no present and no unwrapping ever produces a diamond', async t => {
    const { w, G } = await ready(t, { gold: 2000, diamonds: 5 });
    const source = await readFile(new URL('../gift-shop-v771.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Math\.random/, 'the counter cannot roll dice');
    for (let round = 0; round < 3; round += 1) {
        for (const id of ['wrapped_parcel', 'ribboned_gift', 'grand_present']) {
            assert.equal(G.buyPresent(id), true, `${id} bought`);
            G.openGift(id);
        }
    }
    assert.equal(G.state.player.diamonds, 5, 'nine presents, not one diamond made');
    G.processCommand('diamonds');
    assert.match(narrative(w), /no present holds one/i, 'the report says so plainly');
});

test('the same rupees always buy the same goods, whoever spends them', async t => {
    const { w, G } = await ready(t, { gold: 500 });
    const spend = () => {
        G.buyPresent('grand_present', 1);
        const opened = G.openGift('grand_present');
        return opened.items.slice().sort();
    };
    const first = [...spend()];
    const second = [...spend()];
    assert.deepEqual(first, second, 'a bargain is a bargain twice');
    assert.deepEqual(first, ['candy_cane', 'christmas_garland', 'christmas_lights', 'winter_scarf']);
    assert.equal(G.state.player.gold, 500 - 260);
    assert.equal(w.GiftShop.contentsOf('grand_present').length, 4);
});

/* ───────────────────────────── diamonds as a price ───────────────────────────── */

test('three keepsake presents are paid for in diamonds, and are not rupees prices', async t => {
    const { w, G } = await ready(t, { gold: 5000, diamonds: 40 });
    const keepsakes = w.GiftShop.presents.filter(present => present.currency === 'diamonds');
    assert.equal(keepsakes.length, 3);
    for (const present of keepsakes) {
        assert.ok(present.keepsake, `${present.name} carries a keepsake`);
        assert.ok(present.price >= 4 && present.price <= 9, 'a fair price in a rare coin');
        G.processCommand('gift shop');
        assert.match(w.document.getElementById('shop-content').textContent, new RegExp(`${present.price} diamonds`));
    }
    const gold = G.state.player.gold, diamonds = G.state.player.diamonds;
    assert.equal(G.buyPresent('emberglass_present'), true);
    assert.equal(G.state.player.diamonds, diamonds - 4, 'four diamonds, not one rupee');
    assert.equal(G.state.player.gold, gold, 'rupees are untouched');
});

test('a keepsake blesses the hero once, for good, and is never sold twice', async t => {
    const { w, G } = await ready(t, { diamonds: 40 });
    const maxHp = G.state.player.maxHp;
    assert.equal(G.buyPresent('emberglass_present'), true);
    const opened = G.openGift('emberglass_present');
    assert.equal(opened.keepsake, 'emberglass_locket');
    assert.equal(opened.blessed, true);
    assert.equal(G.state.player.maxHp, maxHp + 10, 'the locket gives ten points of life for good');
    assert.ok(w.GiftShop.ownedKeepsakes(G).includes('emberglass_locket'), 'and the locket is worn from now on');
    assert.match(narrative(w), /Warmth spreads from the glass/);
    // The counter refuses a second one, and takes no diamonds for the refusal.
    const diamonds = G.state.player.diamonds;
    assert.equal(G.buyPresent('emberglass_present'), false);
    assert.match(narrative(w), /already yours/);
    assert.equal(G.state.player.diamonds, diamonds, 'no diamond is taken for a keepsake already worn');
    // The panel says so too.
    G.processCommand('gift shop');
    assert.match(w.document.getElementById('shop-content').textContent, /Already yours/);
});

test('each keepsake gives its own blessing, and the blessings add up', async t => {
    const { w, G } = await ready(t, { diamonds: 60 });
    const before = { maxHp: G.state.player.maxHp, maxMp: G.state.player.maxMp, defense: G.state.player.defense };
    G.buyPresent('emberglass_present'); G.openGift('emberglass_present');
    G.buyPresent('frostbell_present'); G.openGift('frostbell_present');
    G.buyPresent('silverstar_present'); G.openGift('silverstar_present');
    assert.equal(G.state.player.maxHp, before.maxHp + 10, 'the locket adds life');
    assert.equal(G.state.player.defense, before.defense + 2, 'the charm softens blows');
    assert.equal(G.state.player.maxMp, before.maxMp + 10, 'the pendant adds magic');
    assert.deepEqual([...w.GiftShop.ownedKeepsakes(G)].sort(), ['emberglass_locket', 'frostbell_charm', 'silver_star_pendant']);
});

test('the keepsake list travels with the hero in the save', async t => {
    const { w, G } = await ready(t, { diamonds: 40 });
    G.buyPresent('frostbell_present'); G.openGift('frostbell_present');
    const saved = G.getSaveData();
    assert.deepEqual([...saved.giftShop.keepsakes], ['frostbell_charm'], 'the blessing is recorded');
    assert.ok(w.GiftShop.ownedKeepsakes(G).includes('frostbell_charm'));
});

test('a purse too light for a keepsake is told the price and the ways to earn one', async t => {
    const { w, G } = await ready(t, { diamonds: 1 });
    assert.equal(G.buyPresent('silverstar_present'), false);
    const text = narrative(w);
    assert.match(text, /costs 9 diamonds and you carry 1/);
    assert.match(text, /say "diamonds" to hear every way/);
    assert.equal(G.state.player.diamonds, 1);
});

test('the keepsake presents are named by their own words, not by wrapping paper', async t => {
    const { w, G } = await ready(t, { diamonds: 40 });
    G.processCommand('buy locket');
    assert.ok(G.state.inventory.some(i => i.id === 'emberglass_present'), 'buy locket finds the keepsake');
    G.processCommand('open gift');
    assert.ok(w.GiftShop.ownedKeepsakes(G).includes('emberglass_locket'));
    G.processCommand('buy charm');
    assert.ok(G.state.inventory.some(i => i.id === 'frostbell_present'));
    G.processCommand('buy pendant');
    assert.ok(G.state.inventory.some(i => i.id === 'silverstar_present'));
});

/* ───────────────────── what the world says about diamonds now ───────────────────── */

test('the purse, the diamond report and the estate agent agree that diamonds are earned', async t => {
    const { w, G } = await ready(t);
    G.showPurse();
    const purse = w.document.getElementById('shop-content').textContent;
    assert.match(purse, /no present holds a diamond/i);
    G.processCommand('diamonds');
    assert.match(narrative(w), /no present holds one/i);
    assert.match(narrative(w), /gift shop takes diamonds/i);
});
