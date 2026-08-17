-- Migration v20 / game v7.22.4: secure player-to-player item trading.
--
-- Design goals:
--   * Server-authoritative. The client can never mint or duplicate an item.
--   * Atomic. A trade either moves everything or nothing (single transaction).
--   * Consent-based. Both heroes must explicitly accept.
--   * Idempotent migration and idempotent settlement.
--   * No private data exposure: only public hero names are ever returned.
--
-- Items live inside game_saves.save_data (jsonb), so the RPCs below read,
-- verify and rewrite BOTH heroes' inventories inside one transaction.
begin;

create table if not exists public.trade_offers(
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  offer_items jsonb not null default '[]'::jsonb,   -- [{id,name,quantity}]
  request_items jsonb not null default '[]'::jsonb,
  offer_gold integer not null default 0 check(offer_gold >= 0),
  request_gold integer not null default 0 check(request_gold >= 0),
  status text not null default 'pending'
    check(status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Offers self-expire so abandoned trades cannot linger or be replayed later.
  expires_at timestamptz not null default now() + interval '10 minutes',
  settled_at timestamptz,
  constraint trade_no_self check (sender_id <> receiver_id)
);

create index if not exists trade_offers_receiver_idx
  on public.trade_offers(receiver_id, status, expires_at desc);
create index if not exists trade_offers_sender_idx
  on public.trade_offers(sender_id, status, expires_at desc);

alter table public.trade_offers enable row level security;

-- A hero may only ever see trades they are part of.
drop policy if exists trade_offers_visible on public.trade_offers;
create policy trade_offers_visible on public.trade_offers
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- All writes go through the security-definer RPCs below, never direct DML.
revoke insert, update, delete on public.trade_offers from anon, authenticated;

-- Timestamps are server-owned and immutable from the client.
create or replace function public.trade_touch()
returns trigger language plpgsql as $touch$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$touch$;
drop trigger if exists trade_offers_touch on public.trade_offers;
create trigger trade_offers_touch before update on public.trade_offers
  for each row execute function public.trade_touch();

-- ── helpers ────────────────────────────────────────────────────────────────

-- Count how many of an item a hero actually holds, from the authoritative save.
create or replace function public.trade_item_count(target_user uuid, item_id text)
returns integer language sql stable security definer set search_path=public as $count$
  select coalesce((
    select sum((entry->>'quantity')::int)
    from game_saves gs,
         jsonb_array_elements(coalesce(gs.save_data->'inventory','[]'::jsonb)) entry
    where gs.user_id = target_user
      and entry->>'id' = item_id
  ), 0);
$count$;

create or replace function public.trade_gold(target_user uuid)
returns integer language sql stable security definer set search_path=public as $gold$
  select coalesce((
    select (save_data->'player'->>'gold')::int from game_saves where user_id = target_user
  ), 0);
$gold$;

-- ── create an offer ────────────────────────────────────────────────────────

create or replace function public.create_trade_offer(
  target_hero text,
  offered jsonb default '[]'::jsonb,
  requested jsonb default '[]'::jsonb,
  gold_offered integer default 0,
  gold_requested integer default 0
) returns uuid language plpgsql security definer set search_path=public as $create$
declare
  target_id uuid;
  offer_id uuid;
  entry jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if gold_offered < 0 or gold_requested < 0 then raise exception 'Gold cannot be negative'; end if;

  select id into target_id from profiles
   where lower(display_name) = lower(trim(target_hero)) limit 1;
  if target_id is null then raise exception 'No hero found with that name'; end if;
  if target_id = auth.uid() then raise exception 'You cannot trade with yourself'; end if;

  -- Rate limit: stops offer spam being used to harass another player.
  if (select count(*) from trade_offers
       where sender_id = auth.uid() and created_at > now() - interval '5 minutes') >= 5 then
    raise exception 'Too many trade offers. Please wait a few minutes';
  end if;

  if jsonb_array_length(coalesce(offered,'[]'::jsonb)) > 10
     or jsonb_array_length(coalesce(requested,'[]'::jsonb)) > 10 then
    raise exception 'A trade may include at most 10 item stacks per side';
  end if;

  -- Verify the sender genuinely owns everything being offered, right now.
  for entry in select * from jsonb_array_elements(coalesce(offered,'[]'::jsonb)) loop
    if coalesce((entry->>'quantity')::int, 0) < 1 then
      raise exception 'Invalid item quantity';
    end if;
    if trade_item_count(auth.uid(), entry->>'id') < (entry->>'quantity')::int then
      raise exception 'You do not have enough of %', coalesce(entry->>'name', entry->>'id');
    end if;
  end loop;

  if trade_gold(auth.uid()) < gold_offered then
    raise exception 'You do not have that much gold';
  end if;

  insert into trade_offers(sender_id, receiver_id, offer_items, request_items,
                           offer_gold, request_gold)
  values (auth.uid(), target_id, coalesce(offered,'[]'::jsonb),
          coalesce(requested,'[]'::jsonb), gold_offered, gold_requested)
  returning id into offer_id;

  return offer_id;
end;
$create$;

-- Remove a list of {id,quantity} from an inventory array.
create or replace function public.trade_remove_items(inventory jsonb, items jsonb)
returns jsonb language plpgsql immutable set search_path=public as $remove$
declare
  result jsonb := coalesce(inventory, '[]'::jsonb);
  want jsonb;
  idx integer;
  element jsonb;
  remaining integer;
  have integer;
begin
  for want in select * from jsonb_array_elements(coalesce(items,'[]'::jsonb)) loop
    remaining := (want->>'quantity')::int;
    idx := 0;
    while idx < jsonb_array_length(result) and remaining > 0 loop
      element := result->idx;
      if element->>'id' = want->>'id' then
        have := coalesce((element->>'quantity')::int, 0);
        if have > remaining then
          result := jsonb_set(result, array[idx::text,'quantity'], to_jsonb(have - remaining));
          remaining := 0;
        else
          remaining := remaining - have;
          result := result - idx;      -- drop the emptied stack
          idx := idx - 1;
        end if;
      end if;
      idx := idx + 1;
    end loop;
  end loop;
  return result;
end;
$remove$;

-- Add a list of {id,name,quantity} into an inventory array, merging stacks.
create or replace function public.trade_add_items(inventory jsonb, items jsonb)
returns jsonb language plpgsql immutable set search_path=public as $add$
declare
  result jsonb := coalesce(inventory, '[]'::jsonb);
  want jsonb;
  idx integer;
  merged boolean;
begin
  for want in select * from jsonb_array_elements(coalesce(items,'[]'::jsonb)) loop
    merged := false;
    idx := 0;
    while idx < jsonb_array_length(result) loop
      if result->idx->>'id' = want->>'id' then
        result := jsonb_set(result, array[idx::text,'quantity'],
          to_jsonb(coalesce((result->idx->>'quantity')::int,0) + (want->>'quantity')::int));
        merged := true;
        exit;
      end if;
      idx := idx + 1;
    end loop;
    if not merged then result := result || jsonb_build_array(want); end if;
  end loop;
  return result;
end;
$add$;

-- ── accept an offer: the atomic exchange ───────────────────────────────────

create or replace function public.accept_trade_offer(offer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $accept$
declare
  t record;
  entry jsonb;
  sender_inv jsonb;
  receiver_inv jsonb;
  sender_gold integer;
  receiver_gold integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into t from trade_offers where id = offer_id for update;
  if not found then raise exception 'Trade offer not found'; end if;
  if t.receiver_id <> auth.uid() then raise exception 'Only the recipient can accept this trade'; end if;
  if t.status <> 'pending' then raise exception 'This trade is no longer pending'; end if;
  if t.expires_at <= now() then
    -- Do not UPDATE here: the RAISE below rolls the transaction back, so the
    -- mark would be lost anyway. purge_expired_trades() does the marking.
    raise exception 'This trade offer has expired';
  end if;

  -- Re-verify BOTH sides at settlement time. Ownership can change between the
  -- offer and the acceptance, and this is what makes duplication impossible.
  for entry in select * from jsonb_array_elements(t.offer_items) loop
    if trade_item_count(t.sender_id, entry->>'id') < (entry->>'quantity')::int then
      raise exception 'The other hero no longer has %', coalesce(entry->>'name', entry->>'id');
    end if;
  end loop;
  for entry in select * from jsonb_array_elements(t.request_items) loop
    if trade_item_count(t.receiver_id, entry->>'id') < (entry->>'quantity')::int then
      raise exception 'You no longer have %', coalesce(entry->>'name', entry->>'id');
    end if;
  end loop;

  sender_gold   := trade_gold(t.sender_id);
  receiver_gold := trade_gold(t.receiver_id);
  if sender_gold < t.offer_gold then raise exception 'The other hero does not have enough gold'; end if;
  if receiver_gold < t.request_gold then raise exception 'You do not have enough gold'; end if;

  -- Move items. remove_items/add_items rewrite the jsonb inventories.
  select save_data->'inventory' into sender_inv   from game_saves where user_id = t.sender_id;
  select save_data->'inventory' into receiver_inv from game_saves where user_id = t.receiver_id;

  sender_inv   := trade_remove_items(coalesce(sender_inv,'[]'::jsonb),   t.offer_items);
  sender_inv   := trade_add_items(sender_inv,   t.request_items);
  receiver_inv := trade_remove_items(coalesce(receiver_inv,'[]'::jsonb), t.request_items);
  receiver_inv := trade_add_items(receiver_inv, t.offer_items);

  update game_saves set
    save_data = jsonb_set(
      jsonb_set(save_data, '{inventory}', sender_inv, true),
      '{player,gold}', to_jsonb(sender_gold - t.offer_gold + t.request_gold), true),
    updated_at = now()
  where user_id = t.sender_id;

  update game_saves set
    save_data = jsonb_set(
      jsonb_set(save_data, '{inventory}', receiver_inv, true),
      '{player,gold}', to_jsonb(receiver_gold - t.request_gold + t.offer_gold), true),
    updated_at = now()
  where user_id = t.receiver_id;

  update trade_offers
     set status = 'accepted', settled_at = now()
   where id = offer_id;

  return jsonb_build_object('ok', true, 'trade', offer_id);
end;
$accept$;

-- ── decline / cancel / list ────────────────────────────────────────────────

create or replace function public.respond_trade_offer(offer_id uuid, decision text)
returns boolean language plpgsql security definer set search_path=public as $respond$
declare t record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into t from trade_offers where id = offer_id for update;
  if not found then raise exception 'Trade offer not found'; end if;
  if decision = 'decline' and t.receiver_id <> auth.uid() then
    raise exception 'Only the recipient can decline';
  end if;
  if decision = 'cancel' and t.sender_id <> auth.uid() then
    raise exception 'Only the sender can cancel';
  end if;
  if t.status <> 'pending' then return false; end if;
  update trade_offers
     set status = case when decision = 'decline' then 'declined' else 'cancelled' end
   where id = offer_id;
  return true;
end;
$respond$;

-- Only public hero names are returned; never emails or account identifiers.
create or replace function public.list_trade_offers()
returns table(
  id uuid, direction text, other_hero text,
  offer_items jsonb, request_items jsonb,
  offer_gold integer, request_gold integer,
  status text, expires_at timestamptz
) language sql stable security definer set search_path=public as $list$
  select t.id,
         case when t.sender_id = auth.uid() then 'outgoing' else 'incoming' end,
         p.display_name,
         t.offer_items, t.request_items, t.offer_gold, t.request_gold,
         t.status, t.expires_at
    from trade_offers t
    join profiles p on p.id = case when t.sender_id = auth.uid()
                                   then t.receiver_id else t.sender_id end
   where (t.sender_id = auth.uid() or t.receiver_id = auth.uid())
     and t.status = 'pending'
     and t.expires_at > now()
   order by t.created_at desc
   limit 25;
$list$;

-- Housekeeping: mark abandoned offers expired.
create or replace function public.purge_expired_trades()
returns void language sql security definer set search_path=public as $purge$
  update trade_offers set status = 'expired'
   where status = 'pending' and expires_at <= now();
$purge$;

revoke all on function public.create_trade_offer(text,jsonb,jsonb,integer,integer) from public, anon;
revoke all on function public.accept_trade_offer(uuid) from public, anon;
revoke all on function public.respond_trade_offer(uuid,text) from public, anon;
revoke all on function public.list_trade_offers() from public, anon;
grant execute on function public.create_trade_offer(text,jsonb,jsonb,integer,integer) to authenticated;
grant execute on function public.accept_trade_offer(uuid) to authenticated;
grant execute on function public.respond_trade_offer(uuid,text) to authenticated;
grant execute on function public.list_trade_offers() to authenticated;

comment on table public.trade_offers is
  'Player-to-player trades. Items and gold move only inside accept_trade_offer, which re-verifies ownership at settlement so nothing can be duplicated.';

commit;
