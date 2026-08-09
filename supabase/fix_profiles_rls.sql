-- Black Sword Ultimate: repair profiles privileges + RLS
-- Safe to re-run. Anonymous-auth players use the `authenticated` Postgres role.

begin;

alter table public.profiles enable row level security;

-- Browser requests without a signed-in Supabase session must not access profiles.
revoke all on table public.profiles from anon;

-- RLS alone is not enough: Postgres privileges must also allow each operation.
grant select, insert on table public.profiles to authenticated;
revoke update on table public.profiles from authenticated;
grant update (display_name, level, current_location, last_seen)
  on table public.profiles to authenticated;

-- Recreate only the profile policies, preserving policies on every other table.
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_read
  on public.profiles
  for select
  to authenticated
  using (true);

-- Fallback for ensureProfileRow() if a legacy user has no trigger-created row.
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

commit;
