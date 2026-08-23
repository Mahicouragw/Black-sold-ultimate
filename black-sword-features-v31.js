/**
 * v31 — Black Sword-style search, palace ceremony actions, rope/torch,
 * handed weapons, 10 basic + 10 advanced sets, initiative.
 */
(() => {
    'use strict';

    const BASIC_SETS = [
        { id: 'wolf', name: 'Wolf', two: { defense: 2, dex: 2, initiative: 2 }, four: { damage: 3, str: 2 } },
        { id: 'raven', name: 'Raven', two: { int: 2, initiative: 3 }, four: { mp: 8, dex: 2 } },
        { id: 'boar', name: 'Boar', two: { str: 3, hp: 8 }, four: { defense: 4 } },
        { id: 'oak', name: 'Oak', two: { defense: 3, wis: 1 }, four: { hp: 12 } },
        { id: 'river', name: 'River', two: { mp: 6, water: 2 }, four: { int: 3 } },
        { id: 'ember', name: 'Ember', two: { fire: 3, str: 1 }, four: { damage: 4 } },
        { id: 'linen', name: 'Linen', two: { dex: 2, initiative: 1 }, four: { mp: 6 } },
        { id: 'ironwatch', name: 'Ironwatch', two: { defense: 4 }, four: { str: 3, hp: 10 } },
        { id: 'hunter', name: 'Hunter', two: { dex: 3, initiative: 2 }, four: { damage: 3 } },
        { id: 'pilgrim', name: 'Pilgrim', two: { wis: 3, hp: 6 }, four: { mp: 10 } }
    ];
    const ADV_SETS = [
        { id: 'direwolf', name: 'Direwolf', two: { str: 4, dex: 3, initiative: 3 }, four: { damage: 8, defense: 4 } },
        { id: 'stormcrow', name: 'Stormcrow', two: { int: 4, initiative: 4 }, four: { mp: 16, water: 4 } },
        { id: 'ashen', name: 'Ashen', two: { fire: 5, str: 3 }, four: { damage: 10 } },
        { id: 'tide', name: 'Tideborn', two: { water: 5, wis: 3 }, four: { mp: 18 } },
        { id: 'sunplate', name: 'Sunplate', two: { defense: 6, hp: 12 }, four: { str: 5 } },
        { id: 'nightmail', name: 'Nightmail', two: { defense: 5, dex: 4 }, four: { initiative: 6 } },
        { id: 'runekeeper', name: 'Runekeeper', two: { int: 5, mp: 12 }, four: { wis: 5 } },
        { id: 'thorn', name: 'Thorn', two: { damage: 5, dex: 3 }, four: { str: 4 } },
        { id: 'glacier', name: 'Glacier', two: { defense: 7, water: 3 }, four: { hp: 20 } },
        { id: 'phoenix', name: 'Phoenix', two: { fire: 6, hp: 10 }, four: { mp: 14, damage: 6 } }
    ];

    const PIECES = [
        ['gloves', 'Gloves', 'gloves'],
        ['cape', 'Cape', 'back'],
        ['mask', 'Mask', 'face'],
        ['hood', 'Hood', 'head'],
        ['belt', 'Belt', 'waist']
    ];

    function registerSets() {
        const WD = window.WorldData;
        if (!WD?.items) return;
        const add = (set, advanced) => {
            PIECES.forEach(([piece, label, slot], idx) => {
                const id = `${set.id} ${piece}`;
                if (WD.items[id]) return;
                WD.items[id] = {
                    name: `${set.name} ${label}`,
                    type: piece === 'gloves' ? 'gloves' : piece === 'hood' || piece === 'mask' ? 'armor' : 'accessory',
                    slot,
                    set: set.name,
                    setId: set.id,
                    advanced: !!advanced,
                    defense: advanced ? 3 + idx : 1 + idx,
                    value: advanced ? 180 + idx * 20 : 40 + idx * 12,
                    desc: `${advanced ? 'Advanced' : 'Basic'} ${set.name} set ${label.toLowerCase()}. Wear two pieces of this set for a set bonus. Slot: ${slot}. Unique to the ${set.name} kit.`
                };
            });
        };
        BASIC_SETS.forEach(s => add(s, false));
        ADV_SETS.forEach(s => add(s, true));

        Object.assign(WD.items, {
            'hemp rope': {
                name: 'Hemp Rope', type: 'tool', value: 8,
                desc: 'Fifty feet of laid hemp rope. Type use rope to climb a drop, pull a companion, or bind a chest lid. It is not food and not a weapon.'
            },
            'pine torch': {
                name: 'Pine Torch', type: 'weapon', weaponType: 'blunt', hands: 'right', slot: 'rightHand',
                damage: 6, fire: 4, value: 5,
                desc: 'A pine brand soaked in pitch. Hold it in the right hand. It lights dark rooms and burns for 6 impact plus 4 fire if you strike with it.'
            },
            'round shield': {
                name: 'Round Shield', type: 'shield', hands: 'left', slot: 'leftHand', defense: 6, value: 55,
                desc: 'A limewood round shield with a rawhide rim. Left hand only. It does not swing as a sword.'
            },
            'heater shield': {
                name: 'Heater Shield', type: 'shield', hands: 'left', slot: 'leftHand', defense: 9, value: 95,
                desc: 'A kite-cut heater shield of oak and iron. Left hand only.'
            },
            'steel greatsword': {
                name: 'Steel Greatsword', type: 'weapon', weaponType: 'sword', hands: 'both',
                slot: 'rightHand', damage: 34, str: 4, value: 380,
                desc: 'A two-handed longsword. Equipping it occupies both hands. You cannot hold a shield at the same time.'
            },
            'parrying dagger': {
                name: 'Parrying Dagger', type: 'weapon', weaponType: 'knife', hands: 'left',
                slot: 'leftHand', damage: 8, dex: 3, initiative: 2, value: 70,
                desc: 'A left-hand dagger with a wide guard. Left hand only. Raises initiative.'
            },
            'leather face mask': {
                name: 'Leather Face Mask', type: 'armor', slot: 'face', defense: 2, value: 22,
                desc: 'A hardened leather mask covering nose and cheeks. Face slot.'
            },
            'steel war mask': {
                name: 'Steel War Mask', type: 'armor', slot: 'face', defense: 5, dex: -1, value: 110,
                desc: 'A visored steel war-mask. Face slot. You see less; cuts stop more often.'
            },
            'horn-rim spectacles': {
                name: 'Horn-rim Spectacles', type: 'accessory', slot: 'eyes', int: 3, value: 35,
                desc: 'Real horn-rimmed lenses. Eyes equipment. They help you read runes, not stop a mace.'
            },
            'silver left earring': {
                name: 'Silver Left Earring', type: 'accessory', slot: 'leftEar', dex: 1, initiative: 1, value: 18,
                desc: 'A silver hoop for the left ear. Left earring slot.'
            },
            'silver right earring': {
                name: 'Silver Right Earring', type: 'accessory', slot: 'rightEar', int: 1, value: 18,
                desc: 'A silver hoop for the right ear. Right earring slot.'
            },
            'chainmail hauberk': {
                name: 'Chainmail Hauberk', type: 'armor', slot: 'chest', defense: 10, value: 200,
                desc: 'A riveted iron mail shirt to mid-thigh. Chest. Buy it in a weapon shop. Historical mail, not a costume.'
            }
        });

        if (!WD.items.rope) WD.items.rope = { ...WD.items['hemp rope'], name: 'Rope' };
        if (WD.items.torch) {
            Object.assign(WD.items.torch, {
                type: 'weapon', hands: 'right', slot: 'rightHand', damage: 5, fire: 3,
                desc: 'A pitch torch. Hold in the right hand. Lights the way and deals a little fire damage in a fight.'
            });
        }
        const loc = WD.locations.kaliwasch;
        if (loc) {
            ['hemp rope', 'pine torch', 'round shield'].forEach(id => {
                if (!loc.items.includes(id)) loc.items.push(id);
            });
        }
        const stock = window.ExpansionData?.shopStock;
        if (stock?.weapons) {
            ['chainmail hauberk', 'round shield', 'heater shield', 'steel greatsword', 'parrying dagger', 'pine torch'].forEach(id => {
                if (WD.items[id] && !stock.weapons.some(s => s.id === id)) stock.weapons.push({ id, price: WD.items[id].value });
            });
        }
    }

    function setDef(name) {
        return BASIC_SETS.concat(ADV_SETS).find(s => s.name === name || s.id === name);
    }

    function applySetBonuses(game) {
        const p = game.state.player;
        if (!p) return;
        const prev = p._v31Applied || { str: 0, dex: 0, int: 0, wis: 0, hp: 0, mp: 0, defense: 0, initiative: 0 };
        ['str', 'dex', 'int', 'wis'].forEach(k => { p[k] = (p[k] || 0) - (prev[k] || 0); });
        if (prev.hp) { p.maxHp = Math.max(1, (p.maxHp || 1) - prev.hp); p.hp = Math.min(p.hp || 1, p.maxHp); }
        if (prev.mp) { p.maxMp = Math.max(0, (p.maxMp || 0) - prev.mp); p.mp = Math.min(p.mp || 0, p.maxMp); }
        p.baseInitiative = Number.isFinite(p.baseInitiative) ? p.baseInitiative : (p.initiative || 10);
        p.baseDefense = Number.isFinite(p.baseDefense) ? p.baseDefense : ((p.defense || 0) - (prev.defense || 0));

        const worn = [];
        const slots = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory', 'rightHand', 'leftHand', 'head', 'face', 'back', 'waist', 'eyes', 'leftEar', 'rightEar'];
        slots.forEach(k => { if (p[k] && p[k] !== '(holding two-handed)') worn.push(p[k]); });
        Object.entries(p.gearSlots || {}).forEach(([, n]) => { if (n && n !== '(holding two-handed)') worn.push(n); });
        const uniqueWorn = [...new Set(worn)];
        const counts = {};
        uniqueWorn.forEach(n => {
            const item = Object.values(window.WorldData.items).find(i => i.name === n);
            if (item?.set) counts[item.set] = (counts[item.set] || 0) + 1;
        });
        const next = { str: 0, dex: 0, int: 0, wis: 0, hp: 0, mp: 0, defense: 0, initiative: 0 };
        let dmg = 0, fire = 0, water = 0;
        const lines = [];
        const addBonus = (obj) => {
            Object.entries(obj || {}).forEach(([k, v]) => {
                const n = Number(v) || 0;
                if (k === 'defense') next.defense += n;
                else if (k === 'damage') dmg += n;
                else if (k === 'initiative') next.initiative += n;
                else if (k === 'fire') fire += n;
                else if (k === 'water') water += n;
                else if (next[k] != null) next[k] += n;
            });
        };
        Object.entries(counts).forEach(([set, n]) => {
            const defn = setDef(set);
            if (!defn) return;
            if (n >= 2 && defn.two) { addBonus(defn.two); lines.push(`${set} (2): set bonus`); }
            if (n >= 4 && defn.four) { addBonus(defn.four); lines.push(`${set} (4): greater bonus`); }
        });
        ['str', 'dex', 'int', 'wis'].forEach(k => { p[k] = (p[k] || 0) + next[k]; });
        if (next.hp) { p.maxHp = (p.maxHp || 0) + next.hp; }
        if (next.mp) { p.maxMp = (p.maxMp || 0) + next.mp; }
        p.setDefenseBonus = next.defense;
        p.setDamageBonus = dmg;
        p.fireBonus = fire;
        p.waterBonus = water;
        p.initiative = p.baseInitiative + next.initiative + Math.floor((p.dex || 0) / 5);
        p.defense = p.baseDefense + next.defense;
        p.activeSets = lines;
        p._v31Applied = next;
    }

    function useRope(game) {
        const rope = game.state.inventory.find(i => /rope/i.test(i.name || i.id || ''));
        if (!rope) { game.addNarrative('You have no rope.', 'system'); return; }
        const loc = window.WorldData.locations[game.state.location];
        const climb = loc && (loc.exits?.up || loc.exits?.down || /cliff|well|pit|peak|dungeon/i.test(loc.name + loc.description));
        if (game.state.inCombat) {
            game.addNarrative('You lash with the hemp rope. A monster is briefly tangled. Initiative helps you act first next exchange.', 'combat');
            game.state.player.initiative = (game.state.player.initiative || 10) + 2;
            return;
        }
        if (climb) {
            game.addNarrative('You make the hemp rope fast and climb. The drop is passable. Use up or down if a path is listed.', 'item');
            return;
        }
        game.addNarrative('You coil the hemp rope. There is nothing here that needs climbing or binding. Keep it for pits, cliffs, and wells.', 'item');
    }

    function showCeremonyPanel(game) {
        const s = game.state.sacred || {};
        let bar = document.getElementById('ceremony-actions');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ceremony-actions';
            bar.className = 'inline-combat-actions';
            bar.setAttribute('role', 'group');
            bar.setAttribute('aria-label', 'Palace ceremony attribute choices');
            document.getElementById('game-area')?.appendChild(bar);
        }
        const pending = (s.pendingPalaceAdvancements || 0) > 0 || (s.unspentAttributePoints || 0) > 0;
        const here = game.state.location === 'royal_palace';
        if (!here || !pending) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
        bar.classList.remove('hidden');
        const attrs = ['strength', 'dexterity', 'intelligence', 'wisdom', 'vitality', 'health', 'initiative'];
        bar.innerHTML = `<p>Advancement ceremony. Choose an attribute to extend.</p>` +
            attrs.map(a => `<button type="button" class="combat-action-btn" data-attr="${a}">Increase ${a}</button>`).join('');
        bar.querySelectorAll('[data-attr]').forEach(btn => {
            btn.addEventListener('click', () => {
                const a = btn.getAttribute('data-attr');
                if ((s.pendingPalaceAdvancements || 0) > 0) game.palaceCeremony?.();
                if (a === 'initiative') {
                    const p = game.state.player;
                    if ((game.state.sacred.unspentAttributePoints || 0) < 1) {
                        game.addNarrative('No Palace attribute points. Complete the ceremony first.', 'system');
                        return;
                    }
                    p.baseInitiative = (p.baseInitiative || p.initiative || 10) + 2;
                    p.initiative = (p.initiative || 10) + 2;
                    game.state.sacred.unspentAttributePoints--;
                    game.addNarrative('Palace bonus applied to initiative. You will tend to act sooner.', 'treasure');
                    game.save?.();
                } else game.increaseAttribute?.(a);
                showCeremonyPanel(game);
            });
        });
        game.addNarrative('Ceremony actions are on screen. Increase dexterity or another attribute.', 'system');
    }

    function blackSearch(game, query) {
        const q = String(query || '').trim().toLowerCase();
        const hits = [];
        if (!q) {
            game.addNarrative('Black Search. Type search [word], or use the Search button. Examples: search palace, search rope, search black sword, search wolf set.', 'system');
            return;
        }
        Object.entries(window.WorldData.locations || {}).forEach(([id, loc]) => {
            if ((loc.name + loc.description + id).toLowerCase().includes(q)) hits.push(`Place: ${loc.name}.`);
        });
        Object.values(window.WorldData.items || {}).forEach(item => {
            if ((item.name + (item.desc || '')).toLowerCase().includes(q)) hits.push(`Item: ${item.name}. ${(item.desc || '').slice(0, 120)}`);
        });
        Object.values(window.WorldData.npcs || {}).flat().forEach(n => {
            if (n.name.toLowerCase().includes(q)) hits.push(`Person: ${n.name}, ${n.role}.`);
        });
        if (/black sword|blacksword/.test(q)) hits.unshift('The Black Sword waits in the Shadow Chamber beneath the dungeon. Type wayfinder or travel if you know the road.');
        const unique = [...new Set(hits)].slice(0, 8);
        game.addNarrative(unique.length ? `Black Search for “${q}”: ${unique.join(' ')}` : `Black Search found nothing for “${q}”.`, 'location');
    }

    function openSearchPrompt(game) {
        const dlg = document.getElementById('black-search-dialog');
        const input = document.getElementById('black-search-input');
        const status = document.getElementById('black-search-status');
        if (!dlg || !input) {
            game.addNarrative('Black Search. Type search [word]. Example: search palace.', 'system');
            return;
        }
        dlg.classList.remove('hidden');
        if (status) status.textContent = '';
        input.value = '';
        input.focus();
        const run = () => {
            const q = input.value.trim();
            dlg.classList.add('hidden');
            blackSearch(game, q);
            if (status) status.textContent = q ? `Searched for ${q}.` : 'Search cancelled.';
            document.getElementById('cmd-input')?.focus();
        };
        const submit = document.getElementById('black-search-submit');
        const cancel = document.getElementById('black-search-cancel');
        if (submit && !submit._v31) {
            submit._v31 = true;
            submit.addEventListener('click', () => {
                const G = window.Game;
                const q = input.value.trim();
                dlg.classList.add('hidden');
                blackSearch(G, q);
                document.getElementById('cmd-input')?.focus();
            });
            cancel?.addEventListener('click', () => {
                dlg.classList.add('hidden');
                document.getElementById('cmd-input')?.focus();
            });
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { ev.preventDefault(); submit.click(); }
                if (ev.key === 'Escape') { ev.preventDefault(); cancel?.click(); }
            });
        }
        void run;
    }

    function bind() {
        const G = window.Game;
        if (!G || G._v31Black) return false;
        G._v31Black = true;
        registerSets();

        const searchBtn = document.getElementById('btn-black-search');
        if (searchBtn && !searchBtn._v31) {
            searchBtn._v31 = true;
            searchBtn.addEventListener('click', () => openSearchPrompt(G));
        }

        const prevEquip = G.equipItem.bind(G);
        G.equipItem = function (name) {
            const item = this.state.inventory.find(i => i.name.toLowerCase().includes(String(name || '').toLowerCase()));
            const p = this.state.player;
            if (item && p) {
                p.gearSlots = p.gearSlots || {};
                const catalog = Object.values(window.WorldData.items).find(i => i.name === item.name) || item;
                const hands = catalog.hands || item.hands;
                const slot = catalog.slot || item.slot;
                const twoHanded = hands === 'both' || p.leftHand === '(holding two-handed)';
                if (hands === 'both' && (p.leftHand && p.leftHand !== '(holding two-handed)')) {
                    this.addNarrative(`You cannot wield ${item.name} while ${p.leftHand} occupies the left hand. Unequip the left hand first.`, 'system');
                    return;
                }
                if ((hands === 'left' || slot === 'leftHand') && twoHanded && p.rightHand && p.rightHand !== item.name) {
                    this.addNarrative(`A two-handed weapon occupies both hands. Unequip ${p.rightHand} before using the left hand.`, 'system');
                    return;
                }
                if (slot && ['head', 'face', 'eyes', 'leftEar', 'rightEar', 'back', 'waist', 'leftHand', 'rightHand'].includes(slot)) {
                    p[slot] = item.name;
                    p.gearSlots[slot] = item.name;
                    const labels = { head: 'Head equipment', face: 'Mask', eyes: 'Eyes equipment', leftEar: 'Left earring', rightEar: 'Right earring', back: 'Back', waist: 'Waist', leftHand: 'Left hand', rightHand: 'Right hand' };
                    if (hands === 'both') {
                        p.rightHand = item.name;
                        p.leftHand = '(holding two-handed)';
                        p.gearSlots.rightHand = item.name;
                        p.gearSlots.leftHand = item.name;
                        p.weapon = item.name;
                        if (item.damage) p.weaponDamage = item.damage;
                    }
                    if (hands === 'right' || slot === 'rightHand') {
                        p.rightHand = item.name;
                        p.weapon = item.name;
                        if (item.damage) p.weaponDamage = item.damage;
                    }
                    this.addNarrative(`Equipped ${item.name} in ${labels[slot] || slot}.`, 'item');
                    applySetBonuses(this);
                    this.updateHUD?.(); this.save?.();
                    return;
                }
                if (hands === 'both') {
                    p.rightHand = item.name;
                    p.leftHand = '(holding two-handed)';
                    p.gearSlots.rightHand = item.name;
                    p.gearSlots.leftHand = item.name;
                    p.weapon = item.name;
                    if (item.damage) p.weaponDamage = item.damage;
                    this.addNarrative(`${item.name} needs both hands. The left hand is occupied.`, 'item');
                    applySetBonuses(this);
                    this.updateHUD?.(); this.save?.();
                    return;
                }
            }
            const r = prevEquip(name);
            applySetBonuses(this);
            return r;
        };

        const prevAttack = G.playerAttack?.bind(G);
        if (prevAttack) {
            G.playerAttack = function () {
                const extra = (this.state.player.setDamageBonus || 0) + (this.state.player.fireBonus || 0);
                if (this.state.enemy && extra) this.state.enemy._pendingBonus = extra;
                return prevAttack();
            };
        }

        const prevStart = G.startCombat.bind(G);
        G.startCombat = function (name, queued) {
            const p = this.state.player;
            p.initiative = p.initiative || 10;
            prevStart(name, queued);
            if (this.state.enemy && (p.initiative || 0) >= 16) {
                this.addNarrative('Your initiative is high. You strike first.', 'combat');
            }
        };

        const prevEnter = G.enterLocation.bind(G);
        G.enterLocation = function (id) {
            prevEnter(id);
            showCeremonyPanel(this);
        };

        const prevCer = G.palaceCeremony?.bind(G);
        if (prevCer) {
            G.palaceCeremony = function () {
                prevCer();
                showCeremonyPanel(this);
            };
        }

        const prevCmd = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            const c = String(raw || '').trim().toLowerCase();
            if (c === 'search' || c === 'black search' || c === 'find') { blackSearch(this, ''); return; }
            if (c.startsWith('search ') || c.startsWith('find ') || c.startsWith('black search ')) {
                blackSearch(this, c.replace(/^(black search|search|find)\s+/, ''));
                return;
            }
            if (c === 'use rope' || c === 'rope' || c.startsWith('use hemp')) { useRope(this); return; }
            if (c === 'sets' || c === 'equipment sets') {
                this.addNarrative(`Sets: ${BASIC_SETS.map(s => s.name).join(', ')} (basic); ${ADV_SETS.map(s => s.name).join(', ')} (advanced). Wear two pieces for a bonus. Initiative is ${this.state.player.initiative || 10}.`, 'item');
                return;
            }
            if (c === 'ceremony' || c === 'level ceremony') { showCeremonyPanel(this); return; }
            return prevCmd(raw);
        };

        window.BlackSwordFeatures = { blackSearch, useRope, BASIC_SETS, ADV_SETS, applySetBonuses, showCeremonyPanel };
        console.log('v31 Black Search, ceremony actions, rope/torch, 20 sets, initiative');
        return true;
    }

    if (!bind()) {
        document.addEventListener('DOMContentLoaded', bind);
        let n = 0;
        const t = setInterval(() => { if (bind() || ++n > 50) clearInterval(t); }, 80);
    }
})();
