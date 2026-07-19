// ============================================================
// Black Sword Ultimate v21 — Wayfinder's Guide 🧭
// ============================================================
// Blind-first navigation & progress tools, all fully spoken:
//   hint / objective / what now  → quest guidance with DIRECTIONS
//                                  (breadth-first pathfinding over the
//                                  real world map exits)
//   bestiary                     → every monster you ever slayed, with counts
//   journal                      → one spoken progress briefing
//   repeat                       → repeat your previous command
// ============================================================
(function () {
    const apply = () => {
        if (!window.Game || !window.WorldData) return false;

        // ---- shortest path across the world via exits (BFS) ----
        Game.findPath = function (fromLoc, toLoc) {
            if (fromLoc === toLoc) return [];
            const locs = WorldData.locations || {};
            if (!locs[fromLoc] || !locs[toLoc]) return null;
            const queue = [[fromLoc, []]];
            const seen = new Set([fromLoc]);
            while (queue.length) {
                const [loc, path] = queue.shift();
                if (path.length > 40) break;
                const exits = locs[loc]?.exits || {};
                for (const dir of Object.keys(exits)) {
                    const next = exits[dir];
                    if (seen.has(next)) continue;
                    const newPath = [...path, dir];
                    if (next === toLoc) return newPath;
                    seen.add(next);
                    queue.push([next, newPath]);
                }
            }
            return null;
        };

        const dirText = (path) => {
            if (!path) return 'no known route from here — try the City Directory or map command';
            if (!path.length) return "you're already there!";
            return `go ${path.join(', then ')}`;
        };

        const nearestAreaWith = (predicate) => {
            const locs = WorldData.locations || {};
            let best = null, bestLen = Infinity;
            Object.keys(locs).forEach(id => {
                if (!predicate(locs[id], id)) return;
                const p = Game.findPath(Game.state.location, id);
                if (p && p.length < bestLen) { best = { id, path: p }; bestLen = p.length; }
            });
            return best;
        };

        // ---- HINT: current quest guidance ----
        Game.showQuestHint = function () {
            const s = this.state;
            const quest = (s.quests || [])[0];
            if (!quest) {
                this.addNarrative('🧭 No active quest right now. Explore, hunt in uncleared wild areas (type "foes" to scout), or brave the Arena of Echoes for rewards!', 'system');
                return;
            }
            const lines = [`🧭 Current quest: ${quest.name} — ${quest.description || ''}`];
            (quest.objectives || []).forEach((obj, i) => {
                const cur = obj.current || 0;
                const done = cur >= obj.count;
                let guide = '';
                if (!done) {
                    if (obj.type === 'visit') {
                        const p = this.findPath(s.location, obj.target);
                        guide = `Destination: ${WorldData.locations[obj.target]?.name || obj.target} — ${dirText(p)}.`;
                    } else if (obj.type === 'kill') {
                        const targetName = obj.target === 'any' ? null : obj.target;
                        const area = nearestAreaWith((loc, id) => {
                            const living = this.getLivingEnemies ? this.getLivingEnemies(id) : (loc.enemies || []);
                            return targetName ? living.includes(targetName) : living.length > 0;
                        });
                        if (area) {
                            guide = `${targetName ? `The ${targetName} can be found at ${WorldData.locations[area.id]?.name || area.id}` : `Wild monsters wait at ${WorldData.locations[area.id]?.name || area.id}`} — ${dirText(area.path)}.`;
                        } else {
                            guide = targetName ? `All ${targetName}s you could reach are already defeated — areas may clear permanently.` : 'All reachable wild areas are cleared — try the daily treasure or arena.';
                        }
                    } else if (obj.type === 'collect') {
                        const inv = (s.inventory || []).find(it => it.id === obj.target || it.name.toLowerCase() === obj.target);
                        if (inv) guide = `Already in your bag (${inv.name}).`;
                        else {
                            const area = nearestAreaWith((loc) => (loc.items || []).includes(obj.target));
                            guide = area ? `Look for it at ${WorldData.locations[area.id]?.name || area.id} — ${dirText(area.path)}.` : 'Search the world, shops and loot drops.';
                        }
                    }
                }
                lines.push(`${done ? '✅' : '⏳'} Objective ${i + 1}: ${obj.type} ${obj.target} (${Math.min(cur, obj.count)}/${obj.count})${done ? '' : ` ${guide}`}`);
            });
            this.addNarrative(lines.join('\n'), 'system');
        };

        // ---- BESTIARY: lifetime slain ledger ----
        Game.showBestiary = function () {
            const s = this.state;
            const book = s.slainEnemies || {};
            const totals = {};
            Object.values(book).forEach(areaBook => {
                Object.entries(areaBook).forEach(([name, n]) => { totals[name] = (totals[name] || 0) + n; });
            });
            const entries = Object.entries(totals);
            if (!entries.length) {
                this.addNarrative('📖 Bestiary is empty — no monsters slain yet. Find a wild area and type "attack".', 'system');
                return;
            }
            entries.sort((a, b) => b[1] - a[1]);
            const clearedCount = Object.keys(book).filter(l => this.areaClearedInfo(l)).length;
            this.addNarrative(`📖 Bestiary — ${entries.length} monster types slain, ${s.kills} total kills, ${clearedCount} areas fully cleared:\n` +
                entries.map(([n, c]) => `${n}: ${c}`).join('; '), 'treasure');
        };

        // ---- JOURNAL: spoken progress briefing ----
        Game.showJournal = function () {
            const s = this.state, p = s.player;
            const cleared = Object.keys(s.slainEnemies || {}).filter(l => this.areaClearedInfo(l)).length;
            const achCount = (s.achievements || []).length;
            const arenaWins = s.achievementStats?.arenaWinsTotal || 0;
            const companions = (s.companions || []).map(c => `${c.name} (HP ${c.hp}/${c.maxHp})`).join(', ') || 'none yet';
            const questLine = (s.quests || []).length
                ? `Active quest: ${s.quests[0].name}.` : 'No active quests.';
            this.addNarrative(
                `📓 Journal of ${p.name}: level ${p.level} ${p.race||''} ${p.class||''}. ` +
                `HP ${Math.max(0, p.hp)}/${p.maxHp}, MP ${p.mp}/${p.maxMp}, XP ${Math.floor(p.xp)}. ` +
                `Treasure: ${p.gold} gold, ${p.rubies||0} rubies, ${p.goldRubies||0} gold rubies, ${p.diamonds||0} diamonds. ` +
                `${s.kills} monsters slain, ${cleared} areas fully cleared, ${arenaWins} arena waves won, ` +
                `${achCount} achievements unlocked. ${questLine} ` +
                `Completed quests: ${(s.completedQuests || []).length}. Companions with you: ${companions}. ` +
                `Location: ${WorldData.locations[s.location]?.name || s.location}.`,
                'treasure');
        };

        // ---- command wiring (outermost) + repeat support ----
        const oldCommand = Game.processCommand.bind(Game);
        Game.processCommand = function (cmd) {
            const c = (cmd || '').toLowerCase().trim();
            if (/^(hint|objective|objectives|what now|guide|where now|quest hint)$/.test(c)) { this.showQuestHint(); return; }
            if (/^(bestiary|hunter log|slain list|monsters defeated)$/.test(c)) { this.showBestiary(); return; }
            if (/^(journal|diary|progress report|briefing|story so far)$/.test(c)) { this.showJournal(); return; }
            if (c === 'repeat' || c === 'again') {
                const last = this.state.lastCommand;
                if (last) { this.addNarrative(`↻ Repeating: ${last}`, 'system'); this.processCommand(last); }
                else this.addNarrative('Nothing to repeat yet.', 'system');
                return;
            }
            if (c) this.state.lastCommand = c;
            oldCommand(cmd);
        };
        if (!Game.state.lastCommand) Game.state.lastCommand = null;

        console.log('v21 Wayfinder\'s Guide active');
        return true;
    };

    if (!apply()) {
        document.addEventListener('DOMContentLoaded', apply);
        let tries = 0;
        const timer = setInterval(() => { if (apply() || ++tries > 50) clearInterval(timer); }, 100);
    }
})();
