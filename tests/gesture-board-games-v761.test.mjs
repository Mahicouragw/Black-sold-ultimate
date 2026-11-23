import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRuntime } from '../scripts/load-world.mjs';
import { Chess } from '../assets/vendor/chess.js';

/* 7.61.0 — Chess, Snakes & Ladders and Ludo gestures. The gesture layer must
 * ask the real engines, never a private copy of the rules. These tests stand in
 * for game-hall-v755.js / game-hall.js with the same public surface the live
 * game exposes, and back the chess one with the real vendored chess.js. */

async function ready(t) {
    const r = await createRuntime(); t.after(() => r.dom.window.close());
    await wait(0);
    const w = r.window, G = w.Game;
    w.OnlineSystem.saveGame = async () => true; w.OnlineSystem.syncActiveHero = () => {};
    G.startNewHero();
    w.document.getElementById('char-name').value = 'Board Hero';
    w.document.querySelector('[data-race="human"]').classList.add('selected');
    w.document.querySelector('[data-class="warrior"]').classList.add('selected');
    G.createCharacter(false);
    w.InterfaceMode.apply('blind');
    const spoken = [];
    w.GestureAccessibility.settings.narration = true;
    w.AudioManager.playVoice = text => { spoken.push(String(text)); return Promise.resolve(true); };
    w.GestureAccessibility.UI.close();
    const panel = w.document.createElement('div');
    panel.id = 'game-hall-panel'; panel.className = 'panel';
    w.document.body.appendChild(panel);
    return { w, G, spoken, panel };
}

function chessPlay(w) {
    const board = new Chess();
    const play = {
        match: { id: 'match-1', game: 'chess', status: 'active' },
        mySeat: 0, selected: null, targets: [], described: 0, tried: [],
        get shown() { return { fen: board.fen(), last: null }; },
        myTurn: () => board.turn() === 'w',
        myColor: () => 'w',
        snapshot: () => board.fen(),
        async describe() { play.described++; },
        square(sq) {
            play.tried.push(sq);
            const piece = board.get(sq);
            if (play.selected && play.targets.includes(sq)) return play.chessMove(play.selected, sq);
            if (play.selected === sq) { play.selected = null; play.targets = []; return; }
            if (!piece) { play.selected = null; play.targets = []; return; }
            if (piece.color !== 'w') return;
            const moves = board.moves({ square: sq, verbose: true });
            if (!moves.length) return;
            play.selected = sq;
            play.targets = [...new Set(moves.map(move => move.to))];
        },
        chessMove(from, to) {
            const legal = board.moves({ verbose: true }).some(move => move.from === from && move.to === to);
            if (!legal) return false;
            board.move({ from, to, promotion: 'q' });
            play.selected = null; play.targets = [];
            return true;
        }
    };
    w.HallPlay = play;
    return { play, board };
}

test('chess focus starts on e2 and swipes read real squares', async t => {
    const { w, spoken } = await ready(t);
    const { play } = chessPlay(w);
    const B = w.GestureBoard;
    assert.equal(B.active(), 'chess');
    assert.equal(B.squareName(), 'e2');
    B.handle('tap');
    await wait(10);
    assert.ok(spoken.some(line => /e2, white pawn/.test(line)), spoken.at(-1));
    B.handle('up');
    assert.equal(B.squareName(), 'e3');
    B.handle('tap');
    await wait(10);
    assert.ok(spoken.some(line => /e3, empty/.test(line)), spoken.at(-1));
    assert.equal(play.tried.length, 0, 'reading squares never plays a move');
});

test('double tap selects a real piece and double tap on a target plays it', async t => {
    const { w } = await ready(t);
    const { play, board } = chessPlay(w);
    const B = w.GestureBoard;
    B.handle('double');                 // e2: select
    assert.equal(play.selected, 'e2');
    assert.deepEqual(play.targets.sort(), ['e3', 'e4']);
    B.handle('up'); B.handle('up');     // e4
    B.handle('double');                 // play e2e4
    assert.equal(board.history().length, 1);
    assert.equal(board.history()[0], 'e4');
    assert.equal(play.selected, null);
});

test('an opponent piece is never selected and two finger tap cancels', async t => {
    const { w, spoken } = await ready(t);
    const { play } = chessPlay(w);
    const B = w.GestureBoard;
    B.handle('double');                  // select e2
    assert.equal(play.selected, 'e2');
    B.handle('two-tap');                 // cancel
    assert.equal(play.selected, null);
    // Navigate to a black pawn: e7 is five ranks up from e2.
    for (let i = 0; i < 5; i++) B.handle('up');
    assert.equal(B.squareName(), 'e7');
    B.handle('double');
    assert.equal(play.selected, null, 'the black pawn cannot be selected by the white player');
    await wait(10);
    assert.ok(spoken.length > 0);
});

test('circle reads the board through the engine, not a copy', async t => {
    const { w } = await ready(t);
    const { play } = chessPlay(w);
    w.GestureBoard.handle('circle');
    assert.equal(play.described, 1);
});

test('two finger swipes cycle the player pieces on the real board', async t => {
    const { w, spoken } = await ready(t);
    chessPlay(w);
    const B = w.GestureBoard;
    B.handle('two-right');
    await wait(10);
    assert.ok(spoken.some(line => /white (pawn|rook|knight|bishop|queen|king)/.test(line)), spoken.at(-1));
    assert.notEqual(B.squareName(), 'e2');
});

test('snakes double tap rolls exactly once and swipes read real positions', async t => {
    const { w, spoken } = await ready(t);
    let rolls = 0, described = 0;
    w.HallPlay = {
        match: { game: 'snakes', status: 'active' }, mySeat: 0,
        view: { players: [{ seat: 0, name: 'You', color: 'Red' }, { seat: 1, name: 'Asha', color: 'Blue' }] },
        shown: { pos: [12, 30], turn: 0 },
        myTurn: () => true,
        roll: async () => { rolls++; },
        describe: async () => { described++; }
    };
    const B = w.GestureBoard;
    assert.equal(B.active(), 'snakes');
    B.handle('double');
    assert.equal(rolls, 1, 'one gesture, one roll');
    B.handle('right');
    await wait(10);
    assert.ok(spoken.some(line => /Asha \(Blue\), square 30/.test(line)), spoken.at(-1));
    B.handle('up');
    await wait(10);
    assert.ok(spoken.some(line => /You are on square 12/.test(line)), spoken.at(-1));
    B.handle('circle');
    assert.equal(described, 1);
});

function ludoHall(w) {
    const hall = {
        type: 'ludo', rolls: 0, moves: [],
        state: { tokens: [[-1, -1, -1, -1], [3, 4, 5, 6]], players: ['You', 'Asha'], turn: 0, roll: null, winner: null },
        legalLudoTokens(seat, die) {
            return this.state.tokens[seat].map((pos, index) => ({ pos, index }))
                .filter(token => (token.pos < 0 && die === 6) || (token.pos >= 0 && token.pos + die <= 56));
        },
        async roll() { this.rolls++; this.state.roll = 6; },
        async moveLudo(index) {
            const seat = this.state.turn, pos = this.state.tokens[seat][index];
            if (this.state.roll == null) return;
            const next = pos < 0 ? (this.state.roll === 6 ? 0 : pos) : pos + this.state.roll;
            if (pos < 0 && this.state.roll !== 6) return;
            if (pos >= 0 && pos + this.state.roll > 56) return;
            this.state.tokens[seat][index] = next;
            this.moves.push({ index, next });
            this.state.roll = null;
        }
    };
    w.GameHall = hall;
    return hall;
}

test('ludo double tap rolls, then browses and moves a legal token once', async t => {
    const { w, spoken } = await ready(t);
    const hall = ludoHall(w);
    const B = w.GestureBoard;
    assert.equal(B.active(), 'ludo');
    B.handle('double');
    assert.equal(hall.rolls, 1);
    assert.equal(hall.moves.length, 0, 'rolling does not move a token');
    const legal = B.ludoLegal();
    assert.equal(legal.length, 4, 'the yard tokens can leave on a six');
    B.handle('right');
    await wait(10);
    assert.ok(spoken.some(line => /token 2 in the yard/.test(line)), spoken.at(-1));
    B.handle('double');              // select token 2
    assert.equal(hall.moves.length, 0, 'the first double tap only selects');
    B.handle('double');              // confirm
    assert.equal(hall.moves.length, 1);
    assert.equal(hall.moves[0].index, 1);
    assert.equal(hall.state.tokens[0][1], 0);
});

test('ludo two finger tap cancels a selected token without moving it', async t => {
    const { w, spoken } = await ready(t);
    const hall = ludoHall(w);
    const B = w.GestureBoard;
    B.handle('double');              // roll
    B.handle('double');              // select token 1
    assert.equal(hall.moves.length, 0);
    B.handle('two-tap');             // cancel
    B.handle('double');              // select again, still nothing moves
    assert.equal(hall.moves.length, 0);
    await wait(10);
    assert.ok(spoken.some(line => /selected, moving to square 0/.test(line)), spoken.join(' | '));
});

test('ludo refuses a token the die cannot move and never calls moveLudo', async t => {
    const { w, spoken } = await ready(t);
    const hall = ludoHall(w);
    const B = w.GestureBoard;
    hall.state.roll = 3;            // all tokens are in the yard: nothing can move
    B.handle('double');
    assert.equal(hall.moves.length, 0);
    await wait(10);
    assert.ok(spoken.some(line => /cannot move with this die/.test(line)), spoken.at(-1));
});

test('ludo circle reads every seat, tokens, die and winner from the real state', async t => {
    const { w, spoken } = await ready(t);
    const hall = ludoHall(w);
    hall.state.winner = 1;
    w.GestureBoard.handle('circle');
    await wait(10);
    const line = spoken.at(-1);
    assert.match(line, /You: token 1 yard/);
    assert.match(line, /Asha: token 1 square 3/);
    assert.match(line, /Asha won/);
});

test('board gestures leave the hero and world untouched', async t => {
    const { w, G } = await ready(t);
    const location = G.state.location, inventory = JSON.stringify(G.state.inventory);
    chessPlay(w);
    const B = w.GestureBoard;
    for (const token of ['up', 'left', 'down-right', 'double', 'two-tap', 'circle']) B.handle(token);
    assert.equal(G.state.location, location);
    assert.equal(JSON.stringify(G.state.inventory), inventory);
});
