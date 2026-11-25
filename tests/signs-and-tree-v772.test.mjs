/**
 * 7.72.0 — signs, one shop, and the tree that asks for its dressing.
 *
 * What the owner asked for:
 *  - sixteen signs with their own lore, sold for diamonds in a single shop;
 *  - three signs bound into a weapon, armour or jewellery piece, renaming it
 *    and evolving it as the same trio is bound again;
 *  - particular trios that drain life back as HP and MP, and that spit a goblin
 *    out of the metal;
 *  - diamonds and signs as rare battle drops, each with a clear announcement;
 *  - an incense whose description says nothing of luck or of an hour;
 *  - Christmas decorations in the same shop, a daily tree task with exact
 *    quantities, a recorded chime for every piece hung and a fanfare when the
 *    tree is finished.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';

const narrative = w => w.document.getElementById('narrative').textContent;

async function ready(t, { iso = '2026-12-10T09:00:00Z', diamonds = 200, gold = 500 } = {}) {
    const runtime = await createRuntime();
    const w = runtime.window;
    t.after(() => runtime.dom.window.close());
    await wait(0);
    w.Date = class extends w.Date { constructor(...args) { super(...(args.length ? args : [iso])); } };
    const G = w.Game;
    G.state.player = {
        name: 'Sign Tester', hp: 100, maxHp: 100, mp: 40, maxMp: 40, gold, diamonds,
        level: 1, xp: 0, str: 10, dex: 10, int: 10, wis: 10, defense: 2,
        inventory: [], spells: [], weapon: 'rusty sword', weaponDamage: 8
    };
    G.state.sacred = { storage: [], groundLoot: [] };
    G.state.companions = [];
    G.state.quests = [];
    G.state.economy = { settledTransactions: {}, battlesSinceRuby: 0, ledger: [] };
    G.state.buffs = {};
    G.state.signs = { lastHp: null, goblin: 0 };
    G.state.location = 'kaliwasch';
    G.save = () => true;
    G.updateHUD = () => {};
    w.MusicSystem.playSFX = () => {};
    return { w, G };
}

const give = (w, G, id, quantity = 1) => {
    for (let n = 0; n < quantity; n += 1) G.addItemToInventory(id, { ...w.WorldData.items[id] });
};

/* ─────────────────────────────── the sixteen ─────────────────────────────── */

test('sixteen signs, each with its own name and its own lore', async t => {
    const { w } = await ready(t);
    const signs = w.Signs.catalogue;
    assert.equal(signs.length, 16);
    const names = signs.map(sign => sign.name);
    for (const wanted of ['Sign of Strength', 'Sign of Dexterity', 'Sign of Heaven', 'Sign of Earth', 'Sign of Fire',
        'Sign of Water', 'Sign of 4', 'Sign of Infinite', 'Sign of War', 'Sign of Magic', 'Sign of Hope',
        'Sign of Death', 'Sign of Grace', 'Sign of Health', 'Sign of Air', 'Sign of Dignity']) {
        assert.ok(names.includes(wanted), `${wanted} is one of the sixteen`);
    }
    const descriptions = signs.map(sign => sign.desc);
    assert.equal(new Set(descriptions).size, 16, 'no two signs share a description');
    for (const sign of signs) {
        assert.ok(sign.desc.length > 60, `${sign.name} has lore of its own`);
        assert.equal(w.WorldData.items[`sign_${sign.key}`].name, sign.name, 'the item is the sign');
    }
});

test('signs are priced in diamonds in one shop, beside the Christmas decorations', async t => {
    const { w, G } = await ready(t);
    G.state.location = 'arcane_enchantery';
    G.showRuneShop();
    const text = w.document.getElementById('shop-content').textContent;
    assert.match(text, /The Rune Shop/);
    for (const sign of w.Signs.catalogue) assert.ok(text.includes(sign.name), `${sign.name} is on the one counter`);
    assert.match(text, new RegExp(`${w.Signs.catalogue[0].price} diamonds`), 'signs cost diamonds');
    const sections = new Set(w.SignShop.stock.map(entry => entry.section));
    assert.ok(sections.has('Signs'), 'signs are sold');
    assert.ok(sections.has('Christmas decorations'), 'decorations share the same counter');
    const diamondShelf = w.SignShop.stock.filter(entry => entry.currency === 'diamonds').map(entry => entry.id);
    assert.equal(diamondShelf.length, 17, 'the sixteen signs and the incense ask for diamonds');
    assert.ok(diamondShelf.includes('incense'), 'the incense is diamond money too');
    for (const entry of w.SignShop.stock) {
        assert.equal(entry.stage, undefined, 'there are no shop stages');
        assert.equal(entry.tier, undefined, 'there are no tiers');
    }
});

test('buying a sign spends diamonds and not one rupee', async t => {
    const { w, G } = await ready(t);
    G.state.location = 'arcane_enchantery';
    const gold = G.state.player.gold, diamonds = G.state.player.diamonds;
    assert.equal(G.buyRuneShopItem('sign_infinite'), true);
    assert.equal(G.state.player.diamonds, diamonds - 22, 'twenty-two diamonds left the purse');
    assert.equal(G.state.player.gold, gold, 'gold is untouched: signs are bought with diamonds');
    assert.ok(G.state.inventory.some(item => item.id === 'sign_infinite'), 'the sign is in the bag');
    assert.match(narrative(w), /Sign of Infinite for 22 diamonds/);
});

test('a short purse is told the price and where diamonds are found', async t => {
    const { w, G } = await ready(t, { diamonds: 3 });
    G.state.location = 'arcane_enchantery';
    assert.equal(G.buyRuneShopItem('sign_infinite'), false);
    assert.match(narrative(w), /costs 22 diamonds and you carry 3/);
    assert.equal(G.state.player.diamonds, 3, 'nothing was taken');
});

/* ──────────────────────────────── the forge ──────────────────────────────── */

const sword = (G, extra = {}) => {
    const item = { id: 'iron_mace', name: 'Iron Mace', type: 'weapon', quantity: 1, minDamage: 6, maxDamage: 9, ...extra };
    G.state.inventory.push(item);
    G.state.player.weapon = item.name;
    return item;
};
const stackSigns = (w, G, keys) => {
    for (const key of keys) G.addItemToInventory(`sign_${key}`, { ...w.WorldData.items[`sign_${key}`] });
};

test('a weapon needs exactly three signs, no more and no fewer', async t => {
    const { w, G } = await ready(t);
    const mace = sword(G);
    stackSigns(w, G, ['fire', 'magic']);
    assert.equal(G.enchantWithSigns('iron mace', ['fire', 'magic']), false);
    assert.match(narrative(w), /Three signs are bound at a time/);
    assert.equal(mace.name, 'Iron Mace', 'a refused binding changes nothing');
    assert.equal(w.Signs.countSign(G, 'fire'), 1, 'a refused binding spends nothing');
});

test('a binding needs the signs in the bag, not merely named', async t => {
    const { w, G } = await ready(t);
    sword(G);
    stackSigns(w, G, ['fire']);
    assert.equal(G.enchantWithSigns('iron mace', ['fire', 'magic', 'hope']), false);
    assert.match(narrative(w), /needs 1 Sign of Magic and you carry 0/);
});

test('three signs name the item, and the same three again evolve it to rank three', async t => {
    const { w, G } = await ready(t);
    const mace = sword(G);
    for (let round = 1; round <= 3; round += 1) {
        stackSigns(w, G, ['fire', 'magic', 'hope']);
        assert.equal(G.enchantWithSigns('iron mace', ['fire', 'magic', 'hope']), true, `binding ${round} succeeds`);
        assert.equal(mace.signEnchant.rank, round);
        if (round === 1) assert.equal(mace.name, 'Hearthfire of Hope');
        if (round === 2) assert.equal(mace.name, 'Exalted Hearthfire of Hope');
        if (round === 3) assert.equal(mace.name, 'Ascended Hearthfire of Hope');
    }
    assert.equal(G.state.player.weapon, mace.name, 'the equipped weapon answers to its new name');
    assert.equal(mace.enchantments['Sign of Fire'], 3);
    assert.match(narrative(w), /evolved/);
    // A fourth binding of the same trio is refused, and the signs stay.
    stackSigns(w, G, ['fire', 'magic', 'hope']);
    assert.equal(G.enchantWithSigns('iron mace', ['fire', 'magic', 'hope']), false);
    assert.equal(w.Signs.countSign(G, 'fire'), 1, 'the last rank is not bought twice');
});

test('binding a different trio re-forges the item, without stacking bonuses', async t => {
    const { w, G } = await ready(t);
    const mace = sword(G);
    stackSigns(w, G, ['fire', 'magic', 'hope']);
    G.enchantWithSigns('iron mace', ['fire', 'magic', 'hope']);
    const fire = mace.fireDamage;
    assert.ok(fire > 0, 'fire damage was written onto the mace');
    stackSigns(w, G, ['water', 'earth', 'heaven']);
    assert.equal(G.enchantWithSigns('iron mace', ['water', 'earth', 'heaven']), true);
    assert.equal(mace.name, 'Tide of the High Garden', 'the re-forged trio names it');
    assert.equal(mace.signEnchant.rank, 1, 'a re-forge starts at the first rank');
    assert.equal(mace.fireDamage, 0, 'the old work is scraped away');
    assert.ok(mace.defense > 0, 'the new work is written on');
    assert.match(narrative(w), /scraped away/);
});

test('armour and jewellery take signs as readily as a weapon', async t => {
    const { w, G } = await ready(t);
    G.state.inventory.push({ id: 'leather_armor', name: 'Leather Armor', type: 'armor', quantity: 1, defense: 3 });
    G.state.inventory.push({ id: 'silver_ring', name: 'Silver Ring', type: 'accessory', quantity: 1 });
    stackSigns(w, G, ['health', 'grace', 'dignity', 'health', 'grace', 'dignity']);
    assert.equal(G.enchantWithSigns('leather armor', ['health', 'grace', 'dignity']), true);
    assert.equal(G.enchantWithSigns('silver ring', ['health', 'grace', 'dignity']), true);
    const armour = G.state.inventory.find(item => item.id === 'leather_armor');
    const ring = G.state.inventory.find(item => item.id === 'silver_ring');
    assert.equal(armour.signEnchant.rank, 1);
    assert.equal(ring.signEnchant.rank, 1);
    assert.ok(armour.hp > 0 && ring.hp > 0, 'the sign of health gives both pieces health');
    assert.equal(G.state.inventory.some(item => item.type === 'sign'), false, 'six signs were spent');
});

test('death drains, water adds magic to the drain, and a goblin needs death, magic and infinite', async t => {
    const { w } = await ready(t);
    const powers = (keys, type = 'weapon') => w.Signs.powersOf(keys, { type }).join(', ');
    assert.equal(powers(['death', 'fire', 'hope']), 'drain');
    assert.equal(powers(['death', 'water', 'hope']), 'drain, drainMana');
    assert.equal(powers(['death', 'infinite', 'magic']), 'drain, drainMana, summon');
    assert.equal(powers(['death', 'infinite', 'magic'], 'armor'), 'drain, drainMana', 'only a weapon spits out a goblin');
    assert.equal(powers(['fire', 'hope', 'magic']), '', 'no death, no draining');
});

/* ──────────────────────────────── combat ──────────────────────────────── */

test('a death-bound blade drinks life and returns it as HP and MP', async t => {
    const { w, G } = await ready(t);
    const mace = sword(G, { signEnchant: { signs: ['death', 'infinite', 'magic'], rank: 1, powers: ['drain', 'drainMana', 'summon'] } });
    G.state.inCombat = true;
    G.state.enemy = { name: 'frost wolf', hp: 70, maxHp: 100, defense: 0 };
    G.state.player.hp = 40; G.state.player.mp = 5;
    G.state.signs = { lastHp: 100, goblin: 0 };
    const bites = [];
    G.applyEnemyDamage = amount => { bites.push(amount); G.state.enemy.hp -= amount; return amount; };
    w.Signs.enchantTurn(G);
    // 30 damage was dealt: 15% comes back as health, 8% as magic.
    assert.equal(G.state.player.hp, 45, 'five points of drained life return as health');
    assert.equal(G.state.player.mp, 7, 'two points of it return as magic');
    assert.match(narrative(w), new RegExp(`${mace.name} drinks 30 life from frost wolf`));
    // The graveborn trio also lets a goblin out of the metal, and it bites once.
    assert.equal(G.state.signs.goblin, 2, 'the goblin has two bites left');
    assert.equal(bites.length, 1);
    assert.match(narrative(w), /summoned goblin bites frost wolf/);
    w.Signs.enchantTurn(G);
    assert.equal(bites.length, 2, 'the goblin bites again on the next turn');
    assert.equal(G.state.signs.goblin, 1, 'the goblin spends a bite each turn');
    assert.equal((narrative(w).match(/spits out a goblin/g) || []).length, 1, 'only one goblin is ever conjured in a fight');
    w.Signs.enchantTurn(G);
    assert.match(narrative(w), /folds back into the metal/);
    assert.equal(G.state.signs.goblin, 0);
    G.state.inCombat = false;
});

test('a blade with no death sign drains nothing', async t => {
    const { G, w } = await ready(t);
    sword(G, { signEnchant: { signs: ['fire', 'magic', 'hope'], rank: 1, powers: [] } });
    G.state.inCombat = true;
    G.state.enemy = { name: 'frost wolf', hp: 50, maxHp: 100 };
    G.state.player.hp = 40; G.state.player.mp = 5;
    G.state.signs = { lastHp: 100, goblin: 0 };
    G.applyEnemyDamage = () => 0;
    w.Signs.enchantTurn(G);
    assert.equal(G.state.player.hp, 40);
    assert.equal(G.state.player.mp, 5);
});

/* ─────────────────────────── rare drops and news ─────────────────────────── */

const summaryOf = (name = 'goblin', overrides = {}) => ({
    id: `battle-${Math.random().toString(36).slice(2)}`,
    gold: 20, xp: 15, defeated: [name], drops: [],
    enemyRecords: [{ name, hp: 30, maxHp: 30, xp: 15, boss: false, elite: false }],
    ...overrides
});

test('signs fall from battles only rarely, and every one is announced', async t => {
    const { w, G } = await ready(t);
    const always = () => 0;
    const result = w.RewardEconomy.settleBattle(G, summaryOf(), always);
    assert.ok(result.sign, 'a rare sign was found');
    const sign = w.Signs.byKey.get(result.sign);
    assert.ok(G.state.inventory.some(item => item.id === `sign_${result.sign}`), 'the sign is in the bag');
    assert.match(narrative(w), new RegExp(`Rare find: a ${sign.name}`), 'the find is announced plainly');
    assert.match(w.RewardEconomy.describe(result), new RegExp(`Rare find: ${sign.name}`), 'the reward line names it too');

    const never = () => 0.999;
    const none = w.RewardEconomy.settleBattle(G, summaryOf(), never);
    assert.equal(none.sign, undefined, 'an ordinary victory leaves no sign behind');
    for (const [tier, odds] of Object.entries(w.Signs.signOdds)) {
        assert.ok(odds < 0.3, `a ${tier} victory almost never leaves a sign behind (${odds})`);
    }
    assert.ok(w.Signs.signOdds.common < 0.01, 'an ordinary monster practically never carries a sign');
});

test('a diamond among the spoils is announced, and a settled battle is never settled twice', async t => {
    const { w, G } = await ready(t);
    const boss = summaryOf('ogre king', {
        gold: 120, xp: 300, defeated: ['ogre king'],
        enemyRecords: [{ name: 'ogre king', hp: 400, maxHp: 400, xp: 300, boss: true }]
    });
    const result = w.RewardEconomy.settleBattle(G, boss, () => 0);
    assert.equal(result.premium.diamond, 1, 'the boss left a diamond');
    assert.match(narrative(w), /A diamond glints among the spoils/);
    const again = w.RewardEconomy.settleBattle(G, boss, () => 0);
    assert.equal(again.duplicate, true, 'the same battle cannot pay twice');
});

test('incense sweetens the odds, and its description gives nothing away', async t => {
    const { w, G } = await ready(t);
    const item = w.WorldData.items.incense;
    assert.doesNotMatch(item.desc, /luck/i, 'the description never names luck');
    assert.doesNotMatch(item.desc, /\bhour\b|\b60 minutes\b/i, 'the description never names the duration');
    assert.equal(G.luckBonus(), 0, 'no smoke, no luck');
    give(w, G, 'incense');
    assert.equal(G.useItem('incense'), true);
    assert.equal(G.luckBonus(), 0.25, 'the smoke is doing something');
    assert.equal(w.Signs.luck(G), 0.25, 'the shop and the present counter read the same luck');
    assert.equal(G.state.inventory.some(i => i.id === 'incense'), false, 'the twist of incense was burned');
    G.incenseStatus();
    assert.match(narrative(w), /still burning/);
    // The buff thins out on its own.
    G.state.buffs.incenseUntil = Date.now() - 1;
    assert.equal(G.luckBonus(), 0);
});

/* ───────────────────────────── the Christmas tree ───────────────────────────── */

test('the tree asks for thirty balls and a changing run of lights', async t => {
    const { w } = await ready(t);
    const tonight = w.ChristmasTree.tonight();
    assert.equal(tonight.need.balls, 30, 'thirty balls, always');
    assert.ok([10, 20, 50].includes(tonight.need.lights), 'the lights come in tens, twenties or fifties');
    assert.ok(tonight.need.garland > 0 && tonight.need.bells > 0, 'garland and bells are asked for too');
    assert.equal(tonight.key, '2026-12-10');
});

test('every decoration is sold in the same one shop as the signs', async t => {
    const { w, G } = await ready(t);
    for (const item of w.ChristmasTree.decor) {
        assert.ok(w.WorldData.items[item.id], `${item.name} exists as an item`);
        assert.ok(item.desc.length > 40, `${item.name} has a description of its own`);
        assert.equal(w.SignShop.stock.find(entry => entry.id === item.id)?.currency, 'rupees');
    }
    G.state.location = 'arcane_enchantery';
    G.showRuneShop();
    const text = w.document.getElementById('shop-content').textContent;
    assert.match(text, /Christmas Tree Ball/);
    assert.match(text, /Christmas Lights/);
    assert.match(text, /Sign of Fire/, 'signs and decorations are on the one counter');
});

test('the tree hangs what you carry, rings a bell each time, and answers with a fanfare', async t => {
    const { w, G } = await ready(t);
    w.StarlightFair.sync(G);
    G.state.location = 'starlight_city_4_2';
    const played = [];
    w.MusicSystem.playSFX = name => played.push(name);
    for (const [id, n] of [['christmas_tree_ball', 30], ['christmas_lights', 50], ['christmas_garland', 10], ['christmas_bell', 5]]) give(w, G, id, n);
    const diamonds = G.state.player.diamonds;

    assert.equal(G.useChristmasTree(), true);
    const text = narrative(w);
    assert.match(text, /finished for tonight|the whole tree answers/);
    assert.equal(w.ChristmasTree.complete(G), true, 'the tree is dressed');
    assert.equal(G.state.christmasTree.done, true);
    assert.equal(played.filter(name => name === 'ladder-up').length, 4, 'a recorded bell for every kind hung');
    assert.equal(played.at(-1), 'game-win', 'the finished tree is a victory, with its own recording');
    assert.equal(G.state.player.diamonds, diamonds + 2, 'the tree leaves two diamonds among the branches');
    assert.ok(G.state.inventory.some(item => item.id === 'gingerbread'), 'and a warm gingerbread man');
    assert.ok(G.state.inventory.some(item => item.id === 'spiced_cider'), 'with a cup of cider');
    assert.equal(G.state.inventory.some(item => item.id === 'wrapped_parcel'), false, 'the tree wraps no shop paper');
    assert.equal(G.state.christmasTree.nights, 1);
    // The whole stock was used: nothing is left in the bag.
    for (const item of w.ChristmasTree.decor) {
        assert.equal(G.state.inventory.filter(i => i.id === item.id).length, 0, `${item.name} went onto the tree`);
    }
    // A finished tree cannot be dressed again the same night.
    give(w, G, 'christmas_tree_ball');
    assert.equal(G.placeChristmasDecoration('balls'), false);
    assert.match(narrative(w), /already finished for tonight/);
});

test('a bare bag is told exactly what the tree still wants', async t => {
    const { w, G } = await ready(t);
    w.StarlightFair.sync(G);
    G.state.location = 'starlight_city_4_2';
    assert.equal(G.useChristmasTree(), false);
    const text = narrative(w);
    assert.match(text, /30 christmas tree balls/);
    assert.match(text, new RegExp(`${w.ChristmasTree.tonight().need.lights} christmas lights`));
    assert.match(text, /rune shop sells every piece/);
});

test('the tree is not dressed from another room, nor outside the season', async t => {
    const { w, G } = await ready(t);
    w.StarlightFair.sync(G);
    G.state.location = 'kaliwasch';
    give(w, G, 'christmas_tree_ball', 40);
    assert.equal(G.placeChristmasDecoration('balls'), false);
    assert.match(narrative(w), /Grand Christmas Tree stands on the top row/);
    G.state.location = 'starlight_city_4_2';
    assert.equal(w.ChristmasTree.season(new w.Date('2026-06-10T09:00:00Z')), false, 'no tree in June');
});

test('the tree speaks for itself on arrival and from the Christmas map', async t => {
    const { w, G } = await ready(t);
    w.StarlightFair.sync(G);
    G.state.location = 'starlight_square';
    G.enterLocation('starlight_city_4_2');
    assert.match(narrative(w), /christmas tree/i, 'arriving at the tree explains the dressing');
    G.processCommand('christmas tree');
    assert.match(narrative(w), /Tonight it asks for 30 christmas tree balls/);
    assert.match(narrative(w), /still to hang/);
});

/* ──────────────────────────────── the seasons ──────────────────────────────── */

test('the rune shop is at the enchantery and on Bell Court, and nowhere else', async t => {
    const { w, G } = await ready(t);
    assert.deepEqual([...w.Signs.shopLocations].sort(), ['arcane_enchantery', 'starlight_square']);
    G.state.location = 'ironspire';
    G.showRuneShop();
    assert.match(w.document.getElementById('shop-content').textContent, /Five-Runes Enchantery/);
    G.state.location = 'arcane_enchantery';
    G.showRuneShop();
    assert.match(w.document.getElementById('shop-content').textContent, /The Rune Shop/);
});
