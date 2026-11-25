/**
 * 7.70.0 — one fairness rule that no combat module can bypass.
 *
 * The game has grown several combat layers (single fight, group encounter,
 * spells, island storms), and each one computes its own damage. A rule written
 * inside one of them is invisible to the others — that is how a level-40 road
 * could hold a creature that empties a full-health hero in one turn.
 *
 * So the promise is made once, at the edge of the whole system:
 *
 *   A single enemy turn never removes more than two fifths of the hero's health
 *   (half, for a boss), and no creature enters a fight able to swing harder
 *   than that.
 *
 * Whatever a module believes it dealt, the hero keeps their feet and gets a
 * turn to answer. The story stays winnable; the damage still costs.
 */
(() => {
    'use strict';
    const G = window.Game;
    if (!G || G._fairnessInstalled) return;
    G._fairnessInstalled = true;

    const boss = enemy => Boolean(enemy?.boss || enemy?.finalBoss);
    const fraction = enemy => (boss(enemy) ? 0.5 : 0.4);
    const swingCap = (player, enemy) => Math.max(1, Math.floor((player?.maxHp || 1) * fraction(enemy)));

    /** No creature starts a fight with a swing that could empty the hero. */
    const startCombat = G.startCombat.bind(G);
    G.startCombat = function (name, queued = false) {
        const answer = startCombat(name, queued);
        const enemy = this.state?.enemy;
        if (enemy && this.state?.player) {
            const cap = swingCap(this.state.player, enemy);
            if (Number(enemy.attack) > cap) enemy.attack = cap;
            enemy.swingCap = cap;
        }
        return answer;
    };

    /** Whatever the layers deal, one turn costs at most the mercy share. */
    const enemyTurn = G.enemyAttack.bind(G);
    G.enemyAttack = function () {
        const player = this.state?.player;
        if (!player || !this.state?.enemy) return enemyTurn();
        const before = player.hp;
        const cap = swingCap(player, this.state.enemy);
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            if (player.hp < before - cap) {
                player.hp = Math.max(1, before - cap);
                this.addNarrative?.('The blow glances off; you keep your feet and your turn.', 'combat');
                this.updateHUD?.();
            }
        };
        let answer;
        try { answer = enemyTurn(); } catch (error) { settle(); throw error; }
        Promise.resolve(answer).then(settle, settle);
        // The combat chain may run several turns ahead; settle once it is quiet.
        if (typeof setTimeout === 'function') setTimeout(settle, 0);
        return answer;
    };

    // Read-only view for tests, the fairness command and the owner panel.
    G.fairnessStatus = function () {
        const p = this.state?.player, e = this.state?.enemy;
        const cap = swingCap(p, e);
        return {
            heroHp: p?.hp, heroMaxHp: p?.maxHp,
            worstSingleBlow: cap,
            share: fraction(e),
            enemy: e?.name || null,
            enemyAttack: e?.attack || 0
        };
    };

    const command = G.processCommand.bind(G);
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase();
        if (text === 'fairness' || text === 'battle fairness' || text === 'fair play') {
            const s = this.fairnessStatus();
            this.addNarrative(`Fair play is on: no single enemy turn can take more than ${s.share === 0.5 ? 'half' : 'two fifths'} of your health, and no creature starts a fight able to swing harder. Worst single blow right now: ${s.worstSingleBlow} of ${s.heroMaxHp} health${s.enemy ? `, against ${s.enemy}` : ''}.`, 'system');
            return;
        }
        return command(raw);
    };

    window.GameFairness = { swingCap, fraction, boss };
})();
