/**
 * v7.55 — Snakes & Ladders and Chess in the Game Hall.
 *
 * These tests run the real browser code against the real server rules (the SQL
 * in server/sql executed by PGlite, behind the same request handler the Edge
 * Function uses). Online games use two separate browser runtimes that share one
 * server, exactly as two players would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuntime } from '../scripts/load-world.mjs';
import { createServer } from './helpers/bsu-db.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const strip = source => source.split('\n').filter(line => !/^\s*import\s.*from\s/.test(line) && !/^\s*export\s/.test(line)).join('\n');

async function player(t, { server = null, uid = 'p1', name = 'Asha' } = {}) {
    const runtime = await createRuntime();
    const { window } = runtime, { Game } = window, doc = window.document;
    window.OnlineSystem.saveGame = async () => true;
    window.OnlineSystem.syncActiveHero = () => {};
    window.OnlineSystem.dropWorldItem = async () => false;
    window.OnlineSystem.init = () => {};
    const received = [];
    if (server) window.BSUServer.transport = async (action, args) => {
        const result = await server.handle(uid, action, JSON.parse(JSON.stringify(args)));
        received.push({ action, result });
        return result;
    };
    Game.init();
    Game.startNewHero();
    doc.getElementById('char-name').value = name;
    doc.querySelector('.race-btn[data-race="human"]').classList.add('selected');
    doc.querySelector('.class-btn[data-class="warrior"]').classList.add('selected');
    Game.createCharacter(false);
    window.InterfaceMode.apply('sighted');
    await wait(20);
    if (server) await window.BSUServer.tick();

    // The hall files are ES modules in the browser; evaluate them as scripts here.
    const { Chess } = await import('../assets/vendor/chess.js');
    const ai = await import('../chess-ai-v755.js');
    Object.assign(window, { Chess, chooseMove: ai.chooseMove, describeMove: ai.describeMove });
    window.eval(strip(await readFile('game-hall.js', 'utf8')));
    window.eval(strip(await readFile('game-hall-v755.js', 'utf8')));
    const hall = window.GameHall, P = window.HallPlay;
    assert.ok(P, 'the v7.55 hall layer must load');
    t.after(() => { P.stopTimers(); window.BSUServer.transport = null; runtime.dom.window.close(); });

    const sounds = [], said = [];
    window.MusicSystem.playSFXAndWait = async type => { sounds.push(type); };
    window.MusicSystem.playSFX = type => { sounds.push(type); return true; };
    window.AudioManager.playVoice = text => { said.push(String(text)); return Promise.resolve(true); };
    hall.pause = async () => {};
    P.autoPoll = false;
    doc.getElementById('game-hall-panel').classList.remove('hidden');
    const $ = id => doc.getElementById(id);
    const settle = async () => { for (let i = 0; i < 60; i++) { await wait(5); await P.chain; if (!P.acting) break; } await P.chain; };
    const answer = async (promise, yes) => { await wait(15); assert.equal($('confirm-dialog').classList.contains('hidden'), false, 'a confirmation dialog is shown'); $(yes ? 'confirm-dialog-yes' : 'confirm-dialog-no').click(); return promise; };
    return { window, Game, hall, P, doc, $, sounds, said, received, settle, answer, events: type => received.flatMap(r => r.result?.events || []).filter((e, i, all) => all.findIndex(x => x.seq === e.seq) === i && (!type || e.type === type)) };
}
const count = (list, value) => list.filter(item => item === value).length;

test('Snakes & Ladders against the computer: the server rolls, every event is spoken once with one sound, and the reward is paid', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const a = await player(t, { server });
    const goldBefore = a.Game.state.player.gold;

    a.hall.select('snakes');
    assert.equal(a.$('hall-setup').classList.contains('hidden'), true, 'the old setup is replaced');
    a.$('h755-seats').value = '3';
    a.$('h755-color').value = 'Gold';
    a.$('h755-ai').click();
    await a.settle();
    assert.equal(a.P.match.status, 'active');
    assert.equal(a.P.match.seats, 3);
    assert.deepEqual([...a.said.slice(-2)], ['The game begins.', 'Your turn. Roll the dice.']);
    assert.match(a.$('hall-board').textContent, /You \(Gold\): 0/);
    assert.match(a.$('hall-board').textContent, /Computer 1/);

    let guard = 0;
    while (a.P.match.status === 'active' && guard++ < 400) {
        const button = a.$('h755-roll');
        assert.ok(button, 'the roll button is present while the game is active');
        button.click();
        await a.settle();
    }
    assert.equal(a.P.match.status, 'finished');

    const rolls = a.events('roll');
    assert.ok(rolls.length >= 6);
    assert.equal(count(a.sounds, 'board-dice'), rolls.length, 'one dice sound per roll');
    assert.equal(count(a.sounds, 'board-piece'), rolls.reduce((sum, e) => sum + (e.data.landed - e.data.from), 0), 'one step sound per square travelled');
    assert.equal(count(a.sounds, 'ladder-up'), rolls.filter(e => e.data.via === 'ladder').length, 'one ladder sound per ladder');
    assert.equal(count(a.sounds, 'snake-down'), rolls.filter(e => e.data.via === 'snake').length, 'one snake sound per snake');
    assert.equal(a.said.filter(line => / rolled \d\.$/.test(line)).length, rolls.length, 'every roll is spoken exactly once');
    for (const e of rolls.filter(e => e.data.seat === 0)) assert.ok(a.said.includes(`You rolled ${e.data.die}.`));
    for (const e of rolls.filter(e => e.data.via === 'ladder' && e.data.seat === 0)) assert.ok(a.said.includes(`A ladder! You climb from square ${e.data.landed} up to square ${e.data.to}.`));
    for (const e of rolls.filter(e => e.data.via === 'snake' && e.data.seat === 1)) assert.ok(a.said.some(line => line === `A snake! Computer 1 (${a.P.view.players[1].color}) slides from square ${e.data.landed} down to square ${e.data.to}.`));

    const mine = a.P.match.result.rankings.find(r => r.seat === 0);
    assert.equal(count(a.sounds, 'game-win') + count(a.sounds, 'game-lose'), 1, 'exactly one ending sound');
    assert.equal(count(a.sounds, 'game-win'), mine.rank === 1 ? 1 : 0);
    assert.ok(a.said.some(line => line.startsWith('The game is over.') && line.includes(`You finished in place ${mine.rank} of 3.`)));
    assert.equal(a.Game.state.player.gold - goldBefore, mine.gold, 'the gold the server awarded is the gold the hero received');
    if (mine.gold > 0) assert.ok(a.said.includes(`You earned ${mine.gold} rupees and ${mine.xp} experience.`));
    assert.deepEqual([...a.P.shown.pos], [...a.P.match.state.pos], 'the board shown equals the server board');

    // A finished game is left without a question.
    assert.equal(a.$('h755-leave').textContent, 'Back to the game list');
    a.$('h755-leave').click();
    await a.settle();
    assert.equal(a.P.match, null);
    assert.ok(a.$('h755-ai'), 'the setup screen is back');
});

test('Snakes & Ladders online: invite, accept, turns, out-of-turn refusal, and leaving asks first', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const a = await player(t, { server, uid: 'p1', name: 'Asha' });
    const b = await player(t, { server, uid: 'p2', name: 'Ravi' });
    a.hall.select('snakes'); b.hall.select('snakes');
    await a.P.refreshLobby(); await b.P.refreshLobby(); await a.P.refreshLobby();

    const friend = a.doc.querySelector('[name="h755-friend"]');
    assert.ok(friend, 'the other player in the hall is listed');
    assert.match(friend.parentElement.textContent, /Ravi/);
    a.$('h755-create').click();
    await a.settle();
    assert.ok(a.said.includes('Choose at least one player to invite.'), 'creating without choosing anyone explains why');
    assert.equal(a.P.match, null);
    a.doc.querySelector('[name="h755-friend"]').checked = true;
    a.$('h755-color').value = 'Blue';
    a.$('h755-create').click();
    await a.settle();
    assert.equal(a.P.match.status, 'waiting');
    assert.ok(a.said.includes('Match created. Waiting for the invited players to answer.'));
    assert.match(a.$('hall-board').textContent, /Ravi: invited, waiting for an answer/);

    await b.P.refreshLobby();
    assert.ok(b.said.includes('Asha invites you to play Snakes and Ladders.'));
    await b.P.refreshLobby();
    assert.equal(count(b.said, 'Asha invites you to play Snakes and Ladders.'), 1, 'an invitation is announced once');
    b.doc.querySelector('[data-accept]').click();
    await b.settle();
    assert.equal(b.P.match.status, 'active');
    assert.ok(b.said.includes('The game begins.'));
    assert.ok(b.said.some(line => /^Asha \(Blue\)'s turn\.$/.test(line)));

    await a.P.poll();
    assert.ok(a.said.includes('Ravi joined the game.'));
    assert.deepEqual([...a.said.slice(-2)], ['The game begins.', 'Your turn. Roll the dice.']);

    // Out of turn: refused locally, with the reason, and the server is not asked.
    const callsBefore = b.received.length;
    b.$('h755-roll').click();
    await b.settle();
    assert.equal(b.received.length, callsBefore);
    assert.equal(b.said.at(-1), 'It is not your turn. Waiting for Asha (Blue).');
    assert.ok(b.sounds.includes('board-error'));

    a.$('h755-roll').click();
    await a.settle();
    const roll = a.events('roll')[0].data;
    assert.ok(a.said.includes(`You rolled ${roll.die}.`));
    await b.P.poll();
    assert.ok(b.said.includes(`Asha (Blue) rolled ${roll.die}.`), 'the other player hears the same roll');
    assert.deepEqual([...b.P.shown.pos], [...a.P.shown.pos], 'both players see the same board');
    assert.equal(b.said.at(-1), 'Your turn. Roll the dice.');
    await b.P.poll();
    assert.equal(count(b.said, `Asha (Blue) rolled ${roll.die}.`), 1, 'polling again does not repeat anything');

    // Leaving an unfinished game asks first.
    const stay = await b.answer(b.P.leave(), false);
    assert.equal(stay, false);
    assert.equal(b.P.match.status, 'active');
    assert.equal(b.said.at(-1), 'You stay in the game.');
    assert.ok(b.said.some(line => line.includes('If you leave now, you lose this game')), 'the question says what leaving costs');
    const goldBefore = a.Game.state.player.gold;
    b.$('h755-leave').click();
    assert.equal(await b.answer(wait(1).then(() => true), true), true);
    await wait(40); await b.settle();
    assert.equal(count(b.sounds, 'game-lose'), 1);
    assert.equal(b.P.match, null, 'the player is back at the game list');

    await a.P.poll();
    assert.ok(a.said.includes('Ravi (Red) left the game.') || a.said.some(line => /^Ravi \(\w+\) left the game\.$/.test(line)));
    assert.equal(a.P.match.status, 'finished');
    assert.equal(count(a.sounds, 'game-win'), 1);
    assert.equal(a.Game.state.player.gold - goldBefore, 60, 'first of two players online earns 60 rupees');
    assert.ok(a.said.includes('You earned 60 rupees and 40 experience.'));
});

test('Chess against the computer: tap a piece to hear its moves, tap to move, typed moves, refusals with reasons, resign asks first', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const a = await player(t, { server });
    const goldBefore = a.Game.state.player.gold;
    a.hall.select('chess');
    a.$('h755-side').value = 'white';
    a.$('h755-level').value = '1';
    a.$('h755-ai').click();
    await a.settle();
    assert.equal(a.P.match.status, 'active');
    assert.ok(a.said.includes('You play White.'));
    assert.equal(a.said.at(-1), 'Your move.');

    const squares = a.doc.querySelectorAll('[data-sq]');
    assert.equal(squares.length, 64, 'the board is 64 real buttons');
    const sq = name => a.doc.querySelector(`[data-sq="${name}"]`);
    assert.equal(sq('e2').getAttribute('aria-label'), 'e2, White pawn');
    assert.equal(sq('e4').getAttribute('aria-label'), 'e4, empty');
    assert.equal(sq('e8').getAttribute('aria-label'), 'e8, Black king');
    assert.equal(squares[0].dataset.sq, 'a8', 'white sees rank 8 at the top');

    sq('e7').click(); await a.settle();
    assert.equal(a.said.at(-1), "e7 holds the opponent's pawn.");
    sq('a1').click(); await a.settle();
    assert.equal(a.said.at(-1), 'The rook on a1 has no legal moves.');
    sq('e2').click(); await a.settle();
    assert.equal(a.said.at(-1), 'pawn on e2 selected. It can move to: e3, e4.');
    assert.equal(sq('e4').getAttribute('aria-label'), 'e4, empty, legal move');
    assert.equal(sq('e2').getAttribute('aria-pressed'), 'true');

    a.sounds.length = 0;
    sq('e4').click(); await a.settle();
    const lines = a.said.slice(-3);
    assert.equal(lines[0], 'White pawn from e2 to e4.');
    assert.match(lines[1], /^Black (pawn|knight) from [a-h][1-8] to [a-h][1-8]\.$/);
    assert.equal(lines[2], 'Your move.');
    assert.equal(count(a.sounds, 'board-piece'), 2, 'one sound for each move');
    assert.equal(sq('e4').getAttribute('aria-label'), 'e4, White pawn');
    assert.equal(a.P.shown.fen, a.P.match.state.fen);

    // An illegal move is refused in the browser with the reason; the server is not asked.
    const calls = a.received.length;
    a.$('h755-move').value = 'e4 e6';
    a.$('h755-move-go').click(); await a.settle();
    assert.equal(a.said.at(-1), 'That move is not legal.');
    assert.equal(a.received.length, calls);
    a.$('h755-move').value = 'hello';
    a.$('h755-move-go').click(); await a.settle();
    assert.equal(a.said.at(-1), 'Type a move such as e2 e4.');

    // The command box plays moves too.
    a.Game.processCommand('g1 f3'); await wait(30); await a.settle();
    assert.ok(a.said.includes('White knight from g1 to f3.'));

    a.$('h755-draw').click(); await a.settle();
    assert.ok(a.said.includes('You offered a draw.'));
    assert.ok(a.said.includes('The draw offer was declined.'));
    assert.equal(a.P.match.status, 'active');

    assert.equal(await a.answer(a.P.resign(), false), false);
    assert.equal(a.P.match.status, 'active', 'cancelling the question keeps the game');
    await a.answer(a.P.resign(), true);
    await a.settle();
    assert.equal(a.P.match.status, 'finished');
    assert.equal(count(a.sounds, 'game-lose'), 1);
    assert.ok(a.said.some(line => line === 'The game is over. You lost. By resignation.'));
    const mine = a.P.match.result.rankings.find(r => r.seat === 0);
    assert.equal(a.Game.state.player.gold - goldBefore, mine.gold);
    assert.equal(a.doc.querySelector('#h755-move'), null, 'a finished game has no move controls');
});

test('Chess online: both players see and hear the same game; checkmate pays the winner and the loser', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const a = await player(t, { server, uid: 'p1', name: 'Asha' });
    const b = await player(t, { server, uid: 'p2', name: 'Ravi' });
    a.hall.select('chess'); b.hall.select('chess');
    await b.P.refreshLobby(); await a.P.refreshLobby();
    a.doc.querySelector('[name="h755-friend"]').checked = true;
    a.$('h755-create').click(); await a.settle();
    await b.P.refreshLobby();
    b.doc.querySelector('[data-accept]').click(); await b.settle();
    await a.P.poll();
    const white = a.P.myColor() === 'w' ? a : b, black = white === a ? b : a;
    assert.equal(white.said.at(-1), 'Your move.');
    assert.ok(black.said.includes('You play Black.'));
    assert.equal(black.doc.querySelectorAll('[data-sq]')[0].dataset.sq, 'h1', 'black sees the board from the black side');
    const gold = { white: white.Game.state.player.gold, black: black.Game.state.player.gold };

    // Fool's mate.
    const play = async (who, other, from, to) => { who.doc.querySelector(`[data-sq="${from}"]`).click(); await who.settle(); who.doc.querySelector(`[data-sq="${to}"]`).click(); await who.settle(); await other.P.poll(); };
    await play(white, black, 'f2', 'f3');
    assert.equal(black.said.at(-2), 'White pawn from f2 to f3.');
    assert.equal(black.said.at(-1), 'Your move.');
    await play(black, white, 'e7', 'e5');
    await play(white, black, 'g2', 'g4');
    await play(black, white, 'd8', 'h4');

    for (const p of [white, black]) {
        assert.equal(p.P.match.status, 'finished');
        assert.ok(p.said.includes('Black queen from d8 to h4. Checkmate.'));
        assert.equal(p.P.shown.fen, white.P.shown.fen);
    }
    assert.equal(count(black.sounds, 'game-win'), 1);
    assert.equal(count(white.sounds, 'game-lose'), 1);
    assert.ok(black.said.includes('The game is over. You won! Checkmate.'));
    assert.ok(white.said.includes('The game is over. You lost. Checkmate.'));
    assert.equal(black.Game.state.player.gold - gold.black, 150);
    assert.equal(white.Game.state.player.gold - gold.white, 15);
    assert.ok(black.said.includes('You earned 150 rupees and 100 experience.'));
    assert.ok(white.said.includes('You earned 15 rupees and 10 experience.'));
});

test('without the server: games against the computer still work as practice, with no rewards, and online play says why it cannot start', async t => {
    const a = await player(t, { server: null });
    assert.equal(a.P.serverReady(), false);
    const goldBefore = a.Game.state.player.gold;
    a.hall.select('snakes');
    assert.match(a.$('h755-players').textContent, /Games against other players are not available in this version/);
    await a.P.createMatch('online');
    assert.equal(a.said.at(-1), 'Games against other players are not available in this version. You can play against the computer.');
    assert.equal(a.P.match, null);

    a.$('h755-seats').value = '2';
    await a.P.createMatch('ai');
    assert.ok(a.said.some(line => line.startsWith('The game server cannot be reached, so this is a practice game.')));
    let guard = 0;
    while (a.P.match.status === 'active' && guard++ < 400) await a.P.roll();
    assert.equal(a.P.match.status, 'finished');
    assert.equal(count(a.sounds, 'game-win') + count(a.sounds, 'game-lose'), 1);
    assert.ok(a.said.includes('Practice game. No rewards.'));
    assert.equal(a.Game.state.player.gold, goldBefore);
    const steps = a.said.filter(line => /^You move from square \d+ to square \d+\.$/.test(line)).length;
    assert.ok(steps > 3);

    await a.P.leave();
    a.hall.select('chess');
    a.$('h755-side').value = 'black';
    await a.P.createMatch('ai');
    assert.ok(a.said.includes('You play Black.'));
    assert.match(a.said.at(-2), /^White (pawn|knight) from /, 'the computer, playing white, has already moved');
    assert.equal(a.said.at(-1), 'Your move.');
    assert.equal(await a.P.chessMove('e7', 'e5'), true);
    assert.ok(a.said.includes('Black pawn from e7 to e5.'));
    assert.equal(a.P.match.state.history.length, 3, "white, black, white");
    await a.answer(a.P.resign(), true); await a.settle();
    assert.equal(a.P.match.status, 'finished');
    assert.equal(a.Game.state.player.gold, goldBefore);
});

test('the game is spoken in the chosen game language', async t => {
    const server = await createServer();
    t.after(() => server.close());
    const a = await player(t, { server });
    a.window.Narration.setLang('te', { announce: false });
    a.hall.select('snakes');
    await a.P.createMatch('ai');
    assert.deepEqual([...a.said.slice(-2)], ['ఆట మొదలైంది.', 'మీ వంతు. పాచిక వేయండి.']);
    await a.P.roll();
    const roll = a.events('roll')[0].data;
    assert.ok(a.said.includes(`మీకు ${roll.die} పడింది.`));
    a.window.Narration.setLang('hi', { announce: false });
    await a.P.describe();
    assert.ok(a.said.some(line => line.includes('खाना')));
    a.window.Narration.setLang('en', { announce: false });
});

test('the hall files are shipped: script tag, recorded sounds, and no dead friend-match code path', async () => {
    const html = await readFile('index.html', 'utf8');
    assert.ok(html.indexOf('src="game-hall-v755.js"') > html.indexOf('src="game-hall.js"'), 'the upgrade loads after the hall');
    const music = await readFile('music.js', 'utf8');
    for (const file of ['ladder-up.ogg', 'snake-down.ogg', 'game-win.ogg', 'game-lose.ogg']) {
        assert.ok(music.includes(`assets/audio/sfx/${file}`));
        assert.equal((await readFile(`assets/audio/sfx/${file}`)).subarray(0, 4).toString(), 'OggS');
    }
    const source = await readFile('game-hall-v755.js', 'utf8');
    assert.doesNotMatch(source, /game_hall_sessions|OnlineSystem\.client/);
});
