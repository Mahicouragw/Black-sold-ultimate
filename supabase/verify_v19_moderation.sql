-- Read-only v19 verification. Raises a named failure if moderation is incomplete.
do $verify$
declare n integer;
begin
 if to_regclass('public.moderator_roles') is null then raise exception 'FAIL: moderator_roles table';end if;
 select count(*) into n from information_schema.columns where table_schema='public' and table_name='game_feedback' and column_name in ('category','status','assigned_to','resolution_note','expires_at','updated_at');
 if n<>6 then raise exception 'FAIL: feedback inbox columns';end if;
 select count(*) into n from pg_trigger where tgname in ('game_feedback_assign','chat_content_moderation','room_chat_content_moderation') and tgenabled<>'D';
 if n<>3 then raise exception 'FAIL: moderation triggers';end if;
 if to_regprocedure('public.submit_game_feedback(text,text)') is null or to_regprocedure('public.list_moderator_feedback(integer)') is null or to_regprocedure('public.moderate_game_feedback(uuid,text,text)') is null then raise exception 'FAIL: feedback RPC functions';end if;
 if has_table_privilege('authenticated','public.moderator_roles','select') then raise exception 'FAIL: private role table exposed';end if;
 select count(*) into n from public.moderator_roles where active and role in ('moderator','developer');
 if n<1 then raise exception 'CONFIGURATION REQUIRED: assign one known authenticated account in moderator_roles; no account was guessed';end if;
end;
$verify$;
select 'PASS: feedback moderation and an active moderator/developer are configured' as result;
