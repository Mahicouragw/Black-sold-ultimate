-- Black Sword Ultimate: online data. Part 3 of 3: named actions and the one
-- public entry point. Safe to run more than once.
--
-- Every bsu_social.rpc_<name>(jsonb) function can be asked for by the game as
-- rpc('<name>', {...}). They run with full rights, so each one checks the
-- caller (bsu_social.uid()) itself.

create or replace function bsu_social.need() returns text language plpgsql stable as $$
declare me text := bsu_social.uid();
begin
  if me is null then raise exception 'Please sign in first.'; end if;
  return me;
end $$;

-- Player ID: KND-XXXX-XXXX from 32 clear letters and digits, cryptographically random.
create or replace function bsu_social.new_code() returns text language sql volatile as $$
  with b as (select extensions.gen_random_bytes(8) as v)
  select 'KND-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b.v, i) % 32, 1), '' order by i) filter (where i < 4)
      || '-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b.v, i) % 32, 1), '' order by i) filter (where i >= 4)
  from b, generate_series(0, 7) i
$$;

create or replace function bsu_social.tidy() returns void
language sql security definer set search_path = bsu_social, pg_temp as $$
  delete from messages where expires_at < now() - interval '1 minute';
  delete from chat_room_messages where expires_at < now() - interval '1 minute';
  delete from group_battle_actions where expires_at < now() - interval '1 minute';
  delete from world_drops where expires_at < now();
  delete from recovery_attempts where at < now() - interval '1 day';
  delete from chat_room_members where last_seen < now() - interval '1 day';
$$;

-- ---------------------------------------------------------------- profile
create or replace function bsu_social.rpc_get_my_profile(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); p profiles; code text; tries int := 0;
  want text := upper(coalesce(a->>'preferred_code', ''));
  mail text := lower(nullif(current_setting('bsu.email', true), ''));
begin
  select * into p from profiles where id = me;
  if not found then
    insert into profiles(id, display_name)
      values (me, left(coalesce(nullif(btrim(current_setting('bsu.name', true)), ''), 'Wandering Hero'), 40))
      on conflict (id) do nothing;
    select * into p from profiles where id = me;
  end if;
  select player_code into code from accounts where user_id = me;
  if code is null then
    loop
      tries := tries + 1;
      code := case when tries = 1 and want ~ '^KND-[A-Z2-9]{4}-[A-Z2-9]{4}$' then want else new_code() end;
      begin
        insert into accounts(user_id, player_code, google, email) values (me, code, is_google(), mail);
        exit;
      exception when unique_violation then
        select player_code into code from accounts where user_id = me;
        if code is not null then exit; end if;
        if tries > 8 then raise exception 'A Player ID could not be created. Please try again.'; end if;
      end;
    end loop;
  else
    update accounts set google = is_google(), email = mail, last_seen = now()
      where user_id = me and (google is distinct from is_google() or email is distinct from mail or last_seen < now() - interval '1 hour');
  end if;
  return to_jsonb(p) || jsonb_build_object('player_code', code, 'is_moderator', is_moderator());
end $$;

-- -------------------------------------------------------------- hero names
create or replace function bsu_social.rpc_hero_name_available(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); n text := norm(a->>'desired_name');
begin
  if length(n) < 2 then return to_jsonb(false); end if;
  return to_jsonb(not exists (select 1 from hero_names where normalized_name = n and owner_id <> me));
end $$;

create or replace function bsu_social.rpc_reserve_hero_name(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); display text := btrim(coalesce(a->>'desired_name', '')); n text := norm(a->>'desired_name');
  slot text := coalesce(a->>'target_slot', '');
begin
  if length(n) not between 2 and 40 then raise exception 'A hero name needs between 2 and 40 characters.'; end if;
  if (select count(*) from hero_names where owner_id = me) >= 60 then raise exception 'You hold too many hero names. Release one first.'; end if;
  insert into hero_names(normalized_name, owner_id, hero_slot, hero_name) values (n, me, left(slot, 80), display)
    on conflict (normalized_name) do update set hero_slot = excluded.hero_slot, hero_name = excluded.hero_name
    where hero_names.owner_id = me;
  if not found then raise exception 'That hero name is already taken. Please choose another.'; end if;
  delete from hero_names where owner_id = me and hero_slot = left(slot, 80) and normalized_name <> n;
  return to_jsonb(true);
end $$;

create or replace function bsu_social.rpc_release_hero_name(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); n int;
begin
  delete from hero_names where owner_id = me and hero_slot = coalesce(a->>'target_slot', '');
  get diagnostics n = row_count;
  return to_jsonb(n);
end $$;

create or replace function bsu_social.rpc_release_all_hero_names(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); n int;
begin
  delete from hero_names where owner_id = me;
  get diagnostics n = row_count;
  return to_jsonb(n);
end $$;

create or replace function bsu_social.rpc_find_heroes_by_name(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); n text := norm(a->>'hero_name');
begin
  if length(n) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'display_name', f.display_name, 'level', f.level, 'current_location', f.current_location, 'last_seen', f.last_seen))
    from (
      select distinct on (id) * from (
        select p.id, p.display_name, p.level, p.current_location, p.last_seen, 1 as rank from profiles p where norm(p.display_name) = n
        union all
        select p.id, h.hero_name, p.level, p.current_location, p.last_seen, 0 from hero_names h join profiles p on p.id = h.owner_id where h.normalized_name = n
      ) u order by id, rank limit 5
    ) f), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- feedback
create or replace function bsu_social.rpc_submit_game_feedback(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); msg text := btrim(coalesce(a->>'feedback_message', '')); cat text := left(coalesce(a->>'feedback_category', 'gameplay'), 40); fid text;
begin
  if length(msg) not between 3 and 2000 then raise exception 'Feedback needs between 3 and 2000 characters.'; end if;
  if (select count(*) from game_feedback where user_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Thank you. You have sent a lot of feedback today; please write again tomorrow.';
  end if;
  insert into game_feedback(user_id, display_name, category, kind, message)
    values (me, coalesce((select display_name from profiles where id = me), 'Hero'), cat, case when cat ~* 'bug' then 'bug' else 'feedback' end, msg)
    returning id into fid;
  return to_jsonb(fid);
end $$;

create or replace function bsu_social.rpc_list_moderator_feedback(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); lim int := least(greatest(coalesce((a->>'row_limit')::int, 50), 1), 100);
begin
  if not is_moderator() then raise exception 'Not authorized: this account is not a moderator. Account number: %', me; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(f) || jsonb_build_object('feedback_id', f.id, 'sender_id', coalesce(nullif(f.display_name, ''), f.user_id)) order by f.created_at desc)
    from (select * from game_feedback order by created_at desc limit lim) f), '[]'::jsonb);
end $$;

create or replace function bsu_social.rpc_moderate_game_feedback(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need();
begin
  if not is_moderator() then raise exception 'Not authorized: this account is not a moderator. Account number: %', me; end if;
  update game_feedback set status = left(coalesce(a->>'new_status', 'reviewed'), 20), resolution_note = left(coalesce(a->>'private_note', ''), 1000),
    assigned_to = me, updated_at = now() where id = a->>'feedback_id';
  if not found then raise exception 'That feedback no longer exists.'; end if;
  return to_jsonb(true);
end $$;

-- ------------------------------------------------------------- shared loot
create or replace function bsu_social.rpc_take_world_drop(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); d world_drops;
begin
  delete from world_drops where id = a->>'drop_uuid' and expires_at > now() returning * into d;
  if not found then raise exception 'Someone else already took that item.'; end if;
  return jsonb_build_object('id', d.id, 'item_id', d.item_id, 'item_snapshot', d.item_snapshot, 'quantity', d.quantity);
end $$;

-- ------------------------------------------------- Player ID and PIN login
-- The game never sends the PIN. It sends a key made on the device from the
-- PIN and the Player ID (PBKDF2). Wrong tries are counted and limited.
create or replace function bsu_social.rpc_set_player_recovery_pin(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); key text := coalesce(a->>'recovery_key', ''); code text;
begin
  if key !~ '^[0-9a-f]{64}$' then raise exception 'PIN must be exactly 6 digits.'; end if;
  code := rpc_get_my_profile('{}'::jsonb)->>'player_code';
  insert into player_recovery(owner_id, player_code, pin_key) values (me, code, key)
    on conflict (owner_id) do update set player_code = excluded.player_code, pin_key = excluded.pin_key, updated_at = now();
  if jsonb_typeof(a->'current_save') = 'object' and a->'current_save' <> '{}'::jsonb then
    insert into game_saves(user_id, save_data) values (me, a->'current_save')
      on conflict (user_id) do update set save_data = excluded.save_data, updated_at = now();
  end if;
  return to_jsonb(true);
end $$;

create or replace function bsu_social.rpc_recover_progress_with_pin(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); code text := left(upper(btrim(coalesce(a->>'code', ''))), 20); key text := coalesce(a->>'recovery_key', ''); owner text;
begin
  if (select count(*) from recovery_attempts where player_code = code and at > now() - interval '1 hour') >= 10
     or (select count(*) from recovery_attempts where user_id = me and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('__error', 'Too many wrong tries. Please wait one hour and try again.');
  end if;
  select owner_id into owner from player_recovery where player_code = code and pin_key = key;
  if owner is null then
    insert into recovery_attempts(player_code, user_id) values (code, me);
    return jsonb_build_object('__error', 'Invalid Player ID or PIN.');
  end if;
  return coalesce((select save_data from game_saves where user_id = owner), '{}'::jsonb);
end $$;

-- --------------------------------------------------------------- chat rooms
create or replace function bsu_social.rpc_ensure_personal_chat_room(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); rid text := 'personal_' || need();
begin
  insert into chat_rooms(id, slug, name, visibility, owner_id, member_limit, activation_minutes, activated_at)
    values (rid, 'personal-' || me, left(coalesce((select display_name from profiles where id = me), 'Hero') || '''s Room', 40), 'personal', me, 20, 0, now())
    on conflict (id) do nothing;
  return to_jsonb(rid);
end $$;

create or replace function bsu_social.rpc_create_custom_chat_room(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); nm text := left(btrim(coalesce(a->>'room_name', '')), 40); rid text := gen_random_uuid()::text;
  wait int := case when a->>'wait_minutes' in ('0', '5', '10') then (a->>'wait_minutes')::int else 5 end;
  lim int := 20;
begin
  if not is_google() then raise exception 'Sign in with Google to create a chat room.'; end if;
  if length(nm) < 2 then raise exception 'Enter a room name.'; end if;
  if (select count(*) from chat_rooms where owner_id = me and visibility <> 'personal') >= 5 then
    raise exception 'You already have 5 chat rooms. Delete one first.';
  end if;
  begin lim := least(200, greatest(2, coalesce(floor((a->>'max_users')::numeric)::int, 20))); exception when others then lim := 20; end;
  insert into chat_rooms(id, slug, name, visibility, owner_id, member_limit, activation_minutes, activation_started_at, activated_at)
    values (rid, left(regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'), 40) || '-' || left(rid, 6), nm,
      case when a->>'room_visibility' = 'private' then 'private' else 'public' end, me, coalesce(lim, 20), wait, now(), case when wait = 0 then now() end);
  return to_jsonb(rid);
end $$;

create or replace function bsu_social.room_enter(rid text) returns bsu_social.chat_rooms
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); room chat_rooms;
begin
  select * into room from chat_rooms where id = rid;
  if not found or not sees_room(rid) then raise exception 'That room no longer exists.'; end if;
  if exists (select 1 from chat_room_blacklist where room_id = rid and blocked_user_id = me) then
    raise exception 'The room owner has blocked you from this room.';
  end if;
  return room;
end $$;

create or replace function bsu_social.rpc_join_chat_room(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); rid text := a->>'target_room'; room chat_rooms := room_enter(a->>'target_room');
begin
  if room.owner_id is distinct from me
     and not exists (select 1 from chat_room_members where room_id = rid and user_id = me and last_seen > now() - interval '150 seconds')
     and (select count(*) from chat_room_members where room_id = rid and last_seen > now() - interval '150 seconds') >= room.member_limit then
    raise exception 'That room is full.';
  end if;
  insert into chat_room_members(room_id, user_id, role) values (rid, me, case when room.owner_id = me then 'owner' else 'member' end)
    on conflict (room_id, user_id) do update set last_seen = now();
  return to_jsonb(1);
end $$;

create or replace function bsu_social.rpc_chat_room_heartbeat(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); rid text := a->>'target_room'; room chat_rooms := room_enter(a->>'target_room'); users int; active boolean;
  started timestamptz;
begin
  insert into chat_room_members(room_id, user_id, role) values (rid, me, case when room.owner_id = me then 'owner' else 'member' end)
    on conflict (room_id, user_id) do update set last_seen = now();
  select count(*) into users from chat_room_members where room_id = rid and last_seen > now() - interval '150 seconds';
  started := coalesce(room.activation_started_at, room.created_at);
  active := room.activated_at is not null or room.activation_minutes = 0;
  if not active and room.owner_id = me and now() - started >= make_interval(mins => room.activation_minutes) then
    update chat_rooms set activated_at = now() where id = rid;
    active := true;
  end if;
  return jsonb_build_object('users', greatest(1, users), 'activated', active, 'activation_started_at', started);
end $$;

create or replace function bsu_social.rpc_blacklist_chat_user(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); rid text := a->>'target_room'; who text := a->>'target_user';
begin
  if not owns('room', rid) then raise exception 'Only the creator of the room can block a hero.'; end if;
  if who is null or who = me then raise exception 'Choose another hero.'; end if;
  insert into chat_room_blacklist(room_id, blocked_user_id, blocked_by, reason) values (rid, who, me, left(coalesce(a->>'block_reason', ''), 200))
    on conflict (room_id, blocked_user_id) do nothing;
  delete from chat_room_members where room_id = rid and user_id = who;
  return to_jsonb(true);
end $$;

create or replace function bsu_social.rpc_tidy_expired_chat(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
begin perform need(); perform tidy(); return to_jsonb(0); end $$;

-- ------------------------------------------------------------ live updates
-- What changed since the last look, for the tables the game is watching.
-- "now" is given back a little early, so a line being written at this very
-- moment is seen next time; the game ignores lines it has already seen.
create or replace function bsu_social.rpc_changes(a jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare me text := need(); since timestamptz; ev jsonb := '[]'::jsonb; part jsonb;
  tabs jsonb := coalesce(a->'tables', '[]'::jsonb); room text := a->>'room_id'; mark timestamptz := now() - interval '3 seconds';
begin
  begin since := (a->>'since')::timestamptz; exception when others then since := null; end;
  if since is null or since < now() - interval '10 minutes' then return jsonb_build_object('now', mark, 'events', ev); end if;
  if tabs ? 'messages' then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'messages', 'type', 'INSERT', 'row', to_jsonb(m)) order by m.created_at), '[]'::jsonb) into part
      from (select * from messages where created_at > since and expires_at > now() and (receiver_id is null or me in (sender_id, receiver_id)) order by created_at desc limit 50) m;
    ev := ev || part;
  end if;
  if tabs ? 'friend_requests' then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'friend_requests', 'type', case when m.created_at > since then 'INSERT' else 'UPDATE' end, 'row', to_jsonb(m))), '[]'::jsonb) into part
      from (select * from friend_requests where greatest(created_at, updated_at) > since and me in (sender_id, receiver_id) limit 50) m;
    ev := ev || part;
  end if;
  if tabs ? 'guild_invites' then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'guild_invites', 'type', 'INSERT', 'row', to_jsonb(m))), '[]'::jsonb) into part
      from (select * from guild_invites where created_at > since and receiver_id = me limit 50) m;
    ev := ev || part;
  end if;
  if tabs ? 'combat_group_invites' then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'combat_group_invites', 'type', 'INSERT', 'row', to_jsonb(m))), '[]'::jsonb) into part
      from (select * from combat_group_invites where created_at > since and receiver_id = me limit 50) m;
    ev := ev || part;
  end if;
  if tabs ? 'group_battle_actions' then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'group_battle_actions', 'type', 'INSERT', 'row', to_jsonb(m)) order by m.created_at), '[]'::jsonb) into part
      from (select * from group_battle_actions where created_at > since and user_id <> me
              and group_id in (select group_id from combat_group_members where user_id = me) order by created_at desc limit 100) m;
    ev := ev || part;
  end if;
  if tabs ? 'chat_room_messages' and room is not null and sees_room(room) then
    select coalesce(jsonb_agg(jsonb_build_object('table', 'chat_room_messages', 'type', 'INSERT', 'row', to_jsonb(m)) order by m.created_at), '[]'::jsonb) into part
      from (select * from chat_room_messages where room_id = room and created_at > since and expires_at > now() order by created_at desc limit 50) m;
    ev := ev || part;
  end if;
  return jsonb_build_object('now', mark, 'events', ev);
end $$;

-- ---------------------------------------------------------- the entry point
-- p_uid and p_claims come from the verified sign-in token, never from the
-- request body. Only the service role (the bsu-data server function) may call.
create or replace function public.bsu_data(p_uid text, p_claims jsonb, p_req jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare kind text := p_req->>'kind'; fn text := p_req->>'name'; result jsonb;
begin
  if kind = 'ping' then return jsonb_build_object('data', jsonb_build_object('ok', true, 'schema', 5)); end if;
  if p_uid is null or length(p_uid) not between 1 and 128 then
    return jsonb_build_object('error', jsonb_build_object('code', 'unauthenticated', 'message', 'Please sign in again.'));
  end if;
  perform set_config('bsu.uid', p_uid, true);
  perform set_config('bsu.google', case when coalesce(p_claims->>'google', '') = 'true' then '1' else '' end, true);
  perform set_config('bsu.email', left(coalesce(p_claims->>'email', ''), 200), true);
  perform set_config('bsu.name', left(coalesce(p_claims->>'name', ''), 80), true);
  begin
    if kind = 'rpc' then
      if fn is null or fn !~ '^[a-z_]{3,60}$' or to_regprocedure(format('bsu_social.%I(jsonb)', 'rpc_' || fn)) is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'unknown-function', 'message', format('function %s is not available', coalesce(fn, '?'))));
      end if;
      execute format('select bsu_social.%I($1)', 'rpc_' || fn) using coalesce(p_req->'args', '{}'::jsonb) into result;
      if jsonb_typeof(result) = 'object' and result ? '__error' then
        return jsonb_build_object('error', jsonb_build_object('code', 'P0001', 'message', result->>'__error'));
      end if;
    elsif kind = 'query' then
      result := bsu_social.q(p_req);
    else
      return jsonb_build_object('error', jsonb_build_object('code', 'bad-request', 'message', 'Unknown request.'));
    end if;
    if random() < 0.03 then perform bsu_social.tidy(); end if;
    return jsonb_build_object('data', result);
  exception when others then
    return jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm, 'table', p_req->>'table'));
  end;
end $$;

revoke all on function public.bsu_data(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bsu_data(text, jsonb, jsonb) to service_role;
