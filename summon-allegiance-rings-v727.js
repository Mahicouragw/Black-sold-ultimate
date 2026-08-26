/**
 * v7.25.7 — Real summons, allegiance (Command Beast), rings, unique SFX.
 * Wraps existing combat/spell systems. Does not replace music or combat.
 */
(() => {
    const PARTY_CAP = 3;
    const BESTIARY = {
        spider: { id: 'spider', name: 'Moon Spider', mp: 20, maxHp: 28, attack: 10, defense: 4, heal: 0, rarity: 'common', duration: 'battle' },
        goblin: { id: 'goblin', name: 'Guild Goblin', mp: 30, maxHp: 40, attack: 14, defense: 6, heal: 0, rarity: 'common', duration: 'battle' },
        'spirit wolf': { id: 'spirit wolf', name: 'Spirit Wolf', mp: 60, maxHp: 52, attack: 18, defense: 8, heal: 4, rarity: 'uncommon', duration: 'battle' },
        'healing spirit': { id: 'healing spirit', name: 'Healing Spirit', mp: 40, maxHp: 36, attack: 8, defense: 5, heal: 14, rarity: 'uncommon', duration: 'battle' },
        'goblin mage': { id: 'goblin mage', name: 'Goblin Mage', mp: 45, maxHp: 34, attack: 12, defense: 5, heal: 10, rarity: 'uncommon', duration: 'battle' },
        'storm creature': { id: 'storm creature', name: 'Storm Creature', mp: 80, maxHp: 64, attack: 22, defense: 10, heal: 0, rarity: 'rare', duration: 'battle' },
        'storm wolf': { id: 'storm wolf', name: 'Storm Wolf', mp: 150, maxHp: 90, attack: 28, defense: 12, heal: 6, rarity: 'legendary', duration: 'battle' },
        'shade mage': { id: 'shade mage', name: 'Shade Mage', mp: 24, maxHp: 36, attack: 12, defense: 4, heal: 10, rarity: 'uncommon', duration: 'battle' }
    };

    const RINGS = {
        'summoning ring': { id: 'summoning ring', name: 'Summoning Ring', type: 'ring', summons: 'goblin', mp: 30, desc: 'Calls a Guild Goblin into battle.', ariaLabel: 'Summoning Ring' },
        'spirit ring': { id: 'spirit ring', name: 'Spirit Ring', type: 'ring', summons: 'spirit wolf', mp: 60, desc: 'Calls a Spirit Wolf into battle.', ariaLabel: 'Spirit Ring' },
        'beast ring': { id: 'beast ring', name: 'Beast Ring', type: 'ring', effect: 'command', mp: 20, desc: 'Attempts to enchant the current foe.', ariaLabel: 'Beast Ring' },
        'storm ring': { id: 'storm ring', name: 'Storm Ring', type: 'ring', summons: 'storm creature', mp: 80, desc: 'Calls a Storm Creature into battle.', ariaLabel: 'Storm Ring' },
        'binding ring': { id: 'binding ring', name: 'Binding Ring', type: 'ring', effect: 'bind', mp: 18, desc: 'Weakens the current foe.', ariaLabel: 'Binding Ring' }
    };

    const sfxOnce = (type, stamp) => {
        const now = Date.now();
        Game._v727SfxAt = Game._v727SfxAt || {};
        if (Game._v727SfxAt[stamp] && now - Game._v727SfxAt[stamp] < 250) return false;
        Game._v727SfxAt[stamp] = now;
        window.MusicSystem?.playSFX(type);
        return true;
    };

    const say = (game, text, type, eventId) => {
        if (game.emitGameEvent) return game.emitGameEvent(text, type, { eventId });
        game.addNarrative(text, type);
        return Promise.resolve(false);
    };

    const livingParty = game => (game.state.companions || []).filter(c => c.hp > 0);

    const apply = () => {
        if (!window.Game || Game._v727Summons) return false;
        Game._v727Summons = true;

        Object.entries(RINGS).forEach(([id, item]) => {
            if (!WorldData.items[id]) WorldData.items[id] = { ...item, value: 80 };
        });

        Game.getSummonData = function (query) {
            const q = String(query || '').toLowerCase().trim();
            return BESTIARY[q] || Object.values(BESTIARY).find(b => b.name.toLowerCase() === q || b.id === q) || null;
        };

        Game.dismissTemporarySummons = function () {
            const before = (this.state.companions || []).length;
            this.state.companions = (this.state.companions || []).filter(c => !c.temporary);
            this.state.combatGroup = (this.state.companions || []).map(c => c.name);
            this.state.convertedFoe = null;
            return before - this.state.companions.length;
        };

        Game.summonCreature = function (query, { source = 'spell', skipMp = false } = {}) {
            const p = this.state.player;
            const data = this.getSummonData(query);
            if (!p || !data) {
                sfxOnce('miss', 'summon-fail');
                say(this, 'You do not know how to summon that creature.', 'system', 'summon-unknown');
                return { ok: false, reason: 'unknown' };
            }
            if (!this.state.inCombat) {
                sfxOnce('miss', 'summon-fail');
                say(this, 'You can only summon a creature during battle.', 'system', 'summon-ncombat');
                return { ok: false, reason: 'combat' };
            }
            if (livingParty(this).length >= PARTY_CAP) {
                sfxOnce('miss', 'summon-fail');
                say(this, 'Your party is already at its maximum combat capacity.', 'system', 'summon-full');
                return { ok: false, reason: 'full' };
            }
            if (!skipMp && p.mp < data.mp) {
                sfxOnce('miss', 'summon-fail');
                say(this, `You don't have enough magic to summon the ${data.name}. You need ${data.mp} magic points, but you have ${p.mp}.`, 'system', `summon-mp:${data.id}`);
                return { ok: false, reason: 'mp', need: data.mp, have: p.mp };
            }
            if (!skipMp) p.mp -= data.mp;
            const creature = {
                name: data.name,
                role: 'summon',
                maxHp: data.maxHp,
                hp: data.maxHp,
                attack: data.attack,
                defense: data.defense,
                heal: data.heal,
                team: 'player',
                summoned: true,
                temporary: true,
                summonId: data.id,
                level: Math.max(1, p.level || 1)
            };
            this.state.companions.push(creature);
            this.state.combatGroup.push(creature.name);
            sfxOnce('summon', 'summon-ok');
            const ringNote = source === 'ring' ? `The ring glows. ` : '';
            say(this, `${ringNote}You summoned a ${data.name}. ${data.name} joins your side.`, 'treasure', `summon-ok:${data.id}:${Date.now()}`);
            this.updateHUD?.();
            this.save?.();
            return { ok: true, creature, spent: skipMp ? 0 : data.mp };
        };

        Game.commandBeast = function () {
            const p = this.state.player;
            const e = this.state.enemy;
            const cost = 20;
            if (!this.state.inCombat || !e) {
                sfxOnce('miss', 'charm-fail');
                say(this, 'There is no creature to command.', 'system', 'charm-none');
                return { ok: false, reason: 'none' };
            }
            if (livingParty(this).length >= PARTY_CAP) {
                sfxOnce('miss', 'charm-fail');
                say(this, 'Your party is already at its maximum combat capacity.', 'system', 'charm-full');
                return { ok: false, reason: 'full' };
            }
            if (p.mp < cost) {
                sfxOnce('miss', 'charm-fail');
                say(this, `You don't have enough magic to command that creature. You need ${cost} magic points, but you have ${p.mp}.`, 'system', 'charm-mp');
                return { ok: false, reason: 'mp', need: cost, have: p.mp };
            }
            p.mp -= cost;
            if (e.boss || e.finalBoss) {
                sfxOnce('miss', 'charm-fail');
                say(this, 'The enchantment failed.', 'combat', 'charm-boss');
                this.enemyAttack?.();
                return { ok: false, reason: 'boss', spent: cost };
            }
            const resist = 0.35 + Math.max(0, (e.level || 1) - (p.level || 1)) * 0.08;
            if (Math.random() < resist) {
                sfxOnce('miss', 'charm-fail');
                say(this, 'The enchantment failed.', 'combat', 'charm-resist');
                this.updateHUD?.();
                this.enemyAttack?.();
                return { ok: false, reason: 'resist', spent: cost };
            }
            const converted = {
                name: e.name,
                role: 'converted',
                maxHp: e.maxHp,
                hp: Math.max(1, e.hp),
                attack: e.attack,
                defense: e.defense || 0,
                heal: 0,
                team: 'player',
                converted: true,
                temporary: true,
                originalTeam: 'enemy',
                charmTurns: 2,
                desc: e.desc
            };
            this.state.companions.push(converted);
            this.state.combatGroup.push(converted.name);
            this.state.convertedFoe = converted.name;
            if (this.state.encounterTargets) {
                const t = this.state.encounterTargets.find(x => x.active && x.name === e.name);
                if (t) { t.defeated = true; t.converted = true; t.active = false; }
            }
            sfxOnce('command', 'charm-ok');
            say(this, `You have enchanted the ${e.name}. The ${e.name} has joined your side.`, 'magic', `charm-ok:${e.name}`);
            const queue = this.state.sacred?.enemyQueue || [];
            if (queue.length) {
                const next = queue.shift();
                this.state.sacred.enemyQueue = queue;
                this.startCombat(next, true);
            } else {
                this.state.inCombat = false;
                this.state.enemy = null;
                this.dismissTemporarySummons();
                this.finishCommandCombat?.();
            }
            this.updateHUD?.();
            this.save?.();
            return { ok: true, converted, spent: cost };
        };

        Game.releaseEnchantment = function (companion) {
            if (!companion?.converted) return;
            say(this, `The enchantment has ended. The ${companion.name} returns to its original allegiance.`, 'combat', `charm-end:${companion.name}`);
            this.state.companions = this.state.companions.filter(c => c !== companion);
            this.state.combatGroup = this.state.companions.map(c => c.name);
            if (this.state.inCombat && this.state.sacred) {
                this.state.sacred.enemyQueue = this.state.sacred.enemyQueue || [];
                this.state.sacred.enemyQueue.push(companion.name);
            }
        };

        const oldCast = Game.castSpell.bind(Game);
        Game.castSpell = function (name) {
            const key = String(name || '').toLowerCase().trim();
            const summonMatch = key.match(/^(?:summon|call)\s+(.+)$/) || (key === 'call familiar' ? ['', 'spider'] : null) || (key === 'shade mage' ? ['', 'shade mage'] : null);
            if (summonMatch) return this.summonCreature(summonMatch[1] || 'spider');
            if (key === 'command beast' || key === 'enchant beast') return this.commandBeast();
            return oldCast.call(this, name);
        };

        const oldUse = Game.useItem.bind(Game);
        Game.useItem = function (itemName) {
            const q = String(itemName || '').toLowerCase();
            const item = (this.state.inventory || []).find(i => (i.id || '').toLowerCase() === q || (i.name || '').toLowerCase().includes(q));
            if (item && (item.type === 'ring' || RINGS[item.id])) {
                const spec = RINGS[item.id] || item;
                const p = this.state.player;
                const need = spec.mp || 0;
                if (!this.state.inCombat) {
                    sfxOnce('miss', 'ring-fail');
                    say(this, 'The ring only works during battle.', 'system', 'ring-ncombat');
                    return false;
                }
                if (need && p.mp < need) {
                    sfxOnce('miss', 'ring-fail');
                    say(this, `The ring cannot summon the creature. You need ${need} magic points.`, 'system', 'ring-mp');
                    return false;
                }
                if (spec.effect === 'command') return this.commandBeast();
                if (spec.effect === 'bind') { this.castSpell('binding circle'); return true; }
                if (spec.summons) {
                    sfxOnce('pickup', 'ring-glow');
                    return this.summonCreature(spec.summons, { source: 'ring' });
                }
            }
            return oldUse.call(this, itemName);
        };

        const oldEnemy = Game.enemyAttack.bind(Game);
        Game.enemyAttack = function () {
            const converted = (this.state.companions || []).find(c => c.converted && c.hp > 0);
            const e = this.state.enemy;
            if (e && converted && Math.random() < 0.45) {
                const dmg = Math.max(1, e.attack + Math.floor(Math.random() * 4) - Math.floor((converted.defense || 0) / 2));
                converted.hp = Math.max(0, converted.hp - dmg);
                say(this, `The ${e.name} hits the ${converted.name} for ${dmg} damage.`, 'combat', `hit-convert:${Date.now()}`);
                window.MusicSystem?.playSFX('enemy-hit');
                if (converted.hp <= 0) {
                    say(this, `The ${converted.name} has been defeated.`, 'combat', `dead-convert:${converted.name}`);
                    this.state.companions = this.state.companions.filter(c => c !== converted);
                    this.state.combatGroup = this.state.companions.map(c => c.name);
                }
                this.updateHUD?.();
                return;
            }
            const result = oldEnemy.call(this);
            (this.state.companions || []).filter(c => c.converted).forEach(c => {
                c.charmTurns = (c.charmTurns || 1) - 1;
                if (c.charmTurns <= 0) this.releaseEnchantment(c);
            });
            return result;
        };

        const oldComp = Game.companionTurn.bind(Game);
        Game.companionTurn = function () {
            const healers = (this.state.companions || []).filter(c => c.hp > 0 && c.heal > 0 && c.team === 'player');
            for (const healer of healers) {
                const injured = [this.state.player, ...(this.state.companions || [])]
                    .filter(a => a && a.hp > 0 && a.hp < (a.maxHp || a.hp) && a.team !== 'enemy');
                const patient = injured.sort((a, b) => (a.hp / (a.maxHp || 1)) - (b.hp / (b.maxHp || 1)))[0];
                if (patient && Math.random() < 0.55) {
                    const amount = Math.min(healer.heal, (patient.maxHp || patient.hp) - patient.hp);
                    if (amount > 0) {
                        patient.hp += amount;
                        say(this, `${healer.name} heals ${patient.name || 'you'} for ${amount} HP.`, 'magic', `summon-heal:${healer.name}:${Date.now()}`);
                        window.MusicSystem?.playSFX('heal');
                    }
                }
            }
            return oldComp.call(this);
        };

        const oldFinish = Game.finishCommandCombat?.bind(Game);
        if (oldFinish) {
            Game.finishCommandCombat = function () {
                this.dismissTemporarySummons();
                return oldFinish();
            };
        }
        const oldDefeated = Game.enemyDefeated.bind(Game);
        Game.enemyDefeated = function () {
            const r = oldDefeated.call(this);
            const settle = () => {
                if (!this.state.inCombat) this.dismissTemporarySummons();
            };
            if (r && typeof r.then === 'function') r.then(settle);
            else settle();
            return r;
        };

        if (window.MusicSystem?.sfx) {
            const s = window.MusicSystem.sfx;
            s.ring = s.ring || ['assets/audio/sfx/pickup.wav', 'assets/audio/sfx/coin.wav'];
        }

        window.SummonSystemV727 = { BESTIARY, RINGS, PARTY_CAP };
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let n = 0;
        const t = setInterval(() => { if (apply() || ++n > 40) clearInterval(t); }, 80);
    }
})();
