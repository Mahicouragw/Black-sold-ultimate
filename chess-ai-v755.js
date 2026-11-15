/* Black Soul Ultimate — small chess engine for computer opponents.
 * Pure rules-engine consumer: it only ever picks from chess.js legal moves, so it
 * cannot make an illegal move. The same file runs in the browser (practice games)
 * and inside the server function (rewarded games). */
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = [0, 4, 8, 12, 12, 8, 4, 0];

function evaluate(chess) {
    let score = 0;
    const board = chess.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        let v = VALUE[piece.type];
        if (piece.type === 'p') v += (piece.color === 'w' ? 6 - r : r - 1) * 6 + CENTER[f] / 2;
        else if (piece.type !== 'k' && piece.type !== 'r') v += CENTER[r] + CENTER[f];
        score += piece.color === 'w' ? v : -v;
    }
    return score;
}

const rank = san => (san.includes('#') ? 4 : 0) + (san.includes('=') ? 3 : 0) + (san.includes('x') ? 2 : 0) + (san.includes('+') ? 1 : 0);

function search(chess, depth, alpha, beta, budget) {
    const moves = chess.moves();
    const white = chess.turn() === 'w';
    if (!moves.length) return chess.isCheck() ? (white ? -100000 - depth : 100000 + depth) : 0;
    if (depth === 0 || budget.nodes <= 0) return evaluate(chess);
    moves.sort((a, b) => rank(b) - rank(a));
    let best = white ? -Infinity : Infinity;
    for (const san of moves) {
        budget.nodes--;
        chess.move(san);
        const score = search(chess, depth - 1, alpha, beta, budget);
        chess.undo();
        if (white) { if (score > best) best = score; if (best > alpha) alpha = best; }
        else { if (score < best) best = score; if (best < beta) beta = best; }
        if (alpha >= beta) break;
    }
    return best;
}

/** level 1 = easy, 2 = normal, 3 = hard. Returns {from, to, promotion} or null. */
export function chooseMove(chess, level = 2, random = Math.random) {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const pick = m => ({ from: m.from, to: m.to, promotion: m.promotion || undefined });
    if (level <= 1 && random() < 0.4) return pick(moves[Math.floor(random() * moves.length)]);
    const depth = level >= 3 ? 2 : 1;
    const budget = { nodes: level >= 3 ? 2600 : 1400 };
    const white = chess.turn() === 'w';
    let best = null, bestScore = white ? -Infinity : Infinity;
    moves.sort((a, b) => rank(b.san) - rank(a.san));
    for (const move of moves) {
        chess.move(move.san);
        let score = search(chess, depth, -Infinity, Infinity, budget) + (random() - 0.5) * 8;
        chess.undo();
        if (white ? score > bestScore : score < bestScore) { bestScore = score; best = move; }
    }
    return pick(best || moves[0]);
}

/** Facts about a move that was just played on `chess`, used for storage and narration. */
export function describeMove(move, chess) {
    const flags = String(move.flags || '');
    let over = null, drawReason = null;
    if (chess.isCheckmate()) over = 'checkmate';
    else if (chess.isStalemate()) over = 'stalemate';
    else if (chess.isDraw()) {
        over = 'draw';
        drawReason = chess.isInsufficientMaterial() ? 'insufficient_material'
            : chess.isThreefoldRepetition() ? 'threefold_repetition' : 'fifty_move_rule';
    }
    return {
        san: move.san, from: move.from, to: move.to, piece: move.piece, color: move.color,
        captured: move.captured || null, promotion: move.promotion || null,
        castle: flags.includes('k') ? 'king' : flags.includes('q') ? 'queen' : null,
        en_passant: flags.includes('e'), check: chess.isCheck(), over, draw_reason: drawReason, fen: chess.fen()
    };
}
