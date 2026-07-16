-- v13 globally unique hero names and real system voice descriptors.
create table if not exists public.hero_name_registry (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 hero_slot text not null,hero_name text not null check(char_length(trim(hero_name)) between 2 and 20),
 normalized_name text generated always as (lower(trim(hero_name))) stored,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,hero_slot),unique(normalized_name)
);
insert into public.hero_name_registry(owner_id,hero_slot,hero_name)
select p.id,'legacy-profile',left(trim(p.display_name),20) from public.profiles p where char_length(trim(p.display_name)) between 2 and 20
on conflict do nothing;
alter table public.hero_name_registry enable row level security;
drop policy if exists hero_names_owner_read on public.hero_name_registry;
create policy hero_names_owner_read on public.hero_name_registry for select to authenticated using(owner_id=auth.uid());
revoke all on public.hero_name_registry from anon,authenticated;grant select on public.hero_name_registry to authenticated;

create or replace function public.hero_name_available(desired_name text,current_slot text default null)
returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from hero_name_registry where normalized_name=lower(trim(desired_name)) and not(owner_id=auth.uid() and hero_slot=coalesce(current_slot,'')));
$$;
create or replace function public.reserve_hero_name(desired_name text,target_slot text)
returns boolean language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if char_length(trim(desired_name))<2 or char_length(trim(desired_name))>20 then raise exception 'Hero name must contain 2 to 20 characters';end if;
 if exists(select 1 from hero_name_registry where normalized_name=lower(trim(desired_name)) and not(owner_id=auth.uid() and hero_slot=target_slot)) then raise exception 'The name already exists. Please choose another name.' using errcode='unique_violation';end if;
 insert into hero_name_registry(owner_id,hero_slot,hero_name,updated_at) values(auth.uid(),target_slot,trim(desired_name),now())
 on conflict(owner_id,hero_slot) do update set hero_name=excluded.hero_name,updated_at=now();return true;
exception when unique_violation then raise exception 'The name already exists. Please choose another name.';end$$;
create or replace function public.release_hero_name(target_slot text)
returns boolean language plpgsql security definer set search_path=public as $$begin delete from hero_name_registry where owner_id=auth.uid() and hero_slot=target_slot;return found;end$$;
grant execute on function public.hero_name_available(text,text) to authenticated;grant execute on function public.reserve_hero_name(text,text) to authenticated;grant execute on function public.release_hero_name(text) to authenticated;

-- Voice IDs now hold a system voice descriptor such as system:Microsoft Ravi.
alter table public.messages drop constraint if exists messages_voice_id_check;
alter table public.chat_room_messages drop constraint if exists chat_room_messages_voice_id_check;
alter table public.messages alter column voice_id type text,alter column voice_id set default 'system:default';
alter table public.chat_room_messages alter column voice_id type text,alter column voice_id set default 'system:default';
alter table public.messages drop constraint if exists messages_voice_id_length;
alter table public.chat_room_messages drop constraint if exists chat_room_messages_voice_id_length;
alter table public.messages add constraint messages_voice_id_length check(char_length(voice_id) between 2 and 180) not valid;
alter table public.chat_room_messages add constraint chat_room_messages_voice_id_length check(char_length(voice_id) between 2 and 180) not valid;
