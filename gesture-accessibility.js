/** Independent gesture interface. Adapts the shipped Game; never owns rewards or combat. */
(() => {
    'use strict';
    const G = window.Game, A = window.AudioManager;
    if (!G || !A) return;
    const $ = id => document.getElementById(id);
    const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
    const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
    const KEY = 'black_sword_gestures_v2';
    const defaults = Object.freeze({ up: 'north', down: 'south', left: 'west', right: 'east',
        'down-right': 'notifications', 'up-right': 'voice', 'up-left': 'interact', 'down-left': 'hub',
        double: 'interact', 'two-tap': 'inventory', hold: 'sit', 'two-hold': 'lie' });
    const names = { north: 'Move north', south: 'Move south', west: 'Move west', east: 'Move east',
        go_up: 'Go up (stairs/ladder)', go_down: 'Go down (stairs/ladder)',
        notifications: 'Notifications (requests & gifts)', voice: 'Voice & text commands',
        hub: 'Social hub (groups, trades, friends)',
        context: 'Context or combat actions', magic: 'Magic and healing', interact: 'Interact',
        navigation: 'Directions and routes', inventory: 'Inventory', sit: 'Sit', lie: 'Lie down',
        reference: 'Gesture reference', repeat: 'Repeat speech', stop: 'Stop walking' };
    const saved = read(KEY, {});
    const settings = {
        narration: !!saved.narration,
        interval: Math.max(450, Math.min(2500, Number(saved.interval) || 800)),
        // Re-read the walkable directions when you come back to a known place.
        directions: saved.directions !== false,
        // Corner swipes can either open the four menus (default) or walk the
        // four diagonals. Nothing else about the gesture map changes.
        corners: saved.corners === 'walk' ? 'walk' : 'menus',
        // How the world is driven: 'walk' = swipe to walk and turn like a person
        // (forward/backward and turning are separate), 'compass' = the older
        // one swipe per compass direction.
        scheme: saved.scheme === 'compass' ? 'compass' : 'walk',
        turnStep: saved.turnStep === 45 ? 45 : 90,
        swipe: ['low', 'medium', 'high'].includes(saved.swipe) ? saved.swipe : 'medium',
        // Chosen combat style and spell for the one-swipe combat gestures.
        attack: ['basic', 'heavy', 'quick', 'multi', 'magic', 'defensive', 'special'].includes(saved.attack) ? saved.attack : 'basic',
        spell: typeof saved.spell === 'string' ? saved.spell : '',
        map: { ...defaults }
    };
    const CORNER_DIRECTION = Object.freeze({ 'up-right': 'northeast', 'up-left': 'northwest', 'down-right': 'southeast', 'down-left': 'southwest' });
    // Eight facing directions clockwise. Walking forward uses the facing; turning
    // only changes the facing, never the location.
    const DIRECTIONS = Object.freeze(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
    const SWIPE_PX = Object.freeze({ low: 60, medium: 36, high: 22 });
    const swipeThreshold = () => SWIPE_PX[settings.swipe] || 36;
    // Mana cost of each healing spell, exactly as game.js charges it.
    const HEALING_COST = { 'minor heal': 14, 'heal': 20, 'nature mend': 22, 'mass heal': 38, 'holy light': 25 };
    const spin = (direction, steps) => DIRECTIONS[((DIRECTIONS.indexOf(direction) + steps) % 8 + 8) % 8];
    const opposite = direction => spin(direction, 4);
    const DIAGONAL_SPEECH = 'To walk diagonally: tap the compass buttons north-east, north-west, south-east or south-west, type or say north east, or turn on Corner swipes walk diagonally in narrator settings. With that setting on, swipe up-right for north-east, up-left for north-west, down-right for south-east and down-left for south-west. The four menus those corners used to open stay in the visible controls list.';
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
        if (!settings.narration) {
            // The built-in voice is off: hand the line to TalkBack / VoiceOver
            // through the status region, so gesture menus are never silent.
            if (window.InterfaceMode?.current === 'blind') window.ScreenReader?.announce(String(text), { voice: false });
            return Promise.resolve(false);
        }
        return A.playVoice(String(text), { channel, priority: critical === true ? 'critical' : critical === 'high' ? true : false });
    };

    // All ordinary narrative paths now feed the existing shared speech queue.
    // emitGameEvent and the professional timeline also feed it; queue deduplication
    // prevents those callers from speaking a second copy of the same event.
    const oldNarrative = G.addNarrative;
    G.addNarrative = function(text, type) {
        const result = oldNarrative.call(this, text, type);
        if (!this._audioNarrationHandled && settings.narration && !UI.suppressLocation && !(UI.walking && (type === 'location' || /^Available directions:/.test(String(text))))) {
            // Cancel old queued speech when new movement/location events happen
            // so TalkBack/TTS only reads the current event, not old ones.
            if (type === 'location' || type === 'system') {
                try { window.speechSynthesis?.cancel(); } catch {}
            }
            speak(text, /you have died|you awaken|health is low|^You encountered /i.test(String(text)) ? true : type === 'combat' ? 'high' : false, type === 'location' ? 'location' : '');
        }
        return result;
    };

    /** Any real panel or dialog the player can see right now. */
    const anyPanelOpen = () => [...document.querySelectorAll('.panel,[role="dialog"]')].some(visible);
    // A silent refusal reads as a broken gesture. Say it once every few seconds.
    let panelHintAt = 0;
    const panelHint = (extra = '') => {
        const now = Date.now();
        if (now - panelHintAt < 3000) return false;
        panelHintAt = now;
        speak(`A panel is open. Swipe left to close it, then gesture again.${extra ? ' ' + extra : ''}`, false, 'system');
        return true;
    };

    const UI = {
        menu: null, index: 0, stack: [], walking: false, suppressLocation: false, busy: false,
        active() { return window.InterfaceMode?.current === 'blind'; },
        save() { persist(); },

        /** Which way the hero is facing. Turning changes only this. */
        facing() {
            const player = G.state.player;
            if (!player) return 'north';
            if (!DIRECTIONS.includes(player.facing)) player.facing = 'north';
            return player.facing;
        },
        setFacing(direction) {
            const player = G.state.player;
            if (!player) return;
            player.facing = DIRECTIONS.includes(direction) ? direction : 'north';
            try { G.save?.(); } catch { /* an unsaved facing is harmless */ }
        },
        /** What lies straight ahead, in words that match the real exits. */
        aheadSpeech() {
            const direction = this.facing();
            const exits = loc()?.exits || {};
            const next = exits[direction] && window.WorldData.locations[exits[direction]];
            if (next) return `Ahead: ${next.name}.`;
            const open = DIRECTIONS.filter(dir => exits[dir]).slice(0, 4).join(', ');
            return open ? `No path straight ahead. From here you can go ${open}.` : 'No path straight ahead, and no way out of here on foot.';
        },
        turn(steps) {
            if (!G.state.player) return;
            const direction = spin(this.facing(), steps);
            this.setFacing(direction);
            G.cancelPendingMovement?.();
            this.walking = false;
            speak(`Facing ${direction}. ${this.aheadSpeech()}`, false, 'location');
        },
        /** Walk one step forward, or backward without turning round. */
        walkStep(backward = false) {
            if (G.state.screen !== 'game-screen' || !G.state.player) { this.controls(); return false; }
            if (this.menu || this.busy || G._movementPending) return false;
            if (anyPanelOpen()) { panelHint(); return false; }
            if (G.state.player.gesturePosture) { speak('Stand up before walking.'); Gestures.stop(); return false; }
            if (G.state.inCombat || G.state.combatTransition) { speak('You cannot walk during combat.'); Gestures.stop(); return false; }
            const facing = this.facing();
            const direction = backward ? opposite(facing) : facing;
            if (!loc()?.exits?.[direction]) {
                speak(backward
                    ? `Blocked behind you. ${this.aheadSpeech()}`
                    : `Blocked. There is no path ${direction} from ${loc()?.name}. You are facing ${facing}.`, true, 'location');
                Gestures.stop();
                return false;
            }
            if (!backward) this.setFacing(direction);
            this.clearFocus();
            G.processCommand(direction);
            return true;
        },
        /** Single tap: start continuous forward walking, or stop it. */
        toggleWalk() {
            if (G.state.screen !== 'game-screen' || !G.state.player) return;
            if (this.walking) { Gestures.stop(); speak(`Walking stopped at ${loc()?.name}.`, false, 'location'); return; }
            if (this.walkStep(false)) {
                this.walking = true;
                Gestures.repeat = setInterval(() => {
                    if (!this.walkStep(false)) Gestures.stop();
                }, settings.interval);
            }
        },
        /** Healing spells this hero knows, cheapest first. */
        healingSpells() {
            return (G.state.player?.spells || [])
                .filter(name => HEALING_COST[String(name).toLowerCase()] !== undefined)
                .sort((a, b) => HEALING_COST[a.toLowerCase()] - HEALING_COST[b.toLowerCase()]);
        },
        /** The healing item the hero actually carries, if any. */
        healingItem() {
            return (G.state.inventory || []).find(item => (item.quantity || 0) > 0 && ['heal', 'both'].includes(item.effect));
        },
        healthSentence() {
            const p = G.state.player;
            if (!p) return '';
            return `Health ${p.hp} of ${p.maxHp}. Magic ${p.mp} of ${p.maxMp}.`;
        },
        /** Up-right in combat: the chosen attack, through the normal combat rules. */
        attackGesture() {
            if (!this.canFight()) return;
            G.combatAbility(settings.attack || 'basic');
        },
        /** Speak an ability result through the narrator, never TalkBack. */
        announceAbility(name, before) {
            this.afterCombat(() => speak(this.castSummary(name, before), false, 'combat'));
        },
        /** The full ability list, with the real cooldown and cost of each. */
        abilities() {
            const list = G.COMBAT_ABILITIES || [];
            const choices = list.map(a => {
                const cd = G.combatCooldown?.(a.id) || 0;
                const cost = a.cost ? `, ${a.cost} magic` : '';
                const state = cd ? `, cooling down ${cd}` : '';
                return option(`${a.name}${cost}${state}`, () => {
                    speak(a.desc, true, 'combat');
                    this.open(a.name, [
                        option(`Use ${a.name} now`, command(`combat ${a.id}`)),
                        option(`Make ${a.name} my up-right swipe`, () => { settings.attack = a.id; persist(); speak(`${a.name} is now your up-right combat action.`); }),
                        option('Explain the numbers again', () => speak(a.desc, true, 'combat')),
                        option('Back to combat actions', () => this.context())
                    ]);
                });
            });
            this.open('Combat abilities. Up-right uses ' + (G.combatAbilityInfo?.(settings.attack)?.name || 'Basic Attack'), choices.concat([
                option('Back to combat actions', () => this.context())
            ]));
        },
        /** Up-left in combat: the chosen spell, or the spellbook if none chosen. */
        spellGesture() {
            if (!this.canFight()) return;
            const spells = G.state.player.spells || [];
            if (!spells.length) { speak('You know no spells yet. Up-left will stay silent until you learn one.'); return; }
            let chosen = spells.find(name => name.toLowerCase() === String(settings.spell).toLowerCase());
            if (!chosen) { this.open('Choose the spell for up-left', spells.map(name => option(name, () => { settings.spell = name; persist(); speak(`${name} is now your up-left spell.`); }))); return; }
            const before = this.snapshot();
            G.processCommand(`cast ${chosen}`);
            this.afterCombat(() => speak(this.castSummary(chosen, before), false, 'combat'));
        },
        /** Down-left in combat: a healing spell if possible, otherwise a healing item. */
        healGesture() {
            if (!this.canFight()) return;
            const before = G.state.player.hp;
            const spell = this.healingSpells().find(name => G.state.player.mp >= HEALING_COST[name.toLowerCase()]);
            if (spell) {
                G.processCommand(`cast ${spell}`);
                const after = G.state.player.hp;
                speak(`${spell}. ${after > before ? `You recover ${after - before} health.` : 'No health was restored.'} ${this.healthSentence()}`, false, 'combat');
                return;
            }
            const item = this.healingItem();
            if (item) {
                G.processCommand(`use ${item.name}`);
                const after = G.state.player.hp;
                speak(`${item.name}. ${after > before ? `You recover ${after - before} health.` : 'No health was restored.'} ${this.healthSentence()}`, false, 'combat');
                return;
            }
            speak(`No healing is available: not enough magic for a healing spell, and no healing item in the pack. ${this.healthSentence()}`, false, 'combat');
        },
        canFight() {
            if (G.state.screen !== 'game-screen' || !G.state.player) { this.controls(); return false; }
            if (this.menu || this.busy) return false;
            if (anyPanelOpen()) { panelHint(); return false; }
            if (!G.state.inCombat) { speak('That is a combat gesture. There is no fight right now. Swipe up to walk.'); return false; }
            return true;
        },
        /** Run a callback once the current combat chain has really finished. */
        afterCombat(fn) {
            const chain = G._combatChain;
            if (chain && typeof chain.then === 'function') chain.then(fn, fn);
            else setTimeout(fn, 0);
        },
        snapshot() {
            const p = G.state.player, e = G.state.enemy;
            return { enemy: e?.name || '', enemyHp: e?.hp ?? 0, enemyMax: e?.maxHp ?? 0, hp: p?.hp ?? 0, mp: p?.mp ?? 0 };
        },
        lastNarrative() {
            const lines = document.querySelectorAll('#narrative p');
            return lines[lines.length - 1]?.textContent?.trim() || '';
        },
        /** What actually changed, said in plain words. Never invented. */
        castSummary(spell, before) {
            const now = this.snapshot();
            const parts = [];
            if (now.enemyHp <= 0 || !now.enemy) {
                if (before.enemy) parts.push(`${before.enemy} is defeated.`);
            } else if (now.enemyHp < before.enemyHp) {
                parts.push(`${now.enemy} lost ${before.enemyHp - now.enemyHp} health and has ${now.enemyHp} of ${now.enemyMax}.`);
            }
            if (now.hp > before.hp) parts.push(`You recovered ${now.hp - before.hp} health.`);
            if (now.mp < before.mp) parts.push(`You spent ${before.mp - now.mp} magic.`);
            if (!parts.length) parts.push(`No effect. ${this.lastNarrative()}`);
            return `${spell}. ${parts.join(' ')} Your health ${now.hp}, magic ${now.mp}.`;
        },

        /** Down-right in combat: brace for the next enemy action. */
        defendGesture() {
            if (!this.canFight()) return;
            G.processCommand('defend');
        },
        /** Up-right/up-left/down-right/down-left during a fight. */
        combatToken(token) {
            // One physical swipe = one action. A bouncing or duplicated pointer
            // event inside 250 ms is ignored instead of spending a second turn.
            const now = Date.now();
            const last = this._lastCombatToken || {};
            if (last.token === token && now - last.at < 250) return;
            this._lastCombatToken = { token, at: now };
            if (token === 'up-right') return this.attackGesture();
            if (token === 'up-left') return this.spellGesture();
            if (token === 'down-right') return this.defendGesture();
            if (token === 'down-left') return this.healGesture();
        },

        /** Everything nearby that can be inspected, taken or opened. */
        nearbyObjects() {
            const list = [];
            const location = loc();
            if (!location) return list;
            for (const npc of window.WorldData.npcs?.[G.state.location] || []) {
                list.push({
                    label: npc.name, kind: 'person',
                    describe: `${npc.name}, ${npc.role || 'person'} here in this room. Can talk.`,
                    run: () => G.processCommand(`talk ${npc.name}`)
                });
            }
            for (const id of location.items || []) {
                const item = window.WorldData.items?.[id];
                if (!item) continue;
                if (item.hidden && !G.state.parity?.discoveredItems?.includes(`${G.state.location}:${id}`)) continue;
                list.push({
                    label: item.name, kind: 'item',
                    describe: `${item.name} here in this room. Can be collected. ${item.desc || ''} ${item.effect ? `Effect ${item.effect}.` : ''}`.trim(),
                    run: () => G.processCommand(`take ${item.name}`)
                });
            }
            if (location.houseExterior) {
                const open = Boolean(location.exits.up);
                list.push({
                    label: open ? 'open door' : 'closed door', kind: 'door',
                    describe: open ? 'The door here stands open. Can be closed.' : 'The door here is closed. Can be opened if it is not locked.',
                    run: () => G.processCommand(open ? 'close door' : 'open door')
                });
            }
            for (const [dir, id] of Object.entries(location.exits || {})) {
                if (!['up', 'down'].includes(dir)) continue;
                list.push({
                    label: `${dir} to ${window.WorldData.locations[id]?.name || id}`, kind: 'stairs',
                    describe: `Stairs going ${dir} to ${window.WorldData.locations[id]?.name || id}.`,
                    run: () => G.processCommand(dir)
                });
            }
            return list;
        },
        /** Two-finger swipe left or right: move through what is really here. */
        browseFocus(step) {
            if (this.menu || this.busy) return;
            if (!this.focusList?.length) { this.focusList = this.nearbyObjects(); this.focusIndex = -1; }
            if (!this.focusList.length) { speak(`Nothing nearby to inspect in ${loc()?.name}.`); return; }
            this.focusIndex = (this.focusIndex + step + this.focusList.length) % this.focusList.length;
            const object = this.focusList[this.focusIndex];
            speak(`${this.focusIndex + 1} of ${this.focusList.length}. ${object.describe} Double tap to ${object.kind === 'item' ? 'collect it' : object.kind === 'door' ? 'use the door' : object.kind === 'person' ? 'talk' : 'use it'}.`, false, 'location');
        },
        /** Double tap with a focus: act on it; otherwise open the real choices. */
        activateFocus() {
            if (this.menu) return;
            if (!this.focusList?.length || this.focusIndex < 0) { this.focusList = null; this.focusIndex = -1; return this.context(); }
            const object = this.focusList[this.focusIndex];
            speak(`Acting on ${object.label}.`, false, 'location');
            object.run();
        },
        clearFocus() { this.focusList = null; this.focusIndex = -1; },

        /** The four one-finger swipes, translated for the walk-and-turn scheme. */
        walkToken(token) {
            if (token === 'up') return this.walkStep(false);
            if (token === 'down') return this.walkStep(true);
            if (token === 'left') return this.turn(-Math.round(180 / settings.turnStep));
            if (token === 'right') return this.turn(Math.round(180 / settings.turnStep));
            if (token === 'circle') return this.turn(4);
        },
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
            const dirBox = $('gesture-directions'); if (dirBox) dirBox.checked = settings.directions;
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
        readPanelContent(panel) {
            // Read the available actions/options in the currently visible panel
            const panelId = panel.id;
            
            // Get all buttons/links in the panel and read their text
            const buttons = panel.querySelectorAll('button:not([style*="display: none"]):not([style*="display:none"])');
            const options = [];
            buttons.forEach(btn => {
                const text = btn.textContent?.trim();
                if (text && !text.includes('Sell') && !text.includes('Details') && !text.includes('Examine')) {
                    options.push(text);
                }
            });
            
            if (panelId === 'stats-panel') {
                const p = G.state.player;
                if (p) speak(`Stats panel. ${p.name}, level ${p.level}. Swipe left to close, swipe right to return to game.`, true, 'system');
            } else if (panelId === 'inventory-panel') {
                const inv = G.state.inventory || [];
                if (inv.length === 0) {
                    speak('Inventory empty. Swipe left to close.', true, 'system');
                } else {
                    const items = inv.slice(0, 5).map(i => i.name).join(', ');
                    speak(`Inventory: ${items}${inv.length > 5 ? ` and ${inv.length - 5} more` : ''}. Swipe left to close.`, true, 'system');
                }
            } else if (panelId === 'spell-panel') {
                const p = G.state.player;
                if (p) {
                    const spells = p.spells || [];
                    speak(`Spells: ${spells.join(', ') || 'none'}. Swipe left to close.`, true, 'magic');
                }
            } else if (panelId === 'notifications-panel') {
                if (options.length > 0) {
                    speak(`Notifications: ${options.join('. ')}. Swipe left to close.`, true, 'system');
                } else {
                    speak('No notifications. Swipe left to close.', true, 'system');
                }
            } else if (panelId === 'hub-panel') {
                if (options.length > 0) {
                    speak(`Social hub: ${options.join('. ')}. Swipe left to close.`, true, 'system');
                } else {
                    speak('Social hub. Swipe left to close.', true, 'system');
                }
            } else if (panelId === 'combat-panel' || G.state.inCombat) {
                const enemies = G.aliveEncounterTargets?.() || [];
                const p = G.state.player;
                if (enemies.length > 0) {
                    const enemyNames = enemies.map(e => e.name).join(', ');
                    speak(`Enemies: ${enemyNames}. Your HP ${p?.hp || 0}. Swipe up-right for combat actions: attack, defend, flee.`, true, 'combat');
                }
            } else {
                // Generic panel - read the buttons/options
                if (options.length > 0) {
                    speak(`Options: ${options.join('. ')}. Swipe left to close.`, true, 'system');
                } else {
                    // Try to read any text content
                    const text = panel.querySelector('.panel-body, .content, p')?.textContent?.trim();
                    if (text) speak(text.slice(0, 200) + '. Swipe left to close.', true, 'system');
                    else speak('Panel open. Swipe left to close, swipe right to return to game.', true, 'system');
                }
            }
        },
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
            const fighting = this.active() && G.state.inCombat;
            Gestures.stop(); if (!fighting) { this.menu = null; this.stack = []; this.render(); } this.busy = true;
            try { await fn(); } catch (error) { console.warn('Gesture action failed', error); speak('The action could not be completed. No success is assumed.'); }
            finally { this.busy = false; if (fighting && !G.state.inCombat && !G.state.combatTransition) { this.menu = null; this.stack = []; this.render(); } }
            // Don't auto-open controls when a panel is visible — let the user interact with it directly.
        },
        playSwipeSound() {
            // Real recording only. The game never synthesises a sound effect.
            if (A?.playSFX) A.playSFX('swipe');
        },

        handle(token) {
            if (!this.active()) return;
            // When a panel or dialog is open, handle panel navigation with swipes
            const visiblePanel = [...document.querySelectorAll('.panel:not(.hidden),[role="dialog"]:not(.hidden)')].find(visible);
            if (visiblePanel && token !== 'cancel' && token !== 'go_up' && token !== 'go_down') {
                // Panel is open - handle navigation within panel
                if (token === 'left') {
                    // Close panel / go back
                    visiblePanel.classList.add('hidden');
                    speak('Panel closed. Return to game.', false, 'system');
                    return;
                }
                if (token === 'right') {
                    // Return to game controls
                    visiblePanel.classList.add('hidden');
                    speak('Return to game controls.', false, 'system');
                    return;
                }
                if (token === 'up' || token === 'down') {
                    // Read the panel's available actions/options
                    this.readPanelContent(visiblePanel);
                    return;
                }
                if (token === 'double' || token === 'tap') {
                    // Read current panel content
                    this.readPanelContent(visiblePanel);
                    return;
                }
                // Never swallow a token in silence. A combat swipe is the one
                // case where the player expects to be fighting right now.
                if (G.state.inCombat) {
                    speak(`A panel is open. Swipe left to close it, then swipe ${token} to fight. Up-right attacks, up-left casts, down-right defends, down-left heals.`, true, 'combat');
                    return;
                }
                // For other tokens in panel context, explain instead of silence.
                return panelHint();
            }
            if (token !== 'tap') this.playSwipeSound();
            if (token === 'cancel') { this.back(); return; }
            // Direct go_up / go_down from two-finger swipes (bypasses settings.map)
            if (token === 'go_up' || token === 'go_down') return this.verticalMove(token);
            // A combat menu opens automatically when a fight starts. The four
            // combat swipes must still work from there, closing that menu first.
            if (this.menu && G.state.inCombat && /^Combat actions/.test(this.menu.title || '')
                && ['up-right', 'up-left', 'down-right', 'down-left'].includes(token)) {
                this.menu = null; this.stack = []; this.clearFocus(); this.render();
                return this.combatToken(token);
            }
            if (this.menu) {
                if (['up', 'right'].includes(token)) this.browse(-1);
                else if (token === 'down') this.browse(1);
                else if (token === 'left') this.back();
                else if (token === 'double') this.choose();
                else if (token === 'tap') speak(this.menu.choices[this.index].label, true);
                return;
            }
            // Combat gestures only answer during a fight, and never inside menus.
            if (G.state.inCombat && ['up-right', 'up-left', 'down-right', 'down-left'].includes(token)) return this.combatToken(token);
            if (token === 'two-left' || token === 'two-right') return this.browseFocus(token === 'two-right' ? 1 : -1);
            if (token === 'double' && this.focusList?.length) return this.activateFocus();
            if (settings.scheme === 'walk') {
                // Walking and turning are separate: up walks, left and right
                // turn, down walks backward without turning round.
                if (['up', 'down', 'left', 'right', 'circle'].includes(token)) return this.walkToken(token);
                if (token === 'two-tap') { Gestures.stop(); speak(`Walking stopped at ${loc()?.name}.`, false, 'location'); return; }
                if (token === 'tap') return this.toggleWalk();
            }
            if (token === 'tap') { A.repeatVoice(); return; }
            if (settings.corners === 'walk' && CORNER_DIRECTION[token]) return this.move(CORNER_DIRECTION[token]);
            const action = settings.map[token];
            if (['north', 'south', 'east', 'west'].includes(action)) return this.move(action);
            if (action === 'context') return this.context();
            if (action === 'magic') return this.magic();
            if (action === 'inventory') return this.inventory();
            if (action === 'navigation') return this.navigation();
            if (action === 'interact') return this.context(); // never guesses among unrelated objects
            if (action === 'sit' || action === 'lie') return this.posture(action);
            if (action === 'go_up' || action === 'go_down') return this.verticalMove(action);
            if (action === 'notifications') return this.notifications();
            if (action === 'voice') return this.voiceCommands();
            if (action === 'hub') return this.hub();
            if (action === 'reference') return this.reference();
            if (action === 'repeat') return A.repeatVoice();
            if (action === 'stop') Gestures.stop();
        },
        move(direction) {
            if (G.state.screen !== 'game-screen' || !G.state.player) { this.controls(); return; }
            if (this.menu || this.busy || G._movementPending) return;
            // A panel keeps its own focus, but the refusal is spoken, never silent.
            if (anyPanelOpen()) { panelHint(); return; }
            if (G.state.player.gesturePosture) { speak('Stand up before walking. Open contextual actions.'); Gestures.stop(); return; }
            if (G.state.inCombat || G.state.combatTransition) { speak('You cannot walk during combat. Open down-right for combat actions, including flee.'); Gestures.stop(); return; }
            if (!loc()?.exits?.[direction]) { speak(`Blocked. No path ${direction} from ${loc()?.name}.`); Gestures.stop(); return; }
            G.processCommand(direction);
        },
        verticalMove(action) {
            if (G.state.screen !== 'game-screen' || !G.state.player) { this.controls(); return; }
            if (this.menu || this.busy || G._movementPending) return;
            if (anyPanelOpen()) { panelHint(); return; }
            if (G.state.inCombat || G.state.combatTransition) { speak('You cannot move during combat.'); Gestures.stop(); return; }
            const dir = action === 'go_up' ? 'up' : 'down';
            if (!loc()?.exits?.[dir]) { speak(`No way to go ${dir} from ${loc()?.name}.`); Gestures.stop(); return; }
            G.processCommand(dir);
        },
        notifications() {
            // Open notifications as a navigable menu (like inventory)
            const choices = [];
            
            // Get pending notifications from game state
            const notifications = G.state.notifications || [];
            
            if (notifications.length === 0) {
                choices.push(option('No notifications', () => speak('No new notifications.')));
            } else {
                notifications.forEach((notif, i) => {
                    if (notif.type === 'trade') {
                        choices.push(option(`Trade request from ${notif.from}`, () => {
                            this.open('Trade request', [
                                option('Accept trade', command(`accept trade ${notif.id}`)),
                                option('Decline trade', command(`decline trade ${notif.id}`)),
                                option('Back to notifications', () => this.notifications())
                            ]);
                        }));
                    } else if (notif.type === 'friend') {
                        choices.push(option(`Friend request from ${notif.from}`, () => {
                            this.open('Friend request', [
                                option('Accept friend request', command(`accept friend ${notif.from}`)),
                                option('Decline friend request', command(`decline friend ${notif.from}`)),
                                option('Back to notifications', () => this.notifications())
                            ]);
                        }));
                    } else if (notif.type === 'gift') {
                        choices.push(option(`Gift from ${notif.from}: ${notif.item}`, () => {
                            this.open('Gift received', [
                                option('Accept gift', command(`accept gift ${notif.id}`)),
                                option('Decline gift', command(`decline gift ${notif.id}`)),
                                option('Back to notifications', () => this.notifications())
                            ]);
                        }));
                    } else if (notif.type === 'combat_invite') {
                        choices.push(option(`Combat invite from ${notif.from}`, () => {
                            this.open('Combat invitation', [
                                option('Join combat group', command(`join group ${notif.groupId}`)),
                                option('Decline invite', command(`decline invite ${notif.id}`)),
                                option('Back to notifications', () => this.notifications())
                            ]);
                        }));
                    }
                });
            }
            
            choices.push(option('Refresh notifications', () => { G.refreshNotifications?.(); this.notifications(); }));
            this.open('Notifications', choices);
        },
        voiceCommands() {
            // Open voice command panel
            const panel = $('voice-command-panel');
            if (panel) {
                panel.classList.remove('hidden');
                const input = $('voice-command-input');
                if (input) { input.value = ''; input.focus(); }
                speak('Voice and text commands opened. Type or speak a command like chat hello, eat cheese, drink potion, or attack.');
            } else {
                speak('Voice command panel is loading.');
            }
        },
        hub() {
            // Open social hub as a navigable menu (like inventory)
            const choices = [
                option('Send trade request', () => {
                    const players = G.getOnlinePlayers?.() || [];
                    if (players.length === 0) {
                        speak('No other players online.');
                        this.hub();
                    } else {
                        this.open('Send trade to', players.map(p => option(p.name, command(`trade ${p.name}`))).concat([
                            option('Back to hub', () => this.hub())
                        ]));
                    }
                }),
                option('Send gift', () => {
                    const players = G.getOnlinePlayers?.() || [];
                    if (players.length === 0) {
                        speak('No other players online.');
                        this.hub();
                    } else {
                        this.open('Send gift to', players.map(p => option(p.name, command(`gift ${p.name}`))).concat([
                            option('Back to hub', () => this.hub())
                        ]));
                    }
                }),
                option('Send friend request', () => {
                    const players = G.getOnlinePlayers?.() || [];
                    if (players.length === 0) {
                        speak('No other players online.');
                        this.hub();
                    } else {
                        this.open('Send friend request to', players.map(p => option(p.name, command(`friend ${p.name}`))).concat([
                            option('Back to hub', () => this.hub())
                        ]));
                    }
                }),
                option('View friends list', command('friends list')),
                option('Create combat group', command('create group')),
                option('View combat groups', command('list groups')),
                option('Join combat group', command('join group')),
                option('Open chat room', command('chat'))
            ];
            this.open('Social hub', choices);
        },
        context() {
            if (!G.state.player || G.state.screen !== 'game-screen') return this.controls();
            if (G.state.inCombat) {
                const targets = G.aliveEncounterTargets?.() || [];
                return this.open('Combat actions. ' + this.combatDescription(), [
                    option('Combat abilities, with costs and cooldowns', () => this.abilities()),
                    option('Attack current enemy', command('attack')), option('Defend', command('defend')),
                    option('Flee', command('flee')), option('Pray', command('pray')), option('Magic and healing', () => this.magic()), option('Inventory', () => this.inventory()),
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
                option('All visible controls', () => this.controls()), option('Gesture reference', () => this.reference()));
            this.open(`Actions at ${l.name}`, choices);
        },
        combatDescription() {
            const e = G.state.enemy;
            // Encounters are co-located entities, not a spatial arena. Never fabricate bearings.
            return `${G.battleStatusText?.() || ''} ${e ? `${e.name} is in your current location. Enemy compass position is not supplied by this game.` : 'The next enemy may be advancing.'}`;
        },
        combatActions() {
            // Open combat actions menu - stays open until user closes it
            if (!G.state.inCombat || !G.state.enemy) return;
            const e = G.state.enemy;
            const p = G.state.player;
            const enemies = G.aliveEncounterTargets?.() || [];
            
            // First, read current status
            let statusText = '';
            if (enemies.length > 1) {
                statusText = `${enemies.length} enemies. `;
                enemies.forEach((enemy, i) => {
                    statusText += `${enemy.name}: ${enemy.hp} HP. `;
                });
            } else {
                statusText = `${e.name}: ${e.hp} of ${e.maxHp} HP. `;
            }
            statusText += `Your HP: ${p?.hp || 0} of ${p?.maxHp || 0}. Mana: ${p?.mp || 0}.`;
            speak(statusText, true, 'combat');
            
            // Then open menu with actions
            const choices = [
                option('Attack ' + e.name, command('attack')),
                option('Defend', command('defend')),
                option('Flee', command('flee')),
                option('Pray', command('pray'))
            ];
            // Add spells if player has mana
            if (p.mp >= 15) {
                const combatSpells = (p.spells || []).filter(s => 
                    ['power strike', 'multi strike', 'fireball', 'ice storm', 'lightning bolt', 
                     'backstab', 'battle cry', 'hammer smite', 'piercing volley', 'chi burst', 'thorn storm']
                    .some(cs => s.toLowerCase().includes(cs))
                );
                combatSpells.slice(0, 3).forEach(spell => {
                    choices.push(option('Cast ' + spell, command('cast ' + spell)));
                });
            }
            // Add healing if wounded
            if (p.hp < p.maxHp && p.mp >= 14) {
                choices.push(option('Heal yourself', command('cast minor heal')));
            }
            // Add inventory option
            choices.push(option('Use item from inventory', () => this.inventory()));
            choices.push(option('Repeat combat status', () => this.combatActions()));
            this.open('Combat actions - swipe up/down to browse, double-tap to choose', choices);
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
                if (!route) return speak('No open route from here. A door may be closed.');
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
            choices.push(option('Spoken guide', () => this.guide()));
            choices.push(option('Gesture reference', () => this.reference()));
            choices.push(option('Check my controls', () => this.checkControls()));
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
                option(`Announce possible directions: ${settings.directions ? 'on' : 'off'}`, () => {
                    settings.directions = !settings.directions; persist();
                    const box = $('gesture-directions'); if (box) box.checked = settings.directions;
                    speak(settings.directions ? 'Possible directions will be read when you come back to a place you know.' : 'Possible directions will not be read on arrival; Look Around still lists them.');
                }),
                option(`Walk and turn gestures: ${settings.scheme === 'walk' ? 'on' : 'off, compass swipes'}`, () => {
                    settings.scheme = settings.scheme === 'walk' ? 'compass' : 'walk'; persist(); Gestures.reset();
                    speak(settings.scheme === 'walk'
                        ? 'Walk and turn gestures on. Swipe up walks forward, down walks backward, left and right turn you, and a tap starts or stops continuous walking. Two finger tap stops immediately.'
                        : 'Compass swipes. One swipe is one compass direction: up north, down south, left west, right east.');
                }),
                option(`Turn step: ${settings.turnStep} degrees`, () => {
                    settings.turnStep = settings.turnStep === 90 ? 45 : 90; persist();
                    speak(`Each turn is now ${settings.turnStep} degrees. Turning never moves you.`);
                }),
                option(`Swipe sensitivity: ${settings.swipe}`, () => {
                    const order = ['low', 'medium', 'high'];
                    settings.swipe = order[(order.indexOf(settings.swipe) + 1) % order.length]; persist();
                    speak(`${settings.swipe} sensitivity. A swipe needs about ${swipeThreshold()} pixels of travel.`);
                }),
                option(`Corner swipes: ${settings.corners === 'walk' ? 'walk diagonally' : 'open menus'}`, () => {
                    settings.corners = settings.corners === 'walk' ? 'menus' : 'walk'; persist();
                    speak(settings.corners === 'walk'
                        ? 'Corner swipes walk diagonally: up-right north-east, up-left north-west, down-right south-east, down-left south-west. Notifications, voice, interact and the social hub stay in the visible controls list.'
                        : 'Corner swipes open Notifications, Voice commands, Interact and the Social hub again. Diagonal walking stays on the compass buttons and in typed or spoken commands.');
                }),
                option('How do I walk diagonally?', () => speak(DIAGONAL_SPEECH)),
                option('Remap world gestures', () => this.remap()), option('Repeat gesture instructions', () => this.tutorial(0)),
                option('Switch to Sighted Visual Mode', () => { speak('Sighted Visual Mode. Narration can be disabled separately.'); InterfaceMode.apply('sighted', { announce: true }); }),
                option('Disable narration', () => { settings.narration = false; persist(); A.setVoiceEnabled(false); this.sync(); })
            ]);
        },
        announceDirections() { return settings.directions !== false; },
        rate(delta) { A.settings.voiceRate = Math.round(Math.max(.5, Math.min(2, A.settings.voiceRate + delta)) * 10) / 10; A.persistSettings(); speak(`Speech speed ${A.settings.voiceRate}.`); },
        remap() {
            this.open('Remap world gestures. Menu gestures and two finger swipe cancel remain fixed.', Object.keys(defaults).map(key => option(`${key}: ${names[settings.map[key]]}`, () => this.open(`Assign ${key}`, Object.entries(names).map(([id, label]) => option(label, () => { settings.map[key] = id; persist(); speak(`${key} now means ${label}. Other gestures are unchanged.`); this.reference(); }))))));
        },
        reference() {
            this.open('Gesture reference', [
                option('Full spoken guide', () => this.guide()),
                option('How do I walk diagonally?', () => speak(DIAGONAL_SPEECH)),
                option('Corner swipes now', () => speak(settings.corners === 'walk'
                    ? 'Corner swipes walk diagonally: up-right north-east, up-left north-west, down-right south-east, down-left south-west.'
                    : 'Corner swipes open menus: down-right notifications, up-right voice commands, up-left interact, down-left social hub. Diagonal walking uses the compass buttons or typed and spoken directions.')),
                ...Object.entries(settings.map).map(([key, id]) => option(`${key}: ${names[id]}`, () => speak(`${key}: ${names[id]}. World only. Two finger swipe cancels or returns.`))),
                option('Continuous walking instructions', () => speak('Swipe in a cardinal direction and keep your finger down for half a second. Walking repeats until release, a blocked path, combat, a panel or app switch. Release cancels pending hold steps. Tap Stop walking at any time.')),
                option('Combat gestures', () => speak(`During a fight, up-right uses ${G.combatAbilityInfo?.(settings.attack)?.name || 'Basic Attack'}, up-left casts ${settings.spell || 'your chosen spell'}, down-right braces to defend, down-left heals with a healing spell first and then a healing item. Combat gestures never walk or turn, and walking gestures never fire during a fight.`)),
                option('Browsing objects and inventory', () => speak('Two finger swipe right moves to the next nearby object and reads its name, what it is and whether it can be collected. Swipe left for the previous one. Double tap collects it, opens or closes the door, talks to the person or uses the object. Two finger tap opens the inventory.')),
                option('Menus, and the older compass swipes', () => speak('In menus, down is next, up or right is previous, double tap chooses, left goes back. Single tap repeats selection. Two finger swipe always cancels. World remapping never changes these.')),
                option('Inventory, chests and boarding a game', () => speak('Two finger tap opens the inventory. Two finger left and right change category, up and down change item, double tap inspects, long press opens use, equip or drop. Say open chest in a room with a chest, take the item it names, and open door at a door. At the Game Hall the board owns the gestures: double tap rolls the dice in Snakes and Ladders and in Ludo, and a second double tap confirms a Ludo move. The full spoken guide has a chapter for each of these.')),
                option('Controls self check', () => this.checkControls()),
                option('Which world scheme am I using?', () => speak(settings.scheme === 'walk'
                    ? `Walk and turn gestures. You are facing ${UI.facing()}. Swipe up walks forward, down backward, left and right turn ${settings.turnStep} degrees, tap walks continuously, two finger tap stops, a circle turns around.`
                    : `Compass swipes. Up north, down south, left west, right east. You are facing ${UI.facing()}.`))
            ]);
        },
        /** The spoken guide, chapter by chapter. Every line names a gesture,
         *  button or command that really exists in this build. */
        guideChapters() {
            const facing = () => this.facing();
            return [
                {
                    title: 'Chapter 1. All eight directions',
                    text: () => `Eight compass directions exist: north, north-east, east, south-east, south, south-west, west and north-west, plus up and down for stairs and ladders. Three ways reach them. First, the compass buttons N, NE, E, SE, S, SW, W, NW and Up and Down. Second, typed or spoken words, for example north east, south west, ne, sw, up or down. Third, gestures. Swipe up to walk the way you are facing, down to step backward, left and right to turn. A single tap walks on by itself; two fingers tap stops. For diagonals by gesture, turn on Corner swipes walk diagonally in narrator settings: then up-right is north-east, up-left is north-west, down-right is south-east and down-left is south-west. With that setting off, the four corners open menus instead: down-right notifications, up-right voice commands, up-left nearby actions, down-left social hub, and the compass buttons still walk diagonally. You are facing ${facing()} right now.`
                },
                {
                    title: 'Chapter 2. Inventory',
                    text: () => `Say inventory, or two finger tap anywhere, or press the Items button during a fight. Two finger left and right changes category, up and down moves between items, a single tap repeats the item with its quantity and effects, double tap inspects it, and a long press opens the real actions: use, equip, unequip, inspect or drop. Left or two finger tap closes the inventory. Every result is spoken with real numbers, for example the health a potion restored or the defence an armour added.`
                },
                {
                    title: 'Chapter 3. Chests, items and doors',
                    text: () => `Stand in the room and say open chest. A locked chest names the key it needs; the skeleton key opens the ancient chest in the Eastern Ruins. Loot is real, so say take and the item name, or browse the room with two finger left and right and double tap to act on the thing that is read. Doors: say look around to hear a rune door, cast Alohomora to open it, or break it with Multiple Strike; a house door opens from the nearby actions on up-left. The Christmas toy chest uses christmas open chest. To drink a potion say use healing potion. A refusal always tells you the missing key, item or mana instead of failing silently.`
                },
                {
                    title: 'Chapter 4. Board games: Snakes and Ladders, Ludo, Chess',
                    text: () => `Go to the Game Hall in any city. The hall lists Ludo, Snakes and Ladders, Chess, Carrom and Blackjack, and each board has its own room with buttons and spoken rules. While a board is on the table the board owns single finger gestures. Snakes and Ladders: double tap rolls the die, left and right read the players, circle or down reads the whole board, and typed or spoken roll dice does the same roll. Ludo: double tap rolls, left and right choose a token, double tap selects the token and a second double tap confirms the move, two finger tap cancels the selection, circle reads the board. Chess: swipes including the four diagonals move around the squares, two finger left and right jump between your pieces, double tap plays the selected square, and two finger tap deselects.`
                },
                {
                    title: 'Chapter 5. Combat',
                    text: () => `When a fight starts the game announces every enemy and its health and opens the Combat actions menu. Four swipes fight. Up-right attacks with your chosen ability, up-left casts your chosen spell, down-right defends or dodges, down-left heals, using a healing spell first and then a healing item. The same actions are buttons: 1 Attack, 2 Healing Spell, 3 Multiple Strike, 4 Shock, 5 Items, 6 Defend, 7 Flee, 8 Heal Battle Party, 9 Pray. Typed or spoken attack, defend, flee, heal, cast and use work identically. Every action reports real damage, mana and cooldown, and every failure says why. Combat never moves or turns you, and the combat menu never blocks these four swipes.`
                },
                {
                    title: 'Chapter 6. Menus, help and recovery',
                    text: () => `In menus, up or right is previous, down is next, double tap chooses, left goes back, two finger tap cancels, and a single tap repeats the current choice. If speech stops, single tap repeats the last line, Pause speech and Resume speech on the gesture toolbar control the narrator, and Narrator settings changes speed, volume and mappings. Say guide at any time to hear this guide again, say gesture reference for one-line reminders, and say check controls to test that the gesture surface, the world swipes, the combat buttons and the board game layer are all responding.`
                }
            ];
        },
        /** Say "check controls": report what is really wired, never a guess. */
        checkControls() {
            const notes = [];
            notes.push($('gesture-pad') ? 'Gesture surface: present.' : 'Gesture surface: MISSING.');
            notes.push(GlobalSwipes.ready ? 'World swipes: listening.' : 'World swipes: NOT listening.');
            notes.push(this.active() ? 'Spoken gesture mode: on.' : 'Spoken gesture mode: off. Say gesture controls to turn it on.');
            const buttons = [...document.querySelectorAll('#combat-actions [data-combat-command]')];
            const enabled = buttons.filter(button => !button.disabled).length;
            notes.push(buttons.length ? `Combat buttons: ${buttons.length} present, ${enabled} enabled right now.` : 'Combat buttons: none found.');
            notes.push(G.state.inCombat ? 'A fight is running, so up-right attacks.' : 'No fight is running, so combat swipes stay quiet.');
            notes.push(window.GestureBoard?.handle ? 'Board games: ready.' : 'Board games: not loaded.');
            notes.push(window.GestureModes?.CATEGORIES ? 'Inventory gestures: ready.' : 'Inventory gestures: not loaded.');
            notes.push('A missing or silent part means reload once; this report never claims success it cannot see.');
            speak(notes.join(' '), true, 'system');
            return notes;
        },
        guide(page) {
            const chapters = this.guideChapters();
            const read = index => {
                speak(chapters[index].text(), true, 'system');
                this.open(`Spoken guide, chapter ${index + 1} of ${chapters.length}`, [
                    option('Repeat this chapter', () => read(index)),
                    option('Next chapter', () => read((index + 1) % chapters.length)),
                    option('Back to the chapter list', () => this.guide()),
                    option('Controls self check', () => this.checkControls())
                ]);
            };
            if (Number.isInteger(page)) return read(Math.max(0, Math.min(chapters.length - 1, page)));
            this.open('Spoken guide. Choose a chapter', [
                ...chapters.map((chapter, index) => option(chapter.title, () => read(index))),
                option('Read every chapter in order', () => chapters.forEach((chapter, index) => speak(chapter.text(), index === 0, 'system'))),
                option('Controls self check', () => this.checkControls()),
                option('Close the guide', () => this.close())
            ]);
            speak(`Spoken guide. ${chapters.length} chapters: directions, inventory, chests and doors, board games, combat, menus and recovery.`, false, 'system');
        },
        tutorial(step) {
            const lessons = [
                'Walking and turning. Swipe up to walk forward where you are facing, swipe down to step backward without turning. Swipe left or right to turn on the spot. A single tap starts continuous walking; tap again or two-finger tap to stop. A long press walks while you hold. Draw a circle to turn around. With Walk and turn gestures switched off, swipes become plain compass directions instead.',
                'Diagonal movement and menus. By default a diagonal swipe opens a menu: down-right Notifications, up-right Voice Commands, down-left Social Hub, up-left nearby actions. To walk diagonally instead, use the compass buttons north-east, north-west, south-east and south-west, say or type the direction, or turn on Corner swipes walk diagonally in narrator settings. That setting then also works for swipes anywhere on the screen, not only on the gesture pad.',
                'Continuous walking. Swipe in a cardinal direction and keep the finger down for half a second. Release to stop, including any pending step. Stop walking is always available.',
                'Menus. Down-left opens the social hub, down-right notifications, up-right voice commands, and up-left the nearby actions of this room. Nobody nearby is selected automatically. During a fight these four corners become attack, cast, defend and heal instead.',
                'Magic. Up-left in a fight casts your chosen spell; say cast and a spell name, or say magic, to browse every known spell with its mana cost and cooldown and confirm Cast or Cancel.',
                'Inventory. Two finger tap opens real inventory. Browse items and choose Use, Equip, Inspect or a confirmed Drop where supported. Left returns.',
                'Navigation. The compass buttons show the real exits, including north-east, north-west, south-east and south-west. Two finger swipe up or down takes stairs, and the same stairs are listed as Up and Down buttons. Say look around to hear the description, features and people of this room, and map for a spoken map.',
                'Combat. When a fight starts, up-right performs your chosen combat ability, up-left casts your chosen spell, down-right braces to defend and down-left heals. The same four actions are buttons 1 to 9 and typed commands attack, defend, flee and heal. Every ability states its mana cost and cooldown, and every failure explains why it failed.',
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
        path: 0, turned: 0, lastAngle: null,
        direction(dx, dy) {
            if (Math.hypot(dx, dy) < swipeThreshold()) return null;
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
            return ({ 0: 'right', 1: 'down-right', 2: 'down', 3: 'down-left', 4: 'left', '-4': 'left', '-3': 'up-left', '-2': 'up', '-1': 'up-right' })[angle];
        },
        stop() { clearTimeout(this.timer); clearInterval(this.repeat); this.timer = this.repeat = null; if (UI.walking) { G.cancelPendingMovement?.(); speak(`Walking stopped at ${loc()?.name}.`, false, 'location'); } UI.walking = false; },
        reset() { this.stop(); G.cancelPendingMovement?.(); clearTimeout(this.tapTimer); this.points.clear(); this.endToken = null; this.lastTap = 0; this.maxPointers = 0; },
        down(e) {
            if (!UI.active() || e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            clearTimeout(this.tapTimer);
            if (!this.points.size) {
                this.held = false; this.maxPointers = 0; this.started = Date.now();
                this.path = 0; this.turned = 0; this.lastAngle = null;
            }
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
                if (this.maxPointers === 1 && !UI.menu && settings.scheme === 'walk') {
                    // Long press walks forward while the finger stays down; letting
                    // go stops it, including any pending step.
                    UI.walking = true;
                    if (!UI.walkStep(false)) { UI.walking = false; return; }
                    this.repeat = setInterval(() => { if (!UI.walkStep(false)) this.stop(); }, settings.interval);
                } else if (this.maxPointers === 1 && ['up', 'down', 'left', 'right'].includes(token) && !UI.menu) {
                    const dir = settings.map[token];
                    if (!['north', 'south', 'east', 'west'].includes(dir)) return;
                    UI.walking = true; UI.move(dir);
                    if (UI.walking) this.repeat = setInterval(() => UI.move(dir), settings.interval);
                } else if (!token) UI.handle(this.maxPointers === 2 ? 'two-hold' : 'hold');
            }, 550);
        },
        move(e) {
            const p = this.points.get(e.pointerId); if (!p) return;
            e.preventDefault();
            const x0 = p.x + p.dx, y0 = p.y + p.dy;
            const step = Math.hypot(e.clientX - x0, e.clientY - y0);
            p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
            if (this.maxPointers === 1) {
                this.path += step;
                const angle = Math.atan2(p.dy, p.dx) * 180 / Math.PI;
                if (this.lastAngle !== null) {
                    let delta = angle - this.lastAngle;
                    if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
                    // Ignore jumps: a real circular swipe turns smoothly.
                    if (Math.abs(delta) < 135) this.turned += delta;
                }
                this.lastAngle = angle;
            }
            if (this.maxPointers === 2 && this.direction(p.dx, p.dy)) { this.held = true; this.stop(); }
        },

        /** A full loop of the finger means turn around. */
        circled() {
            return Math.abs(this.turned) >= 250 && this.path > 140;
        },
        up(e) {
            const p = this.points.get(e.pointerId); if (!p) return;
            e.preventDefault(); p.dx = e.clientX - p.x; p.dy = e.clientY - p.y;
            const circling = this.maxPointers === 1 && this.circled();
            const token = (circling && settings.scheme === 'walk' ? 'circle' : this.direction(p.dx, p.dy)), countChecked = this.maxPointers;
            this.points.delete(e.pointerId);
            this.stop();
            if (this.points.size) { this.endToken = token; return; }
            const finalToken = token || this.endToken; this.endToken = null;
            if (countChecked === 2 && finalToken) {
                this.lastTap = 0;
                // Two-finger swipe up = go up stairs, down = go down, left/right =
                // browse what is really here. Any other two-finger swipe cancels.
                if (finalToken === 'up') { UI.handle('go_up'); return; }
                if (finalToken === 'down') { UI.handle('go_down'); return; }
                if (finalToken === 'left' || finalToken === 'right') { UI.handle(finalToken === 'left' ? 'two-left' : 'two-right'); return; }
                UI.handle('cancel');
                return;
            }
            if (this.held) { this.lastTap = 0; return; }
            if (countChecked === 2) { this.lastTap = 0; UI.handle('two-tap'); return; }
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
            document.addEventListener('visibilitychange', () => { 
                if (document.hidden) {
                    this.reset(); 
                } else if (UI.active() && settings.narration) {
                    // Resume voice after TalkBack toggle or page visibility change
                    A.resumeVoice();
                    speak('Game resumed.', false, 'system');
                }
            });
        }
    };

    const oldEnter = G.enterLocation;
    G.enterLocation = function(id, alreadyVisited) {
        UI.clearFocus();
        const p = this.state.player; if (p?.gesturePosture?.location !== id && p) p.gesturePosture = null;
        const result = oldEnter.call(this, id, alreadyVisited);
        if (settings.narration && UI.active() && this._walkingArrival !== id) {
            // Only speak location name — NOT the description. User can use Look Around for details.
            if (!UI.walking) speak(`Current location: ${loc()?.name}.`, false, 'location');
            else if (!UI.lastWalkSpoken || Date.now() - UI.lastWalkSpoken > 1500) { UI.lastWalkSpoken = Date.now(); speak(`Reached ${loc()?.name}.`, false, 'location'); }
        }
        if (UI.destination === this.state.location) { speak('Destination reached.'); UI.destination = null; Gestures.stop(); }
        return result;
    };
    // Block normal commands as well as gestures while a posture is active.
    const oldMove = G.move;
    G.move = function(dir) { return oldMove.call(this, dir); }; // the core move explains a sitting or lying posture itself
    const oldStart = G.startCombat;
    G.startCombat = function(...args) { Gestures.stop(); UI.menu = null; UI.stack = []; if (this.state.player) this.state.player.gesturePosture = null; const r = oldStart.apply(this, args); if (UI.active() && this.state.inCombat && this.state.enemy) { UI.context(); return r; } UI.render(); if (settings.narration) {
        // Read combat status clearly - monster count, HP, etc.
        const enemies = G.aliveEncounterTargets?.() || [];
        const e = this.state.enemy;
        const p = this.state.player;
        let statusText = '';
        if (enemies.length > 1) {
            statusText = `Combat begins! You face ${enemies.length} enemies. `;
            enemies.forEach((enemy, i) => {
                statusText += `Enemy ${i+1}: ${enemy.name}, ${enemy.hp} HP. `;
            });
        } else if (e) {
            statusText = `Combat begins! You face ${e.name} with ${e.hp} HP. `;
        }
        statusText += `Your HP: ${p?.hp || 0} of ${p?.maxHp || 0}. Mana: ${p?.mp || 0}. `;
        statusText += `Up-right attacks, up-left casts, down-right defends, down-left heals. Say combat actions for the whole list; every action is also a button.`;
        speak(statusText, true, 'combat');
    } return r; };
    const oldHUD = G.updateHUD;
    G.updateHUD = function(...args) { const r = oldHUD.apply(this, args), p = this.state.player; const low = p && p.hp > 0 && p.hp <= p.maxHp * .25; if (low && !UI.lowHealth) speak('Your health is low. Swipe down-left to heal, or open inventory for healing items.', true); UI.lowHealth = low; return r; };
    const oldCommand = G.processCommand;
    G.processCommand = function(raw) {
        const c = String(raw || '').trim().toLowerCase();
        if (c.startsWith('unequip ')) return this.unequipItem(c.slice(8));
        if (c === 'gesture controls') return UI.enable();
        if (c === 'gesture reference') return UI.reference();
        // The spoken in-game guide. Nothing here needs a web page.
        if (['guide', 'spoken guide', 'gesture guide', 'how to play', 'help guide'].includes(c)) return UI.guide();
        if (['check controls', 'controls check', 'gesture check'].includes(c)) return UI.checkControls();
        if (c === 'stand' || c === 'wake') return UI.posture('stand');
        if (c === 'sit') return UI.posture('sit'); if (c === 'lie down') return UI.posture('lie');
        return oldCommand.call(this, raw);
    };

    function init() {
        if ($('gesture-interface')) return;
        document.addEventListener('click', event => { if (event.target.closest?.('button')) A.playSFX('click'); }, { passive: true });
        const launch = document.createElement('button'); launch.id = 'gesture-launch'; launch.type = 'button'; launch.textContent = 'Start spoken gesture controls'; launch.onclick = () => UI.enable(); (visible($('interface-mode-dialog')) ? $('interface-mode-dialog').querySelector('.interface-mode-card') : document.body).append(launch);
        const overlay = document.createElement('section'); overlay.id = 'gesture-interface'; overlay.hidden = true; overlay.setAttribute('aria-label', 'Accessible gesture controls');
        overlay.innerHTML = '<h2 id="gesture-heading">World gestures</h2><p id="gesture-selection"></p><div id="gesture-pad" tabindex="0" role="group" aria-label="Gesture surface. Swipe to move or browse menus. Double tap chooses. Two finger swipe cancels.">Gesture surface</div><div class="gesture-toolbar"><button id="gesture-all">Game controls</button><button id="gesture-back">Back / Cancel</button><button id="gesture-stop">Stop walking</button><button id="gesture-repeat">Repeat</button><button id="gesture-pause">Pause speech</button><button id="gesture-resume">Resume speech</button><button id="gesture-prefs">Narrator settings</button><button id="gesture-help">Gesture reference</button></div><p id="gesture-speech-status" role="status">Tap Test narrator if you do not hear speech. Browser voices may require installed device voice data.</p>';
        document.body.append(overlay);
        $('gesture-all').onclick = () => UI.controls(); $('gesture-back').onclick = () => UI.back(); $('gesture-stop').onclick = () => { Gestures.reset(); speak('Walking stopped.'); };
        $('gesture-pause').onclick = () => A.pauseVoice(); $('gesture-resume').onclick = () => A.resumeVoice();
        $('gesture-repeat').onclick = () => A.repeatVoice(); $('gesture-prefs').onclick = () => UI.preferences(); $('gesture-help').onclick = () => UI.reference();
        Gestures.bind($('gesture-pad'));
        $('gesture-pad').addEventListener('keydown', e => { const tokens = { ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'double', Escape: 'cancel' }; if (tokens[e.key]) { e.preventDefault(); e.stopPropagation(); UI.handle(tokens[e.key]); } });
        const fieldset = document.createElement('fieldset'); fieldset.innerHTML = '<legend>Built-in game narration and gestures</legend><label><input id="gesture-narration" type="checkbox"> Narrate game events independently of TalkBack</label><label><input id="gesture-directions" type="checkbox"> Announce possible directions when I return to a place</label><button type="button" id="gesture-settings-open">Narrator settings, tutorial and gesture remapping</button><button type="button" id="gesture-guide-open">Spoken guide: directions, inventory, chests, board games, combat</button><button type="button" id="gesture-check-open">Check my controls</button>';
        document.querySelector('#settings-panel .settings-card')?.append(fieldset);
        $('gesture-narration').onchange = e => { settings.narration = e.target.checked; persist(); A.setVoiceEnabled(settings.narration); if (settings.narration) speak('Independent game narration enabled.'); };
        const directionsBox = $('gesture-directions');
        if (directionsBox) { directionsBox.checked = settings.directions; directionsBox.onchange = e => { settings.directions = e.target.checked; persist(); speak(settings.directions ? 'Possible directions will be read when you return to a place you know.' : 'Possible directions will not be read on arrival.'); }; }
        $('gesture-settings-open').onclick = () => { if (!UI.active()) InterfaceMode.apply('blind'); UI.preferences(); };
        $('gesture-guide-open').onclick = () => { if (!UI.active()) InterfaceMode.apply('blind'); UI.guide(); };
        $('gesture-check-open').onclick = () => UI.checkControls();
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
    // ============================================
    // Global swipe detection for diagonal and two-finger gestures
    // Works regardless of whether the gesture overlay is visible
    // ============================================
    const GlobalSwipes = {
        points: new Map(),
        maxPointers: 0,
        threshold: 50,
        startedAt: 0,
        ready: false,
        watchdog: null,
        // A phantom finger is dropped after this long, so one lost pointer can
        // never wedge the whole gesture layer.
        PHANTOM_MS: 1500,
        // A finger that never reports an up (app switch, call, finger lifted
        // outside the window) must never leave a phantom finger behind: every
        // later swipe was ignored until the page was reloaded.
        MAX_GESTURE_MS: 12000,

        init() {
            document.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
            document.addEventListener('pointermove', (e) => this.move(e), { passive: false });
            document.addEventListener('pointerup', (e) => this.up(e), { passive: false });
            document.addEventListener('pointercancel', () => this.reset(), { passive: false });
            window.addEventListener('blur', () => this.reset());
            window.addEventListener('pagehide', () => this.reset());
            document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
            this.ready = true;
        },

        direction(dx, dy) {
            if (Math.hypot(dx, dy) < this.threshold) return null;
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
            return ({ 0: 'right', 1: 'down-right', 2: 'down', 3: 'down-left', 4: 'left', '-4': 'left', '-3': 'up-left', '-2': 'up', '-1': 'up-right' })[angle];
        },

        /** A panel or dialog owns its own swipes; the world must not react. */
        panelOwns(target) {
            return Boolean(target?.closest?.('.panel:not(.hidden),[role="dialog"]:not(.hidden)'));
        },

        down(e) {
            // Only track if game is active and we're not already in the gesture pad (let it handle its own)
            if (e.target?.closest?.('#gesture-pad')) return;
            if (e.target?.closest?.('#gesture-interface')) return;
            if (this.panelOwns(e.target)) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (!G.state?.player || G.state.screen !== 'game-screen') return;
            if (!this.points.size) this.startedAt = Date.now();
            clearTimeout(this.watchdog); this.watchdog = null;
            // Drop fingers that stopped reporting long ago, and never stack a
            // third: more than two fingers is not a gesture this game defines.
            const now = Date.now();
            for (const [id, held] of [...this.points]) if (now - (held.at || 0) > this.PHANTOM_MS) this.points.delete(id);
            if (this.points.size && this.points.has(e.pointerId)) this.points.delete(e.pointerId);
            if (this.points.size >= 2) { this.reset(); return; }
            this.points.set(e.pointerId, { x: e.clientX, y: e.clientY, dx: 0, dy: 0, at: now });
            this.maxPointers = Math.max(this.maxPointers, this.points.size);
        },

        move(e) {
            const p = this.points.get(e.pointerId);
            if (!p) return;
            p.dx = e.clientX - p.x;
            p.dy = e.clientY - p.y;
            p.at = Date.now();
        },

        up(e) {
            const p = this.points.get(e.pointerId);
            if (!p) return;
            p.dx = e.clientX - p.x;
            p.dy = e.clientY - p.y;
            const token = this.direction(p.dx, p.dy);
            const count = this.maxPointers;
            this.points.delete(e.pointerId);

            if (Date.now() - this.startedAt > this.MAX_GESTURE_MS) { this.reset(); return; }
            if (this.points.size > 0) {
                // Wait for all fingers to lift, but not for a finger that will
                // never lift: a reappearing gesture must work a moment later.
                clearTimeout(this.watchdog);
                this.watchdog = setTimeout(() => this.reset(), this.PHANTOM_MS);
                return;
            }

            // Only handle diagonal swipes and two-finger vertical swipes
            const isDiagonal = ['down-right', 'up-right', 'down-left', 'up-left'].includes(token);
            const isTwoFingerVertical = count === 2 && (token === 'up' || token === 'down');

            if (isTwoFingerVertical) {
                // Two fingers up or down are the stairs, exactly like the pad.
                // Never during a fight, and never a plain "up" command that would
                // only answer "there is no path up".
                if (G.state.inCombat || G.state.combatTransition) {
                    speak('You cannot change floors during a fight. Up-right attacks, down-right defends, down-left heals.', true, 'combat');
                } else if (UI.active()) {
                    UI.handle(token === 'up' ? 'go_up' : 'go_down');
                } else if (G.processCommand) {
                    G.processCommand(token === 'up' ? 'up' : 'down');
                }
                this.reset();
                return;
            }

            if (isDiagonal && G.state.inCombat && UI.active()) {
                UI.handle(token);
                this.reset();
                return;
            }
            if (isDiagonal && !G.state.inCombat) {
                // Corner swipes walk diagonally when the player chose that in
                // narrator settings. Before v7.65 this setting only worked on
                // the gesture pad, so a world swipe could never reach north-east.
                // A board game (chess, Snakes and Ladders, Ludo) owns every
                // single finger gesture while it is on the table.
                if (UI.active() && !UI.menu && window.GestureBoard?.active?.()) UI.handle(token);
                else if (settings.corners === 'walk' && UI.active() && !UI.menu) UI.handle(token);
                // Otherwise the four corners open panels.
                else if (!UI.menu) {
                    if (token === 'down-right' && UI.notifications) UI.notifications();
                    else if (token === 'up-right' && UI.voiceCommands) UI.voiceCommands();
                    else if (token === 'down-left' && UI.hub) UI.hub();
                    else if (token === 'up-left' && UI.context) UI.context();
                }
                this.reset();
                return;
            }

            this.reset();
        },

        reset() {
            clearTimeout(this.watchdog); this.watchdog = null;
            this.points.clear();
            this.maxPointers = 0;
            this.startedAt = 0;
        }
    };

    // Initialize global swipes after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => GlobalSwipes.init(), { once: true });
    } else {
        GlobalSwipes.init();
    }

    // Every typed or spoken cast goes through one door, so the attempt counter
    // cannot miss the spells that have specialised combat handlers.
    const oldProcessCommand = G.processCommand.bind(G);
    const SPELL_ALIASES = {
        'multiple strike': 'Multi Strike', 'multi strike': 'Multi Strike',
        'shock': 'Shock', 'alohomora': 'Alohomora', 'opening doors': 'Alohomora',
        'opening door': 'Alohomora', 'light orbs': 'Light Orbs', 'healing spell': 'heal'
    };
    G.processCommand = function (input) {
        const text = String(input || '').trim();
        const key = text.toLowerCase();
        const cast = /^cast\s+(.+)$/.exec(key) || /^cast spell\s+(.+)$/.exec(key);
        let wanted = cast ? cast[1].trim() : key;
        const spells = this.state.player?.spells || [];
        const alias = SPELL_ALIASES[wanted];
        let spell = alias && (wanted === 'healing spell'
            ? spells.find(s => /heal|mend/i.test(s))
            : spells.find(s => s.toLowerCase() === alias.toLowerCase()));
        if (!spell) spell = spells.find(s => s.toLowerCase() === wanted) || spells.find(s => s.toLowerCase().includes(wanted));
        const isCast = Boolean(cast) || Boolean(alias);
        if (isCast && spell) return this.castSpell(spell);
        return oldProcessCommand(input);
    };

    // Mastery must count every cast, including the spells handled by the later
    // combat systems (Multi-Strike, Shock, Light Orbs, healing, doors). This is
    // the outermost cast wrapper, so it sees the real state before and after.
    const oldCastSpell = G.castSpell?.bind(G);
    if (oldCastSpell) {
        G.castSpell = function (name) {
            const spells = this.state.player?.spells || [];
            const wanted = String(name || '').toLowerCase().trim();
            const spell = spells.find(s => s.toLowerCase() === wanted) || spells.find(s => s.toLowerCase().includes(wanted));
            if (!spell || !this.recordSpellAttempt) return oldCastSpell(name);
            const p = this.state.player;
            const log = document.getElementById('narrative');
            const before = {
                mp: p.mp, hp: p.hp, enemy: this.state.enemy?.name || '',
                enemyHp: this.state.enemy?.hp ?? 0,
                companionHp: (this.state.companions || []).reduce((n, c) => n + (c.hp || 0), 0),
                lines: log ? log.children.length : 0
            };
            this.recordSpellAttempt(spell);
            const result = oldCastSpell(name);
            const settle = () => {
                try {
                    if (!this.state?.player) return;
                    const after = {
                        mp: this.state.player.mp, hp: this.state.player.hp,
                        enemyHp: this.state.enemy?.hp ?? 0,
                        companionHp: (this.state.companions || []).reduce((n, c) => n + (c.hp || 0), 0)
                    };
                    const used = Math.max(0, before.mp - after.mp);
                    const damage = Math.max(0, before.enemyHp - after.enemyHp);
                    const healing = Math.max(0, after.hp - before.hp) + Math.max(0, after.companionHp - before.companionHp);
                    const text = log ? [...log.children].slice(before.lines).map(el => el.textContent).join(' ') : '';
                    const utility = /alohomora|opening door|close door|lifestrike|light orbs/i.test(spell);
                    const worked = damage > 0 || healing > 0
                        || /clicks|unlocks|bursts|restores \d|healed \d|strikes? for|hits? .* for|damage/i.test(text)
                        || (utility && used > 0 && !/no locked door|cannot|only use|not enough|requires/i.test(text));
                    this.recordSpellOutcome(spell, worked);
                    this.save?.();
                } catch { /* the page or fight has gone away */ }
            };
            setTimeout(settle, 400);
            return result;
        };
    }

    // Combat starts are announced by the game narrator itself, never by TalkBack.
    const oldStartCombat = G.startCombat?.bind(G);
    if (oldStartCombat) {
        G.startCombat = function (name, queued) {
            oldStartCombat(name, queued);
            if (!this.state.inCombat) return;
            const count = (this.aliveEncounterTargets?.() || []).length;
            const enemy = count === 1 ? `One enemy (${this.state.enemy?.name || name}) is nearby.` : `${count} enemies are nearby.`;
            speak(`Combat started. ${enemy} Up-right attacks, up-left casts, down-right defends or dodges, down-left heals.`, true, 'combat');
        };
    }

    window.GestureAccessibility = { UI, Gestures, settings, defaults, furniture, spellInfo, GlobalSwipes, DIRECTIONS, speak, combatTokens: ['up-right', 'up-left', 'down-right', 'down-left'] };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
