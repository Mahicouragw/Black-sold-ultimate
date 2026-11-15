// Server rules for Black Soul Ultimate, run against a real PostgreSQL engine
// (PGlite) with the same SQL and the same request handler that are deployed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './helpers/bsu-db.mjs';

const hero = { hero_id: 'hero_1', name: 'Arjun' };

test('server: only whitelisted actions, callers isolated, tables locked', async () => {
    const s = await createServer();
    try {
        assert.equal((await s.handle('', 'tick', hero)).error, 'unauthenticated');
        assert.equal((await s.handle('u1', 'drop_everything', {})).error, 'unknown_action');
        // A browser can never store a chess position directly.
        assert.equal((await s.handle('u1', 'chess_commit', { fen: '8/8/8/8/8/8/8/K6k w - - 0 1' })).error, 'unknown_action');
        assert.equal((await s.handle('u1', 'tick', [])).error, 'bad_request');
        assert.equal((await s.handle('u1', 'tick', {})).error, 'hero_required');
        await s.handle('u1', 'save_put', { save: { heroes: { a: { gold: 5 } } } });
        assert.equal((await s.handle('u2', 'save_get', {})).save, null, 'another account cannot read the save');
        assert.deepEqual((await s.handle('u1', 'save_get', {})).save, { heroes: { a: { gold: 5 } } });
        assert.equal((await s.handle('u1', 'save_put', { save: 'x' })).error, 'bad_save');
        const tables = await s.sql("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'bsu\\_%'");
        assert.ok(tables.length >= 10);
        assert.ok(tables.every(t => t.relrowsecurity), 'row level security is on for every bsu_ table');
        const policies = await s.sql("select count(*)::int as n from pg_policies where tablename like 'bsu\\_%'");
        assert.equal(policies[0].n, 0, 'no browser policy exists');
    } finally { await s.close(); }
});

test('server: HP/MP recovery minutes are handed out once, by server time', async () => {
    const s = await createServer();
    try {
        assert.equal((await s.handle('u1', 'tick', hero)).regen_minutes, 0, 'a new hero gets nothing for free');
        await s.sql("update bsu_heroes set regen_at = now() - interval '10 minutes 30 seconds'");
        assert.equal((await s.handle('u1', 'tick', hero)).regen_minutes, 10);
        assert.equal((await s.handle('u1', 'tick', hero)).regen_minutes, 0, 'refresh or relogin cannot claim the same minutes again');
        await s.sql("update bsu_heroes set regen_at = regen_at - interval '35 seconds'");
        assert.equal((await s.handle('u1', 'tick', hero)).regen_minutes, 1, 'the leftover 30 seconds were kept, not lost');
        await s.sql("update bsu_heroes set regen_at = now() - interval '2 hours'");
        assert.equal((await s.handle('u1', 'tick', { ...hero, regen: 'skip' })).regen_minutes, 0, 'time in battle or while fallen is not banked');
        assert.equal((await s.handle('u1', 'tick', hero)).regen_minutes, 0);
        const view = await s.handle('u1', 'tick', hero);
        assert.equal(view.config.hp_per_minute, 1);
        assert.equal(view.config.mp_per_minute, 1);
    } finally { await s.close(); }
});

test('server: hunger follows real hours and meals', async () => {
    const s = await createServer();
    try {
        let v = await s.handle('u1', 'tick', hero);
        assert.equal(v.hunger.satiety, 100);
        await s.sql("update bsu_heroes set satiety_at = now() - interval '20 minutes'");
        v = await s.handle('u1', 'tick', hero);
        assert.ok(v.hunger.satiety > 90, 'twenty minutes after a meal the hero is not hungry');
        await s.sql("update bsu_heroes set satiety_at = now() - interval '3 hours 30 minutes'");
        v = await s.handle('u1', 'tick', hero);
        assert.ok(Math.abs(v.hunger.satiety - 40) < 0.5, 'hunger returns three and a half hours after a full meal');
        v = await s.handle('u1', 'eat', { ...hero, satiety: 10 });
        assert.equal(v.eaten, true); assert.equal(v.meal, false);
        assert.ok(Math.abs(v.hunger.satiety - 50) < 0.5, 'a snack adds its own value');
        v = await s.handle('u1', 'eat', { ...hero, satiety: 45 });
        assert.equal(v.meal, true); assert.equal(v.hunger.satiety, 100);
        assert.ok(v.hunger.last_meal_at > 0);
        v = await s.handle('u1', 'eat', { ...hero, satiety: 45 });
        assert.equal(v.eaten, false); assert.equal(v.reason, 'full');
        await s.sql("update bsu_heroes set satiety_at = now() - interval '30 hours'");
        assert.equal((await s.handle('u1', 'tick', hero)).hunger.satiety, 0, 'satiety never goes below zero');
        assert.equal((await s.handle('u1', 'eat', { ...hero, satiety: 'lots' })).error, 'bad_food');
        // Configurable: changing one number changes the timing.
        await s.sql("update bsu_config set value = '4' where key = 'hunger_hours'");
        await s.handle('u1', 'eat', { ...hero, satiety: 45 });
        await s.sql("update bsu_heroes set satiety_at = now() - interval '4 hours'");
        assert.ok(Math.abs((await s.handle('u1', 'tick', hero)).hunger.satiety - 40) < 0.5);
    } finally { await s.close(); }
});

test('server: permanent blessing once per hero, daily blessing once per 24 hours', async () => {
    const s = await createServer();
    try {
        assert.equal((await s.handle('u1', 'permanent', { ...hero, choice: 'strength' })).error, 'pray_first');
        assert.equal((await s.handle('u1', 'pray', { ...hero, prayer: 'nonsense' })).error, 'unknown_prayer');
        let v = await s.handle('u1', 'pray', { ...hero, prayer: 'hardship' });
        assert.equal(v.first_prayer, true); assert.equal(v.daily_granted, true);
        assert.equal(v.blessings.daily.battle, 'strength'); assert.equal(v.blessings.daily.growth, 'str');
        assert.equal(v.blessings.permanent, null);
        v = await s.handle('u1', 'pray', { ...hero, prayer: 'healing' });
        assert.equal(v.first_prayer, false); assert.equal(v.daily_granted, false, 'praying again the same day grants nothing new');
        assert.equal(v.blessings.daily.prayer, 'hardship');
        // Reopening the temple, refreshing, signing in again: only ticks happen, nothing is granted.
        for (let i = 0; i < 3; i++) await s.handle('u1', 'tick', hero);
        assert.equal((await s.sql("select count(*)::int n from bsu_blessings where kind='daily'"))[0].n, 1);
        await s.sql("update bsu_blessings set granted_at = granted_at - interval '23 hours 59 minutes' where kind='daily'");
        assert.equal((await s.handle('u1', 'pray', { ...hero, prayer: 'healing' })).daily_granted, false);
        await s.sql("update bsu_blessings set granted_at = granted_at - interval '2 minutes' where kind='daily'");
        v = await s.handle('u1', 'pray', { ...hero, prayer: 'healing' });
        assert.equal(v.daily_granted, true); assert.equal(v.blessings.daily.growth, 'health');

        v = await s.handle('u1', 'permanent', { ...hero, choice: 'wisdom' });
        assert.equal(v.granted, true); assert.equal(v.blessing, 'wisdom');
        v = await s.handle('u1', 'permanent', { ...hero, choice: 'strength' });
        assert.equal(v.granted, false); assert.equal(v.blessing, 'wisdom', 'a second choice is refused and the first is kept');
        const both = await Promise.all([1, 2, 3].map(() => s.handle('u1', 'permanent', { ...hero, choice: 'health' })));
        assert.ok(both.every(r => r.granted === false));
        assert.equal((await s.sql("select count(*)::int n from bsu_blessings where kind='permanent'"))[0].n, 1, 'no duplicate record');
        assert.equal((await s.handle('u1', 'tick', hero)).blessings.permanent, 'wisdom');
        assert.equal((await s.handle('u1', 'permanent', { ...hero, choice: 'luck' })).error, 'unknown_choice');
        // Another hero on the same account has its own blessing.
        const second = { hero_id: 'hero_2', name: 'Meera' };
        await s.handle('u1', 'pray', { ...second, prayer: 'guidance' });
        assert.equal((await s.handle('u1', 'permanent', { ...second, choice: 'magic' })).granted, true);
        // A hero blessed before the server existed is recorded without a new gift.
        const old = { hero_id: 'hero_old', name: 'Old' };
        v = await s.handle('u1', 'permanent', { ...old, choice: 'dexterity', legacy: true });
        assert.equal(v.granted, false); assert.equal(v.legacy, true); assert.equal(v.blessings.permanent, 'dexterity');
    } finally { await s.close(); }
});

test('server: palace quests give their own companion, once, and pay once', async () => {
    const s = await createServer();
    try {
        const list = await s.handle('u1', 'quests', hero);
        assert.equal(list.catalog.length, 5);
        assert.equal(new Set(list.catalog.map(q => q.companion.id)).size, 5, 'every quest has its own companion');
        assert.equal((await s.handle('u1', 'quest_progress', { ...hero, quest_id: 'royal_hunt', progress: 3 })).error, 'quest_not_accepted');
        let v = await s.handle('u1', 'quest_accept', { ...hero, quest_id: 'royal_hunt' });
        assert.equal(v.accepted, true); assert.equal(v.companion.name, 'Ser Aldric');
        v = await s.handle('u1', 'quest_accept', { ...hero, quest_id: 'royal_hunt' });
        assert.equal(v.accepted, false); assert.equal(v.already, 'accepted');
        v = await s.handle('u1', 'quest_accept', { ...hero, quest_id: 'palace_healers_road' });
        assert.equal(v.accepted, false); assert.equal(v.busy, 'royal_hunt', 'one palace quest at a time');
        assert.equal((await s.handle('u1', 'quest_accept', { ...hero, quest_id: 'made_up' })).error, 'unknown_quest');
        assert.equal((await s.handle('u1', 'quest_complete', { ...hero, quest_id: 'royal_hunt' })).error, 'quest_not_finished');
        v = await s.handle('u1', 'quest_progress', { ...hero, quest_id: 'royal_hunt', progress: 5 });
        assert.equal(v.progress, 1, 'progress cannot jump: one battle at a time');
        for (let p = 2; p <= 5; p++) v = await s.handle('u1', 'quest_progress', { ...hero, quest_id: 'royal_hunt', progress: p });
        assert.equal(v.progress, 5);
        assert.equal((await s.handle('u1', 'quest_progress', { ...hero, quest_id: 'royal_hunt', progress: 2 })).progress, 5, 'progress never goes backwards');
        const view = await s.handle('u1', 'tick', hero);
        assert.deepEqual(view.quests.map(q => [q.quest_id, q.status, q.progress, q.companion.id]), [['royal_hunt', 'accepted', 5, 'ser_aldric']]);
        v = await s.handle('u1', 'quest_complete', { ...hero, quest_id: 'royal_hunt' });
        assert.equal(v.completed, true); assert.deepEqual(v.reward, { gold: 180, xp: 250 });
        v = await s.handle('u1', 'quest_complete', { ...hero, quest_id: 'royal_hunt' });
        assert.equal(v.completed, false); assert.equal(v.already, true);
        assert.equal((await s.sql("select count(*)::int n from bsu_rewards where source='quest'"))[0].n, 1);
        v = await s.handle('u1', 'quest_accept', { ...hero, quest_id: 'palace_healers_road' });
        assert.equal(v.accepted, true); assert.equal(v.companion.name, 'Sister Meera');
        // Legacy heroes: recorded, never paid again.
        v = await s.handle('u1', 'quest_accept', { hero_id: 'hero_old', name: 'Old', quest_id: 'royal_hunt', legacy: 'completed' });
        assert.equal(v.already, 'completed');
        assert.equal((await s.handle('u1', 'quest_complete', { hero_id: 'hero_old', quest_id: 'royal_hunt' })).already, true);
    } finally { await s.close(); }
});

async function lobby(s, seats, game = 'snakes') {
    const names = ['Asha', 'Bala', 'Chitra', 'Dev'].slice(0, seats);
    const uids = names.map((_, i) => `p${i + 1}`);
    const pids = [];
    for (let i = 0; i < seats; i++) pids.push((await s.handle(uids[i], 'hall_poll', { name: names[i] })).me.pid);
    return { names, uids, pids };
}

test('server: snakes and ladders — invitations, 4 players, rankings and rewards', async () => {
    const s = await createServer();
    try {
        const { uids, pids } = await lobby(s, 4);
        const hall = await s.handle('p1', 'hall_poll', { name: 'Asha' });
        assert.deepEqual(hall.players.map(p => p.name).sort(), ['Bala', 'Chitra', 'Dev'], 'online players are listed');
        let v = await s.handle('p1', 'match_create', { game: 'snakes', mode: 'online', seats: 4, color: 'Blue', invite: pids.slice(1, 3) });
        const id = v.match.id;
        assert.equal(v.match.status, 'waiting');
        assert.equal((await s.handle('p1', 'snakes_roll', { match_id: id })).error, 'not_active', 'the game cannot start before everyone is ready');
        assert.equal((await s.handle('p2', 'hall_poll', {})).invites[0].host, 'Asha');
        assert.equal((await s.handle('p4', 'match_state', { match_id: id })).error, 'not_in_match', 'outsiders cannot read a match');
        assert.equal((await s.handle('p2', 'match_invite', { match_id: id, pid: pids[3] })).error, 'not_host');
        v = await s.handle('p2', 'match_respond', { match_id: id, accept: true, color: 'Blue' });
        assert.equal(v.joined, true);
        assert.notEqual(v.players.find(p => p.me).color, 'Blue', 'a colour already taken is not given twice');
        v = await s.handle('p3', 'match_respond', { match_id: id, accept: false });
        assert.equal(v.joined, false);
        v = await s.handle('p1', 'match_state', { match_id: id, since: 0 });
        assert.ok(v.events.some(e => e.type === 'rejected' && e.data.name === 'Chitra'), 'the host hears about the rejection');
        assert.equal(v.match.status, 'waiting');
        await s.handle('p1', 'match_invite', { match_id: id, pid: pids[2] });
        await s.handle('p1', 'match_invite', { match_id: id, pid: pids[3] });
        assert.equal((await s.handle('p1', 'match_invite', { match_id: id, pid: pids[3] })).error, 'already_invited');
        await s.handle('p3', 'match_respond', { match_id: id, accept: true, color: 'Green' });
        v = await s.handle('p4', 'match_respond', { match_id: id, accept: true, color: 'Gold' });
        assert.equal(v.match.status, 'active', 'the match starts when the fourth player is ready');
        assert.equal(new Set(v.players.map(p => p.color)).size, 4);
        assert.equal((await s.handle('p2', 'snakes_roll', { match_id: id })).error, 'not_your_turn');
        assert.equal((await s.handle('p1', 'match_create', { game: 'chess', mode: 'ai' })).error, 'already_in_match');

        // Deterministic dice to prove the board rules.
        const step = die => s.sql('select public.bsu_snakes_step($1::uuid, $2)', [id, die]);
        const pos = async () => (await s.handle('p1', 'match_state', { match_id: id })).match.state.pos;
        await step(4);                              // seat 0: ladder 4 -> 14
        assert.deepEqual(await pos(), [14, 0, 0, 0]);
        await step(5); await step(6); await step(1); // seats 1,2,3
        await step(3);                              // seat 0: 14 -> 17, snake to 7
        assert.deepEqual(await pos(), [7, 5, 6, 1]);
        const events = (await s.handle('p3', 'match_state', { match_id: id, since: 0 })).events;
        const rolls = events.filter(e => e.type === 'roll').map(e => e.data);
        assert.deepEqual(rolls[0], { seat: 0, die: 4, from: 0, landed: 4, to: 14, via: 'ladder', rank: null });
        assert.equal(rolls[4].via, 'snake'); assert.equal(rolls[4].to, 7);
        const other = (await s.handle('p4', 'match_state', { match_id: id, since: 0 })).events;
        assert.deepEqual(other.map(e => e.seq), events.map(e => e.seq), 'every player receives the same events');

        // Exact landing on 100 is required; then ranks are filled 1st to 4th.
        await s.sql("update bsu_matches set state = jsonb_set(state, '{pos}', '[98, 97, 96, 95]'), turn_seat = 0 where id = $1::uuid", [id]);
        await step(5);
        assert.deepEqual(await pos(), [98, 97, 96, 95], 'overshooting 100 does not move');
        await step(3);                               // seat 1 reaches 100 -> 1st
        await step(4);                               // seat 2 reaches 100 -> 2nd
        await step(1);                               // seat 3 to 96
        await step(2);                               // seat 0 reaches 100 -> 3rd, seat 3 is 4th
        v = await s.handle('p1', 'match_state', { match_id: id, since: 0 });
        assert.equal(v.match.status, 'finished');
        const ranks = Object.fromEntries(v.match.result.rankings.map(r => [r.name, [r.rank, r.gold, r.xp]]));
        assert.deepEqual(ranks, { Bala: [1, 120, 80], Chitra: [2, 70, 45], Asha: [3, 40, 25], Dev: [4, 15, 10] });
        assert.ok(v.events.some(e => e.type === 'finished'));
        // Rewards exist once and can be claimed once.
        v = await s.handle('p2', 'rewards_claim', { hero_id: 'h' });
        assert.deepEqual(v.rewards.map(r => [r.rank, r.gold, r.xp]), [[1, 120, 80]]);
        assert.deepEqual((await s.handle('p2', 'rewards_claim', { hero_id: 'h' })).rewards, [], 'a second claim pays nothing');
        assert.equal((await s.handle('p3', 'rewards_claim', {})).error, 'hero_required');
        assert.equal((await s.handle('p1', 'snakes_roll', { match_id: id })).error, 'not_active');
        const history = await s.handle('p1', 'match_history', {});
        assert.equal(history.matches[0].rank, 3); assert.equal(history.matches[0].gold, 40);
    } finally { await s.close(); }
});

test('server: snakes and ladders — 2 and 3 players, leaving, disconnecting, computer games', async () => {
    const s = await createServer();
    try {
        const { pids } = await lobby(s, 3);
        // Three players; one leaves mid-game and is ranked last, the others continue.
        let v = await s.handle('p1', 'match_create', { game: 'snakes', mode: 'online', seats: 3, invite: pids.slice(1) });
        const id = v.match.id;
        await s.handle('p2', 'match_respond', { match_id: id, accept: true });
        await s.handle('p3', 'match_respond', { match_id: id, accept: true });
        v = await s.handle('p1', 'match_leave', { match_id: id });
        assert.equal(v.left, true);
        v = await s.handle('p2', 'match_state', { match_id: id, since: 0 });
        assert.equal(v.match.status, 'active', 'two players remain, so the game goes on');
        assert.ok(v.events.some(e => e.type === 'left' && e.data.seat === 0 && e.data.reason === 'left'), 'the others are told');
        assert.equal(v.match.turn_seat, 1, 'the turn passes to the next player');
        // The player on turn disconnects for longer than the limit.
        await s.sql("update bsu_match_players set last_seen_at = now() - interval '45 seconds' where match_id = $1::uuid and seat = 1", [id]);
        v = await s.handle('p3', 'match_state', { match_id: id, since: 0 });
        assert.ok(v.events.some(e => e.type === 'away' && e.data.seat === 1));
        v = await s.handle('p2', 'match_state', { match_id: id, since: 0 });
        assert.ok(v.events.some(e => e.type === 'back' && e.data.seat === 1), 'reconnecting is announced');
        await s.sql("update bsu_match_players set last_seen_at = now() - interval '5 minutes' where match_id = $1::uuid and seat = 1", [id]);
        v = await s.handle('p3', 'match_state', { match_id: id, since: 0 });
        assert.equal(v.match.status, 'finished');
        const ranks = Object.fromEntries(v.match.result.rankings.map(r => [r.name, [r.rank, r.gold, r.left]]));
        assert.deepEqual(ranks, { Chitra: [1, 90, false], Bala: [2, 0, true], Asha: [3, 0, true] }, 'leavers get no reward');

        // Two players against the computer: the server rolls for everyone.
        v = await s.handle('p1', 'match_create', { game: 'snakes', mode: 'ai', seats: 2, color: 'Gold' });
        assert.equal(v.match.status, 'active'); assert.equal(v.players[1].is_ai, true);
        let guard = 0;
        while (v.match.status === 'active' && guard++ < 500) v = await s.handle('p1', 'snakes_roll', { match_id: v.match.id, since: v.match.seq });
        assert.equal(v.match.status, 'finished');
        const mine = v.match.result.rankings.find(r => !r.is_ai);
        assert.deepEqual([mine.gold, mine.xp], mine.rank === 1 ? [30, 20] : [5, 5]);
        // The daily cap on rewarded computer games.
        for (let n = 0; n < 5; n++) {
            v = await s.handle('p1', 'match_create', { game: 'snakes', mode: 'ai', seats: 2 });
            guard = 0;
            while (v.match.status === 'active' && guard++ < 500) v = await s.handle('p1', 'snakes_roll', { match_id: v.match.id, since: v.match.seq });
        }
        const last = v.match.result.rankings.find(r => !r.is_ai);
        assert.equal(last.capped, true); assert.equal(last.gold, 0);
        // A waiting lobby cancelled by its host.
        v = await s.handle('p2', 'match_create', { game: 'snakes', mode: 'online', seats: 2, invite: [pids[2]] });
        await s.handle('p2', 'match_leave', { match_id: v.match.id });
        assert.equal((await s.handle('p3', 'match_respond', { match_id: v.match.id, accept: true })).error, 'not_waiting');
    } finally { await s.close(); }
});

test('server: chess — every move is checked by the rules engine', async () => {
    const s = await createServer();
    try {
        const { pids } = await lobby(s, 2, 'chess');
        let v = await s.handle('p1', 'match_create', { game: 'chess', mode: 'online', invite: [pids[1]] });
        const id = v.match.id;
        v = await s.handle('p2', 'match_respond', { match_id: id, accept: true });
        assert.equal(v.match.status, 'active');
        assert.deepEqual(v.players.map(p => p.color), ['White', 'Black']);
        const move = (uid, from, to, promotion) => s.handle(uid, 'chess_move', { match_id: id, from, to, promotion, since: 0 });
        assert.equal((await move('p2', 'e7', 'e5')).error, 'not_your_turn');
        assert.equal((await move('p1', 'e2', 'e5')).error, 'illegal_move');
        assert.equal((await move('p1', 'e1', 'e2')).error, 'illegal_move');
        assert.equal((await move('p1', 'z9', 'e4')).error, 'bad_square');
        assert.equal((await move('p3', 'e2', 'e4')).error, 'not_in_match');
        v = await move('p1', 'f2', 'f3');
        assert.equal(v.match.turn_seat, 1);
        v = await move('p2', 'e7', 'e5');
        v = await move('p1', 'g2', 'g4');
        v = await move('p2', 'd8', 'h4');            // fool's mate
        assert.equal(v.match.status, 'finished');
        assert.equal(v.match.result.outcome, 'win'); assert.equal(v.match.result.reason, 'checkmate');
        const last = v.events.filter(e => e.type === 'move').at(-1).data;
        assert.equal(last.san, 'Qh4#'); assert.equal(last.over, 'checkmate'); assert.equal(last.piece, 'q');
        const ranks = Object.fromEntries(v.match.result.rankings.map(r => [r.name, [r.rank, r.gold, r.xp]]));
        assert.deepEqual(ranks, { Bala: [1, 150, 100], Asha: [2, 15, 10] });
        const seenByLoser = await s.handle('p1', 'match_state', { match_id: id, since: 0 });
        assert.equal(seenByLoser.match.state.fen, v.match.state.fen, 'both players see the same board');
        assert.equal((await move('p1', 'a2', 'a3')).error, 'not_active');
    } finally { await s.close(); }
});

test('server: chess — castling, en passant, promotion, draws, resignation, abandonment', async () => {
    const s = await createServer();
    try {
        const { pids } = await lobby(s, 2);
        const start = async () => {
            const made = await s.handle('p1', 'match_create', { game: 'chess', mode: 'online', invite: [pids[1]] });
            await s.handle('p2', 'match_respond', { match_id: made.match.id, accept: true });
            return made.match.id;
        };
        const turns = {};
        const play = async (id, moves) => {
            let v, turn = turns[id] || 0;
            for (const m of moves) {
                v = await s.handle(turn ? 'p2' : 'p1', 'chess_move', { match_id: id, from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4], since: 0 });
                assert.equal(v.ok, true, `${m}: ${v.error}`);
                turn = 1 - turn;
            }
            turns[id] = turn;
            return v;
        };
        let id = await start();
        let v = await play(id, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);                  // en passant
        let data = v.events.filter(e => e.type === 'move').at(-1).data;
        assert.equal(data.en_passant, true); assert.equal(data.captured, 'p');
        v = await play(id, ['c7d6', 'g1f3', 'b7b5', 'f1e2', 'b5b4']);
        assert.equal((await s.handle('p1', 'chess_move', { match_id: id, from: 'e1', to: 'c1' })).error, 'illegal_move', 'cannot castle through pieces');
        v = await s.handle('p1', 'chess_move', { match_id: id, from: 'e1', to: 'g1', since: 0 });   // castle kingside
        assert.equal(v.events.filter(e => e.type === 'move').at(-1).data.castle, 'king');
        // Draw offer: decline, then accept.
        assert.equal((await s.handle('p1', 'chess_action', { match_id: id, do: 'accept_draw' })).error, 'no_draw_offer');
        await s.handle('p2', 'chess_action', { match_id: id, do: 'offer_draw' });
        assert.equal((await s.handle('p2', 'chess_action', { match_id: id, do: 'accept_draw' })).error, 'no_draw_offer', 'you cannot accept your own offer');
        v = await s.handle('p1', 'chess_action', { match_id: id, do: 'decline_draw', since: 0 });
        assert.ok(v.events.some(e => e.type === 'draw_declined'));
        await s.handle('p1', 'chess_action', { match_id: id, do: 'offer_draw' });
        v = await s.handle('p2', 'chess_action', { match_id: id, do: 'accept_draw', since: 0 });
        assert.equal(v.match.result.outcome, 'draw'); assert.equal(v.match.result.reason, 'agreement');
        assert.deepEqual(v.match.result.rankings.map(r => r.gold), [50, 50]);

        // Promotion (a position set up by the test), then stalemate detection by the engine.
        id = await start();
        await s.sql(`update bsu_matches set state = state || '{"fen":"8/P6k/8/8/8/8/8/K7 w - - 0 1","history":[]}' where id = $1::uuid`, [id]);
        v = await s.handle('p1', 'chess_move', { match_id: id, from: 'a7', to: 'a8', promotion: 'n', since: 0 });
        data = v.events.filter(e => e.type === 'move').at(-1).data;
        assert.equal(data.promotion, 'n'); assert.equal(data.san, 'a8=N');
        assert.equal(v.match.status, 'finished', 'king and knight against king is a draw');
        assert.equal(v.match.result.reason, 'insufficient_material');

        id = await start();
        await s.sql(`update bsu_matches set state = state || '{"fen":"7k/5Q2/8/8/8/8/8/K7 w - - 0 1","history":[]}' where id = $1::uuid`, [id]);
        v = await s.handle('p1', 'chess_move', { match_id: id, from: 'f7', to: 'g6', since: 0 });
        assert.equal(v.match.result.reason, 'stalemate'); assert.equal(v.match.result.outcome, 'draw');

        // Resignation.
        id = await start();
        v = await s.handle('p1', 'chess_action', { match_id: id, do: 'resign', since: 0 });
        assert.equal(v.match.result.winner_seat, 1); assert.equal(v.match.result.reason, 'resignation');
        assert.deepEqual(v.match.result.rankings.map(r => [r.name, r.gold]), [['Bala', 150], ['Asha', 15]]);

        // Leaving an active match counts as resigning; the loser who left earns nothing.
        id = await start();
        await s.handle('p2', 'match_leave', { match_id: id });
        v = await s.handle('p1', 'match_state', { match_id: id, since: 0 });
        assert.equal(v.match.status, 'finished'); assert.equal(v.match.result.winner_seat, 0);
        assert.ok(v.events.some(e => e.type === 'left' && e.data.seat === 1));
        assert.equal(v.match.result.rankings.find(r => r.name === 'Bala').gold, 0);

        // Abandonment: the player to move disappears.
        id = await start();
        await s.sql("update bsu_match_players set last_seen_at = now() - interval '10 minutes' where match_id = $1::uuid and seat = 0", [id]);
        v = await s.handle('p2', 'match_state', { match_id: id, since: 0 });
        assert.equal(v.match.result.reason, 'abandonment'); assert.equal(v.match.result.winner_seat, 1);
        // Reconnection: a finished or running match can always be read again by its players.
        assert.equal((await s.handle('p1', 'match_state', { match_id: id, since: 0 })).match.status, 'finished');
    } finally { await s.close(); }
});

test('server: chess against the computer is played and judged on the server', async () => {
    const s = await createServer();
    try {
        let v = await s.handle('u1', 'match_create', { game: 'chess', mode: 'ai', side: 'black', ai_level: 1, name: 'Arjun' });
        assert.equal(v.match.state.history.length, 1, 'the computer, playing white, has already moved');
        assert.equal(v.match.turn_seat, 0);
        const id = v.match.id;
        // Play legal moves until the game ends or 12 moves have been made; every reply must be legal.
        const chess = new s.Chess();
        for (const san of v.match.state.history) chess.move(san);
        for (let n = 0; n < 12 && v.match.status === 'active'; n++) {
            const mine = chess.moves({ verbose: true })[0];
            v = await s.handle('u1', 'chess_move', { match_id: id, from: mine.from, to: mine.to, promotion: mine.promotion, since: 0 });
            assert.equal(v.ok, true);
            const replay = new s.Chess();
            for (const san of v.match.state.history) replay.move(san);   // throws if any stored move were illegal
            assert.equal(replay.fen(), v.match.state.fen);
            chess.load(v.match.state.fen);
        }
        v = await s.handle('u1', 'chess_action', { match_id: id, do: 'offer_draw', since: 0 });
        if (v.ok) assert.ok(v.events.some(e => e.type === 'draw_declined'));
        v = await s.handle('u1', 'chess_action', { match_id: id, do: 'resign', since: 0 });
        if (v.ok) assert.equal(v.match.status, 'finished');
    } finally { await s.close(); }
});
