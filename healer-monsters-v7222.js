/**
 * v7.22.2 — Healer monster role.
 *
 * §5 of the master prompt: a healer monster must be able to heal the weakest
 * SURVIVING ALLY (not just itself), spend MP, fail when MP is short, and never
 * heal a defeated monster.
 *
 * This wraps the existing group-turn logic instead of replacing it, so the
 * fairness budget, accuracy model and all current monster behaviour are kept.
 */
(() => {
    'use strict';

    const HEAL_SPELL_NAMES = /heal|mend|restor|renew|bless|soothe/i;

    /** A monster is a healer if its data declares a healing spell. */
    const healerSpell = data => (data?.spells || [])
        .find(spell => spell.type === 'heal' || HEAL_SPELL_NAMES.test(spell.name || ''));

    const apply = () => {
        if (!window.Game || !window.WorldData || typeof Game.aliveEncounterTargets !== 'function') return false;
        if (Game._healerMonstersActive) return true;
        Game._healerMonstersActive = true;

        /**
         * Current effective HP of an encounter target. The group system tracks
         * pending damage on non-active members and real HP on the active enemy.
         */
        Game.monsterEffectiveHp = function (target) {
            if (!target) return 0;
            if (target.active && this.state.enemy) return Math.max(0, this.state.enemy.hp);
            const max = target.maxHp ?? WorldData.enemies[target.name]?.hp ?? 0;
            if (typeof target.hp === 'number') return Math.max(0, target.hp);
            return Math.max(0, max - (target.damage || 0));
        };

        Game.monsterMaxHp = function (target) {
            if (!target) return 0;
            if (target.active && this.state.enemy) return this.state.enemy.maxHp || 0;
            return target.maxHp ?? WorldData.enemies[target.name]?.hp ?? 0;
        };

        /**
         * Let one healer act. Returns true if a heal was attempted, so the
         * caller can skip that monster's normal attack for this turn (a monster
         * never acts twice in one turn).
         */
        Game.resolveHealerMonsterTurn = function () {
            if (!this.state.inCombat) return false;
            const living = this.aliveEncounterTargets().filter(t => !t.defeated && this.monsterEffectiveHp(t) > 0);
            if (living.length < 1) return false;

            for (const healer of living) {
                const data = WorldData.enemies[healer.name] || {};
                const spell = healerSpell(data);
                if (!spell) continue;

                // Heal the weakest wounded ally, including itself if it is worst off.
                const wounded = living
                    .filter(t => this.monsterEffectiveHp(t) < this.monsterMaxHp(t))
                    .sort((a, b) => (this.monsterEffectiveHp(a) / (this.monsterMaxHp(a) || 1))
                                  - (this.monsterEffectiveHp(b) / (this.monsterMaxHp(b) || 1)));
                const patient = wounded[0];
                if (!patient) continue;                       // nobody needs healing

                // MP economy: healers must be able to run dry.
                healer.mp = healer.mp ?? data.mp ?? 30;
                const cost = Math.max(1, spell.cost || 10);
                if (healer.mp < cost) {
                    this.emitGameEvent?.(`The ${healer.name}'s healing spell failed.`, 'combat')
                        || this.addNarrative(`The ${healer.name}'s healing spell failed.`, 'combat');
                    return true;
                }
                healer.mp -= cost;

                // Fair failure chance keeps healers from being oppressive.
                if (Math.random() < 0.15) {
                    window.MusicSystem?.playSFX?.('magic');
                    this.emitGameEvent?.(`The ${healer.name}'s healing spell failed.`, 'combat')
                        || this.addNarrative(`The ${healer.name}'s healing spell failed.`, 'combat');
                    return true;
                }

                const max = this.monsterMaxHp(patient);
                const current = this.monsterEffectiveHp(patient);
                const amount = Math.max(1, Math.min(spell.power || 30, max - current));

                if (patient.active && this.state.enemy) {
                    this.state.enemy.hp = Math.min(max, this.state.enemy.hp + amount);
                    patient.hp = this.state.enemy.hp;
                } else {
                    patient.damage = Math.max(0, (patient.damage || 0) - amount);
                    patient.hp = Math.min(max, current + amount);
                }

                window.MusicSystem?.playSFX?.('heal');
                const who = patient === healer ? 'itself' : `the ${patient.name}`;
                const text = `The ${healer.name} raises its staff. Green light surrounds ${who}. `
                    + `${patient === healer ? `The ${healer.name}` : `The ${patient.name}`} recovers ${amount} health.`;
                this.emitGameEvent?.(text, 'combat') || this.addNarrative(text, 'combat');
                this.updateEnemyHUD?.();
                this.updateEnemyGroupHUD?.();
                return true;
            }
            return false;
        };

        // Give healers their turn first, then run the normal monster turn.
        const previousGroupTurn = Game.enemyGroupTurn.bind(Game);
        Game.enemyGroupTurn = function () {
            if (!this.state.inCombat || !this.state.enemy) return;
            this.resolveHealerMonsterTurn();
            if (!this.state.inCombat || this.state.player.hp <= 0) return;
            return previousGroupTurn();
        };

        console.log('v7.22.2 healer monsters active');
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let tries = 0;
        const timer = setInterval(() => { if (apply() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
