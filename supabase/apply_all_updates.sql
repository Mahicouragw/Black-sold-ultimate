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

-- v9 public dropped items. Private house storage remains inside each owner's encrypted/authenticated cloud save.
create table if not exists public.world_drops (
  id uuid primary key default gen_random_uuid(), location_id text not null,
  dropped_by uuid not null references public.profiles(id) on delete cascade,
  item_id text not null, item_snapshot jsonb not null, quantity integer not null default 1 check(quantity between 1 and 99),
  created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '7 days')
);
alter table public.world_drops enable row level security;
drop policy if exists world_drops_read on public.world_drops;
drop policy if exists world_drops_insert on public.world_drops;
create policy world_drops_read on public.world_drops for select to authenticated using(expires_at>now());
create policy world_drops_insert on public.world_drops for insert to authenticated with check(dropped_by=auth.uid());
revoke delete,update on public.world_drops from anon,authenticated;
grant select,insert on public.world_drops to authenticated;

create or replace function public.take_world_drop(drop_uuid uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.world_drops where id=drop_uuid and expires_at>now()
  returning jsonb_build_object('item_id',item_id,'item_snapshot',item_snapshot,'quantity',quantity) into result;
  return result;
end;$$;
grant execute on function public.take_world_drop(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.world_drops; exception when duplicate_object then null; end $$;

-- v10 secure public/private/custom chat rooms with limits, activation, invites and blacklists.
create table if not exists public.chat_rooms (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null check(char_length(name) between 2 and 40),
 visibility text not null check(visibility in ('public','private','personal')), language text not null default 'en-US',
 owner_id uuid references public.profiles(id) on delete cascade, member_limit integer not null default 50 check(member_limit between 1 and 200),
 activation_minutes integer not null default 5 check(activation_minutes in (0,5,10)), activation_started_at timestamptz, activated_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.chat_rooms add column if not exists activation_started_at timestamptz;
create table if not exists public.chat_room_members (
 room_id uuid not null references public.chat_rooms(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','member')),joined_at timestamptz not null default now(),last_seen timestamptz not null default now(),
 primary key(room_id,user_id)
);
create table if not exists public.chat_room_invites (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.chat_rooms(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,receiver_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),created_at timestamptz not null default now(),unique(room_id,receiver_id)
);
create table if not exists public.chat_room_blacklist (
 room_id uuid not null references public.chat_rooms(id) on delete cascade,blocked_user_id uuid not null references public.profiles(id) on delete cascade,
 blocked_by uuid not null references public.profiles(id) on delete cascade,reason text default '',created_at timestamptz not null default now(),primary key(room_id,blocked_user_id)
);
create table if not exists public.chat_room_messages (
 id bigint generated by default as identity primary key,room_id uuid not null references public.chat_rooms(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,body text not null check(char_length(body) between 1 and 300),
 voice_id text not null default 'boy-1' check(voice_id ~ '^(boy|girl)-([1-9]|10)$'),created_at timestamptz not null default now()
);
create index if not exists chat_room_messages_room_time on public.chat_room_messages(room_id,created_at desc);

alter table public.chat_rooms enable row level security;alter table public.chat_room_members enable row level security;
alter table public.chat_room_invites enable row level security;alter table public.chat_room_blacklist enable row level security;alter table public.chat_room_messages enable row level security;

do $$ declare p record;begin for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('chat_rooms','chat_room_members','chat_room_invites','chat_room_blacklist','chat_room_messages') loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end$$;

create or replace function public.can_access_chat_room(target_room uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from chat_rooms r where r.id=target_room and (r.visibility='public' or r.owner_id=auth.uid() or exists(select 1 from chat_room_members m where m.room_id=r.id and m.user_id=auth.uid()) or exists(select 1 from chat_room_invites i where i.room_id=r.id and i.receiver_id=auth.uid() and i.status in ('pending','accepted'))));
$$;grant execute on function public.can_access_chat_room(uuid) to authenticated;

create policy rooms_visible on public.chat_rooms for select to authenticated using(public.can_access_chat_room(id));
create policy rooms_owner_delete on public.chat_rooms for delete to authenticated using(owner_id=auth.uid());
create policy rooms_owner_update on public.chat_rooms for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy members_visible on public.chat_room_members for select to authenticated using(public.can_access_chat_room(room_id));
create policy members_self_leave on public.chat_room_members for delete to authenticated using(user_id=auth.uid() and role<>'owner');
create policy invites_participants on public.chat_room_invites for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy invites_owner_send on public.chat_room_invites for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.chat_rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy invites_receiver_update on public.chat_room_invites for update to authenticated using(receiver_id=auth.uid()) with check(receiver_id=auth.uid());
create policy blacklist_visible on public.chat_room_blacklist for select to authenticated using(blocked_user_id=auth.uid() or exists(select 1 from public.chat_rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy blacklist_owner_add on public.chat_room_blacklist for insert to authenticated with check(blocked_by=auth.uid() and exists(select 1 from public.chat_rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy blacklist_owner_remove on public.chat_room_blacklist for delete to authenticated using(exists(select 1 from public.chat_rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy room_messages_visible on public.chat_room_messages for select to authenticated using(exists(select 1 from public.chat_room_members m where m.room_id=room_id and m.user_id=auth.uid()));
create policy room_messages_send on public.chat_room_messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.chat_room_members m where m.room_id=room_id and m.user_id=auth.uid()) and not exists(select 1 from public.chat_room_blacklist b where b.room_id=room_id and b.blocked_user_id=auth.uid()));

grant select,update,delete on public.chat_rooms to authenticated;grant select,delete on public.chat_room_members to authenticated;
grant select,insert,update on public.chat_room_invites to authenticated;grant select,insert,delete on public.chat_room_blacklist to authenticated;
grant select,insert on public.chat_room_messages to authenticated;grant usage,select on sequence public.chat_room_messages_id_seq to authenticated;

-- Default permanent public rooms.
insert into public.chat_rooms(slug,name,visibility,language,owner_id,member_limit,activation_minutes,activated_at) values
 ('world','World Chat','public','en-US',null,200,0,now()),('trade','Trade Chat','public','en-US',null,100,0,now()),
 ('help','Help & New Heroes','public','en-US',null,100,0,now()),('french','Discussion Française','public','fr-FR',null,100,0,now())
on conflict(slug) do nothing;

create or replace function public.ensure_personal_chat_room()
returns uuid language plpgsql security definer set search_path=public as $$declare rid uuid;hero text;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;select display_name into hero from profiles where id=auth.uid();
 select id into rid from chat_rooms where owner_id=auth.uid() and visibility='personal';
 if rid is null then insert into chat_rooms(slug,name,visibility,language,owner_id,member_limit,activation_minutes,activated_at) values('private-'||auth.uid()::text,coalesce(hero,'Hero')||'''s Private Chat','personal','en-US',auth.uid(),1,0,now()) returning id into rid;insert into chat_room_members(room_id,user_id,role) values(rid,auth.uid(),'owner');end if;return rid;end$$;

create or replace function public.create_custom_chat_room(room_name text,room_visibility text,max_users integer,wait_minutes integer)
returns uuid language plpgsql security definer set search_path=public as $$declare rid uuid;clean_slug text;begin
 if auth.uid() is null or not has_linked_identity() then raise exception 'Link Google before creating a room';end if;
 if room_visibility not in ('public','private') then raise exception 'Visibility must be public or private';end if;
 clean_slug='custom-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 insert into chat_rooms(slug,name,visibility,owner_id,member_limit,activation_minutes,activation_started_at) values(clean_slug,left(trim(room_name),40),room_visibility,auth.uid(),greatest(2,least(200,max_users)),case when wait_minutes=10 then 10 else 5 end,now()) returning id into rid;
 insert into chat_room_members(room_id,user_id,role) values(rid,auth.uid(),'owner');return rid;end$$;

create or replace function public.join_chat_room(target_room uuid)
returns boolean language plpgsql security definer set search_path=public as $$declare r chat_rooms%rowtype;members integer;previous_seen timestamptz;begin
 select * into r from chat_rooms where id=target_room;select last_seen into previous_seen from chat_room_members where room_id=target_room and user_id=auth.uid();if r.id is null then raise exception 'Room not found';end if;
 if exists(select 1 from chat_room_blacklist where room_id=r.id and blocked_user_id=auth.uid()) then raise exception 'You are blacklisted from this room';end if;
 if r.visibility='personal' and r.owner_id<>auth.uid() then raise exception 'Personal rooms are owner-only';end if;
 if r.activated_at is null and r.owner_id<>auth.uid() then raise exception 'Room is not active yet';end if;
 if r.visibility='private' and r.owner_id<>auth.uid() and not exists(select 1 from chat_room_invites where room_id=r.id and receiver_id=auth.uid() and status='accepted') then raise exception 'Private-room invitation required';end if;
 select count(*) into members from chat_room_members where room_id=r.id;if members>=r.member_limit and not exists(select 1 from chat_room_members where room_id=r.id and user_id=auth.uid()) then raise exception 'Room is full';end if;
 if r.owner_id=auth.uid() and r.activated_at is null and (previous_seen is null or previous_seen<now()-interval '90 seconds') then update chat_rooms set activation_started_at=now() where id=r.id;end if;
 insert into chat_room_members(room_id,user_id,role,last_seen) values(r.id,auth.uid(),case when r.owner_id=auth.uid() then 'owner' else 'member' end,now()) on conflict(room_id,user_id) do update set last_seen=now();return true;end$$;

create or replace function public.chat_room_heartbeat(target_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare r chat_rooms%rowtype;occupancy integer;previous_seen timestamptz;begin
 if not exists(select 1 from chat_room_members where room_id=target_room and user_id=auth.uid()) then raise exception 'Join the room before sending heartbeat';end if;
 select last_seen into previous_seen from chat_room_members where room_id=target_room and user_id=auth.uid();
 select * into r from chat_rooms where id=target_room;
 if r.owner_id=auth.uid() and r.activated_at is null and (r.activation_started_at is null or previous_seen is null or previous_seen<now()-interval '90 seconds') then update chat_rooms set activation_started_at=now() where id=r.id returning * into r;end if;
 update chat_room_members set last_seen=now() where room_id=target_room and user_id=auth.uid();
 if r.owner_id=auth.uid() and r.activated_at is null and now()>=r.activation_started_at+make_interval(mins=>r.activation_minutes) then update chat_rooms set activated_at=now() where id=r.id returning * into r;end if;
 select count(*) into occupancy from chat_room_members where room_id=target_room and last_seen>now()-interval '2 minutes';return jsonb_build_object('users',occupancy,'activated',r.activated_at is not null,'activation_minutes',r.activation_minutes,'activation_started_at',r.activation_started_at);end$$;

create or replace function public.blacklist_chat_user(target_room uuid,target_user uuid,block_reason text default '')
returns boolean language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from chat_rooms where id=target_room and owner_id=auth.uid()) then raise exception 'Only the room owner can blacklist users';end if;
 if target_user=auth.uid() then raise exception 'Owner cannot blacklist self';end if;
 insert into chat_room_blacklist(room_id,blocked_user_id,blocked_by,reason) values(target_room,target_user,auth.uid(),left(block_reason,200)) on conflict(room_id,blocked_user_id) do update set reason=excluded.reason,blocked_by=auth.uid(),created_at=now();
 delete from chat_room_members where room_id=target_room and user_id=target_user;return true;end$$;

grant execute on function public.ensure_personal_chat_room() to authenticated;grant execute on function public.create_custom_chat_room(text,text,integer,integer) to authenticated;
grant execute on function public.join_chat_room(uuid) to authenticated;grant execute on function public.chat_room_heartbeat(uuid) to authenticated;grant execute on function public.blacklist_chat_user(uuid,uuid,text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.chat_room_messages;exception when duplicate_object then null;end$$;
do $$ begin alter publication supabase_realtime add table public.chat_room_members;exception when duplicate_object then null;end$$;
