/**
 * 7.74.0 — The Wrapped Parcel, the gift shop of the four cities, made fair.
 *
 * The owner asked for one thing above all: fairness. A present must never be a
 * lottery. Paper no longer hides diamonds at all — a present holds exactly the
 * goods printed on its card, the same goods for every player in the world, every
 * time it is opened. Two heroes who spend the same rupees walk away with the
 * same things, and nobody can farm the rarest currency by buying wrapping paper.
 *
 * Diamonds are still spent here, never made here: three keepsake presents are
 * priced in diamonds, and each holds a piece of jewellery whose blessing lasts
 * for the life of the hero. They are sold once per hero — the counter refuses to
 * sell a second locket to someone who already wears one.
 *
 * Every diamond the world hands out comes from a fight, the arena, the Christmas
 * doors, the tree on the Christmas map, or the Twelfth Night bounty board — all
 * of them earned the same way by everyone.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData) return;

    const TRINKETS = {
        candy_cane: { id: 'candy_cane', name: 'Candy Cane', type: 'food', effect: 'heal', power: 10, value: 5, desc: 'A crook of hard peppermint. Eat it to restore a little health.' },
        gingerbread: { id: 'gingerbread', name: 'Gingerbread Man', type: 'food', effect: 'heal', power: 15, value: 8, desc: 'Still warm from an oven somewhere. Eat it to restore health.' },
        spiced_cider: { id: 'spiced_cider', name: 'Spiced Cider', type: 'food', effect: 'both', power: 12, value: 9, desc: 'A clay cup of hot cider with a cinnamon stick. Restores health and magic.' },
        winter_scarf: { id: 'winter_scarf', name: 'Winter Scarf', type: 'trinket', value: 12, desc: 'A long scarf in two bright colours, knitted by somebody patient. It keeps the wind off, and nothing more.' }
    };

    /**
     * The diamond keepsakes. A blessing is written onto the hero once, for good,
     * so a keepsake is never a repeat purchase and never a gamble.
     */
    const KEEPSAKES = {
        emberglass_locket: {
            id: 'emberglass_locket', name: 'Emberglass Locket', type: 'trinket', value: 40,
            blessing: { hp: 10 }, blessLine: 'Warmth spreads from the glass and settles in your chest.',
            desc: 'A thumb-sized pane of red glass in a brass frame, warm as a coal even in snow. Worn over the heart it lends ten points of life that never fade.'
        },
        frostbell_charm: {
            id: 'frostbell_charm', name: 'Frostbell Charm', type: 'trinket', value: 50,
            blessing: { defense: 2 }, blessLine: 'The little bell rings once, and the air around you thickens.',
            desc: 'A silver bell no larger than a fingernail, filled with frost that never melts. It rings when a blow is coming, and the blow lands softer.'
        },
        silver_star_pendant: {
            id: 'silver_star_pendant', name: 'Silver Star Pendant', type: 'trinket', value: 60,
            blessing: { mp: 10 }, blessLine: 'A cold clear light runs down your arms; magic sits nearer the surface.',
            desc: 'A six-pointed star of hammered silver on a fine chain, cut from the same sheet as the Grand Christmas Tree’s star. Ten points of magic live in it.'
        }
    };

    const DECORATION_NAMES = {
        christmas_tree_ball: 'Christmas Tree Ball', christmas_lights: 'Christmas Lights',
        christmas_garland: 'Christmas Garland', christmas_bell: 'Christmas Bell'
    };

    /**
     * The counter. `contents` is the whole truth: what the card says is what the
     * paper holds. Rupee presents are unlimited; keepsake presents are one per
     * hero and are paid for in diamonds.
     */
    const PRESENTS = [
        {
            id: 'wrapped_parcel', name: 'Wrapped Parcel', currency: 'rupees', price: 25, value: 6,
            contents: [{ id: 'candy_cane', qty: 1 }, { id: 'christmas_tree_ball', qty: 1 }],
            desc: 'Brown paper and string with a small weight in the hand. A sweet and a tree ball for the tree — the same parcel for every hero who buys one.'
        },
        {
            id: 'ribboned_gift', name: 'Ribboned Gift', currency: 'rupees', price: 60, value: 14,
            contents: [{ id: 'gingerbread', qty: 1 }, { id: 'spiced_cider', qty: 1 }, { id: 'christmas_tree_ball', qty: 3 }],
            desc: 'A box tied with a red ribbon, packed by the shopkeeper herself: a gingerbread man, a cup of cider and three tree balls.'
        },
        {
            id: 'grand_present', name: 'Grand Present', currency: 'rupees', price: 130, value: 30,
            contents: [{ id: 'winter_scarf', qty: 1 }, { id: 'candy_cane', qty: 1 }, { id: 'christmas_lights', qty: 1 }, { id: 'christmas_garland', qty: 1 }],
            desc: 'A deep hamper with a bow wider than the lid: a knitted scarf, a candy cane, a run of lights and a garland.'
        },
        {
            id: 'emberglass_present', name: 'Emberglass Present', currency: 'diamonds', price: 4, value: 90,
            keepsake: 'emberglass_locket',
            contents: [{ id: 'christmas_lights', qty: 2 }],
            desc: 'A small box of dark wood, warm to the touch, with two runs of lights packed around a brass-framed pane of red glass. Sold once to each hero.'
        },
        {
            id: 'frostbell_present', name: 'Frostbell Present', currency: 'diamonds', price: 6, value: 120,
            keepsake: 'frostbell_charm',
            contents: [{ id: 'christmas_bell', qty: 1 }],
            desc: 'A box that chimes when it is lifted, holding one brass bell of the tree’s own kind and a silver charm full of frost. Sold once to each hero.'
        },
        {
            id: 'silverstar_present', name: 'Silver Star Present', currency: 'diamonds', price: 9, value: 160,
            keepsake: 'silver_star_pendant',
            contents: [{ id: 'christmas_garland', qty: 1 }, { id: 'christmas_bell', qty: 1 }],
            desc: 'A long flat box, tied shut with wire and a star’s own ribbon: garland, a bell, and a pendant cut from the same silver as the tree’s star. Sold once to each hero.'
        }
    ];
    const byId = id => PRESENTS.find(p => p.id === id) || null;
    const keepsakeOf = present => (present?.keepsake ? KEEPSAKES[present.keepsake] : null);
    const labelOf = id => w.WorldData.items?.[id]?.name || DECORATION_NAMES[id] || TRINKETS[id]?.name || KEEPSAKES[id]?.name || id;

    // Every item this counter mentions exists in the world, whether or not a
    // player ever sees it in a bag.
    for (const present of PRESENTS) {
        w.WorldData.items[present.id] = {
            id: present.id, present: present.id, name: present.name, type: 'gift',
            value: present.value, currency: present.currency, price: present.price,
            contents: present.contents.map(row => ({ ...row })),
            desc: present.desc
        };
    }
    for (const trinket of [...Object.values(TRINKETS), ...Object.values(KEEPSAKES)]) {
        if (!w.WorldData.items[trinket.id]) w.WorldData.items[trinket.id] = { ...trinket };
    }

    const shopState = game => (game.state.giftShop && typeof game.state.giftShop === 'object')
        ? game.state.giftShop
        : (game.state.giftShop = { opened: 0, parcels: {}, keepsakes: [] });
    const ownedKeepsakes = game => {
        const shop = shopState(game);
        if (!Array.isArray(shop.keepsakes)) shop.keepsakes = [];
        return shop.keepsakes;
    };
    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    const sfx = name => w.MusicSystem?.playSFX?.(name);
    const money = present => `${present.price} ${present.currency === 'diamonds' ? 'diamonds' : 'rupees'}`;

    /** Where the present counter stands in every city. */
    function attachCounters() {
        const L = w.WorldData.locations || {};
        for (const id of Object.keys(L)) {
            if (!/(_district_15|_district_18)$/.test(id) && id !== 'kaliwasch') continue;
            const loc = L[id];
            if (!loc || loc.giftShop) continue;
            loc.giftShop = 'The Wrapped Parcel';
            loc.features = Array.isArray(loc.features) ? loc.features : [];
            if (!loc.features.includes('gift shop')) loc.features.push('gift shop');
        }
    }
    attachCounters();

    const atCounter = game => Boolean(w.WorldData.locations[game.state.location]?.giftShop);

    const contentsLine = present => present.contents
        .map(row => `${row.qty} ${labelOf(row.id)}${row.qty > 1 ? 's' : ''}`)
        .join(', ');

    Game.giftShopDirections = function () {
        const here = atCounter(this);
        say(this, here
            ? 'The Wrapped Parcel is open beside you, its counter stacked with paper and ribbon. Every card says exactly what is inside — nothing is a lucky dip. Say "buy parcel", "buy gift" or "buy grand present" for the rupee presents, or "buy locket", "buy charm" or "buy pendant" for the three diamond keepsakes, then "open gift" to unwrap.'
            : 'The Wrapped Parcel keeps a counter on Kaliwasch Market Square and on Shop Row in each city. Rupee presents hold exactly what their cards say; the three keepsake presents are paid for in diamonds. Say "diamonds" to hear where diamonds are found.', 'location');
    };

    /** Every honest source of diamonds, with the balance beside it. */
    Game.diamondReport = function () {
        const p = this.state.player;
        say(this, `Diamonds in your purse: ${p?.diamonds || 0}. Every diamond in the world is earned: the hands of fallen monsters and bosses, the arena on its long waves, behind the Christmas doors and in Santa’s sack, the Grand Christmas Tree when it is finished for the night, and the twelfth-night bounty board. Nobody anywhere sells a diamond for money, and no present holds one — the gift shop takes diamonds for its three keepsake presents instead. The estate agent takes them for a deed and for the monthly due.`, 'location');
    };

    Game.showGiftShop = function () {
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        if (!panel || !content) { this.giftShopDirections(); return; }
        const p = this.state.player || {}, bag = this.state.inventory || [], shop = shopState(this);
        const keepsakes = ownedKeepsakes(this);
        if (!atCounter(this)) content.innerHTML = `<p>The Wrapped Parcel is not here. ${this.escapeHTML('Kaliwasch Market Square keeps a counter, and so does Shop Row in each city.')}</p>`;
        else content.innerHTML = `<div class="shop-summary"><strong>The Wrapped Parcel</strong><span>${p.diamonds || 0} diamonds • ${p.gold || 0} rupees • ${shop.opened || 0} presents unwrapped</span><button onclick="Game.giftShopDirections()">Where else</button></div>`
            + PRESENTS.map(present => {
                const owned = bag.filter(i => i.id === present.id).reduce((n, i) => n + (i.quantity || 0), 0);
                const keepsake = keepsakeOf(present);
                const taken = Boolean(keepsake && keepsakes.includes(keepsake.id));
                return `<article class="shop-item-card"><div><strong>${this.escapeHTML(present.name)}</strong>`
                    + `<small>${money(present)} • you carry ${owned}${taken ? ' • this keepsake is already yours' : ''}</small>`
                    + `<p>${this.escapeHTML(present.desc)}</p>`
                    + `<small>Holds: ${this.escapeHTML(contentsLine(present))}${keepsake ? `, and the ${this.escapeHTML(keepsake.name)}` : ''}</small></div>`
                    + `<div class="shop-actions">${taken
                        ? '<button disabled>Already yours</button>'
                        : `<button onclick="Game.buyPresent('${present.id}')">Buy</button>`}<button onclick="Game.openGift('${present.id}')">Unwrap</button></div></article>`;
            }).join('')
            + '<p>Every card is the whole truth: the same goods, for every hero, every time. No present holds a diamond — diamonds are earned, never unwrapped.</p>';
        panel.classList.remove('hidden');
    };

    /**
     * Buy one present (or several rupee presents). The price is on the card, in
     * the currency the card names; a keepsake already worn is never sold twice.
     */
    Game.buyPresent = function (id, quantity = 1) {
        const present = byId(id) || byId(String(id || '').toLowerCase().replace(/\s+/g, '_'));
        if (!present) { say(this, 'That is not one of the presents on the counter. Say "gift shop" to see all six.', 'system'); return false; }
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        if (!atCounter(this)) { this.giftShopDirections(); return false; }
        const keepsake = keepsakeOf(present);
        if (keepsake && ownedKeepsakes(this).includes(keepsake.id)) {
            say(this, `The ${keepsake.name} is already yours, blessed and worn. The counter will not sell you a second one.`, 'system');
            return false;
        }
        // A keepsake is a single purchase; ordinary presents may be bought in a run.
        const count = keepsake ? 1 : Math.max(1, Math.min(10, Number(quantity) || 1));
        const cost = present.price * count;
        const purse = present.currency === 'diamonds' ? (p.diamonds || 0) : (p.gold || 0);
        if (purse < cost) {
            say(this, `${count > 1 ? `${count} ${present.name}s` : `a ${present.name}`} cost${count > 1 ? '' : 's'} ${cost} ${present.currency === 'diamonds' ? 'diamonds' : 'rupees'} and you carry ${purse}. ${present.currency === 'diamonds' ? 'Diamonds are earned in battle, in the arena, at the Christmas tree and on the bounty board; say "diamonds" to hear every way.' : 'Monsters, quests and the arena fill a purse quickly.'}`, 'system');
            sfx('board-error');
            return false;
        }
        if (present.currency === 'diamonds') p.diamonds -= cost; else p.gold -= cost;
        for (let i = 0; i < count; i++) this.addItemToInventory(present.id, { ...w.WorldData.items[present.id] });
        say(this, `You buy ${count > 1 ? `${count} ${present.name}s` : `a ${present.name}`} for ${cost} ${present.currency === 'diamonds' ? 'diamonds' : 'rupees'}. It holds ${contentsLine(present)}${keepsake ? `, and the ${keepsake.name}` : ''}. Say "open gift" to unwrap ${count > 1 ? 'one' : 'it'}.`, 'item');
        sfx('coin-collision');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return true;
    };

    const GENERIC_PRESENT = /^(it|a gift|one gift|the gift|gift|gifts|present|presents|parcel|parcels|box|wrapping)$/;
    const presentInBag = (game, query) => {
        const bag = game.state.inventory || [];
        const presentBag = bag.filter(i => (i.quantity || 0) > 0 && PRESENTS.some(p => p.id === i.id));
        const wanted = String(query || '').trim().toLowerCase();
        if (!wanted || GENERIC_PRESENT.test(wanted)) return presentBag[0] || null;
        const named = PRESENTS.find(p => p.id === wanted || p.name.toLowerCase() === wanted
            || (wanted.length >= 5 && (p.id.includes(wanted.replace(/\s+/g, '_')) || p.name.toLowerCase().includes(wanted))));
        if (!named) return presentBag[0] || null;
        return bag.find(i => i.id === named.id && (i.quantity || 0) > 0) || { missing: named };
    };

    /** The blessing of a keepsake, written once onto the hero. */
    function bless(game, keepsake) {
        const p = game.state.player, shop = shopState(game);
        const blessing = keepsake.blessing || {};
        if (blessing.hp) { p.maxHp = (p.maxHp || 0) + blessing.hp; p.hp = Math.min(p.maxHp, p.hp + blessing.hp); }
        if (blessing.mp) { p.maxMp = (p.maxMp || 0) + blessing.mp; p.mp = Math.min(p.maxMp, p.mp + blessing.mp); }
        if (blessing.defense) p.defense = (p.defense || 0) + blessing.defense;
        ownedKeepsakes(game).push(keepsake.id);
        shop.blessings = (shop.blessings || 0) + 1;
        return keepsake.blessLine;
    }

    /**
     * Unwrapping. The card said what was inside, so the paper holds exactly
     * that — no dice, no diamonds, nothing withheld.
     */
    Game.openGift = function (query) {
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        const bag = this.state.inventory || [];
        const found = presentInBag(this, query);
        if (!found) {
            say(this, `You carry no present to unwrap. The Wrapped Parcel sells them for ${PRESENTS[0].price}, ${PRESENTS[1].price} and ${PRESENTS[2].price} rupees, and keeps three diamond keepsakes besides.`, 'system');
            return false;
        }
        if (found.missing) { say(this, `You carry no ${found.missing.name}. The gift shop sells one.`, 'system'); return false; }
        const present = byId(found.id) || PRESENTS[0];
        found.quantity -= 1;
        if (found.quantity <= 0) bag.splice(bag.indexOf(found), 1);

        const shop = shopState(this);
        shop.opened = (shop.opened || 0) + 1;
        shop.parcels[present.id] = (shop.parcels[present.id] || 0) + 1;

        const given = [];
        for (const row of present.contents) {
            const itemData = w.WorldData.items[row.id];
            if (!itemData) continue;
            for (let i = 0; i < row.qty; i++) this.addItemToInventory(row.id, { ...itemData });
            given.push(`${row.qty} ${labelOf(row.id)}${row.qty > 1 ? 's' : ''}`);
        }
        let blessed = null;
        const keepsake = keepsakeOf(present);
        if (keepsake) {
            if (ownedKeepsakes(this).includes(keepsake.id)) {
                // Never silently waste a diamond: the present can be bought only
                // once, so this can only happen to a present bought before the
                // keepsake was blessed.
                say(this, `The paper holds a second ${keepsake.name}. It is a keepsake already blessed upon you, so it is set aside as a gift for someone else.`, 'item');
            } else {
                blessed = bless(this, keepsake);
            }
        }
        const list = given.length ? given.join(', ') : 'nothing at all';
        say(this, `You unwrap the ${present.name}: ${list}${keepsake ? `, and the ${keepsake.name}` : ''}. ${blessed ? `${blessed} ` : ''}Exactly what the card promised. ${keepsake ? '' : `You carry ${p.diamonds || 0} diamonds.`}`, keepsake ? 'treasure' : 'item');
        sfx(keepsake ? 'levelup' : 'pickup');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return { present: present.id, items: present.contents.map(row => row.id), keepsake: keepsake?.id || null, blessed: Boolean(blessed) };
    };

    // A button wherever the counter stands, so nothing here is command-only.
    const oldContext = G.updateContextActions;
    if (typeof oldContext === 'function') {
        G.updateContextActions = function () {
            oldContext.call(this);
            const loc = w.WorldData.locations[this.state.location];
            const box = document.getElementById('context-actions');
            if (!loc?.giftShop || !box) return;
            box.insertAdjacentHTML('beforeend', '<button onclick="Game.showGiftShop()">Gift Shop</button><button onclick="Game.diamondReport()">Diamonds</button>');
        };
    }

    const oldEnter = G.enterLocation;
    if (typeof oldEnter === 'function') {
        G.enterLocation = function (id, visited) {
            const result = oldEnter.call(this, id, visited);
            if (w.WorldData.locations[id]?.giftShop) {
                // Said once per hero at each counter, not on every step.
                const seen = (shopState(this).seen ||= {});
                if (!seen[id]) {
                    seen[id] = true;
                    say(this, 'The Wrapped Parcel stands open here, every card printed with its exact contents. Say "gift shop" to browse, or "diamonds" to hear where diamonds are earned.', 'item');
                }
            }
            return result;
        };
    }

    // The diamond purse sits in the HUD beside the rupees, so it is never a
    // hidden number: a deed, a due and a present are all paid from it.
    const oldHUD = G.updateHUD;
    if (typeof oldHUD === 'function') {
        G.updateHUD = function () {
            const result = oldHUD.call(this);
            const el = document.getElementById('diamonds');
            if (el) el.textContent = this.state.player?.diamonds || 0;
            return result;
        };
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'gift shop' || text === 'gifts' || text === 'presents' || text === 'gift counter' || text === 'wrapped parcel') { this.showGiftShop(); return; }
        if (text === 'where is the gift shop' || text === 'gift shop directions') { this.giftShopDirections(); return; }
        if (text === 'diamonds' || text === 'diamond purse' || text === 'how do i get diamonds' || text === 'where are diamonds') { this.diamondReport(); return; }
        let m = /^buy (\d+ )?(parcel|parcels|wrapped parcel|gift|gifts|present|presents|ribboned gift|grand present|grand gift|locket|emberglass|charm|frostbell|pendant|silver star)$/.exec(text);
        if (m) {
            const count = m[1] ? Number(m[1].trim()) : 1;
            const word = m[2];
            const id = /parcel/.test(word) ? 'wrapped_parcel'
                : /ribboned/.test(word) ? 'ribboned_gift'
                : /grand/.test(word) ? 'grand_present'
                : /locket|emberglass/.test(word) ? 'emberglass_present'
                : /charm|frostbell/.test(word) ? 'frostbell_present'
                : /pendant|silver star/.test(word) ? 'silverstar_present' : '';
            if (id) { this.buyPresent(id, count); return; }
            // "buy gift" or "buy present": the shopkeeper offers the parcels in order.
            const purse = this.state.player || {};
            const choice = (purse.gold || 0) >= PRESENTS[1].price ? PRESENTS[1] : PRESENTS[0];
            this.buyPresent(choice.id, count);
            return;
        }
        // Only present words are unwrapped here; "open door" and "open chest"
        // still belong to the world, so they are passed on untouched.
        const opening = /^(?:open|unwrap)(?:\s+(.*))?$/.exec(text);
        if (opening) {
            const rest = (opening[1] || '').trim();
            const presentWord = !rest || GENERIC_PRESENT.test(rest) || PRESENTS.some(p => p.id === rest
                || p.name.toLowerCase() === rest
                || (`${p.id} `).startsWith(`${rest} `)
                || p.name.toLowerCase().startsWith(rest));
            if (presentWord) { this.openGift(rest); return; }
        }
        oldCommand.call(this, raw);
    };

    // The unwrapping count and the keepsakes travel with the hero.
    const oldGet = G.getSaveData.bind(G);
    G.getSaveData = function () { return { ...oldGet(), giftShop: shopState(this) }; };
    const oldContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.giftShop = Object.assign({ opened: 0, parcels: {}, keepsakes: [] }, data?.giftShop || {});
    };

    w.GiftShop = {
        presents: PRESENTS, keepsakes: KEEPSAKES, trinkets: TRINKETS,
        byId, contentsLine, labelOf, ownedKeepsakes, atCounter, money,
        /** What a present holds, exactly, for a test or a panel. */
        contentsOf: id => (byId(id)?.contents || []).map(row => ({ ...row }))
    };
})();
