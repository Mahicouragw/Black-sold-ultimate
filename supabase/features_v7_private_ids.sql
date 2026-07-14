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
