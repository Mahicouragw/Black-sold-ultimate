/* 7.61.0 — Real world objects for gestures.
 *
 * Chests: three chests authored into rooms that already talk about them
 * (Eastern Ruins "hidden chest", Goblin Camp "treasure pile", Witch's Hut
 * shelves). Each holds real catalogue items, is opened once, keeps what is
 * left, and is saved with the hero. The Christmas toy chest keeps its own
 * existing command and is surfaced as an object, not re-implemented.
 *
 * Doors: rune doors (game.js specialDoor, opened with Alohomora or broken with
 * Multiple Strike) and the Christmas vault are surfaced with their real
 * requirement. House doors stay in the base object list.
 *
 * Ground loot: an item can be dropped where the hero stands. The drop removes
 * one from the bag and stores the snapshot in the hero save, so it survives a
 * reload and can be picked up again by gesture.
 */
(function () {
    'use strict';

    const G = () => window.Game;
    const speak = text => window.GestureAccessibility?.speak?.(text, false, 'system');
    const lower = value => String(value || '').toLowerCase();
    const place = () => window.WorldData?.locations?.[G()?.state?.location]?.name || 'this room';

    const CHESTS = {
        ruins: {
            id: 'ruins_chest', name: 'Ancient Chest', locked: true, key: 'skeleton key',
            summary: 'An ancient wooden chest bound in bronze, older than the ruins around it.',
            loot: [{ id: 'chainmail', quantity: 1 }, { id: 'blessed amulet', quantity: 1 }, { id: 'sky feather', quantity: 2 }]
        },
        goblin_camp: {
            id: 'goblin_treasure', name: 'Treasure Pile', locked: false,
            summary: 'A heap of stolen goods beside the goblin cooking fire.',
            loot: [{ id: 'stolen gold', quantity: 2 }, { id: 'iron ore', quantity: 2 }]
        },
        witch_hut: {
            id: 'witch_supply_chest', name: 'Supply Chest', locked: false,
            summary: 'A low chest of bottles and bandages under the witch’s shelves.',
            loot: [{ id: 'healing potion', quantity: 1 }, { id: 'mana potion', quantity: 1 }, { id: 'fairy dust', quantity: 1 }]
        }
    };

    function heroState() {
        const state = G()?.state;
        if (!state) return null;
        state.worldChests = state.worldChests || {};
        state.groundLoot = state.groundLoot || {};
        return state;
    }

    function chestAt(location) {
        const def = CHESTS[location];
        if (!def) return null;
        const state = heroState();
        if (!state) return null;
        if (!state.worldChests[def.id]) {
            state.worldChests[def.id] = {
                opened: false,
                remaining: def.loot.map(entry => ({ id: entry.id, quantity: entry.quantity }))
            };
        }
        return { def, stored: state.worldChests[def.id] };
    }

    const itemData = id => window.WorldData?.items?.[id] || {};
    const itemName = id => itemData(id).name || id;
    const carried = id => (G()?.state?.inventory || []).find(item => item.id === id && (item.quantity || 0) > 0) || null;

    function hasKey(def) {
        if (!def.key) return false;
        return Boolean(carried(def.key));
    }

    function contentsSpeech(def, stored) {
        const left = stored.remaining.filter(entry => entry.quantity > 0);
        if (!left.length) return `${def.name} is empty now.`;
        return `${def.name} holds ${left.map(entry => `${entry.quantity} ${itemName(entry.id)}`).join(', ')}.`;
    }

    function announceChest(location) {
        const found = chestAt(location);
        if (!found) return false;
        const { def, stored } = found;
        const status = stored.opened ? contentsSpeech(def, stored) : def.locked && !hasKey(def) ? 'It is locked. It needs the Skeleton Key.' : 'It is closed, and not locked.';
        speak(`${def.summary} ${status}`, false, 'system');
        return true;
    }

    function openChest(location, { silent = false } = {}) {
        const found = chestAt(location);
        if (!found) { if (!silent) speak(`There is no chest in ${place()}.`); return false; }
        const { def, stored } = found;
        if (stored.opened) {
            if (!silent) speak(contentsSpeech(def, stored), false, 'system');
            return true;
        }
        if (def.locked && !hasKey(def)) {
            if (!silent) speak(`${def.name} is locked. It needs the Skeleton Key, which you do not carry. Nothing was opened.`, false, 'system');
            return false;
        }
        stored.opened = true;
        G()?.save?.();
        if (!stored.opened) return false;
        if (!silent) {
            const keyLine = def.locked ? ' The Skeleton Key turns and the lock gives way; the key stays in your bag.' : '';
            speak(`${def.name} opens.${keyLine} ${contentsSpeech(def, stored)}`, false, 'system');
        }
        return true;
    }

    function collect(location, itemId) {
        const found = chestAt(location);
        if (!found) return speak(`There is no chest in ${place()}.`);
        const { def, stored } = found;
        if (!stored.opened) return speak(`${def.name} is still closed. Open it first.`);
        const entry = stored.remaining.find(row => row.id === itemId && row.quantity > 0);
        if (!entry) return speak(`There is no ${itemName(itemId)} left in ${def.name}.`);
        const data = itemData(itemId);
        if (!data.name) return speak('That item is not in the game catalogue, so it cannot be collected.');
        const before = carried(itemId)?.quantity || 0;
        G().addItemToInventory(itemId, data);
        entry.quantity -= 1;
        if (entry.quantity <= 0) stored.remaining = stored.remaining.filter(row => row.quantity > 0);
        G().save?.();
        const after = carried(itemId)?.quantity || 0;
        if (after <= before) return speak(`${itemName(itemId)} was not added to your bag. Nothing was taken.`);
        speak(`Collected ${itemName(itemId)}. You now carry ${after}. ${def.name} ${stored.remaining.length ? 'still holds' : 'is empty'}.`, false, 'system');
        G().checkQuests?.('collect', itemId);
    }

    /* ───────────── ground loot ───────────── */

    function groundHere() {
        const state = heroState();
        if (!state) return [];
        state.groundLoot[state.location] = state.groundLoot[state.location] || [];
        return state.groundLoot[state.location];
    }

    async function drop(item) {
        const state = heroState();
        if (!state || !item) return { ok: false };
        const index = state.inventory.findIndex(row => row.id === item.id);
        if (index < 0) return { ok: false };
        const before = state.inventory[index].quantity || 0;
        if (before <= 0) return { ok: false };
        const snapshot = { ...state.inventory[index] };
        snapshot.quantity = 1;
        state.inventory[index].quantity = before - 1;
        if (state.inventory[index].quantity <= 0) state.inventory.splice(index, 1);
        groundHere().push({ id: snapshot.id, name: snapshot.name, quantity: 1, data: snapshot });
        G().save?.();
        const after = state.inventory.find(row => row.id === item.id)?.quantity || 0;
        if (after >= before) return { ok: false };
        G().addNarrative?.(`You set down one ${snapshot.name}. It lies on the ground in ${place()}.`, 'item');
        return { ok: true, where: place(), remaining: after };
    }

    function takeGround(name) {
        const list = groundHere();
        if (!list.length) return false;
        const query = lower(name);
        const at = list.findIndex(entry => lower(entry.name).includes(query) || lower(entry.id).includes(query));
        if (at < 0) return false;
        const entry = list[at];
        const data = entry.data || itemData(entry.id);
        if (!data?.name) return false;
        const before = carried(entry.id)?.quantity || 0;
        G().addItemToInventory(entry.id, data);
        list.splice(at, 1);
        G().save?.();
        const after = carried(entry.id)?.quantity || 0;
        if (after <= before) { speak(`${entry.name} stayed on the ground. It could not be added to your bag.`); return true; }
        G().emitGameEvent?.(`Picked up one ${entry.name} from the ground.`, 'item', { sfx: ['pickup'] });
        speak(`Picked up ${entry.name}. You now carry ${after}.`, false, 'system');
        return true;
    }

    /* ───────────── object descriptions ───────────── */

    function chestEntry(location) {
        const found = chestAt(location);
        if (!found) return null;
        const { def, stored } = found;
        const left = stored.remaining.filter(row => row.quantity > 0);
        const status = stored.opened
            ? (left.length ? `open, holding ${left.map(row => `${row.quantity} ${itemName(row.id)}`).join(', ')}` : 'open and empty')
            : def.locked ? 'locked, and it needs the Skeleton Key' : 'closed but not locked';
        return {
            label: def.name, kind: 'chest',
            describe: `${def.summary} It is here in ${place()}, ${status}.`,
            run: () => {
                const opened = openChest(location);
                if (!opened) return;
                if (!window.GestureModes) return;
                window.GestureModes.refreshFocus();
                const at = window.GestureModes.objects().findIndex(entry => entry.kind === 'loot' && entry.chestId === def.id);
                if (at >= 0) {
                    window.GestureAccessibility.UI.focusIndex = at;
                    const loot = window.GestureModes.objects()[at];
                    window.GestureAccessibility.speak(`First item: ${loot.describe} Double tap to collect it.`, false, 'system');
                }
            }
        };
    }

    function lootEntries(location) {
        const found = chestAt(location);
        if (!found || !found.stored.opened) return [];
        const { def, stored } = found;
        return stored.remaining.filter(row => row.quantity > 0).map(row => ({
            label: itemName(row.id), kind: 'loot', chestId: def.id, itemId: row.id,
            describe: `${itemName(row.id)}, ${row.quantity} left in ${def.name}, here in ${place()}. Can be collected. ${itemData(row.id).desc || ''}`.trim(),
            run: () => collect(location, row.id)
        }));
    }

    function doorEntries(location) {
        const loc = window.WorldData?.locations?.[location];
        const list = [];
        const door = loc?.specialDoor;
        if (door) {
            const magical = Boolean(door.magical);
            const what = door.open ? 'open' : magical ? 'locked by rune magic' : 'locked';
            list.push({
                label: `rune door to the ${door.direction}`, kind: 'door',
                describe: `A runed door to the ${door.direction}. It is ${what}. ${door.open ? 'You can walk through it.' : magical ? 'Alohomora opens it; Multiple Strike can break it.' : 'It needs magic to open.'}`,
                run: () => {
                    if (door.open) return speak('The rune door is already open. Walk through it with a swipe.');
                    if (!magical) return speak('This door does not answer to Alohomora. It stays locked.');
                    G()?.processCommand?.('alohomora');
                }
            });
        }
        if (location === 'starlight_toy_vault') {
            const opened = Boolean(G()?.state?.player?.advent?.toyChest);
            list.push({
                label: 'toy chest', kind: 'chest',
                describe: `The toymaker’s wooden chest, here in ${place()}. ${opened ? 'It is open and empty.' : 'It is closed; the Christmas command opens it.'}`,
                run: () => G()?.processCommand?.('christmas open chest')
            });
        }
        return list;
    }

    function nearby() {
        const state = G()?.state;
        if (!state?.location || !window.WorldData) return [];
        const location = state.location;
        const list = [];
        const chest = chestEntry(location);
        if (chest) list.push(chest);
        list.push(...lootEntries(location));
        for (const entry of groundHere()) {
            list.push({
                label: entry.name, kind: 'ground', itemId: entry.id,
                describe: `One ${entry.name} lying on the ground in ${place()}. Can be picked up.`,
                run: () => takeGround(entry.name)
            });
        }
        list.push(...doorEntries(location));
        return list;
    }

    /* ───────────── commands, saves and hooks ───────────── */

    const game = G();
    if (game) {
        if (typeof game.processCommand === 'function') {
            const previous = game.processCommand.bind(game);
            game.processCommand = function (command) {
                const text = lower(command).trim();
                if (text === 'open chest' || text === 'chest' || text === 'inspect chest') {
                    const location = this.state.location;
                    if (!chestAt(location)) {
                        // The Christmas toy chest owns its own command and wording.
                        if (location === 'starlight_toy_vault') return previous('christmas open chest');
                        this.addNarrative?.(`There is no chest in ${place()}.`, 'system');
                        speak(`There is no chest in ${place()}.`, false, 'system');
                        return;
                    }
                    if (text === 'inspect chest') { announceChest(location); return; }
                    openChest(location);
                    return;
                }
                if (text.startsWith('take ') && takeGround(text.slice(5))) return;
                if (text === 'drop here') {
                    const item = this.state.inventory?.[0];
                    if (!item) { speak('Your bag is empty.'); return; }
                    speak('Choose the item in Inventory mode, then long press for Drop.');
                    return;
                }
                return previous(command);
            };
        }
        if (typeof game.getSaveData === 'function') {
            const previous = game.getSaveData.bind(game);
            game.getSaveData = function () {
                const data = previous();
                data.worldChests = this.state.worldChests || {};
                data.groundLoot = this.state.groundLoot || {};
                return data;
            };
        }
        if (typeof game.continueGame === 'function') {
            const previous = game.continueGame.bind(game);
            game.continueGame = function () {
                const ok = previous();
                if (!ok) return ok;
                const roster = this.getRoster?.();
                const id = this.state.activeHeroId;
                const data = (id && roster?.heroes?.[id]) || {};
                this.state.worldChests = data.worldChests && typeof data.worldChests === 'object' ? data.worldChests : (this.state.worldChests || {});
                this.state.groundLoot = data.groundLoot && typeof data.groundLoot === 'object' ? data.groundLoot : (this.state.groundLoot || {});
                return ok;
            };
        }
    }

    window.WorldChests = { CHESTS, chestAt, announceChest, openChest, collect, contentsSpeech, hasKey };
    window.GroundLoot = { drop, take: takeGround, groundHere };
    window.WorldObjects = { nearby, doorEntries, lootEntries, chestEntry };
})();
