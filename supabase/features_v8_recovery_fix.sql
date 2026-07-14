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
