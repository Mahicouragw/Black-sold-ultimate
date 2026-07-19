/**
 * v18 — Companion Economy, Revival & Arena of Echoes
 * ───────────────────────────────────────────────────────────────────────────
 * GAME DESIGN NOTES (built TalkBack-first for blind players):
 * Everything is text/voice driven; every reward, cost and wave is announced
 * through addNarrative + a matching SFX so screen-reader and audio players
 * never miss feedback. No permaloss: heroes are rescued (arena safety net)
 * and companions are never gone forever — they can always be revived.
 *
 * Currencies (fair economy — earnable in-game, no pay-to-win):
 *   🪙 gold coins   — common, from every battle; buys basic revives & arena rest
 *   🔴 rubies       — uncommon battle drops (18% + guaranteed pity after 5 dry
 *                     kills); revive one companion to 60%
 *   🟡 gold rubies  — rare drops from strong enemies & arena milestones;
 *                     revive one companion to FULL health
 *   💎 diamonds     — epic drops from bosses/arena; revive ALL companions fully
 *
 * Arena of Echoes — endless scaling battle mode with hard caps for fairness,
 * announced wave-by-wave, player-paced (never auto-chained), exit anytime
 * with all rewards kept, and a healer rescue on defeat instead of death.
 * ───────────────────────────────────────────────────────────────────────────
 */
(function () {
    const G = () => window.Game;
    if (!G()) return;

    /* ════════════════ 0. STATE GUARANTEES ════════════════ */
    function ensure() {
        const g = G(), p = g.state?.player;
        if (!p) return null;
        p.rubies ??= 0;
        p.goldRubies ??= 0;
        p.diamonds ??= 0;
        g.state.economy = Object.assign({
            battlesSinceRuby: 0,
            lastDaily: '',
            dailyStreak: 0,
        }, g.state.economy || {});
        return p;
    }

    // Legacy/loaded heroes get wallets too (same hook pattern as v16/v17).
    const oldContinue = G().continueGame?.bind(G());
    if (oldContinue) {
        G().continueGame = function () {
            oldContinue();
            ensure();
        };
    }

    /* ════════════════ 1. WALLET (accessible read-out) ════════════════ */
    G().currencySummary = function () {
        const p = ensure();
        if (!p) return '';
        return `🪙 ${p.gold} gold coins • 🔴 ${p.rubies} rubies • 🟡 ${p.goldRubies} gold rubies • 💎 ${p.diamonds} diamonds`;
    };

    G().showWallet = function () {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        this.addNarrative(`Your purse: ${this.currencySummary()}.`, 'treasure');
        this.addNarrative('💡 Rubies revive fallen companions (say "revive"). Diamonds are the rarest — they revive everyone. Earn more in battles and in the Arena.', 'system');
    };

    /* ════════════════ 2. FAIR BATTLE REWARDS (drop hooks) ════════════════ */
    const oldEnemyDefeated = G().enemyDefeated.bind(G());
    G().enemyDefeated = function () {
        const e = this.state.enemy;
        const wasArena = !!this.state.arena?.active;
        oldEnemyDefeated();
        const g = this; // keep context across both systems
        // Delay slightly so the core "enemy defeated" message lands first.
        setTimeout(() => { if (wasArena) arenaVictory(g, e); else battleLoot(g, e); }, 60);
    };

    function grant(g, kind, amount, reason) {
        const p = ensure();
        if (!p) return;
        const table = {
            gold:      { key: 'gold',       icon: '🪙', sfx: 'coin' },
            ruby:      { key: 'rubies',     icon: '🔴', sfx: 'treasure' },
            goldRuby:  { key: 'goldRubies', icon: '🟡', sfx: 'magic' },
            diamond:   { key: 'diamonds',   icon: '💎', sfx: 'magic' },
        }[kind];
        p[table.key] += amount;
        window.MusicSystem?.playSFX?.(table.sfx);
        g.addNarrative(`${table.icon} +${amount} ${table.key === 'gold' ? 'gold coins' : kind === 'ruby' ? (amount > 1 ? 'rubies' : 'ruby') : kind === 'goldRuby' ? 'gold ruby' : 'diamond'} (${reason}). Total: ${p[table.key]}.`, 'treasure');
        g.save();
    }

    function battleLoot(g, e) {
        const eco = g.state.economy || ensure() && g.state.economy;
        if (!eco) return;
        eco.battlesSinceRuby += 1;
        const strong = (e?.xp || 0) >= 45 || e?.boss;
        const elite = (e?.xp || 0) >= 60 || e?.boss;

        // Ruby: 18% chance, with a guaranteed pity ruby after 5 dry battles.
        if (eco.battlesSinceRuby >= 5) {
            grant(g, 'ruby', 1, 'persistence reward — the arena gods are fair');
            eco.battlesSinceRuby = 0;
        } else if (Math.random() < (strong ? 0.30 : 0.18)) {
            grant(g, 'ruby', 1, 'loot');
            eco.battlesSinceRuby = 0;
        }
        if (elite) grant(g, 'ruby', 1, 'elite foe trophy');
        if (strong && Math.random() < 0.12) grant(g, 'goldRuby', 1, 'rare drop');
        if (elite && Math.random() < 0.25) grant(g, 'diamond', 1, 'very rare drop');
    }

    /* ════════════════ 3. DAILY TREASURE (streak, fully offline) ════════════════ */
    G().claimDailyTreasure = function () {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        const eco = this.state.economy;
        const today = new Date().toISOString().slice(0, 10);
        if (eco.lastDaily === today) {
            this.addNarrative('You already claimed today\'s treasure. A new chest arrives tomorrow — fair is fair for every hero. ⚖️', 'system');
            return;
        }
        const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
        eco.dailyStreak = eco.lastDaily === yesterday ? eco.dailyStreak + 1 : 1;
        eco.lastDaily = today;

        grant(this, 'gold', 100 + p.level * 25, `day ${eco.dailyStreak} treasure`);
        if (eco.dailyStreak % 3 === 0) grant(this, 'ruby', 1, 'streak bonus');
        if (eco.dailyStreak % 7 === 0) grant(this, 'goldRuby', 1, 'weekly streak bonus');
        this.addNarrative(`Daily streak: ${eco.dailyStreak} day${eco.dailyStreak === 1 ? '' : 's'}. Come back tomorrow for a bigger chest!`, 'system');
    };

    /* ════════════════ 4. COMPANION REVIVAL ════════════════ */
    G().fallenCompanions = function () {
        ensure();
        return (this.state.companions || []).filter(c => (c.hp ?? 0) <= 0);
    };

    G().companionsStatus = function () {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        const all = this.state.companions || [];
        if (!all.length) { this.addNarrative('You travel alone for now. Recruit companions on your journey!', 'system'); return; }
        const alive = all.filter(c => c.hp > 0);
        const fallen = this.fallenCompanions();
        this.addNarrative(`Companions: ${alive.length} standing (${alive.map(c => `${c.name} ${c.hp}/${c.maxHp} HP`).join(', ') || 'none'}).`, 'system');
        if (fallen.length) {
            this.addNarrative(`💤 Fallen and awaiting revival: ${fallen.map(c => c.name).join(', ')}. Say "revive" to see revival options.`, 'system');
        } else {
            this.addNarrative('Every companion is on their feet. Well led! 🛡️', 'system');
        }
    };

    const REVIVE_OPTIONS = {
        gold:  { label: 'gold coins', costText: '250 gold coins', check: p => p.gold >= 250, pay: p => p.gold -= 250, hpPct: 0.35, icon: '🪙' },
        ruby:  { label: 'rubies', costText: '2 rubies', check: p => p.rubies >= 2, pay: p => p.rubies -= 2, hpPct: 0.60, icon: '🔴' },
        goldruby: { label: 'gold ruby', costText: '1 gold ruby', check: p => p.goldRubies >= 1, pay: p => p.goldRubies -= 1, hpPct: 1.0, icon: '🟡' },
        diamond:  { label: 'diamond', costText: '1 diamond', check: p => p.diamonds >= 1, pay: p => p.diamonds -= 1, hpPct: 1.0, all: true, icon: '💎' },
    };

    G().showReviveOptions = function () {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        const fallen = this.fallenCompanions();
        if (!fallen.length) {
            this.addNarrative('No companion needs revival — everyone is standing. 🎉', 'system');
            return;
        }
        this.addNarrative(`Fallen companions: ${fallen.map(c => c.name).join(', ')}.`, 'system');
        this.addNarrative(
            'Choose how to revive — the healer is fair to every purse:\n' +
            `🪙 "revive with gold [name]" — 250 gold → returns at 35% health\n` +
            `🔴 "revive with rubies [name]" — 2 rubies → returns at 60% health\n` +
            `🟡 "revive with gold ruby [name]" — 1 gold ruby → FULL health\n` +
            `💎 "revive with diamond" — 1 diamond → revives ALL companions at FULL health\n` +
            `You have: ${this.currencySummary()}`, 'system');
    };

    G().reviveCompanion = function (method, nameQuery) {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        if (this.state.inCombat) { this.addNarrative('Revival rites need quiet — finish the battle first. ⚔️', 'system'); return; }
        const fallen = this.fallenCompanions();
        if (!fallen.length) { this.addNarrative('No companion needs revival right now.', 'system'); return; }

        const opt = REVIVE_OPTIONS[method];
        if (!opt) { this.showReviveOptions(); return; }

        const target = !opt.all && nameQuery
            ? fallen.find(c => c.name.toLowerCase().includes(nameQuery)) || fallen[0]
            : fallen[0];

        if (!opt.check(p)) {
            this.addNarrative(`Not enough ${opt.label}: you need ${opt.costText}. You have ${this.currencySummary()}. Try a fairer path — battles, daily treasure, or the Arena all pay out.`, 'system');
            return;
        }

        const revived = opt.all ? fallen : [target];
        opt.pay(p);
        revived.forEach(c => {
            c.hp = Math.max(1, Math.floor((c.maxHp || 30) * opt.hpPct));
        });
        window.MusicSystem?.playSFX?.(method === 'gold' ? 'heal' : method === 'ruby' ? 'heal-chain' : 'magic');
        const names = revived.map(c => c.name).join(', ');
        this.addNarrative(`${opt.icon} Revival complete! ${names} return${revived.length === 1 && !/s$/.test(names) ? 's' : ''} with ${names.split(', ').map(n => `${n} ${revived.find(c => c.name === n).hp} HP`).join(', ')}. ${opt.all ? 'The diamond\'s light restores the whole company!' : ''}`, 'green-light');
        this.updateHUD();
        this.save();
    };

    /* ════════════════ 5. ARENA OF ECHOES (fair endless mode) ════════════════ */
    const ARENA_TIERS = [
        ['goblin scout', 'wolf', 'giant frog', 'goblin guard'],                    // waves 1-3
        ['forest spider', 'mountain lion', 'goblin warrior', 'goblin guard'],      // waves 4-6
        ['goblin shaman', 'skeleton warrior', 'undead mage', 'skeleton guard'],    // waves 7-9
        ['skeleton guard', 'undead mage', 'goblin warlord', 'ghost knight'],       // waves 10+
    ];

    G().startArena = function () {
        const p = ensure();
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return; }
        if (this.state.inCombat) { this.addNarrative('Finish your current battle first.', 'system'); return; }
        if (this.state.arena?.active) { this.addNarrative(`Already in the Arena — wave ${this.state.arena.wave} ongoing. Say "next", "arena status" or "leave arena".`, 'system'); return; }
        this.state.arena = { active: true, wave: 0, wins: 0, canRest: false, rested: false };
        window.MusicSystem?.playSFX?.('door');
        this.addNarrative('🏟️ You step into the Arena of Echoes! Each wave is scaled fairly to your level — victory pays coins, rubies, gold rubies and even diamonds. Say "next" to summon wave 1. You may "leave arena" anytime and keep every reward. A fallen hero is rescued by healers — never left behind. ⚖️', 'combat');
        this.save();
    };

    G().arenaStatus = function () {
        const a = this.state.arena;
        if (!a?.active) { this.addNarrative('You are not in the Arena. Say "arena" to enter.', 'system'); return; }
        this.addNarrative(`Arena: wave ${a.wave} summoned, ${a.wins} victories so far. ${a.canRest && !a.rested ? 'You can rest once (say "arena rest", 50 gold).' : ''} Say "next" for the next wave or "leave arena" to retire.`, 'system');
    };

    function arenaTier(wave) {
        if (wave <= 3) return 0;
        if (wave <= 6) return 1;
        if (wave <= 9) return 2;
        return 3;
    }

    G().arenaNextWave = function () {
        const p = ensure();
        if (!p) return;
        const a = this.state.arena;
        if (!a?.active) { this.addNarrative('Say "arena" first to enter the Arena of Echoes.', 'system'); return; }
        if (this.state.inCombat) { this.addNarrative('The crowd roars — finish this wave first!', 'system'); return; }

        a.wave += 1;
        a.rested = !a.canRest ? a.rested : a.rested; // rest carries until used
        const wave = a.wave;
        const champion = wave % 5 === 0 || wave >= 12;
        const pool = ARENA_TIERS[arenaTier(wave)];
        const base = champion
            ? (window.WorldData.enemies['ghost knight'] || window.WorldData.enemies['skeleton guard'])
            : window.WorldData.enemies[pool[Math.floor(Math.random() * pool.length)]];

        // Fair scaling: engine already scales by player level; arena adds a
        // small, capped wave multiplier so early waves are welcoming and late
        // waves are a genuine (but beatable) challenge.
        const mult = Math.min(1 + (wave - 1) * 0.18, 3.2) * (champion ? 1.35 : 1);
        const foe = {
            hp: Math.floor(base.hp * mult),
            attack: Math.min(base.attack + (wave - 1), base.attack + 15),
            xp: base.xp + wave * 4,
            gold: base.gold + wave * 2,
            desc: `Arena ${champion ? 'CHAMPION' : 'challenger'} of wave ${wave}`,
        };
        window.WorldData.enemies['arena foe'] = foe;

        const fallen = this.fallenCompanions().length;
        this.addNarrative(`🌊 WAVE ${wave}${champion ? ' — CHAMPION BOUT' : ''}: ${foe.desc} approaches (${foe.hp} HP, ${foe.attack} attack). Fight with your usual commands!${fallen ? ` (${fallen} companion(s) fallen — revive after the battle.)` : ''}`, 'combat');
        this.startCombat('arena foe');
        this.save();
    };

    function arenaVictory(g, e) {
        const a = g.state.arena;
        if (!a?.active) return;
        if (e?.name !== 'arena foe') return;
        a.wins += 1;
        a.canRest = true;
        a.rested = false;

        const wave = a.wave;
        grant(g, 'gold', 30 + wave * 10, `wave ${wave} purse`);
        if (wave % 2 === 0) grant(g, 'ruby', 1, `wave ${wave} milestone`);
        if (wave % 5 === 0) grant(g, 'goldRuby', 1, `champion of wave ${wave}`);
        if (wave % 7 === 0) grant(g, 'diamond', 1, `legend of wave ${wave}`);
        if (wave > 0 && wave % 10 === 0) grant(g, 'diamond', 1, 'arena glory');

        g.addNarrative(`🏆 Crowd goes wild — ${a.wins} arena win${a.wins === 1 ? '' : 's'}! Say "next" for wave ${wave + 1}, "arena rest" to recover (50 gold, once per intermission), or "leave arena" with your spoils.`, 'combat');
        g.save();
    }

    G().arenaRest = function () {
        const p = ensure();
        if (!p) return;
        const a = this.state.arena;
        if (!a?.active) { this.addNarrative('Rest is an arena privilege — say "arena" first.', 'system'); return; }
        if (this.state.inCombat) { this.addNarrative('No resting mid-battle!', 'system'); return; }
        if (!a.canRest || a.rested) { this.addNarrative('You can rest once between waves — right after a victory.', 'system'); return; }
        if (p.gold < 50) { this.addNarrative('Rest costs 50 gold coins.', 'system'); return; }
        p.gold -= 50;
        const healed = Math.floor(p.maxHp * 0.4);
        p.hp = Math.min(p.maxHp, p.hp + healed);
        p.mp = Math.min(p.maxMp, p.mp + Math.floor(p.maxMp * 0.25));
        a.rested = true;
        window.MusicSystem?.playSFX?.('heal');
        this.addNarrative(`🛋️ Arena healers tend your wounds: +${healed} HP (${p.hp}/${p.maxHp}). Refreshed for the next wave — say "next".`, 'green-light');
        this.updateHUD();
        this.save();
    };

    G().leaveArena = function (silent) {
        const a = this.state.arena;
        if (!a?.active) { if (!silent) this.addNarrative('You are not in the Arena.', 'system'); return; }
        const wins = a.wins;
        this.state.arena = { active: false, wave: 0, wins: 0, canRest: false, rested: false };
        if (!silent) {
            window.MusicSystem?.playSFX?.('door');
            this.addNarrative(`🚪 You leave the Arena of Echoes with ${wins} victor${wins === 1 ? 'y' : 'ies'} and every reward you earned. The crowd will remember you. Say "arena" anytime to return.`, 'system');
        }
        this.save();
    };

    /* ════ Arena death = rescue, never permadeath (fair by design) ════ */
    const oldGameOver = G().gameOver.bind(G());
    G().gameOver = function () {
        if (this.state.arena?.active) {
            const p = this.state.player;
            window.MusicSystem?.playSFX?.('heal-chain');
            this.state.inCombat = false;
            this.state.enemy = null;
            p.hp = Math.max(1, Math.floor(p.maxHp * 0.25));
            grant(this, 'ruby', 1, 'healers\' consolation');
            this.addNarrative(`🩹 The arena healers drag you to safety and restore you to ${p.hp} HP. Falling in the Arena costs nothing but pride — revive companions, rest, and return stronger. The Arena waits for no contract.`, 'magic');
            const a = this.state.arena;
            this.addNarrative(`Your streak ended at ${a.wins} win${a.wins === 1 ? '' : 's'} on wave ${a.wave}.`, 'system');
            this.leaveArena(true);
            this.updateHUD();
            this.save();
            return;
        }
        oldGameOver();
    };

    /* ════════════════ 6. TALKBACK COMMANDS ════════════════ */
    const oldCommand = G().processCommand.bind(G());
    G().processCommand = function (cmd) {
        const raw = String(cmd || '');
        const c = raw.toLowerCase().trim();

        // Wallet & economy
        if (/^(wallet|purse|coins|currencies|currency|treasure|money)$/.test(c)) {
            this.showWallet(); return;
        }
        if (/^(daily|daily treasure|claim|claim daily|daily reward)$/.test(c)) {
            this.claimDailyTreasure(); return;
        }

        // Companions & revival
        if (/^(companions|party|team status|companion status)$/.test(c)) {
            this.companionsStatus(); return;
        }
        if (c === 'revive' || c === 'revive companion') { this.showReviveOptions(); return; }
        const rev = c.match(/^revive(?:\s+(?:with|using|by))?\s+(gold ruby|gold rubies|rubies|ruby|gold|gold coins|diamond|diamonds)(?:\s+(.+))?$/);
        if (rev) {
            const map = {
                'gold ruby': 'goldruby', 'gold rubies': 'goldruby',
                'ruby': 'ruby', 'rubies': 'ruby',
                'gold': 'gold', 'gold coins': 'gold',
                'diamond': 'diamond', 'diamonds': 'diamond',
            };
            this.reviveCompanion(map[rev[1]], (rev[2] || '').trim().toLowerCase());
            return;
        }

        // Arena of Echoes
        if (/^(arena|enter arena|arena of echoes)$/.test(c)) { this.startArena(); return; }
        if (/^(next|next wave|continue arena|fight|wave next)$/.test(c)) { this.arenaNextWave(); return; }
        if (/^(arena status|arena info)$/.test(c)) { this.arenaStatus(); return; }
        if (/^(arena rest|rest in arena|rest)$/.test(c) && this.state.arena?.active) { this.arenaRest(); return; }
        if (/^(leave arena|exit arena|quit arena|retire)$/.test(c)) { this.leaveArena(); return; }

        return oldCommand(cmd);
    };

    console.log('🏟️ v18 loaded: currencies (🪙🔴🟡💎), companion revival, daily treasure & the Arena of Echoes — fair by design.');
})();
