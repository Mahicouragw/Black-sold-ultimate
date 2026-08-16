-- Migration v18 / game v7.21.1: server-authoritative five-minute chat retention.
-- Idempotent. Run after schema.sql and features_v10_chat_rooms.sql.
begin;

alter table public.messages add column if not exists expires_at timestamptz;
alter table public.chat_room_messages add column if not exists expires_at timestamptz;

-- Existing rows use their original server creation time, so installation never
-- resurrects old chat for another five minutes.
update public.messages set expires_at=created_at+interval '5 minutes'
 where expires_at is null or expires_at<>created_at+interval '5 minutes';
update public.chat_room_messages set expires_at=created_at+interval '5 minutes'
 where expires_at is null or expires_at<>created_at+interval '5 minutes';

alter table public.messages alter column expires_at set default(now()+interval '5 minutes');
alter table public.messages alter column expires_at set not null;
alter table public.chat_room_messages alter column expires_at set default(now()+interval '5 minutes');
alter table public.chat_room_messages alter column expires_at set not null;

alter table public.messages drop constraint if exists messages_five_minute_expiration;
alter table public.messages add constraint messages_five_minute_expiration
 check(expires_at=created_at+interval '5 minutes') not valid;
alter table public.messages validate constraint messages_five_minute_expiration;
alter table public.chat_room_messages drop constraint if exists chat_room_messages_five_minute_expiration;
alter table public.chat_room_messages add constraint chat_room_messages_five_minute_expiration
 check(expires_at=created_at+interval '5 minutes') not valid;
alter table public.chat_room_messages validate constraint chat_room_messages_five_minute_expiration;

-- Ignore all client clocks and supplied expiration values. On update, reject any
-- attempt to extend, shorten, or rewrite server timestamps.
create or replace function public.enforce_five_minute_chat_expiration()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
   new.created_at=clock_timestamp();
   new.expires_at=new.created_at+interval '5 minutes';
 elsif new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
   raise exception 'Chat creation and expiration timestamps are immutable';
 end if;
 return new;
end;
$$;

drop trigger if exists messages_server_expiration on public.messages;
create trigger messages_server_expiration before insert or update on public.messages
 for each row execute function public.enforce_five_minute_chat_expiration();
drop trigger if exists room_messages_server_expiration on public.chat_room_messages;
create trigger room_messages_server_expiration before insert or update on public.chat_room_messages
 for each row execute function public.enforce_five_minute_chat_expiration();

-- Server-side filtering is the hard availability boundary. It applies to normal
-- selects and to Realtime RLS checks; clients cannot recover expired rows.
drop policy if exists messages_visible on public.messages;
create policy messages_visible on public.messages for select to authenticated using(
 expires_at>now() and (receiver_id is null or sender_id=auth.uid() or receiver_id=auth.uid())
);
drop policy if exists messages_linked_send on public.messages;
drop policy if exists messages_authenticated_send on public.messages;
create policy messages_authenticated_send on public.messages for insert to authenticated with check(
 sender_id=auth.uid()
);

drop policy if exists room_messages_visible on public.chat_room_messages;
create policy room_messages_visible on public.chat_room_messages for select to authenticated using(
 expires_at>now() and exists(
   select 1 from public.chat_room_members m
   where m.room_id=chat_room_messages.room_id and m.user_id=auth.uid()
 )
);
drop policy if exists room_messages_send on public.chat_room_messages;
create policy room_messages_send on public.chat_room_messages for insert to authenticated with check(
 sender_id=auth.uid()
 and exists(select 1 from public.chat_room_members m where m.room_id=chat_room_messages.room_id and m.user_id=auth.uid())
 and not exists(select 1 from public.chat_room_blacklist b where b.room_id=chat_room_messages.room_id and b.blocked_user_id=auth.uid())
);

create index if not exists messages_expiration_idx on public.messages(expires_at);
create index if not exists messages_receiver_expiration_idx on public.messages(receiver_id,expires_at,created_at desc);
create index if not exists room_messages_expiration_idx on public.chat_room_messages(expires_at);
create index if not exists room_messages_room_expiration_idx on public.chat_room_messages(room_id,expires_at,created_at desc);

-- Physical deletion is opportunistic on every chat insert and can also be called
-- by a trusted scheduled job. Availability does not depend on this cleanup:
-- expired rows are already inaccessible under RLS above.
create or replace function public.purge_expired_chat_messages()
returns jsonb language plpgsql security definer set search_path=public as $$
declare direct_count integer;room_count integer;
begin
 delete from public.messages where expires_at<=clock_timestamp();
 get diagnostics direct_count=row_count;
 delete from public.chat_room_messages where expires_at<=clock_timestamp();
 get diagnostics room_count=row_count;
 return jsonb_build_object('direct_deleted',direct_count,'room_deleted',room_count);
end;
$$;
revoke all on function public.purge_expired_chat_messages() from public,anon,authenticated;
grant execute on function public.purge_expired_chat_messages() to service_role;

create or replace function public.purge_expired_chat_after_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.purge_expired_chat_messages();return null;end;
$$;
drop trigger if exists messages_purge_expired_after_insert on public.messages;
create trigger messages_purge_expired_after_insert after insert on public.messages
 for each statement execute function public.purge_expired_chat_after_insert();
drop trigger if exists room_messages_purge_expired_after_insert on public.chat_room_messages;
create trigger room_messages_purge_expired_after_insert after insert on public.chat_room_messages
 for each statement execute function public.purge_expired_chat_after_insert();

-- If pg_cron is already installed, schedule the same trusted purge once per
-- minute. The migration neither installs nor requires the extension.
do $$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   if not exists(select 1 from cron.job where jobname='black-sword-expired-chat') then
     perform cron.schedule('black-sword-expired-chat','* * * * *','select public.purge_expired_chat_messages()');
   end if;
 end if;
exception when undefined_table or insufficient_privilege then null;
end;
$$;

comment on column public.messages.expires_at is 'Immutable server timestamp: exactly five minutes after created_at.';
comment on column public.chat_room_messages.expires_at is 'Immutable server timestamp: exactly five minutes after created_at.';
commit;
