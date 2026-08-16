-- Migration v19 / game v7.22.0: feedback inbox roles and authoritative chat moderation.
-- Idempotent. Does not assign or guess a moderator account.
begin;

create table if not exists public.moderator_roles(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 role text not null check(role in ('moderator','developer')),
 active boolean not null default true,
 assigned_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.moderator_roles enable row level security;
revoke all on public.moderator_roles from anon,authenticated;

alter table public.game_feedback add column if not exists category text not null default 'gameplay';
alter table public.game_feedback add column if not exists status text not null default 'new';
alter table public.game_feedback add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.game_feedback add column if not exists resolution_note text;
alter table public.game_feedback add column if not exists expires_at timestamptz;
alter table public.game_feedback add column if not exists updated_at timestamptz not null default now();
update public.game_feedback set category=case when kind='bug' then 'bug' else 'gameplay' end where category='gameplay';
alter table public.game_feedback drop constraint if exists game_feedback_category_check;
alter table public.game_feedback add constraint game_feedback_category_check check(category in ('gameplay','bug','accessibility','moderation','suggestion','praise')) not valid;
alter table public.game_feedback validate constraint game_feedback_category_check;
alter table public.game_feedback drop constraint if exists game_feedback_status_check;
alter table public.game_feedback add constraint game_feedback_status_check check(status in ('new','reviewing','resolved','escalated')) not valid;
alter table public.game_feedback validate constraint game_feedback_status_check;

create or replace function public.is_game_moderator()
returns boolean language sql stable security definer set search_path=public as $role$
 select exists(select 1 from moderator_roles where user_id=auth.uid() and active and role in ('moderator','developer'));
$role$;
revoke all on function public.is_game_moderator() from public,anon;
grant execute on function public.is_game_moderator() to authenticated;

create or replace function public.assign_game_feedback()
returns trigger language plpgsql security definer set search_path=public as $assign$
begin
 if new.assigned_to is null then
  select user_id into new.assigned_to from moderator_roles where active order by case role when 'moderator' then 0 else 1 end,created_at limit 1;
 end if;
 new.updated_at=now();return new;
end;
$assign$;
drop trigger if exists game_feedback_assign on public.game_feedback;
create trigger game_feedback_assign before insert on public.game_feedback for each row execute function public.assign_game_feedback();

create or replace function public.submit_game_feedback(feedback_category text,feedback_message text)
returns uuid language plpgsql security definer set search_path=public as $submit$
declare feedback_uuid uuid;clean_category text:=lower(trim(feedback_category));clean_message text:=trim(feedback_message);
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if clean_category not in ('gameplay','bug','accessibility','moderation','suggestion','praise') then raise exception 'Invalid feedback category';end if;
 if char_length(clean_message)<3 or char_length(clean_message)>1000 then raise exception 'Feedback must contain 3 to 1000 characters';end if;
 if (select count(*) from game_feedback where user_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Feedback rate limit reached. Try again later';end if;
 insert into game_feedback(user_id,kind,category,message,status) values(auth.uid(),case when clean_category='bug' then 'bug' else 'feedback' end,clean_category,clean_message,'new') returning id into feedback_uuid;
 return feedback_uuid;
end;
$submit$;
revoke all on function public.submit_game_feedback(text,text) from public,anon;
grant execute on function public.submit_game_feedback(text,text) to authenticated;

create or replace function public.list_moderator_feedback(row_limit integer default 50)
returns table(feedback_id uuid,sender_id uuid,category text,message text,created_at timestamptz,expires_at timestamptz,status text,assigned_to uuid,resolution_note text)
language plpgsql security definer set search_path=public as $inbox$
begin
 if not is_game_moderator() then raise exception 'Not authorized for moderator inbox';end if;
 return query select f.id,f.user_id,f.category,f.message,f.created_at,f.expires_at,f.status,f.assigned_to,f.resolution_note from game_feedback f order by case f.status when 'new' then 0 when 'reviewing' then 1 when 'escalated' then 2 else 3 end,f.created_at desc limit greatest(1,least(coalesce(row_limit,50),100));
end;
$inbox$;
revoke all on function public.list_moderator_feedback(integer) from public,anon;
grant execute on function public.list_moderator_feedback(integer) to authenticated;

create or replace function public.moderate_game_feedback(feedback_id uuid,new_status text,private_note text default '')
returns boolean language plpgsql security definer set search_path=public as $moderate$
begin
 if not is_game_moderator() then raise exception 'Not authorized for moderator inbox';end if;
 if new_status not in ('new','reviewing','resolved','escalated') then raise exception 'Invalid feedback status';end if;
 update game_feedback set status=new_status,resolution_note=nullif(left(trim(private_note),1000),''),assigned_to=coalesce(assigned_to,auth.uid()),updated_at=now() where id=feedback_id;
 return found;
end;
$moderate$;
revoke all on function public.moderate_game_feedback(uuid,text,text) from public,anon;
grant execute on function public.moderate_game_feedback(uuid,text,text) to authenticated;

drop policy if exists feedback_own_insert on public.game_feedback;
drop policy if exists feedback_own_read on public.game_feedback;
drop policy if exists feedback_owner_safe_read on public.game_feedback;
create policy feedback_owner_safe_read on public.game_feedback for select to authenticated using(user_id=auth.uid());
revoke all on public.game_feedback from anon,authenticated;
grant select(id,user_id,kind,category,message,created_at,expires_at,status,assigned_to,updated_at) on public.game_feedback to authenticated;
create index if not exists game_feedback_status_time_idx on public.game_feedback(status,created_at desc);
create index if not exists game_feedback_assignment_idx on public.game_feedback(assigned_to,status,created_at desc);

create or replace function public.chat_moderation_reason(chat_body text)
returns text language plpgsql immutable set search_path=public as $filter$
declare clean text:=lower(trim(chat_body));
begin
 if clean='' then return 'Empty messages are not allowed';end if;
 if clean ~ '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ru|xyz))' then return 'Links are not allowed in temporary chat';end if;
 if clean ~ '(.)\1{7,}' or clean ~ '\m([a-z]+)(\s+\1){3,}\M' then return 'Repeated spam is not allowed';end if;
 if clean ~ '\m(kill|hurt|attack|find)\s+(you|your family)\M' then return 'Threatening messages are not allowed';end if;
 if clean ~ '\m(fuck|shit|bitch|cunt|nigger|faggot|retard)[a-z]*\M' then return 'Abusive or profane messages are not allowed';end if;
 return null;
end;
$filter$;

create or replace function public.enforce_chat_content_moderation()
returns trigger language plpgsql security definer set search_path=public as $enforce$
declare reason text;
begin
 reason=chat_moderation_reason(new.body);if reason is not null then raise exception 'Message rejected: %',reason;end if;return new;
end;
$enforce$;
drop trigger if exists chat_content_moderation on public.messages;
create trigger chat_content_moderation before insert on public.messages for each row execute function public.enforce_chat_content_moderation();
drop trigger if exists room_chat_content_moderation on public.chat_room_messages;
create trigger room_chat_content_moderation before insert on public.chat_room_messages for each row execute function public.enforce_chat_content_moderation();

comment on table public.moderator_roles is 'Assignments are admin-managed; no account is guessed or hardcoded.';
comment on column public.game_feedback.resolution_note is 'Private moderator/developer note, exposed only by protected inbox RPC.';
commit;
