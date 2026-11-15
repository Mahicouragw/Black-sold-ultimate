/* Black Soul Ultimate — server request handler.
 * Runs inside the bsu-game server function and, unchanged, inside the Node
 * tests. `db(uid, action, args)` calls public.bsu_api() with the service role.
 * The caller's identity (uid) always comes from a verified sign-in token, never
 * from the request body. */

/** Actions a browser may ask for. chess_commit is deliberately absent: a chess
 *  move is only stored after this file has checked it with the rules engine. */
export const CLIENT_ACTIONS = new Set([
    'tick', 'eat', 'pray', 'permanent', 'quests', 'quest_accept', 'quest_progress', 'quest_complete',
    'save_put', 'save_get', 'rewards_claim', 'hall_poll', 'match_create', 'match_invite', 'match_respond',
    'match_state', 'match_leave', 'match_history', 'snakes_roll', 'chess_move', 'chess_action'
]);

const SQUARE = /^[a-h][1-8]$/;
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

export function createHandler({ db, Chess, chooseMove, describeMove, limit = 300 }) {
    const hits = new Map();
    const allowed = uid => {
        const now = Date.now(), entry = hits.get(uid);
        if (!entry || now - entry.at > 60000) { hits.set(uid, { at: now, n: 1 }); if (hits.size > 5000) hits.clear(); return true; }
        return ++entry.n <= limit;
    };

    const rebuild = state => {
        const chess = new Chess();
        try { for (const san of state.history || []) chess.move(san); }
        catch { return new Chess(state.fen); }
        if (chess.fen() !== state.fen) return new Chess(state.fen);
        return chess;
    };

    /** If it is the computer's turn in a chess match, play its move. */
    async function computerReply(uid, view, since) {
        let current = view;
        for (let guard = 0; guard < 2; guard++) {
            const match = current.match;
            if (!current.ok || match.game !== 'chess' || match.status !== 'active') break;
            const mover = (current.players || []).find(p => p.seat === match.turn_seat);
            if (!mover?.is_ai) break;
            const chess = rebuild(match.state);
            const choice = chooseMove(chess, Number(match.state.ai_level) || 2);
            if (!choice) break;
            const move = chess.move(choice);
            const next = await db(uid, 'chess_commit', { ...describeMove(move, chess), match_id: match.id, version: match.version, seat: mover.seat, since });
            if (!next.ok) break;
            current = next;
        }
        return current;
    }

    async function chessMove(uid, args) {
        const since = Number(args.since) || 0;
        if (!SQUARE.test(String(args.from)) || !SQUARE.test(String(args.to))) return fail('bad_square');
        const promotion = ['q', 'r', 'b', 'n'].includes(args.promotion) ? args.promotion : undefined;
        const view = await db(uid, 'match_state', { match_id: args.match_id, since });
        if (!view.ok) return view;
        const match = view.match;
        if (match.game !== 'chess') return fail('wrong_game');
        if (match.status !== 'active') return fail('not_active');
        if (view.my_seat !== match.turn_seat) return fail('not_your_turn');
        const chess = rebuild(match.state);
        let move;
        try { move = chess.move({ from: args.from, to: args.to, promotion: promotion || 'q' }); }
        catch { return fail('illegal_move'); }
        if (!move) return fail('illegal_move');
        const committed = await db(uid, 'chess_commit', { ...describeMove(move, chess), match_id: match.id, version: match.version, seat: view.my_seat, since });
        if (!committed.ok) return committed;
        return computerReply(uid, committed, since);
    }

    return async function handle(uid, action, args) {
        if (typeof uid !== 'string' || !uid || uid.length > 128) return fail('unauthenticated');
        if (typeof action !== 'string' || !CLIENT_ACTIONS.has(action)) return fail('unknown_action');
        if (args === undefined || args === null) args = {};
        if (typeof args !== 'object' || Array.isArray(args)) return fail('bad_request');
        if (!allowed(uid)) return fail('slow_down');
        if (action === 'chess_move') return chessMove(uid, args);
        const result = await db(uid, action, args);
        if (result?.ok && (action === 'match_create' || action === 'match_state') && result.match?.game === 'chess' && result.match?.mode === 'ai') {
            return computerReply(uid, result, action === 'match_create' ? 0 : Number(args.since) || 0);
        }
        return result;
    };
}
