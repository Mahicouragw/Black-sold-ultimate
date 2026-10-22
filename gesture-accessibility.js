/** Independent gesture interface. Adapts the shipped Game; never owns rewards or combat. */
(() => {
    'use strict';
    const G = window.Game, A = window.AudioManager;
    if (!G || !A) return;
    const $ = id => document.getElementById(id);
    const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
    const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
    const KEY = 'black_sword_gestures_v1';
    const defaults = Object.freeze({ up: 'north', down: 'south', left: 'west', right: 'east',
        'down-right': 'context', 'up-right': 'magic', 'up-left': 'interact', 'down-left': 'navigation',
        double: 'interact', 'two-tap': 'inventory', hold: 'sit', 'two-hold': 'lie' });
    const names = { north: 'Move north', south: 'Move south', west: 'Move west', east: 'Move east',
        context: 'Context or combat actions', magic: 'Magic and healing', interact: 'Interact',
        navigation: 'Directions and routes', inventory: 'Inventory', sit: 'Sit', lie: 'Lie down',
        reference: 'Gesture reference', repeat: 'Repeat speech', stop: 'Stop walking' };
    const saved = read(KEY, {});
    const settings = { narration: !!saved.narration, interval: Math.max(450, Math.min(2500, Number(saved.interval) || 800)), map: { ...defaults } };
    for (const key of Object.keys(defaults)) if (names[saved.map?.[key]]) settings.map[key] = saved.map[key];
    const persist = () => write(KEY, settings);
    const visible = el => {
        if (!el) return false;
        for (let n = el; n && n !== document; n = n.parentElement) {
            if (n.hidden || n.classList.contains('hidden') || n.getAttribute('aria-hidden') === 'true' || getComputedStyle(n).display === 'none') return false;
        }
        return true;
    };
    const loc = () => window.WorldData.locations[G.state.location];
    const option = (label, run) => ({ label, run });
    const command = text => () => UI.execute(() => G.processCommand(text));
    const speak = (text, critical = false, channel = '') => {
        if (!settings.narration) return Promise.resolve(false);
        return A.playVoice(String(text), { channel, priority: critical === true ? 'critical' : critical === 'high' ? true : false });
    };

    // All ordinary narrative paths now feed the existing shared speech queue.
    // emitGameEvent and the professional timeline also feed it; queue deduplication
    // prevents those callers from speaking a second copy of the same event.
    const oldNarrative = G.addNarrative;
    G.addNarrative = function(text, type) {
        const result = oldNarrative.call(this, text, type);
        if (settings.narration && !UI.suppressLocation && !(UI.walking && (type === 'location' || /^Available directions:/.test(String(text))))) speak(text, /you have died|you awaken|health is low|^You encountered /i.test(String(text)) ? true : type === 'combat' ? 'high' : false, type === 'location' ? 'location' : '');
        return result;
    };

    const UI = {
        menu: null, index: 0, stack: [], walking: false, suppressLocation: false, busy: false,
        active() { return window.InterfaceMode?.current === 'blind'; },
        save() { persist(); },
        enable() {
            if ($('gesture-launch')) document.body.append($('gesture-launch'));
            settings.narration = true; persist(); A.init(); A.setVoiceEnabled(true); A.resumeVoice();
            window.InterfaceMode?.apply('blind');
            this.sync();
            speak('Accessible Gesture Mode. Built-in speech does not need TalkBack. Swipe up or down in menus, double tap to choose, swipe left to go back. Two finger swipe cancels.');
            this.open('Welcome', [option('Start optional gesture tutorial', () => this.tutorial(0)), option('Continue to game controls', () => this.controls())]);
        },
        sync() {
            const overlay = $('gesture-interface');
            overlay.hidden = !this.active();
            const box = $('gesture-narration'); if (box) box.checked = settings.narration;
        },
        open(title, choices, { push = true, page = 0 } = {}) {
            if (choices.length > 8) {
                const all = choices, start = page * 8;
                choices = all.slice(start, start + 8);
                const baseTitle = title;
                if (start + 8 < all.length) choices.push(option('Next page', () => this.open(baseTitle, all, { push: false, page: page + 1 })));
                if (page) choices.push(option('Previous page', () => this.open(baseTitle, all, { push: false, page: page - 1 })));
                title += `, page ${page + 1} of ${Math.ceil(all.length / 8)}`;
            }
            Gestures.stop(); G.cancelPendingMovement?.();
            if (settings.narration) A.stopVoice();
            if (push && this.menu) this.stack.push({ menu: this.menu, index: this.index });
            this.menu = { title, choices: [...choices, option('Return to game controls', () => this.close())] }; this.index = 0;
            this.render();
            // Speak every action on opening, in bounded chunks rather than silently truncating.
            const labels = choices.map((c, i) => `${i + 1}. ${c.label}.`);
            speak(title + `. ${choices.length} options. Swipe down for next, up for previous, double tap to choose. Left goes back.`);
            let line = '';
            for (const label of labels) { if (line.length + label.length > 500) { speak(line); line = ''; } line += label + ' '; }
            if (line) speak(line);
        },
        render() {
            if (!$('gesture-heading')) return;
            $('gesture-heading').textContent = this.menu?.title || 'World gestures';
            const choice = this.menu?.choices[this.index];
            $('gesture-selection').textContent = choice ? `${this.index + 1} of ${this.menu.choices.length}. ${choice.label}` : 'Swipe to move. Diagonal down-right for actions. Two finger tap for inventory. Two finger swipe cancels.';
        },
        close() { this.menu = null; this.stack = []; this.render(); speak('World gestures. Movement ready.'); },
        back() {
            Gestures.stop(); G.cancelPendingMovement?.();
            if (this.stack.length) { const p = this.stack.pop(); this.menu = p.menu; this.index = p.index; this.render(); speak(this.menu.title + '. ' + this.menu.choices[this.index].label); }
            else this.close();
        },
        browse(delta) {
            if (!this.menu) return;
            this.index = (this.index + delta + this.menu.choices.length) % this.menu.choices.length; this.render();
            speak(this.menu.choices[this.index].label, true);
        },
        choose() { const c = this.menu?.choices[this.index]; if (c) c.run(); },
        async execute(fn) {
            if (this.busy) { speak('An action is still completing.'); return; }
            Gestures.stop(); this.menu = null; this.stack = []; this.render(); this.busy = true;
            try { await fn(); } catch (error) { console.warn('Gesture action failed', error); speak('The action could not be completed. No success is assumed.'); }
            finally { this.busy = false; }
            if (this.active() && document.querySelector('.panel:not(.hidden)')) this.controls();
        },
        handle(token) {
            if (!this.active()) return;
            if (token === 'cancel') { this.back(); return; }
            if (this.menu) {
                if (['up', 'right'].includes(token)) this.browse(-1);
                else if (token === 'down') this.browse(1);
                else if (token === 'left') this.back();
                else if (token === 'double') this.choose();
                else if (token === 'tap') speak(this.menu.choices[this.index].label, true);
                return;
            }
            if (token === 'tap') { A.repeatVoice(); return; }
            const action = settings.map[token];
            if (['north', 'south', 'east', 'west'].includes(action)) return this.move(action);
            if (action === 'context') return this.context();
            if (action === 'magic') return this.magic();
            if (action === 'inventory') return this.inventory();
            if (action === 'navigation') return this.navigation();
            if (action === 'interact') return this.context(); // never guesses among unrelated objects
            if (action === 'sit' || action === 'lie') return this.posture(action);
            if (action === 'reference') return this.reference();
            if (action === 'repeat') return A.repeatVoice();
            if (action === 'stop') Gestures.stop();
        },
        move(direction) {
            if (G.state.screen !== 'game-screen' || !G.state.player) { this.controls(); return; }
            if (this.menu || this.busy || G._movementPending) return;
            if ([...document.querySelectorAll('.panel,[role="dialog"]')].some(visible)) { Gestures.stop(); this.controls(); return; }
            if (G.state.player.gesturePosture) { speak('Stand up before walking. Open contextual actions.'); Gestures.stop(); return; }
            if (G.state.inCombat || G.state.combatTransition) { speak('You cannot walk during combat. Open down-right for combat actions, including flee.'); Gestures.stop(); return; }
            if (!loc()?.exits?.[direction]) { speak(`Blocked. No path ${direction} from ${loc()?.name}.`); Gestures.stop(); return; }
            G.processCommand(direction);
        },
        context() {
            if (!G.state.player || G.state.screen !== 'game-screen') return this.controls();
            if (G.state.inCombat) {
                const targets = G.aliveEncounterTargets?.() || [];
                return this.open('Combat actions. ' + this.combatDescription(), [
                    option('Attack current enemy', command('attack')), option('Defend', command('defend')),
                    option('Flee', command('flee')), option('Magic and healing', () => this.magic()), option('Inventory', () => this.inventory()),
                    ...targets.map(t => option(`Attack ${t.name}`, command(`attack ${t.name}`))),
                    option('Repeat health and enemy status', () => speak(this.combatDescription()))
                ]);
            }
            const l = loc(), choices = [option('Describe current location', command('look')), option('Directions and routes', () => this.navigation())];
            if (l.houseExterior || l.privateOwnerDoor) {
                if (l.exits.up) choices.push(option('Close door', command('close door')));
                else if (!l.privateOwnerDoor || G.state.housing?.houses?.[l.privateOwnerDoor]) choices.push(option('Open door', command('open door')));
                else choices.push(option('Inspect locked owner-only door', () => speak('This door is locked. Only its owner can enter.')));
            }
            if (l.specialDoor?.magical && !l.specialDoor.open) choices.push(option('Inspect magical door', () => speak('A runed magical door blocks the ' + l.specialDoor.direction + ' passage.')), option('Door magic', () => this.magic()));
            for (const [dir, id] of Object.entries(l.exits || {})) if (['up', 'down'].includes(dir)) choices.push(option(`${dir} to ${WorldData.locations[id]?.name}`, command(dir)));
            if (l.shop) choices.push(option('Browse shop', () => this.shop()), option('Sell carried items', () => this.sell()));
            for (const npc of WorldData.npcs[G.state.location] || []) choices.push(option(`Talk to ${npc.name}`, command(`talk ${npc.name}`)));
            for (const id of l.items || []) {
                const item = WorldData.items[id];
                if (!item || item.hidden && !G.state.parity?.discoveredItems?.includes(`${G.state.location}:${id}`)) continue;
                choices.push(option(`Collect ${item.name}`, command(`take ${item.name}`)));
            }
            if (G.state.player.gesturePosture) choices.push(option('Stand up or wake up', () => this.posture('stand')));
            if (furniture(G.state.location).seat) choices.push(option('Sit', () => this.posture('sit')));
            if (furniture(G.state.location).bed) choices.push(option('Lie down', () => this.posture('lie')));
            if (G.state.location === G.currentCityDefinition?.()?.targets.tavern) choices.push(option('Rest at tavern — 10 gold, restores health and magic', command('rest')));
            if (G.state.location === 'arcane_enchantery') choices.push(option('Permanent equipment enchantments', () => this.enchantments()));
            // Reuse extra context buttons (temple blessings, fishing, ceremonies and storage).
            G.updateContextActions?.();
            for (const btn of document.querySelectorAll('#context-actions button, #ceremony-actions button')) if (visible(btn) && !btn.disabled && !/door|shop|list items|rest/i.test(btn.textContent)) choices.push(option(btn.textContent, () => this.execute(() => btn.click())));
            choices.push(option('Quests and objective hints', () => this.open('Quests', [option('Read quests', () => { command('quests')(); speak($('quest-list').textContent); }), option('Next objective hint', command('hint'))])),
                option('Search location for undiscovered objects', command('search location')), option('Inspect public ground loot', () => this.execute(() => G.showPublicLoot())),
                option('All visible controls', () => this.controls()), option('Gesture reference', () => this.reference()), option('Narrator and interface settings', () => this.preferences()));
            this.open(`Actions at ${l.name}`, choices);
        },
        combatDescription() {
            const e = G.state.enemy;
            // Encounters are co-located entities, not a spatial arena. Never fabricate bearings.
            return `${G.battleStatusText?.() || ''} ${e ? `${e.name} is in your current location. Enemy compass position is not supplied by this game.` : 'The next enemy may be advancing.'}`;
        },
        inventory() {
            if (!G.state.player) return this.controls();
            const items = G.state.inventory || [];
            this.open(`Inventory. ${items.reduce((n, i) => n + (i.quantity || 0), 0)} items in ${items.length} stacks`, items.map(i => option(itemLabel(i), () => this.itemActions(i))));
        },
        itemActions(item) {
            if (!G.state.inventory.includes(item)) { speak('That item is no longer carried.'); return this.inventory(); }
            const actions = [option('Inspect ' + item.name, () => { G.examineInventoryItem(item.name); G.showInventoryItemDetails(item.name); })];
            const use = ['heal', 'mana', 'both', 'hunger'].includes(item.effect) || ['food', 'ring'].includes(item.type) || /rope/i.test(item.id);
            if (use) actions.push(option('Use ' + item.name + (item.mp ? `, requires ${item.mp} mana in combat` : ''), () => this.execute(() => {
                const before = item.quantity; G.processCommand(`use ${item.name}`);
                if (item.quantity !== before) speak(`${item.name}: ${Math.max(0, item.quantity)} remaining.`);
            })));
            if (equipped(item)) actions.push(option('Unequip ' + item.name, () => this.execute(() => G.unequipItem(item.name))));
            if (['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory', 'shield'].includes(item.type)) actions.push(option('Equip ' + item.name, command(`equip ${item.name}`)));
            if (item.id === 'silver arrow') actions.push(option('Shoot or throw one silver arrow', () => this.confirm('Spend one silver arrow?', command('shoot'))));
            // No generic Throw: old engine aliases it to public drop, not a projectile.
            if (!equipped(item) && item.type !== 'quest' && !item.questItem && item.type !== 'artifact') actions.push(option('Drop one as public loot', () => this.confirm(`Drop one ${item.name}? Other players can take it.`, () => this.execute(async () => { if (!G.state.inventory.includes(item) || equipped(item)) return speak('Item availability changed. Reopen inventory.'); await G.dropPublicItem(item.name); speak(`${item.name}: ${Math.max(0, item.quantity)} remaining.`); }))));
            actions.push(option('Back to inventory', () => this.inventory()));
            this.open(itemLabel(item), actions);
        },
        confirm(text, fn) { this.open(text, [option('Cancel, keep item', () => this.back()), option('Confirm', fn)]); },
        magic() {
            if (!G.state.player) return this.controls();
            this.open(`Magic and healing. ${G.state.player.mp} mana`, (G.state.player.spells || []).map(name => {
                const info = spellInfo(name);
                return option(`${name}. ${info}`, () => this.open(`${name}. ${info}`, [option(`Cast ${name}`, command(`cast ${name}`)), option('Inspect spell', () => G.examineSpell(name)), option('Cancel spell', () => this.back())]));
            }));
        },
        shop() {
            const l = loc(); if (!l?.shop) { speak('No shop here.'); return; }
            this.open(`${l.name} shop. ${G.state.player.gold} gold`, (window.ExpansionData?.shopStock[l.shop] || []).map(s => option(`${WorldData.items[s.id]?.name || s.id}, ${s.price} gold`, () => this.confirm(`Buy one for ${s.price} gold?`, command(`buy 1 ${WorldData.items[s.id]?.name || s.id}`)))));
        },
        sell() {
            this.open('Sell one carried item', G.state.inventory.filter(i => !equipped(i) && i.type !== 'quest' && !i.questItem && i.type !== 'artifact').map(i => option(`${i.name}, ${Math.max(1, Math.floor((i.value || i.damage || 10) * .35))} gold`, () => this.confirm(`Sell one ${i.name}?`, command(`sell 1 ${i.name}`)))));
        },
        enchantments() {
            this.open('Permanent runes. No duration limit. At the Enchantery only.', G.state.inventory.filter(i => ['weapon', 'armor', 'accessory'].includes(i.type)).map(i => option(i.name, () => {
                const cost = 100 + Object.values(i.enchantments || {}).reduce((a, b) => a + b, 0) * 75;
                this.open(`Enchant ${i.name}. Each choice costs ${cost} gold. No ingredients required.`, ['strength', 'dexterity', 'intelligence', 'wisdom', 'health', 'magic'].map(attr => option(`${attr} plus ${['health', 'magic'].includes(attr) ? 15 : 10}, permanent, ${cost} gold`, () => this.confirm(`Apply ${attr} rune to ${i.name}?`, () => this.execute(() => G.enchantItem(i.id, attr))))));
            })));
        },
        navigation() {
            if (!G.state.player) return this.controls();
            const l = loc();
            speak(`You are at ${l.name}. ${Object.entries(l.exits || {}).map(([dir, id]) => `${dir} leads to ${WorldData.locations[id]?.name}`).join('. ')}.`);
            const choices = Object.entries(l.exits || {}).map(([dir, id]) => option(`${dir} to ${WorldData.locations[id]?.name}`, command(dir)));
            const city = G.currentCityDefinition?.();
            for (const [key, id] of Object.entries(city?.targets || {})) choices.push(option(`Route to ${WorldData.locations[id]?.name || key}`, () => {
                const route = G.findPhysicalRoute(G.state.location, id);
                if (!route) return speak('No open physical route. A door may be closed.');
                this.destination = id;
                speak(route.length ? `${route.length} steps. ${G.formatPhysicalRoute(route)}. These are route steps, not a straight-line compass bearing.` : 'You are already here.');
                this.open('Route guidance', [option('Walk next route step', () => this.routeStep()), option('Cancel route', () => { this.destination = null; this.close(); })]);
            }));
            if (this.destination) choices.push(option('Next route step', () => this.routeStep()));
            this.open(`Navigation from ${l.name}`, choices);
        },
        routeStep() {
            const route = G.findPhysicalRoute(G.state.location, this.destination);
            if (!route) return speak('Route is blocked. Reopen navigation.');
            if (!route.length) return speak('Destination reached.');
            this.close(); this.move(route[0]);
        },
        posture(action) {
            if (!G.state.player) return;
            if (G.state.inCombat || G.state.combatTransition || G._movementPending) return speak('Finish moving or combat before changing posture.');
            const f = furniture(G.state.location);
            if (action !== 'stand' && (!loc()?.safe || !(action === 'sit' ? f.seat : f.bed))) return speak(`No valid ${action === 'sit' ? 'seat' : 'bed'} at this location. No movement or healing occurred.`);
            G.state.player.gesturePosture = action === 'stand' ? null : { action, location: G.state.location };
            G.save(); speak(action === 'stand' ? 'You stand up, awake and ready to move.' : action === 'sit' ? `You sit on the ${f.seat}. No health or time change.` : `You lie on the ${f.bed}. No sleep recovery is added. Stand up to wake and walk.`);
        },
        controls() {
            // Adapt actual visible controls, including nested shop/storage/prayer panels.
            // No text from private recovery inputs is ever read aloud.
            const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(visible).at(-1);
            const panel = [...document.querySelectorAll('.panel')].filter(visible).at(-1);
            const scope = dialog || panel || document.querySelector('.screen.active');
            const choices = [];
            for (const el of scope?.querySelectorAll('button,input,select,textarea,a[href]') || []) {
                if (!visible(el) || el.disabled || el.closest('#gesture-interface') || el.id === 'gesture-launch') continue;
                const label = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.placeholder || el.id;
                if (!String(label).trim()) continue;
                choices.push(option(String(label).trim(), () => this.activateControl(el)));
            }
            choices.push(option('Narrator and interface settings', () => this.preferences()), option('Gesture reference', () => this.reference()));
            this.open([...(scope?.querySelectorAll('h1,h2,h3') || [])].find(visible)?.textContent || 'Visible game controls', choices);
            if (dialog) this.screenDetails(dialog);
        },
        screenDetails(scope) {
            let chunk = '';
            for (const p of scope?.querySelectorAll('p,#class-summary,#hero-name-status') || []) {
                if (!visible(p) || p.closest('#narrative,#gesture-interface')) continue;
                const text = p.textContent.trim();
                if (chunk.length + text.length > 500) { if (chunk) speak(chunk); chunk = ''; }
                chunk += text + ' ';
            }
            if (chunk.trim()) speak(chunk);
        },
        activateControl(el) {
            if (!el.isConnected || !visible(el) || el.disabled) { speak('This control is no longer available.'); return this.controls(); }
            if (el.tagName === 'SELECT') return this.open(el.labels?.[0]?.textContent || 'Select option', [...el.options].filter(o => !o.disabled).map(o => option(o.textContent, () => { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); this.controls(); })));
            if (el.type === 'range') return this.open(el.labels?.[0]?.textContent || 'Adjust value', [option('Decrease', () => { el.stepDown(); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); speak(el.value); }), option('Increase', () => { el.stepUp(); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); speak(el.value); })]);
            if (['INPUT', 'TEXTAREA'].includes(el.tagName) && !['checkbox', 'button', 'submit'].includes(el.type)) {
                // User explicitly enters text with the platform keyboard, not speech recognition.
                $('gesture-interface').hidden = true; this.menu = null; this.stack = []; el.focus();
                speak('Text entry. Use your device keyboard, then the Start spoken gesture controls button to return. Hero names can also be generated.'); return;
            }
            if (/throw|drop|sell|delete|confirm restart/i.test(el.textContent)) return this.confirm('Confirm: ' + el.textContent.trim() + '?', () => { el.click(); if (this.active()) this.controls(); });
            el.click();
            if (this.active()) this.controls();
            if (el.id === 'btn-generate-name') speak('Generated hero name: ' + $('char-name').value + '. Refresh available controls after the name availability check.');
            if (el.matches('.race-btn,.class-btn')) speak('Selected: ' + el.textContent.trim() + '. ' + $('class-summary').textContent);
        },
        preferences() {
            this.open('Narrator and interface settings', [
                option('Test narrator or enable narration', () => { settings.narration = true; persist(); A.setVoiceEnabled(true); A.resumeVoice(); speak('Narrator test. If you hear this, browser speech is working.'); }),
                option('Pause speech', () => A.pauseVoice()), option('Resume speech', () => A.resumeVoice()), option('Repeat last message', () => A.repeatVoice()),
                option('Faster speech', () => this.rate(.1)), option('Slower speech', () => this.rate(-.1)),
                option('Louder speech', () => { A.setVoiceVolume(Math.min(1, A.voiceVolume + .1)); speak(`Volume ${Math.round(A.voiceVolume * 100)} percent`); }),
                option('Quieter speech', () => { A.setVoiceVolume(Math.max(.1, A.voiceVolume - .1)); speak(`Volume ${Math.round(A.voiceVolume * 100)} percent`); }),
                option('Slower walking repeat', () => { settings.interval = Math.min(2500, settings.interval + 100); persist(); speak(`${settings.interval} milliseconds between steps.`); }),
                option('Faster walking repeat', () => { settings.interval = Math.max(450, settings.interval - 100); persist(); speak(`${settings.interval} milliseconds between steps.`); }),
                option('Remap world gestures', () => this.remap()), option('Repeat gesture instructions', () => this.tutorial(0)),
                option('Switch to Sighted Visual Mode', () => { speak('Sighted Visual Mode. Narration can be disabled separately.'); InterfaceMode.apply('sighted', { announce: true }); }),
                option('Disable narration', () => { settings.narration = false; persist(); A.setVoiceEnabled(false); this.sync(); })
            ]);
        },
        rate(delta) { A.settings.voiceRate = Math.round(Math.max(.5, Math.min(2, A.settings.voiceRate + delta)) * 10) / 10; A.persistSettings(); speak(`Speech speed ${A.settings.voiceRate}.`); },
        remap() {
            this.open('Remap world gestures. Menu gestures and two finger swipe cancel remain fixed.', Object.keys(defaults).map(key => option(`${key}: ${names[settings.map[key]]}`, () => this.open(`Assign ${key}`, Object.entries(names).map(([id, label]) => option(label, () => { settings.map[key] = id; persist(); speak(`${key} now means ${label}. Other gestures are unchanged.`); this.reference(); }))))));
        },
        reference() {
            this.open('Gesture reference', [
                ...Object.entries(settings.map).map(([key, id]) => option(`${key}: ${names[id]}`, () => speak(`${key}: ${names[id]}. World only. Two finger swipe cancels or returns.`))),
                option('Continuous walking instructions', () => speak('Swipe in a cardinal direction and keep your finger down for half a second. Walking repeats until release, a blocked path, combat, a panel or app switch. Release cancels pending hold steps. Tap Stop walking at any time.')),
                option('Menu gestures', () => speak('In menus, down is next, up or right is previous, double tap chooses, left goes back. Single tap repeats selection. Two finger swipe always cancels. World remapping never changes these.'))
            ]);
        },
        tutorial(step) {
            const lessons = [
                'World movement. Swipe up north, down south, left west, right east. Release for one step. Two finger swipe cancels.',
                'Continuous walking. Swipe in a cardinal direction and keep the finger down for half a second. Release to stop, including any pending step. Stop walking is always available.',
                'Menus. Down-right opens location or combat actions. Up-left or double tap opens nearby interaction choices. No object is selected automatically.',
                'Magic. Up-right opens known spells with requirements. Browse, choose a spell, then confirm Cast or Cancel.',
                'Inventory. Two finger tap opens real inventory. Browse items and choose Use, Equip, Inspect or a confirmed Drop where supported. Left returns.',
                'Navigation. Down-left opens real exits and city routes. Diagonal world travel and stairs are options here, not diagonal swipes.',
                'Posture. Stationary one finger hold sits on a real seat. Stationary two finger hold lies on a real bed. Only in safe rooms. Open actions to stand up. No automatic healing.',
                'Speech. Single tap repeats. The bottom controls open narrator settings, tutorial and reference. You can change speed, volume and world mappings. Two finger swipe cancels menus. TalkBack is not required.'
            ];
            if (step >= lessons.length) { write('black_sword_gesture_tutorial_v1', true); return this.controls(); }
            this.open(`Gesture lesson ${step + 1}`, [option('Repeat this lesson', () => speak(lessons[step])), option('Next lesson', () => this.tutorial(step + 1)), option('Skip tutorial', () => { write('black_sword_gesture_tutorial_v1', true); this.controls(); })]);
            speak(lessons[step]);
        }
    };

    const equipped = item => {
        const p = G.state.player || {};
        return Object.values(p.gearSlots || {}).includes(item.name) || ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'accessory', 'rightHand', 'leftHand'].some(k => p[k] === item.name);
    };
    const itemLabel = i => `${i.name}, quantity ${i.quantity}, ${i.type || 'item'}. ${['damage', 'defense', 'str', 'dex', 'int', 'wis'].filter(k => i[k]).map(k => `${k} ${i[k]}`).join(', ')}${i.effect ? `. Effect ${i.effect}, ${i.type === 'food' ? i.satiety : i.value || ''}` : ''}`;
    // Explicit furniture annotations on existing nodes only; no remote furniture or new room routes.
    function furniture(id) {
        const l = WorldData.locations[id];
        if (!l) return {};
        if (l.houseRoom === 'double_bedroom' || /^(public_house_).+_double_bedroom$/.test(id)) return { bed: 'double bed' };
        if (l.houseRoom === 'foyer') return { seat: 'guest bench' };
        if (l.features?.includes('benches')) return { seat: 'park bench' };
        return {};
    }
    function spellInfo(name) {
        const k = name.toLowerCase(), config = window.GameSpellSystem?.config;
        const special = /heal|mend|supplica|sanctuary|choir|moonwell|second wind|soul mend|remedy/.test(k) ? ['healing', config?.healing] : k === 'multi strike' ? ['multipleStrike', config?.multipleStrike] : k === 'shock' ? ['shock', config?.shock] : k === 'alohomora' ? ['openingDoors', config?.openingDoors] : null;
        if (special?.[1]) {
            const [id, def] = special, remaining = Math.max(0, (G.state.spellCooldowns?.[id] || 0) - Date.now());
            return `Requires ${def.cost} mana. ${remaining ? `Recovering for ${Math.ceil(remaining / 1000)} seconds.` : 'Cooldown ready.'} ${G.state.player.mp < def.cost ? 'Insufficient mana.' : ''} ${k === 'alohomora' ? 'Requires a compatible closed magical door.' : /multi|shock/.test(k) ? 'Combat target required, except configured breakable doors for Multi Strike.' : 'Restores health if wounded.'}`;
        }
        if (k === 'light orbs') return `Requires ${(G.aliveEncounterTargets?.().length || 0) * 3} mana, 3 per living enemy. Combat required.`;
        const summon = G.getSummonData?.(k.replace(/^(summon|call) /, ''));
        if (summon) return `${summon.mp} mana. Combat required. Duration: ${summon.duration}.`;
        if (k === 'command beast') return '20 mana. Combat required; party capacity applies. Enchantment lasts two companion turns. Bosses resist.';
        // Legacy spell metadata is explicitly LISTED rather than claiming it is
        // the final cost of all downstream class overrides.
        const meta = G.getSpellEfficiency?.(name)?.meta;
        return `${meta?.type || 'Class ability'}. Listed spellbook cost ${meta?.cost || 'unknown'} mana; class overrides may differ. Cast checks the real requirements.`;
    }

    const Gestures = {
        points: new Map(), timer: null, repeat: null, lastTap: 0, lastTapPoint: null, held: false, maxPointers: 0,
        direction(dx, dy) {
            if (Math.hypot(dx, dy) < 36) return null;
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
            return ({ 0: 'right', 1: 'down-right', 2: 'down', 3: 'down-left', 4: 'left', '-4': 'left', '-3': 'up-left', '-2': 'up', '-1': 'up-right' })[angle];
        },
        stop() { clearTimeout(this.timer); clearInterval(this.repeat); this.timer = this.repeat = null; if (UI.walking) { G.cancelPendingMovement?.(); speak(`Walking stopped at ${loc()?.name}.`, false, 'location'); } UI.walking = false; },
        reset() { this.stop(); G.cancelPendingMovement?.(); clearTimeout(this.tapTimer); this.points.clear(); this.endToken = null; this.lastTap = 0; this.maxPointers = 0; },
        down(e) {
            if (!UI.active() || e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            clearTimeout(this.tapTimer);
            if (!this.points.size) { this.held = false; this.maxPointers = 0; this.started = Date.now(); }
            if (this.points.size) this.stop();
            this.points.set(e.pointerId, { x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
            this.maxPointers = Math.max(this.maxPointers, this.points.size);
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
            if (this.points.size > 2) { this.held = true; this.stop(); return; }
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                if (!this.points.size) return;
                const p = [...this.points.values()][0], token = this.direction(p.dx, p.dy);
                this.held = true;
                if (this.maxPointers === 1 && ['up', 'down', 'left', 'right'].includes(token) && !UI.menu) {
                    const dir = settings.map[token];
                    if (!['north', 'south', 'east', 'west'].includes(dir)) return;
                    UI.walking = true; UI.move(dir);
                    if (UI.walking) this.repeat = setInterval(() => UI.move(dir), settings.interval);
                } else if (!token) UI.handle(this.maxPointers === 2 ? 'two-hold' : 'hold');
            }, 550);
        },
        move(e) {
            const p = this.points.get(e.pointerId); if (!p) return;
            e.preventDefault(); p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
            if (this.maxPointers === 2 && this.direction(p.dx, p.dy)) { this.held = true; this.stop(); }
        },
        up(e) {
            const p = this.points.get(e.pointerId); if (!p) return;
            e.preventDefault(); p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
            const token = this.direction(p.dx, p.dy), count = this.maxPointers;
            this.points.delete(e.pointerId);
            this.stop();
            if (this.points.size) { this.endToken = token; return; }
            const finalToken = token || this.endToken; this.endToken = null;
            if (count === 2 && finalToken) { this.lastTap = 0; UI.handle('cancel'); return; }
            if (this.held) { this.lastTap = 0; return; }
            if (count === 2) { this.lastTap = 0; UI.handle('two-tap'); return; }
            if (finalToken) { this.lastTap = 0; UI.handle(finalToken); return; }
            const now = Date.now();
            if (this.lastTap && now - this.lastTap < 330 && Math.hypot(e.clientX - this.lastTapPoint.x, e.clientY - this.lastTapPoint.y) < 40) { clearTimeout(this.tapTimer); this.lastTap = 0; UI.handle('double'); }
            else { this.lastTap = now; this.lastTapPoint = { x: e.clientX, y: e.clientY }; clearTimeout(this.tapTimer); this.tapTimer = setTimeout(() => { this.lastTap = 0; UI.handle('tap'); }, 340); }
        },
        bind(pad) {
            pad.addEventListener('pointerdown', e => this.down(e)); pad.addEventListener('pointermove', e => this.move(e)); pad.addEventListener('pointerup', e => this.up(e));
            pad.addEventListener('pointercancel', () => this.reset());
            pad.addEventListener('lostpointercapture', e => { if (this.points.has(e.pointerId)) this.reset(); });
            pad.addEventListener('contextmenu', e => e.preventDefault());
            window.addEventListener('blur', () => this.reset()); window.addEventListener('pagehide', () => this.reset());
            document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
        }
    };

    const oldEnter = G.enterLocation;
    G.enterLocation = function(id) {
        const p = this.state.player; if (p?.gesturePosture?.location !== id && p) p.gesturePosture = null;
        const result = oldEnter.call(this, id);
        if (settings.narration && UI.active()) {
            if (!UI.walking) speak(`Current location: ${loc()?.name}. ${loc()?.description || ''}`, false, 'location');
            else if (!UI.lastWalkSpoken || Date.now() - UI.lastWalkSpoken > 1500) { UI.lastWalkSpoken = Date.now(); speak(`Reached ${loc()?.name}.`, false, 'location'); }

        }
        if (UI.destination === this.state.location) { speak('Destination reached.'); UI.destination = null; Gestures.stop(); }
        return result;
    };
    // Block normal commands as well as gestures while a posture is active.
    const oldMove = G.move;
    G.move = function(dir) { if (this.state.player?.gesturePosture) { speak('Stand up before walking.'); return; } return oldMove.call(this, dir); };
    const oldStart = G.startCombat;
    G.startCombat = function(...args) { Gestures.stop(); UI.menu = null; UI.stack = []; if (this.state.player) this.state.player.gesturePosture = null; const r = oldStart.apply(this, args); UI.render(); if (settings.narration) speak(UI.combatDescription()); return r; };
    const oldHUD = G.updateHUD;
    G.updateHUD = function(...args) { const r = oldHUD.apply(this, args), p = this.state.player; const low = p && p.hp > 0 && p.hp <= p.maxHp * .25; if (low && !UI.lowHealth) speak('Your health is low. Open inventory for healing items or up-right for known healing magic.', true); UI.lowHealth = low; return r; };
    const oldCommand = G.processCommand;
    G.processCommand = function(raw) {
        const c = String(raw || '').trim().toLowerCase();
        if (c.startsWith('unequip ')) return this.unequipItem(c.slice(8));
        if (c === 'gesture controls') return UI.enable();
        if (c === 'gesture reference') return UI.reference();
        if (c === 'stand' || c === 'wake') return UI.posture('stand');
        if (c === 'sit') return UI.posture('sit'); if (c === 'lie down') return UI.posture('lie');
        return oldCommand.call(this, raw);
    };

    function init() {
        if ($('gesture-interface')) return;
        const launch = document.createElement('button'); launch.id = 'gesture-launch'; launch.type = 'button'; launch.textContent = 'Start spoken gesture controls'; launch.onclick = () => UI.enable(); (visible($('interface-mode-dialog')) ? $('interface-mode-dialog').querySelector('.interface-mode-card') : document.body).append(launch);
        const overlay = document.createElement('section'); overlay.id = 'gesture-interface'; overlay.hidden = true; overlay.setAttribute('aria-label', 'Accessible gesture controls');
        overlay.innerHTML = '<h2 id="gesture-heading">World gestures</h2><p id="gesture-selection"></p><div id="gesture-pad" tabindex="0" role="group" aria-label="Gesture surface. Swipe to move or browse menus. Double tap chooses. Two finger swipe cancels.">Gesture surface</div><div class="gesture-toolbar"><button id="gesture-all">Game controls</button><button id="gesture-back">Back / Cancel</button><button id="gesture-stop">Stop walking</button><button id="gesture-repeat">Repeat</button><button id="gesture-pause">Pause speech</button><button id="gesture-resume">Resume speech</button><button id="gesture-prefs">Narrator settings</button><button id="gesture-help">Gesture reference</button></div><p id="gesture-speech-status" role="status">Tap Test narrator if you do not hear speech. Browser voices may require installed device voice data.</p>';
        document.body.append(overlay);
        $('gesture-all').onclick = () => UI.controls(); $('gesture-back').onclick = () => UI.back(); $('gesture-stop').onclick = () => { Gestures.reset(); speak('Walking stopped.'); };
        $('gesture-pause').onclick = () => A.pauseVoice(); $('gesture-resume').onclick = () => A.resumeVoice();
        $('gesture-repeat').onclick = () => A.repeatVoice(); $('gesture-prefs').onclick = () => UI.preferences(); $('gesture-help').onclick = () => UI.reference();
        Gestures.bind($('gesture-pad'));
        $('gesture-pad').addEventListener('keydown', e => { const tokens = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'double', Escape: 'cancel' }; if (tokens[e.key]) { e.preventDefault(); e.stopPropagation(); UI.handle(tokens[e.key]); } });
        const fieldset = document.createElement('fieldset'); fieldset.innerHTML = '<legend>Built-in game narration and gestures</legend><label><input id="gesture-narration" type="checkbox"> Narrate game events independently of TalkBack</label><button type="button" id="gesture-settings-open">Narrator settings, tutorial and gesture remapping</button>';
        document.querySelector('#settings-panel .settings-card')?.append(fieldset);
        $('gesture-narration').onchange = e => { settings.narration = e.target.checked; persist(); A.setVoiceEnabled(settings.narration); if (settings.narration) speak('Independent game narration enabled.'); };
        $('gesture-settings-open').onclick = () => { if (!UI.active()) InterfaceMode.apply('blind'); UI.preferences(); };
        window.addEventListener('black-sword-speech-status', e => { $('gesture-speech-status').textContent = e.detail.text; });
        window.addEventListener('black-sword-interface-change', () => { Gestures.reset(); UI.menu = null; UI.stack = []; UI.sync(); UI.render(); });
        // Modal/panel/screen changes stop any held movement. Observe visibility,
        // not the narrative's growing child list or every animation frame.
        new MutationObserver(records => { if (records.some(r => r.target.matches?.('.panel,.screen,[role="dialog"]'))) Gestures.stop(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        $('choose-interface-blind')?.addEventListener('click', () => UI.enable());
        $('setting-interface-mode')?.addEventListener('change', e => { if (e.target.value === 'blind') UI.enable(); });
        UI.sync(); UI.render();
        if (settings.narration) { A.setVoiceEnabled(true); if (!read('black_sword_gesture_tutorial_v1', false)) UI.open('Optional gesture tutorial', [option('Learn gestures', () => UI.tutorial(0)), option('Skip', () => { write('black_sword_gesture_tutorial_v1', true); UI.controls(); })]); }
    }
    window.GestureAccessibility = { UI, Gestures, settings, defaults, furniture, spellInfo };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
