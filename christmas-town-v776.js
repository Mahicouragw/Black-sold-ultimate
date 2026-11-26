/**
 * 7.76.0 — Christmas City, inhabited.
 *
 * The fair had rooms and a tree, but almost nobody in them. This puts a cast of
 * ten people into the city — each one with their own voice, their own trade and
 * something to say that is actually true about the world that day — and gives
 * them work to do that the player can take part in:
 *
 *   1. the cast, by name, in their own rooms, in their own words;
 *   2. the Starlight Herald: one bulletin a day, the same for every hero;
 *   3. food: each of them feeds a hero once a day, in their own way;
 *   4. carols: four carols, verse by verse, sung with the Carolers' Arch;
 *   5. posters: printed sheets pasted to real walls, readable by anyone;
 *   6. a wish at the Grand Christmas Tree, kept and given back later;
 *   7. cocoa at the terrace, sold the ordinary way, for rupees;
 *   8. the chapel bells, rung once a night, answered by the whole square.
 *
 * Nothing here mints diamonds and nothing here says what a present holds. The
 * people talk about the fair the way people do: the doors, the tree, the board,
 * the parcels, the weather.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const CHRISTMAS = new Set(['christmas', 'twelfthnight']);
    const festivalOpen = (date = new Date()) => w.SeasonalEvents.activeEvents(date).some(e => CHRISTMAS.has(e.id));
    const parts = (date = new Date()) => w.SeasonalEvents.parts(date);
    const dayKey = (date = new Date()) => { const p = parts(date); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
    const say = (game, text, type = 'system') => game.addNarrative(text, type);
    /** Item lookup that tolerates the world's spaced keys ("honey cake"). */
    const itemFor = id => w.WorldData.items?.[id] || w.WorldData.items?.[String(id).replace(/_/g, ' ')] || null;
    const itemKey = id => w.WorldData.items?.[id] ? id : String(id).replace(/_/g, ' ');
    const sfx = name => w.MusicSystem?.playSFX?.(name);

    const cityState = game => (game.state.christmasTown && typeof game.state.christmasTown === 'object')
        ? game.state.christmasTown
        : (game.state.christmasTown = { fed: {}, carols: {}, wishes: [], bells: {}, heraldSeen: {} });

    /* ────────────────────────────── the cast ────────────────────────────── */

    /**
     * Ten people. `voice` is not spoken — it is there so every line below can be
     * checked against the person saying it.
     */
    const CAST = [
        {
            place: 'starlight_city_0_0', name: 'Ilse Marrow', role: 'caroler',
            voice: 'Half-sings her sentences and hands out sweets mid-verse.',
            dialog: [
                'Ilse is already three bars into something when you arrive, and she does not stop for you — she only turns so you can hear it better.',
                '“You are late,” she says, delighted, “the arch has been singing to itself since dark.”',
                'She taps the stone under the arch: “Stand here. It is the only place in the city where the echo comes back in tune.”'
            ],
            food: { id: 'sugarplum', line: 'Between verses she presses a sugar plum into your hand and closes your fingers over it.' },
            topics: {
                carols: 'Every evening the arch sings four rounds. Say “carols” to hear what is on tonight, and “sing” to take a verse with us.',
                news: 'The arch hears everything that is said in the square and half of what is muttered in the chapel.',
                food: 'There is always a pocket of sweets in this coat. Ask me tomorrow and there will be another.',
                tree: 'We warm up facing the tree, on the nights it is lit. It makes the high notes easier.',
                gifts: 'Parcels go out from the office behind you, sealed. Nobody here opens them; that would be poor manners.',
                poster: 'The printed sheets are the closest thing this city has to a newspaper that stays still.'
            }
        },
        {
            place: 'starlight_city_0_1', name: 'Tamsin Vey', role: 'postal clerk',
            voice: 'Precise, harried, and secretly delighted by every parcel.',
            dialog: [
                'Tamsin has a parcel under each arm and a pen behind her ear, and she is counting out loud.',
                '“Everything that leaves this counter is tied twice,” she says. “Once for the journey, once for luck.”',
                'She stamps a form, blows on it, and looks at you over the top of it: “Next.”'
            ],
            food: { id: 'chocolate', line: 'She slides a square of chocolate across the counter with the same hand that stamps the forms.' },
            topics: {
                gifts: 'Parcels from the Wrapped Parcel are sealed here before they travel. A present can be sent to another hero — “gift”, then their name — and it arrives tied, closed and unopened.',
                news: 'The Herald comes off the press next door. I read it before anyone, which is the only perk of this counter.',
                carols: 'The carolers post their rounds here every morning. They are always late with them.',
                food: 'Somebody in this city is always eating. It is the only thing that keeps the ink wet.',
                tree: 'The tree gets more post than any person in Christmas City. Nobody signs it.',
                poster: 'Printed at the yard, pasted by the watch. Read the wall, not the rumour.'
            }
        },
        {
            place: 'starlight_city_0_3', name: 'Old Wick', role: 'toymaker',
            voice: 'Slow, dry, and always half a joke behind the words.',
            dialog: [
                'Old Wick is painting a wooden horse the colour of a bad sunset and does not look up.',
                '“Everything on that shelf took a winter to make,” he says. “Nothing on it is for sale.”',
                'He turns the horse over, finds a rough patch, and sighs at it like an old friend.'
            ],
            food: { id: 'roasted_chestnut', line: 'He pushes a paper twist of roasted chestnuts at you without ceremony. “They are going cold.”' },
            topics: {
                gifts: 'A present is a promise with paper over it. The counter on the square keeps that promise, and no card says what it promised.',
                food: 'Chestnuts, mostly. There is a brazier at the corner and I am the only one patient enough to use it.',
                news: 'Nothing that happens here is new. That is the comfort of it.',
                carols: 'The arch sings the old ones. I made the bell they ring at the chapel, so I am allowed to be fond of it.',
                tree: 'Glass on a fir tree, and everyone surprised when it falls. Say nothing. Let them have it.',
                poster: 'The yard prints them. Doran has opinions about ink.'
            }
        },
        {
            place: 'starlight_city_0_4', name: 'Bram Kettle', role: 'cocoa seller',
            voice: 'Warm, loud, and permanently dusted with cocoa.',
            dialog: [
                'Bram is stirring a pot big enough to sit in, and steam is going everywhere.',
                '“No, no, no — you stir it like you mean it,” he says, to the pot rather than to you.',
                'He wipes his hands on his apron, which makes them worse, and grins.'
            ],
            food: { id: 'cocoa_cup', line: 'A clay cup of cocoa appears in front of you before you ask, thick enough to stand a spoon in.' },
            topics: {
                food: 'Six rupees for a cup, any hour the terrace is open. Say “buy cocoa”. A cup is food and medicine both — ask anyone who has walked the north road.',
                news: 'Cold in the morning, colder at the watch, and warm here. That is the whole forecast.',
                carols: 'The carolers drink here first and sing second. I have opinions about that order.',
                gifts: 'The parcel office is next door. They will not tell you what is in the box and neither will I.',
                tree: 'On a lit night the whole terrace smells of fir. It gets in the cocoa. Nobody complains.',
                poster: 'If the ink runs, blame the steam. It is always the steam.'
            }
        },
        {
            place: 'starlight_city_1_0', name: 'Sister Aline', role: 'candle-keeper',
            voice: 'Quiet, exact, and never in a hurry.',
            dialog: [
                'Sister Aline is trimming a wick with a small knife and does not stop until it is right.',
                '“The chapel keeps one candle for everyone who is walking in the snow tonight,” she says. “That includes you.”',
                'She sets the trimmed candle in its holder and looks at it as though it had answered a question.'
            ],
            food: { id: 'honey_cake', line: 'She breaks a honey cake in two without being asked and gives you the larger half.' },
            topics: {
                news: 'The chapel hears the news late and keeps it longer. Ask me again tomorrow.',
                carols: 'The arch sings; we answer. Ring the bells here once a night and you will hear the square come back at you.',
                food: 'A little and often, at this hour. It keeps the cold out of the fingers.',
                gifts: 'A gift given without a witness is the only kind worth counting.',
                tree: 'A wish made at the tree is not a bargain. It is a thing said out loud in a cold place. Say “wish” there.',
                poster: 'The watch pastes them up. They use too much paste and it runs down the wall like icing.'
            }
        },
        {
            place: 'starlight_city_1_4', name: 'Maestro Quill', role: 'conductor',
            voice: 'All gesture and no volume, forever arranging an orchestra that is not there.',
            dialog: [
                'Quill conducts the empty theatre for a moment before noticing you, and does not seem embarrassed about it.',
                '“Four carols, four rounds, and the arch keeps the beat,” he says, counting on his fingers as if the fingers might disagree.',
                'He hums two notes, winces, and hums them again.'
            ],
            food: { id: 'peppermint_humbug', line: 'He hands you a peppermint humbug. “For the throat,” he says, though you have not been singing.' },
            topics: {
                carols: 'Say “carols” for the round, and “sing” to take a verse. Sing it badly. The arch will forgive you; I will pretend not to hear.',
                news: 'The theatre hears the news when it is already a song. I prefer it that way.',
                food: 'Humbugs. They are the only sweet that behaves like a rest.',
                gifts: 'A wrapped thing at a party is a small piece of theatre. The paper is the curtain.',
                tree: 'The tree is the loudest quiet thing in this city. I have tried to write it twice.',
                poster: 'The posters are the only printed music in the city. Read the small lines; they are the interesting ones.'
            }
        },
        {
            place: 'starlight_city_2_4', name: 'Doran Axle', role: 'sleighwright',
            voice: 'Blunt, practical, and proud of a joint nobody else can see.',
            dialog: [
                'Doran is on his back under a runner, and the answer to your greeting comes out from under the sleigh.',
                '“Do not stand there,” he says, “that is where the splinters land.”',
                'He taps a runner with a knuckle: “Hear that? That is a good winter. That is a sleigh that comes back.”'
            ],
            food: { id: 'bread', line: 'He tears a brown roll in half and holds one half out, still not looking up from the runner.' },
            topics: {
                food: 'Bread and whatever the kitchen sends down. Eat it on the yard or the runners will have it.',
                poster: 'We print the posters here — the press is in the back, by the runners. Ten sheets a morning, paste included. Read them where they hang.',
                news: 'The watch brings the weather down from the north and I build to it. If it says ice, I build for ice.',
                gifts: 'A hamper rides behind the seat. Rope it, or you will be picking parcels out of a snowdrift.',
                carols: 'The carolers come past on the way to the arch and never once offer to help load.',
                tree: 'A fir that size needs a sleigh to move it. Nobody ever asks who moved it.'
            }
        },
        {
            place: 'starlight_city_4_0', name: 'Captain Hesper Rell', role: 'watch captain',
            voice: 'Even, watchful, and answers the question you actually asked.',
            dialog: [
                'Captain Rell is on the wall with her back to the city, watching the road.',
                '“The lamps are lit to the gate,” she says. “That is as much as anyone can promise in December.”',
                'She marks something in a small book, closes it, and gives you her full attention for exactly as long as you need.'
            ],
            food: { id: 'gingerbread', line: 'She hands over a gingerbread man from her coat, cold and hard, and says nothing about it.' },
            topics: {
                news: 'The watch keeps the weather and the road. The Herald prints what the watch is willing to say.',
                food: 'Eat on the wall and you stay on the wall. That is the whole of my advice.',
                carols: 'The arch carries further than it should. On a still night we hear every verse up here.',
                gifts: 'Anything carried north goes roped and sealed. The parcel office knows it.',
                tree: 'The count the tree keeps is the only number in this city I trust.',
                poster: 'Read the wall. The posters are the only thing pasted here that nobody has to be talked out of.'
            }
        },
        {
            place: 'starlight_city_4_2', name: 'Pell', role: 'tree-warden',
            voice: 'Talks about the tree as if it were a difficult relative.',
            dialog: [
                'Pell is on a ladder with a handful of glass and no free hand for anything else.',
                '“It asks for something different every night,” he says, “and it sulks if you guess.”',
                'He hangs a ball, leans back, and moves it a finger’s width to the left.'
            ],
            food: { id: 'spiced_cider', line: 'He climbs down, pours a cup of spiced cider from a flask, and passes it up to nobody in particular until you take it.' },
            topics: {
                tree: 'Say “christmas tree” at the trunk to hear what it wants tonight. Hang what it asks for, and it finishes the night lit. Say “wish” while it is lit and it will keep the words.',
                carols: 'On a lit night the carolers sing below and the glass rings. That is not a metaphor, it is a nuisance.',
                news: 'The tree does not care about the news. It cares about tonight.',
                gifts: 'Parcels left at the trunk are not for the tree. They are for whoever you brought them for.',
                food: 'Cider. It is the only warm thing up a ladder.',
                poster: 'There is a sheet pasted right by the trunk. Nobody reads it standing in the wind, so we read it out instead.'
            }
        },
        {
            place: 'starlight_kitchen', name: 'Greta Holt', role: 'gingerbread baker',
            voice: 'Brisk, floury, and feeding you before you finish a sentence.',
            dialog: [
                'Greta is rolling pastry with her sleeves pushed up and does not stop for the door.',
                '“Sit,” she says, “you are thin as a broom and twice as useless in a kitchen.”',
                'She slides a tray out of the oven, looks at it the way a general looks at troops, and nods once.'
            ],
            food: { id: 'gingerbread', line: 'A gingerbread man is put into your hand before you can say whether you are hungry.' },
            topics: {
                food: 'Ask me tomorrow and there will be something warm. There is always something warm.',
                news: 'News in a kitchen travels faster than any Herald, and is wrong more often.',
                carols: 'They sing better on a full stomach. I have told them. They arrive empty anyway.',
                gifts: 'A parcel with food in it should be opened the same day. That is not a rule, it is sense.',
                tree: 'The tree is dressed in glass and the kitchen is dressed in flour. Both look well from a distance.',
                poster: 'The posters go up across the road. I keep one by the oven for the dates.'
            }
        }
    ];
    const byName = name => CAST.find(person => person.name.toLowerCase() === String(name || '').trim().toLowerCase())
        || CAST.find(person => String(name || '').trim().length >= 3 && person.name.toLowerCase().includes(String(name).trim().toLowerCase()));

    /** People you can actually talk to here, right now. */
    const here = (game = G) => (w.WorldData.npcs[game.state.location] || [])
        .map(npc => CAST.find(person => person.name === npc.name))
        .filter(Boolean);

    /* ───────────────────────── the Starlight Herald ───────────────────────── */

    const HERALD = {
        weather: [
            'Snow all morning and none of it settling. The runners are out; the sleighwright is pleased and will not say so.',
            'A hard frost. The pond is holding and the ribbons are up; the priest asks that nobody test the middle.',
            'Thaw by noon, ice by dark. The watch has put a lamp on every corner of the north wall.',
            'Still air and a low sky. The arch carried a verse as far as North Watch last night, which the captain denies.',
            'Wind from the north road. The cocoa terrace has put the pot on early and will keep it on.'
        ],
        market: [
            'The Wrapped Parcel has packed its cone, its basket and its hamper for the morning. What is in them, the shopkeeper will not say.',
            'Pinecones have doubled at the exchange. Nobody will admit to buying them.',
            'The toymaker has put a wooden horse in the window. It is not for sale, and half the city has offered for it anyway.',
            'Glassblowers at the court are taking orders for tree balls until the light goes.',
            'The kitchen has run out of nutmeg twice this week and blamed the post both times.'
        ],
        tree: [
            'The Grand Christmas Tree asks for its own dressing each night. It was finished last night and lit until dawn.',
            'Pell was up the ladder before the light and is still up there.',
            'The tree is unlit tonight. It has not said what it wants; ask it at the trunk.',
            'The star at the top was re-set this week. It is straighter than it was, and nobody has noticed.'
        ],
        board: [
            'The twelfth-night board is up in the market. The frost-prowlers are counted the same for every hero who reads it.',
            'Three frost-prowlers were reported on the north road and the watch has not moved, which means the pay is already agreed.',
            'The bounty board changes at midnight and never changes its terms between heroes.'
        ],
        doors: [
            'One door on Advent Row each night, December the first to the twenty-fifth. The twenty-fifth is the last.',
            'The door that opened last night has been re-sealed, as they always are.',
            'Santa reads every finished door on the twenty-fifth. What he decides is his business.'
        ],
        carols: [
            'The Carolers’ Arch sings at dark, four rounds, and the chapel answers with bells.',
            'Maestro Quill has been rehearsing an empty theatre again.',
            'The carolers take cocoa before they sing. Bram has opinions. So do they.'
        ]
    };
    const HERALD_ORDER = ['weather', 'market', 'tree', 'board', 'doors', 'carols'];

    /** One bulletin a day: chosen from the date, so every hero reads the same one. */
    function heraldLines(date = new Date()) {
        const p = parts(date);
        const seed = p.y * 10000 + p.m * 100 + p.d;
        const pick = (list, offset) => list[(seed + offset * 7) % list.length];
        return HERALD_ORDER.map((key, index) => ({ key, line: pick(HERALD[key], index) }));
    }

    function heraldHeading(date = new Date()) {
        const p = parts(date);
        return `The Starlight Herald — December ${p.d}`;
    }

    /* ───────────────────────────── the posters ───────────────────────────── */

    /**
     * Printed at the Sleighwright Yard, pasted up by the watch. Each poster says
     * what is actually true of the fair, in the flat voice of a printed sheet.
     */
    const POSTERS = {
        kaliwasch: {
            title: 'CHRISTMAS CITY IS OPEN',
            lines: [
                'From the first of December to the twenty-fifth, the road north-east of this square leads to Christmas City.',
                'One door on Advent Row opens each night. Twenty-five doors, twenty-five nights, no second chances.',
                'The Grand Christmas Tree stands on the north row and asks for its own dressing after dark.',
                'Parcels for the season are sold at the Wrapped Parcel on Shop Row. The shopkeeper does not discuss the contents.'
            ]
        },
        starlight_square: {
            title: 'BELL COURT — NOTICES',
            lines: [
                'Carols at the Carolers’ Arch, at dark, four rounds. Bring a voice or borrow one.',
                'The quiz card is pinned to the tree by the bell. Merchant Aldric sets it and will not be drawn on the answers.',
                'North of this court: Pinecone Exchange, then Advent Row. East: Ribbon Ice Pond. West: the Gingerbread Kitchen.',
                'The chapel answers the arch with its bells. Ring them once a night and no more; the city is sleeping.'
            ]
        },
        starlight_city_0_0: {
            title: 'CAROLS AT THE ARCH',
            lines: [
                'Four carols are sung in the season, in four rounds, repeated until the twenty-fifth.',
                'Say “carols” for tonight’s round and “sing” to take a verse with the arch.',
                'The arch returns a voice in tune. It is the only piece of stone in the city that does.',
                'Requests are taken by Ilse Marrow, who will pretend not to hear the first one.'
            ]
        },
        starlight_city_0_1: {
            title: 'PARCEL OFFICE — CONDITIONS OF CARRIAGE',
            lines: [
                'Every parcel leaves this counter tied twice: once for the journey, once for luck.',
                'A sealed present may be carried to another hero. Speak the hero’s name at the counter and it goes out along the road.',
                'Nothing is opened at this counter. Nothing is described at this counter.',
                'The Herald is printed next door and read here first, which is the only perk of the post.'
            ]
        },
        starlight_city_0_3: {
            title: 'TOYMAKER LANE',
            lines: [
                'The window horse is not for sale. It has been offered for eleven years and will be offered for twelve.',
                'Wooden things are repaired at this door for the price of the wood.',
                'The lane is the only street in the city that is quiet after dark.',
                'Parcels left here are not stored. Take them to the office.'
            ]
        },
        starlight_city_0_4: {
            title: 'COCOA TERRACE',
            lines: [
                'Cocoa, six rupees a cup, while the pot is on.',
                'A cup is food and medicine both. The watch drinks here before the north wall.',
                'The terrace closes when the pot is empty, not when the hour is late.',
                'Steam is not an excuse for running ink. It is the reason for it.'
            ]
        },
        starlight_city_1_0: {
            title: 'CANDLE CHAPEL',
            lines: [
                'A candle is kept for everyone walking in the snow tonight. That includes you.',
                'The bells answer the arch at the end of the last round. Ring them once a night.',
                'Wishes are not taken here. They are said at the tree, out loud, in the cold.',
                'The door is never locked and the wicks are always trimmed.'
            ]
        },
        starlight_city_1_4: {
            title: 'MUSIC BOX THEATRE',
            lines: [
                'The theatre is dark this season. The carolers have the arch and the arch has the acoustics.',
                'Rehearsals are open to anyone willing to be conducted at.',
                'Humbugs are provided for the throat. Do not take more than two.',
                'The mechanism in the lobby is older than the building and is not to be wound.'
            ]
        },
        starlight_city_2_4: {
            title: 'SLEIGHWRIGHT YARD — NOTICES',
            lines: [
                'These sheets are printed here, ten a morning, paste included. Read them where they hang.',
                'Runners are fitted while you wait. Bring the sleigh; do not bring the horse.',
                'Hampers ride behind the seat and must be roped. Loose parcels are lost parcels.',
                'The north road is passable and the watch has said so in writing, which is rare.'
            ]
        },
        starlight_city_4_0: {
            title: 'NORTH WATCH — ROAD AND WEATHER',
            lines: [
                'The lamps are lit to the gate. That is as much as anyone promises in December.',
                'The road north is open. The road east is open and unlit; carry your own light.',
                'Loose glass on the wall after a hard frost. Mind the ladder.',
                'The watch keeps the weather and the Herald prints what the watch will say.'
            ]
        },
        starlight_city_4_2: {
            title: 'THE GRAND CHRISTMAS TREE',
            lines: [
                'The tree asks for its own dressing after dark: glass balls, lights, garland, bells — in the count it names.',
                'Hang what it asks for and it finishes the night lit, until the next night asks for its own.',
                'Say “wish” at the trunk while it is lit. What you say is kept, and given back to you the next time you ask.',
                'A present under the tree is not for the tree. Give it to the hero you brought it for.'
            ]
        },
        starlight_kitchen: {
            title: 'GINGERBREAD KITCHEN',
            lines: [
                'Gingerbread is baked here from the first of December and does not last the morning.',
                'Cooking recipes are taught at this table. Bring ingredients; the oven is already hot.',
                'Parcels with food in them should be opened the same day. This is not a rule, it is sense.',
                'The kitchen keeps one poster by the oven, for the dates.'
            ]
        }
    };

    /* ───────────────────────────── the carols ───────────────────────────── */

    const CAROLS = [
        {
            id: 'deck_the_halls', title: 'Deck the Halls',
            verses: [
                'Deck the halls with boughs of holly, fa la la la la, la la la la.',
                '’Tis the season to be jolly, fa la la la la, la la la la.',
                'See the blazing yule before us, fa la la la la, la la la la.',
                'Strike the harp and join the chorus, fa la la la la, la la la la.'
            ]
        },
        {
            id: 'silent_night', title: 'Silent Night',
            verses: [
                'Silent night, holy night. All is calm, all is bright.',
                'Round yon virgin mother and child, holy infant so tender and mild.',
                'Sleep in heavenly peace. Sleep in heavenly peace.',
                'Silent night, holy night. Shepherds quake at the sight.'
            ]
        },
        {
            id: 'we_wish_you', title: 'We Wish You a Merry Christmas',
            verses: [
                'We wish you a merry Christmas. We wish you a merry Christmas.',
                'We wish you a merry Christmas, and a happy new year.',
                'Good tidings we bring, to you and your kin.',
                'We wish you a merry Christmas and a happy new year.'
            ]
        },
        {
            id: 'o_christmas_tree', title: 'O Christmas Tree',
            verses: [
                'O Christmas tree, O Christmas tree, how faithful are thy branches.',
                'O Christmas tree, O Christmas tree, how faithful are thy branches.',
                'Not only green when summer’s here, but also when ’tis cold and drear.',
                'O Christmas tree, O Christmas tree, how faithful are thy branches.'
            ]
        }
    ];

    /* ─────────────────────────── the small actions ─────────────────────────── */

    function addCast() {
        const npcs = w.WorldData.npcs;
        if (!npcs) return 0;
        let added = 0;
        for (const person of CAST) {
            if (!w.WorldData.locations[person.place]) continue;
            const list = (npcs[person.place] ||= []);
            if (list.some(npc => npc.name === person.name)) continue;
            list.push({ name: person.name, role: person.role, dialog: person.dialog.slice(), christmasPerson: person.name });
            added += 1;
        }
        return added;
    }

    function removeCast() {
        const npcs = w.WorldData.npcs;
        if (!npcs) return 0;
        let removed = 0;
        for (const person of CAST) {
            const list = npcs[person.place];
            if (!Array.isArray(list)) continue;
            const index = list.findIndex(npc => npc.name === person.name);
            if (index !== -1) { list.splice(index, 1); removed += 1; }
        }
        return removed;
    }

    function pastePosters(active) {
        for (const [id, poster] of Object.entries(POSTERS)) {
            const loc = w.WorldData.locations[id];
            if (!loc) continue;
            loc.features = Array.isArray(loc.features) ? loc.features : [];
            const has = loc.features.includes('Christmas poster');
            if (active && !has) loc.features.push('Christmas poster');
            if (!active && has) loc.features.splice(loc.features.indexOf('Christmas poster'), 1);
            if (active) loc.poster = poster;
            else delete loc.poster;
        }
    }

    /** Called on load, on a return to the tab, and before every command. */
    function sync(game = G, date = new Date()) {
        const active = festivalOpen(date);
        const locations = Boolean(w.WorldData.locations?.starlight_square);
        addCast();
        pastePosters(active && locations);
        if (!active) return false;
        if (game?.updateSpeakerButtons && CAST.some(person => person.place === game.state.location)) game.updateSpeakerButtons();
        return true;
    }

    /* ─────────────────────────────── commands ─────────────────────────────── */

    Game.christmasNews = function (date = new Date()) {
        if (!festivalOpen(date)) {
            say(this, 'The Starlight Herald is printed through December and not before.', 'system');
            return false;
        }
        const lines = heraldLines(date);
        say(this, `${heraldHeading(date)}. ${lines.map(row => row.line).join(' ')}`, 'location');
        say(this, 'Say “ask”, then a name, then “about” and a subject — news, food, carols, the tree, gifts or the poster.', 'system');
        return true;
    };

    Game.readPoster = function () {
        const loc = w.WorldData.locations[this.state.location];
        const poster = loc?.poster || POSTERS[this.state.location];
        if (!poster || !festivalOpen()) {
            const places = Object.keys(POSTERS).filter(id => w.WorldData.locations[id]).length;
            say(this, `There is no printed sheet on this wall. The season’s posters are pasted up in Christmas City and on Kaliwasch Market Square — ${places} walls in all. Say “posters” to hear where they are.`, 'system');
            return false;
        }
        say(this, `A printed sheet, pasted flat to the wall: “${poster.title}”. ${poster.lines.join(' ')}`, 'location');
        return true;
    };

    Game.posterPlaces = function () {
        const names = Object.entries(POSTERS)
            .filter(([id]) => w.WorldData.locations[id])
            .map(([id, poster]) => `${w.WorldData.locations[id].name} (${poster.title.toLowerCase()})`);
        if (!names.length || !festivalOpen()) {
            say(this, 'Nothing is pasted up yet. The posters go on the walls through December.', 'system');
            return false;
        }
        say(this, `Printed sheets are pasted in ${names.length} places: ${names.join('; ')}. Stand at one and say “read poster”.`, 'location');
        return true;
    };

    Game.askPerson = function (name, topic) {
        const person = byName(name) || here()[0];
        if (!person) {
            say(this, 'There is nobody here to ask. Say “talk” to hear who is about.', 'system');
            return false;
        }
        if (!here().includes(person)) {
            say(this, `${person.name} is not here. ${person.name} keeps to ${w.WorldData.locations[person.place]?.name || 'their own room'}.`, 'system');
            return false;
        }
        const wanted = String(topic || '').trim().toLowerCase();
        const key = /news|herald|word/.test(wanted) ? 'news'
            : /food|eat|hungry|sweet|cocoa|drink/.test(wanted) ? 'food'
                : /carol|song|sing|music/.test(wanted) ? 'carols'
                    : /tree|fir|decorat|light/.test(wanted) ? 'tree'
                        : /gift|present|parcel|box|paper/.test(wanted) ? 'gifts'
                            : /poster|sheet|print|wall|paper/.test(wanted) ? 'poster' : '';
        if (!key) {
            say(this, `${person.name} considers the question. “Ask me about the news, the food, the carols, the tree, the gifts, or the printed sheet.”`, 'npc');
            return false;
        }
        say(this, `${person.name}: “${person.topics[key]}”`, 'npc');
        return true;
    };

    Game.ringCandleBells = function (date = new Date()) {
        if (this.state.location !== 'starlight_city_1_0') {
            say(this, 'The bells hang in the Candle Chapel, on the first street of Christmas City.', 'system');
            return false;
        }
        if (!festivalOpen(date)) { say(this, 'The chapel is quiet outside the season.', 'system'); return false; }
        const state = cityState(this), night = dayKey(date);
        state.bells ||= {};
        if (state.bells[night]) {
            say(this, 'The bells have already answered tonight. Sister Aline catches your eye and shakes her head, once, kindly.', 'system');
            return false;
        }
        state.bells[night] = true;
        sfx('game-win');
        say(this, 'You take the rope in both hands and pull. The bell speaks once, then the next, then the arch answers from across the city, and for a moment the whole square is ringing at itself. Sister Aline listens with her eyes shut, and then goes back to trimming wicks.', 'treasure');
        this.save?.();
        return true;
    };

    Game.singAtTheArch = function (which, date = new Date()) {
        if (!festivalOpen(date)) { say(this, 'The arch is silent outside December.', 'system'); return false; }
        const here_person = here()[0];
        const outside = !this.state.location?.startsWith('starlight_');
        if (outside && !here_person) {
            say(this, 'The arch that carries a tune is in Christmas City, at the Carolers’ Arch. Singing here would only startle the pigeons.', 'system');
            return false;
        }
        const state = cityState(this), night = dayKey(date);
        state.carols ||= {};
        const picked = which ? CAROLS.find(c => c.id === String(which).toLowerCase().replace(/\s+/g, '_') || c.title.toLowerCase() === String(which).toLowerCase()) : null;
        const carol = picked || CAROLS[((state.carols.round || 0) % CAROLS.length)];
        const verse = (state.carols[night] ||= { carol: carol.id, verse: 0, done: false });
        if (verse.carol !== carol.id) { verse.carol = carol.id; verse.verse = 0; }
        const line = carol.verses[verse.verse % carol.verses.length];
        verse.verse += 1;
        const joined = this.state.location === 'starlight_city_0_0'
            ? 'Ilse comes in a third above you, and the stone under the arch gives it back twice.'
            : 'The tune carries; somewhere north of the square, somebody picks it up.';
        say(this, `“${line}” — ${joined}`, 'npc');
        sfx('check');

        const finished = verse.verse >= carol.verses.length && !verse.done;
        if (finished) {
            verse.done = true;
            state.carols.round = (state.carols.round || 0) + 1;
            const reward = w.WorldData.items?.christmas_bell;
            if (reward) this.addItemToInventory('christmas_bell', { ...reward });
            say(this, `The last line goes up into the dark and comes back changed. ${carol.title}, whole. Ilse presses a small brass bell into your hand — “for the tree, or for the door, or for the next time you need to be heard.”`, 'treasure');
            this.updateHUD?.(); this.save?.();
        } else {
            this.save?.();
        }
        return { carol: carol.id, verse: verse.verse, done: verse.done };
    };

    Game.listCarols = function () {
        const state = cityState(this);
        say(this, `Four carols are sung in the season: ${CAROLS.map(c => `${c.title} (${c.verses.length} verses)`).join('; ')}. Say “sing” for the next verse of tonight’s round, or “sing silent night” to take one of your choosing. Rounds sung: ${state.carols?.round || 0}.`, 'location');
    };

    Game.makeWish = function (words) {
        if (this.state.location !== 'starlight_city_4_2') {
            say(this, 'A wish is said at the trunk of the Grand Christmas Tree, and nowhere else.', 'system');
            return false;
        }
        if (!festivalOpen()) { say(this, 'The tree is not here outside the season.', 'system'); return false; }
        const state = cityState(this);
        const text = String(words || '').trim();
        if (!text) {
            const last = state.wishes.at(-1);
            say(this, last
                ? `You put your hand flat on the trunk and say it again, the way it was said the first time: “${last.text}”. The tree does not answer, but the glass above you moves.`
                : 'You put your hand on the trunk and find you have nothing to say yet. Say “wish”, then the words — “wish for a dry road home.”', 'location');
            return Boolean(last);
        }
        state.wishes.push({ text: text.slice(0, 160), day: dayKey() });
        if (state.wishes.length > 12) state.wishes.shift();
        say(this, `You say it out loud, in the cold, with your hand on the trunk: “${text.slice(0, 160)}”. Nothing answers. The tree keeps it anyway.`, 'treasure');
        sfx('spell-arcane');
        this.save?.();
        return true;
    };

    Game.buyCocoa = function () {
        if (this.state.location !== 'starlight_city_0_4') {
            say(this, 'The cocoa pot is on the Cocoa Terrace, on the first street of Christmas City.', 'system');
            return false;
        }
        if (!festivalOpen()) { say(this, 'The terrace is closed outside the season.', 'system'); return false; }
        const p = this.state.player;
        if (!p) { say(this, 'Create a hero first.', 'system'); return false; }
        const price = 6;
        if ((p.gold || 0) < price) {
            say(this, `A cup is ${price} rupees and you carry ${p.gold || 0}. Bram shrugs and stirs the pot anyway.`, 'system');
            sfx('board-error');
            return false;
        }
        p.gold -= price;
        this.addItemToInventory('cocoa_cup', { ...w.WorldData.items.cocoa_cup });
        say(this, `You pay Bram ${price} rupees. The cup is thick, hot, and tastes of cocoa and a little of the pot it was stirred in. “Drink it before it stops being a medicine,” he says.`, 'item');
        sfx('coin-collision');
        this.updateHUD?.(); this.save?.();
        return true;
    };

    /** One of their own lines, said in their own words, then the day and the food. */
    function speakTo(game, person) {
        const line = person.dialog[Math.floor(Math.random() * person.dialog.length)];
        game.addNarrative(`You speak with ${person.name}. ${line}`, 'npc');
        const state = cityState(game);
        const night = dayKey();
        state.heraldSeen ||= {};
        if (!state.heraldSeen[night]) {
            state.heraldSeen[night] = true;
            const herald = heraldLines()[0];
            game.addNarrative(`${person.name} adds, in passing: “${herald.line}”`, 'npc');
        }
        greet(game, person);
        return true;
    }

    /** Their own line, and the food they always have for a hero once a day. */
    function greet(game, person) {
        const date = new Date(), night = dayKey(date);
        const state = cityState(game);
        state.fed ||= {};
        const food = itemFor(person.food.id);
        if (!food) return;
        if (state.fed[`${night}:${person.name}`]) return;
        state.fed[`${night}:${person.name}`] = true;
        game.addItemToInventory(itemKey(person.food.id), { ...food });
        game.addNarrative(` ${person.food.line} The ${food.name} goes into your bag.`, 'item');
        game.save?.();
    }

    /* ────────────────────────────── the wrapper ────────────────────────────── */

    const oldTalk = G.talkToNPC;
    const oldCommand = G.processCommand;
    const oldContext = G.updateContextActions;
    const oldSave = G.getSaveData.bind(G);

    G.talkToNPC = function (name) {
        const person = byName(name);
        // One of the ten speaks for themselves: their line, their voice, their food.
        if (person && festivalOpen() && here(this).includes(person)) return speakTo(this, person);
        return oldTalk.call(this, name);
    };

    G.getSaveData = function () {
        const data = oldSave();
        try { data.christmasTown = cityState(this); } catch { }
        return data;
    };

    if (typeof oldContext === 'function') {
        G.updateContextActions = function () {
            oldContext.call(this);
            const box = document.getElementById('context-actions');
            if (!box || !festivalOpen()) return;
            const loc = w.WorldData.locations[this.state.location];
            const buttons = [];
            if (loc?.poster) buttons.push('<button onclick="Game.readPoster()">Read poster</button>');
            if (this.state.location?.startsWith('starlight_')) buttons.push('<button onclick="Game.christmasNews()">The Herald</button>', '<button onclick="Game.singAtTheArch()">Sing a carol</button>');
            if (this.state.location === 'starlight_city_4_2') buttons.push('<button onclick="Game.makeWish()">Make a wish</button>');
            if (this.state.location === 'starlight_city_1_0') buttons.push('<button onclick="Game.ringCandleBells()">Ring the bells</button>');
            if (this.state.location === 'starlight_city_0_4') buttons.push('<button onclick="Game.buyCocoa()">Buy cocoa</button>');
            if (buttons.length) box.insertAdjacentHTML('beforeend', buttons.join(''));
        };
    }

    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!text) return oldCommand.call(this, raw);
        sync(this);

        const talking = /^talk(?:\s+to)?\s+(.+)$/.exec(text);
        if (talking) {
            const person = byName(talking[1]);
            if (person && festivalOpen() && here(this).includes(person)) { speakTo(this, person); return; }
        }

        if (/^(news|christmas news|the herald|read herald|herald)$/.test(text)) {
            const loc = this.state.location;
            if ((loc === 'kaliwasch' || loc === 'kaliwasch_tavern') && w.ChristmasCrier?.handle?.(this, raw)) return;
            this.christmasNews();
            return;
        }
        if (/^(posters|poster places|where are the posters)$/.test(text)) { this.posterPlaces(); return; }
        if (/^(read poster|read the poster|poster|read notice|read the notice)$/.test(text)) { this.readPoster(); return; }
        // "carol" (singular) belongs to Crier Bell and the twelfth-night row;
        // the list of rounds is asked for in the plural.
        if (/^carols$/.test(text) || /^(sing a carol|list carols|carol list)$/.test(text)) {
            if (w.ChristmasCrier?.handle?.(this, text)) return;
            this.listCarols();
            return;
        }
        // "carol" and "sing carol" belong to Crier Bell's candle row.
        if (text === 'carol' || text === 'sing carol' || text === 'christmas carol') return oldCommand.call(this, raw);
        let m = /^sing(?: a carol)?(?: (.+))?$/.exec(text);
        if (m) { this.singAtTheArch((m[1] || '').trim()); return; }
        m = /^wish(?: for)?(?: (.+))?$/.exec(text);
        if (m) { this.makeWish((m[1] || '').trim()); return; }
        if (/^(ring (the )?bells?|ring chapel bells)$/.test(text)) { this.ringCandleBells(); return; }
        if (/^(buy|order) (a )?(cup of )?cocoa$/.test(text)) { this.buyCocoa(); return; }
        m = /^ask(?: (.+?))? about (.+)$/.exec(text);
        if (m) { this.askPerson((m[1] || '').trim(), m[2].trim()); return; }
        m = /^ask (.+)$/.exec(text);
        if (m) { this.askPerson('', m[1].trim()); return; }
        return oldCommand.call(this, raw);
    };

    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(w.Game); });
    sync(G);

    w.ChristmasTown = {
        cast: CAST, carols: CAROLS, posters: POSTERS, heraldLines, heraldHeading,
        sync, here, byName, festivalOpen, dayKey
    };
})();
