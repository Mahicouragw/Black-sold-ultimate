-- v11 secure player-created community map markers.
create table if not exists public.community_map_markers (
 id uuid primary key default gen_random_uuid(),creator_id uuid not null references public.profiles(id) on delete cascade,
 location_id text not null,title text not null check(char_length(title) between 2 and 60),
 note text not null check(char_length(note) between 2 and 500),visibility text not null default 'public' check(visibility in ('public','brotherhood')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists community_markers_location on public.community_map_markers(location_id,created_at desc);
alter table public.community_map_markers enable row level security;
drop policy if exists community_markers_read on public.community_map_markers;drop policy if exists community_markers_create on public.community_map_markers;drop policy if exists community_markers_owner_update on public.community_map_markers;drop policy if exists community_markers_owner_delete on public.community_map_markers;
create policy community_markers_read on public.community_map_markers for select to authenticated using(visibility='public' or creator_id=auth.uid() or (visibility='brotherhood' and exists(select 1 from guild_members mine join guild_members theirs on mine.guild_id=theirs.guild_id where mine.user_id=auth.uid() and theirs.user_id=creator_id)));
create policy community_markers_create on public.community_map_markers for insert to authenticated with check(creator_id=auth.uid() and public.has_linked_identity());
create policy community_markers_owner_update on public.community_map_markers for update to authenticated using(creator_id=auth.uid()) with check(creator_id=auth.uid());
create policy community_markers_owner_delete on public.community_map_markers for delete to authenticated using(creator_id=auth.uid());
grant select,insert,update,delete on public.community_map_markers to authenticated;
