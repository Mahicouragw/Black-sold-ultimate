/**
 * Black Sword Ultimate v7.55 — prayer in battle and the four angels.
 *
 *   pray              in battle, health above 15%: a battle prayer. Once per
 *                     battle, restores a fifth of health and magic, and uses
 *                     the hero's turn.
 *   pray              anywhere, health at 15% or lower: the emergency prayer.
 *                     Four angels come, restore health and magic in full, and
 *                     fight beside the hero for five turns. (Inside a temple
 *                     a plain "pray" still opens the temple prayers; say
 *                     "emergency prayer" there.)
 *
 * The angels come once per battle. Outside battle they come once and wait for
 * the next battle, so the prayer cannot be repeated as a free refill.
 * Everything the player hears goes through Narration (English, Telugu, Hindi).
 */
(function () {
    'use strict';
    const N = window.Narration;
    if (!N) return;

    const THRESHOLD = 0.15, TURNS = 5, HEAL_CHANCE = 0.3, BATTLE_SHARE = 0.2;
    const ANGELS = [
        { id: 'light', attack: 15, heal: 20 },
        { id: 'grace', attack: 10, heal: 30 },
        { id: 'strength', attack: 20, heal: 10 },
        { id: 'wisdom', attack: 12, heal: 25 }
    ];
    const HELP_WORDS = new Set(['help', 'for help', 'rescue', 'for rescue', 'mercy', 'for mercy', 'angels', 'the angels', 'for angels', 'for the angels', 'emergency']);
    const COMMANDS = new Set(['emergency prayer', 'emergency pray', 'call angels', 'call the angels', 'summon angels', 'summon the angels', 'angels', 'four angels', 'pray for help', 'pray for rescue', 'pray for mercy']);

    N.add({
        'angel.light': ['the Angel of Light', 'వెలుగు దేవదూత', 'प्रकाश का देवदूत'],
        'angel.grace': ['the Angel of Grace', 'కృప దేవదూత', 'कृपा का देवदूत'],
        'angel.strength': ['the Angel of Strength', 'బలం దేవదూత', 'शक्ति का देवदूत'],
        'angel.wisdom': ['the Angel of Wisdom', 'వివేకం దేవదూత', 'विवेक का देवदूत'],
        'angel.descend': [
            'You cry out in prayer. Four angels descend from the heavens: {names}. Your health and magic are fully restored. You have {hp} health and {mp} magic.',
            'మీరు ఆర్తితో ప్రార్థించారు. నలుగురు దేవదూతలు ఆకాశం నుండి దిగివచ్చారు: {names}. మీ ఆరోగ్యం, మంత్రశక్తి పూర్తిగా తిరిగి వచ్చాయి. మీకు {hp} ఆరోగ్యం, {mp} మంత్రశక్తి ఉన్నాయి.',
            'आपने व्याकुल होकर प्रार्थना की। चार देवदूत स्वर्ग से उतरे: {names}। आपका स्वास्थ्य और जादुई शक्ति पूरी तरह लौट आई। आपके पास {hp} स्वास्थ्य और {mp} जादुई शक्ति है।'
        ],
        'angel.stayBattle': ['The angels will fight beside you for {turns} turns.', 'దేవదూతలు {turns} వంతుల పాటు మీ పక్కన పోరాడతారు.', 'देवदूत {turns} बारी तक आपके साथ लड़ेंगे।'],
        'angel.stayLater': ['The angels will stay with you and fight beside you for {turns} turns in your next battle.', 'దేవదూతలు మీతోనే ఉండి, మీ తదుపరి యుద్ధంలో {turns} వంతుల పాటు మీ పక్కన పోరాడతారు.', 'देवदूत आपके साथ रहेंगे और अगले युद्ध में {turns} बारी तक आपके साथ लड़ेंगे।'],
        'angel.join': ['The four angels stand beside you in this battle. They will fight for {turns} turns.', 'నలుగురు దేవదూతలు ఈ యుద్ధంలో మీ పక్కన నిలిచారు. వారు {turns} వంతుల పాటు పోరాడతారు.', 'चारों देवदूत इस युद्ध में आपके साथ खड़े हैं। वे {turns} बारी तक लड़ेंगे।'],
        'angel.strike': ['The four angels strike {enemy} for {damage} damage.', 'నలుగురు దేవదూతలు {enemy} పై దాడి చేసి {damage} నష్టం కలిగించారు.', 'चारों देवदूतों ने {enemy} पर वार करके {damage} चोट पहुँचाई।'],
        'angel.heal': ['{names} heal you for {amount} health. You have {hp} health.', '{names} మీకు {amount} ఆరోగ్యం తిరిగి ఇచ్చారు. మీకు {hp} ఆరోగ్యం ఉంది.', '{names} ने आपका {amount} स्वास्थ्य लौटाया। आपके पास {hp} स्वास्थ्य है।'],
        'angel.oneLeft': ['The angels will stay for one more turn.', 'దేవదూతలు ఇంకొక్క వంతు మాత్రమే ఉంటారు.', 'देवदूत बस एक और बारी रुकेंगे।'],
        'angel.ascend': ['The four angels ascend back to the heavens.', 'నలుగురు దేవదూతలు తిరిగి ఆకాశానికి వెళ్లిపోయారు.', 'चारों देवदूत स्वर्ग लौट गए।'],
        'angel.usedBattle': ['The angels have already answered you in this battle. They come once in each battle.', 'ఈ యుద్ధంలో దేవదూతలు ఇప్పటికే మీ ప్రార్థన ఆలకించారు. ప్రతి యుద్ధంలో వారు ఒక్కసారే వస్తారు.', 'इस युद्ध में देवदूत आपकी प्रार्थना पहले ही सुन चुके हैं। वे हर युद्ध में एक ही बार आते हैं।'],
        'angel.present': ['The angels are already with you. They have {turns} turns left.', 'దేవదూతలు ఇప్పటికే మీతో ఉన్నారు. వారికి ఇంకా {turns} వంతులు మిగిలి ఉన్నాయి.', 'देवदूत पहले से आपके साथ हैं। उनकी {turns} बारी बाकी हैं।'],
        'angel.waiting': ['The angels are already with you. They will fight beside you for {turns} turns in your next battle.', 'దేవదూతలు ఇప్పటికే మీతో ఉన్నారు. మీ తదుపరి యుద్ధంలో {turns} వంతుల పాటు మీ పక్కన పోరాడతారు.', 'देवदूत पहले से आपके साथ हैं। अगले युद्ध में वे {turns} बारी तक आपके साथ लड़ेंगे।'],
        'angel.hint': ['If your health falls to 15 percent or lower, pray anywhere, even in battle, and four angels will come to your aid.', 'మీ ఆరోగ్యం 15 శాతానికి లేదా అంతకంటే తక్కువకు పడిపోతే, ఎక్కడైనా, యుద్ధంలో కూడా ప్రార్థించండి. నలుగురు దేవదూతలు మీకు సహాయంగా వస్తారు.', 'अगर आपका स्वास्थ्य 15 प्रतिशत या उससे कम हो जाए, तो कहीं भी, युद्ध में भी प्रार्थना करें। चार देवदूत आपकी सहायता को आएँगे।'],
        'angel.stable': ['Your health is at {percent} percent. The angels come when it is at 15 percent or lower.', 'మీ ఆరోగ్యం {percent} శాతం ఉంది. అది 15 శాతం లేదా అంతకంటే తక్కువ ఉన్నప్పుడు దేవదూతలు వస్తారు.', 'आपका स्वास्थ्य {percent} प्रतिशत है। जब यह 15 प्रतिशत या उससे कम हो, तब देवदूत आते हैं।'],
        'battlePrayer.done': ['You pray in the middle of the battle. You recover {hp} health and {mp} magic. You have {now} health.', 'యుద్ధం మధ్యలో మీరు ప్రార్థించారు. {hp} ఆరోగ్యం, {mp} మంత్రశక్తి తిరిగి వచ్చాయి. మీకు {now} ఆరోగ్యం ఉంది.', 'आपने युद्ध के बीच प्रार्थना की। {hp} स्वास्थ्य और {mp} जादुई शक्ति लौटी। आपके पास {now} स्वास्थ्य है।'],
        'battlePrayer.hpOnly': ['You pray in the middle of the battle. You recover {hp} health. You have {now} health.', 'యుద్ధం మధ్యలో మీరు ప్రార్థించారు. {hp} ఆరోగ్యం తిరిగి వచ్చింది. మీకు {now} ఆరోగ్యం ఉంది.', 'आपने युद्ध के बीच प्रार्थना की। {hp} स्वास्थ्य लौटा। आपके पास {now} स्वास्थ्य है।'],
        'battlePrayer.mpOnly': ['You pray in the middle of the battle. You recover {mp} magic. Your health is already full.', 'యుద్ధం మధ్యలో మీరు ప్రార్థించారు. {mp} మంత్రశక్తి తిరిగి వచ్చింది. మీ ఆరోగ్యం ఇప్పటికే నిండుగా ఉంది.', 'आपने युद्ध के बीच प्रार्थना की। {mp} जादुई शक्ति लौटी। आपका स्वास्थ्य पहले से पूरा है।'],
        'battlePrayer.full': ['You pray in the middle of the battle. Your health and magic are already full.', 'యుద్ధం మధ్యలో మీరు ప్రార్థించారు. మీ ఆరోగ్యం, మంత్రశక్తి ఇప్పటికే నిండుగా ఉన్నాయి.', 'आपने युद्ध के बीच प्रार्थना की। आपका स्वास्थ्य और जादुई शक्ति पहले से पूरी है।'],
        'battlePrayer.used': ['You have already prayed in this battle. If your health falls to 15 percent or lower, pray again and the angels will come.', 'ఈ యుద్ధంలో మీరు ఇప్పటికే ప్రార్థించారు. మీ ఆరోగ్యం 15 శాతానికి లేదా అంతకంటే తక్కువకు పడిపోతే, మళ్లీ ప్రార్థించండి, దేవదూతలు వస్తారు.', 'इस युद्ध में आप पहले ही प्रार्थना कर चुके हैं। अगर आपका स्वास्थ्य 15 प्रतिशत या उससे कम हो जाए, तो फिर प्रार्थना करें, देवदूत आएँगे।'],
        'battlePrayer.notInBattle': ['A battle prayer is for the middle of a fight. You are not in battle.', 'యుద్ధ ప్రార్థన పోరాటం మధ్యలో చేసేది. మీరు ఇప్పుడు యుద్ధంలో లేరు.', 'युद्ध प्रार्थना लड़ाई के बीच की जाती है। आप अभी युद्ध में नहीं हैं।'],
        'btn.prayBattle': ['🙏 Pray', '🙏 ప్రార్థించు', '🙏 प्रार्थना']
    });

    function wire() {
        const G = window.Game;
        if (!G || G._angelsV755 || typeof G.pray !== 'function') return;
        G._angelsV755 = true;

        // sacred.js rebuilds state.sacred on every call, so always read it fresh.
        const sacred = game => game.state.sacred || (game.state.sacred = {});
        const say = (game, text, type = 'system', options = {}) => game.emitGameEvent ? game.emitGameEvent(text, type, options) : game.addNarrative(text, type);
        const sfx = name => { try { window.MusicSystem?.playSFX?.(name); } catch { /* sound is optional */ } };
        const turnsLeft = game => Math.max(0, Math.floor(Number(sacred(game).angels?.turns) || 0));
        const isLow = p => p && p.hp > 0 && p.maxHp > 0 && p.hp / p.maxHp <= THRESHOLD;
        const names = list => N.list(list.map(angel => N.t('angel.' + angel.id)));
        const power = p => 1 + (Math.max(1, Number(p?.level) || 1) - 1) * 0.15;   // the same curve monsters use
        const refresh = game => { game.updateHUD?.(); game.updateEnemyHUD?.(); game.updateEnemyGroupHUD?.(); };
        const enemyTurn = game => { if (game.state.inCombat && game.state.enemy && game.state.enemy.hp > 0) return game.enemyAttack(); };

        G.angelsWithHero = function () { return turnsLeft(this); };

        function summon(game) {
            const p = game.state.player, s = sacred(game), inBattle = Boolean(game.state.inCombat);
            p.hp = p.maxHp; p.mp = p.maxMp;
            s.angels = { turns: TURNS, since: Date.now() };
            if (inBattle) s.angelsBattle = true;
            sfx('heal');
            say(game, N.t('angel.descend', { names: names(ANGELS), hp: p.hp, mp: p.mp }), 'green-light', { critical: true });
            say(game, N.t(inBattle ? 'angel.stayBattle' : 'angel.stayLater', { turns: TURNS }), 'green-light');
            refresh(game); game.save?.();
        }

        /** One round of the angels. Returns a promise when their blow ended the fight. */
        function angelsAct(game) {
            const s = sacred(game), p = game.state.player, e = game.state.enemy;
            const left = turnsLeft(game);
            if (!left || game._angelsBusy || !game.state.inCombat || !e || e.hp <= 0 || !p || p.hp <= 0) return null;
            const scale = power(p);
            const total = ANGELS.reduce((sum, angel) => sum + Math.floor((angel.attack + Math.floor(Math.random() * 5)) * scale), 0);
            const applied = typeof game.applyEnemyDamage === 'function' ? game.applyEnemyDamage(total, null) : (e.hp = Math.max(0, e.hp - total), total);
            sfx('attack');
            say(game, N.t('angel.strike', { enemy: e.name, damage: Number.isFinite(applied) ? applied : total }), 'combat');
            const healers = ANGELS.filter(() => Math.random() < HEAL_CHANCE);
            const wanted = healers.reduce((sum, angel) => sum + Math.floor(angel.heal * scale), 0);
            const healed = Math.max(0, Math.min(wanted, p.maxHp - p.hp));
            if (healed > 0) {
                p.hp += healed; sfx('heal');
                say(game, N.t('angel.heal', { names: names(healers), amount: healed, hp: p.hp }), 'green-light');
            }
            s.angels = { ...(s.angels || {}), turns: left - 1 };
            if (left - 1 <= 0) { delete sacred(game).angels; say(game, N.t('angel.ascend'), 'system'); }
            else if (left - 1 === 1) say(game, N.t('angel.oneLeft'), 'system');
            refresh(game);
            if (e.hp > 0) return null;
            // The angels' blow felled the monster: settle it the way a hero's
            // killing blow is settled, and let any survivors take their turn.
            game._angelsBusy = true;
            return Promise.resolve()
                .then(() => game.enemyDefeated())
                .then(() => game.resolveSurvivorTurn?.())
                .catch(error => console.warn('angel turn error:', error))
                .finally(() => { game._angelsBusy = false; });
        }

        const oldEnemy = G.enemyAttack.bind(G);
        G.enemyAttack = function () {
            const ended = angelsAct(this);
            if (ended) return ended;
            return oldEnemy();
        };

        const oldStart = G.startCombat.bind(G);
        G.startCombat = function (name, queued = false) {
            const result = oldStart(name, queued);
            if (!queued && this.state.inCombat) {
                const left = turnsLeft(this);
                sacred(this).angelsBattle = left > 0;
                if (left > 0) say(this, N.t('angel.join', { turns: left }), 'green-light');
            }
            return result;
        };

        function battlePrayer(game) {
            const p = game.state.player;
            if (game.state.battlePrayerUsed) { say(game, N.t('battlePrayer.used')); return false; }
            game.state.battlePrayerUsed = true;
            const hp = Math.max(0, Math.min(Math.max(5, Math.floor(p.maxHp * BATTLE_SHARE)), p.maxHp - p.hp));
            const mp = Math.max(0, Math.min(Math.max(3, Math.floor(p.maxMp * BATTLE_SHARE)), p.maxMp - p.mp));
            p.hp += hp; p.mp += mp;
            sfx('heal');
            const key = hp && mp ? 'battlePrayer.done' : hp ? 'battlePrayer.hpOnly' : mp ? 'battlePrayer.mpOnly' : 'battlePrayer.full';
            say(game, N.t(key, { hp, mp, now: p.hp }), 'green-light');
            refresh(game); game.updateBattleActionButtons?.(); game.save?.();
            enemyTurn(game);
            return true;
        }

        const oldPray = G.pray.bind(G);
        G.pray = async function (choice = '') {
            const p = this.state.player;
            if (!p || p.pendingTempleRevival || p.hp <= 0) return oldPray(choice);
            const word = String(choice || '').toLowerCase().trim();
            const prayerPlace = typeof this.isPrayerPlace === 'function' ? this.isPrayerPlace() : true;
            // In a temple a plain "pray" opens the temple prayers as before; the
            // emergency prayer there is asked for by name ("emergency prayer").
            const asksForHelp = HELP_WORDS.has(word) || (!word && !prayerPlace);
            const inBattle = Boolean(this.state.inCombat && this.state.enemy);
            const left = turnsLeft(this);

            if (inBattle) {
                if (isLow(p)) {
                    if (!left && !sacred(this).angelsBattle) { summon(this); enemyTurn(this); return true; }
                    say(this, left > 0 ? N.t('angel.present', { turns: left }) : N.t('angel.usedBattle'));
                    if (this.state.battlePrayerUsed) return false;
                }
                return battlePrayer(this);
            }
            if (asksForHelp && isLow(p)) {
                if (left > 0) { say(this, N.t('angel.waiting', { turns: left })); return false; }
                summon(this);
                return true;
            }
            if (word && HELP_WORDS.has(word)) {
                say(this, left > 0 ? N.t('angel.waiting', { turns: left }) : N.t('angel.stable', { percent: Math.round(p.hp / p.maxHp * 100) }));
                return false;
            }
            const result = await oldPray(choice);
            // Refused because the hero is not in a temple: say how the emergency prayer works.
            if (!prayerPlace) say(this, N.t('angel.hint'));
            return result;
        };

        // The older "battle prayer" command and button now give the same prayer.
        G.useBattlePrayer = function () {
            if (!this.state.inCombat) { say(this, N.t('battlePrayer.notInBattle')); return false; }
            return this.pray('');
        };

        const oldCommand = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            const c = String(raw || '').trim().toLowerCase();
            if (COMMANDS.has(c)) { this.pray('help'); return; }
            if (c === 'battle prayer' || c === 'pray in battle') { this.useBattlePrayer(); return; }
            return oldCommand(raw);
        };

        const label = () => {
            for (const button of document.querySelectorAll('[data-combat-command="pray"]')) button.textContent = N.t('btn.prayBattle');
        };
        label();
        window.addEventListener('bsu-language', label);
    }

    window.PrayerAngels = { ANGELS, THRESHOLD, TURNS, HEAL_CHANCE, BATTLE_SHARE };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
