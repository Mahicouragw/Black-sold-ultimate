/* 7.61.0 — Gesture boards: Chess, Snakes & Ladders and Ludo.
 *
 * This layer never invents a board. Chess and Snakes & Ladders run on the live
 * game-hall match through window.HallPlay (game-hall-v755.js); Ludo runs on the
 * existing GameHall (game-hall.js). Every rule — legal moves, captures, check,
 * dice, safe squares, home path — is enforced by those engines. The gestures
 * only choose what to ask for, and every sentence that reports an outcome is
 * read back from the engine after it acted.
 */
(function () {
    'use strict';

    const api = window.GestureAccessibility;
    if (!api) return;
    const { speak } = api;
    const G = () => window.Game;

    const PIECES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
    const FILES = 'abcdefgh';
    const chess = { file: 4, rank: 2 };
    const ludo = { index: 0 };
    let snakesSeat = 0;

    const panel = () => document.getElementById('game-hall-panel');
    const panelOpen = () => { const el = panel(); return Boolean(el) && !el.classList.contains('hidden') && !el.hidden; };
    const play = () => window.HallPlay;
    const hall = () => window.GameHall;
    const squareName = () => FILES[chess.file] + chess.rank;

    function active() {
        if (!panelOpen()) return null;
        const p = play();
        const m = p?.match;
        if (m && (m.status === 'active' || m.status === 'waiting')) {
            if (m.game === 'chess') return 'chess';
            if (m.game === 'snakes') return 'snakes';
        }
        const h = hall();
        if (h?.type === 'ludo' && Array.isArray(h.state?.tokens)) return 'ludo';
        if (!m && h?.type === 'chess' && h.chess) return 'chess';
        if (!m && h?.type === 'snakes' && Array.isArray(h.state?.positions)) return 'snakes';
        return null;
    }

    /* ───────────── chess ───────────── */

    function fenRows() {
        const p = play();
        const fen = p?.shown?.fen || hall()?.chess?.fen?.() || hall()?.state?.fen || '';
        return String(fen).split(' ')[0].split('/');
    }

    function pieceAt(sq) {
        const rows = fenRows();
        if (!rows.length || !rows[0]) return null;
        const file = FILES.indexOf(sq[0]), rank = Number(sq[1]);
        if (file < 0 || rank < 1 || rank > 8) return null;
        const row = rows[8 - rank] || '';
        let index = 0;
        for (const ch of row) {
            if (/\d/.test(ch)) { index += Number(ch); continue; }
            if (index === file) return { color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() };
            index++;
        }
        return null;
    }

    function myColor() {
        const p = play();
        if (typeof p?.myColor === 'function') return p.myColor();
        return 'w';
    }

    function pieceText(piece) {
        if (!piece) return 'empty';
        return `${piece.color === 'w' ? 'white' : 'black'} ${PIECES[piece.type] || 'piece'}`;
    }

    function legalTargets() {
        const p = play();
        return Array.isArray(p?.targets) ? p.targets : [];
    }

    function chessReview() {
        const p = play();
        if (typeof p?.describe === 'function') { p.describe(); return; }
        const h = hall(), board = h?.chess;
        if (!board) return speak('No chess board is open.');
        const lines = [];
        for (const color of ['w', 'b']) for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
            const list = [];
            for (const row of board.board()) for (const cell of row) if (cell && cell.color === color && cell.type === type) list.push(cell.square);
            if (list.length) lines.push(`${color === 'w' ? 'White' : 'Black'} ${PIECES[type]} ${list.sort().join(', ')}`);
        }
        speak(lines.join('. ') + '. ' + (board.inCheck?.() ? 'Check.' : '') + ` ${board.turn() === 'w' ? 'White' : 'Black'} to move.`, false, 'chess');
    }

    function announceSquare() {
        const sq = squareName(), piece = pieceAt(sq);
        const p = play();
        const selected = p?.selected;
        const targets = legalTargets();
        const parts = [`${sq}, ${pieceText(piece)}.`];
        if (selected && selected === sq) parts.push('Selected.');
        else if (selected && targets.includes(sq)) parts.push(`Legal move, ${targets.includes(sq) && piece ? 'capture.' : 'empty square.'}`);
        else if (piece && piece.color === myColor()) {
            const moves = p?.myTurn?.() === false ? [] : null;
            if (moves === null) parts.push(piece.type === 'p' ? 'Your pawn.' : `Your ${PIECES[piece.type]}.`);
        }
        if (selected && selected !== sq) parts.push(`Selected ${selected}. Two finger tap cancels.`);
        else parts.push('Double tap to select or move.');
        speak(parts.join(' '), false, 'chess');
    }

    function chessMyPieces() {
        const list = [];
        const colour = myColor();
        for (let rank = 1; rank <= 8; rank++) for (let file = 0; file < 8; file++) {
            const sq = FILES[file] + rank, piece = pieceAt(sq);
            if (piece && piece.color === colour) list.push(sq);
        }
        return list;
    }

    function chessHandle(token) {
        const p = play();
        const step = {
            up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0],
            'up-right': [1, 1], 'up-left': [-1, 1], 'down-right': [1, -1], 'down-left': [-1, -1]
        }[token];
        if (step) {
            chess.file = Math.max(0, Math.min(7, chess.file + step[0]));
            chess.rank = Math.max(1, Math.min(8, chess.rank + step[1]));
            announceSquare();
            return true;
        }
        if (token === 'two-left' || token === 'two-right') {
            const list = chessMyPieces();
            if (!list.length) { speak('You have no pieces on the board.'); return true; }
            const at = list.indexOf(squareName());
            const next = at < 0 ? (token === 'two-right' ? 0 : list.length - 1) : (at + (token === 'two-right' ? 1 : -1) + list.length) % list.length;
            chess.file = FILES.indexOf(list[next][0]); chess.rank = Number(list[next][1]);
            announceSquare();
            return true;
        }
        if (token === 'double') {
            if (typeof p?.square !== 'function') {
                speak('The chess board is not ready yet.');
                return true;
            }
            const before = p?.shown?.fen;
            p.square(squareName());
            setTimeout(() => {
                if (p?.shown?.fen && p.shown.fen !== before) speak('Move played.', false, 'chess');
            }, 250);
            return true;
        }
        if (token === 'two-tap') {
            if (p?.selected && typeof p.square === 'function') { p.square(p.selected); return true; }
            speak('No piece is selected. Swipe to a square and double tap to select.');
            return true;
        }
        if (token === 'circle' || token === 'down') { chessReview(); return true; }
        if (token === 'tap') { announceSquare(); return true; }
        if (token === 'go_down') {
            if (p?.selected && typeof p.square === 'function') { p.square(p.selected); return true; }
            return false;
        }
        return false;
    }

    /* ───────────── snakes & ladders ───────────── */

    function snakesPlayers() {
        const p = play();
        if (p?.view?.players?.length) {
            return p.view.players.map(player => ({
                name: player.seat === p.mySeat ? 'You' : `${player.name} (${player.color})`,
                square: p.shown?.pos?.[player.seat] ?? 0,
                turn: p.shown?.turn === player.seat
            }));
        }
        const h = hall();
        if (h?.type === 'snakes' && h.state?.positions) {
            return h.state.positions.map((square, seat) => ({
                name: h.state.players?.[seat] || `Player ${seat + 1}`,
                square, turn: h.state.turn === seat
            }));
        }
        return [];
    }

    function snakesReview() {
        const p = play();
        if (typeof p?.describe === 'function') { p.describe(); return; }
        const list = snakesPlayers();
        if (!list.length) return speak('No Snakes and Ladders game is running.');
        speak(list.map(player => `${player.name} on square ${player.square}${player.turn ? ', their turn' : ''}`).join('. ') + '.', false, 'snakes');
    }

    function snakesHandle(token) {
        const p = play(), h = hall();
        const engine = typeof p?.roll === 'function' ? p : (h?.type === 'snakes' ? h : null);
        if (token === 'double') {
            if (!engine) { speak('No Snakes and Ladders game is running.'); return true; }
            engine.roll();
            return true;
        }
        if (token === 'left' || token === 'right' || token === 'two-left' || token === 'two-right') {
            const list = snakesPlayers();
            if (!list.length) { speak('No players to read yet.'); return true; }
            snakesSeat = (snakesSeat + ((token === 'right' || token === 'two-right') ? 1 : -1) + list.length) % list.length;
            const player = list[snakesSeat];
            speak(`${player.name}, square ${player.square}${player.turn ? ', their turn now' : ''}. ${snakesSeat + 1} of ${list.length}.`, false, 'snakes');
            return true;
        }
        if (token === 'up' || token === 'tap') {
            const list = snakesPlayers();
            const me = list.find(player => player.name === 'You') || list[0];
            if (!me) { speak('No Snakes and Ladders game is running.'); return true; }
            speak(`You are on square ${me.square}. ${me.turn ? 'Your turn: double tap to roll.' : 'Waiting for the other player.'}`, false, 'snakes');
            return true;
        }
        if (token === 'down' || token === 'circle') { snakesReview(); return true; }
        if (token === 'two-tap') { snakesReview(); return true; }
        return false;
    }

    /* ───────────── Ludo ───────────── */

    function ludoState() {
        const h = hall();
        return h?.type === 'ludo' && Array.isArray(h.state?.tokens) ? h.state : null;
    }

    function ludoSeat() {
        const state = ludoState();
        if (!state) return 0;
        // The human seat is the focused token seat; default to the state turn.
        return Number.isInteger(ludo.focusSeat) ? ludo.focusSeat : state.turn;
    }

    function ludoLegal() {
        const h = hall(), state = ludoState();
        if (!state || state.roll == null) return [];
        if (typeof h.legalLudoTokens !== 'function') return [];
        return h.legalLudoTokens(ludoSeat(), state.roll).map(entry => ({ index: entry.index, pos: entry.pos, legal: true }));
    }

    function ludoTokens() {
        const state = ludoState();
        if (!state) return [];
        const seat = ludoSeat(), legal = ludoLegal();
        return state.tokens[seat].map((pos, index) => ({
            index, pos, legal: legal.some(entry => entry.index === index)
        }));
    }

    function ludoFocus() {
        const list = ludoTokens();
        if (!list.length) return null;
        if (ludo.index >= list.length) ludo.index = 0;
        return list[ludo.index];
    }

    function ludoSpeech() {
        const state = ludoState();
        if (!state) return speak('No Ludo game is running.');
        const token = ludoFocus();
        if (!token) return speak('This seat has no tokens.');
        const where = token.pos < 0 ? 'in the yard' : token.pos === 56 ? 'home' : `on square ${token.pos}`;
        const parts = [`${state.players?.[ludoSeat()] || 'Player'}, token ${token.index + 1} ${where}.`, `Die ${state.roll ?? 'not rolled'}.`];
        if (state.roll != null) parts.push(token.legal ? 'This token can move. Double tap to move it.' : 'This token cannot move with this die. Swipe to another token.');
        else parts.push('Double tap to roll.');
        if (state.winner != null) parts.push(`${state.players?.[state.winner] || 'A player'} has won.`);
        speak(parts.join(' '), false, 'ludo');
    }

    function ludoReview() {
        const state = ludoState();
        if (!state) return speak('No Ludo game is running.');
        const who = state.players?.[state.turn] || 'Player';
        const lines = [`${who} to play. Die ${state.roll ?? 'not rolled'}.`];
        state.tokens.forEach((tokens, seat) => {
            lines.push(`${state.players?.[seat] || 'Player ' + (seat + 1)}: ${tokens.map((pos, index) => `token ${index + 1} ${pos < 0 ? 'yard' : pos === 56 ? 'home' : 'square ' + pos}`).join(', ')}.`);
        });
        if (state.winner != null) lines.push(`${state.players?.[state.winner]} won.`);
        speak(lines.join(' '), false, 'ludo');
    }

    function ludoHandle(token) {
        const h = hall(), state = ludoState();
        if (!state) { speak('No Ludo game is running.'); return true; }
        if (token === 'double') {
            if (state.winner != null) { speak('The game is finished. Open a new game from the Game Hall.'); return true; }
            if (state.roll == null) { if (typeof h.roll === 'function') h.roll(); else speak('The dice cannot be rolled right now.'); return true; }
            const tokenEntry = ludoFocus();
            if (!tokenEntry) { speak('No token to move.'); return true; }
            if (!tokenEntry.legal) { speak(`Token ${tokenEntry.index + 1} cannot move with this die. Swipe to a token that can.`, false, 'ludo'); return true; }
            if (ludo.confirm !== tokenEntry.index) {
                ludo.confirm = tokenEntry.index;
                const landing = tokenEntry.pos < 0 ? 0 : tokenEntry.pos + state.roll;
                speak(`Token ${tokenEntry.index + 1} selected, moving to square ${landing}. Double tap again to confirm, or two finger tap to cancel.`, false, 'ludo');
                return true;
            }
            if (typeof h.moveLudo !== 'function') { speak('The board cannot move that token.'); return true; }
            ludo.confirm = null;
            h.moveLudo(tokenEntry.index);
            return true;
        }
        if (token === 'left' || token === 'right' || token === 'two-left' || token === 'two-right') {
            const list = ludoTokens();
            if (!list.length) { speak('No tokens to read.'); return true; }
            const step = (token === 'right' || token === 'two-right') ? 1 : -1;
            ludo.index = (ludo.index + step + list.length) % list.length;
            ludoSpeech();
            return true;
        }
        if (token === 'up' || token === 'tap') { ludoSpeech(); return true; }
        if (token === 'down' || token === 'circle') { ludoReview(); return true; }
        if (token === 'two-tap') {
            ludo.confirm = null;
            if (state.roll != null) speak('Selection cleared. The die stays until you move a token.', false, 'ludo');
            else speak('Nothing to cancel. Double tap to roll.', false, 'ludo');
            return true;
        }
        return false;
    }

    /* ───────────── routing ───────────── */

    function handle(token) {
        const mode = active();
        if (!mode) return false;
        if (mode === 'chess') return chessHandle(token);
        if (mode === 'snakes') return snakesHandle(token);
        if (mode === 'ludo') return ludoHandle(token);
        return false;
    }

    window.GestureBoard = {
        active, handle,
        chess, ludo,
        squareName, pieceAt, pieceText, legalTargets, chessMyPieces,
        snakesPlayers, ludoTokens, ludoLegal, ludoFocus,
        announceSquare, chessReview, snakesReview, ludoReview
    };
})();
