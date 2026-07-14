-- Voice-profile chat and authenticated guest chat.
-- Run once in Supabase SQL Editor after schema.sql.

alter table public.messages add column if not exists voice_id text not null default 'boy-1';

alter table public.messages drop constraint if exists messages_voice_id_check;
alter table public.messages add constraint messages_voice_id_check
  check (voice_id ~ '^(boy|girl)-([1-9]|10)$');

-- Latest requirement: every authenticated player, including a guest with a
-- permanent Player ID, may send chat. sender_id is still locked to auth.uid().
drop policy if exists messages_linked_send on public.messages;
drop policy if exists messages_authenticated_send on public.messages;
create policy messages_authenticated_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid());

grant select, insert on public.messages to authenticated;
