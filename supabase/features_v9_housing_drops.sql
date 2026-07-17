-- v9 public dropped items. Private house storage remains inside each owner's encrypted/authenticated cloud save.
create table if not exists public.world_drops (
  id uuid primary key default gen_random_uuid(), location_id text not null,
  dropped_by uuid not null references public.profiles(id) on delete cascade,
  item_id text not null, item_snapshot jsonb not null, quantity integer not null default 1 check(quantity between 1 and 99),
  created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '1 hour')
);
alter table public.world_drops enable row level security;
drop policy if exists world_drops_read on public.world_drops;
drop policy if exists world_drops_insert on public.world_drops;
create policy world_drops_read on public.world_drops for select to authenticated using(expires_at>now());
create policy world_drops_insert on public.world_drops for insert to authenticated with check(dropped_by=auth.uid());
revoke delete,update on public.world_drops from anon,authenticated;
grant select,insert on public.world_drops to authenticated;

create or replace function public.take_world_drop(drop_uuid uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.world_drops where id=drop_uuid and expires_at>now()
  returning jsonb_build_object('item_id',item_id,'item_snapshot',item_snapshot,'quantity',quantity) into result;
  return result;
end;$$;
grant execute on function public.take_world_drop(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.world_drops; exception when duplicate_object then null; end $$;
