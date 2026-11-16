-- Black Sword Ultimate: online data (profiles, saves, chat, friends, guilds...).
-- Part 1 of 3: tables. Safe to run more than once.
--
-- Everything lives in the private schema "bsu_social". That schema is not
-- offered by the public data API, so a browser can never read or write these
-- tables directly. The only way in is public.bsu_data(), which only the
-- bsu-data server function (service role) may call after it has checked the
-- player's sign-in token. Player ids are the sign-in ids (text).

create schema if not exists bsu_social;
revoke all on schema bsu_social from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'bsu_player') then create role bsu_player nologin noinherit; end if;
end $$;
grant usage on schema bsu_social to bsu_player;

create or replace function bsu_social.uid() returns text language sql stable as
$$ select nullif(current_setting('bsu.uid', true), '') $$;
create or replace function bsu_social.is_google() returns boolean language sql stable as
$$ select coalesce(current_setting('bsu.google', true), '') = '1' $$;
create or replace function bsu_social.norm(t text) returns text language sql immutable as
$$ select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')) $$;

create table if not exists bsu_social.profiles (
  id text primary key check (length(id) between 1 and 128),
  display_name text not null default 'Wandering Hero' check (length(display_name) between 1 and 40),
  level int not null default 1 check (level between 1 and 999),
  current_location text not null default 'Kaliwasch City' check (length(current_location) <= 120),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists profiles_name_idx on bsu_social.profiles (bsu_social.norm(display_name));
create index if not exists profiles_seen_idx on bsu_social.profiles (last_seen desc);

-- Private part of an account. The Player ID is a login secret, so it is kept
-- apart from the public profile and is never listed.
create table if not exists bsu_social.accounts (
  user_id text primary key,
  player_code text not null unique,
  google boolean not null default false,
  email text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists bsu_social.player_recovery (
  owner_id text primary key,
  player_code text not null,
  pin_key text not null,
  updated_at timestamptz not null default now()
);
create index if not exists player_recovery_code_idx on bsu_social.player_recovery (player_code);
create table if not exists bsu_social.recovery_attempts (
  player_code text not null, user_id text not null, at timestamptz not null default now()
);
create index if not exists recovery_attempts_idx on bsu_social.recovery_attempts (player_code, at);

create table if not exists bsu_social.game_saves (
  user_id text primary key,
  save_data jsonb not null default '{}'::jsonb check (octet_length(save_data::text) < 3000000),
  updated_at timestamptz not null default now()
);

create table if not exists bsu_social.hero_names (
  normalized_name text primary key,
  owner_id text not null,
  hero_slot text not null default '',
  hero_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists hero_names_owner_idx on bsu_social.hero_names (owner_id);

create table if not exists bsu_social.friend_requests (
  id text primary key default gen_random_uuid()::text,
  sender_id text not null,
  receiver_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sender_id, receiver_id),
  check (sender_id <> receiver_id)
);
create index if not exists friend_requests_receiver_idx on bsu_social.friend_requests (receiver_id);

create table if not exists bsu_social.messages (
  id text primary key default gen_random_uuid()::text,
  sender_id text not null,
  receiver_id text,
  body text not null check (length(body) between 1 and 300),
  voice_id text not null default 'system:default' check (length(voice_id) <= 80),
  source_language text not null default 'en' check (length(source_language) <= 12),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index if not exists messages_created_idx on bsu_social.messages (created_at);

create table if not exists bsu_social.game_feedback (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  display_name text not null default 'Hero',
  category text not null default 'gameplay',
  kind text not null default 'feedback',
  message text not null check (length(message) between 3 and 2000),
  status text not null default 'new',
  resolution_note text not null default '',
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_feedback_created_idx on bsu_social.game_feedback (created_at desc);
-- Who may read all feedback: a player id listed here, or a Google account
-- whose verified e-mail address is listed in owner_emails.
create table if not exists bsu_social.moderators (user_id text primary key, note text);
create table if not exists bsu_social.owner_emails (email text primary key);

create table if not exists bsu_social.guilds (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) between 3 and 32),
  owner_id text not null,
  rupees int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name_idx on bsu_social.guilds (bsu_social.norm(name));
create table if not exists bsu_social.guild_members (
  guild_id text not null references bsu_social.guilds(id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (length(role) <= 20),
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
create index if not exists guild_members_user_idx on bsu_social.guild_members (user_id);
create table if not exists bsu_social.guild_invites (
  id text primary key default gen_random_uuid()::text,
  guild_id text not null references bsu_social.guilds(id) on delete cascade,
  sender_id text not null,
  receiver_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, receiver_id)
);
create index if not exists guild_invites_receiver_idx on bsu_social.guild_invites (receiver_id);

create table if not exists bsu_social.combat_groups (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) between 1 and 40),
  owner_id text not null,
  status text not null default 'open' check (length(status) <= 20),
  created_at timestamptz not null default now()
);
create table if not exists bsu_social.combat_group_members (
  group_id text not null references bsu_social.combat_groups(id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (length(role) <= 20),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists combat_group_members_user_idx on bsu_social.combat_group_members (user_id);
create table if not exists bsu_social.combat_group_invites (
  id text primary key default gen_random_uuid()::text,
  group_id text not null references bsu_social.combat_groups(id) on delete cascade,
  sender_id text not null,
  receiver_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, receiver_id)
);
create index if not exists combat_group_invites_receiver_idx on bsu_social.combat_group_invites (receiver_id);
create table if not exists bsu_social.group_battle_actions (
  id text primary key default gen_random_uuid()::text,
  group_id text not null references bsu_social.combat_groups(id) on delete cascade,
  user_id text not null,
  monster_name text not null check (length(monster_name) between 1 and 80),
  damage int not null check (damage between 0 and 10000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);
create index if not exists group_battle_actions_idx on bsu_social.group_battle_actions (group_id, created_at);

create table if not exists bsu_social.world_drops (
  id text primary key default gen_random_uuid()::text,
  location_id text not null check (length(location_id) between 1 and 120),
  dropped_by text not null,
  item_id text not null check (length(item_id) between 1 and 120),
  item_snapshot jsonb not null default '{}'::jsonb check (octet_length(item_snapshot::text) <= 8000),
  quantity int not null default 1 check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index if not exists world_drops_idx on bsu_social.world_drops (location_id, expires_at);

create table if not exists bsu_social.chat_rooms (
  id text primary key default gen_random_uuid()::text,
  slug text not null,
  name text not null check (length(name) between 2 and 40),
  language text not null default 'en-US',
  visibility text not null default 'public' check (visibility in ('public', 'private', 'personal')),
  owner_id text,
  member_limit int not null default 20 check (member_limit between 2 and 200),
  activation_minutes int not null default 0,
  activation_started_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_rooms_owner_idx on bsu_social.chat_rooms (owner_id);
insert into bsu_social.chat_rooms (id, slug, name, language, member_limit, activated_at, created_at) values
  ('world', 'world', 'World Chat', 'en-US', 200, now(), '2024-01-01T00:00:00Z'),
  ('trade', 'trade', 'Trade Chat', 'en-US', 100, now(), '2024-01-01T00:00:01Z'),
  ('help', 'help', 'Help & New Heroes', 'en-US', 100, now(), '2024-01-01T00:00:02Z'),
  ('french', 'french', 'Discussion Française', 'fr-FR', 100, now(), '2024-01-01T00:00:03Z')
on conflict (id) do nothing;
create table if not exists bsu_social.chat_room_members (
  room_id text not null references bsu_social.chat_rooms(id) on delete cascade,
  user_id text not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists bsu_social.chat_room_blacklist (
  room_id text not null references bsu_social.chat_rooms(id) on delete cascade,
  blocked_user_id text not null,
  blocked_by text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (room_id, blocked_user_id)
);
create table if not exists bsu_social.chat_room_invites (
  id text primary key default gen_random_uuid()::text,
  room_id text not null references bsu_social.chat_rooms(id) on delete cascade,
  sender_id text not null,
  receiver_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, receiver_id)
);
create index if not exists chat_room_invites_receiver_idx on bsu_social.chat_room_invites (receiver_id);
create table if not exists bsu_social.chat_room_messages (
  id text primary key default gen_random_uuid()::text,
  room_id text not null references bsu_social.chat_rooms(id) on delete cascade,
  sender_id text not null,
  body text not null check (length(body) between 1 and 300),
  voice_id text not null default 'system:default' check (length(voice_id) <= 80),
  source_language text not null default 'en' check (length(source_language) <= 12),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
create index if not exists chat_room_messages_idx on bsu_social.chat_room_messages (room_id, created_at);

create table if not exists bsu_social.community_map_markers (
  id text primary key default gen_random_uuid()::text,
  creator_id text not null,
  location_id text not null check (length(location_id) between 1 and 120),
  title text not null check (length(title) between 2 and 60),
  note text not null check (length(note) between 2 and 500),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);
create index if not exists community_map_markers_idx on bsu_social.community_map_markers (location_id, created_at desc);

-- Row level security on every table: with no rule, nothing is allowed.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'bsu_social' loop
    execute format('alter table bsu_social.%I enable row level security', t);
  end loop;
end $$;
