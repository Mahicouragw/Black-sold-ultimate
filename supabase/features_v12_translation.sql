-- v12 source-language metadata for recipient-side realtime translation.
alter table public.messages add column if not exists source_language text not null default 'en' check(char_length(source_language) between 2 and 12);
alter table public.chat_room_messages add column if not exists source_language text not null default 'en' check(char_length(source_language) between 2 and 12);
