/**
 * Gesture combat abilities (v7.60).
 *
 * Every ability on this list is a real mechanic with a real number behind it:
 * a real accuracy roll, a real damage formula taken from the hero's own weapon
 * and strength, real mana, real cooldowns and a real spoken reason when it
 * fails. Nothing here is decoration, and no ability ever reports success when
 * the game state did not change.
 *
 * Cooldowns are counted in combat actions: using any ability (including a basic
 * attack) advances every cooldown by one.
 */
(function () {
    'use strict';
    const Game = window.Game;
    if (!Game) return;

    const ABILITIES = Object.freeze([
        { id: 'basic', name: 'Basic Attack', desc: 'A normal weapon strike. No mana, no cooldown, 8 percent base miss chance from the ordinary attack rules.', cost: 0, cooldown: 0 },
        { id: 'heavy', name: 'Heavy Attack', desc: 'A slower, heavier swing. Lands 65 percent of the time plus a quarter of your dexterity, for 1.7 times weapon damage. Cooldown 2 combat actions.', cost: 0, cooldown: 2 },
        { id: 'quick', name: 'Quick Attack', desc: 'A fast jab. Lands 92 percent of the time plus a quarter of your dexterity, for 0.6 times weapon damage. Cooldown 1 combat action.', cost: 0, cooldown: 1 },
        { id: 'multi', name: 'Multi-Strike', desc: 'The Multi Strike spell: three separate strikes in one action, 24 mana. Requires the spell, and it can still fizzle.', cost: 24, cooldown: 0, spell: 'Multi Strike' },
        { id: 'magic', name: 'Magical Attack', desc: 'Cast your chosen damaging spell at its real mana cost.', cost: null, cooldown: 0 },
        { id: 'defensive', name: 'Defensive Stance', desc: 'Brace so the next enemy blow is halved. Cooldown 1 combat action.', cost: 0, cooldown: 1 },
        { id: 'special', name: 'Special Ability', desc: 'Your class power, cast at its real mana cost.', cost: null, cooldown: 0 }
    ]);

    // Each class keeps one signature spell. If the hero has not learned it, the
    // special ability honestly reports that instead of inventing an effect.
    const CLASS_SPECIAL = {
        warrior: 'Battle Cry', mage: 'Ice Storm', rogue: 'Backstab', cleric: 'Holy Light',
        paladin: 'Hammer Smite', ranger: 'Piercing Volley', monk: 'Chi Burst', druid: 'Thorn Storm',
        summoner: 'Multi Strike', hunter: 'Multi Strike'
    };

    const reason = (text) => Game.addNarrative(text, 'system');

    Game.COMBAT_ABILITIES = ABILITIES;

    Game.combatAbilityInfo = function (id) {
        const wanted = String(id || '').toLowerCase();
        if (wanted === 'attack' || wanted === 'fight') return ABILITIES[0];
        return ABILITIES.find(a => a.id === wanted) || ABILITIES.find(a => a.name.toLowerCase() === wanted) || null;
    };

    Game.combatSpell = function () {
        const p = this.state.player;
        if (!p) return '';
        if (p.combatSpell && (p.spells || []).includes(p.combatSpell)) return p.combatSpell;
        return (p.spells || []).find(name => !/heal|mend|blessing/i.test(name)) || '';
    };

    Game.setCombatSpell = function (name) {
        const p = this.state.player;
        if (!p) return false;
        if (!(p.spells || []).includes(name)) { reason(`You have not learned ${name}.`); return false; }
        p.combatSpell = name;
        this.save();
        this.addNarrative(`${name} is now your magical attack.`, 'magic');
        return true;
    };

    Game.combatCooldown = function (id) {
        return Math.max(0, Math.floor((this.state.combatCooldowns || {})[id] || 0));
    };

    /** Every combat action advances all cooldowns by one. */
    Game.tickCombatCooldowns = function () {
        const cooldowns = this.state.combatCooldowns = this.state.combatCooldowns || {};
        for (const key of Object.keys(cooldowns)) cooldowns[key] = Math.max(0, cooldowns[key] - 1);
    };

    Game.describeCombatAbility = function (id) {
        const a = this.combatAbilityInfo(id);
        if (!a) { reason(`There is no combat ability called ${id}.`); return null; }
        const cooldown = this.combatCooldown(a.id);
        const p = this.state.player || {};
        let line = `${a.name}. ${a.desc}`;
        if (a.id === 'magic' || a.id === 'special') {
            const spell = a.id === 'special' ? (CLASS_SPECIAL[p.class] || '') : this.combatSpell();
            line += spell ? ` Uses ${spell}.` : ' No spell is set for it yet.';
        }
        line += cooldown ? ` It is cooling down for ${cooldown} more combat ${cooldown === 1 ? 'action' : 'actions'}.` : ' It is ready.';
        line += ` Your magic is ${p.mp || 0} of ${p.maxMp || 0}.`;
        this.addNarrative(line, 'combat');
        return a;
    };

    Game.combatAbility = function (id) {
        const a = this.combatAbilityInfo(id);
        if (!a) { reason(`There is no combat ability called ${id}.`); return false; }
        const p = this.state.player;
        const e = this.state.enemy;
        if (!p) return false;
        if (!this.state.inCombat || !e || e.hp <= 0) { reason(`${a.name} needs a fight. There is no enemy here right now.`); return false; }
        if (this.state.combatTransition) { reason(`${a.name} cannot be used while the next enemy is stepping in.`); return false; }
        const cooldown = this.combatCooldown(a.id);
        if (cooldown > 0) {
            reason(`${a.name} is not ready. ${cooldown} more combat ${cooldown === 1 ? 'action' : 'actions'} must pass.`);
            return false;
        }
        if (a.cost && p.mp < a.cost) {
            reason(`${a.name} needs ${a.cost} magic. You have ${p.mp}. No mana was spent.`);
            return false;
        }
        if (a.id === 'multi' && !(p.spells || []).includes('Multi Strike')) {
            reason('Multi-Strike failed. You have not learned the Multi Strike spell yet. No mana was spent.');
            return false;
        }
        if (a.id === 'magic') {
            const spell = this.combatSpell();
            if (!spell) { reason('Magical attack failed. You know no damaging spell yet. No mana was spent.'); return false; }
            this.tickCombatCooldowns();
            if (a.cooldown) this.state.combatCooldowns[a.id] = a.cooldown;
            this.castSpell(spell);
            return true;
        }
        if (a.id === 'special') {
            const spell = CLASS_SPECIAL[p.class] || '';
            if (!spell || !(p.spells || []).includes(spell)) {
                reason(`Special ability failed. ${p.class || 'Your class'} has no special spell learned yet. No mana was spent.`);
                return false;
            }
            this.tickCombatCooldowns();
            this.castSpell(spell);
            return true;
        }
        if (a.id === 'defensive') {
            this.tickCombatCooldowns();
            this.state.combatCooldowns[a.id] = a.cooldown;
            this.defend();
            return true;
        }
        if (a.id === 'multi') {
            this.tickCombatCooldowns();
            this.castSpell('Multi Strike');
            return true;
        }
        if (a.id === 'basic') {
            this.tickCombatCooldowns();
            this.attack();
            return true;
        }
        return this.heavyOrQuickStrike(a);
    };

    Game.heavyOrQuickStrike = function (a) {
        const heavy = a.id === 'heavy';
        this.combatSequence(async () => {
            const p = this.state.player, e = this.state.enemy;
            if (!p || !e || e.hp <= 0) return;
            const weapon = (this.state.inventory || []).find(i => i.name === p.weapon && i.type === 'weapon');
            const weaponStr = weapon?.strength || 0;
            const base = (weapon?.minDamage !== undefined && weapon?.maxDamage !== undefined)
                ? weapon.minDamage + Math.floor(Math.random() * (weapon.maxDamage - weapon.minDamage + 1))
                : Math.max(1, p.weaponDamage || 8);
            const raw = Math.max(1, base + Math.floor((p.str + weaponStr) / 2) + Math.floor(Math.random() * 6));
            const damage = Math.max(1, Math.round(raw * (heavy ? 1.7 : 0.6)));
            const chance = Math.min(heavy ? 85 : 97, (heavy ? 65 : 92) + Math.floor((p.dex || 0) / 4));
            const hit = Math.random() * 100 < chance;
            this.tickCombatCooldowns();
            this.state.combatCooldowns[a.id] = a.cooldown;
            if (!hit) {
                window.MusicSystem?.playSFX('miss');
                this.addNarrative(`${a.name} misses ${e.name}. It lands ${chance} percent of the time and this swing missed.`, 'combat');
            } else {
                window.MusicSystem?.playSFX(heavy ? 'attack-heavy' : 'attack-fast');
                this.addNarrative(`${a.name} hits ${e.name} for ${damage} damage.`, 'combat');
                this.applyEnemyDamage(damage, null);
            }
            if (e.hp <= 0) { await this.enemyDefeated(); await this.resolveSurvivorTurn(); return; }
            await this.companionTurn();
            if (this.state.inCombat && this.state.enemy && this.state.enemy.hp > 0) await this.enemyAttack();
        });
        return true;
    };

    /** Text commands, so nothing here depends on a visible button. */
    const oldCommand = Game.processCommand.bind(Game);
    Game.processCommand = function (input) {
        const text = String(input || '').trim();
        const c = text.toLowerCase();
        if (c === 'abilities' || c === 'combat abilities') {
            (this.COMBAT_ABILITIES || []).forEach(a => this.describeCombatAbility(a.id));
            return;
        }
        if (c.startsWith('ability ')) {
            this.describeCombatAbility(c.slice(8).trim().replace(/ /g, '-')) ||
                this.COMBAT_ABILITIES.forEach(a => { if (a.name.toLowerCase().includes(c.slice(8).trim())) this.describeCombatAbility(a.id); });
            return;
        }
        if (c.startsWith('combat ')) {
            const id = c.slice(7).trim();
            if (this.combatAbilityInfo(id)) { this.combatAbility(id); return; }
        }
        if (c.startsWith('combat spell ')) { this.setCombatSpell(text.slice(13).trim()); return; }
        return oldCommand(input);
    };

    // Cooldowns are per-fight pacing, but they are still saved so a reload cannot
    // be used to reset a heavy swing mid-battle.
    const oldSave = Game.getSaveData.bind(Game);
    Game.getSaveData = function () {
        const data = oldSave();
        data.combatCooldowns = JSON.parse(JSON.stringify(this.state.combatCooldowns || {}));
        return data;
    };

    const oldContinue = Game.continueGame.bind(Game);
    Game.continueGame = function () {
        let data;
        try {
            const roster = this.getRoster();
            data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey));
        } catch { /* no save available */ }
        oldContinue();
        this.state.combatCooldowns = data?.combatCooldowns || {};
    };
})();
