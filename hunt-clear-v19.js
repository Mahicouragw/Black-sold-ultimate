// ============================================================
// Black Sword Ultimate v19 — Fair Hunt & Area Clearing
// ============================================================
// Blind-first kill ledger used for quests and achievements only.
// Random wilderness encounters are UNLIMITED: an area's monster pool lists
// the monster TYPES that can appear, never a remaining-kill quota. No text
// about leftover or outstanding monsters is produced anywhere.
// A typed "attack" outside combat never spawns a foe.
// Arena of Echoes fights never touch the ledger.
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
        // The ledger records quest-relevant kills only. Random wilderness
        // encounters are UNLIMITED: nothing is decremented, and no remaining
        // monster count is ever narrated (v7.22.1).
        Game.recordDefeatedForArea = function (locId,name,isArena=false) {
            ensureState();
            if (!name || isArena) return;
            const loc = WorldData.locations[locId];
            if (!loc?.enemies?.includes(name)) return;
            const book = this.state.slainEnemies[locId] || (this.state.slainEnemies[locId] = {});
            book[name] = (book[name] || 0) + 1;
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
