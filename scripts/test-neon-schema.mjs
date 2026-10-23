import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
// A mock credential, but still outside /tmp and outside the repository.
const secretDirectory = mkdtempSync(join(homedir(), '.black-sword-neon-test-'));
const secretFile = join(secretDirectory, 'secrets.json');
writeFileSync(secretFile, `${JSON.stringify({ database_url: databaseUrl, identity_assertion: 'local-test-only' })}\n`, { mode: 0o600 });
const admin = new pg.Client({ connectionString: databaseUrl, application_name: 'black-sword-neon-schema-test' });
await admin.connect();
try {
    await admin.query('drop schema if exists public cascade');
    await admin.query('create schema public');
    await admin.query('drop schema if exists neon_auth cascade');
    await admin.query('drop schema if exists extensions cascade');
    await admin.query('drop schema if exists auth cascade');
    await admin.query('drop role if exists authenticated');
    await admin.query('drop role if exists anonymous');
    await admin.query('create role authenticated nologin');
    await admin.query('create role anonymous nologin');
    await admin.query(`create schema if not exists auth;
        create schema neon_auth;
        create table neon_auth."user"(
            id uuid primary key,
            name text not null default 'Wandering Hero',
            email text not null unique,
            "createdAt" timestamptz not null default now()
        );
        create table neon_auth.account(
            id uuid primary key default gen_random_uuid(),
            "accountId" text not null,
            "providerId" text not null,
            "userId" uuid not null references neon_auth."user"(id) on delete cascade,
            "createdAt" timestamptz not null default now(),
            "updatedAt" timestamptz not null default now()
        );
        grant usage on schema public to authenticated, anonymous;
        grant usage on schema auth to authenticated, anonymous;
    `);
    for (let run = 1; run <= 2; run++) {
        execFileSync(process.execPath, ['scripts/neon-migrate.mjs'], {
            env: { ...process.env, NEON_SECRET_FILE: secretFile },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        console.log(`Mock Neon schema apply ${run}: PASS`);
    }

    const setClaims = async sub => admin.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub, role: 'authenticated' })]);
    const resetClaims = async () => admin.query(`select set_config('request.jwt.claims', '', false)`);

    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    await admin.query(`insert into neon_auth."user"(id,email,name) values
        ($1,'alpha@black-sword.local','Mock Alpha'),($2,'beta@black-sword.local','Mock Beta')`, [userA, userB]);
    const profiles = await admin.query('select id,player_code,display_name from public.profiles where id=any($1) order by id', [[userA, userB]]);
    assert.equal(profiles.rowCount, 2, 'Auth trigger did not create both profiles');
    for (const profile of profiles.rows) assert.match(profile.player_code, /^KND-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    await admin.query(`insert into neon_auth.account("accountId","providerId","userId")
        values('mock-google','google',$1)`, [userA]);
    await setClaims(userA);
    assert.equal((await admin.query('select public.has_linked_identity() as linked')).rows[0].linked, true);
    await setClaims(userB);
    assert.equal((await admin.query('select public.has_linked_identity() as linked')).rows[0].linked, false);
    await resetClaims();

    await admin.query('set role authenticated');
    await setClaims(userA);
    await admin.query(`insert into public.game_saves(user_id,save_data) values($1,$2)`, [userA, { player: { name: 'Private Alpha', gold: 42 } }]);
    assert.equal((await admin.query('select count(*)::int as count from public.game_saves')).rows[0].count, 1);
    await setClaims(userB);
    assert.equal((await admin.query('select count(*)::int as count from public.game_saves')).rows[0].count, 0, 'RLS leaked a cloud save to another user');
    await assert.rejects(admin.query(`insert into public.friend_requests(sender_id,receiver_id) values($1,$2)`, [userB, userA]), /row-level security|policy/i);
    await admin.query('reset role');
    await resetClaims();

    const required = ['profiles','game_saves','friend_requests','messages','chat_rooms','chat_room_messages','game_hall_sessions','trade_offers','community_map_markers','world_drops','game_feedback'];
    const tables = await admin.query('select tablename,rowsecurity from pg_tables where schemaname=$1 and tablename=any($2)', ['public', required]);
    assert.equal(tables.rowCount, required.length);
    for (const table of tables.rows) assert.equal(table.rowsecurity, true, `${table.tablename} lost RLS`);
    console.log('Mock Neon Auth trigger, linked identity, cloud-save RLS, guest restrictions, and idempotent schema: PASS');
} finally {
    await admin.end().catch(() => {});
    rmSync(secretDirectory, { recursive: true, force: true });
}
