/* 7.61.0 — Gesture contexts.
 *
 * One active gesture mode at a time. A gesture is interpreted by exactly one
 * context, so a swipe can never trigger two actions. Movement gestures keep
 * working exactly as they did in 7.60.0: this file wraps the existing
 * GestureAccessibility.UI.handle and only takes the tokens that belong to the
 * active context.
 *
 * Contexts: exploration, combat, inventory, object, chess, snakes, ludo.
 * Chess, Snakes & Ladders and Ludo live in gesture-board-games-v761.js, which
 * publishes window.GestureBoard. Nothing here invents game state: every
 * sentence is read back from the real inventory, equipment, world or board
 * engine after the real action ran.
 */
(function () {
    'use strict';

    const api = window.GestureAccessibility;
    if (!api) return;
    const { UI, speak } = api;
    const G = () => window.Game;

    const MODES = ['exploration', 'combat', 'inventory', 'object', 'chess', 'snakes', 'ludo'];
    const CATEGORIES = ['Weapons', 'Armour', 'Healing', 'Magic', 'Keys', 'Quest', 'Materials', 'Miscellaneous'];
    const state = { mode: 'exploration', setAt: 0 };

    const inventory = { open: false, ci: 0, ii: 0, categories: [], closing: false };

    const lower = value => String(value || '').toLowerCase();
    const items = () => (G()?.state?.inventory || []).filter(item => item && (item.quantity || 0) > 0);

    /* ───────────── real item facts ───────────── */

    function categoryOf(item) {
        const id = lower(item.id || item.name), type = lower(item.type);
        if (/key/.test(id) || /key/.test(lower(item.name))) return 'Keys';
        if (item.questItem || type === 'quest' || type === 'artifact') return 'Quest';
        if (['weapon', 'shield', 'ammo'].includes(type) || /sword|axe|bow|dagger|mace|spear|staff|club|hammer/.test(id)) return 'Weapons';
        if (['armor', 'helmet', 'gloves', 'boots', 'accessory', 'ring', 'cloak', 'robe'].includes(type)) return 'Armour';
        if (['potion', 'food'].includes(type) || item.effect === 'heal' || item.effect === 'both' || item.effect === 'hunger') return 'Healing';
        if (item.effect === 'mana' || type === 'scroll' || type === 'spell') return 'Magic';
        if (['material', 'ore', 'herb', 'wood', 'leather', 'cloth', 'treasure'].includes(type)) return 'Materials';
        return 'Miscellaneous';
    }

    function slotOf(item) {
        if (item.slot) return item.slot;
        if (item.type === 'weapon') return 'rightHand';
        if (item.type === 'armor') return 'chest';
        if (item.type === 'accessory') return 'neck';
        return null;
    }

    const SLOT_LABEL = {
        rightHand: 'main hand', leftHand: 'off hand', head: 'head', face: 'face', ears: 'ears',
        neck: 'neck', chest: 'body', back: 'back', waist: 'waist', legs: 'legs', fingers: 'fingers'
    };

    function equipped(item) {
        const p = G()?.state?.player || {};
        return Object.values(p.gearSlots || {}).includes(item.name)
            || ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory', 'shield', 'rightHand', 'leftHand', 'head', 'chest']
                .some(key => p[key] === item.name);
    }

    function occupant(slot, item) {
        if (!slot) return null;
        const p = G()?.state?.player || {};
        const name = p.gearSlots?.[slot] || p[slot]
            || (slot === 'rightHand' ? p.weapon : slot === 'chest' ? p.armor : null);
        return name && name !== item.name ? name : null;
    }

    const canEquip = item => Boolean(slotOf(item)) || ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory', 'shield'].includes(lower(item.type));
    const canUse = item => ['heal', 'mana', 'both', 'hunger'].includes(item.effect) || ['food', 'potion', 'ring'].includes(lower(item.type)) || /rope/i.test(item.id || '');
    const unique = item => Boolean(item.unique || item.artifact || item.questItem || lower(item.type) === 'quest' || lower(item.type) === 'artifact');
    const canDrop = item => !equipped(item) && !unique(item);

    function describeItem(item) {
        if (!item) return 'Nothing selected.';
        const bits = [`${item.name}`];
        const category = categoryOf(item);
        bits.push(category + '.');
        bits.push(`Quantity ${item.quantity || 1}.`);
        if (item.desc) bits.push(item.desc);
        if (item.damage) bits.push(`Damage ${item.damage}.`);
        if (item.defense) bits.push(`Defense ${item.defense}.`);
        ['str', 'dex', 'int', 'wis', 'hp', 'mp'].forEach(key => { if (item[key]) bits.push(`${key.toUpperCase()} ${item[key] > 0 ? 'plus ' : 'minus '}${Math.abs(item[key])}.`); });
        if (item.value) bits.push(`Value ${item.value} gold.`);
        const slot = slotOf(item);
        if (slot) bits.push(`Worn on the ${SLOT_LABEL[slot] || slot}. ${equipped(item) ? 'Currently equipped.' : 'Not equipped.'}`);
        bits.push(canEquip(item) ? 'Can be equipped.' : 'Cannot be equipped.');
        bits.push(canUse(item) ? 'Usable.' : 'Not usable here.');
        bits.push(canDrop(item) ? 'Can be dropped.' : 'Protected: it will not be dropped.');
        if (item.combines || item.combineWith) bits.push('Can be combined.');
        if (item.requires || item.level) bits.push(`Requires ${item.requires || 'level ' + item.level}.`);
        return bits.join(' ');
    }

    /* ───────────── modes ───────────── */

    function announceMode(mode) {
        const text = {
            exploration: 'Exploration mode. Swipe up to walk, left and right to turn, two finger left or right to hear what is nearby.',
            combat: 'Combat mode. Up right attacks, up left casts the chosen spell, down right defends, down left heals.',
            inventory: 'Inventory mode. Two finger left and right change category, up and down change item, double tap inspects, long press opens actions, two finger swipe down goes back, two finger tap closes.',
            object: 'Object mode. Two finger left and right choose an object, double tap acts on it, two finger swipe down cancels.',
            chess: 'Chess mode. Swipes move around the board, double tap selects or confirms, two finger tap cancels, circle reads the board.',
            snakes: 'Snakes and Ladders mode. Double tap rolls the die, left and right browse players, circle reads the board.',
            ludo: 'Ludo mode. Double tap rolls, left and right browse tokens, double tap chooses then confirms, circle reads the board.'
        }[mode];
        if (text) speak(text, false, 'system');
    }

    function set(mode, { silent = false } = {}) {
        if (!MODES.includes(mode)) return state.mode;
        const changed = state.mode !== mode;
        state.mode = mode;
        state.setAt = Date.now();
        if (changed && !silent) announceMode(mode);
        document.dispatchEvent(new CustomEvent('bsu-gesture-mode', { detail: { mode } }));
        return state.mode;
    }

    function current() {
        const board = window.GestureBoard?.active?.();
        if (board) return board;
        if (inventory.open) return 'inventory';
        if (G()?.state?.inCombat) return 'combat';
        if (UI.focusList?.length && UI.focusIndex >= 0) return 'object';
        return 'exploration';
    }

    function sync({ silent = true } = {}) {
        const next = current();
        if (next !== state.mode) set(next, { silent });
        return state.mode;
    }

    /* ───────────── inventory browsing ───────────── */

    function buildCategories() {
        const carried = items();
        const grouped = CATEGORIES.map(name => ({
            name,
            items: carried.filter(item => categoryOf(item) === name)
        })).filter(group => group.items.length > 0);
        return grouped;
    }

    function currentGroup() { return inventory.categories[inventory.ci] || null; }
    function currentItem() {
        const group = currentGroup();
        return group ? group.items[inventory.ii] || null : null;
    }

    function summary() {
        const group = currentGroup();
        if (!group) return 'Your bag is empty.';
        return `${group.name}, ${group.items.length} ${group.items.length === 1 ? 'kind' : 'kinds'}. ${describeItem(currentItem())}`;
    }

    function open() {
        if (!G()?.state?.player) return speak('Load a hero before opening the inventory.');
        inventory.categories = buildCategories();
        inventory.ci = 0; inventory.ii = 0; inventory.open = true;
        set('inventory', { silent: true });
        if (!inventory.categories.length) { speak('Inventory mode. Your bag is empty.'); return; }
        speak(`Inventory mode. ${summary()}`, false, 'system');
    }

    function close({ to = 'exploration' } = {}) {
        inventory.open = false;
        UI.clearFocus?.();
        set(G()?.state?.inCombat ? 'combat' : to, { silent: true });
        speak('Inventory closed. ' + (G()?.state?.inCombat ? 'Combat mode.' : 'Exploration mode.'), false, 'system');
    }

    function browseCategory(step) {
        if (!inventory.categories.length) return speak('Your bag is empty.');
        inventory.ci = (inventory.ci + step + inventory.categories.length) % inventory.categories.length;
        inventory.ii = 0;
        speak(summary(), false, 'system');
    }

    function browseItem(step) {
        const group = currentGroup();
        if (!group) return speak('Your bag is empty.');
        inventory.ii = (inventory.ii + step + group.items.length) % group.items.length;
        speak(`${inventory.ii + 1} of ${group.items.length}. ${describeItem(currentItem())}`, false, 'system');
    }

    function inspect() {
        const item = currentItem();
        if (!item) return speak('Nothing selected.');
        speak(describeItem(item), false, 'system');
        G()?.examineInventoryItem?.(item.name);
    }

    function remember() { return { item: currentItem(), quantity: currentItem()?.quantity || 0 }; }

    function equip(item) {
        if (!item || !canEquip(item)) return speak(`${item?.name || 'That'} cannot be equipped.`);
        if (!G()?.state?.inventory?.includes(item)) return speak('That item is no longer carried.');
        const slot = slotOf(item);
        const replaced = occupant(slot, item);
        if (replaced) speak(`Replacing ${replaced} on your ${SLOT_LABEL[slot] || slot}.`, false, 'system');
        const offline = typeof G().equipItem !== 'function';
        if (offline) return speak('The game cannot equip items right now.');
        G().equipItem(item.name);
        const now = equipped(item);
        const p = G().state.player || {};
        if (!now) {
            const reason = UI.lastNarrative?.() || 'the game refused the change';
            return speak(`${item.name} was not equipped. ${reason}`, false, 'system');
        }
        const after = [];
        if (p.weapon) after.push(`weapon ${p.weapon}`);
        if (p.weaponDamage) after.push(`damage ${p.weaponDamage}`);
        if (p.defense !== undefined) after.push(`defense ${p.defense}`);
        speak(`Equipped ${item.name} on your ${SLOT_LABEL[slot] || slot}. Now ${after.join(', ') || 'equipped'}.`, false, 'system');
        G().updateHUD?.();
    }

    function unequip(item) {
        if (!item) return;
        if (!equipped(item)) return speak(`${item.name} is not equipped.`);
        if (typeof G().unequipItem !== 'function') return speak('The game cannot change equipment right now.');
        G().unequipItem(item.name);
        const p = G().state.player || {};
        if (equipped(item)) return speak(`${item.name} is still equipped. The change did not happen.`);
        speak(`Unequipped ${item.name}. Weapon ${p.weapon || 'none'}, damage ${p.weaponDamage || 0}, defense ${p.defense ?? 0}.`, false, 'system');
    }

    async function use(item) {
        if (!item) return;
        if (!canUse(item)) return speak(`${item.name} is not a usable item.`);
        const p = G().state.player || {};
        const before = { hp: p.hp, mp: p.mp, quantity: item.quantity };
        if (typeof UI.execute === 'function') await UI.execute(() => G().processCommand(`use ${item.name}`));
        else G().processCommand(`use ${item.name}`);
        const after = G().state.player || {};
        const parts = [];
        if (after.hp !== before.hp) parts.push(`health ${before.hp} to ${after.hp}`);
        if (after.mp !== before.mp) parts.push(`magic ${before.mp} to ${after.mp}`);
        const left = (G().state.inventory.find(i => i.id === item.id)?.quantity) ?? 0;
        if (left !== before.quantity) parts.push(`${left} left`);
        if (!parts.length) {
            const reason = UI.lastNarrative?.() || 'nothing changed';
            return speak(`Using ${item.name} changed nothing. ${reason}`, false, 'system');
        }
        speak(`Used ${item.name}. ${parts.join('. ')}.`, false, 'system');
    }

    async function drop(item) {
        if (!item) return;
        if (!canDrop(item)) {
            const why = equipped(item) ? 'It is equipped. Unequip it first.' : 'It is a quest or unique item and is protected.';
            return speak(`${item.name} cannot be dropped. ${why}`, false, 'system');
        }
        const before = item.quantity || 0;
        const where = G()?.state?.location;
        const place = window.WorldData?.locations?.[where]?.name || 'this room';
        let result = null;
        if (window.GroundLoot?.drop) {
            const copy = item;
            const run = async () => { result = await window.GroundLoot.drop(copy); };
            if (typeof UI.execute === 'function') await UI.execute(run); else await run();
        } else if (typeof G().dropPublicItem === 'function') {
            await G().dropPublicItem(item.name);
        }
        const after = (G().state.inventory.find(i => i.id === item.id)?.quantity) ?? 0;
        if (after >= before) {
            return speak(`${item.name} was not dropped. Public loot needs a connection; it is still in your bag.`, false, 'system');
        }
        speak(result?.where
            ? `Dropped one ${item.name} in ${place}. It is on the ground here. ${after} left.`
            : `Dropped one ${item.name} in ${place} as public loot. ${after} left.`, false, 'system');
    }

    function actions() {
        const item = currentItem();
        if (!item) return speak('Nothing selected.');
        const choices = [];
        const option = (label, run) => ({ label, run });
        choices.push(option(`Inspect ${item.name}`, () => inspect()));
        if (canUse(item)) choices.push(option(`Use ${item.name}`, () => use(item)));
        if (canEquip(item) && !equipped(item)) choices.push(option(`Equip ${item.name}`, () => equip(item)));
        if (equipped(item)) choices.push(option(`Unequip ${item.name}`, () => unequip(item)));
        if (canDrop(item)) choices.push(option(`Drop one ${item.name}`, () => {
            const place = window.WorldData?.locations?.[G().state.location]?.name || 'this room';
            UI.confirm(`Drop one ${item.name} in ${place}? It will lie on the ground here and can be picked up again.`, () => drop(item));
        }));
        choices.push(option('Back to the item', () => backToBrowser()));
        UI.open(`${item.name}. ${categoryOf(item)}. Choose an action, then double tap.`, choices);
    }

    function backToBrowser() {
        UI.menu = null; UI.stack = []; UI.render?.();
        speak(summary(), false, 'system');
    }

    function onMenuClose() {
        if (!inventory.open) return;
        if (!UI.menu) { inventory.categories = buildCategories(); inventory.ci = Math.min(inventory.ci, Math.max(0, inventory.categories.length - 1)); inventory.ii = Math.min(inventory.ii, Math.max(0, (currentGroup()?.items.length || 1) - 1)); speak(summary(), false, 'system'); }
    }

    /* ───────────── object mode ───────────── */

    /** A picked-up item is only announced after the bag really holds it. */
    function pickup(entry) {
        return {
            ...entry,
            run() {
                const location = window.WorldData?.locations?.[G()?.state?.location];
                const stillHere = (location?.items || []).some(id => (window.WorldData.items?.[id]?.name || id) === entry.label);
                if (!stillHere) return speak(`${entry.label} is no longer on the ground here.`, false, 'system');
                entry.run();
                const stack = G()?.state?.inventory?.find(item => item.name === entry.label);
                if (!stack) return speak(`${entry.label} did not go into your bag. The game refused the pickup.`, false, 'system');
                speak(`Collected ${entry.label}. You now carry ${stack.quantity}.`, false, 'system');
            }
        };
    }

    function objects() {
        const list = [];
        for (const entry of UI.nearbyObjects?.() || []) list.push(entry.kind === 'item' ? pickup(entry) : entry);
        for (const entry of window.WorldObjects?.nearby?.() || []) list.push(entry);
        return list;
    }

    function refreshFocus() {
        UI.focusList = objects();
        if (UI.focusIndex >= UI.focusList.length) UI.focusIndex = UI.focusList.length - 1;
        return UI.focusList;
    }

    function cancelFocus() {
        UI.clearFocus?.();
        set(G()?.state?.inCombat ? 'combat' : 'exploration', { silent: true });
        speak('Object browsing closed. Back to exploration.', false, 'system');
    }

    /* ───────────── routing ───────────── */

    const baseHandle = UI.handle.bind(UI);

    function inventoryToken(token) {
        if (UI.menu) {
            const before = UI.menu;
            baseHandle(token);
            if (before && !UI.menu) onMenuClose();
            return;
        }
        if (token === 'two-left') return browseCategory(-1);
        if (token === 'two-right') return browseCategory(1);
        if (token === 'up') return browseItem(-1);
        if (token === 'down') return browseItem(1);
        if (token === 'double') return inspect();
        if (token === 'hold' || token === 'long') return actions();
        if (token === 'go_down' || token === 'two-down') return close();
        if (token === 'two-tap') return close();
        if (token === 'cancel') return close();
        if (token === 'tap') return speak(summary(), false, 'system');
        return speak('Inventory mode. Two finger left and right change category, up and down change item, double tap inspects, long press opens actions, two finger tap closes.');
    }

    UI.handle = function (token) {
        if (!this.active()) return baseHandle(token);

        // Board games own their tokens while a game is on the table.
        if (window.GestureBoard?.active?.()) {
            if (window.GestureBoard.handle(token)) return;
            return baseHandle(token);
        }

        if (inventory.open) return inventoryToken(token);

        // Object mode only adds a way out; browsing still runs through the
        // existing focus code so there is exactly one implementation.
        if (state.mode === 'object' && (token === 'go_down' || token === 'two-down')) return cancelFocus();

        const wasFocus = UI.focusList?.length ? UI.focusIndex : -1;
        const result = baseHandle(token);

        // Entering object browsing switches the context, never the action.
        if ((token === 'two-left' || token === 'two-right') && UI.focusIndex >= 0 && UI.focusIndex !== wasFocus) {
            refreshFocus();
            set('object', { silent: true });
        }
        if (token === 'double' && wasFocus >= 0 && !UI.focusList?.length) set(G()?.state?.inCombat ? 'combat' : 'exploration', { silent: true });
        if (['up', 'down', 'left', 'right', 'circle'].includes(token) && state.mode === 'object' && !UI.focusList?.length) {
            set(G()?.state?.inCombat ? 'combat' : 'exploration', { silent: true });
        }
        return result;
    };

    /* Combat mode follows the real fight state; it is never guessed. */
    function watchCombat() {
        let fighting = Boolean(G()?.state?.inCombat);
        setInterval(() => {
            const now = Boolean(G()?.state?.inCombat);
            if (now === fighting) return;
            fighting = now;
            if (inventory.open) return;
            sync({ silent: false });
        }, 700);
    }

    window.GestureModes = {
        MODES, CATEGORIES,
        state, inventory,
        current, set, sync,
        open, close, browseCategory, browseItem, inspect, actions, summary,
        describeItem, categoryOf, slotOf, equipped, canEquip, canUse, canDrop, unique,
        equip, unequip, use, drop,
        objects, refreshFocus, cancelFocus,
        handle: token => UI.handle(token)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchCombat, { once: true });
    else watchCombat();
})();
