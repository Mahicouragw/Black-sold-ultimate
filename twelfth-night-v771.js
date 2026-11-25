/**
 * 7.71.0 — Twelfth Night, the six nights after Christmas (26–31 December).
 *
 * Four things live here, and none of them sells power:
 *   • a row of six candles on Kaliwasch Market Square, one lit each night;
 *   • carols with Crier Bell, one verse each night, and a caroller's cloak for
 *     singing every verse;
 *   • a gift exchange, graded by generosity, where the parcel is always worth
 *     less than the gift — so giving can never be turned into a purse;
 *   • a frost-prowler bounty board that sets the same bounty and the same
 *     payment for every hero, one claim each night.
 * The shared tree of lights takes a light from every door, candle and carol,
 * and gives nothing back but light. Every rule is checked again when used, so a
 * resumed tab, a spell or a walk cannot open a night early.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const market = 'kaliwasch', tavern = 'kaliwasch_tavern';
    const NIGHTS = [26, 27, 28, 29, 30, 31];
    const BOUNTY_TARGET = 3;
    const BOUNTY_DIAMONDS = 3;

    const CANDLE_LINES = {
        26: 'The first candle, for the keeper who left a light in the window.',
        27: 'The second candle, for the baker whose oven never went cold.',
        28: 'The third candle, for the fisher who cut her hole by lantern light.',
        29: 'The fourth candle, for the watchman with the bent key.',
        30: 'The fifth candle, for every door that opened on its own night.',
        31: 'The sixth candle, for the year that is ending and the one that has not begun.'
    };

    const CAROLS = [
        { n: 26, verse: 'The wind came down the chimney stack and found the hearth still warm,', reply: 'so we sang it back along the road and sent it on its way.' },
        { n: 27, verse: 'Six candles in a crooked row, six nights to end the year,', reply: 'and every window on the square has one more light than yesterday.' },
        { n: 28, verse: 'The bread is cut, the cider poured, the door is left unlatched,', reply: 'for somebody is walking home who has not finished yet.' },
        { n: 29, verse: 'The bell is old, the bell is cracked, the bell still knows the tune,', reply: 'and half the city hums it now, in kitchens, out of time.' },
        { n: 30, verse: 'The frost is on the water butt, the frost is on the gate,', reply: 'but not on us, not on us, we are too loud for frost.' },
        { n: 31, verse: 'Old year, old year, put down your pack and sit a while with me,', reply: 'the new year is a stranger yet, and has no coat to wear.' }
    ];

    const CAROLLER_CLOAK = {
        id: 'caroller_cloak', name: 'Caroller’s Cloak', type: 'trinket', value: 0,
        desc: 'A plain woollen cloak with a bell sewn into the hem, given to anyone who sang every verse of Twelfth Night. It has no magic in it at all, and that is the point of it.'
    };

    const TZ = 'Asia/Kolkata';
    function parts(date = new Date()) {
        const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
        const map = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
        return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
    }
    const dateKey = (t = parts()) => `${t.y}-${t.m}-${t.d}`;
    const active = (date = new Date()) => w.SeasonalEvents.activeEvents(date).map(e => e.id);
    const twelfthNight = (date = new Date()) => active(date).includes('twelfthnight');
    const christmas = (date = new Date()) => active(date).includes('christmas');
    const festival = (date = new Date()) => twelfthNight(date) || christmas(date);

    const defaults = () => ({ candles: {}, carols: {}, cloak: false, lastCandle: '', lastCarol: '', bounty: { date: '', kills: 0, claimed: false } });
    const stateOf = game => {
        const current = game.state.twelfthNight;
        const next = Object.assign(defaults(), current && typeof current === 'object' ? current : {});
        next.bounty = Object.assign({ date: '', kills: 0, claimed: false }, next.bounty || {});
        game.state.twelfthNight = next;
        return next;
    };
    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    const sfx = name => w.MusicSystem?.playSFX?.(name);
    const atCrier = game => [market, tavern].includes(game.state.location);
    const atRow = game => game.state.location === market;

    /** Advent doors already finished, so the tree reflects real walking. */
    const doorsFinished = game => {
        try { return Object.keys(w.AdventCalendar?.journal?.(game)?.done || {}).length; } catch { return 0; }
    };
    const lightsOf = game => {
        const s = stateOf(game);
        return doorsFinished(game) + Object.keys(s.candles).length + Object.keys(s.carols).length;
    };

    function saveState(game) {
        try { game.save?.(); } catch { }
    }

    /* ------------------------------------------------------------- candles */

    Game.candleRow = function () {
        if (!twelfthNight()) {
            say(this, 'The candle row stands cold on Kaliwasch Market Square. Its six candles are lit in the nights after Christmas, from the twenty-sixth of December to the thirty-first.', 'location');
            return;
        }
        const t = parts(), s = stateOf(this);
        const row = NIGHTS.map(n => `the ${n === 31 ? 'thirty-first' : n} of December: ${s.candles[n] ? 'burning' : 'dark'}`).join('; ');
        const left = NIGHTS.filter(n => !s.candles[n]).length;
        say(this, `The candle row on Kaliwasch Market Square. ${row}. ${left ? `${left} candle${left > 1 ? 's are' : ' is'} still dark; one candle may be lit each night, and a night that is missed can still be made good later in the row.` : 'All six candles burn, and the row throws a long warm light down the square.'} Say "light candle" beside the row.`, 'location');
    };

    Game.lightCandle = function () {
        const t = parts();
        if (!twelfthNight()) {
            say(this, 'The candle row is cold. It is lit only in the nights after Christmas, from the twenty-sixth of December to the thirty-first.', 'system');
            sfx('board-error');
            return false;
        }
        if (!atRow(this)) {
            say(this, 'The candle row stands on Kaliwasch Market Square, beside Crier Bell. Walk there and say "light candle".', 'system');
            return false;
        }
        const s = stateOf(this);
        const tonight = dateKey(t);
        if (s.lastCandle === tonight) {
            say(this, 'One candle each night is the whole of the custom. The row keeps its light; come back tomorrow for the next one.', 'system');
            return false;
        }
        const next = NIGHTS.find(n => !s.candles[n]);
        if (!next) {
            say(this, 'Every candle in the row is already burning. There is nothing left to light but the year itself.', 'system');
            return false;
        }
        s.candles[next] = Date.now();
        s.lastCandle = tonight;
        const p = this.state.player;
        if (p) { p.hp = p.maxHp; p.mp = p.maxMp; }
        say(this, `${CANDLE_LINES[next]} You light it from the one beside it, and the warmth goes through your coat and into your hands. Health and magic are whole again, and the tree of lights takes another light.`, 'green-light');
        sfx('magic');
        this.updateHUD?.();
        saveState(this);
        return true;
    };

    /* -------------------------------------------------------------- carols */

    Game.carols = function () {
        if (!festival()) {
            say(this, 'Crier Bell leads the carols only in the Christmas season. He is not on the square yet.', 'location');
            return;
        }
        const s = stateOf(this);
        const sung = Object.keys(s.carols).length;
        say(this, `Carols with Crier Bell. Verses sung: ${sung} of six${s.cloak ? ', and the caroller’s cloak is yours' : ''}. ${atCrier(this) ? 'Say "carol" and he will start the next verse; answer it with him.' : 'He leads them on Kaliwasch Market Square and in the tavern.'} Every verse sung adds a light to the tree.`, 'location');
    };

    Game.singCarol = function () {
        if (!festival()) { say(this, 'Crier Bell is not here to lead a carol. The carols belong to the Christmas season.', 'system'); return false; }
        if (!atCrier(this)) { say(this, 'Crier Bell leads the carols on Kaliwasch Market Square and in the tavern. Walk to him and say "carol".', 'system'); return false; }
        const s = stateOf(this), tonight = dateKey();
        if (s.lastCarol === tonight) {
            say(this, 'The last verse is still hanging in the cold air. One verse each night, that is how a carol lasts the season; come back tomorrow.', 'system');
            return false;
        }
        const verse = CAROLS.find(c => !s.carols[c.n]);
        if (!verse) {
            say(this, 'Every verse has been sung. Crier Bell has no more verses, only applause, and he gives it freely.', 'system');
            return false;
        }
        s.carols[verse.n] = Date.now();
        s.lastCarol = tonight;
        let extra = '';
        if (Object.keys(s.carols).length === CAROLS.length && !s.cloak) {
            s.cloak = true;
            this.addItemToInventory(CAROLLER_CLOAK.id, { ...CAROLLER_CLOAK });
            extra = ` Crier Bell takes off his own spare cloak, with its little bell in the hem, and puts it round your shoulders: "Every verse, every night. That is a caroller."`;
            sfx('levelup');
        }
        say(this, `Crier Bell: “${verse.verse}” — and you answer: “${verse.reply}” Two voices, then four, then everyone on the square. The tree of lights takes another light.${extra}`, 'npc');
        if (!extra) sfx('pickup');
        saveState(this);
        return true;
    };

    /* ------------------------------------------------------ gift exchange */

    Game.giftExchange = function (query) {
        if (!festival()) { say(this, 'The gift exchange belongs to the Christmas season, and the square is bare.', 'system'); return false; }
        if (!atCrier(this)) { say(this, 'The gift exchange is kept by Crier Bell on Kaliwasch Market Square, and by the tavern fire. Walk to him with something worth giving.', 'system'); return false; }
        const bag = (this.state.inventory || []).filter(i => (i.quantity || 0) > 0 && i.type !== 'gift' && i.type !== 'quest' && !i.questItem);
        if (!bag.length) { say(this, 'You carry nothing to give. A gift exchange asks for something of your own: a spare blade, a good pie, a potion you have not needed yet.', 'system'); return false; }
        const worth = item => Math.max(1, Number(item.value) || Number(item.damage) || 10);
        if (!query) {
            const rows = bag.slice().sort((a, b) => worth(b) - worth(a)).slice(0, 6).map(i => `${i.name} (worth ${worth(i)} rupees)`);
            say(this, `Crier Bell’s gift exchange. He takes a gift and answers with a parcel, and the parcel is always a little less than the gift, because a gift that pays is a trade. Worth offering: ${rows.join('; ')}. Say "gift exchange <item>".`, 'location');
            return false;
        }
        const q = String(query).trim().toLowerCase();
        const item = bag.find(i => String(i.name || '').toLowerCase().includes(q) || String(i.id || '').toLowerCase().includes(q));
        if (!item) { say(this, `You carry no ${q}. Say "gift exchange" to see what you have that is worth giving.`, 'system'); return false; }
        const value = worth(item);
        const parcels = w.GiftShop?.presents || [];
        const tier = value >= 200 ? parcels.find(p => p.id === 'grand_present')
            : value >= 90 ? parcels.find(p => p.id === 'ribboned_gift')
                : value >= 45 ? parcels.find(p => p.id === 'wrapped_parcel') : null;
        item.quantity -= 1;
        if (item.quantity <= 0) (this.state.inventory || []).splice(this.state.inventory.indexOf(item), 1);
        if (!tier) {
            say(this, `Crier Bell turns the ${item.name} over in his hands and smiles. “Kind, but small. Keep the paper for somebody who needs it — take a light in the tree instead.” The tree of lights takes another light, and the square gives you a warm word and nothing else.`, 'npc');
            sfx('pickup');
            saveState(this);
            return true;
        }
        this.addItemToInventory(tier.id, { ...w.WorldData.items[tier.id] });
        say(this, `Crier Bell accepts the ${item.name} and gives you a ${tier.name} in return. It is a little less than what you gave — that is the rule of the exchange, and he says so plainly. Say "open gift" to unwrap it.`, 'item');
        sfx('coin');
        saveState(this);
        return true;
    };

    /* -------------------------------------------------------------- bounty */

    const frosty = name => /frost|prowler|ice troll|warg/i.test(String(name || ''));

    function bountyToday(game) {
        const s = stateOf(game), today = dateKey();
        if (s.bounty.date !== today) s.bounty = { date: today, kills: 0, claimed: false };
        return s.bounty;
    }

    Game.bountyBoard = function () {
        if (!festival()) { say(this, 'The frost-prowler board is taken down outside the Christmas season. In December it stands beside the market square.', 'system'); return false; }
        const b = bountyToday(this);
        const left = Math.max(0, BOUNTY_TARGET - b.kills);
        say(this, `The frost-prowler board, kept by Crier Bell and nailed up on the square. Tonight’s bounty is the same for every hero who reads it: drive off ${BOUNTY_TARGET} frost wargs, frost prowlers or ice trolls. They walk the northern mountains, Moonwood and the Christmas streets. Marked so far tonight: ${b.kills} of ${BOUNTY_TARGET}. ${b.claimed ? 'The board has already paid you for tonight and is blank until tomorrow.' : left ? `Say "claim bounty" once ${left} more fall.` : 'It is finished; say "claim bounty" to be paid.'} The payment is ${BOUNTY_DIAMONDS} diamonds and a purse of coin, and it is written on the board so nobody is paid differently.`, 'location');
        return b;
    };

    Game.claimBounty = function () {
        if (!festival()) { say(this, 'The board is not up outside the Christmas season.', 'system'); return false; }
        if (!atCrier(this)) { say(this, 'The board stands on Kaliwasch Market Square. Walk there to claim, so the crier can see the marks himself.', 'system'); return false; }
        const b = bountyToday(this), p = this.state.player;
        if (b.claimed) { say(this, 'You have already been paid for tonight’s bounty. The board is blank until tomorrow.', 'system'); return false; }
        if (b.kills < BOUNTY_TARGET) {
            say(this, `The board is not finished: ${b.kills} of ${BOUNTY_TARGET} marked. Frost wargs walk the northern mountains and Moonwood, and the frost prowlers come out in Christmas City.`, 'system');
            sfx('board-error');
            return false;
        }
        b.claimed = true;
        if (p) { p.diamonds = (p.diamonds || 0) + BOUNTY_DIAMONDS; p.gold = (p.gold || 0) + 60; }
        say(this, `Crier Bell reads the board twice, then pays it: ${BOUNTY_DIAMONDS} diamonds and a purse of coin. He writes the same payment on the board for the next hero to read. You carry ${p?.diamonds || 0} diamonds.`, 'treasure');
        sfx('levelup');
        this.updateHUD?.();
        saveState(this);
        return true;
    };

    // Only real defeats count, and only while the board is up.
    const oldDefeated = G.enemyDefeated;
    if (typeof oldDefeated === 'function') {
        G.enemyDefeated = function (...args) {
            const name = this.state.enemy?.name;
            const result = oldDefeated.apply(this, args);
            if (festival() && frosty(name)) {
                const b = bountyToday(this);
                if (!b.claimed) {
                    b.kills += 1;
                    if (b.kills === BOUNTY_TARGET) say(this, `The frost-prowler board is finished for tonight. Say "claim bounty" on the market square.`, 'quest');
                    else if (b.kills < BOUNTY_TARGET) say(this, `The frost-prowler board marks ${b.kills} of ${BOUNTY_TARGET}.`, 'quest');
                    saveState(this);
                }
            }
            return result;
        };
    }

    /* --------------------------------------------------------- tree of lights */

    Game.treeOfLights = function () {
        const s = stateOf(this);
        const doors = doorsFinished(this), candles = Object.keys(s.candles).length, carols = Object.keys(s.carols).length;
        say(this, `The tree of lights on Kaliwasch Market Square. Its lanterns are hung by heroes, not by the city: ${doors} from Christmas doors finished, ${candles} from candles lit, ${carols} from carols sung — ${doors + candles + carols} lights in all, beside the twenty-four the square itself keeps. The tree gives nothing back but light, on purpose: no prize hangs on it, so nobody can be behind.`, 'location');
    };

    /* ---------------------------------------------------------------- wiring */

    const oldContext = G.updateContextActions;
    if (typeof oldContext === 'function') {
        G.updateContextActions = function () {
            oldContext.call(this);
            const box = document.getElementById('context-actions');
            if (!box || !atCrier(this) || !festival()) return;
            const buttons = [];
            if (twelfthNight()) buttons.push('<button onclick="Game.lightCandle()">Light Candle</button>');
            buttons.push('<button onclick="Game.singCarol()">Carols</button>');
            buttons.push('<button onclick="Game.giftExchange()">Gift Exchange</button>');
            buttons.push('<button onclick="Game.bountyBoard()">Bounty Board</button>');
            buttons.push('<button onclick="Game.treeOfLights()">Tree of Lights</button>');
            box.insertAdjacentHTML('beforeend', buttons.join(''));
        };
    }

    // The square and the tavern say what the season holds once a night, not on
    // every step through the market.
    const oldEnter = G.enterLocation;
    if (typeof oldEnter === 'function') {
        G.enterLocation = function (id, visited) {
            const result = oldEnter.call(this, id, visited);
            if (festival() && (id === market || id === tavern)) {
                const s = stateOf(this), tonight = dateKey();
                if (s.seenSeason !== tonight) {
                    s.seenSeason = tonight;
                    const bits = [];
                    if (twelfthNight()) bits.push(`${Object.keys(s.candles).length} of six candles burn on the square`);
                    bits.push(`${Object.keys(s.carols).length} of six carol verses are sung`);
                    say(this, twelfthNight()
                        ? `Twelfth Night is kept on the square: ${bits.join(', ')}. Crier Bell has the candles, the carols, the gift exchange and the frost-prowler board.`
                        : `The Christmas season is kept on the square: ${bits.join(', ')}. Crier Bell has the carols, the gift exchange and the frost-prowler board, and his candles wait for the six nights after Christmas.`, 'system');
                }
            }
            return result;
        };
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'candles' || text === 'candle row' || text === 'twelfth night' || text === 'twelfthnight') { this.candleRow(); return; }
        if (text === 'light candle' || text === 'light a candle' || text === 'light the candle') { this.lightCandle(); return; }
        if (text === 'carol' || text === 'sing carol' || text === 'christmas carol') { this.singCarol(); return; }
        if (text === 'carols' || text === 'carol verses' || text === 'carol list') { this.carols(); return; }
        if (text === 'gift exchange' || text === 'exchange gift') { this.giftExchange(); return; }
        if (text.startsWith('gift exchange ') || text.startsWith('exchange gift ')) { this.giftExchange(text.replace(/^(gift exchange|exchange gift) /, '')); return; }
        if (text === 'bounty' || text === 'bounty board' || text === 'frost prowler bounty') { this.bountyBoard(); return; }
        if (text === 'claim bounty' || text === 'take bounty') { this.claimBounty(); return; }
        if (text === 'tree of lights' || text === 'lights' || text === 'tree lights') { this.treeOfLights(); return; }
        oldCommand.call(this, raw);
    };

    // The festival state travels with the hero, like housing and the advent journal.
    const oldSave = G.getSaveData.bind(G);
    G.getSaveData = function () { return { ...oldSave(), twelfthNight: stateOf(this) }; };
    const oldContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.twelfthNight = Object.assign(defaults(), data?.twelfthNight || {});
    };

    if (!w.WorldData.items[CAROLLER_CLOAK.id]) w.WorldData.items[CAROLLER_CLOAK.id] = { ...CAROLLER_CLOAK };

    w.TwelfthNight = {
        nights: NIGHTS, carols: CAROLS, candleLines: CANDLE_LINES, twelfthNight, christmas, festival,
        stateOf, lightsOf, bountyToday, bountyTarget: BOUNTY_TARGET, bountyDiamonds: BOUNTY_DIAMONDS, cloak: CAROLLER_CLOAK
    };
})();
