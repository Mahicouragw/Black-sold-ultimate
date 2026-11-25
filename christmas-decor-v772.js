/**
 * 7.72.0 — The Christmas tree's daily dressing.
 *
 * The Grand Christmas Tree on the Christmas map asks for a particular dressing
 * each night of the season: thirty tree balls, a run of lights whose length
 * changes with the date, garland and bells. Every piece is a real item bought
 * from the rune shop, every piece placed into the tree is spent from the bag,
 * and the tree rings a recorded bell each time something is hung on it. When
 * the night's dressing is finished the tree answers with a recorded fanfare and
 * a present.
 *
 * The list is worked out from the date, so the whole world is asked for the
 * same tree on the same night, and a night that is missed cannot be claimed
 * twice afterwards.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const TREE = 'starlight_city_4_2';        // the Grand Christmas Tree
    const MARKET = 'kaliwasch';

    const DECOR = [
        {
            key: 'balls', id: 'christmas_tree_ball', name: 'Christmas Tree Ball', price: 2,
            desc: 'A thin glass ball, red on one side and gold on the other, with a loop of thread at the top. Held to the light it throws a small warm circle onto the wall.'
        },
        {
            key: 'lights', id: 'christmas_lights', name: 'Christmas Lights', price: 3,
            desc: 'A length of fine wire strung with tiny glass bulbs, wound on a wooden spool. The bulbs are cold until they are hung, and then they are not.'
        },
        {
            key: 'garland', id: 'christmas_garland', name: 'Christmas Garland', price: 3,
            desc: 'A braid of dark green fir, dried orange and a red thread that holds it all together. It smells of the wood it was cut from, and of the kitchen it was dried in.'
        },
        {
            key: 'bells', id: 'christmas_bell', name: 'Christmas Bell', price: 5,
            desc: 'A small brass bell with a leather thong. It has a clear note and no manners: it rings when the branch moves, and the branch always moves.'
        }
    ];
    const byId = new Map(DECOR.map(item => [item.id, item]));
    const byKey = new Map(DECOR.map(item => [item.key, item]));

    for (const item of DECOR) {
        w.WorldData.items[item.id] = {
            id: item.id, name: item.name, type: 'decoration', decoration: item.key, value: item.price,
            desc: item.desc, ability: 'Hang it on the Grand Christmas Tree when the tree asks for it.'
        };
    }
    // One shop, one counter: the same rune shop sells the tree's dressing.
    if (w.SignShop?.register) {
        w.SignShop.register(DECOR.map(item => ({ id: item.id, price: item.price, currency: 'rupees', section: 'Christmas decorations' })));
    }

    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    const sfx = name => w.MusicSystem?.playSFX?.(name);

    function parts(date = new Date()) {
        const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const map = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
        return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
    }
    const dateKey = (t = parts()) => `${t.y}-${t.m}-${t.d}`;
    const season = (date = new Date()) => w.SeasonalEvents.activeEvents(date).some(event => event.id === 'christmas');

    const defaults = () => ({ date: '', placed: {}, done: false, nights: 0, total: 0 });
    const stateOf = game => {
        const current = game.state.christmasTree;
        if (current && typeof current === 'object' && current.placed && typeof current.placed === 'object') return current;
        const next = Object.assign(defaults(), current || {});
        next.placed = Object.assign({}, next.placed || {});
        game.state.christmasTree = next;
        return next;
    };
    const plural = (name, count) => (count === 1 || /s$/i.test(name) ? name : `${name}s`);

    /**
     * Tonight's dressing. The lights run in a three-night rhythm — ten, twenty,
     * fifty — so the tree is never dressed the same way twice in a row.
     */
    function tonight(date = new Date()) {
        const t = parts(date);
        const rhythm = (t.y * 100 + t.d) % 3;
        return {
            key: dateKey(t),
            need: { balls: 30, lights: [10, 20, 50][rhythm], garland: 10, bells: 5 }
        };
    }

    const bagCount = (game, id) => (game.state.inventory || []).filter(i => i.id === id).reduce((n, i) => n + (i.quantity || 0), 0);
    const placedTonight = (game, key) => {
        const s = stateOf(game), list = tonight();
        return s.date === list.key ? (s.placed[key] || 0) : 0;
    };
    const remaining = (game, key) => Math.max(0, tonight().need[key] - placedTonight(game, key));
    const complete = game => DECOR.every(item => remaining(game, item.key) === 0);

    const listText = game => DECOR
        .map(item => `${tonight().need[item.key]} ${plural(item.name.toLowerCase(), tonight().need[item.key])} (${Math.min(remaining(game, item.key), 99)} still to hang)`)
        .join(', ');

    Game.christmasTreeStatus = function () {
        const t = parts();
        if (!season()) {
            say(this, 'The Grand Christmas Tree stands on the Christmas map only while the fair is open, from the first of December to the twenty-fifth.', 'location');
            return;
        }
        const s = stateOf(this), list = tonight();
        if (s.date !== list.key) { s.date = list.key; s.placed = {}; s.done = false; }
        const hung = DECOR.reduce((n, item) => n + placedTonight(this, item.key), 0);
        say(this, `The Grand Christmas Tree, December ${t.d}. Tonight it asks for ${listText(this)}. You have hung ${hung} pieces on it tonight${s.done ? ', and it is finished and shining' : ''}. It is dressed in the same pattern for every hero in the world tonight, and a finished tree stays decorated until the next night asks for its own dressing. Say "use christmas tree" at the tree to hang what you carry.`, 'location');
    };

    function reward(game) {
        const s = stateOf(game), p = game.state.player;
        s.done = true;
        s.nights = (s.nights || 0) + 1;
        s.total = (s.total || 0) + 1;
        sfx('game-win');
        if (p) {
            p.diamonds = (p.diamonds || 0) + 2;
            for (const id of ['gingerbread', 'spiced_cider']) {
                const treat = w.WorldData.items?.[id];
                if (treat) game.addItemToInventory(id, { ...treat });
            }
        }
        game.addNarrative(`The last piece goes up and the whole tree answers at once: every bulb wakes, the bells find one note between them, and the square is suddenly much brighter than it was. A gingerbread man and a cup of hot cider are tucked among the branches, still warm, and two diamonds with them. The tree is finished for tonight.`, 'treasure');
        game.updateHUD?.();
        game.save?.();
    }

    /**
     * Hang what the hero carries, one kind at a time. Every piece taken from the
     * bag rings the recorded bell, and the fanfare belongs to the finished tree.
     */
    Game.placeChristmasDecoration = function (kind, quantity) {
        const item = byKey.get(String(kind || '').toLowerCase());
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.'); return false; }
        if (!item) { say(this, 'The tree takes tree balls, lights, garland and bells. Say "use christmas tree" to see what it asks for tonight.', 'system'); return false; }
        if (!season()) { say(this, 'The Grand Christmas Tree is not here outside the Christmas fair.', 'system'); return false; }
        if (this.state.location !== TREE) { say(this, 'The Grand Christmas Tree stands on the top row of the Christmas map, west of the Star Observatory. Walk to it and say "use christmas tree".', 'system'); return false; }
        const s = stateOf(this), list = tonight();
        if (s.date !== list.key) { s.date = list.key; s.placed = {}; s.done = false; }
        if (s.done) { say(this, 'The tree is already finished for tonight. It will ask for a different dressing tomorrow.', 'system'); return false; }
        const wanted = remaining(this, item.key);
        if (wanted <= 0) { say(this, `The tree has all the ${plural(item.name.toLowerCase(), tonight().need[item.key])} it asked for tonight. The rest stay in your bag for another night.`, 'system'); return false; }
        const held = bagCount(this, item.id);
        if (held <= 0) {
            say(this, `You carry no ${item.name.toLowerCase()}. The rune shop sells them; on the Christmas map that is the stall on Starlight Bell Court.`, 'system');
            sfx('board-error');
            return false;
        }
        const placed = Math.max(1, Math.min(Number(quantity) || 1, wanted, held));
        let left = placed;
        this.state.inventory = (this.state.inventory || []).filter(stack => {
            if (left <= 0 || stack.id !== item.id) return true;
            const take = Math.min(left, stack.quantity || 0);
            stack.quantity -= take; left -= take;
            return (stack.quantity || 0) > 0;
        });
        s.placed[item.key] = (s.placed[item.key] || 0) + placed;
        s.total = (s.total || 0) + placed;
        // The recorded belltree chime is the sound of something being hung.
        sfx('ladder-up');
        say(this, `You hang ${placed} ${plural(item.name.toLowerCase(), placed)} on the Grand Christmas Tree. ${remaining(this, item.key) ? `${remaining(this, item.key)} still to hang tonight.` : 'That is all of that kind the tree wanted.'}`, 'item');
        if (complete(this)) reward(this);
        else { this.updateHUD?.(); this.save?.(); }
        return true;
    };

    /** The tree's own action: hang one of everything it still wants. */
    Game.useChristmasTree = function () {
        if (!season()) { say(this, 'The Grand Christmas Tree is not here outside the Christmas fair.', 'system'); return false; }
        if (this.state.location !== TREE) { say(this, 'The Grand Christmas Tree stands on the top row of the Christmas map. Walk to it and say "use christmas tree".', 'system'); return false; }
        const s = stateOf(this), list = tonight();
        if (s.date !== list.key) { s.date = list.key; s.placed = {}; s.done = false; }
        if (s.done) { say(this, 'The tree is finished for tonight. Tomorrow it will ask for a different dressing.', 'system'); return false; }
        const work = DECOR.filter(item => remaining(this, item.key) > 0 && bagCount(this, item.id) > 0);
        if (!work.length) {
            const held = DECOR.filter(item => bagCount(this, item.id) > 0).map(item => item.name);
            say(this, held.length
                ? `Nothing you carry is what the tree still wants. Tonight it asks for ${listText(this)}.`
                : `You carry no decorations. Tonight the tree asks for ${listText(this)}; the rune shop sells every piece.`, 'system');
            return false;
        }
        for (const item of work) this.placeChristmasDecoration(item.key, remaining(this, item.key));
        return true;
    };

    /* ──────────────────────────────── wiring ──────────────────────────────── */

    const oldContext = G.updateContextActions;
    if (typeof oldContext === 'function') {
        G.updateContextActions = function () {
            oldContext.call(this);
            const box = document.getElementById('context-actions');
            if (!box || this.state.location !== TREE || !season()) return;
            const buttons = ['<button onclick="Game.useChristmasTree()">Use Christmas Tree</button>',
                '<button onclick="Game.christmasTreeStatus()">Tonight’s Dressing</button>'];
            for (const item of DECOR) {
                const held = bagCount(this, item.id);
                if (held > 0) buttons.push(`<button onclick="Game.placeChristmasDecoration('${item.key}')">Hang ${this.escapeHTML(item.name)} (${held})</button>`);
            }
            box.insertAdjacentHTML('beforeend', buttons.join(''));
        };
    }

    // The tree says what it wants before a hero has to ask a shopkeeper.
    const oldEnter = G.enterLocation;
    if (typeof oldEnter === 'function') {
        G.enterLocation = function (id, visited) {
            const result = oldEnter.call(this, id, visited);
            if (id === TREE && season() && this.state.player) {
                const s = stateOf(this), list = tonight();
                if (s.date !== list.key) { s.date = list.key; s.placed = {}; s.done = false; }
                say(this, s.done
                    ? 'The Grand Christmas Tree is dressed and shining. It will ask for a different dressing tomorrow night.'
                    : `The Grand Christmas Tree waits with bare branches. Tonight it asks for ${listText(this)}. Say "use christmas tree" to hang what you carry, or "rune shop" on Starlight Bell Court to buy more.`, 'system');
            }
            return result;
        };
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'christmas tree' || text === 'tree' || text === 'christmas tree task' || text === 'tree task' || text === 'tonight’s dressing' || text === "tonight's dressing") { this.christmasTreeStatus(); return; }
        if (text === 'use christmas tree' || text === 'decorate the tree' || text === 'dress the tree' || text === 'hang decorations') { this.useChristmasTree(); return; }
        let m = /^(?:hang|place) (.+)$/.exec(text);
        if (m) {
            const words = m[1].trim();
            const item = DECOR.find(entry => words.includes(entry.key) || words.includes(entry.name.toLowerCase()) || entry.name.toLowerCase().includes(words));
            if (item) { this.placeChristmasDecoration(item.key); return; }
            if (/decorations?|everything|all/.test(words)) { this.useChristmasTree(); return; }
        }
        // The Christmas map and its quest list the tree's dressing too, so the
        // task is never hidden behind a command nobody knows.
        if (text === 'christmas quest' || text === 'christmas map') {
            oldCommand.call(this, raw);
            if (season()) this.christmasTreeStatus();
            return;
        }
        oldCommand.call(this, raw);
    };

    // The dressing travels with the hero.
    const oldGet = G.getSaveData.bind(G);
    G.getSaveData = function () { return { ...oldGet(), christmasTree: stateOf(this) }; };
    const oldContinue = G.continueGame.bind(G);
    G.continueGame = function () {
        let data;
        try { const roster = this.getRoster(); data = roster.heroes[roster.activeHeroId] || JSON.parse(localStorage.getItem(this.state.saveKey)); } catch { }
        oldContinue.call(this);
        this.state.christmasTree = Object.assign(defaults(), data?.christmasTree || {});
    };

    w.ChristmasTree = {
        tree: TREE, decor: DECOR, byKey, byId, tonight, remaining, complete, stateOf, season, market: MARKET
    };
})();
