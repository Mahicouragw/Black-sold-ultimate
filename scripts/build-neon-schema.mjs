/*
 * Generates neon/schema.sql from the reviewed Supabase migrations.
 *
 * The output is deterministic: identical sources always produce an identical
 * file. The generator fails the build if any Supabase-only dependency survives.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const sources = [
    'supabase/schema.sql',
    'supabase/apply_all_updates.sql',
    'supabase/features_v20_player_trading.sql'
];

/*
 * Runs before every migrated object.
 *
 * Neon has no `auth` schema. The Data API (PostgREST-compatible) supplies the
 * verified JWT in `request.jwt.claims`, so the three Supabase helpers are
 * re-implemented on top of it. Keeping auth.uid() means every existing policy
 * and every security-definer RPC keeps its original shape.
 *
 * Neon Auth (Better Auth) stores `neon_auth."user".id` as text, while this
 * application has always used uuid keys. public.neon_subject_uuid() bridges the
 * two: a UUID-shaped subject passes through unchanged (Neon projects that store
 * uuids keep working) and any other subject is mapped deterministically to a
 * uuid. Profiles therefore stay uuid-keyed without the browser ever seeing a
 * mapping secret.
 */
const bootstrap = `
-- ============================================================================
-- Neon compatibility bootstrap (generated)
-- ============================================================================
do $neon_roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end
$neon_roles$;

create or replace function public.neon_subject_uuid(subject text)
returns uuid
language plpgsql
immutable
as $neon_subject_uuid$
begin
  if subject is null or subject = '' then
    return null;
  end if;
  if subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return subject::uuid;
  end if;
  return (substr(md5(subject), 1, 8) || '-' || substr(md5(subject), 9, 4) || '-' ||
          substr(md5(subject), 13, 4) || '-' || substr(md5(subject), 17, 4) || '-' ||
          substr(md5(subject), 21, 12))::uuid;
end;
$neon_subject_uuid$;

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $auth_jwt$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$auth_jwt$;

create or replace function auth.role()
returns text
language sql
stable
as $auth_role$
  select coalesce(nullif(auth.jwt() ->> 'role', ''),
                  nullif(current_setting('request.jwt.claim.role', true), ''),
                  current_user)
$auth_role$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $auth_uid$
  select public.neon_subject_uuid(nullif(auth.jwt() ->> 'sub', ''))
$auth_uid$;

grant usage on schema auth to authenticated, anonymous;
grant execute on function auth.uid(), auth.role(), auth.jwt() to authenticated, anonymous;
grant execute on function public.neon_subject_uuid(text) to authenticated, anonymous;
grant usage on schema public to authenticated, anonymous;
`;

/*
 * Runs after every migrated object. These statements only open the SQL
 * surface the Data API needs; row visibility is still decided by the RLS
 * policies that were carried over unchanged.
 */
const postamble = `
-- ============================================================================
-- Neon Data API privileges (generated)
-- ============================================================================
grant usage on schema public to authenticated, anonymous;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
`;

function transform(source) {
    let sql = source;
    // pgcrypto lives in an explicit schema so security-definer bodies that call
    // extensions.crypt() keep resolving under a pinned search_path.
    sql = sql.replace(/create extension if not exists pgcrypto;/gi,
        'create schema if not exists extensions;\ncreate extension if not exists pgcrypto with schema extensions;');
    sql = sql.replace(/auth\.users/gi, 'neon_auth."user"');
    sql = sql.replace(/auth\.identities/gi, 'neon_auth.account');
    sql = sql.replace(/new\.raw_user_meta_data->>'display_name'/gi, 'new.name');
    sql = sql.replace(
        /where\s+user_id\s*=\s*auth\.uid\(\)\s+and\s+provider\s*<>\s*'anonymous'/gi,
        'where "userId"::text = coalesce(auth.jwt() ->> \'sub\', \'\') and "providerId" <> \'credential\''
    );
    // Neon calls the unauthenticated Data API role "anonymous".
    sql = sql.replace(/\banon\b/g, 'anonymous');
    // There is no browser-accessible service role on Neon. Owner-only functions
    // remain executable by the migration owner and optional pg_cron jobs.
    sql = sql.replace(/^\s*grant execute on function public\.purge_expired_chat_messages\(\) to service_role;\s*$/gmi, '');
    // Supabase publications do not exist on Neon. The browser compatibility
    // client uses authenticated polling for the same inserts/updates/deletes.
    sql = sql.replace(/do\s+\$\$\s*begin\s*alter publication\s+supabase_realtime\b.*?end\s*\$\$;/gis, '');
    sql = sql.replace(/do\s*\$\$\s*begin\s*alter publication\s+supabase_realtime\b.*?end\s*\$\$\s*;/gis, '');
    // The migration runner owns the outer transaction, making a partial apply
    // impossible and allowing a failed run to be retried safely.
    sql = sql.replace(/^\s*(?:begin|commit);\s*$/gmi, '');
    // Every named policy is replaceable on a rerun, including policies in the
    // original migrations that predate explicit DROP statements.
    sql = sql.replace(/create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.\"]*)/gi,
        (_match, policy, table) => `drop policy if exists ${policy} on ${table};\ncreate policy ${policy} on ${table}`);
    // neon_auth."user".id is text on Neon Auth, so no cross-schema foreign key
    // can be declared against the uuid-keyed application tables. Deletion is
    // emulated by the trigger added below.
    sql = sql.replace(/\s+references\s+neon_auth\."user"\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/gi, '');
    // Map the Auth subject to the application's uuid key when a profile is
    // created, and make sure a deleted Auth user cannot leave an orphan.
    sql = sql.replace(/values\s*\(\s*new\.id\s*,/gi, 'values (public.neon_subject_uuid(new.id::text),');
    return sql.trim();
}

const generated = sources.map(path => {
    const source = readFileSync(path, 'utf8');
    return `\n-- Source: ${path}\n${transform(source)}\n`;
}).join('\n');

const cascadeCleanup = `

-- Keep application rows cascade-clean without a cross-schema foreign key.
create or replace function public.delete_player_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $delete_player_profile$
begin
  delete from public.profiles where id = public.neon_subject_uuid(old.id::text);
  return old;
end;
$delete_player_profile$;

drop trigger if exists delete_profile_after_user_delete on neon_auth."user";
create trigger delete_profile_after_user_delete
after delete on neon_auth."user"
for each row execute function public.delete_player_profile();
`;

const header = `-- Black Sword Ultimate — Neon Postgres, Auth and Data API schema.
-- GENERATED by scripts/build-neon-schema.mjs. Do not edit by hand.
-- Includes every application migration through player-to-player trading (v20).
-- Neon Auth identities live in neon_auth; Supabase realtime publications are
-- intentionally replaced by the authenticated polling client in neon-game-client.js.
`;
const output = `${header}\n${bootstrap}\n${generated}\n${cascadeCleanup}\n${postamble}`;

const forbidden = [
    [/\bauth\.users\b/i, 'auth.users'],
    [/\bauth\.identities\b/i, 'auth.identities'],
    [/supabase_realtime/i, 'supabase_realtime'],
    [/\bservice_role\b/i, 'service_role'],
    [/\bto\s+anon\b/i, 'the anon role'],
    [/\bstorage\.(?:objects|buckets)\b/i, 'Supabase storage'],
    [/\brealtime\.(?:messages|subscription)\b/i, 'Supabase realtime tables'],
    [/^\s*(?:begin|commit);\s*$/im, 'an explicit BEGIN/COMMIT']
];
for (const [pattern, name] of forbidden) {
    if (pattern.test(output)) throw new Error(`Neon schema still contains a forbidden Supabase dependency: ${name}`);
}
for (const required of [
    'neon_auth."user"',
    'neon_auth.account',
    "\\'credential\\'",
    'create or replace function auth.uid()',
    'create or replace function auth.jwt()',
    'public.neon_subject_uuid(new.id::text)',
    'grant execute on function auth.uid()'
]) {
    if (!output.includes(required.replaceAll("\\'", "'"))) {
        throw new Error(`Neon schema is missing a required compatibility construct: ${required}`);
    }
}
if (!output.includes('neon_auth.account') || !output.includes('"providerId" <> \'credential\'')) {
    throw new Error('Neon linked-identity function was not migrated correctly.');
}
mkdirSync('neon', { recursive: true });
writeFileSync('neon/schema.sql', output);
console.log(`Generated neon/schema.sql (${output.split('\n').length} lines) from ${sources.length} ordered migrations.`);
