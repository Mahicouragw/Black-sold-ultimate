// ============================================================
// Black Sword Ultimate v20 — Achievements & Badges 🏆
// ============================================================
// Blind-first milestone system. Every unlock is announced aloud
// via the narrative log and pays gold. Progress persists
// with the hero. Type "achievements" (or "badges") anytime.
// ============================================================
(function () {
    const apply = () => {
        if (!window.Game || !window.WorldData || !Game.enemyDefeated) return false;

        const ensureState = () => {
            if (!Array.isArray(Game.state.achievements)) Game.state.achievements = [];
            if (!Game.state.achievementStats || typeof Game.state.achievementStats !== 'object') Game.state.achievementStats = { arenaWinsTotal: 0 };
        };
        ensureState();

        const clearedAreas = (s) => {
            const book = s.slainEnemies || {};
            return Object.keys(book).filter(loc =>
                typeof Game.areaClearedInfo === 'function' ? Game.areaClearedInfo(loc) : false
            ).length;
        };

        const ACHIEVEMENTS = [
            { id: 'first-blood',  name: 'First Blood',     desc: 'Defeat your first monster.',                       when: s => (s.kills || 0) >= 1 },
            { id: 'hunter',       name: 'Hunter',          desc: 'Defeat 25 monsters.',                              when: s => (s.kills || 0) >= 25 },
            { id: 'slayer',       name: 'Slayer',          desc: 'Defeat 100 monsters.',                             when: s => (s.kills || 0) >= 100 },
            { id: 'peace-1',      name: 'Peacebringer',    desc: 'Fully clear 1 area of monsters.',                  when: s => clearedAreas(s) >= 1 },
            { id: 'peace-5',      name: 'Area Guardian',   desc: 'Fully clear 5 areas.',                             when: s => clearedAreas(s) >= 5 },
            { id: 'peace-10',     name: 'World Cleanser',  desc: 'Fully clear 10 areas.',                            when: s => clearedAreas(s) >= 10 },
            { id: 'level-5',      name: 'Rising Hero',     desc: 'Reach level 5.',                                   when: s => (s.player?.level || 1) >= 5 },
            { id: 'level-10',     name: 'Veteran Hero',    desc: 'Reach level 10.',                                  when: s => (s.player?.level || 1) >= 10 },
            { id: 'quest-3',      name: 'Quest Seeker',    desc: 'Complete 3 quests.',                               when: s => (s.completedQuests || []).length >= 3 },
            { id: 'quest-all',    name: 'Story Master',    desc: 'Complete every quest.',                            when: s => (s.completedQuests || []).length >= (WorldData.quests || []).length },
            { id: 'hoard',        name: 'Dragon Hoard',    desc: 'Hold 1000 gold coins at once.',                    when: s => (s.player?.gold || 0) >= 1000 },
            { id: 'gem',          name: 'Gem Collector',   desc: 'Own at least one diamond.',                        when: s => (s.player?.diamonds || 0) >= 1 },
            { id: 'arena-1',      name: 'Arena Challenger',desc: 'Win 1 wave in the Arena of Echoes.',               when: s => (s.achievementStats?.arenaWinsTotal || 0) >= 1 },
            { id: 'arena-5',      name: 'Arena Legend',    desc: 'Win 5 waves in the Arena of Echoes.',              when: s => (s.achievementStats?.arenaWinsTotal || 0) >= 5 },
            { id: 'explorer-20',  name: 'Pathfinder',      desc: 'Visit 20 different places.',                       when: s => (s.visited || []).length >= 20 },
        ];

        function unlock(a) {
            Game.state.achievements.push(a.id);
            if (Game.state.player) Game.state.player.gold = (Game.state.player.gold || 0) + 150;
            Game.addNarrative(`🏆 Achievement unlocked: ${a.name} — ${a.desc} (+150 🪙 gold)`, 'treasure');
            MusicSystem.playSFX('levelup');
            Game.save();
        }

        function evaluate() {
            ensureState();
            const s = Game.state;
            if (!s.player) return;
            ACHIEVEMENTS.forEach(a => {
                if (s.achievements.includes(a.id)) return;
                try { if (a.when(s)) unlock(a); } catch (e) { /* condition not ready yet */ }
            });
        }

        // Snappy evaluation right after battles (kills, clears, hoard, quests,
        // gems, level-ups all flow through enemyDefeated or its aftermath).
        const oldDefeated = Game.enemyDefeated.bind(Game);
        Game.enemyDefeated = function () {
            ensureState();
            if (this.state.arena?.active && this.state.enemy?.name === 'arena foe') {
                this.state.achievementStats.arenaWinsTotal++;
            }
            oldDefeated();
            setTimeout(evaluate, 60);
        };

        // Movement covers explorer/progress checks.
        const oldEnter = Game.enterLocation.bind(Game);
        Game.enterLocation = function (id) { oldEnter(id); evaluate(); };

        // Periodic sweep as a safety net (gold from shops, quests, etc.).
        setInterval(evaluate, 15000);

        // `achievements` command — spoken-friendly list.
        Game.showAchievements = function () {
            ensureState();
            const s = this.state;
            const rows = ACHIEVEMENTS.map(a => {
                const got = s.achievements.includes(a.id);
                return `${got ? '✅' : '🔒'} ${a.name} — ${a.desc}`;
            });
            this.addNarrative(`🏆 Achievements: ${s.achievements.length} of ${ACHIEVEMENTS.length} unlocked.\n${rows.join('\n')}`, 'treasure');
        };

        const oldCommand = Game.processCommand.bind(Game);
        Game.processCommand = function (cmd) {
            const c = (cmd || '').toLowerCase().trim();
            if (/^(achievements|achievement|badges|trophies|medals)$/.test(c)) { this.showAchievements(); return; }
            oldCommand(cmd);
        };

        // Persist with the hero save / restore on continue.
        const oldSave = Game.getSaveData.bind(Game);
        Game.getSaveData = function () {
            const d = oldSave();
            d.achievements = this.state.achievements || [];
            d.achievementStats = this.state.achievementStats || { arenaWinsTotal: 0 };
            return d;
        };
        const oldContinue = Game.continueGame.bind(Game);
        Game.continueGame = function () {
            oldContinue();
            try {
                const saved = JSON.parse(localStorage.getItem(this.state.saveKey) || '{}');
                this.state.achievements = saved.achievements || [];
                this.state.achievementStats = saved.achievementStats || { arenaWinsTotal: 0 };
            } catch (e) { /* fresh ledger */ }
        };

        evaluate();
        console.log('v20 Achievements active —', ACHIEVEMENTS.length, 'badges');
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let tries = 0;
        const timer = setInterval(() => { if (apply() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
