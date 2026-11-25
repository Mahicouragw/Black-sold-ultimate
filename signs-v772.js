/**
 * 7.72.0 — The Signs, the rune shop, and the forge that binds them.
 *
 * Sixteen signs are the only runes in the world. Three of them are bound into a
 * weapon, a piece of armour or a piece of jewellery at a time, and the item is
 * renamed by the trio that was used, so the name always tells the truth about
 * what is in it:
 *
 *   iron mace + Sign of Fire + Sign of Magic + Sign of Hope
 *     → "Emberwrought Iron Mace of Hope"
 *
 * Binding the same trio again deepens the work: rank two makes it Exalted, rank
 * three Ascended, and the last rank is an evolution — the item keeps the name
 * it earned and gains one more step of the same power. Binding a different trio
 * re-forges the item from rank one, and the smith says so before taking the
 * signs.
 *
 * Three powers are earned by particular trios, and only on weapons:
 *   • Sign of Death alone                 → the blade drinks life (HP)
 *   • Sign of Death + Water or Infinite   → and gives back magic (MP) too
 *   • Death + Infinite + Magic            → the metal spits out a goblin
 *
 * Signs cost diamonds and sit in one shop with the festive goods; there are no
 * shelves, stages or tiers. Battle drops are rare, and every one is announced.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData) return;

    /* ───────────────────────────── the sixteen ───────────────────────────── */

    const SIGNS = [
        {
            key: 'strength', name: 'Sign of Strength', price: 6, bonus: { str: 2 },
            desc: 'A sign cut from the arm of a stone wrestler. It remembers every grip that ever held, and pulls the hand closed around a haft as if the haft were an old friend.'
        },
        {
            key: 'dexterity', name: 'Sign of Dexterity', price: 6, bonus: { dex: 2 },
            desc: 'A thin sign, no wider than a thrown needle. It was carved by someone who never once dropped anything, and it disapproves quietly of clumsy work.'
        },
        {
            key: 'heaven', name: 'Sign of Heaven', price: 14, bonus: { wis: 2, hp: 5 },
            desc: 'A sign of open sky pressed flat into metal. Whoever carries it is always a little outdoors, even underground, and the ceiling feels further away than it is.'
        },
        {
            key: 'earth', name: 'Sign of Earth', price: 8, bonus: { defense: 3 },
            desc: 'Packed clay and old roots, dried into a rune. It settles weight downward, where weight belongs, and a blow that lands on it seems to arrive late.'
        },
        {
            key: 'fire', name: 'Sign of Fire', price: 9, bonus: { fireDamage: 6 },
            desc: 'A sign that stays warm in the hand even in snow. The first smith struck it from a hearth that refused to go out, and it still expects to be fed.'
        },
        {
            key: 'water', name: 'Sign of Water', price: 9, bonus: { waterDamage: 5, wis: 1 },
            desc: 'A sign that beads with cold drops at dawn. Rivers were the first roads and remember every traveller, so this one never has to be told the way home.'
        },
        {
            key: 'four', name: 'Sign of 4', price: 18, bonus: { str: 1, dex: 1, int: 1, wis: 1 },
            desc: 'Four corners, four breaths, four beats to a line of verse. It is the oldest way of asking a thing to stand still and mean it, and every wall made since is a copy of it.'
        },
        {
            key: 'infinite', name: 'Sign of Infinite', price: 22, bonus: { hp: 6, mp: 6 },
            desc: 'A sign with no edge and no back. Look at it too long and it begins to look back; the wise carry it face down, and the wise are usually right.'
        },
        {
            key: 'war', name: 'Sign of War', price: 10, bonus: { damage: 3 },
            desc: 'Taken from the boss of a broken shield. It has opinions about retreat, and it shares them, loudly, at the least helpful moment.'
        },
        {
            key: 'magic', name: 'Sign of Magic', price: 11, bonus: { int: 2, mp: 5 },
            desc: 'A sign of ink that will not dry. Sentences written beside it finish themselves, and the ones that finish themselves are rarely the ones you meant.'
        },
        {
            key: 'hope', name: 'Sign of Hope', price: 10, bonus: { hp: 6, wis: 1 },
            desc: 'A small flame kept in a pocket through a long night. It asks for nothing, promises nothing, and gives anyway; that is the whole of its power and it is enough.'
        },
        {
            key: 'death', name: 'Sign of Death', price: 15, bonus: { hp: 5 },
            desc: 'A closed door and a cut thread. It is patient, polite and always early. Bound into a blade it teaches the blade to take, and to give a little of what it takes back.'
        },
        {
            key: 'grace', name: 'Sign of Grace', price: 8, bonus: { dex: 1, wis: 1, mp: 4 },
            desc: 'The curve of a dancer’s wrist, caught in silver. It turns a stumble into a step, and a step into a bow, and a bow into an exit.'
        },
        {
            key: 'health', name: 'Sign of Health', price: 7, bonus: { hp: 10 },
            desc: 'An unbroken breath, held in a rune. It counts heartbeats as a shepherd counts sheep, and finds the total reassuring rather than troubling.'
        },
        {
            key: 'air', name: 'Sign of Air', price: 8, bonus: { airDamage: 5, dex: 1 },
            desc: 'So light that it has to be kept under a stone. It smells of high places, and of the moment before a jump that someone has decided to make.'
        },
        {
            key: 'dignity', name: 'Sign of Dignity', price: 9, bonus: { wis: 2, str: 1 },
            desc: 'A straight back, carved small. It has never begged, never hurried and never explained itself, and items bound with it refuse to be dropped, only set down.'
        }
    ];
    const byKey = new Map(SIGNS.map(sign => [sign.key, sign]));
    const byName = new Map(SIGNS.map(sign => [sign.name.toLowerCase(), sign]));
    const byId = new Map(SIGNS.map(sign => [`sign_${sign.key}`, sign]));

    for (const sign of SIGNS) {
        w.WorldData.items[`sign_${sign.key}`] = {
            id: `sign_${sign.key}`, name: sign.name, type: 'sign', sign: sign.key,
            value: 8, desc: sign.desc, ability: 'Three signs bound into a weapon, a piece of armour or a piece of jewellery enchant it.'
        };
    }

    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    const sfx = name => w.MusicSystem?.playSFX?.(name);
    const GEAR = new Set(['weapon', 'armor', 'accessory']);
    const NOUN = { weapon: 'Blade', armor: 'Mail', accessory: 'Talisman' };

    /** The signs a hero is carrying, with how many of each. */
    function carried(game) {
        const bag = game.state.inventory || [];
        return SIGNS.map(sign => ({ sign, count: bag.filter(i => i.id === `sign_${sign.key}`).reduce((n, i) => n + (i.quantity || 0), 0) }))
            .filter(entry => entry.count > 0);
    }
    const signItem = sign => game => (game.state.inventory || []).find(i => i.id === `sign_${sign.key}` && (i.quantity || 0) > 0);
    const countSign = (game, key) => (game.state.inventory || []).filter(i => i.id === `sign_${key}`).reduce((n, i) => n + (i.quantity || 0), 0);

    /* ───────────────────────── naming and evolution ───────────────────────── */

    const ELEMENT_WORD = { fire: 'Emberwrought', water: 'Tidewrought', earth: 'Stonewrought', air: 'Windwrought', heaven: 'Skywrought' };
    const VIRTUE_WORD = {
        strength: 'Strength', dexterity: 'Dexterity', war: 'War', magic: 'Magic', hope: 'Hope',
        death: 'Death', grace: 'Grace', health: 'Health', dignity: 'Dignity',
        four: 'the Fourth Way', infinite: 'Infinity'
    };
    // Trios that earned a name of their own. Everything else is named from the
    // element it carries and the virtue that finishes it.
    const TRIO_NAMES = {
        'fire+hope+magic': 'Hearthfire of Hope',
        'earth+heaven+water': 'Tide of the High Garden',
        'dignity+magic+strength': 'Crown of the Measured Hand',
        'hope+magic+war': 'Banner of the Last Morning',
        'earth+fire+water': 'Forge of the Three Lands',
        'dignity+grace+health': 'Vow of the Whole Body',
        'four+infinite+war': 'The Unending Rank',
        'death+infinite+magic': 'Graveborn of the Endless Host',
        'death+health+hope': 'Lantern at the Last Door',
        'dexterity+grace+air': 'Sleeve of the High Wire'
    };
    const RANK_PREFIX = ['', '', 'Exalted ', 'Ascended '];
    const RANK_SCALE = [0, 1, 1.5, 2];

    const trioKey = keys => keys.slice().sort().join('+');

    function baseNameOf(item) {
        item.baseName = item.baseName || item.name;
        return item.baseName;
    }

    /** The name an item earns from a trio, before its rank prefix. */
    function nameFor(item, keys) {
        const named = TRIO_NAMES[trioKey(keys)];
        if (named) return named;
        const element = keys.find(key => ELEMENT_WORD[key]);
        const virtue = keys.find(key => !ELEMENT_WORD[key]);
        const noun = NOUN[item.type] || 'Relic';
        const base = element ? `${ELEMENT_WORD[element]} ${baseNameOf(item)}` : baseNameOf(item);
        return virtue ? `${base} of ${VIRTUE_WORD[virtue] || 'the Road'}` : base;
    }

    /** The powers a trio grants. Summons are weapons only. */
    function powersOf(keys, item) {
        const set = new Set(keys), powers = [];
        if (set.has('death')) powers.push('drain');
        if (set.has('death') && (set.has('water') || set.has('infinite'))) powers.push('drainMana');
        if (item?.type === 'weapon' && set.has('death') && set.has('infinite') && set.has('magic')) powers.push('summon');
        return powers;
    }

    function powerText(powers) {
        const parts = [];
        if (powers.includes('drain')) parts.push('drinks life from what it strikes and gives it to the hand that holds it');
        if (powers.includes('drainMana')) parts.push('returns a little of that stolen life as magic');
        if (powers.includes('summon')) parts.push('spits a goblin out of the metal when a fight begins');
        return parts.length ? `It ${parts.join(', and it ')}.` : '';
    }

    /** The stat bonus a trio gives at a rank, before it is written onto an item. */
    function bonusFor(keys, rank) {
        const scale = RANK_SCALE[rank] || 1, total = {};
        for (const key of keys) {
            const sign = byKey.get(key);
            for (const [stat, amount] of Object.entries(sign?.bonus || {})) {
                total[stat] = (total[stat] || 0) + Math.max(1, Math.round(amount * scale));
            }
        }
        return total;
    }

    const writeBonus = (item, bonus, direction) => {
        for (const [stat, amount] of Object.entries(bonus || {})) {
            item[stat] = Math.max(0, (item[stat] || 0) + direction * amount);
        }
    };

    function preview(item, keys, rank) {
        const name = `${RANK_PREFIX[rank]}${nameFor(item, keys)}`;
        return { name, rank, bonus: bonusFor(keys, rank), powers: powersOf(keys, item) };
    }

    /* ───────────────────────────── the forge ───────────────────────────── */

    function gearIn(game, query) {
        const bag = game.state.inventory || [];
        const equippedName = game.state.player?.weapon;
        const gear = bag.filter(i => GEAR.has(i.type) && (i.quantity || 0) > 0);
        if (!query) return null;
        const q = String(query).trim().toLowerCase();
        // An item answers to its id, its current name, and the name it was born
        // with, since a binding renames it.
        const words = item => [String(item.id).toLowerCase().replace(/_/g, ' '), String(item.name).toLowerCase(), String(item.baseName || '').toLowerCase()];
        return gear.find(i => words(i).some(word => word === q))
            || gear.find(i => words(i).some(word => word.includes(q)))
            || null;
    }

    /**
     * Bind three signs into one item. This is the only place an enchantment is
     * written, whether it arrives from the forge panel or from a typed command,
     * so the rule (three signs, gear only, ranks one to three) is enforced once.
     */
    Game.enchantWithSigns = function (itemQuery, keys) {
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        const item = gearIn(this, itemQuery);
        if (!item) {
            say(this, 'Name a weapon, a piece of armour or a piece of jewellery from your bag, for example "enchant iron mace with fire, magic and hope".', 'system');
            return false;
        }
        const chosen = (keys || []).filter(key => byKey.has(key));
        if (chosen.length !== 3) {
            say(this, `Three signs are bound at a time, no more and no fewer. You named ${chosen.length}. Say "signs" to see the sixteen and "enchant ${item.name}" for the forge.`, 'system');
            sfx('board-error');
            return false;
        }
        const needed = {};
        for (const key of chosen) needed[key] = (needed[key] || 0) + 1;
        for (const [key, count] of Object.entries(needed)) {
            const held = countSign(this, key);
            if (held < count) {
                say(this, `The work needs ${count} ${byKey.get(key).name}${count > 1 ? 's' : ''} and you carry ${held}. The rune shop sells every sign for diamonds.`, 'system');
                sfx('board-error');
                return false;
            }
        }

        const previous = item.signEnchant || null;
        const sameTrio = previous && trioKey(previous.signs) === trioKey(chosen);
        if (sameTrio && (previous.rank || 1) >= 3) {
            say(this, `${item.name} is already at its last rank. Three other signs will re-forge it into something new, or the same three will deepen a lesser piece.`, 'system');
            sfx('board-error');
            return false;
        }
        const rank = sameTrio ? Math.min(3, (previous.rank || 1) + 1) : 1;
        const reforge = Boolean(previous && !sameTrio);

        // The signs are spent whether the work deepens or re-forges.
        const bag = this.state.inventory || [];
        for (const [key, count] of Object.entries(needed)) {
            let left = count;
            for (const stack of bag.filter(i => i.id === `sign_${key}`)) {
                const take = Math.min(left, stack.quantity || 0);
                stack.quantity -= take; left -= take;
                if (left <= 0) break;
            }
            this.state.inventory = bag.filter(i => (i.quantity || 0) > 0);
        }

        if (previous) writeBonus(item, previous.bonus, -1);
        const plan = preview(item, chosen, rank);
        writeBonus(item, plan.bonus, +1);
        const oldName = item.name;

        item.signEnchant = { signs: chosen.slice(), rank, bonus: plan.bonus, powers: plan.powers };
        item.enchantments = Object.fromEntries(chosen.map(key => [byKey.get(key).name, rank]));
        item.name = plan.name;
        item.ability = powerText(plan.powers) || item.ability;
        if (p.weapon && String(p.weapon).toLowerCase() === String(oldName).toLowerCase()) p.weapon = item.name;

        const rule = rank === 3
            ? 'This is the last rank, and the item has evolved: the name stays and the power is complete.'
            : rank === 2
                ? 'Bound twice, it is now Exalted. Bind the same three again for its last rank.'
                : 'Bound once. Bind the same three again to deepen it, or different signs to re-forge it.';
        say(this, `${reforge ? `The old work is scraped away and the metal is heated again. ` : ''}You bind ${chosen.map(key => byKey.get(key).name).join(', ')} into the ${oldName}. It is now the ${item.name}, rank ${rank} of three. ${rule} ${powerText(plan.powers)}`, 'treasure');
        sfx(rank === 3 ? 'spell-arcane' : 'spell-cast');
        this.updateHUD?.(); this.save?.();
        return true;
    };

    /** Read three signs off the forge panel, the way a button press arrives. */
    Game.applyEnchantPanel = function (itemQuery) {
        const keys = [1, 2, 3].map(index => {
            const select = document.getElementById(`enchant-sign-${index}`);
            return select ? select.value : '';
        }).filter(Boolean);
        return this.enchantWithSigns(itemQuery, keys);
    };

    Game.showEnchanting = function (query) {
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        const item = gearIn(this, query);
        const owned = carried(this);
        if (!item) {
            const gear = (this.state.inventory || []).filter(i => GEAR.has(i.type) && (i.quantity || 0) > 0).map(i => i.name);
            say(this, `The forge binds exactly three signs into one weapon, piece of armour or piece of jewellery. Say "enchant <item>" to open the forge. Ready to be worked: ${gear.slice(0, 12).join(', ') || 'nothing yet'}.`, 'location');
            return false;
        }
        if (owned.length === 0) {
            say(this, `You carry no signs. Three are needed for one binding, and the rune shop sells every one of the sixteen for diamonds.`, 'system');
            return false;
        }
        if (!panel || !content) { say(this, `The forge needs three signs. Say "enchant ${item.name} with fire, magic and hope".`, 'system'); return false; }
        const options = owned.map(({ sign, count }) => `<option value="${sign.key}">${this.escapeHTML(sign.name)} (${count})</option>`).join('');
        const selects = [1, 2, 3].map(index => `<label>Sign ${index}<select id="enchant-sign-${index}">${options}</select></label>`).join('');
        content.innerHTML = `<div class="shop-summary"><strong>The Enchanting Forge</strong><span>${this.escapeHTML(item.name)} • ${(this.state.player?.diamonds || 0)} diamonds</span><button onclick="Game.showSigns()">Signs</button></div>`
            + `<p>Three signs are bound into the item at a time. Its name changes to match the trio, and binding the same three again raises it a rank, to three.</p>`
            + `<div class="shop-actions">${selects}<button onclick="Game.applyEnchantPanel('${this.escapeJS(item.id)}')">Bind the three signs</button><button onclick="Game.showEnchanting('${this.escapeJS(item.id)}')">Look again</button></div>`
            + `<p>Weapons bound with Sign of Death drink life; add Water or Infinite for magic, and add Death to Magic and Infinite to wake a goblin inside the metal.</p>`;
        panel.classList.remove('hidden');
        return true;
    };

    /** Turn typed words into sign keys: "fire, magic and hope" → [fire, magic, hope]. */
    function signsFromText(text) {
        const q = String(text || '').toLowerCase();
        const found = [];
        for (const sign of SIGNS) {
            if (q.includes(sign.name.toLowerCase())) found.push(sign.key);
            else if (new RegExp(`(^|[^a-z])${sign.key}([^a-z]|$)`).test(q)) found.push(sign.key);
        }
        // "4" and "infinite" need care: a bare numeral is only a sign when named.
        if (/\bsign of four\b/.test(q) && !found.includes('four')) found.push('four');
        return [...new Set(found)];
    }

    Game.showSigns = function () {
        const owned = carried(this);
        const list = SIGNS.map(sign => `${sign.name} (${sign.price} diamonds)`).join('; ');
        const hold = owned.length ? owned.map(({ sign, count }) => `${sign.name} ×${count}`).join(', ') : 'none';
        say(this, `The sixteen signs. ${list}. You carry: ${hold}. Three signs are bound into one weapon, armour piece or piece of jewellery; the item takes its name from the trio, and binding the same trio again raises it a rank, to three. Say "rune shop" to buy signs, or "enchant <item>" to open the forge.`, 'location');
    };

    /* ───────────────────────────── the one shop ───────────────────────────── */

    /** Every shelf in the game’s one rune shop. Festive goods register here too. */
    const stock = [];
    const registerStock = entries => {
        for (const entry of entries) {
            const at = stock.findIndex(item => item.id === entry.id);
            if (at >= 0) stock[at] = entry; else stock.push(entry);
        }
        return stock.length;
    };
    for (const sign of SIGNS) {
        registerStock([{ id: `sign_${sign.key}`, price: sign.price, currency: 'diamonds', section: 'Signs' }]);
    }
    // A consumable the shop keeps beside the runes: the incense.
    // The incense is a diamond curiosity, like the signs beside it: rare money
    // buys rare smoke.
    w.WorldData.items.incense = {
        id: 'incense', name: 'Incense', type: 'consumable', value: 12, effect: 'incense',
        desc: 'A twist of resin and dried herbs wrapped in brown paper, the kind temple keepers burn when they want an answer. The smoke is sweet, the room seems a little kinder, and the paper is warm before it is ever lit.'
    };
    registerStock([{ id: 'incense', price: 3, currency: 'diamonds', section: 'Curiosities' }]);

    const SHOP_LOCATIONS = new Set(['arcane_enchantery', 'starlight_square']);
    const atShop = game => SHOP_LOCATIONS.has(game.state.location);

    Game.showRuneShop = function () {
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        const p = this.state.player || {};
        if (!atShop(this)) {
            if (content) content.innerHTML = '<p>The rune shop keeps the forge at the Five-Runes Enchantery, up from Enchantery Street in Kaliwasch, and a stall on Starlight Bell Court while the Christmas fair is open.</p>';
            if (panel) panel.classList.remove('hidden');
            return false;
        }
        if (!panel || !content) return false;
        const sections = [...new Set(stock.map(entry => entry.section))];
        const row = entry => {
            const item = w.WorldData.items[entry.id] || {};
            const owned = (this.state.inventory || []).filter(i => i.id === entry.id).reduce((n, i) => n + (i.quantity || 0), 0);
            const money = entry.currency === 'diamonds' ? `${entry.price} diamonds` : `${entry.price} rupees`;
            return `<article class="shop-item-card"><div><strong>${this.escapeHTML(item.name || entry.id)}</strong><small>${money} • you carry ${owned}</small><p>${this.escapeHTML(item.desc || '')}</p></div><div class="shop-actions"><button onclick="Game.buyRuneShopItem('${this.escapeJS(entry.id)}')">Buy</button></div></article>`;
        };
        content.innerHTML = `<div class="shop-summary"><strong>The Rune Shop</strong><span>${p.diamonds || 0} diamonds • ${p.gold || 0} rupees</span><button onclick="Game.showSigns()">The sixteen signs</button></div>`
            + sections.map(section => `<h4>${this.escapeHTML(section)}</h4>${stock.filter(entry => entry.section === section).map(row).join('')}`).join('');
        panel.classList.remove('hidden');
        return true;
    };

    Game.buyRuneShopItem = function (id) {
        const entry = stock.find(item => item.id === id);
        const p = this.state.player;
        if (!entry || !p) { say(this, 'That is not on the counter.', 'system'); return false; }
        if (!atShop(this)) { this.showRuneShop(); return false; }
        const item = w.WorldData.items[entry.id];
        if (!item) { say(this, 'That shelf is empty.', 'system'); return false; }
        const purse = entry.currency === 'diamonds' ? (p.diamonds || 0) : (p.gold || 0);
        if (purse < entry.price) {
            say(this, `${item.name} costs ${entry.price} ${entry.currency === 'diamonds' ? 'diamonds' : 'rupees'} and you carry ${purse}. ${entry.currency === 'diamonds' ? 'Diamonds come out of battle, the arena, the Christmas tree and the bounty board; say "diamonds" to hear where.' : ''}`, 'system');
            sfx('board-error');
            return false;
        }
        if (entry.currency === 'diamonds') p.diamonds -= entry.price; else p.gold -= entry.price;
        const paidWith = entry.currency === 'diamonds' ? 'diamonds' : 'rupees';
        this.addItemToInventory(entry.id, { ...item });
        say(this, `You buy ${item.name} for ${entry.price} ${paidWith}.`, 'item');
        sfx('coin-collision');
        this.updateHUD?.(); this.save?.();
        if (document.getElementById('shop-panel') && !document.getElementById('shop-panel').classList.contains('hidden')) this.showRuneShop();
        return true;
    };

    /* ──────────────────────────────── incense ──────────────────────────────── */

    const BUFF = 3600000;
    const buffUntil = game => (game.state.buffs?.incenseUntil || 0);

    /** How much better a lucky hero's luck makes every rare roll. */
    Game.luckBonus = function () { return buffUntil(this) > Date.now() ? 0.25 : 0; };

    Game.burnIncense = function () {
        const item = (this.state.inventory || []).find(i => i.id === 'incense' && (i.quantity || 0) > 0);
        if (!item) { say(this, 'You carry no incense. The rune shop keeps a twist of it for three diamonds.', 'system'); return false; }
        item.quantity -= 1;
        if (item.quantity <= 0) this.state.inventory = this.state.inventory.filter(i => i !== item);
        this.state.buffs = Object.assign({}, this.state.buffs || {}, { incenseUntil: Date.now() + BUFF });
        say(this, 'You light the incense. The smoke curls up and does not hurry away, and the room settles around you like a held breath. Something may go better than it would have.', 'magic');
        sfx('magic');
        this.updateHUD?.(); this.save?.();
        return true;
    };

    Game.incenseStatus = function () {
        const left = buffUntil(this) - Date.now();
        say(this, left > 0
            ? `The incense is still burning. The smoke has about ${Math.ceil(left / 60000)} minute(s) left before it thins and the room goes back to being an ordinary room.`
            : 'No incense is burning. The rune shop sells a twist of it for three diamonds.', 'location');
    };

    // Incense is used like any consumable, but its effect is its own.
    const oldUse = G.useItem.bind(G);
    G.useItem = function (query) {
        const q = String(query || '').toLowerCase().trim();
        const incense = (this.state.inventory || []).find(i => i.id === 'incense' && (i.quantity || 0) > 0);
        if (incense && (q === 'incense' || q.includes('incense'))) return this.burnIncense();
        return oldUse(query);
    };

    /* ───────────────────────────── battle rewards ───────────────────────────── */

    /** Signs are the rarest thing a monster can leave behind. */
    const SIGN_ODDS = { common: 0.004, elite: 0.015, boss: 0.10, majorBoss: 0.25 };
    function rollSign(random, luck) {
        const candidates = SIGNS.filter(sign => sign.key !== 'infinite' || random() < 0.35);
        const pool = candidates.length ? candidates : SIGNS;
        return pool[Math.floor(random() * pool.length)];
    }

    const economy = w.RewardEconomy;
    if (economy && typeof economy.settleBattle === 'function') {
        w.RewardEconomy = Object.freeze({
            ...economy,
            settleBattle(g, summary, random = Math.random) {
                const result = economy.settleBattle(g, summary, random);
                if (!result || result.duplicate || !g?.state?.player) return result;
                const luck = typeof g.luckBonus === 'function' ? g.luckBonus() : 0;
                const odds = SIGN_ODDS[result.tier] ?? SIGN_ODDS.common;
                if (random() < odds * (1 + luck)) {
                    const sign = rollSign(random, luck);
                    const item = w.WorldData.items[`sign_${sign.key}`];
                    if (typeof g.addItemToInventory === 'function') g.addItemToInventory(item.id, { ...item });
                    result.sign = sign.key;
                    g.addNarrative(`Rare find: a ${sign.name}. Three signs enchant one weapon, armour piece or piece of jewellery; say "signs" to see what you hold.`, 'treasure');
                    sfx('magic');
                }
                if (result.premium?.diamond) {
                    g.addNarrative('A diamond glints among the spoils. It is in your purse, and the estate agent takes them for a deed.', 'treasure');
                    sfx('magic');
                }
                return result;
            },
            describe(result) {
                const text = economy.describe(result);
                const sign = result?.sign ? byKey.get(result.sign) : null;
                return sign ? `${text} Rare find: ${sign.name}.` : text;
            }
        });
    }

    /* ───────────────────────────── combat powers ───────────────────────────── */

    const armed = game => {
        const p = game.state.player;
        return (game.state.inventory || []).find(i => i.type === 'weapon' && (i.name === p?.weapon || i.equipped)) || null;
    };
    const state = game => (game.state.signs && typeof game.state.signs === 'object') ? game.state.signs : (game.state.signs = { lastHp: null, goblin: 0 });

    const oldStart = G.startCombat.bind(G);
    G.startCombat = function (...args) {
        const result = oldStart(...args);
        const s = state(this);
        s.lastHp = this.state.enemy?.hp ?? null;
        s.goblin = 0;
        return result;
    };

    /**
     * The blade's own turn, taken after the hero's swing has landed and before
     * the companions move: it drinks what it drew, and a graveborn blade lets a
     * goblin out of the metal.
     */
    function enchantTurn(game) {
        const e = game.state.enemy, p = game.state.player;
        if (!game.state.inCombat || !e || !p || e.hp <= 0) return;
        const weapon = armed(game);
        const powers = weapon?.signEnchant?.powers || [];
        if (!powers.length) { state(game).lastHp = e.hp; return; }
        const s = state(game);
        const dealt = Math.max(0, (s.lastHp ?? e.hp) - e.hp);
        s.lastHp = e.hp;

        if (dealt > 0 && powers.includes('drain')) {
            const before = p.hp, manaBefore = p.mp;
            p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(dealt * 0.15)));
            let mana = 0;
            if (powers.includes('drainMana')) {
                p.mp = Math.min(p.maxMp, p.mp + Math.max(1, Math.round(dealt * 0.08)));
                mana = p.mp - manaBefore;
            }
            const health = p.hp - before;
            if (health > 0 || mana > 0) {
                game.addNarrative(`${weapon.name} drinks ${dealt} life from ${e.name}: ${health} HP${mana ? ` and ${mana} MP` : ''} return to you. (${p.hp}/${p.maxHp} HP${mana ? `, ${p.mp}/${p.maxMp} MP` : ''})`, 'magic');
                sfx('heal');
                game.updateHUD?.();
            }
        }

        if (dealt > 0 && powers.includes('summon') && !s.goblin) {
            s.goblin = 3;
            game.addNarrative(`The ${weapon.name} splits along a seam that was never there, and spits out a goblin. It lands on its feet, looks around, and picks a side.`, 'combat');
            sfx('goblin-cackle');
        }

        if (s.goblin > 0 && game.state.enemy && game.state.enemy.hp > 0) {
            const bite = Math.max(2, Math.round((p.level || 1) * 2 + 4));
            const applied = game.applyEnemyDamage(bite);
            game.addNarrative(`The summoned goblin bites ${e.name} for ${applied} damage.`, 'combat');
            sfx('goblin-reaction');
            s.lastHp = game.state.enemy?.hp ?? 0;
            s.goblin -= 1;
            if (s.goblin === 0) game.addNarrative('The goblin folds back into the metal, looking pleased with itself.', 'combat');
        }
    }

    const oldCompanionTurn = G.companionTurn.bind(G);
    G.companionTurn = function (...args) {
        try { enchantTurn(this); } catch { /* a rune must never break a battle */ }
        return oldCompanionTurn(...args);
    };

    /* ──────────────────────────────── wiring ──────────────────────────────── */

    const oldContext = G.updateContextActions;
    if (typeof oldContext === 'function') {
        G.updateContextActions = function () {
            oldContext.call(this);
            const box = document.getElementById('context-actions');
            if (!box || !atShop(this)) return;
            box.insertAdjacentHTML('beforeend', '<button onclick="Game.showRuneShop()">Rune Shop</button><button onclick="Game.showEnchanting()">Enchanting</button><button onclick="Game.showSigns()">Signs</button>');
        };
    }

    const oldEnter = G.enterLocation;
    if (typeof oldEnter === 'function') {
        G.enterLocation = function (id, visited) {
            const result = oldEnter.call(this, id, visited);
            if (SHOP_LOCATIONS.has(id) && this.state.player && !this.state.player.signsSeen?.[id]) {
                this.state.player.signsSeen = Object.assign({}, this.state.player.signsSeen || {}, { [id]: true });
                say(this, 'A rune counter stands here under a brass lamp: the sixteen signs for diamonds, festive decorations, and a twist of incense. Say "rune shop" to browse, or "enchant <item>" to bind three signs.', 'item');
            }
            return result;
        };
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'rune shop' || text === 'sign shop' || text === 'unified shop' || text === 'the rune shop') { this.showRuneShop(); return; }
        if (text === 'signs' || text === 'sign list' || text === 'list signs' || text === 'sixteen signs') { this.showSigns(); return; }
        if (text === 'incense' || text === 'burn incense' || text === 'light incense' || text === 'use incense') { this.burnIncense(); return; }
        if (text === 'incense status') { this.incenseStatus(); return; }
        if (text === 'enchant' || text === 'enchanting' || text === 'forge' || text === 'enchanting forge') { this.showEnchanting(); return; }
        let m = /^enchant (.+?) with (.+)$/.exec(text);
        if (m) { this.enchantWithSigns(m[1].trim(), signsFromText(m[2])); return; }
        m = /^enchant (.+)$/.exec(text);
        if (m) { this.showEnchanting(m[1].trim()); return; }
        oldCommand.call(this, raw);
    };

    // The rune state belongs to the hero, like the estate and the gift counter.
    const oldGet = G.getSaveData.bind(G);
    G.getSaveData = function () { return { ...oldGet(), signs: state(this), buffs: this.state.buffs || {} }; };
    const oldContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.signs = Object.assign({ lastHp: null, goblin: 0 }, data?.signs || {});
        this.state.buffs = Object.assign({}, data?.buffs || {});
    };

    w.Signs = {
        catalogue: SIGNS, byKey, byId, byName,
        carried, countSign, nameFor, powersOf, bonusFor, preview, trioKey, signsFromText,
        stock, registerStock, atShop, shopLocations: SHOP_LOCATIONS,
        luck: game => (game && typeof game.luckBonus === 'function' ? game.luckBonus() : 0),
        signOdds: SIGN_ODDS,
        spendBuff: BUFF, buffUntil, enchantTurn
    };
    w.SignShop = { stock, register: registerStock, open: () => G.showRuneShop() };
})();
