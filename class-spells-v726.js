/**
 * Class helper spells (v7.25.6): every class starts with Healing + Multi Strike.
 * Two helpers from the Guild Card Test, one after the Palace hunt, one after
 * the Stormcrown Island quest. Unique SFX for learn / use / fail / success.
 * Summoner helpers call and command creatures. Shark Tide is the island spell.
 */
(() => {
    const CLASS_HELPERS = {
        warrior: ['Double Strike', 'Trial Spell', 'Battle Cry', 'Iron Guard'],
        mage: ['Abra Catabra', 'Survey Guardia', 'Fireball', 'Ice Storm'],
        rogue: ['Shadow Dance', 'Venom Arc', 'Backstab', 'Smoke Bomb'],
        cleric: ['Radiant Choir', 'Sanctuary', 'Holy Light', 'Blessing'],
        paladin: ['Judgment Hammer', 'Sacred Guard', 'Hammer Smite', 'Holy Light'],
        ranger: ['Piercing Volley', 'Nature Mend', 'Twin Shot', 'Hunter’s Remedy'],
        monk: ['Chi Burst', 'Inner Sanctuary', 'Power Strike', 'Mass Heal'],
        druid: ['Thorn Storm', 'Moonwell', 'Nature Mend', 'Lightning Bolt'],
        summoner: ['Call Familiar', 'Command Beast', 'Shade Mage', 'Binding Circle'],
        hunter: ['Twin Shot', 'Hunter’s Remedy', 'Spirit Wolf', 'Piercing Volley'],
        adventurer: ['Adventurer’s Focus', 'Second Wind', 'Power Strike', 'Battle Cry']
    };
    const SHARED = ['Minor Heal', 'Multi Strike'];
    const ISLAND_SPELL = 'Shark Tide';
    const SUMMONS = [
        { name: 'Moon Spider', attack: 14, maxHp: 40, heal: 0 },
        { name: 'Guild Goblin', attack: 16, maxHp: 48, heal: 0 },
        { name: 'Spirit Wolf', attack: 18, maxHp: 52, heal: 4 },
        { name: 'Shade Mage', attack: 12, maxHp: 36, heal: 10 },
        { name: 'Black Sword Wraith', attack: 28, maxHp: 70, heal: 0 }
    ];

    const SFX = {
        'multi strike': { use: 'multi-strike', success: 'chip', fail: 'miss', learn: 'card-draw' },
        'minor heal': { use: 'heal', success: 'heal-chain', fail: 'miss', learn: 'blessing' },
        'heal': { use: 'heal', success: 'heal-chain', fail: 'miss', learn: 'blessing' },
        'mass heal': { use: 'heal-chain', success: 'blessing', fail: 'miss', learn: 'heal' },
        'shark tide': { use: 'shark', success: 'shark-hit', fail: 'miss', learn: 'haunted-wind' },
        'call familiar': { use: 'summon', success: 'goblin-cackle', fail: 'miss', learn: 'ghost-moan' },
        'command beast': { use: 'command', success: 'monster-roar', fail: 'board-error', learn: 'ghost-scream' },
        'shade mage': { use: 'spell-arcane', success: 'magic', fail: 'miss', learn: 'spell-cast' },
        'binding circle': { use: 'door', success: 'check', fail: 'miss', learn: 'card-flip' },
        'double strike': { use: 'attack-fast', success: 'hit-metal-1', fail: 'miss', learn: 'card-draw' },
        'emerald lifestrike': { use: 'attack-heavy', success: 'heal', fail: 'miss', learn: 'levelup' },
        alohomora: { use: 'door', success: 'door', fail: 'board-error', learn: 'pickup' }
    };

    function cue(spell, phase) {
        const key = String(spell || '').toLowerCase();
        const map = SFX[key] || {};
        const type = map[phase] || (phase === 'fail' ? 'miss' : phase === 'learn' ? 'card-draw' : phase === 'success' ? 'spell-arcane' : 'spell-cast');
        window.MusicSystem?.playSFX(type);
    }

    function helpersFor(cls) {
        return CLASS_HELPERS[cls] || CLASS_HELPERS.adventurer;
    }

    function grant(game, names, reason) {
        const p = game.state.player;
        if (!p) return [];
        p.spells ||= [];
        const added = [];
        names.forEach(sp => {
            if (!p.spells.includes(sp)) {
                p.spells.push(sp);
                added.push(sp);
                cue(sp, 'learn');
            }
        });
        if (added.length) game.addNarrative(`${reason} Learned: ${added.join(', ')}.`, 'treasure');
        return added;
    }

    function ensureIslandQuest(game) {
        const id = 'island_storm_hunt';
        if (game.state.completedQuests.includes(id) || game.state.quests.some(q => q.id === id)) return;
        game.state.quests.push({
            id,
            name: 'Stormcrown Island Hunt',
            description: 'Defeat three island or storm creatures on Stormcrown Island to earn a new spell.',
            objectives: [{ type: 'kill', target: 'any', count: 3, current: 0, islandOnly: true }],
            reward: { xp: 220, gold: 160 }
        });
        game.addNarrative('A storm priest marks a hunt on Stormcrown Island. Finish it to learn a new spell.', 'npc');
    }

    if (window.MusicSystem?.sfx) {
        const s = window.MusicSystem.sfx;
        s['multi-strike'] = ['assets/audio/sfx/attack-fast.wav', 'assets/audio/sfx/carrom-strike.wav'];
        s.shark = ['assets/audio/sfx/haunted-wind.wav', 'assets/audio/sfx/monster-roar.wav'];
        s['shark-hit'] = ['assets/audio/sfx/hit-metal-2.wav', 'assets/audio/sfx/body-fall.wav'];
        s.summon = ['assets/audio/sfx/ghost-moan.wav', 'assets/audio/sfx/spell-cast.wav'];
        s.command = ['assets/audio/sfx/monster-roar.wav', 'assets/audio/sfx/goblin-cackle.wav'];
    }

    const oldGet = Game.getClassSpells.bind(Game);
    Game.getClassSpells = function (cls, extra = 0) {
        const list = [...SHARED, 'Alohomora'];
        if (extra) list.push('Emerald Lifestrike');
        return list;
    };

    const oldCreate = Game.createCharacter.bind(Game);
    Game.createCharacter = function (isMulti) {
        oldCreate(isMulti);
        const p = this.state.player;
        if (p) p.spells = this.getClassSpells(p.class, p.extraSpells || 0);
        this.addNarrative('Every class begins with Healing and Multi Strike. Pass the Guild Card Test for two class helpers. Finish the Palace hunt and the Island hunt for the rest.', 'system');
    };

    Game.learnGuildSpells = function () {
        const s = this.state.sacred || (this.state.sacred = {});
        const p = this.state.player;
        if (this.state.location !== 'kaliwasch') { this.addNarrative('Return to the Kaliwasch Guild Hall.', 'system'); return; }
        if (!this.state.completedQuests.includes('tutorial')) { this.addNarrative('Finish the tutorial before guild spell training.', 'system'); return; }
        if (!s.cardTestPassed) { this.addNarrative('Pass the Guild Card Test first. Type "card test".', 'system'); return; }
        if (s.guildTraining) { this.addNarrative('Your two guild class helpers are already learned.', 'system'); return; }
        const helpers = helpersFor(p.class).slice(0, 2);
        grant(this, helpers, 'Guild cards unlock two class helpers.');
        s.guildTraining = true;
        this.save();
    };

    const oldPalace = Game.palaceQuest.bind(Game);
    Game.palaceQuest = function () {
        oldPalace.call(this);
        const s = this.state.sacred || (this.state.sacred = {});
        if (!s.palaceSpellHint) {
            s.palaceSpellHint = true;
            this.addNarrative('When the Royal Forest Hunt is complete, return here. The court will grant one more class helper.', 'npc');
        }
    };

    const oldComplete = Game.completeQuest.bind(Game);
    Game.completeQuest = function (quest) {
        oldComplete.call(this, quest);
        const id = quest?.id;
        const cls = this.state.player?.class;
        const helpers = helpersFor(cls);
        if (id === 'royal_hunt') grant(this, [helpers[2]], 'The Palace court awards a class helper.');
        if (id === 'island_storm_hunt') {
            grant(this, [helpers[3], ISLAND_SPELL], 'The island storm answers. A class helper and Shark Tide are yours.');
        }
        this.save();
    };

    const oldCheck = Game.checkQuests.bind(Game);
    Game.checkQuests = function (type, target) {
        if (type === 'kill' && /island|storm/i.test(this.state.location || '')) {
            const q = this.state.quests.find(x => x.id === 'island_storm_hunt');
            if (q && !this.state.completedQuests.includes('island_storm_hunt')) {
                q.objectives.forEach(obj => {
                    if (obj.type === 'kill' && obj.islandOnly) obj.current = (obj.current || 0) + 1;
                });
                const ready = q.objectives.every(obj => (obj.current || 0) >= obj.count);
                if (ready) {
                    this.state.completedQuests.push('island_storm_hunt');
                    this.state.quests = this.state.quests.filter(x => x.id !== 'island_storm_hunt');
                    this.state.player.xp += q.reward.xp;
                    this.state.player.gold += q.reward.gold;
                    this.addNarrative('Quest complete: Stormcrown Island Hunt!', 'treasure');
                    const helpers = helpersFor(this.state.player.class);
                    grant(this, [helpers[3], ISLAND_SPELL], 'The island storm answers. A class helper and Shark Tide are yours.');
                    this.save();
                }
            }
        }
        oldCheck.call(this, type, target);
    };

    const oldEnter = Game.enterLocation.bind(Game);
    Game.enterLocation = function (id) {
        oldEnter.call(this, id);
        if (String(id || '').includes('storm_island')) ensureIslandQuest(this);
    };

    const oldCast = Game.castSpell.bind(Game);
    Game.castSpell = function (name) {
        const query = String(name || '').toLowerCase();
        const spell = this.state.player?.spells?.find(s => s.toLowerCase().includes(query));
        if (!spell) {
            cue(name, 'fail');
            return oldCast.call(this, name);
        }
        const key = spell.toLowerCase();
        const p = this.state.player;
        const e = this.state.enemy;

        if (key === 'shark tide') {
            if (!this.state.inCombat) { cue(key, 'fail'); this.addNarrative('Shark Tide needs open battle and water-charged air.', 'system'); return; }
            if (p.mp < 26) { cue(key, 'fail'); this.addNarrative('Shark Tide needs 26 MP.', 'system'); return; }
            p.mp -= 26;
            cue(key, 'use');
            const dmg = 38 + p.level * 3 + Math.floor(p.int / 2);
            if (e) e.hp -= dmg;
            this.addNarrative(`A phantom shark leaps from storm-water and bites ${e?.name || 'the foe'} for ${dmg} damage!`, 'combat');
            cue(key, 'success');
            this.updateHUD();
            if (e && e.hp <= 0) this.enemyDefeated();
            else this.enemyAttack();
            return;
        }

        if (key === 'call familiar' || key === 'shade mage') {
            if (!this.state.inCombat) { cue(key, 'fail'); this.addNarrative('Call creatures during battle.', 'system'); return; }
            if (p.mp < 24) { cue(key, 'fail'); this.addNarrative('Not enough mana to call a creature.', 'system'); return; }
            if (this.state.companions.length >= 3) { cue(key, 'fail'); this.addNarrative('Your combat group is full. Dismiss someone first.', 'system'); return; }
            p.mp -= 24;
            cue(key, 'use');
            const pick = key === 'shade mage' ? SUMMONS[3] : SUMMONS[Math.floor(Math.random() * (SUMMONS.length - 1))];
            const summoned = { ...pick, hp: pick.maxHp, summoned: true, level: Math.max(1, p.level) };
            this.state.companions.push(summoned);
            this.state.combatGroup.push(summoned.name);
            this.addNarrative(`${summoned.name} answers the call and joins the fight! The legend of this battle shifts.`, 'treasure');
            cue(key, 'success');
            this.updateHUD();
            this.save();
            return;
        }

        if (key === 'command beast') {
            if (!this.state.inCombat || !e) { cue(key, 'fail'); this.addNarrative('There is no creature to command.', 'system'); return; }
            if (p.mp < 20) { cue(key, 'fail'); this.addNarrative('Command Beast needs 20 MP.', 'system'); return; }
            p.mp -= 20;
            cue(key, 'use');
            if (Math.random() < 0.55 + p.int / 80) {
                e.charmedTurns = 2;
                this.addNarrative(`You seize ${e.name}'s will. It will strike its own side for two turns.`, 'magic');
                cue(key, 'success');
            } else {
                this.addNarrative(`${e.name} resists the binding.`, 'combat');
                cue(key, 'fail');
            }
            this.updateHUD();
            this.enemyAttack();
            return;
        }

        if (key === 'binding circle') {
            if (!this.state.inCombat || !e) { cue(key, 'fail'); this.addNarrative('Bind a foe in combat.', 'system'); return; }
            if (p.mp < 18) { cue(key, 'fail'); this.addNarrative('Binding Circle needs 18 MP.', 'system'); return; }
            p.mp -= 18;
            cue(key, 'use');
            e.braceTurns = 0;
            e.attack = Math.max(4, Math.floor(e.attack * 0.75));
            this.addNarrative(`${e.name} is ringed in runes. Its attack falls.`, 'magic');
            cue(key, 'success');
            this.updateHUD();
            this.enemyAttack();
            return;
        }

        if (key === 'multi strike') {
            if (!this.state.inCombat) { cue(key, 'fail'); return oldCast.call(this, name); }
            if (p.mp < 24) { cue(key, 'fail'); this.addNarrative('Not enough mana!', 'system'); return; }
            cue(key, 'use');
            const result = oldCast.call(this, name);
            cue(key, 'success');
            return result;
        }

        if (/heal|mend|choir|sanctuary|moonwell|second wind|blessing/i.test(key)) {
            if (p.mp < 8) { cue(key, 'fail'); }
            else cue(key, 'use');
            const result = oldCast.call(this, name);
            if (this.state.player.mp < p.mp) cue(key, 'success');
            return result;
        }

        cue(key, 'use');
        const mpBefore = p.mp;
        const result = oldCast.call(this, name);
        if (this.state.player && this.state.player.mp < mpBefore) cue(key, 'success');
        else if (!this.state.inCombat || this.state.player.mp === mpBefore) { /* fail already spoken */ }
        return result;
    };

    const oldEnemy = Game.enemyAttack.bind(Game);
    Game.enemyAttack = function () {
        const e = this.state.enemy;
        if (e && e.charmedTurns > 0) {
            e.charmedTurns--;
            const dmg = Math.max(4, Math.floor(e.attack / 2));
            e.hp -= dmg;
            this.addNarrative(`${e.name}, still commanded, tears at itself for ${dmg} damage!`, 'combat');
            MusicSystem.playSFX('command');
            this.updateEnemyHUD();
            if (e.hp <= 0) this.enemyDefeated();
            return;
        }
        return oldEnemy.call(this);
    };

    window.ClassSpellsV726 = { CLASS_HELPERS, SHARED, ISLAND_SPELL, cue, helpersFor };
})();
