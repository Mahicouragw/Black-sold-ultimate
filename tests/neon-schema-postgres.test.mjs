/*
 * Postgres-backed verification of the generated Neon schema.
 *
 * Runs against PGlite (PostgreSQL compiled to WebAssembly) so `npm test` proves
 * the real DDL — not a string match — on any machine without a database server.
 * The schema is applied TWICE and two independent identities are exercised
 * through `set role authenticated` + request.jwt.claims, exactly the way the
 * Neon Data API presents a verified JWT to Postgres.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const schema = readFileSync('neon/schema.sql', 'utf8');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const SUB_A = 'neon-user-alpha';
const SUB_B = 'neon-user-beta';

/** Neon Auth's Better Auth tables, as the managed service creates them. */
const neonAuthStub = idType => `
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id ${idType} primary key,
  name text not null default 'Wandering Hero',
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create table if not exists neon_auth.account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" ${idType} not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
`;

async function database(idType = 'text') {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec('create schema if not exists extensions;');
    await db.exec(neonAuthStub(idType));
    return db;
}

async function asUser(db, subject) {
    await db.exec('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: subject, role: 'authenticated' })]);
}

async function asOwner(db) {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
}

test('neon/schema.sql applies twice and enforces RLS isolation between two users', async t => {
    const db = await database();
    t.after(() => db.close());

    for (let run = 1; run <= 2; run++) {
        // Applying the generated file twice proves it is rerunnable; the runner
        // wraps the same file in one transaction with an advisory lock.
        await db.exec(schema);
    }

    const tables = await db.query(`select tablename, rowsecurity from pg_tables
        where schemaname='public' and tablename = any($1)`, [[
        'profiles', 'game_saves', 'friend_requests', 'messages', 'guilds', 'guild_members',
        'chat_rooms', 'chat_room_messages', 'game_hall_sessions', 'game_hall_members',
        'trade_offers', 'community_map_markers', 'world_drops', 'game_feedback'
    ]]);
    assert.equal(tables.rows.length, 14, 'A required application table is missing');
    for (const row of tables.rows) assert.equal(row.rowsecurity, true, `${row.tablename} has no RLS`);

    const functions = await db.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname = any($1)`, [[
        'get_my_profile', 'has_linked_identity', 'recover_progress_with_pin', 'create_custom_chat_room',
        'create_game_hall_session', 'update_game_hall_state', 'create_trade_offer', 'accept_trade_offer',
        'neon_subject_uuid'
    ]]);
    assert.equal(functions.rows.length, 9, 'A required RPC is missing');

    // The Auth trigger creates one profile per Neon Auth user, keyed by the
    // deterministic uuid bridge (Neon Auth ids are text, not uuid).
    await db.query(`insert into neon_auth."user"(id,email,name) values ($1,$2,$3),($4,$5,$6)`,
        [SUB_A, 'alpha@black-sword.local', 'Mock Alpha', SUB_B, 'beta@black-sword.local', 'Mock Beta']);
    const profiles = await db.query('select id, player_code, display_name from public.profiles order by display_name');
    assert.equal(profiles.rows.length, 2, 'The Auth trigger did not create both profiles');
    for (const profile of profiles.rows) assert.match(profile.player_code, /^KND-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const ids = await db.query(`select public.neon_subject_uuid($1) as a, public.neon_subject_uuid($2) as b`, [SUB_A, SUB_B]);
    assert.equal(ids.rows[0].a, profiles.rows[0].id);
    assert.equal(ids.rows[0].b, profiles.rows[1].id);
    assert.equal((await db.query('select public.neon_subject_uuid($1) as a', [USER_A])).rows[0].a, USER_A,
        'UUID-shaped Neon Auth subjects must pass through unchanged');

    // Cloud-save isolation through the Data API role.
    await asUser(db, SUB_A);
    assert.equal((await db.query('select auth.uid() as id')).rows[0].id, ids.rows[0].a);
    await db.query(`insert into public.game_saves(user_id,save_data) values(auth.uid(),$1)`,
        [{ player: { name: 'Private Alpha', gold: 42 } }]);
    assert.equal((await db.query('select count(*)::int as count from public.game_saves')).rows[0].count, 1);

    await asUser(db, SUB_B);
    assert.equal((await db.query('select count(*)::int as count from public.game_saves')).rows[0].count, 0,
        'RLS leaked another user cloud save');
    await assert.rejects(
        db.query(`insert into public.game_saves(user_id,save_data) values((select id from public.profiles limit 1),'{}'::jsonb)`),
        /row-level security|permission denied|policy/i);

    // Friend requests require a linked (non-guest) identity.
    await assert.rejects(
        db.query('insert into public.friend_requests(sender_id,receiver_id) select $1,$2', [ids.rows[0].b, ids.rows[0].a]),
        /row-level security|policy|permission denied/i);

    await asOwner(db);
    await db.query(`insert into neon_auth.account(id,"accountId","providerId","userId") values('acc-alpha','google-1','google',$1)`, [SUB_A]);

    await asUser(db, SUB_A);
    assert.equal((await db.query('select public.has_linked_identity() as linked')).rows[0].linked, true);
    const friend = await db.query('insert into public.friend_requests(sender_id,receiver_id) values(auth.uid(),$1) returning id',
        [ids.rows[0].b]);
    assert.ok(friend.rows[0].id);

    // The receiving user may accept, and nobody else may see the row.
    await asUser(db, SUB_B);
    assert.equal((await db.query('select count(*)::int as c from public.friend_requests')).rows[0].c, 1);
    await db.query(`update public.friend_requests set status='accepted' where receiver_id=auth.uid()`);
    assert.equal((await db.query(`select status from public.friend_requests`)).rows[0].status, 'accepted');

    await asUser(db, SUB_A);
    assert.equal((await db.query('select public.has_linked_identity() as linked')).rows[0].linked, true);
    assert.equal((await db.query('select count(*)::int as c from public.friend_requests')).rows[0].c, 1);

    await asOwner(db);
    const anon = await db.query(`select count(*)::int as c from public.game_saves`);
    assert.equal(anon.rows[0].c, 1, 'The owner must still see both backend rows');

    // Removing the Auth user must cascade through the trigger.
    await db.query('delete from neon_auth."user" where id=$1', [SUB_A]);
    assert.equal((await db.query('select display_name from public.profiles order by display_name')).rows.length, 1,
        'Deleting a Neon Auth user left an orphaned profile');
});

test('the same schema also accepts a uuid-keyed Neon Auth user table', async t => {
    const db = await database('uuid');
    t.after(() => db.close());
    await db.exec(schema);
    await db.exec(schema);
    await db.query(`insert into neon_auth."user"(id,email,name) values($1,'gamma@black-sword.local','Mock Gamma')`, [USER_A]);
    const profile = await db.query('select id, display_name from public.profiles');
    assert.equal(profile.rows.length, 1);
    assert.equal(profile.rows[0].id, USER_A, 'A uuid Neon Auth subject must map to itself');
    await asUser(db, USER_A);
    assert.equal((await db.query('select auth.uid() as id')).rows[0].id, USER_A);
    await db.query(`insert into public.game_saves(user_id,save_data) values(auth.uid(),'{}'::jsonb)`);
    assert.equal((await db.query('select count(*)::int as c from public.game_saves')).rows[0].c, 1);
});
