-- Black Sword Ultimate: online data. Part 2 of 3: who may do what.
-- Safe to run more than once.
--
-- Table requests from the game run as the role "bsu_player", which has no
-- rights of its own: every read and write must pass a rule below. The rules
-- know the caller from bsu_social.uid(), which public.bsu_data() sets from the
-- verified sign-in token.

create or replace function bsu_social.is_moderator() returns boolean
language sql stable security definer set search_path = bsu_social, pg_temp as $$
  select exists (select 1 from moderators where user_id = uid())
      or exists (select 1 from owner_emails where email = lower(nullif(current_setting('bsu.email', true), '')))
$$;
create or replace function bsu_social.owns(kind text, key text) returns boolean
language sql stable security definer set search_path = bsu_social, pg_temp as $$
  select case kind
    when 'guild' then exists (select 1 from guilds where id = key and owner_id = uid())
    when 'group' then exists (select 1 from combat_groups where id = key and owner_id = uid())
    when 'room' then exists (select 1 from chat_rooms where id = key and owner_id = uid())
    else false end
$$;
create or replace function bsu_social.member(kind text, key text) returns boolean
language sql stable security definer set search_path = bsu_social, pg_temp as $$
  select case kind
    when 'guild' then exists (select 1 from guild_members where guild_id = key and user_id = uid())
    when 'group' then exists (select 1 from combat_group_members where group_id = key and user_id = uid())
    when 'room' then exists (select 1 from chat_room_members where room_id = key and user_id = uid())
      and not exists (select 1 from chat_room_blacklist where room_id = key and blocked_user_id = uid())
    else false end
$$;
create or replace function bsu_social.invited(kind text, key text) returns boolean
language sql stable security definer set search_path = bsu_social, pg_temp as $$
  select case kind
    when 'guild' then exists (select 1 from guild_invites where guild_id = key and receiver_id = uid() and status = 'accepted')
    when 'group' then exists (select 1 from combat_group_invites where group_id = key and receiver_id = uid() and status = 'accepted')
    when 'room' then exists (select 1 from chat_room_invites where room_id = key and receiver_id = uid() and status = 'accepted')
    else false end
$$;
create or replace function bsu_social.sees_room(key text) returns boolean
language sql stable security definer set search_path = bsu_social, pg_temp as $$
  select exists (select 1 from chat_rooms where id = key and (visibility = 'public' or owner_id = uid())) or invited('room', key)
$$;

-- Requests and invitations: one waiting request per pair, friendly refusals.
create or replace function bsu_social.invite_guard() returns trigger
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare st text; k text := tg_argv[0]; v text := to_jsonb(new)->>tg_argv[0]; waiting int;
begin
  if new.receiver_id = new.sender_id then raise exception 'You cannot invite yourself.'; end if;
  if not exists (select 1 from profiles where id = new.receiver_id) then raise exception 'That hero was not found.'; end if;
  if tg_table_name = 'friend_requests' then
    select status into st from friend_requests where sender_id = new.receiver_id and receiver_id = new.sender_id;
    if st = 'pending' then raise exception 'That hero has already sent you a friend request. Look in your requests.'; end if;
    if st = 'accepted' then raise exception 'You are already friends with this hero.'; end if;
  end if;
  execute format('select status from bsu_social.%I where %I = $1 and receiver_id = $2', tg_table_name, k) using v, new.receiver_id into st;
  if st = 'pending' then raise exception 'That request was already sent and is still waiting.'; end if;
  if st = 'accepted' then
    raise exception '%', case when tg_table_name = 'friend_requests' then 'You are already friends with this hero.' else 'That hero has already accepted.' end;
  end if;
  if st is not null then
    execute format('delete from bsu_social.%I where %I = $1 and receiver_id = $2', tg_table_name, k) using v, new.receiver_id;
  end if;
  execute format('select count(*) from bsu_social.%I where sender_id = $1 and status = ''pending''', tg_table_name) using new.sender_id into waiting;
  if waiting >= 30 then raise exception 'You have too many requests waiting. Please wait for answers first.'; end if;
  return new;
end $$;
create or replace function bsu_social.touch() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
-- Chat: at most five lines in ten seconds from one player.
create or replace function bsu_social.chat_guard() returns trigger
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare n int;
begin
  execute format('select count(*) from bsu_social.%I where sender_id = $1 and created_at > now() - interval ''10 seconds''', tg_table_name) using new.sender_id into n;
  if n >= 5 then raise exception 'Please wait a moment between messages.'; end if;
  new.body := btrim(new.body);
  return new;
end $$;

do $$ declare x record; begin
  for x in select * from (values ('friend_requests', 'sender_id'), ('guild_invites', 'guild_id'), ('combat_group_invites', 'group_id'), ('chat_room_invites', 'room_id')) as v(t, k) loop
    execute format('drop trigger if exists invite_guard on bsu_social.%I', x.t);
    execute format('create trigger invite_guard before insert on bsu_social.%I for each row execute function bsu_social.invite_guard(%L)', x.t, x.k);
    execute format('drop trigger if exists touch on bsu_social.%I', x.t);
    execute format('create trigger touch before update on bsu_social.%I for each row execute function bsu_social.touch()', x.t);
  end loop;
  for x in select * from (values ('messages'), ('chat_room_messages')) as v(t) loop
    execute format('drop trigger if exists chat_guard on bsu_social.%I', x.t);
    execute format('create trigger chat_guard before insert on bsu_social.%I for each row execute function bsu_social.chat_guard()', x.t);
  end loop;
end $$;

-- ------------------------------------------------------------------ rules
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'bsu_social' loop
    execute format('drop policy %I on bsu_social.%I', p.policyname, p.tablename);
  end loop;
end $$;

grant select, insert, update, delete on
  bsu_social.profiles, bsu_social.game_saves, bsu_social.friend_requests, bsu_social.messages, bsu_social.game_feedback,
  bsu_social.guilds, bsu_social.guild_members, bsu_social.guild_invites, bsu_social.combat_groups,
  bsu_social.combat_group_members, bsu_social.combat_group_invites, bsu_social.group_battle_actions,
  bsu_social.world_drops, bsu_social.chat_rooms, bsu_social.chat_room_invites, bsu_social.chat_room_messages,
  bsu_social.community_map_markers
to bsu_player;

create policy r on bsu_social.profiles for select to bsu_player using (true);
create policy i on bsu_social.profiles for insert to bsu_player with check (id = bsu_social.uid());
create policy u on bsu_social.profiles for update to bsu_player using (id = bsu_social.uid()) with check (id = bsu_social.uid());

create policy a on bsu_social.game_saves for all to bsu_player using (user_id = bsu_social.uid()) with check (user_id = bsu_social.uid());

create policy r on bsu_social.friend_requests for select to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy i on bsu_social.friend_requests for insert to bsu_player with check (sender_id = bsu_social.uid() and bsu_social.is_google() and status = 'pending');
create policy u on bsu_social.friend_requests for update to bsu_player using (receiver_id = bsu_social.uid()) with check (receiver_id = bsu_social.uid() and status in ('accepted', 'rejected'));
create policy d on bsu_social.friend_requests for delete to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));

create policy r on bsu_social.messages for select to bsu_player using (receiver_id is null or bsu_social.uid() in (sender_id, receiver_id));
create policy i on bsu_social.messages for insert to bsu_player with check (sender_id = bsu_social.uid());
create policy d on bsu_social.messages for delete to bsu_player using (sender_id = bsu_social.uid());

create policy r on bsu_social.game_feedback for select to bsu_player using (user_id = bsu_social.uid() or bsu_social.is_moderator());

create policy r on bsu_social.guilds for select to bsu_player using (true);
create policy i on bsu_social.guilds for insert to bsu_player with check (owner_id = bsu_social.uid() and bsu_social.is_google());
create policy u on bsu_social.guilds for update to bsu_player using (owner_id = bsu_social.uid()) with check (owner_id = bsu_social.uid());
create policy d on bsu_social.guilds for delete to bsu_player using (owner_id = bsu_social.uid());
create policy r on bsu_social.guild_members for select to bsu_player using (true);
create policy i on bsu_social.guild_members for insert to bsu_player with check (user_id = bsu_social.uid() and bsu_social.is_google()
  and ((role = 'owner' and bsu_social.owns('guild', guild_id)) or (role <> 'owner' and bsu_social.invited('guild', guild_id))));
create policy d on bsu_social.guild_members for delete to bsu_player using (user_id = bsu_social.uid() or bsu_social.owns('guild', guild_id));
create policy r on bsu_social.guild_invites for select to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy i on bsu_social.guild_invites for insert to bsu_player with check (sender_id = bsu_social.uid() and bsu_social.is_google() and status = 'pending' and bsu_social.member('guild', guild_id));
create policy u on bsu_social.guild_invites for update to bsu_player using (receiver_id = bsu_social.uid()) with check (receiver_id = bsu_social.uid() and status in ('accepted', 'rejected'));
create policy d on bsu_social.guild_invites for delete to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));

create policy r on bsu_social.combat_groups for select to bsu_player using (true);
create policy i on bsu_social.combat_groups for insert to bsu_player with check (owner_id = bsu_social.uid() and bsu_social.is_google());
create policy u on bsu_social.combat_groups for update to bsu_player using (owner_id = bsu_social.uid()) with check (owner_id = bsu_social.uid());
create policy d on bsu_social.combat_groups for delete to bsu_player using (owner_id = bsu_social.uid());
create policy r on bsu_social.combat_group_members for select to bsu_player using (true);
create policy i on bsu_social.combat_group_members for insert to bsu_player with check (user_id = bsu_social.uid() and bsu_social.is_google()
  and ((role = 'leader' and bsu_social.owns('group', group_id)) or (role <> 'leader' and bsu_social.invited('group', group_id))));
create policy d on bsu_social.combat_group_members for delete to bsu_player using (user_id = bsu_social.uid() or bsu_social.owns('group', group_id));
create policy r on bsu_social.combat_group_invites for select to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy i on bsu_social.combat_group_invites for insert to bsu_player with check (sender_id = bsu_social.uid() and bsu_social.is_google() and status = 'pending' and bsu_social.member('group', group_id));
create policy u on bsu_social.combat_group_invites for update to bsu_player using (receiver_id = bsu_social.uid()) with check (receiver_id = bsu_social.uid() and status in ('accepted', 'rejected'));
create policy d on bsu_social.combat_group_invites for delete to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy r on bsu_social.group_battle_actions for select to bsu_player using (bsu_social.member('group', group_id));
create policy i on bsu_social.group_battle_actions for insert to bsu_player with check (user_id = bsu_social.uid() and bsu_social.member('group', group_id));

create policy r on bsu_social.world_drops for select to bsu_player using (expires_at > now());
create policy i on bsu_social.world_drops for insert to bsu_player with check (dropped_by = bsu_social.uid());

create policy r on bsu_social.chat_rooms for select to bsu_player using (visibility = 'public' or owner_id = bsu_social.uid() or bsu_social.invited('room', id));
create policy d on bsu_social.chat_rooms for delete to bsu_player using (owner_id = bsu_social.uid() and visibility <> 'personal');
create policy r on bsu_social.chat_room_invites for select to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy i on bsu_social.chat_room_invites for insert to bsu_player with check (sender_id = bsu_social.uid() and bsu_social.is_google() and status = 'pending' and bsu_social.owns('room', room_id));
create policy u on bsu_social.chat_room_invites for update to bsu_player using (receiver_id = bsu_social.uid()) with check (receiver_id = bsu_social.uid() and status in ('accepted', 'rejected'));
create policy d on bsu_social.chat_room_invites for delete to bsu_player using (bsu_social.uid() in (sender_id, receiver_id));
create policy r on bsu_social.chat_room_messages for select to bsu_player using (bsu_social.sees_room(room_id));
create policy i on bsu_social.chat_room_messages for insert to bsu_player with check (sender_id = bsu_social.uid() and bsu_social.sees_room(room_id) and bsu_social.member('room', room_id));
create policy d on bsu_social.chat_room_messages for delete to bsu_player using (sender_id = bsu_social.uid());

create policy r on bsu_social.community_map_markers for select to bsu_player using (visibility = 'public' or creator_id = bsu_social.uid());
create policy i on bsu_social.community_map_markers for insert to bsu_player with check (creator_id = bsu_social.uid() and bsu_social.is_google());
create policy d on bsu_social.community_map_markers for delete to bsu_player using (creator_id = bsu_social.uid());

-- ------------------------------------------------------- table requests
-- One table request from the game: {table, action, filters, order, limit,
-- values, embed}. Names are checked against the lists below and quoted;
-- values are always passed as quoted text. Runs as bsu_player (see the owner
-- change below), so the rules above decide what comes back.
create or replace function bsu_social.q(r jsonb) returns jsonb
language plpgsql security definer set search_path = bsu_social, pg_temp as $$
declare
  ins constant jsonb := '{
    "profiles": ["id", "display_name", "level", "current_location", "last_seen"],
    "game_saves": ["user_id", "save_data", "updated_at"],
    "friend_requests": ["sender_id", "receiver_id"],
    "messages": ["sender_id", "receiver_id", "body", "voice_id", "source_language"],
    "game_feedback": [],
    "guilds": ["name", "owner_id"],
    "guild_members": ["guild_id", "user_id", "role"],
    "guild_invites": ["guild_id", "sender_id", "receiver_id"],
    "combat_groups": ["name", "owner_id"],
    "combat_group_members": ["group_id", "user_id", "role"],
    "combat_group_invites": ["group_id", "sender_id", "receiver_id"],
    "group_battle_actions": ["group_id", "user_id", "monster_name", "damage"],
    "world_drops": ["location_id", "dropped_by", "item_id", "item_snapshot", "quantity"],
    "chat_rooms": [],
    "chat_room_invites": ["room_id", "sender_id", "receiver_id"],
    "chat_room_messages": ["room_id", "sender_id", "body", "voice_id", "source_language"],
    "community_map_markers": ["creator_id", "location_id", "title", "note", "visibility"]
  }';
  upd constant jsonb := '{
    "profiles": ["display_name", "level", "current_location", "last_seen"],
    "game_saves": ["save_data", "updated_at"],
    "friend_requests": ["status"], "guild_invites": ["status"], "combat_group_invites": ["status"], "chat_room_invites": ["status"],
    "guilds": ["name"], "combat_groups": ["name", "status"]
  }';
  pk constant jsonb := '{"profiles": "id", "game_saves": "user_id"}';
  t text := r->>'table'; act text := coalesce(r->>'action', 'select');
  rel regclass; w text := ''; f jsonb; col text; op text; typ text; val jsonb; ord text := '';
  lim int := least(greatest(coalesce((r->>'limit')::int, 200), 1), 200);
  item jsonb; keys text; sets text; one jsonb; rows jsonb := '[]'::jsonb; e jsonb;
begin
  if t is null or not (ins ? t) then raise exception 'Table % is not available.', coalesce(t, '?'); end if;
  rel := format('bsu_social.%I', t)::regclass;
  for f in select * from jsonb_array_elements(coalesce(r->'filters', '[]'::jsonb)) loop
    col := f->>'col'; op := f->>'op'; val := f->'val';
    select format_type(a.atttypid, a.atttypmod) into typ from pg_attribute a
      where a.attrelid = rel and a.attname = col and a.attnum > 0 and not a.attisdropped;
    if typ is null then raise exception 'Unknown column %.', coalesce(col, '?'); end if;
    w := w || ' and ' || case
      when op in ('eq', 'is') and (val is null or jsonb_typeof(val) = 'null') then format('x.%I is null', col)
      when op in ('eq', 'is') then format('x.%I = %L::%s', col, val #>> '{}', typ)
      when op = 'neq' then format('x.%I is distinct from %L::%s', col, val #>> '{}', typ)
      when op in ('gt', 'gte', 'lt', 'lte') then format('x.%I %s %L::%s', col,
        case op when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end, val #>> '{}', typ)
      when op in ('like', 'ilike') then format('x.%I::text %s %L', col, op, val #>> '{}')
      when op = 'in' and jsonb_typeof(val) = 'array' then format('x.%I::text in (select jsonb_array_elements_text(%L::jsonb))', col, val::text)
      else 'false' end;
  end loop;

  if act = 'select' then
    col := r->'order'->>'col';
    if col is not null then
      if not exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = col and a.attnum > 0 and not a.attisdropped) then
        raise exception 'Unknown column %.', col;
      end if;
      ord := format(' order by x.%I %s', col, case when coalesce((r->'order'->>'ascending')::boolean, true) then 'asc' else 'desc' end);
    end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(y)), ''[]''::jsonb) from (select x.* from %s x where true%s%s limit %s) y', rel, w, ord, lim) into rows;
  elsif act in ('insert', 'upsert') then
    if act = 'upsert' and not (pk ? t) then raise exception 'Table % cannot be saved this way.', t; end if;
    if jsonb_typeof(r->'values') = 'array' and jsonb_array_length(r->'values') > 20 then raise exception 'Too many rows at once.'; end if;
    for item in select * from jsonb_array_elements(case when jsonb_typeof(r->'values') = 'array' then r->'values' else jsonb_build_array(r->'values') end) loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'Nothing to save.'; end if;
      select string_agg(format('%I', k), ', '), string_agg(format('%I = excluded.%I', k, k), ', ') filter (where k <> coalesce(pk->>t, ''))
        into keys, sets from jsonb_object_keys(item) k where ins->t ? k;
      if keys is null then raise exception 'Nothing to save.'; end if;
      execute format('insert into %s as x (%s) select %s from jsonb_populate_record(null::%s, $1)%s returning to_jsonb(x)', rel, keys, keys, rel,
        case when act = 'upsert' then format(' on conflict (%I) do %s', pk->>t, case when sets is null then 'nothing' else 'update set ' || sets end) else '' end)
        using item into one;
      if one is not null then rows := rows || one; end if;
    end loop;
  elsif act = 'update' then
    if w = '' then raise exception 'An update needs a filter.'; end if;
    if jsonb_typeof(r->'values') is distinct from 'object' then raise exception 'Nothing to save.'; end if;
    select string_agg(format('%I = p.%I', k, k), ', ') into sets from jsonb_object_keys(r->'values') k where upd->t ? k;
    if sets is null then raise exception 'Nothing to save.'; end if;
    execute format('with u as (update %s x set %s from jsonb_populate_record(null::%s, $1) p where true%s returning x.*) select coalesce(jsonb_agg(to_jsonb(u)), ''[]''::jsonb) from u', rel, sets, rel, w)
      using r->'values' into rows;
  elsif act = 'delete' then
    if w = '' then raise exception 'A delete needs a filter.'; end if;
    execute format('with d as (delete from %s x where true%s returning x.*) select coalesce(jsonb_agg(to_jsonb(d)), ''[]''::jsonb) from d', rel, w) into rows;
  else
    raise exception 'Unknown action.';
  end if;

  if t = 'game_saves' and act <> 'select' then return '[]'::jsonb; end if;   -- do not send the whole save back
  for e in select * from jsonb_array_elements(coalesce(r->'embed', '[]'::jsonb)) loop
    if (e->>'table') in ('profiles', 'guilds', 'combat_groups', 'chat_rooms') and jsonb_array_length(rows) > 0 then
      execute format('select coalesce(jsonb_agg(v || jsonb_build_object(%L, (select to_jsonb(y) from bsu_social.%I y where y.id = v->>%L)) order by n), ''[]''::jsonb) from jsonb_array_elements($1) with ordinality as a(v, n)',
        e->>'alias', e->>'table', e->>'col') using rows into rows;
    end if;
  end loop;
  return rows;
end $$;

-- q() must run as the powerless role, so that the rules apply to it.
grant bsu_player to postgres;
grant create on schema bsu_social to bsu_player;
alter function bsu_social.q(jsonb) owner to bsu_player;
revoke create on schema bsu_social from bsu_player;
revoke all on function bsu_social.q(jsonb) from public;
grant execute on function bsu_social.q(jsonb) to postgres;
