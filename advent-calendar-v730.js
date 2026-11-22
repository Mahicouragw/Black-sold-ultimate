// Twenty-five date-locked Christmas doors on two real streets, each with a
// recorded storyteller, a small quest, a secret word and a present. Nothing
// here invents its own combat, economy or save system: rooms live in WorldData,
// gifts go through the shipped inventory, and every rule is checked again on
// entry so a spell, a route or a resumed tab cannot open a door early.
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const market = 'kaliwasch';
    const lobby = 'starlight_city_1_2';
    const stall = 'starlight_candy_stall', toyVault = 'starlight_toy_vault', clockVault = 'starlight_clock_vault';
    const gate = 'starlight_advent_gate';
    const lane = 'starlight_candy_cane_lane';
    const row = n => `starlight_advent_row_${n}`;
    const inside = n => `starlight_advent_room_${n}`;
    const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // One entry per door. The story is the exact text of the recorded voice
    // clip, so a reader who cannot hear the audio gets the same words.
    const DAYS = [
        { n: 1, keeper: 'Keeper Maren', title: 'The Candle in the Window', music: 'CHRISTMAS',
          story: 'On the first night of winter, Keeper Maren set one candle in the window of the first door, and every traveller on the frozen road could see it. She promised that whoever knocked here would carry that light all year. The candle is still warm. Say christmas search beside it, and keep my secret word: candlewick.',
          secret: 'candlewick', task: { type: 'search', verb: 'light the first candle' } },
        { n: 2, keeper: 'Baker Tomas', title: 'The Gingerbread Key', music: 'CHRISTMAS',
          story: 'Baker Tomas locked his shop with a key of gingerbread, because a key you can eat can never be stolen. He swore the oven remembers every wish whispered into the dough. Tonight the oven is warm again. Say cook to bake with me, and remember the secret word: cinnamon.',
          secret: 'cinnamon', task: { type: 'cook', verb: 'cook one dish' } },
        { n: 3, keeper: 'Fisherwoman Rhea', title: 'The Singing Ice', music: 'CHRISTMAS',
          story: 'Rhea cut her fishing hole by lantern light and swore the fish came up singing. She kept one silver scale in her pocket for luck and gave it to the first child who asked. Say fish at any ice hole, and keep the secret word: silver scale.',
          secret: 'silver scale', task: { type: 'fish', verb: 'land one fish' } },
        { n: 4, keeper: 'Watchman Corvin', title: 'The Brass Lantern', music: 'CHRISTMAS',
          story: 'Watchman Corvin paced this street for forty winters with a brass lantern and a bent key. He met the frost prowlers with a broom and a very loud voice. Tonight the prowlers are back. Say christmas fight, and remember the secret word: lantern.',
          secret: 'lantern', task: { type: 'battle', verb: 'drive off a frost prowler' } },
        { n: 5, keeper: 'Herbalist Nissa', title: 'Mistletoe Above the Door', music: 'CHRISTMAS',
          story: 'Nissa hung mistletoe above every door because, she said, a doorway that has been kissed cannot freeze. She pressed her last sprig into a book and left it for a stranger. Search the little room, and the secret word is: mistletoe.',
          secret: 'mistletoe', task: { type: 'search', verb: 'find the pressed sprig' } },
        { n: 6, keeper: 'Bellringer Ines', title: 'The Frozen Bell', music: 'CHRISTMAS',
          story: 'Ines rang the frozen bell with a stone wrapped in wool, and the note travelled further than any sermon. People came from three valleys to hear it, then stayed to sing. Say christmas sing, and the secret word is: echo.',
          secret: 'echo', task: { type: 'sing', verb: 'sing with the bell' } },
        { n: 7, keeper: 'Cooper Bram', title: 'A Promise with Hoops', music: 'CHRISTMAS',
          story: 'Bram built barrels that held cider, rain water, and once, memorably, a very angry goose. He said a good barrel is a promise with hoops on. Search his workshop, and the secret word is: hoop.',
          secret: 'hoop', task: { type: 'search', verb: 'find the goose barrel' } },
        { n: 8, keeper: 'Weaver Ysolde', title: 'The Long Scarf', music: 'CHRISTMAS',
          story: 'Ysolde wove scarves long enough to wrap a whole family, then gave them away and started again. Her loom still clicks at night, finishing someone else’s winter. Search the loom, and the secret word is: thread.',
          secret: 'thread', task: { type: 'search', verb: 'take the finished scarf' } },
        { n: 9, keeper: 'Lamplighter Pek', title: 'The Ladder and the Dark', music: 'CHRISTMAS',
          story: 'Pek was only nine when he took the lamplighter’s ladder, and he lit every lamp on this street before supper. He said the dark is only a room where nobody has lit the lamp yet. Search for his matches, and the secret word is: ladder.',
          secret: 'ladder', task: { type: 'search', verb: 'light the street lantern' } },
        { n: 10, keeper: 'Star-gazer Cassia', title: 'The Comet Chart', music: 'CHRISTMAS',
          story: 'Cassia charted a comet that returns once in eighty years and named it after her grandmother. She pinned the chart to this wall with one star circled in red. Search the observatory, and the secret word is: comet.',
          secret: 'comet', task: { type: 'search', verb: 'find the circled chart' } },
        { n: 11, keeper: 'Toymaker Fenn', title: 'The Wooden Horse', music: 'CHRISTMAS',
          story: 'Fenn carved a wooden horse with a mane of real hair, and the child who took it home is a grandparent now. He never sold a toy; he only chose the child. Search his bench, and the secret word is: wooden horse.',
          secret: 'wooden horse', task: { type: 'search', verb: 'finish the carved horse' } },
        { n: 12, keeper: 'Clockkeeper Ilse', title: 'One Brass Key', music: 'CHRISTMAS',
          story: 'Ilse wound every clock on this street with one brass key, and when the frost stopped them she wound them with her hands. There are twelve chimes in her counting room. Search for the key, and the secret word is: twelve.',
          secret: 'twelve', task: { type: 'search', verb: 'wind the counting clock' } },
        { n: 13, keeper: 'Reindeer herder Auno', title: 'Moss and Neighbours', music: 'CHRISTMAS',
          story: 'Auno fed his reindeer moss from a leather pouch and talked to them like neighbours. They followed him through blizzards because he never once lied to them. Search for the pouch, and the secret word is: moss.',
          secret: 'moss', task: { type: 'search', verb: 'feed the reindeer' } },
        { n: 14, keeper: 'Choir mistress Bela', title: 'Forty First Notes', music: 'CHRISTMAS',
          story: 'Bela taught forty children to sing one note perfectly, then let them find the rest themselves. The choir still meets here at dusk, though the children are grey now. Say christmas sing, and the secret word is: harmony.',
          secret: 'harmony', task: { type: 'sing', verb: 'join the dusk choir' } },
        { n: 15, keeper: 'Candlemaker Orla', title: 'Little Wax Houses', music: 'CHRISTMAS',
          story: 'Orla poured wax in the shape of small houses, so every window in the city could hold a home. She said light is the cheapest gift that still costs something. Search her moulds, and the secret word is: beeswax.',
          secret: 'beeswax', task: { type: 'search', verb: 'pour a wax house' } },
        { n: 16, keeper: 'Glassblower Miro', title: 'The Ringing Bauble', music: 'CHRISTMAS',
          story: 'Miro blew a bauble so thin it rang like a bell when the wind found it. He made twelve, and every year one more appears on the tree. Search the kiln, and the secret word is: ember.',
          secret: 'ember', task: { type: 'search', verb: 'cool the new bauble' } },
        { n: 17, keeper: 'Pie seller Dorrit', title: 'A Joke for a Pie', music: 'CHRISTMAS',
          story: 'Dorrit sold mince pies from a tray and never counted the coins, only the people. If a child came without money she asked for a joke instead. Say cook and bake one pie with me, and the secret word is: pastry.',
          secret: 'pastry', task: { type: 'cook', verb: 'bake a mince pie' } },
        { n: 18, keeper: 'Woodcutter Halvard', title: 'A Spell of Warmth', music: 'CHRISTMAS',
          story: 'Halvard stacked logs higher than his cottage and still worried about February. He said a warm house is a spell you build with your hands. Search the woodpile, and the secret word is: birch.',
          secret: 'birch', task: { type: 'search', verb: 'stack the birch logs' } },
        { n: 19, keeper: 'Postmistress Sana', title: 'The Loneliest House', music: 'CHRISTMAS',
          story: 'Sana carried letters through the snow on snowshoes and delivered one addressed only to the loneliest house on the hill. Nobody knows who wrote it. Search her mailbag, and the secret word is: postmark.',
          secret: 'postmark', task: { type: 'search', verb: 'sort the last letters' } },
        { n: 20, keeper: 'Painter Luce', title: 'The City on the Wall', music: 'CHRISTMAS',
          story: 'Luce painted the whole city on one wall, then painted herself into it, small, waving from a window. Visitors still look for her. Search the mural, and the secret word is: cobalt.',
          secret: 'cobalt', task: { type: 'search', verb: 'sign the mural' } },
        { n: 21, keeper: 'Beekeeper Ottilie', title: 'Stored Sunlight', music: 'CHRISTMAS',
          story: 'Ottilie kept her bees awake all winter with sugar and stubbornness, and they rewarded her with honey for the feast. She said sweetness is stored sunlight. Search the hives, and the secret word is: honeycomb.',
          secret: 'honeycomb', task: { type: 'search', verb: 'collect the winter honey' } },
        { n: 22, keeper: 'Snow-sculptor Rune', title: 'The Snow Hare', music: 'CHRISTMAS',
          story: 'Rune built a snow hare taller than a man, and it kept its shape until March because he mended it every morning. Say christmas fight to guard it, and the secret word is: snow hare.',
          secret: 'snow hare', task: { type: 'battle', verb: 'guard the snow hare' } },
        { n: 23, keeper: 'Old Wren', title: 'The Story That Changes', music: 'CHRISTMAS',
          story: 'Old Wren told the same story every year, and every year it changed by one small true detail. That, she said, is how a story stays alive. Listen, say christmas sing to answer her, and the secret word is: hearth.',
          secret: 'hearth', task: { type: 'sing', verb: 'answer the old story' } },
        { n: 24, keeper: 'Elsbeth the Keykeeper', title: 'The Bent Key on a Ribbon', music: 'CHRISTMAS',
          story: 'Elsbeth kept her father’s bent key on a ribbon and opened every door on this street for anyone who knocked politely. She never turned away a wet coat. Search the key ring, and the secret word is: ribbon.',
          secret: 'ribbon', task: { type: 'search', verb: 'hang the key ring' } },
        { n: 25, keeper: 'Santa Claus', title: 'The Twenty-Fifth Door', music: 'CHRISTMAS',
          story: 'On the twenty-fifth night, Santa Claus himself stands in the last doorway with a sack that is never quite empty. He remembers every kindness and is a poor forgetter of names. Say christmas present, and the secret word is: sleigh bell.',
          secret: 'sleigh bell', task: { type: 'search', verb: 'help with the last sack' } }
    ];
    const byDay = new Map(DAYS.map(d => [d.n, d]));

    // Presents are real inventory items with real combat value. They are defined
    // here but equipped, sold and dropped by the shipped equipment code.
    const TREASURE = {
        weapons: [
            { id: 'starforged_blade', name: 'Starforged Blade', type: 'weapon', weaponType: 'sword', slot: 'rightHand', damage: 36, str: 4, dex: 2, value: 1800, desc: 'A long sword forged on the coldest night of the year, its fuller packed with silver star-metal. Heavier in the hand than an arming sword and far kinder to its owner.' },
            { id: 'hollybranch_bow', name: 'Hollybranch Bow', type: 'weapon', weaponType: 'bow', slot: 'leftHand', damage: 22, dex: 6, value: 1500, desc: 'A recurved bow cut from a single holly limb, backed with winter sinew. Draws silent and true in falling snow.' },
            { id: 'frostbell_hammer', name: 'Frostbell Hammer', type: 'weapon', weaponType: 'blunt', slot: 'rightHand', damage: 32, str: 6, value: 1600, desc: 'A short war hammer whose head rings one clear note when it strikes. The bell inside is older than the city.' }
        ],
        armour: [
            { id: 'holly_mail', name: 'Holly Mail', type: 'armor', slot: 'chest', defense: 16, hp: 12, value: 1500, desc: 'Riveted winter mail with holly leaves worked into the shoulder plates. Warm where plate would freeze.' },
            { id: 'frostward_helm', name: 'Frostward Helm', type: 'armor', slot: 'head', defense: 9, wis: 2, value: 900, desc: 'A brimmed helm lined with fleece. The visor is cut wide so a lantern still lights the way.' },
            { id: 'midwinter_cloak', name: 'Midwinter Cloak', type: 'armor', slot: 'back', defense: 8, hp: 10, value: 1100, desc: 'A deep blue cloak sewn with a hundred tiny stars. It keeps off frost and most arrows.' }
        ],
        treasures: [
            { id: 'mistletoe_ring', name: 'Mistletoe Ring', type: 'accessory', slot: 'neck', hp: 12, mp: 12, wis: 2, value: 800, desc: 'A silver ring strung on a leather cord, holding one white berry that never falls.' },
            { id: 'santas_star', name: 'Santa’s Star', type: 'accessory', slot: 'neck', hp: 20, str: 1, wis: 2, value: 2000, desc: 'The star from the top of Santa’s own tree, given away once a century to a hero who finished every door.' }
        ]
    };

    const KITCHEN = {
        'winter apples': { name: 'Winter Apples', type: 'food', effect: 'heal', power: 18, value: 12, desc: 'Firm red apples kept cold until the feast. Cook one for a warm dish.' },
        'honey jar': { name: 'Honey Jar', type: 'food', effect: 'heal', power: 22, value: 20, desc: 'Thick winter honey from Ottilie’s hives. Sweetens pies and tea.' },
        'ginger root': { name: 'Ginger Root', type: 'food', effect: 'heal', power: 15, value: 14, desc: 'A knuckled root with a hot bite, the heart of gingerbread.' },
        'flour sack': { name: 'Flour Sack', type: 'food', effect: 'heal', power: 12, value: 10, desc: 'Milled winter wheat. Bread, pastry and dumplings all begin here.' },
        'christmas cooking scroll': { name: 'Christmas Cooking Scroll', type: 'scroll', value: 60, desc: 'A recipe written on a ribbon-tied scroll, won in battle. Say christmas read scroll to open it: it teaches the kitchen and restocks your ingredients.' }
    };

    const hash = text => {
        let h = 2166136261;
        for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return (h >>> 0);
    };
    const pick = (list, seed) => list[hash(seed) % list.length];

    const festivalOpen = date => w.SeasonalEvents.activeEvents(date).some(e => e.id === 'christmas');
    const today = date => w.SeasonalEvents.parts(date || new Date());
    /** The only rule that opens a numbered door: the real India-time date. */
    const doorOpen = (n, date) => { const t = today(date); return festivalOpen(date) && t.d === n; };
    const doorState = n => {
        const t = today();
        if (!festivalOpen()) return 'closed';
        if (t.d === n) return 'open';
        return t.d > n ? 'past' : 'sealed';
    };

    function journal(game) {
        const p = game?.state?.player;
        if (!p) return null;
        const y = today().y;
        if (p.advent?.year !== y) p.advent = { year: y, heard: {}, secret: {}, done: {}, gift: {} };
        return p.advent;
    }

    let builtKey = '';
    function registerTreasure() {
        const items = w.WorldData.items;
        for (const group of Object.values(TREASURE)) for (const item of group) items[item.id] ||= { ...item };
        for (const [key, item] of Object.entries(KITCHEN)) items[key] ||= { ...item };
    }

    function buildRooms(game) {
        const L = w.WorldData.locations, N = w.WorldData.npcs;
        const gateRoom = {
            id: gate, name: 'Advent Gate', region: 'Christmas City', safe: true, music: 'CHRISTMAS', musicContext: 'CHRISTMAS',
            description: 'Two candy-striped pillars mark the foot of Advent Row. A brass plate reads: one door each night, December the first to the twenty-fifth, and no spell opens a door before its date. North is Advent Row. East is Candy Cane Lane. West returns to Carolers’ Arch.',
            exits: { west: 'starlight_city_0_0', north: row(1), east: lane }, items: [], enemies: [], features: []
        };
        const laneRoom = {
            id: lane, name: 'Candy Cane Lane', region: 'Christmas City', safe: true, music: 'CHRISTMAS', musicContext: 'CHRISTMAS',
            description: 'A curving lane paved with red and white stone, lined with market stalls selling ribbon, oranges and hot sugar. South leads to Ribbon Ice Pond. West returns to Advent Gate.',
            exits: { west: gate, south: 'starlight_pond' }, items: [], enemies: [], features: []
        };
        for (const room of [gateRoom, laneRoom]) if (!L[room.id]) L[room.id] = room;

        // The city edge opens onto the gate, and the pond has a lane entrance too.
        if (L['starlight_city_0_0']) L['starlight_city_0_0'].exits.west = gate;
        if (L['starlight_pond']) L['starlight_pond'].exits.south = lane;

        if (!L[lane]) return false;
        L[lane].description = 'A curving lane paved with red and white stone, lined with stalls selling ribbon, oranges, hot sugar and cooking ingredients. A brass lever juts out beside the toymaker’s shop window. South leads to Ribbon Ice Pond. West returns to Advent Gate. Say christmas buy for the stall, christmas pull lever for the lever.';
        L[lane].exits.east = stall;
        L[stall] ||= { id: stall, name: 'Candy Cane Ingredient Stall', region: 'Christmas City', safe: true, music: 'CHRISTMAS', musicContext: 'CHRISTMAS', exits: { west: lane }, items: [], enemies: [], features: [], description: 'An awning of red and white stripes over baskets of apples, honey, ginger and flour. Say christmas buy for prices, then christmas buy apples, honey, ginger or flour.' };

        if (!L[toyVault]) L[toyVault] = { id: toyVault, name: 'Toymaker’s Hidden Vault', region: 'Christmas City', safe: true, music: 'CHRISTMAS', musicContext: 'CHRISTMAS', exits: { south: lane }, items: [], enemies: [], features: [], description: 'A dry brick room behind the toy shop, smelling of varnish and sawdust. A wooden chest waits under the bench. Say christmas open chest.' };
        if (!L[clockVault]) L[clockVault] = { id: clockVault, name: 'Clock Lobby Strongroom', region: 'Christmas City', safe: true, music: 'CHRISTMAS', musicContext: 'CHRISTMAS', exits: { down: lobby }, items: [], enemies: [], features: [], description: 'A stone strongroom behind the clock face, lit by one green lamp. Two ribbon-tied scrolls and a purse sit on the shelf. Say christmas take scrolls.' };

        for (const day of DAYS) {
            const streetId = row(day.n), roomId = inside(day.n), state = doorState(day.n);
            const doorLine = state === 'open' ? `Door ${day.n} stands open tonight, and warm light spills across the snow.`
                : state === 'past' ? `Door ${day.n} has already had its night; the wreath is faded but the latch still works.`
                : state === 'sealed' ? `Door ${day.n} is sealed with frost and a brass number. It opens only on December the ${day.n}.`
                : `Door ${day.n} waits for December the ${day.n}, when Christmas City opens.`;
            if (!L[streetId]) L[streetId] = {
                id: streetId, name: `Advent Row · Door ${day.n}`, region: 'Christmas City', safe: true,
                music: 'CHRISTMAS', musicContext: 'CHRISTMAS', exits: {
                    south: day.n === 1 ? gate : row(day.n - 1),
                    north: day.n === 25 ? lane : row(day.n + 1)
                }, items: [], enemies: [], features: []
            };
            L[streetId].description = `Advent Row, in front of the door numbered ${day.n}. ${doorLine} ${day.n === 25 ? 'The lane curves away north.' : 'The row continues north and south.'} Say christmas open beside a door whose night has come.`;
            if (!L[roomId]) L[roomId] = {
                id: roomId, name: `${day.title}`, region: 'Christmas City', safe: true, adventDay: day.n,
                music: day.music, musicContext: 'CHRISTMAS', exits: { south: streetId }, items: [], enemies: [], features: []
            };
            L[roomId].description = `Behind door ${day.n}: ${day.title}. ${day.keeper} waits here with a story and a quest. Say christmas story, christmas secret, or christmas present. South steps back out onto Advent Row.`;
            N[roomId] = [{ name: day.keeper, role: 'door keeper', dialog: [day.story] }];
            // The keepers also follow you back out, so People here works on the street.
            N[streetId] = [{ name: day.keeper, role: 'door keeper', dialog: [day.story] }];
        }
        registerTreasure();
        w.ChristmasGames?.build?.();
        return Boolean(L[gate]);
    }

    function say(game, text, type = 'system') { game.addNarrative(text, type); }

    function statusLine(game) {
        const j = journal(game);
        if (!j) return 'Create a hero first.';
        const t = today();
        const done = Object.keys(j.done).length;
        const secrets = Object.keys(j.secret).length;
        return `Christmas doors: ${done} of 25 finished, ${secrets} secret words found. Today is December ${t.d}; only door ${t.d} can open, and it opens by itself at midnight India time. Say christmas doors to hear each door's state, or christmas map for the streets.`;
    }

    function doorsReport(game) {
        const lines = DAYS.map(d => {
            const state = doorState(d.n), j = journal(game) || { done: {}, secret: {} };
            const marks = `${j.done[d.n] ? ' finished' : ''}${j.secret[d.n] ? ' secret found' : ''}`;
            const stateText = state === 'open' ? 'open tonight' : state === 'past' ? 'its night has passed' : state === 'sealed' ? `sealed until December ${d.n}` : 'the city is closed';
            return `Door ${d.n}, ${d.title}: ${stateText}${marks}.`;
        });
        say(game, `Advent Row. ${lines.join(' ')} Every door is opened by the real calendar and by nothing else.`);
    }

    /* ---------------------------------------------------------------- gifts */

    function giftFor(game, day, grade) {
        const hero = game.state.player?.name || 'hero';
        const seed = `${hero}:${today().y}:${day}:${grade}`;
        const j = journal(game);
        const rare = grade >= 2;
        const weapon = pick(TREASURE.weapons, seed + 'w');
        const armour = pick(TREASURE.armour, seed + 'a');
        const treasure = pick(TREASURE.treasures, seed + 't');
        let diamonds = [3, 8, 15, 25][grade] + (hash(seed) % 5);
        const contents = [];
        if (grade >= 3) contents.push(weapon, armour, treasure);
        else if (grade >= 2) contents.push(hash(seed + 'wa') % 2 ? weapon : armour, treasure);
        else if (grade >= 1) contents.push(hash(seed + 'x') % 2 ? treasure : armour);
        else contents.push(treasure);
        // One consumable keeps every present useful even at the lowest grade.
        contents.push({ id: 'cooked winter stew', name: 'Cooked Winter Stew', type: 'food', effect: 'heal', power: 40 + grade * 15, value: 30, desc: 'A clay pot of stew, still hot. Eat it to restore health.' });
        if (rare) diamonds += 5;
        return { diamonds, contents, seed };
    }

    function give(game, gift, label) {
        const p = game.state.player;
        p.diamonds = (p.diamonds || 0) + gift.diamonds;
        for (const item of gift.contents) game.addItemToInventory(item.id, { ...item });
        game.updateHUD?.();
        game.save?.();
        w.MusicSystem?.playSFX('levelup');
        const names = gift.contents.map(i => i.name).join(', ');
        say(game, `${label} You find ${gift.diamonds} diamonds, ${names}, in the wrapping. Type inventory to see them.`, 'treasure');
    }

    function finishQuest(game, day, how) {
        const j = journal(game);
        if (!j || j.done[day.n]) return false;
        j.done[day.n] = Date.now();
        game.save?.();
        w.MusicSystem?.playSFX('pickup');
        say(game, `Quest finished: ${day.task.verb}. ${day.keeper} nods and points at the wrapped parcel. Say christmas present to open it.`, 'quest');
        return true;
    }

    /* -------------------------------------------------------------- stories */

    let clip = null;
    function stopStory() {
        try { clip?.pause(); } catch {}
        clip = null;
        w.AudioManager?.restoreMusic?.('advent-story');
    }
    function playStory(game, day) {
        const A = w.AudioManager;
        const j = journal(game);
        say(game, `${day.keeper}, door ${day.n}, ${day.title}. ${day.story}`, 'npc');
        stopStory();
        // Music stays low, the story sits on top, and the chime marks the start.
        w.MusicSystem?.playSFX('music-transition');
        A?.duckMusic?.(0.3, 'advent-story');
        // Each door keeper reads the story in their own voice. The words spoken
        // are exactly the words printed above, so any story can be heard, and
        // the music lifts again as soon as the reading ends.
        const spoken = w.CharacterVoices?.speak?.(day.keeper, day.story);
        Promise.resolve(spoken).finally(() => A?.restoreMusic?.('advent-story'));
        if (j) { j.heard[day.n] = Date.now(); game.save?.(); }
    }

    /* ---------------------------------------------------------------- rooms */

    function here(game) {
        const id = game.state.location || '';
        const m = /^starlight_advent_room_(\d+)$/.exec(id);
        if (m) return { kind: 'room', day: byDay.get(Number(m[1])) || null, id };
        const s = /^starlight_advent_row_(\d+)$/.exec(id);
        if (s) return { kind: 'row', day: byDay.get(Number(s[1])) || null, id };
        return { kind: id === gate ? 'gate' : id === lane ? 'lane' : 'other', day: null, id };
    }

    function tryEnter(game, target) {
        if (!target?.adventDay) return true;
        if (doorOpen(target.adventDay)) return true;
        const t = today();
        const when = festivalOpen() ? `Only on December ${target.adventDay}. Today is December ${t.d}.` : 'Christmas City is closed until December 1.';
        say(game, `The door will not open. It is sealed to every spell, key and knock. ${when}`, 'system');
        w.MusicSystem?.playSFX('board-error');
        return false;
    }

    /* -------------------------------------------------------------- commands */

    const ACTIONS = new Set(['christmas open', 'christmas story', 'christmas search', 'christmas sing', 'christmas fight', 'christmas present', 'christmas doors', 'christmas map', 'christmas secret', 'christmas buy', 'christmas pull lever', 'christmas use key', 'christmas open chest', 'christmas take scrolls', 'christmas read scroll', 'christmas kitchen']);

    function handle(game, raw) {
        const text = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
        if (!/^christmas /.test(text)) return false;
        // Longest matching action, so "christmas pull lever" is not read as "christmas pull".
        const verb = [...ACTIONS].sort((a, b) => b.length - a.length)
            .find(action => text === action || text.startsWith(action + ' ')) || '';
        const rest = verb ? text.slice(verb.length).trim() : '';
        if (!ACTIONS.has(verb) && !text.startsWith('christmas secret ')) return false;
        if (festivalOpen()) sync(game);
        const where = here(game);
        if (!game.state.player) { say(game, 'Create a hero first.'); return true; }
        if (!festivalOpen() && where.kind !== 'other') { say(game, 'Christmas City opens December 1 and closes after December 25, India time.'); return true; }

        if (verb === 'christmas doors') { doorsReport(game); return true; }
        if (verb === 'christmas kitchen') {
            const bag = game.state.inventory || [];
            const foods = bag.filter(i => i.type === 'food' && i.quantity > 0).map(i => i.name);
            const scrolls = bag.filter(i => i.id === 'christmas cooking scroll').reduce((n, i) => n + i.quantity, 0);
            say(game, `Christmas kitchen. Ingredients in your bag: ${foods.join(', ') || 'none'}. Cooking scrolls: ${scrolls}. Scrolls drop in Christmas City battles, and the Candy Cane stall sells apples, honey, ginger and flour. Say recipes to cook.`);
            return true;
        }
        if (text === 'christmas buy') {
            game.state.location === 'starlight_candy_stall' || game.state.location === lane
                ? say(game, 'The stall sells winter apples for 12 gold, a honey jar for 20, ginger root for 14 and a flour sack for 10. Say christmas buy apples, honey, ginger or flour.')
                : say(game, 'The Candy Cane Ingredient Stall is on Candy Cane Lane, east of Advent Gate.');
            return true;
        }
        if (/^christmas buy (apples|honey|ginger|flour|cooking scroll)$/.test(text)) {
            if (game.state.location !== 'starlight_candy_stall' && game.state.location !== lane) { say(game, 'Buy at the Candy Cane Ingredient Stall, on Candy Cane Lane.'); return true; }
            const choice = text.split(' ').pop();
            const stock = { apples: ['winter apples', 12], honey: ['honey jar', 20], ginger: ['ginger root', 14], flour: ['flour sack', 10], scroll: ['christmas cooking scroll', 40] };
            const [id, price] = stock[choice === 'cooking' ? 'scroll' : choice] || stock.apples;
            if ((game.state.player.gold || 0) < price) { say(game, `You need ${price} gold for that. You have ${game.state.player.gold || 0}.`); return true; }
            game.state.player.gold -= price;
            game.addItemToInventory(id, { ...KITCHEN[id] });
            game.updateHUD?.(); game.save?.();
            w.MusicSystem?.playSFX('coin');
            say(game, `You buy one ${KITCHEN[id].name} for ${price} gold. Say recipes to cook with it.`, 'item');
            return true;
        }
        if (verb === 'christmas read scroll') {
            const bag = game.state.inventory || [];
            const scroll = bag.find(i => i.id === 'christmas cooking scroll' && i.quantity > 0);
            if (!scroll) { say(game, 'You have no Christmas cooking scroll. Win a battle in Christmas City, or buy one at the Candy Cane stall for 40 gold.'); return true; }
            scroll.quantity--;
            if (scroll.quantity <= 0) game.state.inventory = bag.filter(i => i !== scroll);
            const gained = ['winter apples', 'honey jar', 'ginger root', 'flour sack'].sort(() => Math.random() - .5).slice(0, 2);
            for (const id of gained) game.addItemToInventory(id, { ...KITCHEN[id] });
            if (game.state.skills?.cooking) game.state.skills.cooking.xp = (game.state.skills.cooking.xp || 0) + 25;
            game.save?.();
            w.MusicSystem?.playSFX('pickup');
            say(game, `The scroll teaches you the keeper’s recipe: ${gained.map(id => KITCHEN[id].name).join(' and ')}. Cooking experience plus twenty-five. Say recipes to cook.`, 'treasure');
            return true;
        }
        if (verb === 'christmas pull lever') {
            if (game.state.location !== lane) { say(game, 'The brass lever is on Candy Cane Lane, beside the toy shop window.'); return true; }
            const j = journal(game);
            j.lever = true;
            w.WorldData.locations[lane].exits.west = gate;
            w.WorldData.locations[lane].exits.north = 'starlight_toy_vault';
            say(game, 'The lever turns with a heavy clack. A wall panel swings open to the north, into the toymaker’s hidden vault.');
            w.MusicSystem?.playSFX('door');
            game.save?.();
            return true;
        }
        if (verb === 'christmas use key') {
            if (game.state.location !== lobby) { say(game, 'The keyhole is behind the clock in Clockwork Lobby.'); return true; }
            const j = journal(game);
            if (!j.secret[12]) { say(game, 'The keyhole is shaped like a number, and it will not turn. Door twelve holds the number and the secret word: listen to its story, then say christmas secret twelve.'); return true; }
            j.clockKey = true;
            w.WorldData.locations[lobby].exits.up = clockVault;
            say(game, 'The number-shaped keyhole turns and a stone door opens up into the Clock Lobby Strongroom.', 'treasure');
            w.MusicSystem?.playSFX('door');
            game.save?.();
            return true;
        }
        if (verb === 'christmas open chest') {
            if (game.state.location !== 'starlight_toy_vault') { say(game, 'The toy chest is in the hidden vault north of Candy Cane Lane.'); return true; }
            const j = journal(game);
            if (j.toyChest) { say(game, 'The toy chest is empty now.'); return true; }
            j.toyChest = Date.now();
            give(game, giftFor(game, 24, 3), 'The toy chest creaks open.');
            return true;
        }
        if (verb === 'christmas take scrolls') {
            if (game.state.location !== 'starlight_clock_vault') { say(game, 'The strongroom is up from Clockwork Lobby, behind the clock face.'); return true; }
            const j = journal(game);
            if (j.clockScrolls) { say(game, 'The shelf is bare now.'); return true; }
            j.clockScrolls = Date.now();
            game.addItemToInventory('christmas cooking scroll', { ...KITCHEN['christmas cooking scroll'] });
            game.addItemToInventory('christmas cooking scroll', { ...KITCHEN['christmas cooking scroll'] });
            game.state.player.gold = (game.state.player.gold || 0) + 40;
            game.updateHUD?.(); game.save?.();
            w.MusicSystem?.playSFX('coin');
            say(game, 'You take two cooking scrolls and a purse of 40 gold.', 'treasure');
            return true;
        }
        if (verb === 'christmas map') {
            const t = today();
            say(game, `Christmas City streets. Advent Gate connects Carolers’ Arch to Advent Row and Candy Cane Lane; the lane leads to Ribbon Ice Pond. Advent Row runs north from door 1 to door 25, one stoop for each night of December, and ends in the lane. On December ${t.d}, door ${t.d} is the one open door. Say christmas doors for every door's state.`);
            return true;
        }
        if (verb === 'christmas secret') {
            const day = where.day;
            if (!day) { say(game, 'Secret words are given at a door. Stand in a door room and repeat the word from its story.'); return true; }
            if (!doorOpen(day.n)) { say(game, `This door is sealed until December ${day.n}.`); return true; }
            const j = journal(game);
            if (j.secret[day.n]) { say(game, `${day.keeper}: you already gave me "${day.secret}". It still counts.`); return true; }
            if (rest !== day.secret) { say(game, `${day.keeper}: that is not the word. Listen again with christmas story, then say christmas secret followed by the word.`); return true; }
            j.secret[day.n] = Date.now();
            game.state.player.diamonds = (game.state.player.diamonds || 0) + 3;
            game.updateHUD?.(); game.save?.();
            w.MusicSystem?.playSFX('coin');
            say(game, `${day.keeper}: the secret word is right, and the door remembers. Three diamonds for listening well. Your present will be finer because of it.`, 'treasure');
            return true;
        }
        if (verb === 'christmas open') {
            if (!where.day) { say(game, 'Stand on Advent Row, in front of a numbered door, then say christmas open.'); return true; }
            if (where.kind === 'gate') { say(game, 'Walk north onto Advent Row first.'); return true; }
            const n = where.day.n;
            if (where.kind === 'room') { say(game, 'You are already inside this door. Say christmas story, or go south to step back out.'); return true; }
            if (!doorOpen(n)) {
                const t = today();
                say(game, `Door ${n} does not open. Not with Alohomora, not with a key, not with a wish. ${festivalOpen() ? `It opens only on December ${n}, and today is December ${t.d}.` : 'Christmas City opens on December 1.'}`);
                w.MusicSystem?.playSFX('board-error');
                return true;
            }
            game.enterLocation(inside(n));
            w.MusicSystem?.playSFX('door');
            return true;
        }
        const day = where.day;
        if (verb === 'christmas story') {
            if (!day || where.kind !== 'room') { say(game, 'Step inside a door room to hear its keeper.'); return true; }
            if (!doorOpen(day.n)) { say(game, `This door is sealed until December ${day.n}.`); return true; }
            playStory(game, day);
            return true;
        }
        if (verb === 'christmas present') {
            if (!day || where.kind !== 'room') { say(game, 'Presents are handed out inside a door room, after its quest.'); return true; }
            const j = journal(game);
            if (!j.done[day.n]) { say(game, `${day.keeper}: finish the quest first. ${questHint(day)}`); return true; }
            if (j.gift[day.n]) { say(game, 'You already opened this door’s present this year.'); return true; }
            const grade = (j.secret[day.n] ? 2 : 1) + (w.Game.state.player.starCity?.decorated ? 1 : 0);
            j.gift[day.n] = Date.now();
            give(game, giftFor(game, day.n, Math.min(3, grade)), `${day.keeper} hands you a wrapped parcel.`);
            return true;
        }
        if (verb === 'christmas search' || verb === 'christmas sing') {
            if (!day || where.kind !== 'room') { say(game, 'Quests are inside a door room. Stand in the doorway first.'); return true; }
            if (day.task.type !== (verb === 'christmas search' ? 'search' : 'sing')) {
                say(game, `${day.keeper}: ${questHint(day)}`); return true;
            }
            if (verb === 'christmas sing') w.MusicSystem?.playSFX('magic');
            w.MusicSystem?.playSFX('pickup');
            say(game, `${day.keeper} smiles as you ${day.task.verb}.`, 'quest');
            finishQuest(game, day, verb);
            return true;
        }
        if (verb === 'christmas fight') {
            if (!day || where.kind !== 'room') { say(game, 'Only a door room has a guardian to face.'); return true; }
            if (day.task.type !== 'battle') { say(game, `${day.keeper}: ${questHint(day)}`); return true; }
            if (game.state.inCombat) { say(game, 'You are already fighting.'); return true; }
            w.WorldData.enemies['glass-frost prowler'] ||= { ...w.WorldData.enemies['root goblin'], name: 'Glass-frost prowler' };
            game.startCombat('glass-frost prowler');
            return true;
        }
        return false;
    }

    function questHint(day) {
        if (day.task.type === 'cook') return 'Cook one dish. Say recipes to see ingredients, then cook.';
        if (day.task.type === 'fish') return 'Catch one fish. Say fish at any fishing spot.';
        if (day.task.type === 'battle') return 'Say christmas fight and drive the frost prowler off.';
        if (day.task.type === 'sing') return 'Say christmas sing.';
        return 'Say christmas search.';
    }

    /* ---------------------------------------------------------- Santa Claus */

    /** Cooking scrolls and ingredients are won in battle, never conjured. */
    function battleDrop(game) {
        if (!/^starlight_/.test(String(game.state.location)) || !festivalOpen() || Math.random() >= .45) return false;
        const drop = Math.random() < .5 ? 'christmas cooking scroll' : pick(['winter apples', 'honey jar', 'ginger root', 'flour sack'], `${game.state.player?.name}:${Date.now()}`);
        game.addItemToInventory(drop, { ...KITCHEN[drop] });
        say(game, `Among the frost you find a ${KITCHEN[drop].name}. Say christmas kitchen to review your ingredients.`, 'treasure');
        game.save?.();
        return true;
    }

    /** Santa's one present of the year. It is never gold and never daily: the
     *  hero must have finished all twenty-five doors, and only on December 25. */
    function santaGift(game) {
        const j = journal(game);
        const t = today();
        if (t.d !== 25 || !festivalOpen()) {
            say(game, 'Santa’s sleigh is not here yet. He checks the doors on December 25.');
            return { given: false, reason: 'date' };
        }
        const doors = Object.keys(j?.done || {}).length;
        const secrets = Object.keys(j?.secret || {}).length;
        if (j?.santaGift) {
            say(game, 'Santa has already given you this year’s present. He remembers.');
            return { given: false, reason: 'already' };
        }
        if (doors < 25) {
            const missing = DAYS.filter(d => !j.done[d.n]).map(d => d.n);
            w.MusicSystem?.playSFX('board-error');
            say(game, `Santa checks his list twice. ${doors} of 25 doors are finished, so the great present stays in the sack. Still open: ${missing.join(', ')}. He gives nothing daily, and nothing for part of the road.`);
            return { given: false, reason: 'unfinished', doors };
        }
        j.santaGift = Date.now();
        const gift = {
            diamonds: 60 + secrets * 4,
            contents: [
                { ...TREASURE.weapons[0] },
                { ...TREASURE.armour[0] },
                { ...TREASURE.treasures[1] },
                { id: 'cooked winter stew', name: 'Cooked Winter Stew', type: 'food', effect: 'heal', power: 70, value: 30, desc: 'A clay pot of stew, still hot. Eat it to restore health.' }
            ]
        };
        give(game, gift, `Santa Claus sets the sack down and bows. "Every door, hero. All twenty-five. This was made for someone who protects Christmas: take the Starforged Blade, the Holly Mail and my own star."`);
        return { given: true, doors, secrets, gift };
    }

    /* -------------------------------------------------------------- wiring */

    const oldEnter = G.enterLocation;
    G.enterLocation = function (id, visited) {
        if (festivalOpen()) sync(this);
        const target = w.WorldData.locations[id];
        if (target?.adventDay && !doorOpen(target.adventDay)) {
            const t = today();
            say(this, `The door stays shut. ${festivalOpen() ? `Door ${target.adventDay} opens only on December ${target.adventDay}; today is December ${t.d}.` : 'Christmas City opens December 1.'}`, 'system');
            w.MusicSystem?.playSFX('board-error');
            return;
        }
        const result = oldEnter.call(this, id, visited);
        if (id === market && festivalOpen()) {
            const j = journal(this);
            const tree = this.state.player?.starCity?.decorated;
            say(this, tree
                ? 'A tall Christmas tree stands in the market square, its star lit for the city. Crier Bell is calling the news. Say christmas news or say hello to him.'
                : 'A tall Christmas tree stands bare in the market square, waiting for its ball, ribbon and star. Crier Bell is calling the news. Say christmas news or say hello to him.', 'system');
            if (j) this.save?.();
        }
        if (id === market || id === 'kaliwasch_tavern') w.ChristmasCrier?.sync?.(this);
        return result;
    };

    const oldBlock = G.movementBlock;
    G.movementBlock = function (direction) {
        const block = oldBlock.call(this, direction);
        if (block) return block;
        const from = w.WorldData.locations[this.state.location];
        const target = w.WorldData.locations[from?.exits?.[direction]];
        if (target?.adventDay && !doorOpen(target.adventDay)) {
            const t = today();
            const when = festivalOpen() ? `Door ${target.adventDay} opens only on December ${target.adventDay}. Today is December ${t.d}.` : 'Christmas City opens December 1.';
            return { key: 'move.adventLocked', text: `You did not move. ${when} No spell, key or knock opens it early.` };
        }
        return block;
    };

    // Cooking and fishing are finished by the shipped systems, so the hooks
    // measure a real produced dish or caught fish. game-systems-v747 installs
    // its own cooking method after this file loads, hence the retry.
    const cookedCount = game => (game.state.inventory || [])
        .filter(i => /^cooked /i.test(String(i.name)))
        .reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    function hook(method, measure) {
        if (typeof G[method] !== 'function' || G[method].__advent) return false;
        const original = G[method];
        const wrapped = function (...args) {
            const before = measure(this);
            const result = original.apply(this, args);
            const day = here(this).day;
            if (day && measure(this) > before) finishQuest(this, day, method === 'goCooking' ? 'cook' : 'fish');
            return result;
        };
        wrapped.__advent = true;
        G[method] = wrapped;
        return true;
    }
    function installHooks(tries = 60) {
        const need = [];
        if (!hook('goCooking', cookedCount)) need.push('cook');
        if (!hook('fish', game => game.state.fishing?.catches || 0)) need.push('fish');
        if (need.length && tries > 0) setTimeout(() => installHooks(tries - 1), 50);
    }
    installHooks();

    // A frost prowler defeated inside a door room finishes that door's battle quest.
    const oldDefeated = G.enemyDefeated;
    if (typeof oldDefeated === 'function') G.enemyDefeated = function (...args) {
        const day = here(this).day;
        const name = this.state.enemy?.name;
        const result = oldDefeated.apply(this, args);
        if (day?.task.type === 'battle' && /frost|prowler/i.test(String(name))) finishQuest(this, day, 'battle');
        battleDrop(this);
        return result;
    };

    function sync(game, date) {
        const active = festivalOpen(date);
        if (!w.WorldData?.locations[market]) return false;
        if (active) {
            const t = today(date), key = `${t.y}-${t.m}-${t.d}`;
            // Descriptions carry each door's state for today, so they are rebuilt
            // once per date instead of on every step.
            if (key !== builtKey) { buildRooms(game); builtKey = key; }
        }
        const L = w.WorldData.locations;
        // The city street exists only while the season runs, so the map is honest.
        if (!active) {
            if (L['starlight_city_0_0']?.exits?.west === gate) delete L['starlight_city_0_0'].exits.west;
            if (L['starlight_pond']?.exits?.south === lane) delete L['starlight_pond'].exits.south;
            for (const id of Object.keys(L)) if (/^starlight_(advent_|candy_stall|toy_vault|clock_vault|game_hall)/.test(id)) delete L[id];
            return false;
        }
        return true;
    }

    function tick() {
        const game = w.Game;
        if (!game?.state?.player) return;
        const wasOpen = sync(game);
        if (!wasOpen && /^starlight_/.test(String(game.state.location))) {
            if (!game.state.inCombat) { game.enterLocation(market); game.save?.(); }
        }
    }
    const schedule = () => {
        const day = 86400000;
        w.setTimeout(() => { tick(); schedule(); }, day - ((Date.now() + 19800000) % day) + 60);
    };
    // Register the street as soon as the season is genuinely open, so a resumed
    // save that was standing inside a door finds its room again.
    try { if (festivalOpen()) { const t = today(); builtKey = `${t.y}-${t.m}-${t.d}`; buildRooms(); } } catch {}
    // Browsers only: the test DOM has no wall-clock day to wait for.
    if (typeof process === 'undefined') schedule();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    w.AdventCalendar = { sync, handle, days: DAYS, santaGift, battleDrop, doorOpen, doorState, statusLine, stopStory, questHint, finishQuest, giftFor, journal };
})();
