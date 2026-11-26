/**
 * 7.75.0 — The Wrapped Parcel, and presents that are worth carrying.
 *
 * The owner's rule for this counter: a present is bought with diamonds and it is
 * worth exactly what it cost. A ten-diamond present is a ten-diamond present in
 * paper; a twenty-five holds twenty-five; a fifty holds fifty. That makes a
 * present a thing you can hand to another hero — buy it here, carry it across the
 * world, give it away with "gift <hero name>", and the hero who unwraps it keeps
 * what is inside.
 *
 * Nothing on the counter says what is in the paper. No card prints its contents,
 * no message names an amount, and nothing anywhere in the world says that a
 * present holds diamonds at all. A player finds that out by unwrapping one, or by
 * being given one. That is deliberate: a shop that explains its surprises has no
 * surprises left.
 *
 * The rupee presents are the other half of the counter: a paper cone, a basket
 * and a sleigh hamper, packed from whatever the shop has in that morning. Those
 * are a genuine surprise — the contents are drawn when the paper is opened, not
 * when it is bought — but they never hold a diamond and never hold goods worth
 * more than the rupees paid, so no hero can farm anything by buying paper.
 *
 * A diamond present is never a lottery: buy one and open it and you have exactly
 * what you started with, minus the wrapping.
 *
 * The three pieces of jewellery the paper sometimes keeps are not advertised
 * either. They are simply there the first time a hero unwraps each kind of
 * present, once in a life, and then never again.
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

    /** The three pieces of jewellery the paper keeps, never named on a card. */
    const KEEPSAKES = {
        emberglass_locket: {
            id: 'emberglass_locket', name: 'Emberglass Locket', type: 'trinket', value: 40,
            blessing: { hp: 10 }, blessLine: 'Warmth spreads from the glass and settles in your chest.',
            desc: 'A thumb-sized pane of red glass in a brass frame, warm as a coal even in snow.'
        },
        frostbell_charm: {
            id: 'frostbell_charm', name: 'Frostbell Charm', type: 'trinket', value: 50,
            blessing: { defense: 2 }, blessLine: 'The little bell rings once, and the air around you thickens.',
            desc: 'A silver bell no larger than a fingernail, filled with frost that never melts.'
        },
        silver_star_pendant: {
            id: 'silver_star_pendant', name: 'Silver Star Pendant', type: 'trinket', value: 60,
            blessing: { mp: 10 }, blessLine: 'A cold clear light runs down your arms; magic sits nearer the surface.',
            desc: 'A six-pointed star of hammered silver on a fine chain.'
        }
    };

    /** Christmas sweets and small papers the counter keeps in its tins. */
    const TREATS = {
        chocolate: { id: 'chocolate', name: 'Chocolate', type: 'food', effect: 'heal', power: 12, value: 5, desc: 'A square of dark chocolate wrapped in waxed paper, still cold from the pantry.' },
        peppermint_humbug: { id: 'peppermint_humbug', name: 'Peppermint Humbug', type: 'food', effect: 'heal', power: 6, value: 3, desc: 'A striped boiled sweet that makes the whole mouth cold and then warm again.' },
        roasted_chestnut: { id: 'roasted_chestnut', name: 'Roasted Chestnut', type: 'food', effect: 'heal', power: 8, value: 4, desc: 'A chestnut split down the back and roasted on a brazier, wrapped in half a newspaper.' },
        sugarplum: { id: 'sugarplum', name: 'Sugar Plum', type: 'food', effect: 'both', power: 5, value: 7, desc: 'A plum boiled in sugar until it is mostly sugar. The children of the market swear by them.' },
        cocoa_cup: { id: 'cocoa_cup', name: 'Cocoa Cup', type: 'food', effect: 'both', power: 20, value: 12, desc: 'A clay cup of thick hot cocoa with a spoon standing in it. Drink it slowly, it says.' },
        pressed_note: { id: 'pressed_note', name: 'Pressed Note', type: 'document', value: 1, desc: 'A folded square of paper, pressed flat under something heavy for a long time.' }
    };

    /** What a paper cone, a basket and a ham per may hold between them. */
    const PACKING = {
        paper_cone: ['bread', 'honey_cake', 'chocolate', 'peppermint_humbug', 'roasted_chestnut', 'sugarplum', 'acorn', 'torch', 'rope', 'fishing_bait', 'leather_belt'],
        basket_parcel: ['swamp_herb', 'mountain_flower', 'cheese_wheel', 'forest_ration', 'silver_trout', 'mana_potion', 'moon_berry', 'gold_hoop_earrings', 'iron_knuckle_ring', 'christmas_tree_ball', 'christmas_lights', 'chocolate', 'cocoa_cup', 'honey_cake'],
        sleigh_hamper: ['roast_boar', 'cave_eel', 'healing_potion', 'ranger_tonic', 'mystic_stew', 'amber_pendant', 'round_shield', 'wolf_cape', 'storm_tuna', 'heater_shield', 'signet_ring', 'boar_stew', 'cocoa_cup']
    };
    // The keys in PACKING are the world's own item keys, which use spaces.
    const ITEM_KEY = id => id.replace(/_/g, ' ');

    /** The small papers that turn up in place of a sweet now and then. */
    const NOTES = [
        'Someone has written, in a careful hand: “You were kinder than you needed to be. It was noticed.”',
        'A line, underlined twice: “The tree keeps asking for something you already carry.”',
        'Half a recipe for gingerbread, and under it, smaller: “the ninth door is the good one.”',
        'A child’s drawing of a sleigh, with an arrow and the words “HE COMES FROM THE NORTH”.',
        'Written on the back of a market list: “Whoever finds this, eat something warm today.”'
    ];

    const DECORATION_NAMES = {
        christmas_tree_ball: 'Christmas Tree Ball', christmas_lights: 'Christmas Lights',
        christmas_garland: 'Christmas Garland', christmas_bell: 'Christmas Bell'
    };

    /**
     * The counter. `diamonds` is the whole worth of the paper and is never
     * printed anywhere a player can read it.
     */
    const PRESENTS = [
        {
            id: 'wrapped_parcel', name: 'Wrapped Parcel', currency: 'diamonds', price: 10, diamonds: 10,
            keepsake: 'emberglass_locket', sold: true, value: 10,
            desc: 'Brown paper, string, and a weight in the hand that is heavier than the paper deserves.'
        },
        {
            id: 'ribboned_gift', name: 'Ribboned Gift', currency: 'diamonds', price: 25, diamonds: 25,
            keepsake: 'frostbell_charm', sold: true, value: 25,
            desc: 'A shallow box tied with a red ribbon, knotted so neatly that untying it feels like a small ceremony.'
        },
        {
            id: 'grand_present', name: 'Grand Present', currency: 'diamonds', price: 50, diamonds: 50,
            keepsake: 'silver_star_pendant', sold: true, value: 50,
            desc: 'A deep hamper with a bow wider than the lid, brought up from under the counter with both hands.'
        },
        /* The rupee counter: packed that morning, different every time. */
        {
            id: 'paper_cone', name: 'Paper Cone', currency: 'rupees', price: 25, diamonds: 0,
            sold: true, value: 20, random: PACKING.paper_cone, pieces: 2, notes: true,
            desc: 'A cone of brown paper twisted shut at the top, and something inside it shifts when you tilt it.'
        },
        {
            id: 'basket_parcel', name: 'Basket Parcel', currency: 'rupees', price: 60, diamonds: 0,
            sold: true, value: 48, random: PACKING.basket_parcel, pieces: 2, notes: true,
            desc: 'A shallow wicker basket tied shut with string, with a folded cloth over whatever is under the lid.'
        },
        {
            id: 'sleigh_hamper', name: 'Sleigh Hamper', currency: 'rupees', price: 130, diamonds: 0,
            sold: true, value: 105, random: PACKING.sleigh_hamper, pieces: 3,
            desc: 'A wide hamper roped like a piece of luggage, the sort that rides behind a sleigh and is unpacked in a warm room.'
        },
        /* Crier Bell’s own paper: Christmas things, and nothing that spends. */
        {
            id: 'criers_parcel', name: 'Crier’s Parcel', currency: 'rupees', price: 0, diamonds: 0,
            sold: false, value: 14,
            contents: [{ id: 'gingerbread', qty: 1 }, { id: 'christmas_tree_ball', qty: 3 }],
            desc: 'Brown paper folded twice and sealed with a stamp of a bell. Crier Bell’s own wrapping.'
        },
        {
            id: 'criers_hamper', name: 'Crier’s Hamper', currency: 'rupees', price: 0, diamonds: 0,
            sold: false, value: 34,
            contents: [{ id: 'winter_scarf', qty: 1 }, { id: 'gingerbread', qty: 1 }, { id: 'christmas_tree_ball', qty: 3 }, { id: 'christmas_bell', qty: 1 }],
            desc: 'A woven hamper with a strap, packed by the crier himself for a generous gift.'
        }
    ];
    const SOLD = PRESENTS.filter(present => present.sold);
    const byId = id => PRESENTS.find(p => p.id === id) || null;
    const keepsakeOf = present => (present?.keepsake ? KEEPSAKES[present.keepsake] : null);
    const labelOf = id => w.WorldData.items?.[id]?.name || DECORATION_NAMES[id] || TRINKETS[id]?.name || KEEPSAKES[id]?.name || id;
    const priceOf = present => Number(present?.price) || 0;
    const holdsOf = present => Number(present?.diamonds) || 0;

    // Every item this counter mentions exists in the world. Nothing in the item
    // data says what the paper keeps.
    for (const present of PRESENTS) {
        w.WorldData.items[present.id] = {
            id: present.id, present: present.id, name: present.name, type: 'gift',
            value: present.value, desc: present.desc
        };
    }
    for (const trinket of [...Object.values(TRINKETS), ...Object.values(KEEPSAKES), ...Object.values(TREATS)]) {
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
    const money = present => `${priceOf(present)} ${present.currency === 'diamonds' ? 'diamonds' : 'rupees'}`;
    const carried = (game, id) => (game.state.inventory || []).filter(i => i.id === id).reduce((n, i) => n + (i.quantity || 0), 0);

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
        const here = atCounter(this);
        say(this, here
            ? 'The Wrapped Parcel is open beside you: paper, ribbon, and six parcels on the counter — a paper cone, a basket and a hamper for rupees, and three diamond presents at ten, twenty-five and fifty. Say "buy cone", "buy basket", "buy hamper", "buy gift" or "buy grand present", then "open gift" to unwrap — or carry one to another hero and give it away with "gift, then their name".'
            : 'The Wrapped Parcel keeps a counter on Kaliwasch Market Square and on Shop Row in each city. Its presents are paid for in diamonds. Say "diamonds" to hear where diamonds are found.', 'location');
    };

    /** Every honest way a diamond reaches a hero. */
    Game.diamondReport = function () {
        const p = this.state.player;
        say(this, `Diamonds in your purse: ${p?.diamonds || 0}. Every diamond in the world is earned: the hands of fallen monsters and bosses, the arena on its long waves, behind the Christmas doors and in Santa’s sack, the Grand Christmas Tree when it is finished for the night, and the twelfth-night bounty board. Nobody anywhere sells a diamond for money. The estate agent takes them for a deed and for the monthly due, and the Wrapped Parcel asks for them on its counter.`, 'location');
    };

    Game.showGiftShop = function () {
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        if (!panel || !content) { this.giftShopDirections(); return; }
        const p = this.state.player || {}, shop = shopState(this);
        if (!atCounter(this)) content.innerHTML = `<p>The Wrapped Parcel is not here. ${this.escapeHTML('Kaliwasch Market Square keeps a counter, and so does Shop Row in each city.')}</p>`;
        else content.innerHTML = `<div class="shop-summary"><strong>The Wrapped Parcel</strong><span>${p.diamonds || 0} diamonds • ${shop.opened || 0} presents unwrapped</span><button onclick="Game.giftShopDirections()">Where else</button></div>`
            + SOLD.map(present => {
                const owned = carried(this, present.id);
                return `<article class="shop-item-card"><div><strong>${this.escapeHTML(present.name)}</strong>`
                    + `<small>${money(present)} • you carry ${owned}</small>`
                    + `<p>${this.escapeHTML(present.desc)}</p></div>`
                    + `<div class="shop-actions"><button onclick="Game.buyPresent('${present.id}')">Buy</button>`
                    + `<button onclick="Game.openGift('${present.id}')">Unwrap</button>`
                    + `<button onclick="Game.giveGift()">Give</button></div></article>`;
            }).join('')
            + `<p>Paper, string and a bow. What is under the paper is the shop’s business until it is yours — the cone, the basket and the hamper are packed fresh that morning and never the same twice.</p>`
            + '<p><button onclick="Game.giveGift()">Give a present to another hero</button></p>';
        panel.classList.remove('hidden');
    };

    /** Buy one present, or a run of them. Only diamonds are taken here. */
    Game.buyPresent = function (id, quantity = 1) {
        const present = byId(id) || byId(String(id || '').toLowerCase().replace(/\s+/g, '_'));
        if (!present || !present.sold) {
            say(this, 'That is not one of the presents on the counter. Say "gift shop" to see them.', 'system');
            return false;
        }
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        if (!atCounter(this)) { this.giftShopDirections(); return false; }
        const count = Math.max(1, Math.min(10, Number(quantity) || 1));
        const cost = priceOf(present) * count;
        const paid = present.currency === 'diamonds' ? 'diamonds' : 'rupees';
        const purse = (present.currency === 'diamonds' ? p.diamonds : p.gold) || 0;
        if (purse < cost) {
            say(this, `${count > 1 ? `${count} ${present.name}s` : `a ${present.name}`} cost${count > 1 ? '' : 's'} ${cost} ${paid} and you carry ${purse}. ${paid === 'diamonds' ? 'Diamonds are earned in battle, in the arena, at the Christmas tree and on the bounty board; say "diamonds" to hear every way.' : 'Monsters, quests and the arena fill a purse quickly.'}`, 'system');
            sfx('board-error');
            return false;
        }
        if (present.currency === 'diamonds') p.diamonds -= cost; else p.gold -= cost;
        for (let i = 0; i < count; i++) this.addItemToInventory(present.id, { ...w.WorldData.items[present.id] });
        say(this, `You buy ${count > 1 ? `${count} ${present.name}s` : `a ${present.name}`} for ${cost} ${paid}. The shopkeeper ties it, seals it and slides it across the counter without a word about what is inside.`, 'item');
        sfx('coin-collision');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return true;
    };

    const GENERIC_PRESENT = /^(it|a gift|one gift|the gift|gift|gifts|present|presents|parcel|parcels|box|wrapping|wrapper)$/;
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

    function grant(game, present) {
        for (const row of present.contents || []) {
            const data = w.WorldData.items[row.id];
            if (!data) continue;
            for (let i = 0; i < row.qty; i++) game.addItemToInventory(row.id, { ...data });
        }
    }

    /**
     * Unwrapping. Whatever the paper was worth is now the hero's, and the paper
     * is gone. Nothing here says an amount, and nothing here says diamonds.
     */
    Game.openGift = function (query) {
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        const bag = this.state.inventory || [];
        const found = presentInBag(this, query);
        if (!found) {
            say(this, `You carry no present to unwrap. The Wrapped Parcel sells a paper cone for ${priceOf(byId('paper_cone'))} rupees, a basket parcel for ${priceOf(byId('basket_parcel'))}, a sleigh hamper for ${priceOf(byId('sleigh_hamper'))}, and its three diamond presents at ${SOLD.filter(p => p.currency === 'diamonds').map(priceOf).join(', ')}.`, 'system');
            return false;
        }
        if (found.missing) { say(this, `You carry no ${found.missing.name}. The gift shop sells one.`, 'system'); return false; }
        const present = byId(found.id) || SOLD[0];
        found.quantity -= 1;
        if (found.quantity <= 0) bag.splice(bag.indexOf(found), 1);

        const shop = shopState(this);
        shop.opened = (shop.opened || 0) + 1;
        shop.parcels[present.id] = (shop.parcels[present.id] || 0) + 1;

        const worth = holdsOf(present);
        if (worth) p.diamonds = (p.diamonds || 0) + worth;

        // The rupee counter is packed fresh each time the paper is opened —
        // never on a schedule, never on a count of previous parcels.
        const rolled = present.random ? packParcel(this, present) : null;
        if (!rolled) grant(this, present);

        const keepsake = keepsakeOf(present);
        let blessed = null;
        if (keepsake && !ownedKeepsakes(this).includes(keepsake.id)) blessed = bless(this, keepsake);

        const broke = present.paper || 'The string gives way and the paper comes off in one long curl.';
        const reveal = rolled
            ? ` ${rolled.sentence}`
            : ' Everything inside is in both your hands at once, and then it is yours.';
        say(this, `${broke}${reveal}${blessed ? ` ${blessed}` : ''}`, keepsake ? 'treasure' : 'item');
        sfx(keepsake ? 'spell-arcane' : rolled ? 'coin-collision' : 'pickup');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return {
            present: present.id, diamonds: worth,
            items: rolled ? rolled.ids : (present.contents || []).map(row => row.id),
            keepsake: keepsake?.id || null, blessed: Boolean(blessed)
        };
    };

    /**
     * Pack a rupee parcel from what the shop has in, right now. The goods are
     * always worth less than the rupees paid, and a diamond is never among them.
     */
    function packParcel(game, present) {
        const price = priceOf(present);
        const pool = (present.random || []).filter(id => w.WorldData.items[ITEM_KEY(id)] || w.WorldData.items[id]);
        if (!pool.length) return null;
        const valueOf = id => Number(w.WorldData.items[ITEM_KEY(id)]?.value ?? w.WorldData.items[id]?.value) || 0;

        // A folded paper instead of goods, now and then, on the cheap parcels.
        if (present.notes && Math.random() < 0.14) {
            const note = NOTES[Math.floor(Math.random() * NOTES.length)];
            const data = { ...w.WorldData.items.pressed_note, desc: note };
            game.addItemToInventory('pressed_note', data);
            return { ids: ['pressed_note'], sentence: 'There is no sweet in it at all: a folded paper, a stranger’s hand, and a few lines that were never meant for you. You keep it.' };
        }

        const chosen = [];
        let total = 0;
        const wants = Math.max(1, Math.min(1 + Math.floor(Math.random() * (present.pieces || 1)), 3));
        for (let tries = 0; tries < 12 && chosen.length < wants; tries += 1) {
            const id = pool[Math.floor(Math.random() * pool.length)];
            const cost = valueOf(id);
            if (!cost || total + cost > price) continue;
            chosen.push(id);
            total += cost;
        }
        if (!chosen.length) {
            const cheapest = pool.slice().sort((a, b) => valueOf(a) - valueOf(b))[0];
            chosen.push(cheapest);
        }
        const ids = [];
        for (const id of chosen) {
            const key = w.WorldData.items[ITEM_KEY(id)] ? ITEM_KEY(id) : id;
            game.addItemToInventory(key, { ...w.WorldData.items[key] });
            ids.push(key);
        }
        return { ids, sentence: foundSentence(ids) };
    }

    /** “Inside is a Honey Cake. It goes into your bag.” — said plainly, second person. */
    function foundSentence(ids) {
        const names = ids.map(id => {
            const name = labelOf(id);
            return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
        });
        const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        return names.length === 1
            ? `Inside is ${list}. It goes into your bag.`
            : `Inside are ${list}. They go into your bag.`;
    }

    /* ──────────────────────── giving a present away ──────────────────────── */

    const online = () => Boolean(w.OnlineSystem?.ready && w.OnlineSystem?.user && w.OnlineSystem?.client?.rpc);

    function friendly(message) {
        const text = String(message || '');
        if (/no hero found/i.test(text)) return 'No hero of that name walks the world.';
        if (/yourself/i.test(text)) return 'A present to yourself is still in your own bag.';
        if (/too many/i.test(text)) return 'The post is full of parcels just now. Try again in a few minutes.';
        if (/no longer|not enough|do not have/i.test(text)) return 'The present is no longer in your bag.';
        if (/authentication|sign in/i.test(text)) return 'The road to another hero is closed until you are known here.';
        console.warn('Gift error:', text);
        return 'The present could not be sent. Please try again shortly.';
    }

    Game.giftDirections = function () {
        const bag = (this.state.inventory || []).filter(i => PRESENTS.some(p => p.id === i.id) && (i.quantity || 0) > 0);
        if (!bag.length) {
            say(this, 'You carry no present to give. The Wrapped Parcel sells them from ten diamonds and from twenty-five rupees, and a present is a fine thing to carry across the world for somebody else.', 'system');
            return false;
        }
        const names = bag.map(i => `${w.WorldData.items[i.id]?.name || i.id} (${i.quantity})`).join(', ');
        say(this, `Presents you carry: ${names}. Say "gift", then the hero’s name — for example "gift Raven" — or "gift parcel to Raven" to choose which one. The parcel is sealed, so the wrapping stays a surprise for whoever opens it.`, 'location');
        return true;
    };

    Game.giveGift = async function (heroName, query) {
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        const name = String(heroName || '').trim();
        if (!name) { this.giftDirections(); return false; }
        const found = presentInBag(this, query);
        if (!found) {
            say(this, 'You carry no present to give. The Wrapped Parcel sells them for ' + SOLD.map(priceOf).join(', ') + ' diamonds.', 'system');
            return false;
        }
        if (found.missing) { say(this, `You carry no ${found.missing.name}.`, 'system'); return false; }
        if (!online()) {
            say(this, 'A present can be carried to another hero only along the world’s road, and that road is closed just now.', 'system');
            return false;
        }
        const present = byId(found.id);
        const offered = [{ id: present.id, name: present.name, quantity: 1 }];
        try {
            const { error } = await w.OnlineSystem.client.rpc('create_trade_offer', {
                target_hero: name, offered, requested: [], gold_offered: 0, gold_requested: 0
            });
            if (error) { say(this, friendly(error.message), 'system'); return false; }
        } catch {
            say(this, 'The present could not be sent. Please try again shortly.', 'system');
            return false;
        }
        found.quantity -= 1;
        if (found.quantity <= 0) (this.state.inventory || []).splice(this.state.inventory.indexOf(found), 1);
        say(this, `The shopkeeper wraps your ${present.name} a second time, in plainer paper, and the parcel goes out along the road to ${name}. It waits there, sealed and unopened, for them to take up.`, 'treasure');
        sfx('ladder-up');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showGiftShop();
        return true;
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
                const seen = (shopState(this).seen ||= {});
                if (!seen[id]) {
                    seen[id] = true;
                    say(this, 'The Wrapped Parcel stands open here: brown paper, red ribbon, and a shopkeeper who will not say what is under either. Say "gift shop" to browse, or "diamonds" to hear where diamonds are earned.', 'item');
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

        // The crier's exchange and the shop's own words belong elsewhere.
        if (text.startsWith('gift exchange') || text.startsWith('gift shop')) { oldCommand.call(this, raw); return; }

        // Giving a present away. "gift raven" or "gift parcel to raven".
        if (text === 'gift' || text === 'give gift' || text === 'give a present' || text === 'gift help') { this.giftDirections(); return; }
        let m = /^gift\s+(.+)$/.exec(text);
        if (m && /\s+to\s+/.test(m[1])) {
            const [what, ...rest] = m[1].split(/\s+to\s+/);
            this.giveGift(rest.join(' to '), what);
            return;
        }
        if (text.startsWith('give present to ') || text.startsWith('give gift to ') || text.startsWith('give parcel to ')) {
            const rest = text.replace(/^give (present|gift|parcel) to /, '');
            this.giveGift(rest, /\bparcel\b/.test(text) ? 'parcel' : '');
            return;
        }
        if (m) { this.giveGift(m[1], ''); return; }

        m = /^buy (\d+ )?(parcel|parcels|wrapped parcel|gift|gifts|present|presents|ribboned gift|grand present|grand gift|cone|paper cone|basket|basket parcel|hamper|sleigh hamper)$/.exec(text);
        if (m) {
            const count = m[1] ? Number(m[1].trim()) : 1;
            const word = m[2];
            const id = /sleigh|hamper/.test(word) ? 'sleigh_hamper'
                : /basket/.test(word) ? 'basket_parcel'
                : /cone/.test(word) ? 'paper_cone'
                : /ribboned/.test(word) ? 'ribboned_gift'
                : /grand/.test(word) ? 'grand_present'
                : /parcel/.test(word) ? 'wrapped_parcel'
                : (this.state.player?.gold || 0) >= priceOf(byId('basket_parcel')) ? 'basket_parcel' : 'paper_cone';
            this.buyPresent(id, count);
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
        presents: PRESENTS, sold: SOLD, keepsakes: KEEPSAKES, trinkets: TRINKETS,
        byId, labelOf, ownedKeepsakes, atCounter, money, priceOf,
        /** Internal only: what a piece of paper is worth. Never printed in game. */
        holdsOf
    };
})();
