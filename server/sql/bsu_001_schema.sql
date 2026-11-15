-- Black Soul Ultimate — server data (schema part).
-- Every object is prefixed bsu_ so it can live beside another app's tables
-- without touching them. Row level security is ON with NO policies, and all
-- privileges are revoked from the browser roles, so the only way in is the
-- bsu-game server function (service role) calling public.bsu_api().
-- Safe to run more than once.

create table if not exists public.bsu_config (
  key text primary key,
  value jsonb not null
);

insert into public.bsu_config(key, value) values
  ('hunger_hours', '3.5'),            -- real hours from a full meal until hunger returns
  ('hunger_threshold', '40'),         -- satiety below this means "hungry"
  ('meal_threshold', '25'),           -- food worth this much satiety is a full meal
  ('hp_per_minute', '1'),
  ('mp_per_minute', '1'),
  ('daily_blessing_hours', '24'),
  ('ai_reward_daily_cap', '5'),       -- rewarded matches against the computer per 24 h
  ('turn_timeout_seconds', '120'),    -- online: absent player on turn forfeits after this
  ('away_seconds', '30'),
  ('presence_seconds', '75'),
  ('snakes_board', '{"snakes":{"17":7,"54":34,"62":19,"64":60,"87":24,"93":73,"95":75,"99":78},"ladders":{"4":14,"9":31,"20":38,"28":84,"40":59,"51":67,"63":81,"71":91}}'),
  ('snakes_rewards', '{"2":[{"gold":60,"xp":40},{"gold":10,"xp":10}],"3":[{"gold":90,"xp":60},{"gold":45,"xp":30},{"gold":15,"xp":10}],"4":[{"gold":120,"xp":80},{"gold":70,"xp":45},{"gold":40,"xp":25},{"gold":15,"xp":10}]}'),
  ('chess_rewards', '{"win":{"gold":150,"xp":100},"draw":{"gold":50,"xp":35},"loss":{"gold":15,"xp":10}}'),
  ('ai_reward_factor', '0.5'),
  ('colors', '["Red","Orange","Yellow","Green","Blue","White","Black","Purple","Gold","Silver"]'),
  ('prayers', '{"hardship":{"growth":"str","battle":"strength"},"healing":{"growth":"health","battle":"guard"},"guidance":{"growth":"wis","battle":"wisdom"},"protection":{"growth":"dex","battle":"guard"},"loved_ones":{"growth":"magic","battle":"intelligence"},"gratitude":{"growth":"int","battle":"intelligence"},"forgiveness":{"growth":"wis","battle":"wisdom"},"courage":{"growth":"dex","battle":"dexterity"}}'),
  ('permanent_choices', '["strength","dexterity","intelligence","wisdom","health","magic"]')
on conflict (key) do nothing;

create table if not exists public.bsu_players (
  uid text primary key check (length(uid) between 1 and 128),
  pid text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  display_name text not null default 'Hero',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  in_hall_until timestamptz
);

create table if not exists public.bsu_saves (
  uid text primary key references public.bsu_players(uid) on delete cascade,
  save jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.bsu_heroes (
  uid text not null references public.bsu_players(uid) on delete cascade,
  hero_id text not null check (length(hero_id) between 1 and 80),
  name text not null default 'Hero',
  satiety numeric(6,2) not null default 100 check (satiety between 0 and 100),
  satiety_at timestamptz not null default now(),
  last_meal_at timestamptz,
  regen_at timestamptz not null default now(),
  first_prayer_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (uid, hero_id)
);

create table if not exists public.bsu_blessings (
  id bigint generated always as identity primary key,
  uid text not null,
  hero_id text not null,
  kind text not null check (kind in ('permanent', 'daily')),
  blessing text not null,
  prayer text,
  granted_at timestamptz not null default now(),
  foreign key (uid, hero_id) references public.bsu_heroes(uid, hero_id) on delete cascade
);
create unique index if not exists bsu_blessings_one_permanent on public.bsu_blessings(uid, hero_id) where kind = 'permanent';
create index if not exists bsu_blessings_recent on public.bsu_blessings(uid, hero_id, kind, granted_at desc);

create table if not exists public.bsu_quest_catalog (
  quest_id text primary key,
  sort smallint not null default 0,
  name text not null,
  description text not null,
  objective_type text not null check (objective_type in ('kill', 'visit')),
  objective_target text not null default 'any',
  target int not null check (target > 0),
  reward_xp int not null default 0,
  reward_gold int not null default 0,
  companion jsonb not null
);

insert into public.bsu_quest_catalog(quest_id, sort, name, description, objective_type, objective_target, target, reward_xp, reward_gold, companion) values
  ('royal_hunt', 1, 'Royal Forest Hunt', 'Defeat five monsters for the Crown.', 'kill', 'any', 5, 250, 180,
   '{"id":"ser_aldric","name":"Ser Aldric","title":"Royal Huntsman","role":"fighter","maxHp":110,"attack":16,"heal":0}'),
  ('palace_healers_road', 2, 'The Healer''s Road', 'Escort the palace healer while you defeat eight monsters threatening the pilgrim road.', 'kill', 'any', 8, 380, 260,
   '{"id":"sister_meera","name":"Sister Meera","title":"Palace Healer","role":"healer","maxHp":85,"attack":8,"heal":14}'),
  ('palace_border_watch', 3, 'Border Watch', 'Clear twelve monsters from the kingdom''s borders with the captain of the watch.', 'kill', 'any', 12, 560, 400,
   '{"id":"captain_rudra","name":"Captain Rudra","title":"Captain of the Border Watch","role":"guardian","maxHp":140,"attack":18,"heal":0}'),
  ('palace_scholars_errand', 4, 'The Scholar''s Errand', 'Protect the court scholar through fifteen battles while she studies the creatures of the wild.', 'kill', 'any', 15, 760, 520,
   '{"id":"scholar_ilavati","name":"Scholar Ilavati","title":"Court Scholar","role":"mage","maxHp":80,"attack":20,"heal":6}'),
  ('palace_kings_champion', 5, 'The King''s Champion', 'Win twenty battles beside the King''s own champion to prove the realm is safe.', 'kill', 'any', 20, 1100, 800,
   '{"id":"veer_the_champion","name":"Veer","title":"The King''s Champion","role":"champion","maxHp":170,"attack":24,"heal":4}')
on conflict (quest_id) do nothing;

create table if not exists public.bsu_quests (
  uid text not null,
  hero_id text not null,
  quest_id text not null references public.bsu_quest_catalog(quest_id),
  companion_id text not null,
  status text not null default 'accepted' check (status in ('accepted', 'completed')),
  progress int not null default 0,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (uid, hero_id, quest_id),
  foreign key (uid, hero_id) references public.bsu_heroes(uid, hero_id) on delete cascade
);

create table if not exists public.bsu_rewards (
  id bigint generated always as identity primary key,
  uid text not null references public.bsu_players(uid) on delete cascade,
  source text not null,
  source_id text not null,
  rank smallint,
  gold int not null default 0 check (gold >= 0),
  xp int not null default 0 check (xp >= 0),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_hero text,
  unique (uid, source, source_id)
);
create index if not exists bsu_rewards_unclaimed on public.bsu_rewards(uid) where claimed_at is null;

create table if not exists public.bsu_matches (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('snakes', 'chess')),
  mode text not null check (mode in ('ai', 'online')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  seats smallint not null check (seats between 2 and 4),
  host_uid text not null references public.bsu_players(uid) on delete cascade,
  turn_seat smallint not null default 0,
  state jsonb not null default '{}',
  version int not null default 0,
  seq int not null default 0,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.bsu_match_players (
  match_id uuid not null references public.bsu_matches(id) on delete cascade,
  seat smallint not null,
  uid text,
  hero_id text,
  name text not null,
  color text not null,
  is_ai boolean not null default false,
  status text not null check (status in ('invited', 'joined', 'left')),
  rank smallint,
  away boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (match_id, seat)
);
create index if not exists bsu_match_players_uid on public.bsu_match_players(uid, status);

create table if not exists public.bsu_match_events (
  match_id uuid not null references public.bsu_matches(id) on delete cascade,
  seq int not null,
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

-- Lock everything away from browser roles. Only the service role (used by the
-- bsu-game server function) can reach these tables.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'bsu\_%' loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
    execute format('revoke all on public.%I from public', t);
  end loop;
end $$;
