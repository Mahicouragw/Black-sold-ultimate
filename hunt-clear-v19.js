// ============================================================
// Black Sword Ultimate v19 — Fair Hunt & Area Clearing
// ============================================================
// Blind-first finite quest ledger. Kills are recorded per location
// and saved with the hero, while ordinary random wilderness encounters
// remain endless. A typed "attack" outside combat never spawns a foe:
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

        // The authoritative battle settlement calls this once for each defeated
        // monster. This module no longer wraps enemyDefeated or awards rewards.
        Game.recordDefeatedForArea = function (locId,name,isArena=false) {
            ensureState();
            if (!name || isArena) return;
            const loc = WorldData.locations[locId];
            if (!loc?.enemies?.includes(name)) return;
            const book = this.state.slainEnemies[locId] || (this.state.slainEnemies[locId] = {});
            book[name] = (book[name] || 0) + 1;
            const living = this.getLivingEnemies ? this.getLivingEnemies(locId) : [];
            if (living.length === 0) {
                this.addNarrative(`🕊️ ${loc.name || 'This area'} quest pack is complete. Ordinary wilderness encounters can still occur here.`, 'treasure');
                MusicSystem.playSFX('levelup');
            } else {
                const left = Math.max(0, this.getEnemyQuota(locId, name) - book[name]);
                const hint = left > 0 ? `${left} more ${name}${left === 1 ? '' : 's'} needed here` : `${name} objective complete here`;
                this.addNarrative(`${hint}. Type "foes" for finite quest-pack progress.`, 'system');
            }
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
