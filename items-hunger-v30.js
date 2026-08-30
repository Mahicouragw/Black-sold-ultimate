/**
 * v30 — Hunger (food restores strength only), unique real-world gear,
 * body slots, thorium spear, silver arrows, fuzzy commands.
 */
(() => {
    'use strict';

    const SLOTS = ['rightHand', 'leftHand', 'head', 'face', 'ears', 'neck', 'chest', 'back', 'waist', 'legs', 'fingers'];
    const SLOT_LABEL = {
        rightHand: 'right hand', leftHand: 'left hand', head: 'head', face: 'face',
        ears: 'ears', neck: 'neck', chest: 'chest', back: 'back',
        waist: 'waist', legs: 'legs', fingers: 'fingers'
    };

    const NEW_ITEMS = {
        'thorium spear': {
            name: 'Thorium Spear', type: 'weapon', weaponType: 'polearm', slot: 'rightHand',
            damage: 28, str: 4, dex: 1, value: 420,
            desc: 'A long ash-hafted spear whose leaf blade is forged from dense, silvery thorium. The metal is a real heavy element; here it is worked into a warhead that holds an edge without rusting. Held in the right hand, it reaches past a shield rim and pins a charging foe to the ground.'
        },
        'silver arrow': {
            name: 'Silver Arrow', type: 'ammo', weaponType: 'arrow', slot: 'leftHand',
            damage: 16, value: 18,
            desc: 'A goose-fletched war arrow with a hammered silver pile. Silver is a real metal used for jewellery and coin; these piles are cast for hunting and for creatures that fear the moon-white metal. Anyone may nock or throw one: type shoot. Each shot spends one arrow.'
        },
        'yew longbow': {
            name: 'Yew Longbow', type: 'weapon', weaponType: 'bow', slot: 'leftHand',
            damage: 12, dex: 5, value: 240,
            desc: 'A self bow cut from English yew, sapwood back and heartwood belly, just as historical longbows were made. It sits in the left hand. Pair it with silver arrows to add the arrow’s damage to the draw.'
        },
        'arming sword': {
            name: 'Arming Sword', type: 'weapon', weaponType: 'sword', slot: 'rightHand',
            damage: 18, str: 2, value: 160,
            desc: 'A one-handed cruciform sword of the kind worn in high medieval Europe as a sidearm. Straight double edge, simple cross-guard, leather-wrapped grip. Equip it in the right hand for honest cutting and thrusting work.'
        },
        'gladius': {
            name: 'Gladius', type: 'weapon', weaponType: 'sword', slot: 'rightHand',
            damage: 17, dex: 2, value: 150,
            desc: 'A short Roman infantry sword with a stiff triangular point made for close ranks. The bone grip sits in the right hand. It is not a greatsword and it is not a “sword whale”; it is a gladius, as carried by legionaries.'
        },
        'seax': {
            name: 'Seax', type: 'weapon', weaponType: 'knife', slot: 'rightHand',
            damage: 11, dex: 3, value: 70,
            desc: 'A single-edged Germanic fighting knife with a broken-back blade. Worn at the belt historically; here it occupies the right hand when drawn. Good for camp work and sudden cuts.'
        },
        'tulwar': {
            name: 'Tulwar', type: 'weapon', weaponType: 'sword', slot: 'rightHand',
            damage: 20, str: 1, dex: 2, value: 210,
            desc: 'A curved Indo-Persian sabre with a disc pommel that locks the wrist into a cutting arc. A real historical sword. Right hand only.'
        },
        'khanda': {
            name: 'Khanda', type: 'weapon', weaponType: 'sword', slot: 'rightHand',
            damage: 24, str: 3, value: 280,
            desc: 'A straight, broad-bladed Indian sword with a reinforcing spine and a plate guard. Used historically by Rajput and Sikh warriors. Heavy in the right hand, honest in a bind.'
        },
        'naginata': {
            name: 'Naginata', type: 'weapon', weaponType: 'polearm', slot: 'rightHand',
            damage: 22, dex: 3, value: 260,
            desc: 'A Japanese polearm with a curved blade on a long oak shaft, used by samurai and sohei. Reach weapon for the right hand; keep space or you will tangle it.'
        },
        'lucerne hammer': {
            name: 'Lucerne Hammer', type: 'weapon', weaponType: 'blunt', slot: 'rightHand',
            damage: 26, str: 5, value: 300,
            desc: 'A Swiss pole-hammer with a pronged hammer face, a rear spike, and a long top spike. Named for Lucerne. It cracks plate. Two-handed feel, equipped in the right hand.'
        },
        'estoc': {
            name: 'Estoc', type: 'weapon', weaponType: 'sword', slot: 'rightHand',
            damage: 19, dex: 2, value: 200,
            desc: 'A stiff, edgeless thrusting sword of the late Middle Ages, made to find the gaps in plate. Right-hand weapon; it does not slash.'
        },
        'steel morion': {
            name: 'Steel Morion', type: 'armor', slot: 'head', defense: 6, value: 90,
            desc: 'A comb morion of the kind worn by sixteenth-century infantry: brimmed steel helmet with a raised crest. Occupies the head. Turns cuts from the crown.'
        },
        'linen coif': {
            name: 'Linen Coif', type: 'armor', slot: 'head', defense: 1, wis: 1, value: 12,
            desc: 'A tied linen cap worn under a helm or alone in town. Head slot. It will not stop an axe, but it keeps sweat and sun off the brow.'
        },
        'steel visor': {
            name: 'Steel Visor', type: 'armor', slot: 'face', defense: 4, dex: -1, value: 80,
            desc: 'A hinged face-plate pierced with a sight slit, as on a close helmet. Face slot. You see less; you bleed less.'
        },
        'leather eyepatch': {
            name: 'Leather Eyepatch', type: 'armor', slot: 'face', defense: 0, int: 1, value: 8,
            desc: 'A simple tanned patch over one eye. Face slot. No armour worth naming; some sailors swear it helps night vision in the other eye.'
        },
        'gold hoop earrings': {
            name: 'Gold Hoop Earrings', type: 'accessory', slot: 'ears', value: 45, hp: 4,
            desc: 'A pair of small gold hoops, the sort worn in ports from Kerala to Cadiz. Ears slot. They are jewellery, not armour.'
        },
        'pearl drop earrings': {
            name: 'Pearl Drop Earrings', type: 'accessory', slot: 'ears', value: 70, wis: 2,
            desc: 'Seed pearls on silver wires. Ears slot. Quiet wealth, not a weapon.'
        },
        'silver torque': {
            name: 'Silver Torque', type: 'accessory', slot: 'neck', value: 120, hp: 8, str: 1,
            desc: 'An open-ended Celtic neck ring of twisted silver, a real Iron Age form. Neck slot. It marks status and adds a little stubbornness in a clinch.'
        },
        'amber pendant': {
            name: 'Amber Pendant', type: 'accessory', slot: 'neck', value: 55, mp: 8,
            desc: 'Baltic amber on a leather thong. Neck slot. Warm to the touch; folk-healers called it sun-stone.'
        },
        'linen gambeson': {
            name: 'Linen Gambeson', type: 'armor', slot: 'chest', defense: 5, value: 70,
            desc: 'A quilted linen jack stuffed with cotton or scrap cloth, the everyday defence of medieval infantry. Chest slot. It bruises you instead of cutting you.'
        },
        'brigandine': {
            name: 'Brigandine', type: 'armor', slot: 'chest', defense: 11, value: 220,
            desc: 'A canvas coat lined with overlapping iron plates riveted in place, common in the 15th century. Chest slot. Flexible where plate is not.'
        },
        'wool cloak': {
            name: 'Wool Cloak', type: 'armor', slot: 'back', defense: 1, value: 25,
            desc: 'A heavy undyed wool cloak with a bronze penannular brooch. Back slot. Rain and night wind stay outside.'
        },
        'mail mantle': {
            name: 'Mail Mantle', type: 'armor', slot: 'back', defense: 5, value: 140,
            desc: 'A short cape of riveted iron rings covering the shoulders and upper back. Back slot. Stops a slash from behind.'
        },
        'leather belt': {
            name: 'Leather Belt', type: 'accessory', slot: 'waist', value: 10, str: 1,
            desc: 'A wide cowhide belt with a brass buckle. Waist slot. Holds a purse and a knife frog; you stand a little straighter.'
        },
        'sword baldric': {
            name: 'Sword Baldric', type: 'accessory', slot: 'waist', value: 28, dex: 1,
            desc: 'A diagonal leather baldric for hanging a scabbard. Waist slot. Frees the hip and keeps the hilt ready.'
        },
        'hose and chausses': {
            name: 'Hose and Chausses', type: 'armor', slot: 'legs', defense: 3, dex: 1, value: 40,
            desc: 'Woollen hose with optional mail chausses over the shins. Legs slot. You can still run.'
        },
        'plate greaves': {
            name: 'Plate Greaves', type: 'armor', slot: 'legs', defense: 7, dex: -1, value: 130,
            desc: 'Shaped steel shin-guards strapped over the calves. Legs slot. A bill-hook will ring off them.'
        },
        'signet ring': {
            name: 'Signet Ring', type: 'accessory', slot: 'fingers', value: 90, int: 2,
            desc: 'A gold ring with an engraved seal-stone. Fingers slot. Used to close letters in wax; here it also steadies the mind.'
        },
        'iron knuckle ring': {
            name: 'Iron Knuckle Ring', type: 'accessory', slot: 'fingers', value: 20, str: 2, damage: 2,
            desc: 'A thick iron band worn on the striking hand. Fingers slot. A tavern brawler’s friend.'
        },
        'barley loaf': {
            name: 'Barley Loaf', type: 'food', effect: 'hunger', satiety: 28, value: 4,
            desc: 'A dense barley loaf from a village oven.'
        },
        'mutton stew': {
            name: 'Mutton Stew', type: 'food', effect: 'hunger', satiety: 45, value: 12,
            desc: 'A wooden bowl of mutton, onion and barley.'
        },
        'dried dates': {
            name: 'Dried Dates', type: 'food', effect: 'hunger', satiety: 18, value: 6,
            desc: 'Sun-dried dates from a caravan pack.'
        },
        'goat cheese': {
            name: 'Goat Cheese', type: 'food', effect: 'hunger', satiety: 22, value: 7,
            desc: 'A wrapped round of salted goat cheese.'
        }
    };

    const RICH_EXISTING = {
        'rusty sword': 'A neglected one-handed sword whose fuller is pitted with rust. Still a real blade: cross-guard, leather grip, tapered point. Right-hand weapon. It will cut, but a smith would weep.',
        'iron sword': 'A serviceable iron arming sword, oil-wiped, with a wheel pommel. Right hand. Balanced for a day’s travel and a short fight, not for parade.',
        'wooden staff': 'A six-foot ash walking staff, ferruled at the foot. Right hand. Pilgrims and hedge-mages both lean on it. It bruises; it does not slice.',
        'goblin axe': 'A short bearded axe with a crude iron head on a green-wood haft. Right hand. Ugly, honest, and heavy enough to split kindling or a shield rim.',
        'oak club': 'A turned oak cudgel, fire-hardened at the business end. Right hand. No legend, no name beyond oak. It breaks bones when swung true.',
        'iron mace': 'A flanged iron mace of the sort used against mail. Right hand. The flanges bite rings and dent helmets.',
        'war hammer': 'A horseman’s war hammer with a blunt face and a rear spike. Right hand. Built to crumple plate, not to look pretty.',
        "saint's maul": 'A two-handed wooden maul bound with iron and etched with a small sun-cross. Right hand. Heavy enough that a tired wielder will feel every miss.',
        'THE BLACK SWORD': 'A unique relic blade of this realm, not a historical pattern. Right hand. It drinks light along the fuller. Nothing else in Kandor shares this name.',
        'bread': 'A brown wheat roll from a city baker.',
        'honey cake': 'A small cake sweetened with real honey and crushed nuts. Food. Satiety and strength only.',
        'cheese wheel': 'A waxed wheel of hard cow’s-milk cheese. Food. A traveller’s ration. Hunger down, strength up. No healing.',
        'roast boar': 'Slices of spit-roasted wild boar, wrapped in dock leaves. A heavy meal. Restores a great deal of satiety and the strength hunger stole.',
        'mystic stew': 'A tavern stew seasoned with temple herbs. Still a meal. It fills you. It does not replace a healing potion.',
        'leather armor': 'A boiled-leather jack covering the chest. Chest slot if worn as body armour. It turns brambles and light cuts.',
        'chainmail': 'A riveted iron hauberk hanging to the mid-thigh. Chest slot. Historical mail: heavy, loud, honest.',
        'plate armor': 'A breastplate and backplate of steel. Chest slot. You move slower and live longer.',
        'mage robe': 'A wool scholar’s robe with ink-stained cuffs. Chest slot. Warmth and a little dignity, not steel.'
    };

    function applyCatalog() {
        const WD = window.WorldData;
        if (!WD?.items) return;
        for (const [id, def] of Object.entries(NEW_ITEMS)) {
            if (!WD.items[id]) WD.items[id] = { ...def };
            else Object.assign(WD.items[id], def);
        }
        for (const [id, item] of Object.entries(WD.items)) {
            if (item.type === 'food') {
                item.effect = 'hunger';
                item.satiety = item.satiety || item.value || 20;
            }
            if (RICH_EXISTING[id]) item.desc = RICH_EXISTING[id];
            if (item.type === 'weapon' && !item.slot) item.slot = 'rightHand';
            if (item.type === 'armor' && !item.slot) item.slot = 'chest';
            if (item.type === 'helmet') item.slot = item.slot || 'head';
            if (item.type === 'gloves') item.slot = item.slot || 'rightHand';
            if (item.type === 'boots') item.slot = item.slot || 'legs';
            if (item.type === 'accessory' && !item.slot) item.slot = 'neck';
        }
        const loc = WD.locations?.kaliwasch;
        if (loc?.items) {
            for (const id of ['thorium spear', 'silver arrow', 'yew longbow', 'barley loaf']) {
                if (!loc.items.includes(id)) loc.items.push(id);
            }
        }
        const stock = window.ExpansionData?.shopStock;
        if (stock?.weapons) {
            for (const id of ['thorium spear', 'arming sword', 'gladius', 'yew longbow', 'silver arrow']) {
                if (WD.items[id] && !stock.weapons.some(s => s.id === id)) stock.weapons.push({ id, price: WD.items[id].value });
            }
        }
        if (stock?.provisions) {
            for (const id of ['barley loaf', 'mutton stew', 'dried dates', 'goat cheese']) {
                if (WD.items[id] && !stock.provisions.some(s => s.id === id)) stock.provisions.push({ id, price: WD.items[id].value });
            }
        }
    }

    function hungerState(game) {
        const p = game.state.player;
        if (!p) return null;
        if (!Number.isFinite(p.satiety)) p.satiety = 72;
        if (!Number.isFinite(p.hungerStrPenalty)) p.hungerStrPenalty = 0;
        return p;
    }

    function applyHungerPenalty(game) {
        const p = hungerState(game);
        if (!p) return;
        const want = p.satiety < 15 ? 6 : p.satiety < 30 ? 4 : p.satiety < 45 ? 2 : 0;
        const delta = want - p.hungerStrPenalty;
        if (delta) {
            p.str = Math.max(1, (p.str || 10) - delta);
            p.hungerStrPenalty = want;
        }
    }

    function hungerTick(game, amount = 2) {
        const p = hungerState(game);
        if (!p) return;
        p.satiety = Math.max(0, p.satiety - amount);
        applyHungerPenalty(game);
        const now = Date.now();
        game._lastHungerLine = game._lastHungerLine || 0;
        if (now - game._lastHungerLine < 20000) return;
        if (p.satiety <= 0) {
            game._lastHungerLine = now;
            game.emitGameEvent?.('You are starving. Strength is failing. Eat a meal.', 'system') || game.addNarrative('You are starving. Strength is failing. Eat a meal.', 'system');
        } else if (p.satiety < 20) {
            game._lastHungerLine = now;
            game.emitGameEvent?.('You are hungry. You feel weak, angry, and stirring. Eat food to restore strength.', 'system')
                || game.addNarrative('You are hungry. You feel weak, angry, and stirring. Eat food to restore strength.', 'system');
        } else if (p.satiety < 40) {
            game._lastHungerLine = now;
            game.emitGameEvent?.('You are hungry.', 'system') || game.addNarrative('You are hungry.', 'system');
        }
    }

    function itemMatches(item, query) {
        const q = String(query || '').toLowerCase().trim();
        if (!q || !item) return false;
        const name = String(item.name || '').toLowerCase();
        const id = String(item.id || '').toLowerCase();
        return name === q || id === q || name.includes(q) || id.includes(q) || q.includes(name) || q.includes(id);
    }

    function findCarriedItem(game, query) {
        const bags = [];
        if (Array.isArray(game?.state?.inventory)) bags.push(...game.state.inventory);
        if (Array.isArray(game?.state?.player?.inventory)) bags.push(...game.state.player.inventory);
        const q = String(query || '').toLowerCase().trim();
        return bags.find(i => itemMatches(i, q))
            || bags.find(i => (i.type === 'food' || i.effect === 'hunger') && itemMatches(i, q.replace(/^the\s+/, '')))
            || null;
    }

    function eatFood(game, item) {
        const p = hungerState(game);
        const gain = Number(item.satiety || item.value || 15);
        if (p.satiety >= 100) {
            game.addNarrative('You are already full. The meal would be wasted.', 'system');
            return false;
        }
        p.satiety = Math.min(100, p.satiety + gain);
        applyHungerPenalty(game);
        item.quantity--;
        if (item.quantity <= 0) game.state.inventory = game.state.inventory.filter(i => i !== item);
        game.addNarrative(`You eat ${item.name}.`, 'item');
        window.MusicSystem?.playSFX?.('eat');
        game.updateHUD?.();
        game.save?.();
        return true;
    }

    function slotOf(item) {
        return item.slot || (item.type === 'weapon' ? 'rightHand' : item.type === 'armor' ? 'chest' : 'neck');
    }

    function describeItem(item) {
        const parts = [item.name + '.', item.desc || ''];
        parts.push(`Worn on: ${SLOT_LABEL[slotOf(item)] || 'carried'}.`);
        if (item.damage) parts.push(`Damage ${item.damage}.`);
        if (item.defense) parts.push(`Defense ${item.defense}.`);
        ['str', 'dex', 'int', 'wis', 'hp', 'mp'].forEach(k => {
            if (item[k]) parts.push(`${k.toUpperCase()} ${item[k] > 0 ? '+' : ''}${item[k]}.`);
        });
        if (item.type === 'food') parts.push('A meal.');
        if (item.type === 'ammo') parts.push('Ammo. Type shoot to fire one.');
        if (item.value) parts.push(`Value ${item.value} gold.`);
        return parts.filter(Boolean).join(' ');
    }

    const COMMANDS = [
        'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
        'up', 'down', 'look', 'inventory', 'stats', 'map', 'quests',
        'attack', 'hunt', 'heal', 'help', 'talk', 'shop', 'settings', 'tutorial',
        'opening doors', 'alohomora', 'heal party', 'racing', 'drive', 'race',
        'accelerate', 'brake', 'boost', 'status', 'position', 'pause', 'resume',
        'shoot', 'eat', 'equip', 'hunger', 'examine', 'search', 'take', 'use', 'cast',
        'flee', 'defend', 'items', 'pit', 'quit'
    ];
    const EXACT_TOKENS = new Set([
        'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd',
        'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
        'up', 'down', 'look', 'l', 'inventory', 'i', 'items', 'stats', 'status',
        'map', 'm', 'quests', 'q', 'attack', 'fight', 'a', 'hunt', 'heal', 'help',
        'talk', 'shop', 'settings', 'tutorial', 'alohomora', 'racing', 'drive', 'race',
        'accelerate', 'brake', 'boost', 'position', 'pause', 'resume', 'shoot', 'eat',
        'equip', 'hunger', 'examine', 'search', 'take', 'get', 'use', 'cast', 'spell',
        'flee', 'defend', 'pit', 'quit', 'left', 'right', 'forward'
    ]);

    function levenshtein(a, b) {
        const m = [];
        for (let i = 0; i <= b.length; i++) m[i] = [i];
        for (let j = 0; j <= a.length; j++) m[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                m[i][j] = b[i - 1] === a[j - 1]
                    ? m[i - 1][j - 1]
                    : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
            }
        }
        return m[b.length][a.length];
    }

    function guessCommand(raw) {
        const c = String(raw || '').toLowerCase().trim();
        if (!c || c.includes(' ')) return null;
        if (EXACT_TOKENS.has(c)) return c;
        if (c.length <= 3) return null;
        const maxDist = c.length <= 5 ? 1 : 2;
        let best = null, score = maxDist + 1;
        for (const cmd of COMMANDS) {
            if (cmd.includes(' ')) continue;
            if (Math.abs(cmd.length - c.length) > maxDist) continue;
            const d = levenshtein(c, cmd);
            if (d > 0 && d < score) { score = d; best = cmd; }
        }
        return score <= maxDist ? best : null;
    }

    function shootArrow(game) {
        const arrows = game.state.inventory.find(i => /silver arrow/i.test(i.name || i.id || ''));
        if (!arrows || arrows.quantity < 1) {
            game.addNarrative('You have no silver arrows to shoot.', 'system');
            return;
        }
        const bow = game.state.player.leftHand && /bow/i.test(game.state.player.leftHand);
        const arrowData = window.WorldData.items['silver arrow'] || arrows;
        const bowData = Object.values(window.WorldData.items).find(i => i.name === game.state.player.leftHand);
        const dmg = (arrowData.damage || 16) + (bow && bowData ? (bowData.damage || 0) : 0);
        arrows.quantity--;
        if (arrows.quantity <= 0) game.state.inventory = game.state.inventory.filter(i => i !== arrows);
        if (game.state.inCombat && game.state.enemy) {
            game.applyEnemyDamage?.(dmg, `You ${bow ? 'loose' : 'hurl'} a silver arrow for {damage} damage!`);
            window.MusicSystem?.playSFX?.('attack');
            if (game.state.enemy.hp <= 0) game.enemyDefeated?.();
            else game.enemyAttack?.();
        } else {
            game.addNarrative(`You ${bow ? 'loose' : 'hurl'} a silver arrow. It flies true and is spent. Anyone may shoot these; you have ${arrows.quantity || 0} left.`, 'item');
        }
        game.updateHUD?.();
        game.save?.();
    }

    function bind() {
        const G = window.Game;
        if (!G || G._v30Items) return false;
        G._v30Items = true;
        applyCatalog();

        const prevUse = G.useItem.bind(G);
        G.useItem = function (name) {
            const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(name || '').toLowerCase()));
            if (item && (item.type === 'food' || item.effect === 'hunger')) return eatFood(this, item);
            return prevUse(name);
        };

        const prevEquip = G.equipItem.bind(G);
        G.equipItem = function (name) {
            const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(name || '').toLowerCase()));
            if (!item) return prevEquip(name);
            const slot = slotOf(item);
            if (!SLOTS.includes(slot) && !['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory'].includes(item.type)) {
                return prevEquip(name);
            }
            const p = this.state.player;
            p.gearSlots = p.gearSlots || {};
            if (SLOTS.includes(slot)) {
                p.gearSlots[slot] = item.name;
                p[slot] = item.name;
                if (item.type === 'weapon' && slot === 'rightHand') {
                    p.weapon = item.name;
                    p.weaponDamage = item.damage || p.weaponDamage;
                }
                if (slot === 'chest' && item.defense) {
                    p.armor = item.name;
                    p.defense = item.defense;
                }
                this.addNarrative(`You equip ${item.name} on your ${SLOT_LABEL[slot]}. ${describeItem(item)}`, 'item');
                this.updateHUD?.();
                this.save?.();
                return;
            }
            return prevEquip(name);
        };

        const prevExam = G.examineInventoryItem?.bind(G);
        G.examineInventoryItem = function (query) {
            const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(query || '').toLowerCase()))
                || Object.values(window.WorldData.items).find(i => i.name.toLowerCase().includes(String(query || '').toLowerCase()));
            if (item) { this.addNarrative(describeItem(item), 'item'); return item; }
            return prevExam ? prevExam(query) : null;
        };

        const prevMove = G.move.bind(G);
        G.move = function (dir) {
            const r = prevMove(dir);
            hungerTick(this, 3);
            return r;
        };

        const prevCmd = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            const c = String(raw || '').trim().toLowerCase();
            if (c === 'hunger' || c === 'satiety') {
                const p = hungerState(this);
                const full = p.satiety >= 80 ? 'You are full.' : p.satiety >= 45 ? 'You are not hungry.' : p.satiety >= 20 ? 'You are getting hungry.' : 'You are hungry. Eat food to restore strength.';
                this.addNarrative(full, 'system');
                return;
            }
            if (c === 'shoot' || c.startsWith('shoot ') || c === 'fire arrow' || c === 'loose arrow') {
                shootArrow(this);
                return;
            }
            const guessed = guessCommand(c);
            if (guessed && guessed !== c) {
                this.addNarrative(`I heard “${c}”. Treating that as “${guessed}”.`, 'system');
                return prevCmd(guessed);
            }
            return prevCmd(raw);
        };

        setInterval(() => { if (G.state?.player && G.state.screen === 'game-screen') hungerTick(G, 1); }, 45000);

        window.ItemHunger = { describeItem, guessCommand, hungerTick, eatFood, findCarriedItem, NEW_ITEMS, SLOTS };
        console.log('v30 hunger, real gear slots, thorium spear, silver arrows, fuzzy commands');
        return true;
    }

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let n = 0;
        const t = setInterval(() => { if (bind() || ++n > 50) clearInterval(t); }, 80);
    }
})();
