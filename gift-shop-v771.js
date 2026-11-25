/**
 * 7.71.0 — The Wrapped Parcel, the gift shop of the four cities.
 *
 * Diamonds are the rarest thing a hero can carry, and the only currency the
 * estate agent accepts. They are never sold for money and never bought with a
 * card: they are found in battle, behind the Christmas doors, on the twelfth
 * night bounty board — and inside the presents sold here.
 *
 * A present is a real inventory item. It is bought with rupees, carried, and
 * unwrapped with "open gift". Every present holds a small trinket; some hold
 * diamonds. The tenth present a hero unwraps always holds at least one, so a
 * long run of paper is never a wasted run.
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

    /* Diamonds per present. `chance` is how often a present holds any at all.
       At these odds a hero finds roughly one diamond for every thirty rupees
       spent, and the monthly estate due stays small beside a purse of them. */
    const PRESENTS = [
        { id: 'wrapped_parcel', name: 'Wrapped Parcel', price: 25, value: 6, chance: 0.40, least: 1, most: 3,
          desc: 'Brown paper and string with a small weight in the hand. Unwrap it and see.' },
        { id: 'ribboned_gift', name: 'Ribboned Gift', price: 60, value: 14, chance: 0.55, least: 2, most: 5,
          desc: 'A box tied with a red ribbon, packed by the shopkeeper herself. Unwrap it and see.' },
        { id: 'grand_present', name: 'Grand Present', price: 130, value: 30, chance: 0.70, least: 4, most: 9,
          desc: 'A deep hamper with a bow wider than the lid. Under the straw something glitters.' }
    ];
    const byId = id => PRESENTS.find(p => p.id === id) || null;
    const trinketList = Object.values(TRINKETS);

    // Every present is a real item: the shop shows it, the bag sells it, and a
    // dropped present survives a reload because it is ordinary inventory.
    for (const present of PRESENTS) {
        w.WorldData.items[present.id] = {
            id: present.id, present: present.id, name: present.name, type: 'gift',
            value: present.value, desc: present.desc
        };
    }
    for (const trinket of trinketList) if (!w.WorldData.items[trinket.id]) w.WorldData.items[trinket.id] = { ...trinket };

    const shopState = game => (game.state.giftShop && typeof game.state.giftShop === 'object') ? game.state.giftShop : (game.state.giftShop = { opened: 0, parcels: {} });
    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    const sfx = name => w.MusicSystem?.playSFX?.(name);

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

    Game.giftShopDirections = function () {
        const rows = ['Kaliwasch Market Square', 'North Street to Shop Row in each city'];
        const here = atCounter(this);
        say(this, here
            ? 'The Wrapped Parcel is open beside you, its counter stacked with paper and ribbon. Say "buy parcel", "buy gift" or "buy grand present" to choose one, then "open gift" to unwrap it.'
            : `The Wrapped Parcel keeps a counter on ${rows.join(' and ')}. Every present is bought with rupees and may hold a diamond. Say "diamonds" to hear where else diamonds are found.`, 'location');
    };

    /** Every honest source of diamonds, with the balance beside it. */
    Game.diamondReport = function () {
        const p = this.state.player, shop = shopState(this);
        say(this, `Diamonds in your purse: ${p?.diamonds || 0}. Presents unwrapped so far: ${shop.opened || 0}, and the tenth one always holds a stone. Diamonds are found inside presents from the gift shop, in the hands of fallen monsters and bosses, in the arena on the long waves, behind the Christmas doors and in Santa's sack when every door is finished, and on the twelfth-night bounty board. The estate agent takes them for a deed and for the monthly due, and nobody anywhere sells a diamond for money.`, 'location');
    };

    function priceLine(present, got) {
        return `${present.name} — ${present.price} rupees${got ? ` (you carry ${got})` : ''}`;
    }

    Game.showGiftShop = function () {
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        if (!panel || !content) { this.giftShopDirections(); return; }
        const p = this.state.player || {}, bag = this.state.inventory || [], shop = shopState(this);
        if (!atCounter(this)) content.innerHTML = `<p>The Wrapped Parcel is not here. ${this.escapeHTML('Kaliwasch Market Square keeps a counter, and so does Shop Row in each city.')}</p>`;
        else content.innerHTML = `<div class="shop-summary"><strong>The Wrapped Parcel</strong><span>${p.diamonds || 0} diamonds • ${p.gold || 0} rupees • ${shop.opened || 0} presents unwrapped</span><button onclick="Game.giftShopDirections()">Where else</button></div>`
            + PRESENTS.map(present => {
                const owned = bag.filter(i => i.id === present.id).reduce((n, i) => n + (i.quantity || 0), 0);
                return `<article class="shop-item-card"><div><strong>${this.escapeHTML(present.name)}</strong><small>${present.price} rupees • you carry ${owned}</small><p>${this.escapeHTML(present.desc)}</p></div><div class="shop-actions"><button onclick="Game.buyPresent('${present.id}')">Buy</button><button onclick="Game.openGift('${present.id}')">Unwrap</button></div></article>`;
            }).join('') + '<p>Some presents hold diamonds. The tenth present a hero unwraps always holds at least one.</p>';
        panel.classList.remove('hidden');
    };

    /** Buying is rupees only: diamonds are never sold, and never bought with money. */
    Game.buyPresent = function (id, quantity = 1) {
        const present = byId(id) || byId(String(id || '').toLowerCase().replace(/\s+/g, '_'));
        if (!present) { say(this, 'That is not one of the parcels on the counter. Say "gift shop" to see the three.', 'system'); return false; }
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        if (!atCounter(this)) { this.giftShopDirections(); return false; }
        const count = Math.max(1, Math.min(10, Number(quantity) || 1));
        const cost = present.price * count;
        if ((p.gold || 0) < cost) {
            say(this, `${count} ${present.name}${count > 1 ? 's' : ''} cost ${cost} rupees and you carry ${p.gold || 0}. Monsters, quests and the arena fill a purse quickly.`, 'system');
            sfx('board-error');
            return false;
        }
        p.gold -= cost;
        for (let i = 0; i < count; i++) this.addItemToInventory(present.id, { ...w.WorldData.items[present.id] });
        say(this, `You buy ${count > 1 ? `${count} ${present.name}s` : `a ${present.name}`} for ${cost} rupees. Say "open gift" to unwrap ${count > 1 ? 'one' : 'it'}.`, 'item');
        sfx('coin');
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

    /**
     * Unwrapping. One present, one trinket, and sometimes diamonds. The tenth
     * unwrapping (and every tenth after it) always holds at least one diamond.
     */
    Game.openGift = function (query) {
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        const bag = this.state.inventory || [];
        const found = presentInBag(this, query);
        if (!found) {
            say(this, `You carry no present to unwrap. The Wrapped Parcel sells them for ${PRESENTS[0].price}, ${PRESENTS[1].price} and ${PRESENTS[2].price} rupees.`, 'system');
            return false;
        }
        if (found.missing) { say(this, `You carry no ${found.missing.name}. The gift shop sells one.`, 'system'); return false; }
        const present = byId(found.id) || PRESENTS[0];
        found.quantity -= 1;
        if (found.quantity <= 0) bag.splice(bag.indexOf(found), 1);

        const shop = shopState(this);
        shop.opened = (shop.opened || 0) + 1;
        shop.parcels[present.id] = (shop.parcels[present.id] || 0) + 1;

        const trinket = trinketList[Math.floor(Math.random() * trinketList.length)];
        this.addItemToInventory(trinket.id, { ...trinket });
        let diamonds = 0;
        // Incense smoke sweetens the odds, if any is burning.
        const luck = typeof window.Signs?.luck === 'function' ? window.Signs.luck(this) : 0;
        if (Math.random() < present.chance * (1 + luck)) diamonds = present.least + Math.floor(Math.random() * (present.most - present.least + 1));
        if (!diamonds && shop.opened % 10 === 0) diamonds = 1;
        if (diamonds) {
            p.diamonds = (p.diamonds || 0) + diamonds;
            shop.diamonds = (shop.diamonds || 0) + diamonds;
        }
        const foundLine = diamonds
            ? `the paper falls open on a ${trinket.name} and ${diamonds} diamond${diamonds > 1 ? 's' : ''}`
            : `the paper falls open on a ${trinket.name}, and no diamond this time`;
        say(this, `You unwrap the ${present.name}: ${foundLine}. You carry ${p.diamonds || 0} diamonds.`, diamonds ? 'treasure' : 'item');
        sfx(diamonds ? 'levelup' : 'pickup');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return { present: present.id, trinket: trinket.id, diamonds };
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
                    say(this, 'The Wrapped Parcel stands open here, stacked with paper and ribbon. Say "gift shop" to browse, or "diamonds" to hear where diamonds are found.', 'item');
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
        let m = /^buy (\d+ )?(parcel|parcels|wrapped parcel|gift|gifts|present|presents|ribboned gift|grand present|grand gift)$/.exec(text);
        if (m) {
            const count = m[1] ? Number(m[1].trim()) : 1;
            const word = m[2];
            const id = /parcel/.test(word) ? 'wrapped_parcel' : /ribboned/.test(word) ? 'ribboned_gift' : /grand/.test(word) ? 'grand_present' : '';
            if (id) { this.buyPresent(id, count); return; }
            // "buy gift" or "buy present": the shopkeeper offers the parcels in order.
            const p = this.state.player || {};
            const choice = (p.gold || 0) >= PRESENTS[1].price ? PRESENTS[1] : PRESENTS[0];
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

    // The unwrapping count travels with the hero, so the tenth present is
    // genuinely the tenth and not a fresh count after every reload.
    const oldGet = G.getSaveData.bind(G);
    G.getSaveData = function () { return { ...oldGet(), giftShop: shopState(this) }; };
    const oldContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.giftShop = Object.assign({ opened: 0, parcels: {} }, data?.giftShop || {});
    };

    w.GiftShop = { presents: PRESENTS, trinkets: TRINKETS, byId, attachCounters };
})();
