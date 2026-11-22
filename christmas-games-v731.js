// The Christmas Game Hall: six walkable rooms off Advent Gate that open the
// shipped accessible game hall (chess, ludo, snakes and ladders, carrom,
// blackjack). Rules, turns and dice come from game-hall.js; this file only adds
// the physical rooms, the spoken directions and the commands that open them.
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G || !w.WorldData || !w.SeasonalEvents) return;

    const hall = 'starlight_game_hall', gate = 'starlight_advent_gate';
    const GAMES = [
        { key: 'snakes', direction: 'south', name: 'Snakes and Ladders Room', blurb: 'A long painted board climbs the wall. Roll the die, climb the ladders and slide down the snakes to square one hundred.' },
        { key: 'ludo', direction: 'down', name: 'Ludo Room', blurb: 'Four brass token sets sit around a round table. Roll a six to leave the yard and bring every token home.' },
        { key: 'chess', direction: 'east', name: 'Chess Room', blurb: 'Two quiet boards under green lamps. Moves are spoken, and every legal move is checked.' },
        { key: 'carrom', direction: 'west', name: 'Carrom Room', blurb: 'A polished carrom board with real coins and a striker. Choose an angle and a power to flick.' },
        { key: 'blackjack', direction: 'up', name: 'Blackjack Room', blurb: 'A card table with a dealer’s shoe. Draw to twenty-one without going over.' }
    ];
    const roomId = key => `starlight_game_hall_${key}`;
    const festivalOpen = (date = new Date()) => w.SeasonalEvents.activeEvents(date).some(e => e.id === 'christmas');
    const say = (game, text, type = 'system') => game.addNarrative(text, type);

    function build() {
        const L = w.WorldData.locations;
        if (!L[gate]) return false;
        if (!L[hall]) {
            L[hall] = {
                id: hall, name: 'Christmas Game Hall', region: 'Christmas City', safe: true,
                music: 'CHRISTMAS', musicContext: 'CHRISTMAS',
                description: 'A warm timber hall hung with paper stars, with five doors around a notice board. Chess is east, carrom west, snakes and ladders south, ludo down the steps and blackjack up the stair. Say christmas games, or open actions, to play.',
                exits: { north: gate, south: roomId('snakes'), down: roomId('ludo'), east: roomId('chess'), west: roomId('carrom'), up: roomId('blackjack') },
                features: ['accessible game hall', 'board games'], items: [], enemies: []
            };
            L[gate].exits.south = hall;
        }
        for (const game of GAMES) {
            const id = roomId(game.key);
            if (!L[id]) L[id] = {
                id, name: `Christmas Game Hall — ${game.name}`, region: 'Christmas City', safe: true,
                music: 'CHRISTMAS', musicContext: 'CHRISTMAS',
                description: `${game.blurb} Say play ${game.key} or open actions. North returns to the hall lobby.`,
                exits: { north: hall }, features: ['game hall room', game.key], items: [], enemies: []
            };
        }
        return Boolean(L[hall]);
    }

    function remove() {
        const L = w.WorldData?.locations;
        if (!L) return;
        for (const id of Object.keys(L)) if (/^starlight_game_hall/.test(id)) delete L[id];
        if (L[gate]?.exits?.south === hall) delete L[gate].exits.south;
    }

    const currentGame = game => (w.WorldData.locations[game.state.location]?.features || [])
        .find(feature => GAMES.some(item => item.key === feature));

    function openHall(game, requested) {
        build();
        const type = requested || currentGame(game) || '';
        if (!w.GameHall) { say(game, 'The game hall is still being swept. Try again in a moment.', 'system'); return true; }
        if (type && w.GameHall.select) { w.GameHall.open?.(); w.GameHall.select(type); }
        else w.GameHall.open?.();
        w.MusicSystem?.playSFX?.('ui-click');
        return true;
    }

    function handle(game, raw) {
        game = game || w.Game;
        if (!game?.state) return false;
        const text = String(raw || '').trim().toLowerCase().replace(/[!.?]+$/, '');
        if (!festivalOpen()) return false;
        build();
        const here = game.state.location;
        const play = /^(?:play|christmas play)\s+(chess|ludo|ludo board|snakes|snakes and ladders|carrom|blackjack)$/.exec(text);
        if (play) {
            const key = play[1].replace('snakes and ladders', 'snakes').replace('ludo board', 'ludo');
            const room = roomId(key);
            if (!w.WorldData.locations[room]) { say(game, 'That game room is not open yet.', 'system'); return; }
            if (here !== room) game.enterLocation(room);
            return openHall(game, key);
        }
        if (text === 'christmas games' || text === 'game hall' || text === 'board games') {
            if (here === hall || currentGame(game)) return openHall(game);
            if (w.WorldData.locations[hall]) {
                say(game, 'The Christmas Game Hall is south of Advent Gate: chess east, carrom west, snakes and ladders south, ludo down, blackjack up. Say play chess, play ludo, play snakes, play carrom or play blackjack from here and I will walk you in.', 'system');
                return true;
            }
            say(game, 'The game hall opens with Christmas City on December 1.', 'system');
            return true;
        }
        if (text === 'christmas hall map') {
            say(game, 'Game Hall. From the lobby: east is chess, west is carrom, south is snakes and ladders, down is ludo, up is blackjack, north returns to Advent Gate.', 'system');
            return true;
        }
        return false;
    }

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        if (handle(this || w.Game, raw)) return;
        return oldCommand.call(this, raw);
    };

    let builtKey = '';
    function sync(game, date = new Date()) {
        if (!festivalOpen(date)) { builtKey = ''; remove(); return false; }
        const t = w.SeasonalEvents.parts(date), key = `${t.y}-${t.m}-${t.d}`;
        if (key !== builtKey) { build(); builtKey = key; }
        return true;
    }

    w.ChristmasGames = { sync, build, remove, handle, GAMES, roomId, hall };
})();
