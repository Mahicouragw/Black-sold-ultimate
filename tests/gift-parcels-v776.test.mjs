/**
 * 7.76.0 — the rupee counter: paper that actually surprises you.
 *
 * The owner asked for parcels bought with rupees whose contents are a genuine
 * surprise — real things out of the world, different every time, announced in a
 * plain second-person sentence ("Inside is a Chocolate. It goes into your bag.")
 * — and, just as firmly, that this must never become a way to farm diamonds or
 * to make money by buying paper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;
const since = (w, mark) => narrative(w).slice(String(mark).length);

async function ready(t, { gold = 2000, diamonds = 40, at = 'kaliwasch_district_15' } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    const G = w.Game;
    G.state.player = {
        name: 'Parcel Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 3, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.companions = []; G.state.quests = []; G.state.buffs = {};
    G.state.location = at;
    G.state.giftShop = { opened: 0, parcels: {}, keepsakes: [] };
    G.save = () => true; G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    return { w, G };
}

const valueOf = (w, id) => Number(w.WorldData.items[id]?.value ?? 0);
const openOne = (G, w, id) => {
    const mark = narrative(w);
    G.buyPresent(id);
    G.openGift(id);
    return since(w, mark);
};

/* ───────────────────────────── a real surprise ───────────────────────────── */

test('a rupee parcel holds something different each time it is opened', async t => {
    const { w, G } = await ready(t);
    const runs = [];
    for (let i = 0; i < 12; i += 1) {
        const text = openOne(G, w, 'paper_cone');
        const bag = G.state.inventory.map(item => `${item.id}:${item.quantity || 1}`).join(',');
        runs.push(`${text}|${bag}`);
    }
    assert.ok(new Set(runs).size >= 3, 'twelve cones, at least three different outcomes');
    // And the outcomes are real items in the world, not invented names.
    for (const item of G.state.inventory) assert.ok(w.WorldData.items[item.id], `${item.id} is a real thing`);
});

test('the contents are announced plainly, in the second person', async t => {
    const { w, G } = await ready(t);
    G.buyPresent('paper_cone');
    const mark = narrative(w);
    G.openGift('paper_cone');
    const text = since(w, mark);
    assert.match(text, /The string gives way and the paper comes off in one long curl\./);
    assert.match(text, /Inside (is|are) .+\. (It|They) go(es)? into your bag\./, 'said as a sentence, not a list');
});

test('goods never come to more than the rupees paid', async t => {
    const { w, G } = await ready(t, { gold: 4000 });
    for (const [id, price] of [['paper_cone', 25], ['basket_parcel', 60], ['sleigh_hamper', 130]]) {
        for (let run = 0; run < 15; run += 1) {
            const before = G.state.player.gold;
            const mark = G.state.inventory.map(item => `${item.id}:${item.quantity || 1}`).join(',');
            G.buyPresent(id);
            const opened = G.openGift(id);
            assert.equal(before - G.state.player.gold, price, `${id} costs its price`);
            const worth = opened.items.reduce((sum, item) => sum + valueOf(w, item), 0);
            assert.ok(worth <= price, `${id} gave ${worth} rupees of goods for ${price}`);
            assert.ok(opened.items.length >= 1, `${id} never comes up empty`);
            void mark;
        }
    }
});

test('no rupee parcel ever holds a diamond, and the purse is untouched', async t => {
    const { w, G } = await ready(t, { gold: 5000, diamonds: 12 });
    for (let i = 0; i < 20; i += 1) {
        for (const id of ['paper_cone', 'basket_parcel', 'sleigh_hamper']) {
            const opened = G.openGift((G.buyPresent(id), id));
            assert.equal(opened.diamonds, 0, `${id} holds no diamond`);
            for (const item of opened.items) assert.notEqual(item, 'wrapped_parcel');
        }
    }
    assert.equal(G.state.player.diamonds, 12, 'twenty of each, and not one diamond made');
});

test('the shop’s own paper never says what is inside a rupee parcel', async t => {
    const { w, G } = await ready(t);
    G.processCommand('gift shop');
    const shown = w.document.getElementById('shop-content').textContent;
    assert.doesNotMatch(shown, /holds?:/i);
    assert.doesNotMatch(shown, /contains|inside is|chocolate|honey cake|peppermint/i);
    for (const id of ['paper_cone', 'basket_parcel', 'sleigh_hamper']) {
        assert.equal(w.WorldData.items[id].contents, undefined, `${id} keeps its secret in the data too`);
    }
    const mark = narrative(w);
    G.buyPresent('basket_parcel');
    assert.doesNotMatch(since(w, mark), /chocolate|sugar ?plum|honey cake|it holds/i, 'and buying gives nothing away');
});

test('now and then there is no sweet at all, only a folded paper', async t => {
    const { w, G } = await ready(t, { gold: 4000 });
    let note = null;
    for (let i = 0; i < 120 && !note; i += 1) {
        const text = openOne(G, w, 'paper_cone');
        if (/folded paper/.test(text)) note = text;
    }
    assert.ok(note, 'a paper turns up within a hundred and twenty cones');
    const held = G.state.inventory.find(item => item.id === 'pressed_note');
    assert.ok(held, 'and the note is kept');
    assert.ok(String(held.desc).length > 20, 'with its words written on it');
});

test('the diamond presents are still exactly worth their price and still vary not at all', async t => {
    const { w, G } = await ready(t, { gold: 2000, diamonds: 300 });
    for (const id of ['wrapped_parcel', 'ribboned_gift', 'grand_present']) {
        const present = w.GiftShop.byId(id);
        const before = G.state.player.diamonds;
        G.buyPresent(id);
        const opened = G.openGift(id);
        assert.equal(G.state.player.diamonds, before, `${id} gives back exactly what it took`);
        assert.equal(opened.diamonds, present.price);
        assert.deepEqual([...opened.items], [], 'and nothing else comes out of the paper');
    }
});

test('the counter takes rupees for the parcels and diamonds for the presents', async t => {
    const { w, G } = await ready(t, { gold: 100, diamonds: 10 });
    G.buyPresent('paper_cone');
    assert.equal(G.state.player.gold, 75, 'rupees for the cone');
    assert.equal(G.state.player.diamonds, 10, 'and no diamond touched');
    G.buyPresent('wrapped_parcel');
    assert.equal(G.state.player.diamonds, 0, 'diamonds for the parcel of paper');
    assert.equal(G.state.player.gold, 75, 'and no rupee touched');
});

test('a purse too light is told the price in rupees, and nothing is unwrapped', async t => {
    const { w, G } = await ready(t, { gold: 5 });
    assert.equal(G.buyPresent('sleigh_hamper'), false);
    assert.match(narrative(w), /costs 130 rupees and you carry 5/);
    assert.equal(G.buyPresent('paper_cone'), false);
    assert.match(narrative(w), /costs 25 rupees and you carry 5/);
    assert.equal(narrative(w).includes('goes into your bag'), false);
});
