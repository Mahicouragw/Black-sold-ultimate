// ============================================================
// Black Sword Ultimate v19 — Fair Hunt & Area Clearing
// ============================================================
// Blind-first fairness layer. Monsters are a finite, persistent
// pack per area: kills are recorded per location (saved with the
// hero), cleared areas stay peaceful forever, and a typed "attack"
// outside combat gives a clear spoken answer instead of spawning
// endless monsters:
//   - monsters alive here   -> hunting one starts combat
//   - area fully defeated   -> "You can attack only in combat."
//   - safe place            -> "You are not in combat."
// Arena of Echoes fights never consume a location's pack.
// ============================================================
(function () {
    const apply = () => {
        if (!window.Game || !window.WorldData || typeof Game.enemyDefeated !== 'function') return false;

        const ensureState = () => {
            if (!Game.state.slainEnemies || typeof Game.state.slainEnemies !== 'object') Game.state.slainEnemies = {};
        };
        ensureState();

        // Record every legitimate kill in the area where it happened.
        // This wrapper is outermost, so the enemy is captured BEFORE the
        // inner chain clears combat state.
        const oldDefeated = Game.enemyDefeated.bind(Game);
        Game.enemyDefeated = function () {
            ensureState();
            const locId = this.state.location;
            const name = this.state.enemy && this.state.enemy.name;
            const isArena = !!(this.state.arena && this.state.arena.active);
            oldDefeated();

            if (!name || isArena) return;
            const loc = WorldData.locations[locId];
            if (!loc || !loc.enemies || !loc.enemies.includes(name)) return;

            const book = this.state.slainEnemies[locId] || (this.state.slainEnemies[locId] = {});
            book[name] = (book[name] || 0) + 1;

            const living = this.getLivingEnemies ? this.getLivingEnemies(locId) : [];
            if (living.length === 0) {
                this.addNarrative(`🕊️ ${loc.name || 'This area'} is now fully cleared — every monster defeated for good! From now on, typing "attack" here answers: you can attack only in combat. Travel onward or visit the Arena of Echoes for endless fair battles.`, 'treasure');
                MusicSystem.playSFX('levelup');
            } else {
                const left = Math.max(0, this.getEnemyQuota(locId, name) - book[name]);
                const hint = left > 0 ? `${left} more ${name}${left === 1 ? '' : 's'} still lurk${left === 1 ? 's' : ''}` : `no more ${name}s remain`;
                this.addNarrative(`${hint} here — ${living.length} monster type${living.length === 1 ? '' : 's'} left in this area. Type "foes" for the full list.`, 'system');
            }
            this.save();
        };

        // Loaded heroes get the clearing ledger restored / created.
        const oldContinue = Game.continueGame.bind(Game);
        Game.continueGame = function () {
            ensureState();
            oldContinue();
            ensureState();
        };

        console.log('v19 Fair Hunt & Area Clearing active');
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let tries = 0;
        const timer = setInterval(() => { if (apply() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
