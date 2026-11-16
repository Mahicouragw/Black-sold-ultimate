-- Black Sword Ultimate: self-test for the online data rules.
-- Creates bsu_social.selftest(). Running it plays through the rules with four
-- made-up players and returns {"passed": n, "failed": [names]}. Everything it
-- writes is rolled back before it returns, so it is safe on the live database.
--   select bsu_social.selftest();

create or replace function bsu_social.t_q(who text, google boolean, tbl text, act text, vals jsonb default null, filters jsonb default '[]', extra jsonb default '{}')
returns jsonb language sql as $$
  select public.bsu_data(who, jsonb_build_object('google', google, 'email', who || '@test.invalid', 'name', 'Test ' || who),
    jsonb_build_object('kind', 'query', 'table', tbl, 'action', act, 'values', vals, 'filters', filters) || extra)
$$;
create or replace function bsu_social.t_rpc(who text, google boolean, fn text, args jsonb default '{}')
returns jsonb language sql as $$
  select public.bsu_data(who, jsonb_build_object('google', google, 'email', who || '@test.invalid', 'name', 'Test ' || who),
    jsonb_build_object('kind', 'rpc', 'name', fn, 'args', args))
$$;
create or replace function bsu_social.t_eq(col text, val text) returns jsonb language sql as
$$ select jsonb_build_array(jsonb_build_object('col', col, 'op', 'eq', 'val', val)) $$;
create or replace function bsu_social.t_chk(res jsonb, name text, cond boolean) returns jsonb language sql as
$$ select res || jsonb_build_array(jsonb_build_object('n', name, 'ok', coalesce(cond, false))) $$;

create or replace function bsu_social.selftest() returns jsonb
language plpgsql set search_path = bsu_social, public, pg_temp as $$
declare
  a text := 'zz-test-a'; b text := 'zz-test-b'; g text := 'zz-test-guest'; m text := 'zz-test-mod';
  res jsonb := '[]'; r jsonb; r2 jsonb; code text; fr text; room text; guild text; grp text; inv text; drop_id text; fb text; i int;
  key text := repeat('ab', 32); crash text;
begin
  begin
    -- profiles and Player ID
    r := t_rpc(a, true, 'get_my_profile'); code := r->'data'->>'player_code';
    res := t_chk(res, 'profile is created with a Player ID', r->'data'->>'id' = a and code ~ '^KND-[A-Z2-9]{4}-[A-Z2-9]{4}$');
    res := t_chk(res, 'Player ID stays the same', t_rpc(a, true, 'get_my_profile')->'data'->>'player_code' = code);
    perform t_rpc(b, true, 'get_my_profile'); perform t_rpc(g, false, 'get_my_profile'); perform t_rpc(m, true, 'get_my_profile');
    r := t_q(a, true, 'profiles', 'update', '{"display_name": "Alice Test", "level": 5}', t_eq('id', a));
    res := t_chk(res, 'own profile can be changed', r->'data'->0->>'display_name' = 'Alice Test');
    r := t_q(b, true, 'profiles', 'update', '{"display_name": "Hacked"}', t_eq('id', a));
    res := t_chk(res, 'another profile cannot be changed', r->'data' = '[]' and (select display_name from profiles where id = a) = 'Alice Test');
    r := t_q(b, true, 'profiles', 'insert', '{"id": "zz-test-x", "display_name": "Fake"}');
    res := t_chk(res, 'a profile for someone else is refused', r->'error'->>'code' = '42501');
    res := t_chk(res, 'Player ID is not in the public profile', not (t_q(b, true, 'profiles', 'select', null, t_eq('id', a))->'data'->0 ? 'player_code'));
    -- cloud save
    r := t_q(a, true, 'game_saves', 'upsert', jsonb_build_object('user_id', a, 'save_data', '{"version": 2, "heroes": [1, 2]}'::jsonb, 'updated_at', now()));
    res := t_chk(res, 'save is stored', r ? 'data');
    perform t_q(a, true, 'game_saves', 'upsert', jsonb_build_object('user_id', a, 'save_data', '{"version": 3}'::jsonb));
    res := t_chk(res, 'save is read back, newest version', t_q(a, true, 'game_saves', 'select', null, t_eq('user_id', a))->'data'->0->'save_data'->>'version' = '3');
    res := t_chk(res, 'another player cannot read the save', t_q(b, true, 'game_saves', 'select', null, t_eq('user_id', a))->'data' = '[]');
    res := t_chk(res, 'another player cannot overwrite the save', t_q(b, true, 'game_saves', 'upsert', jsonb_build_object('user_id', a, 'save_data', '{}'::jsonb))->'error'->>'code' = '42501');
    res := t_chk(res, 'a guest can save', t_q(g, false, 'game_saves', 'upsert', jsonb_build_object('user_id', g, 'save_data', '{"version": 2}'::jsonb)) ? 'data');
    -- friends
    res := t_chk(res, 'a guest cannot send a friend request', t_q(g, false, 'friend_requests', 'insert', jsonb_build_object('sender_id', g, 'receiver_id', a))->'error'->>'code' = '42501');
    r := t_q(a, true, 'friend_requests', 'insert', jsonb_build_object('sender_id', a, 'receiver_id', b)); fr := r->'data'->0->>'id';
    res := t_chk(res, 'friend request is sent', fr is not null and r->'data'->0->>'status' = 'pending');
    res := t_chk(res, 'the same request twice is refused kindly', t_q(a, true, 'friend_requests', 'insert', jsonb_build_object('sender_id', a, 'receiver_id', b))->'error'->>'message' like '%still waiting%');
    res := t_chk(res, 'a request in the other direction is refused kindly', t_q(b, true, 'friend_requests', 'insert', jsonb_build_object('sender_id', b, 'receiver_id', a))->'error'->>'message' like '%already sent you%');
    res := t_chk(res, 'the sender cannot accept the own request', t_q(a, true, 'friend_requests', 'update', '{"status": "accepted"}', t_eq('id', fr))->'data' = '[]');
    r := t_q(b, true, 'friend_requests', 'update', jsonb_build_object('status', 'accepted', 'sender_id', g), t_eq('id', fr) || t_eq('receiver_id', b));
    res := t_chk(res, 'the receiver accepts, and cannot change who sent it', r->'data'->0->>'status' = 'accepted' and r->'data'->0->>'sender_id' = a);
    res := t_chk(res, 'a third player sees no requests of others', t_q(g, false, 'friend_requests', 'select')->'data' = '[]');
    -- chat
    res := t_chk(res, 'public message is sent', t_q(a, true, 'messages', 'insert', jsonb_build_object('sender_id', a, 'receiver_id', null, 'body', ' hello all '))->'data'->0->>'body' = 'hello all');
    res := t_chk(res, 'private message is sent', t_q(a, true, 'messages', 'insert', jsonb_build_object('sender_id', a, 'receiver_id', b, 'body', 'secret for b')) ? 'data');
    res := t_chk(res, 'nobody can write as another player', t_q(g, false, 'messages', 'insert', jsonb_build_object('sender_id', a, 'body', 'fake'))->'error'->>'code' = '42501');
    res := t_chk(res, 'a message over 300 characters is refused', t_q(a, true, 'messages', 'insert', jsonb_build_object('sender_id', a, 'body', repeat('x', 301)))->'error'->>'code' = '23514');
    res := t_chk(res, 'the receiver sees the private message', (select count(*) from jsonb_array_elements(t_q(b, true, 'messages', 'select')->'data') x where x->>'body' = 'secret for b') = 1);
    r := t_q(g, false, 'messages', 'select', null, '[]', '{"embed": [{"alias": "sender", "table": "profiles", "col": "sender_id"}], "order": {"col": "created_at", "ascending": false}, "limit": 30}');
    res := t_chk(res, 'a third player sees the public message but not the private one',
      (select count(*) filter (where x->>'body' = 'hello all') = 1 and count(*) filter (where x->>'body' = 'secret for b') = 0 from jsonb_array_elements(r->'data') x));
    res := t_chk(res, 'the sender name comes with the message', (select bool_or(x->'sender'->>'display_name' = 'Alice Test') from jsonb_array_elements(r->'data') x));
    r := t_rpc(b, true, 'changes', jsonb_build_object('since', now() - interval '5 minutes', 'tables', '["messages", "friend_requests"]'::jsonb));
    res := t_chk(res, 'live updates bring the private message and the friend request',
      (select count(*) filter (where x->>'table' = 'messages' and x->'row'->>'body' = 'secret for b') = 1 and count(*) filter (where x->>'table' = 'friend_requests') = 1 from jsonb_array_elements(r->'data'->'events') x));
    r := t_rpc(g, false, 'changes', jsonb_build_object('since', now() - interval '5 minutes', 'tables', '["messages", "friend_requests"]'::jsonb));
    res := t_chk(res, 'live updates never leak a private message', (select count(*) = 1 from jsonb_array_elements(r->'data'->'events') x));
    for i in 1..3 loop perform t_q(a, true, 'messages', 'insert', jsonb_build_object('sender_id', a, 'body', 'line ' || i)); end loop;
    res := t_chk(res, 'the sixth line in ten seconds is refused', t_q(a, true, 'messages', 'insert', jsonb_build_object('sender_id', a, 'body', 'too fast'))->'error'->>'message' like 'Please wait%');
    -- chat rooms
    res := t_chk(res, 'the four standing rooms are listed', jsonb_array_length(t_q(g, false, 'chat_rooms', 'select')->'data') = 4);
    res := t_chk(res, 'writing in a room needs joining first', t_q(g, false, 'chat_room_messages', 'insert', jsonb_build_object('room_id', 'world', 'sender_id', g, 'body', 'hi'))->'error'->>'code' = '42501');
    res := t_chk(res, 'a guest joins World Chat', t_rpc(g, false, 'join_chat_room', '{"target_room": "world"}')->'data' = '1');
    res := t_chk(res, 'a guest writes in World Chat', t_q(g, false, 'chat_room_messages', 'insert', jsonb_build_object('room_id', 'world', 'sender_id', g, 'body', 'hi')) ? 'data');
    res := t_chk(res, 'room heartbeat counts users', (t_rpc(g, false, 'chat_room_heartbeat', '{"target_room": "world"}')->'data'->>'users')::int >= 1);
    res := t_chk(res, 'a guest cannot create a room', t_rpc(g, false, 'create_custom_chat_room', '{"room_name": "Guest Room"}')->'error'->>'message' like 'Sign in with Google%');
    r := t_rpc(a, true, 'create_custom_chat_room', '{"room_name": "ZZ Private", "room_visibility": "private", "max_users": 5, "wait_minutes": 0}'); room := r->>'data';
    res := t_chk(res, 'a private room is created', room is not null);
    res := t_chk(res, 'a private room is hidden from others', t_q(b, true, 'chat_rooms', 'select', null, t_eq('id', room))->'data' = '[]' and t_rpc(b, true, 'join_chat_room', jsonb_build_object('target_room', room)) ? 'error');
    res := t_chk(res, 'only the room owner can invite', t_q(b, true, 'chat_room_invites', 'insert', jsonb_build_object('room_id', room, 'sender_id', b, 'receiver_id', g))->'error'->>'code' = '42501');
    r := t_q(a, true, 'chat_room_invites', 'insert', jsonb_build_object('room_id', room, 'sender_id', a, 'receiver_id', b)); inv := r->'data'->0->>'id';
    r := t_q(b, true, 'chat_room_invites', 'select', null, t_eq('receiver_id', b) || t_eq('status', 'pending'), '{"embed": [{"alias": "room", "table": "chat_rooms", "col": "room_id"}]}');
    res := t_chk(res, 'a waiting invitation shows the room name, but the room stays closed', r->'data'->0->'room'->>'name' = 'ZZ Private'
      and t_q(b, true, 'chat_rooms', 'select', null, t_eq('id', room))->'data' = '[]' and t_rpc(b, true, 'join_chat_room', jsonb_build_object('target_room', room)) ? 'error');
    res := t_chk(res, 'a stranger gets no room card', t_q(g, false, 'messages', 'select', null, '[]', jsonb_build_object('embed', jsonb_build_array(jsonb_build_object('alias', 'room', 'table', 'chat_rooms', 'col', 'sender_id'))))->'data'->0->'room' = 'null'
      and bsu_social.card('accounts', a) is null);
    perform t_q(b, true, 'chat_room_invites', 'update', '{"status": "accepted"}', t_eq('id', inv) || t_eq('receiver_id', b));
    res := t_chk(res, 'after accepting the invitation the room opens', jsonb_array_length(t_q(b, true, 'chat_rooms', 'select', null, t_eq('id', room))->'data') = 1 and t_rpc(b, true, 'join_chat_room', jsonb_build_object('target_room', room))->'data' = '1');
    res := t_chk(res, 'a room message is read by a member', t_q(b, true, 'chat_room_messages', 'insert', jsonb_build_object('room_id', room, 'sender_id', b, 'body', 'in private')) ? 'data'
      and jsonb_array_length(t_q(a, true, 'chat_room_messages', 'select', null, t_eq('room_id', room))->'data') = 1 and t_q(g, false, 'chat_room_messages', 'select', null, t_eq('room_id', room))->'data' = '[]');
    res := t_chk(res, 'only the owner can block', t_rpc(b, true, 'blacklist_chat_user', jsonb_build_object('target_room', room, 'target_user', a)) ? 'error');
    perform t_rpc(a, true, 'blacklist_chat_user', jsonb_build_object('target_room', room, 'target_user', b));
    res := t_chk(res, 'a blocked hero cannot come back or write', t_rpc(b, true, 'join_chat_room', jsonb_build_object('target_room', room))->'error'->>'message' like '%blocked%'
      and t_q(b, true, 'chat_room_messages', 'insert', jsonb_build_object('room_id', room, 'sender_id', b, 'body', 'again'))->'error'->>'code' = '42501');
    res := t_chk(res, 'the personal room is made once', t_rpc(g, false, 'ensure_personal_chat_room')->>'data' = 'personal_' || g and jsonb_array_length(t_q(g, false, 'chat_rooms', 'select')->'data') = 5);
    res := t_chk(res, 'the personal room cannot be deleted, a custom room can', t_q(g, false, 'chat_rooms', 'delete', null, t_eq('id', 'personal_' || g))->'data' = '[]'
      and jsonb_array_length(t_q(a, true, 'chat_rooms', 'delete', null, t_eq('id', room) || t_eq('owner_id', a))->'data') = 1);
    -- guilds
    res := t_chk(res, 'a guest cannot found a guild', t_q(g, false, 'guilds', 'insert', jsonb_build_object('name', 'ZZ Guest Guild', 'owner_id', g))->'error'->>'code' = '42501');
    r := t_q(a, true, 'guilds', 'insert', jsonb_build_object('name', 'ZZ Test Guild', 'owner_id', a)); guild := r->'data'->0->>'id';
    res := t_chk(res, 'a guild is founded', guild is not null and t_q(a, true, 'guild_members', 'insert', jsonb_build_object('guild_id', guild, 'user_id', a, 'role', 'owner')) ? 'data');
    res := t_chk(res, 'a guild name is unique', t_q(b, true, 'guilds', 'insert', jsonb_build_object('name', 'zz  test guild', 'owner_id', b))->'error'->>'code' = '23505');
    res := t_chk(res, 'joining a guild needs an invitation', t_q(b, true, 'guild_members', 'insert', jsonb_build_object('guild_id', guild, 'user_id', b, 'role', 'member'))->'error'->>'code' = '42501');
    res := t_chk(res, 'nobody can make himself owner', t_q(b, true, 'guild_members', 'insert', jsonb_build_object('guild_id', guild, 'user_id', b, 'role', 'owner'))->'error'->>'code' = '42501');
    r := t_q(a, true, 'guild_invites', 'insert', jsonb_build_object('guild_id', guild, 'sender_id', a, 'receiver_id', b)); inv := r->'data'->0->>'id';
    r := t_q(b, true, 'guild_invites', 'select', null, t_eq('receiver_id', b) || t_eq('status', 'pending'), '{"embed": [{"alias": "guild", "table": "guilds", "col": "guild_id"}, {"alias": "sender", "table": "profiles", "col": "sender_id"}]}');
    res := t_chk(res, 'the invitation shows guild and sender', r->'data'->0->'guild'->>'name' = 'ZZ Test Guild' and r->'data'->0->'sender'->>'display_name' = 'Alice Test');
    perform t_q(b, true, 'guild_invites', 'update', '{"status": "accepted"}', t_eq('id', inv));
    res := t_chk(res, 'an invited hero joins the guild', t_q(b, true, 'guild_members', 'insert', jsonb_build_object('guild_id', guild, 'user_id', b, 'role', 'member')) ? 'data');
    -- combat groups
    r := t_q(a, true, 'combat_groups', 'insert', jsonb_build_object('name', 'ZZ Group', 'owner_id', a)); grp := r->'data'->0->>'id';
    perform t_q(a, true, 'combat_group_members', 'insert', jsonb_build_object('group_id', grp, 'user_id', a, 'role', 'leader'));
    res := t_chk(res, 'a group member records an attack', t_q(a, true, 'group_battle_actions', 'insert', jsonb_build_object('group_id', grp, 'user_id', a, 'monster_name', 'Wolf', 'damage', 12)) ? 'data');
    res := t_chk(res, 'an outsider cannot attack for the group or read it', t_q(b, true, 'group_battle_actions', 'insert', jsonb_build_object('group_id', grp, 'user_id', b, 'monster_name', 'Wolf', 'damage', 12))->'error'->>'code' = '42501'
      and t_q(b, true, 'group_battle_actions', 'select')->'data' = '[]');
    res := t_chk(res, 'impossible damage is refused', t_q(a, true, 'group_battle_actions', 'insert', jsonb_build_object('group_id', grp, 'user_id', a, 'monster_name', 'Wolf', 'damage', 20000))->'error'->>'code' = '23514');
    -- hero names
    res := t_chk(res, 'a hero name is reserved', t_rpc(a, true, 'reserve_hero_name', '{"desired_name": "Zz  Test Hero", "target_slot": "s1"}')->'data' = 'true');
    res := t_chk(res, 'a taken name is not free for others, but is for the owner', t_rpc(b, true, 'hero_name_available', '{"desired_name": "zz test hero"}')->'data' = 'false'
      and t_rpc(a, true, 'hero_name_available', '{"desired_name": "zz test hero"}')->'data' = 'true' and t_rpc(b, true, 'reserve_hero_name', '{"desired_name": "ZZ TEST HERO", "target_slot": "s1"}')->'error'->>'message' like '%already taken%');
    res := t_chk(res, 'a hero is found by the reserved name', t_rpc(b, true, 'find_heroes_by_name', '{"hero_name": "zz test hero"}')->'data'->0->>'id' = a);
    res := t_chk(res, 'a name is released', t_rpc(a, true, 'release_hero_name', '{"target_slot": "s1"}')->'data' = '1');
    -- feedback
    r := t_rpc(g, false, 'submit_game_feedback', '{"feedback_category": "bug", "feedback_message": "The door is stuck."}'); fb := r->>'data';
    res := t_chk(res, 'a guest sends feedback', fb is not null);
    res := t_chk(res, 'feedback is closed to ordinary players', t_rpc(b, true, 'list_moderator_feedback')->'error'->>'message' like 'Not authorized%');
    insert into owner_emails(email) values (m || '@test.invalid');
    res := t_chk(res, 'the owner reads and answers feedback', (select bool_or(x->>'feedback_id' = fb) from jsonb_array_elements(t_rpc(m, true, 'list_moderator_feedback')->'data') x)
      and t_rpc(m, true, 'moderate_game_feedback', jsonb_build_object('feedback_id', fb, 'new_status', 'reviewed', 'private_note', 'ok'))->'data' = 'true');
    -- shared loot
    r := t_q(g, false, 'world_drops', 'insert', jsonb_build_object('location_id', 'zz-test-place', 'dropped_by', g, 'item_id', 'apple', 'item_snapshot', '{"name": "Apple"}'::jsonb, 'quantity', 1)); drop_id := r->'data'->0->>'id';
    res := t_chk(res, 'dropped loot is listed', jsonb_array_length(t_q(a, true, 'world_drops', 'select', null, t_eq('location_id', 'zz-test-place'))->'data') = 1);
    res := t_chk(res, 'loot is taken once only', t_rpc(a, true, 'take_world_drop', jsonb_build_object('drop_uuid', drop_id))->'data'->'item_snapshot'->>'name' = 'Apple'
      and t_rpc(b, true, 'take_world_drop', jsonb_build_object('drop_uuid', drop_id)) ? 'error');
    -- map notes
    res := t_chk(res, 'a guest cannot publish a map note, a Google player can', t_q(g, false, 'community_map_markers', 'insert', jsonb_build_object('creator_id', g, 'location_id', 'zz-test-place', 'title', 'Note', 'note', 'Hello there'))->'error'->>'code' = '42501'
      and t_q(a, true, 'community_map_markers', 'insert', jsonb_build_object('creator_id', a, 'location_id', 'zz-test-place', 'title', 'Note', 'note', 'Hello there', 'visibility', 'public')) ? 'data');
    res := t_chk(res, 'only the writer deletes a map note', t_q(b, true, 'community_map_markers', 'delete', null, t_eq('location_id', 'zz-test-place'))->'data' = '[]'
      and jsonb_array_length(t_q(a, true, 'community_map_markers', 'delete', null, t_eq('location_id', 'zz-test-place') || t_eq('creator_id', a))->'data') = 1);
    -- Player ID and PIN
    res := t_chk(res, 'a PIN is set', t_rpc(a, true, 'set_player_recovery_pin', jsonb_build_object('recovery_key', key, 'current_save', '{"version": 2, "gold": 77}'::jsonb))->'data' = 'true');
    res := t_chk(res, 'Player ID and PIN bring the save back on a new device', t_rpc(g, false, 'recover_progress_with_pin', jsonb_build_object('code', lower(code), 'recovery_key', key))->'data'->>'gold' = '77');
    res := t_chk(res, 'a wrong PIN is refused', t_rpc(g, false, 'recover_progress_with_pin', jsonb_build_object('code', code, 'recovery_key', repeat('cd', 32)))->'error'->>'message' = 'Invalid Player ID or PIN.');
    for i in 1..9 loop perform t_rpc(g, false, 'recover_progress_with_pin', jsonb_build_object('code', code, 'recovery_key', repeat('cd', 32))); end loop;
    res := t_chk(res, 'after ten wrong tries even the right PIN must wait', t_rpc(b, true, 'recover_progress_with_pin', jsonb_build_object('code', code, 'recovery_key', key))->'error'->>'message' like 'Too many%');
    -- the doors that must stay shut
    res := t_chk(res, 'private tables cannot be asked for', t_q(a, true, 'accounts', 'select')->'error'->>'message' like '%not available%' and t_q(a, true, 'player_recovery', 'select') ? 'error');
    res := t_chk(res, 'a forged column name is refused', t_q(a, true, 'profiles', 'select', null, t_eq('id" = ''x'' or true --', 'x'))->'error'->>'message' like 'Unknown column%');
    res := t_chk(res, 'a forged value stays a value', t_q(a, true, 'profiles', 'select', null, t_eq('id', 'x'' or ''1''=''1'))->'data' = '[]');
    res := t_chk(res, 'unknown actions and functions are refused', t_q(a, true, 'profiles', 'truncate') ? 'error' and t_rpc(a, true, 'tidy; drop schema bsu_social')->'error'->>'code' = 'unknown-function'
      and t_rpc(a, true, 'selftest')->'error'->>'code' = 'unknown-function');
    res := t_chk(res, 'a request without a player is refused', public.bsu_data(null, '{}', '{"kind": "rpc", "name": "get_my_profile"}')->'error'->>'code' = 'unauthenticated');
    res := t_chk(res, 'only the server function may call the entry point', not has_function_privilege('anon', 'public.bsu_data(text,jsonb,jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.bsu_data(text,jsonb,jsonb)', 'execute') and has_function_privilege('service_role', 'public.bsu_data(text,jsonb,jsonb)', 'execute')
      and not has_schema_privilege('anon', 'bsu_social', 'usage') and not has_schema_privilege('authenticated', 'bsu_social', 'usage'));
    -- a guest becomes a Google player
    perform public.bsu_data('g-zz-test-1', '{"google": false}', '{"kind": "rpc", "name": "get_my_profile"}');
    perform public.bsu_data('g-zz-test-1', '{"google": false}', '{"kind": "rpc", "name": "reserve_hero_name", "args": {"desired_name": "Zz Guest Hero", "target_slot": "h1"}}');
    perform public.bsu_data('g-zz-test-1', '{"google": false}', '{"kind": "query", "table": "game_saves", "action": "upsert", "values": {"user_id": "g-zz-test-1", "save_data": {"gold": 5}}}');
    r := jsonb_build_array(public.bsu_data('zz-test-new', '{"google": true}', '{"kind": "rpc", "name": "adopt_guest", "args": {"guest": "g-zz-test-1"}}')->'data'->'moved',
      public.bsu_data('g-zz-test-2', '{"google": false, "guest": "g-zz-test-1"}', '{"kind": "rpc", "name": "adopt_guest"}')->'data'->'moved');
    res := t_chk(res, 'a guest id written in the request moves nothing', r = '[false, false]' and exists (select 1 from game_saves where user_id = 'g-zz-test-1'));
    r := public.bsu_data(a, '{"google": true, "guest": "g-zz-test-1"}', '{"kind": "rpc", "name": "adopt_guest"}');
    res := t_chk(res, 'an account that already has heroes keeps them, the guest stays', r->'data'->>'moved' = 'false' and exists (select 1 from game_saves where user_id = 'g-zz-test-1'));
    r := public.bsu_data('zz-test-new', '{"google": true, "guest": "g-zz-test-1"}', '{"kind": "rpc", "name": "adopt_guest"}');
    res := t_chk(res, 'a new Google account takes over the guest''s save and hero names', r->'data'->>'moved' = 'true'
      and (select save_data->>'gold' from game_saves where user_id = 'zz-test-new') = '5' and not exists (select 1 from game_saves where user_id = 'g-zz-test-1')
      and (select owner_id from hero_names where normalized_name = norm('Zz Guest Hero')) = 'zz-test-new');
    -- new guests per network
    insert into guests(user_id, net_key) select 'g-zz-fill-' || n, 'zz-test-net' from generate_series(1, 60) n;
    res := t_chk(res, 'one network cannot create guests without limit; known guests and Google players are not held back',
      public.bsu_data('g-zz-test-3', '{"google": false, "net": "zz-test-net"}', '{"kind": "rpc", "name": "get_my_profile"}')->'error'->>'code' = 'slow_down'
      and public.bsu_data('g-zz-test-1', '{"google": false, "net": "zz-test-net"}', '{"kind": "rpc", "name": "get_my_profile"}') ? 'data'
      and public.bsu_data(a, '{"google": true, "net": "zz-test-net"}', '{"kind": "rpc", "name": "get_my_profile"}') ? 'data'
      and public.bsu_data('g-zz-test-4', '{"google": false, "net": "zz-other-net"}', '{"kind": "rpc", "name": "get_my_profile"}') ? 'data');
    raise exception 'bsu-selftest-rollback';
  exception when others then
    if sqlerrm <> 'bsu-selftest-rollback' then crash := sqlstate || ' ' || sqlerrm; end if;
  end;
  return jsonb_build_object('passed', (select count(*) from jsonb_array_elements(res) x where (x->>'ok')::boolean),
    'failed', (select coalesce(jsonb_agg(x->>'n'), '[]'::jsonb) from jsonb_array_elements(res) x where not (x->>'ok')::boolean),
    'crash', crash, 'left_behind', (select count(*) from profiles where id like 'zz-test-%' or id like 'g-zz-%') + (select count(*) from guests where user_id like 'g-zz-%'));
end $$;
