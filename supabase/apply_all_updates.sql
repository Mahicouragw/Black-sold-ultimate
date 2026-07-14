-- Black Sword Ultimate consolidated post-schema migrations.
-- Safe to run after supabase/schema.sql; sections are idempotent.

-- Sacred Realms v3: secure Player ID + PIN progress recovery.
-- Run once in Supabase SQL Editor after schema.sql.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.player_recovery (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  player_code text not null unique,
  pin_hash text not null,
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_attempts (
  caller_id uuid primary key references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  window_started timestamptz not null default now()
);

alter table public.player_recovery enable row level security;
alter table public.recovery_attempts enable row level security;

-- Recovery rows are never directly readable from the browser.
revoke all on public.player_recovery from anon, authenticated;
revoke all on public.recovery_attempts from anon, authenticated;

create or replace function public.set_player_recovery_pin(new_pin text, current_save jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = public,extensions
as $$
declare code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_pin !~ '^[0-9]{6}$' then raise exception 'PIN must contain exactly 6 digits'; end if;
  select player_code into code from public.profiles where id = auth.uid();
  if code is null then raise exception 'Player profile not found'; end if;
  insert into public.player_recovery(owner_id, player_code, pin_hash, save_data, updated_at)
  values(auth.uid(), code, extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), coalesce(current_save, '{}'::jsonb), now())
  on conflict(owner_id) do update set
    player_code=excluded.player_code, pin_hash=excluded.pin_hash,
    save_data=excluded.save_data, updated_at=now();
  return true;
end;
$$;

create or replace function public.update_recovery_save(current_save jsonb)
returns boolean
language plpgsql security definer set search_path = public,extensions
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.player_recovery set save_data=current_save, updated_at=now() where owner_id=auth.uid();
  return found;
end;
$$;

-- Returns only game progress, never the owner UUID, PIN hash, email, or social identity.
-- Limits each authenticated guest session to five failures per 15-minute window.
create or replace function public.recover_progress_with_pin(code text, supplied_pin text)
returns jsonb
language plpgsql security definer set search_path = public,extensions
as $$
declare rec public.player_recovery%rowtype; tracker public.recovery_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if supplied_pin !~ '^[0-9]{6}$' then raise exception 'Invalid Player ID or PIN'; end if;
  select * into tracker from public.recovery_attempts where caller_id=auth.uid();
  if tracker.window_started > now() - interval '15 minutes' and tracker.attempts >= 5 then
    raise exception 'Too many attempts. Wait 15 minutes.';
  end if;
  if tracker.window_started is null or tracker.window_started <= now() - interval '15 minutes' then
    insert into public.recovery_attempts(caller_id,attempts,window_started) values(auth.uid(),0,now())
    on conflict(caller_id) do update set attempts=0,window_started=now();
  end if;
  select * into rec from public.player_recovery where player_code=upper(trim(code));
  if rec.owner_id is null or rec.pin_hash <> extensions.crypt(supplied_pin, rec.pin_hash) then
    update public.recovery_attempts set attempts=attempts+1 where caller_id=auth.uid();
    raise exception 'Invalid Player ID or PIN';
  end if;
  update public.recovery_attempts set attempts=0,window_started=now() where caller_id=auth.uid();
  return rec.save_data;
end;
$$;

grant execute on function public.set_player_recovery_pin(text,jsonb) to authenticated;
grant execute on function public.update_recovery_save(jsonb) to authenticated;
grant execute on function public.recover_progress_with_pin(text,text) to authenticated;

-- Voice-profile chat and authenticated guest chat.
-- Run once in Supabase SQL Editor after schema.sql.

alter table public.messages add column if not exists voice_id text not null default 'boy-1';

alter table public.messages drop constraint if exists messages_voice_id_check;
alter table public.messages add constraint messages_voice_id_check
  check (voice_id ~ '^(boy|girl)-([1-9]|10)$');

-- Latest requirement: every authenticated player, including a guest with a
-- permanent Player ID, may send chat. sender_id is still locked to auth.uid().
drop policy if exists messages_linked_send on public.messages;
drop policy if exists messages_authenticated_send on public.messages;
create policy messages_authenticated_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid());

grant select, insert on public.messages to authenticated;

-- Alexa parity v6: brotherhood invitations, combat groups, cooperative actions, feedback.

create table if not exists public.guild_invites (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(guild_id,receiver_id)
);
create table if not exists public.combat_groups (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 3 and 40),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check(status in ('open','in_battle','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.combat_group_members (
  group_id uuid not null references public.combat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('leader','member')),
  joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create table if not exists public.combat_group_invites (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.combat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(group_id,receiver_id)
);
create table if not exists public.group_battle_actions (
  id bigint generated by default as identity primary key,
  group_id uuid not null references public.combat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  monster_name text not null, damage integer not null check(damage between 0 and 10000),
  created_at timestamptz not null default now()
);
create table if not exists public.game_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('feedback','bug')), message text not null check(char_length(message) between 3 and 1000),
  created_at timestamptz not null default now()
);

alter table public.guild_invites enable row level security;
alter table public.combat_groups enable row level security;
alter table public.combat_group_members enable row level security;
alter table public.combat_group_invites enable row level security;
alter table public.group_battle_actions enable row level security;
alter table public.game_feedback enable row level security;

do $$ declare p record; begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('guild_invites','combat_groups','combat_group_members','combat_group_invites','group_battle_actions','game_feedback') loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop; end $$;

create policy guild_invites_participants_read on public.guild_invites for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy guild_invites_officer_send on public.guild_invites for insert to authenticated with check(sender_id=auth.uid() and public.has_linked_identity() and exists(select 1 from public.guild_members m where m.guild_id=guild_id and m.user_id=auth.uid() and m.role in ('owner','officer')));
create policy guild_invites_receiver_update on public.guild_invites for update to authenticated using(receiver_id=auth.uid()) with check(receiver_id=auth.uid());
-- Replace the earlier permissive self-join rule with owner-or-accepted-invite enforcement.
drop policy if exists guild_members_linked_join on public.guild_members;
drop policy if exists guild_members_secure_join on public.guild_members;
create policy guild_members_secure_join on public.guild_members for insert to authenticated with check(
  user_id=auth.uid() and public.has_linked_identity() and (
    (role='owner' and exists(select 1 from public.guilds g where g.id=guild_id and g.owner_id=auth.uid()))
    or exists(select 1 from public.guild_invites i where i.guild_id=guild_id and i.receiver_id=auth.uid() and i.status='accepted')
  )
);

create policy combat_groups_read on public.combat_groups for select to authenticated using(true);
create policy combat_groups_create on public.combat_groups for insert to authenticated with check(owner_id=auth.uid() and public.has_linked_identity());
create policy combat_groups_owner_update on public.combat_groups for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy combat_members_read on public.combat_group_members for select to authenticated using(true);
create policy combat_members_self_join on public.combat_group_members for insert to authenticated with check(
  user_id=auth.uid() and public.has_linked_identity() and (
    (role='leader' and exists(select 1 from public.combat_groups g where g.id=group_id and g.owner_id=auth.uid()))
    or exists(select 1 from public.combat_group_invites i where i.group_id=group_id and i.receiver_id=auth.uid() and i.status='accepted')
  )
);
create policy combat_members_self_leave on public.combat_group_members for delete to authenticated using(user_id=auth.uid());
create policy combat_invites_participants_read on public.combat_group_invites for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy combat_invites_leader_send on public.combat_group_invites for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.combat_group_members m where m.group_id=group_id and m.user_id=auth.uid() and m.role='leader'));
create policy combat_invites_receiver_update on public.combat_group_invites for update to authenticated using(receiver_id=auth.uid()) with check(receiver_id=auth.uid());
create policy battle_actions_members_read on public.group_battle_actions for select to authenticated using(exists(select 1 from public.combat_group_members m where m.group_id=group_id and m.user_id=auth.uid()));
create policy battle_actions_members_insert on public.group_battle_actions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.combat_group_members m where m.group_id=group_id and m.user_id=auth.uid()));
create policy feedback_own_insert on public.game_feedback for insert to authenticated with check(user_id=auth.uid());
create policy feedback_own_read on public.game_feedback for select to authenticated using(user_id=auth.uid());

grant select,insert,update on public.guild_invites to authenticated;
grant select,insert,update on public.combat_groups to authenticated;
grant select,insert,delete on public.combat_group_members to authenticated;
grant select,insert,update on public.combat_group_invites to authenticated;
grant select,insert on public.group_battle_actions to authenticated;
grant usage,select on sequence public.group_battle_actions_id_seq to authenticated;
grant select,insert on public.game_feedback to authenticated;

do $$ begin alter publication supabase_realtime add table public.group_battle_actions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.guild_invites; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.combat_group_invites; exception when duplicate_object then null; end $$;

-- v7 privacy: Player IDs are private recovery/login credentials.
-- Public social features expose hero names, not player_code.

create or replace function public.get_my_profile()
returns table(id uuid, player_code text, display_name text, level integer, current_location text, last_seen timestamptz)
language sql stable security definer set search_path=public
as $$
  select p.id,p.player_code,p.display_name,p.level,p.current_location,p.last_seen
  from public.profiles p where p.id=auth.uid();
$$;

grant execute on function public.get_my_profile() to authenticated;

-- Remove broad table SELECT inherited from the original schema, then grant only
-- safe social columns. player_code remains available solely through get_my_profile().
revoke select on public.profiles from anon, authenticated;
grant select(id,display_name,level,current_location,last_seen,created_at) on public.profiles to authenticated;

-- Exact case-insensitive name search. Internal UUID is returned for relational
-- operations, but the private KND recovery/login code is never returned.
create or replace function public.find_heroes_by_name(hero_name text)
returns table(id uuid, display_name text, level integer, current_location text, last_seen timestamptz)
language sql stable security definer set search_path=public
as $$
  select p.id,p.display_name,p.level,p.current_location,p.last_seen
  from public.profiles p
  where lower(p.display_name)=lower(trim(hero_name))
  order by p.last_seen desc limit 5;
$$;
grant execute on function public.find_heroes_by_name(text) to authenticated;

-- v8: fix pgcrypto schema resolution for Player ID + PIN recovery on Supabase.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_player_recovery_pin(new_pin text, current_save jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path=public,extensions
as $$
declare code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_pin !~ '^[0-9]{6}$' then raise exception 'PIN must contain exactly 6 digits'; end if;
  select player_code into code from public.profiles where id=auth.uid();
  if code is null then raise exception 'Player profile not found'; end if;
  insert into public.player_recovery(owner_id,player_code,pin_hash,save_data,updated_at)
  values(auth.uid(),code,extensions.crypt(new_pin,extensions.gen_salt('bf',10)),coalesce(current_save,'{}'::jsonb),now())
  on conflict(owner_id) do update set player_code=excluded.player_code,pin_hash=excluded.pin_hash,save_data=excluded.save_data,updated_at=now();
  return true;
end;$$;

create or replace function public.recover_progress_with_pin(code text, supplied_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare rec public.player_recovery%rowtype; tracker public.recovery_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if supplied_pin !~ '^[0-9]{6}$' then raise exception 'Invalid Player ID or PIN'; end if;
  select * into tracker from public.recovery_attempts where caller_id=auth.uid();
  if tracker.window_started>now()-interval '15 minutes' and tracker.attempts>=5 then raise exception 'Too many attempts. Wait 15 minutes.'; end if;
  if tracker.window_started is null or tracker.window_started<=now()-interval '15 minutes' then
    insert into public.recovery_attempts(caller_id,attempts,window_started) values(auth.uid(),0,now())
    on conflict(caller_id) do update set attempts=0,window_started=now();
  end if;
  select * into rec from public.player_recovery where player_code=upper(trim(code));
  if rec.owner_id is null or rec.pin_hash<>extensions.crypt(supplied_pin,rec.pin_hash) then
    update public.recovery_attempts set attempts=attempts+1 where caller_id=auth.uid();
    raise exception 'Invalid Player ID or PIN';
  end if;
  update public.recovery_attempts set attempts=0,window_started=now() where caller_id=auth.uid();
  return rec.save_data;
end;$$;

grant execute on function public.set_player_recovery_pin(text,jsonb) to authenticated;
grant execute on function public.recover_progress_with_pin(text,text) to authenticated;
