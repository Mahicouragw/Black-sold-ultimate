-- Read-only verification: raises an error if v18 is incomplete.
do $verify$
declare n integer;
begin
  select count(*) into n from information_schema.columns where table_schema='public' and table_name in ('messages','chat_room_messages') and column_name='expires_at' and is_nullable='NO';
  if n<>2 then raise exception 'FAIL: expiration columns'; end if;
  select count(*) into n from pg_constraint where conname in ('messages_five_minute_expiration','chat_room_messages_five_minute_expiration') and convalidated;
  if n<>2 then raise exception 'FAIL: constraints'; end if;
  select count(*) into n from pg_trigger where tgname in ('messages_server_expiration','room_messages_server_expiration','messages_purge_expired_after_insert','room_messages_purge_expired_after_insert') and tgenabled<>'D';
  if n<>4 then raise exception 'FAIL: triggers'; end if;
  select count(*) into n from pg_policies where schemaname='public' and policyname in ('messages_visible','room_messages_visible') and qual ilike '%expires_at%now%';
  if n<>2 then raise exception 'FAIL: expiry RLS'; end if;
  select count(*) into n from pg_policies where schemaname='public' and tablename='chat_room_messages' and policyname='room_messages_send' and with_check ilike '%chat_room_members%' and with_check ilike '%chat_room_blacklist%';
  if n<>1 then raise exception 'FAIL: room authorization'; end if;
  if to_regclass('public.messages_receiver_expiration_idx') is null or to_regclass('public.room_messages_room_expiration_idx') is null then raise exception 'FAIL: indexes'; end if;
  if has_function_privilege('anon','public.purge_expired_chat_messages()','execute') or has_function_privilege('authenticated','public.purge_expired_chat_messages()','execute') then raise exception 'FAIL: purge privilege'; end if;
end;
$verify$;
select 'PASS: v18 five-minute chat enforcement is installed' as result;
