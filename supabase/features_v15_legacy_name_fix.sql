-- v15 prevent false duplicate-name errors when an existing hero continues.
create or replace function public.reserve_hero_name(desired_name text,target_slot text)
returns boolean language plpgsql security definer set search_path=public as $$declare existing hero_name_registry%rowtype;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if char_length(trim(desired_name))<2 or char_length(trim(desired_name))>20 then raise exception 'Hero name must contain 2 to 20 characters';end if;
 select * into existing from hero_name_registry where normalized_name=lower(trim(desired_name));
 if existing.id is not null and existing.owner_id=auth.uid() and existing.hero_slot='legacy-profile' then delete from hero_name_registry where id=existing.id;existing.id=null;end if;
 if existing.id is not null and not(existing.owner_id=auth.uid() and existing.hero_slot=target_slot) then raise exception 'The name already exists. Please choose another name.';end if;
 insert into hero_name_registry(owner_id,hero_slot,hero_name,updated_at) values(auth.uid(),target_slot,trim(desired_name),now())
 on conflict(owner_id,hero_slot) do update set hero_name=excluded.hero_name,updated_at=now();return true;
exception when unique_violation then raise exception 'The name already exists. Please choose another name.';end$$;
grant execute on function public.reserve_hero_name(text,text) to authenticated;
