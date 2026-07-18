-- v17 allow up to five players in online Game Hall sessions.
alter table public.game_hall_sessions drop constraint if exists game_hall_sessions_max_players_check;
alter table public.game_hall_sessions add constraint game_hall_sessions_max_players_check check(max_players between 1 and 5);
create or replace function public.create_game_hall_session(kind text,session_name text,players integer,initial_state jsonb)
returns uuid language plpgsql security definer set search_path=public as $$declare sid uuid;begin if not has_linked_identity() then raise exception 'Link Google before creating an online game';end if;insert into game_hall_sessions(game_type,name,owner_id,max_players,state) values(kind,left(session_name,60),auth.uid(),greatest(1,least(5,players)),initial_state) returning id into sid;insert into game_hall_members values(sid,auth.uid(),0,now());return sid;end$$;
grant execute on function create_game_hall_session(text,text,integer,jsonb) to authenticated;
