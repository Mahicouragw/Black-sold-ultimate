import { readFileSync } from 'node:fs';
import pg from 'pg';
import { readSecrets, redact } from './neon-secrets.mjs';

const secret = readSecrets();
if (!secret.database_url) throw new Error('Neon database credentials are unavailable.');
const sql = readFileSync('neon/schema.sql', 'utf8');
const client = new pg.Client({ connectionString: secret.database_url, application_name: 'black-sword-neon-migration' });

function safeError(error) {
    return redact(error?.message || error, [secret.database_url, secret.identity_assertion]);
}

try {
    await client.connect();
    await client.query("select pg_advisory_lock(hashtext('black-sword-neon-schema-v1'))");
    await client.query('begin');
    // The schema attaches triggers to Neon Auth's tables, so Auth must exist
    // first. Failing here is much clearer than a cascade of FK/trigger errors.
    const auth = await client.query(`select to_regclass('neon_auth."user"') as users, to_regclass('neon_auth.account') as accounts`);
    if (!auth.rows[0]?.users || !auth.rows[0]?.accounts) {
        throw new Error('Neon Auth is not provisioned for this project (neon_auth."user" / neon_auth.account are missing). Enable Managed Better Auth, then re-run.');
    }
    await client.query("set local statement_timeout = '10min'");
    await client.query("set local lock_timeout = '30s'");
    await client.query(sql);
    await client.query(`create table if not exists public.backend_migrations(
        version text primary key,
        applied_at timestamptz not null default now()
    )`);
    await client.query('alter table public.backend_migrations enable row level security');
    await client.query('revoke all on public.backend_migrations from public, anonymous, authenticated');
    await client.query("insert into public.backend_migrations(version) values('2026.10.23-neon-v1') on conflict(version) do nothing");
    await client.query('commit');
    const applied = await client.query('select count(*)::int as count from public.backend_migrations');
    console.log(`Neon schema applied atomically through player trading v20 (backend_migrations rows: ${applied.rows[0].count}).`);
} catch (error) {
    await client.query('rollback').catch(() => {});
    throw new Error(`Neon schema migration failed: ${safeError(error)}`);
} finally {
    await client.query("select pg_advisory_unlock(hashtext('black-sword-neon-schema-v1'))").catch(() => {});
    await client.end().catch(() => {});
}
