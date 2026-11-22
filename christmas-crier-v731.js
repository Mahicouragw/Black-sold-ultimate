// Crier Bell: one character, two pitches of the same voice, standing in the
// tavern and on Kaliwasch Market Square during the Christmas season. Every
// answer is a recorded line from assets/crier/, chosen by what the player asks.
// No "thinking" placeholder is spoken, and the device voice is only a fallback
// for words the crier has no recording for.
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const market = 'kaliwasch', tavern = 'kaliwasch_tavern';
    const crier = {
        name: 'Crier Bell',
        role: 'town crier',
        dialog: [
            'Hear the news of Christmas City! Ask me about the map, the actions, the event, the tree, the games, or the latest news.',
            'One door each night on Advent Row, December the first to the twenty-fifth. Santa judges the finished doors on the twenty-fifth.',
            'The Christmas Game Hall has opened off Advent Gate: chess, ludo, snakes and ladders, carrom and blackjack.'
        ]
    };

    // Each topic has its own recorded line. Order matters: the first match wins.
    const TOPICS = [
        { id: 7, file: 'line-07', test: /\b(news|newspaper|latest|update|recent|announcement|announce)\b/i },
        { id: 2, file: 'line-02', test: /\b(map|where|direction|directions|route|location|locations|street|streets|city|bell court|advent|pond|kitchen|lane|gate)\b/i },
        { id: 5, file: 'line-05', test: /\b(tree|decorate|decorat|ornament|star|ribbon|fawn|light)\b/i },
        { id: 6, file: 'line-06', test: /\b(game|games|chess|ludo|snake|snakes|carrom|blackjack|hall|play)\b/i },
        { id: 8, file: 'line-08', test: /\b(fight|battle|battles|combat|prowler|monster|enemy)\b/i },
        { id: 4, file: 'line-04', test: /\b(santa|gift|present|reward|event|date|when|open|close|december|quest|finish)\b/i },
        { id: 3, file: 'line-03', test: /\b(action|actions|command|commands|say|how do i|what can i do|cook|fish|secret|story)\b/i }
    ];

    const festivalOpen = (date = new Date()) => w.SeasonalEvents.activeEvents(date).some(e => e.id === 'christmas');
    const say = (game, text, type) => game.addNarrative(text, type);
    const narrate = (game, text, type = 'system') => game.addNarrative(text, type);

    let clip = null;
    function playLine(file) {
        const A = w.AudioManager;
        try { clip?.pause(); } catch {}
        clip = null;
        A?.duckMusic?.(0.3, 'crier');
        const audio = new w.Audio(`assets/crier/${file}.mp3`);
        clip = audio;
        audio.onended = () => { if (clip === audio) clip = null; A?.restoreMusic?.('crier'); };
        audio.onerror = () => { clip = null; A?.restoreMusic?.('crier'); };
        audio.play?.().catch(() => { if (clip === audio) clip = null; A?.restoreMusic?.('crier'); });
        return audio;
    }
    function stop() { try { clip?.pause(); } catch {} clip = null; w.AudioManager?.restoreMusic?.('crier'); }

    /** Speak a recorded line and log the same words, without the device voice. */
    function answer(game, file, text) {
        playLine(file);
        narrate(game, `Crier Bell: ${text}`, 'npc');
    }

    const LINES = {
        'line-01': 'Hear the news of Christmas City! I am Crier Bell. Ask me about the map, the actions, the event, the tree, the games, or the latest news.',
        'line-02': 'Kaliwasch Market Square has the north-east gate to Bell Court. West of Bell Court is Greta’s kitchen, east is Ribbon Ice Pond, north is the five-by-five city, and Carolers’ Arch opens west onto Advent Gate. Advent Row runs from door one to door twenty-five and ends in Candy Cane Lane, which leads back to the pond.',
        'line-03': 'Say christmas map, christmas doors, christmas open, christmas story, christmas secret, christmas search, christmas sing, christmas fight, christmas present, christmas games, christmas news, christmas decorate and christmas gift. Also fish, recipes and cook.',
        'line-04': 'The event runs December the first to the twenty-fifth, India time. Each door opens only on its night. On the twenty-fifth Santa checks all twenty-five doors, and only a hero who finished every quest receives his one powerful present.',
        'line-05': 'The Grand Christmas Tree stands on the top row beside Mistletoe Ridge. Guard three lantern fawns, find the ruby glass ball, the gold ribbon and the silver tree star, then say christmas decorate.',
        'line-06': 'The Christmas Game Hall is off Advent Gate: chess, ludo, snakes and ladders, carrom and blackjack. Enter a room and open actions to play.',
        'line-07': 'Latest news: Advent Row has twenty-five date-locked doors with recorded stories, the Christmas Game Hall is open, cooking scrolls drop in battle, the Candy Cane stall sells ingredients, and levers and keys hide in the toy lane and the clock lobby.',
        'line-08': 'Frost prowlers roam the wild blocks and guard two of the doors. Defeat one there and the door’s quest is finished. Ordinary combat is unchanged.'
    };

    function topicFor(text) {
        const topic = TOPICS.find(item => item.test.test(text));
        return topic ? `line-0${topic.id}` : '';
    }

    function ask(game, question) {
        const text = String(question || '').trim();
        const topic = topicFor(text);
        if (topic) { answer(game, topic, LINES[topic]); return true; }
        // Greeting, thanks or farewell: the crier's own recorded greeting.
        if (/^(hi|hello|hey|greetings|namaste|good (morning|afternoon|evening))\b/i.test(text) || /thank|bye|farewell/i.test(text)) {
            answer(game, 'line-01', LINES['line-01']);
            return true;
        }
        return false;
    }

    function handle(game, raw) {
        game = game || w.Game;
        if (!game?.state) return false;
        const text = String(raw || '').trim().toLowerCase().replace(/[!.?]+$/, '');
        const here = game.state.location;
        const present = festivalOpen() && (here === market || here === tavern);
        if (present) {
            if (text === 'christmas news') { answer(game, 'line-07', LINES['line-07']); return; }
            if (text === 'christmas crier' || text === 'talk to crier bell' || text === 'talk crier bell') {
                answer(game, 'line-01', LINES['line-01']); return;
            }
            const said = /^(?:ask|say)\s+(.+)$/.exec(text);
            if (said && ask(game, said[1])) return;
            if (text === 'christmas help' || text === 'christmas guide') { answer(game, 'line-03', LINES['line-03']); return; }
            if (text === 'christmas map' && !game.state.location?.startsWith('starlight_')) {
                // The crier answers the map question from the market and tavern.
                if (here === market || here === tavern) { answer(game, 'line-02', LINES['line-02']); return; }
            }
        }
        if (text === 'christmas news' && !present) {
            narrate(game, `Crier Bell calls the news from Kaliwasch Market Square and the tavern. ${NavigateTopics(game)}`, 'system');
            return true;
        }
        return false;
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        if (handle(this || w.Game, raw)) return;
        return oldCommand.call(this, raw);
    };

    function NavigateTopics(game) {
        return w.SeasonalEvents.activeEvents(new Date()).some(e => e.id === 'christmas')
            ? 'Christmas City is open: say christmas map for the streets, christmas doors for all twenty-five doors, or christmas games for the game hall.'
            : 'Christmas City opens on December 1.';
    }

    function sync(game, date = new Date()) {
        const active = festivalOpen(date);
        const npcs = w.WorldData?.npcs;
        if (!npcs) return false;
        for (const id of [market, tavern]) {
            if (!npcs[id]) continue;
            const index = npcs[id].findIndex(n => n.name === crier.name);
            if (active && index === -1) npcs[id].push({ ...crier });
            if (!active && index !== -1) npcs[id].splice(index, 1);
        }
        if (game?.state?.location === market || game?.state?.location === tavern) game.updateSpeakerButtons?.();
        return active;
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(w.Game); });
    w.ChristmasCrier = { sync, ask, answer, handle, LINES, stop, crier };
})();
