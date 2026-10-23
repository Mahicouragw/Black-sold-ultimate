import { readFileSync } from 'node:fs';
import pg from 'pg';

const secretPath = process.env.NEON_SECRET_FILE || '/tmp/black-sword-neon-secrets.json';
const secret = JSON.parse(readFileSync(secretPath, 'utf8'));
if (!secret.database_url) throw new Error('Neon database credentials are unavailable.');
const sql = readFileSync('neon/schema.sql', 'utf8');
const client = new pg.Client({ connectionString: secret.database_url, application_name: 'black-sword-neon-migration' });

function safeError(error) {
    return String(error?.message || error).replaceAll(secret.database_url, '[database credentials]').replaceAll(secret.identity_assertion || '', '[identity assertion]');
}

try {
    await client.connect();
    await client.query("select pg_advisory_lock(hashtext('black-sword-neon-schema-v1'))");
    await client.query('begin');
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
    console.log('Neon schema applied atomically through player trading v20.');
} catch (error) {
    await client.query('rollback').catch(() => {});
    throw new Error(`Neon schema migration failed: ${safeError(error)}`);
} finally {
    await client.query("select pg_advisory_unlock(hashtext('black-sword-neon-schema-v1'))").catch(() => {});
    await client.end().catch(() => {});
}
