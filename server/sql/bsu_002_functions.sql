-- Black Soul Ultimate — server rules (functions part). Safe to run more than once.
-- Every function runs as one database transaction. Expected refusals raise
-- 'bsu:<code>' and bsu_api() turns them into {"ok":false,"error":"<code>"}
-- after rolling the whole action back.

create or replace function public.bsu_cfg(k text) returns jsonb
language sql stable set search_path = public as $$
  select value from public.bsu_config where key = k
$$;

create or replace function public.bsu_ms(t timestamptz) returns bigint
language sql immutable as $$ select floor(extract(epoch from t) * 1000)::bigint $$;

create or replace function public.bsu_int(a jsonb, k text, fallback int) returns int
language plpgsql immutable as $$
begin
  if a ? k and jsonb_typeof(a->k) = 'number' then return floor((a->>k)::numeric)::int; end if;
  return fallback;
end $$;

-- ---------------------------------------------------------------- players, heroes
create or replace function public.bsu_touch(p_uid text, a jsonb) returns void
language plpgsql set search_path = public as $$
declare nm text := left(coalesce(nullif(btrim(a->>'name'), ''), 'Hero'), 40);
begin
  insert into bsu_players(uid, display_name) values (p_uid, nm)
  on conflict (uid) do update set last_seen_at = now(),
    display_name = case when a ? 'name' then excluded.display_name else bsu_players.display_name end;
end $$;

create or replace function public.bsu_hero(p_uid text, a jsonb) returns public.bsu_heroes
language plpgsql set search_path = public as $$
declare h bsu_heroes; hid text := left(coalesce(a->>'hero_id', ''), 80);
  nm text := left(coalesce(nullif(btrim(a->>'name'), ''), 'Hero'), 40); sat numeric := 100;
begin
  if hid = '' then raise exception 'bsu:hero_required'; end if;
  perform bsu_touch(p_uid, a);
  select * into h from bsu_heroes where uid = p_uid and hero_id = hid for update;
  if not found then
    if (select count(*) from bsu_heroes where uid = p_uid) >= 40 then raise exception 'bsu:too_many_heroes'; end if;
    if jsonb_typeof(a->'init'->'satiety') = 'number' then
      sat := least(100, greatest(0, (a->'init'->>'satiety')::numeric));
    end if;
    insert into bsu_heroes(uid, hero_id, name, satiety) values (p_uid, hid, nm, sat)
    on conflict (uid, hero_id) do nothing;
    select * into h from bsu_heroes where uid = p_uid and hero_id = hid for update;
  elsif a ? 'name' and h.name is distinct from nm then
    update bsu_heroes set name = nm where uid = p_uid and hero_id = hid;
    h.name := nm;
  end if;
  return h;
end $$;

create or replace function public.bsu_satiety(h public.bsu_heroes) returns numeric
language plpgsql stable set search_path = public as $$
declare hours numeric := greatest(0.05, (bsu_cfg('hunger_hours') #>> '{}')::numeric);
  threshold numeric := (bsu_cfg('hunger_threshold') #>> '{}')::numeric;
begin
  return round(greatest(0, h.satiety - ((100 - threshold) / hours)
    * extract(epoch from (now() - h.satiety_at)) / 3600.0)::numeric, 2);
end $$;

create or replace function public.bsu_hero_view(p_uid text, hid text) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; perm text; d bsu_blessings; daily jsonb := null; hrs numeric; prayers jsonb;
begin
  select * into h from bsu_heroes where uid = p_uid and hero_id = hid;
  if not found then raise exception 'bsu:hero_required'; end if;
  hrs := (bsu_cfg('daily_blessing_hours') #>> '{}')::numeric;
  prayers := bsu_cfg('prayers');
  select blessing into perm from bsu_blessings where uid = p_uid and hero_id = hid and kind = 'permanent';
  select * into d from bsu_blessings where uid = p_uid and hero_id = hid and kind = 'daily' order by granted_at desc limit 1;
  if found then
    daily := jsonb_build_object('prayer', d.prayer, 'blessing', d.blessing,
      'growth', prayers->d.prayer->>'growth', 'battle', prayers->d.prayer->>'battle',
      'granted_at', bsu_ms(d.granted_at), 'next_at', bsu_ms(d.granted_at + make_interval(secs => hrs * 3600)),
      'active', now() < d.granted_at + make_interval(secs => hrs * 3600));
  end if;
  return jsonb_build_object(
    'server_now', bsu_ms(now()),
    'hero_id', hid,
    'hunger', jsonb_build_object('satiety', bsu_satiety(h), 'last_meal_at', case when h.last_meal_at is null then null else bsu_ms(h.last_meal_at) end),
    'config', jsonb_build_object('hunger_hours', bsu_cfg('hunger_hours'), 'hunger_threshold', bsu_cfg('hunger_threshold'),
      'meal_threshold', bsu_cfg('meal_threshold'), 'hp_per_minute', bsu_cfg('hp_per_minute'), 'mp_per_minute', bsu_cfg('mp_per_minute'),
      'daily_blessing_hours', bsu_cfg('daily_blessing_hours')),
    'blessings', jsonb_build_object('first_prayer', h.first_prayer_at is not null, 'permanent', perm, 'daily', daily),
    'quests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', q.quest_id, 'status', q.status, 'progress', q.progress,
        'target', c.target, 'companion', c.companion) order by q.accepted_at)
      from bsu_quests q join bsu_quest_catalog c using (quest_id) where q.uid = p_uid and q.hero_id = hid), '[]'::jsonb),
    'rewards_pending', (select count(*) from bsu_rewards where uid = p_uid and claimed_at is null),
    'invites', (select count(*) from bsu_match_players mp join bsu_matches m on m.id = mp.match_id
      where mp.uid = p_uid and mp.status = 'invited' and m.status = 'waiting'),
    'match', (select jsonb_build_object('id', m.id, 'game', m.game, 'status', m.status, 'mode', m.mode)
      from bsu_match_players mp join bsu_matches m on m.id = mp.match_id
      where mp.uid = p_uid and mp.status = 'joined' and m.status in ('waiting', 'active') order by m.created_at desc limit 1)
  );
end $$;

-- Heartbeat: presence, hunger, and the only way natural HP/MP recovery is
-- handed out. Minutes are claimed atomically, so a refresh or a second device
-- can never claim the same minute twice.
create or replace function public.bsu_tick(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; mins int := 0; mode text := coalesce(a->>'regen', 'claim');
begin
  h := bsu_hero(p_uid, a);
  if mode = 'skip' then
    update bsu_heroes set regen_at = now() where uid = p_uid and hero_id = h.hero_id;
  elsif mode = 'claim' then
    mins := greatest(0, floor(extract(epoch from (now() - h.regen_at)) / 60)::int);
    if mins > 0 then
      update bsu_heroes set regen_at = regen_at + make_interval(mins => mins) where uid = p_uid and hero_id = h.hero_id;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'regen_minutes', mins) || bsu_hero_view(p_uid, h.hero_id);
end $$;

create or replace function public.bsu_eat(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; cur numeric; gain numeric; meal numeric; nxt numeric;
begin
  h := bsu_hero(p_uid, a);
  if jsonb_typeof(a->'satiety') <> 'number' then raise exception 'bsu:bad_food'; end if;
  gain := least(100, greatest(1, (a->>'satiety')::numeric));
  meal := (bsu_cfg('meal_threshold') #>> '{}')::numeric;
  cur := bsu_satiety(h);
  if cur >= 99.5 then
    return jsonb_build_object('ok', true, 'eaten', false, 'reason', 'full') || bsu_hero_view(p_uid, h.hero_id);
  end if;
  nxt := case when gain >= meal then 100 else least(100, cur + gain) end;
  update bsu_heroes set satiety = nxt, satiety_at = now(), last_meal_at = now() where uid = p_uid and hero_id = h.hero_id;
  return jsonb_build_object('ok', true, 'eaten', true, 'meal', gain >= meal, 'before', cur) || bsu_hero_view(p_uid, h.hero_id);
end $$;

-- ---------------------------------------------------------------- prayer, blessings
create or replace function public.bsu_pray(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; prayer text := a->>'prayer'; prayers jsonb := bsu_cfg('prayers'); last timestamptz;
  hrs numeric := (bsu_cfg('daily_blessing_hours') #>> '{}')::numeric; granted boolean := false; first boolean := false;
begin
  if prayer is null or not (prayers ? prayer) then raise exception 'bsu:unknown_prayer'; end if;
  h := bsu_hero(p_uid, a);
  if h.first_prayer_at is null then
    first := true;
    update bsu_heroes set first_prayer_at = now() where uid = p_uid and hero_id = h.hero_id;
  end if;
  select max(granted_at) into last from bsu_blessings where uid = p_uid and hero_id = h.hero_id and kind = 'daily';
  if last is null or now() >= last + make_interval(secs => hrs * 3600) then
    insert into bsu_blessings(uid, hero_id, kind, blessing, prayer)
    values (p_uid, h.hero_id, 'daily', prayers->prayer->>'battle', prayer);
    granted := true;
  end if;
  return jsonb_build_object('ok', true, 'prayer', prayer, 'first_prayer', first, 'daily_granted', granted)
    || bsu_hero_view(p_uid, h.hero_id);
end $$;

create or replace function public.bsu_permanent(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; choice text := a->>'choice'; legacy boolean := coalesce((a->>'legacy')::boolean, false);
  existing text; n int;
begin
  if choice is null or not (bsu_cfg('permanent_choices') ? choice) then raise exception 'bsu:unknown_choice'; end if;
  h := bsu_hero(p_uid, a);
  select blessing into existing from bsu_blessings where uid = p_uid and hero_id = h.hero_id and kind = 'permanent';
  if existing is not null then
    return jsonb_build_object('ok', true, 'granted', false, 'blessing', existing) || bsu_hero_view(p_uid, h.hero_id);
  end if;
  if not legacy and h.first_prayer_at is null then raise exception 'bsu:pray_first'; end if;
  if legacy and h.first_prayer_at is null then
    update bsu_heroes set first_prayer_at = now() where uid = p_uid and hero_id = h.hero_id;
  end if;
  insert into bsu_blessings(uid, hero_id, kind, blessing, prayer)
  values (p_uid, h.hero_id, 'permanent', choice, case when legacy then 'legacy_import' else null end)
  on conflict do nothing;
  get diagnostics n = row_count;
  -- A legacy import only records what the hero already has; it grants nothing.
  return jsonb_build_object('ok', true, 'granted', n = 1 and not legacy, 'legacy', legacy, 'blessing', choice)
    || bsu_hero_view(p_uid, h.hero_id);
end $$;

-- ---------------------------------------------------------------- palace quests
create or replace function public.bsu_quests_list(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes;
begin
  h := bsu_hero(p_uid, a);
  return jsonb_build_object('ok', true, 'catalog', (select jsonb_agg(jsonb_build_object(
      'quest_id', c.quest_id, 'name', c.name, 'description', c.description, 'objective_type', c.objective_type,
      'objective_target', c.objective_target, 'target', c.target, 'reward_xp', c.reward_xp, 'reward_gold', c.reward_gold,
      'companion', c.companion, 'status', q.status, 'progress', coalesce(q.progress, 0)) order by c.sort)
    from bsu_quest_catalog c left join bsu_quests q on q.quest_id = c.quest_id and q.uid = p_uid and q.hero_id = h.hero_id));
end $$;

create or replace function public.bsu_quest_accept(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; c bsu_quest_catalog; q bsu_quests; act bsu_quests; legacy text := a->>'legacy'; prog int;
begin
  h := bsu_hero(p_uid, a);
  select * into c from bsu_quest_catalog where quest_id = a->>'quest_id';
  if not found then raise exception 'bsu:unknown_quest'; end if;
  select * into q from bsu_quests where uid = p_uid and hero_id = h.hero_id and quest_id = c.quest_id;
  if found then
    return jsonb_build_object('ok', true, 'accepted', false, 'already', q.status, 'quest_id', c.quest_id,
      'progress', q.progress, 'target', c.target, 'companion', c.companion);
  end if;
  if legacy = 'completed' then
    -- A quest finished before the server existed: record it, pay nothing.
    insert into bsu_quests(uid, hero_id, quest_id, companion_id, status, progress, completed_at)
    values (p_uid, h.hero_id, c.quest_id, c.companion->>'id', 'completed', c.target, now());
    return jsonb_build_object('ok', true, 'accepted', false, 'already', 'completed', 'legacy', true, 'quest_id', c.quest_id,
      'progress', c.target, 'target', c.target, 'companion', c.companion);
  end if;
  select * into act from bsu_quests where uid = p_uid and hero_id = h.hero_id and status = 'accepted' limit 1;
  if found then
    return jsonb_build_object('ok', true, 'accepted', false, 'busy', act.quest_id, 'quest_id', c.quest_id);
  end if;
  prog := case when legacy = 'accepted' then least(c.target - 1, greatest(0, bsu_int(a, 'progress', 0))) else 0 end;
  insert into bsu_quests(uid, hero_id, quest_id, companion_id, progress)
  values (p_uid, h.hero_id, c.quest_id, c.companion->>'id', prog);
  return jsonb_build_object('ok', true, 'accepted', true, 'quest_id', c.quest_id, 'name', c.name, 'progress', prog,
    'target', c.target, 'reward_xp', c.reward_xp, 'reward_gold', c.reward_gold, 'companion', c.companion);
end $$;

create or replace function public.bsu_quest_progress(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; c bsu_quest_catalog; q bsu_quests; p int;
begin
  h := bsu_hero(p_uid, a);
  select * into c from bsu_quest_catalog where quest_id = a->>'quest_id';
  if not found then raise exception 'bsu:unknown_quest'; end if;
  select * into q from bsu_quests where uid = p_uid and hero_id = h.hero_id and quest_id = c.quest_id for update;
  if not found then raise exception 'bsu:quest_not_accepted'; end if;
  if q.status = 'completed' then
    return jsonb_build_object('ok', true, 'status', 'completed', 'progress', q.progress, 'target', c.target);
  end if;
  -- Progress only ever moves forward, one battle at a time, and never past the goal.
  p := least(c.target, greatest(q.progress, least(q.progress + 1, bsu_int(a, 'progress', q.progress))));
  update bsu_quests set progress = p where uid = p_uid and hero_id = h.hero_id and quest_id = c.quest_id;
  return jsonb_build_object('ok', true, 'status', 'accepted', 'progress', p, 'target', c.target);
end $$;

create or replace function public.bsu_quest_complete(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare h bsu_heroes; c bsu_quest_catalog; q bsu_quests; n int;
begin
  h := bsu_hero(p_uid, a);
  select * into c from bsu_quest_catalog where quest_id = a->>'quest_id';
  if not found then raise exception 'bsu:unknown_quest'; end if;
  select * into q from bsu_quests where uid = p_uid and hero_id = h.hero_id and quest_id = c.quest_id for update;
  if not found then raise exception 'bsu:quest_not_accepted'; end if;
  if q.status = 'completed' then
    return jsonb_build_object('ok', true, 'completed', false, 'already', true, 'quest_id', c.quest_id);
  end if;
  if q.progress < c.target then raise exception 'bsu:quest_not_finished'; end if;
  update bsu_quests set status = 'completed', completed_at = now()
  where uid = p_uid and hero_id = h.hero_id and quest_id = c.quest_id;
  insert into bsu_rewards(uid, source, source_id, gold, xp, detail, claimed_at, claimed_hero)
  values (p_uid, 'quest', h.hero_id || ':' || c.quest_id, c.reward_gold, c.reward_xp,
    jsonb_build_object('quest_id', c.quest_id), now(), h.hero_id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'completed', true, 'quest_id', c.quest_id, 'companion', c.companion,
    'reward', jsonb_build_object('gold', case when n = 1 then c.reward_gold else 0 end, 'xp', case when n = 1 then c.reward_xp else 0 end));
end $$;

-- ---------------------------------------------------------------- cloud save, rewards
create or replace function public.bsu_save_put(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v bigint;
begin
  if jsonb_typeof(a->'save') <> 'object' then raise exception 'bsu:bad_save'; end if;
  if octet_length((a->'save')::text) > 1500000 then raise exception 'bsu:save_too_large'; end if;
  perform bsu_touch(p_uid, '{}'::jsonb);
  insert into bsu_saves(uid, save) values (p_uid, a->'save')
  on conflict (uid) do update set save = excluded.save, version = bsu_saves.version + 1, updated_at = now()
  returning version into v;
  return jsonb_build_object('ok', true, 'version', v, 'server_now', bsu_ms(now()));
end $$;

create or replace function public.bsu_save_get(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare s bsu_saves;
begin
  select * into s from bsu_saves where uid = p_uid;
  if not found then return jsonb_build_object('ok', true, 'save', null); end if;
  return jsonb_build_object('ok', true, 'save', s.save, 'version', s.version, 'updated_at', s.updated_at);
end $$;

create or replace function public.bsu_rewards_claim(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare hid text := left(coalesce(a->>'hero_id', ''), 80); res jsonb;
begin
  if hid = '' then raise exception 'bsu:hero_required'; end if;
  with claimed as (
    update bsu_rewards set claimed_at = now(), claimed_hero = hid
    where uid = p_uid and claimed_at is null
    returning id, source, source_id, rank, gold, xp, detail
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.id), '[]'::jsonb) into res from claimed;
  return jsonb_build_object('ok', true, 'rewards', res);
end $$;

-- ---------------------------------------------------------------- matches: shared
create or replace function public.bsu_event(mid uuid, etype text, edata jsonb) returns void
language plpgsql set search_path = public as $$
declare s int;
begin
  update bsu_matches set seq = seq + 1, updated_at = now() where id = mid returning seq into s;
  insert into bsu_match_events(match_id, seq, type, data) values (mid, s, etype, coalesce(edata, '{}'::jsonb));
end $$;

create or replace function public.bsu_free_color(mid uuid, wanted text) returns text
language plpgsql set search_path = public as $$
declare colors jsonb := bsu_cfg('colors'); c text;
begin
  if wanted is not null and colors ? wanted
     and not exists (select 1 from bsu_match_players where match_id = mid and color = wanted) then
    return wanted;
  end if;
  for c in select jsonb_array_elements_text(colors) loop
    if not exists (select 1 from bsu_match_players where match_id = mid and color = c) then return c; end if;
  end loop;
  return 'Red';
end $$;

create or replace function public.bsu_current_match(p_uid text) returns uuid
language sql stable set search_path = public as $$
  select m.id from bsu_match_players mp join bsu_matches m on m.id = mp.match_id
  where mp.uid = p_uid and mp.status = 'joined' and m.status in ('waiting', 'active')
  order by m.created_at desc limit 1
$$;

create or replace function public.bsu_match_view(p_uid text, mid uuid, since int) returns jsonb
language plpgsql set search_path = public as $$
declare m bsu_matches; my int; away_s int := (bsu_cfg('away_seconds') #>> '{}')::int;
begin
  select * into m from bsu_matches where id = mid;
  if not found then raise exception 'bsu:no_match'; end if;
  select seat into my from bsu_match_players where match_id = mid and uid = p_uid;
  if my is null then raise exception 'bsu:not_in_match'; end if;
  return jsonb_build_object('ok', true, 'server_now', bsu_ms(now()), 'my_seat', my,
    'match', jsonb_build_object('id', m.id, 'game', m.game, 'mode', m.mode, 'status', m.status, 'seats', m.seats,
      'turn_seat', m.turn_seat, 'version', m.version, 'seq', m.seq, 'state', m.state, 'result', m.result,
      'host', m.host_uid = p_uid),
    'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'name', p.name, 'color', p.color, 'is_ai', p.is_ai,
        'status', p.status, 'rank', p.rank, 'me', p.uid = p_uid, 'away', p.away) order by p.seat)
      from bsu_match_players p where p.match_id = mid),
    'events', coalesce((select jsonb_agg(jsonb_build_object('seq', e.seq, 'type', e.type, 'data', e.data) order by e.seq)
      from bsu_match_events e where e.match_id = mid and e.seq > coalesce(since, 0)), '[]'::jsonb));
end $$;

-- Close a match: rankings and rewards are decided here and nowhere else.
create or replace function public.bsu_match_finish(mid uuid) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; p bsu_match_players; cfg jsonb; r jsonb; g int; x int; capped boolean; outcome text;
  factor numeric := (bsu_cfg('ai_reward_factor') #>> '{}')::numeric; cap int := (bsu_cfg('ai_reward_daily_cap') #>> '{}')::int;
  rewards jsonb := '{}'::jsonb;
begin
  select * into m from bsu_matches where id = mid for update;
  if m.status = 'finished' then return; end if;
  outcome := coalesce(m.result->>'outcome', 'ranked');
  for p in select * from bsu_match_players where match_id = mid and not is_ai and uid is not null and status in ('joined', 'left') loop
    g := 0; x := 0; capped := false; r := null;
    if p.status = 'joined' and p.rank is not null then
      if m.game = 'snakes' then
        r := bsu_cfg('snakes_rewards') -> m.seats::text -> (p.rank - 1);
      else
        cfg := bsu_cfg('chess_rewards');
        r := case when outcome = 'draw' then cfg->'draw' when p.rank = 1 then cfg->'win' else cfg->'loss' end;
      end if;
      g := coalesce((r->>'gold')::int, 0); x := coalesce((r->>'xp')::int, 0);
      if m.mode = 'ai' then
        g := floor(g * factor)::int; x := floor(x * factor)::int;
        if (select count(*) from bsu_rewards where uid = p.uid and source = 'match' and detail->>'mode' = 'ai'
              and (gold > 0 or xp > 0) and created_at > now() - interval '24 hours') >= cap then
          g := 0; x := 0; capped := true;
        end if;
      end if;
    end if;
    insert into bsu_rewards(uid, source, source_id, rank, gold, xp, detail)
    values (p.uid, 'match', mid::text, p.rank, g, x,
      jsonb_build_object('game', m.game, 'mode', m.mode, 'seats', m.seats, 'capped', capped, 'outcome', outcome))
    on conflict do nothing;
    rewards := rewards || jsonb_build_object(p.seat::text, jsonb_build_object('gold', g, 'xp', x, 'capped', capped));
  end loop;
  update bsu_matches set status = 'finished', finished_at = now(), updated_at = now(),
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object('outcome', outcome, 'rankings',
      (select jsonb_agg(jsonb_build_object('seat', q.seat, 'name', q.name, 'color', q.color, 'rank', q.rank, 'is_ai', q.is_ai,
          'left', q.status = 'left', 'gold', coalesce((rewards->q.seat::text->>'gold')::int, 0),
          'xp', coalesce((rewards->q.seat::text->>'xp')::int, 0),
          'capped', coalesce((rewards->q.seat::text->>'capped')::boolean, false)) order by q.rank nulls last, q.seat)
        from bsu_match_players q where q.match_id = mid and q.status in ('joined', 'left')))
  where id = mid;
  perform bsu_event(mid, 'finished', (select result from bsu_matches where id = mid));
end $$;

create or replace function public.bsu_match_start(mid uuid) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; st jsonb; first_seat int := 0;
begin
  select * into m from bsu_matches where id = mid for update;
  if m.status <> 'waiting' then return; end if;
  if m.game = 'snakes' then
    st := jsonb_build_object('pos', (select jsonb_agg(0) from generate_series(1, m.seats)), 'next_rank', 1, 'last_rank', m.seats);
  else
    first_seat := coalesce((m.state->>'white_seat')::int, 0);
    st := m.state || jsonb_build_object('fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'history', '[]'::jsonb, 'white_seat', first_seat, 'draw_offer_seat', null);
    update bsu_match_players set color = case when seat = first_seat then 'White' else 'Black' end where match_id = mid;
  end if;
  update bsu_matches set status = 'active', started_at = now(), updated_at = now(), state = st, turn_seat = first_seat,
    version = version + 1 where id = mid;
  update bsu_match_players set last_seen_at = now(), away = false where match_id = mid;
  perform bsu_event(mid, 'start', jsonb_build_object('turn_seat', first_seat));
end $$;

-- ---------------------------------------------------------------- matches: snakes and ladders
create or replace function public.bsu_snakes_check_end(mid uuid) returns boolean
language plpgsql set search_path = public as $$
declare m bsu_matches; remaining int; humans int; r record; st jsonb; nr int;
begin
  select * into m from bsu_matches where id = mid for update;
  if m.status <> 'active' then return true; end if;
  select count(*), count(*) filter (where not is_ai) into remaining, humans
  from bsu_match_players where match_id = mid and status = 'joined' and rank is null;
  if remaining > 1 and humans > 0 then return false; end if;
  st := m.state;
  for r in select seat from bsu_match_players where match_id = mid and status = 'joined' and rank is null
           order by (m.state->'pos'->>seat)::int desc, seat loop
    nr := (st->>'next_rank')::int;
    update bsu_match_players set rank = nr where match_id = mid and seat = r.seat;
    st := jsonb_set(st, '{next_rank}', to_jsonb(nr + 1));
  end loop;
  update bsu_matches set state = st, result = jsonb_build_object('outcome', 'ranked') where id = mid;
  perform bsu_match_finish(mid);
  return true;
end $$;

create or replace function public.bsu_snakes_next_turn(mid uuid) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; s int; i int;
begin
  select * into m from bsu_matches where id = mid for update;
  s := m.turn_seat;
  for i in 1..m.seats loop
    s := (s + 1) % m.seats;
    exit when exists (select 1 from bsu_match_players where match_id = mid and seat = s and status = 'joined' and rank is null);
  end loop;
  update bsu_matches set turn_seat = s, version = version + 1 where id = mid;
  perform bsu_event(mid, 'turn', jsonb_build_object('seat', s));
end $$;

-- One dice roll for the seat whose turn it is. p_die is only for tests.
create or replace function public.bsu_snakes_step(mid uuid, p_die int default null) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; board jsonb := bsu_cfg('snakes_board'); die int; cur int; pos int; landed int; final int;
  via text := null; st jsonb; nr int;
begin
  select * into m from bsu_matches where id = mid for update;
  die := coalesce(p_die, 1 + floor(random() * 6)::int);
  cur := m.turn_seat;
  pos := (m.state->'pos'->>cur)::int;
  landed := pos + die;
  if landed > 100 then landed := pos; end if;
  final := landed;
  if landed <> pos and board->'ladders' ? landed::text then
    final := (board->'ladders'->>landed::text)::int; via := 'ladder';
  elsif landed <> pos and board->'snakes' ? landed::text then
    final := (board->'snakes'->>landed::text)::int; via := 'snake';
  end if;
  st := jsonb_set(m.state, array['pos', cur::text], to_jsonb(final));
  if final = 100 then
    nr := (st->>'next_rank')::int;
    update bsu_match_players set rank = nr where match_id = mid and seat = cur;
    st := jsonb_set(st, '{next_rank}', to_jsonb(nr + 1));
  end if;
  update bsu_matches set state = st, version = version + 1 where id = mid;
  perform bsu_event(mid, 'roll', jsonb_build_object('seat', cur, 'die', die, 'from', pos, 'landed', landed, 'to', final,
    'via', via, 'rank', nr));
  if not bsu_snakes_check_end(mid) then perform bsu_snakes_next_turn(mid); end if;
end $$;

create or replace function public.bsu_snakes_roll(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; my bsu_match_players; guard int := 0; ai boolean;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  if m.game <> 'snakes' then raise exception 'bsu:wrong_game'; end if;
  if m.status <> 'active' then raise exception 'bsu:not_active'; end if;
  select * into my from bsu_match_players where match_id = mid and uid = p_uid and status = 'joined';
  if not found then raise exception 'bsu:not_in_match'; end if;
  if my.seat <> m.turn_seat or my.rank is not null then raise exception 'bsu:not_your_turn'; end if;
  update bsu_match_players set last_seen_at = now(), away = false where match_id = mid and seat = my.seat;
  loop
    perform bsu_snakes_step(mid, null);
    select * into m from bsu_matches where id = mid;
    exit when m.status <> 'active';
    select is_ai into ai from bsu_match_players where match_id = mid and seat = m.turn_seat;
    exit when not coalesce(ai, false);
    guard := guard + 1;
    exit when guard > 400;
  end loop;
  return bsu_match_view(p_uid, mid, bsu_int(a, 'since', 0));
end $$;

-- ---------------------------------------------------------------- matches: chess
create or replace function public.bsu_chess_finish(mid uuid, winner_seat int, reason text) returns void
language plpgsql set search_path = public as $$
begin
  if winner_seat is null then
    update bsu_match_players set rank = 1 where match_id = mid;
    update bsu_matches set result = jsonb_build_object('outcome', 'draw', 'reason', reason) where id = mid;
  else
    update bsu_match_players set rank = case when seat = winner_seat then 1 else 2 end where match_id = mid;
    update bsu_matches set result = jsonb_build_object('outcome', 'win', 'winner_seat', winner_seat, 'reason', reason) where id = mid;
  end if;
  perform bsu_match_finish(mid);
end $$;

-- Internal: store a move the server function has already validated with the
-- chess rules engine. Never reachable from a browser (see bsu_api).
create or replace function public.bsu_chess_commit(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; mover bsu_match_players; s int := bsu_int(a, 'seat', -1);
  st jsonb; over text := a->>'over';
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  if m.game <> 'chess' then raise exception 'bsu:wrong_game'; end if;
  if m.status <> 'active' then raise exception 'bsu:not_active'; end if;
  if m.version <> bsu_int(a, 'version', -1) then raise exception 'bsu:stale'; end if;
  if s <> m.turn_seat then raise exception 'bsu:not_your_turn'; end if;
  select * into mover from bsu_match_players where match_id = mid and seat = s;
  if mover.is_ai then
    if not exists (select 1 from bsu_match_players where match_id = mid and uid = p_uid and status = 'joined') then
      raise exception 'bsu:not_in_match';
    end if;
  elsif mover.uid is distinct from p_uid or mover.status <> 'joined' then
    raise exception 'bsu:not_your_turn';
  else
    update bsu_match_players set last_seen_at = now(), away = false where match_id = mid and seat = s;
  end if;
  st := m.state || jsonb_build_object('fen', a->>'fen', 'history', (m.state->'history') || to_jsonb(a->>'san'),
    'last', jsonb_build_object('from', a->>'from', 'to', a->>'to', 'san', a->>'san', 'seat', s), 'draw_offer_seat', null);
  update bsu_matches set state = st, turn_seat = 1 - s, version = version + 1 where id = mid;
  perform bsu_event(mid, 'move', (a - 'match_id' - 'version' - 'fen') || jsonb_build_object('fen', a->>'fen'));
  if over = 'checkmate' then perform bsu_chess_finish(mid, s, 'checkmate');
  elsif over is not null then perform bsu_chess_finish(mid, null, coalesce(a->>'draw_reason', over));
  end if;
  return bsu_match_view(p_uid, mid, bsu_int(a, 'since', 0));
end $$;

create or replace function public.bsu_chess_action(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; my bsu_match_players; act text := a->>'do'; offer int;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  if m.game <> 'chess' then raise exception 'bsu:wrong_game'; end if;
  if m.status <> 'active' then raise exception 'bsu:not_active'; end if;
  select * into my from bsu_match_players where match_id = mid and uid = p_uid and status = 'joined';
  if not found then raise exception 'bsu:not_in_match'; end if;
  offer := (m.state->>'draw_offer_seat')::int;
  if act = 'resign' then
    perform bsu_event(mid, 'resigned', jsonb_build_object('seat', my.seat));
    perform bsu_chess_finish(mid, 1 - my.seat, 'resignation');
  elsif act = 'offer_draw' then
    if offer is not null then raise exception 'bsu:draw_already_offered'; end if;
    if m.mode = 'ai' then
      perform bsu_event(mid, 'draw_offered', jsonb_build_object('seat', my.seat));
      perform bsu_event(mid, 'draw_declined', jsonb_build_object('seat', 1 - my.seat));
    else
      update bsu_matches set state = state || jsonb_build_object('draw_offer_seat', my.seat), version = version + 1 where id = mid;
      perform bsu_event(mid, 'draw_offered', jsonb_build_object('seat', my.seat));
    end if;
  elsif act = 'accept_draw' then
    if offer is null or offer = my.seat then raise exception 'bsu:no_draw_offer'; end if;
    perform bsu_event(mid, 'draw_accepted', jsonb_build_object('seat', my.seat));
    perform bsu_chess_finish(mid, null, 'agreement');
  elsif act = 'decline_draw' then
    if offer is null or offer = my.seat then raise exception 'bsu:no_draw_offer'; end if;
    update bsu_matches set state = state || jsonb_build_object('draw_offer_seat', null), version = version + 1 where id = mid;
    perform bsu_event(mid, 'draw_declined', jsonb_build_object('seat', my.seat));
  else
    raise exception 'bsu:unknown_action';
  end if;
  return bsu_match_view(p_uid, mid, bsu_int(a, 'since', 0));
end $$;

-- ---------------------------------------------------------------- matches: lobby
-- A player who leaves or disconnects. Snakes: ranked last, the others play on.
-- Chess: the opponent wins.
create or replace function public.bsu_forfeit(mid uuid, s int, reason text) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; lr int;
begin
  select * into m from bsu_matches where id = mid for update;
  if m.status <> 'active' then return; end if;
  perform bsu_event(mid, 'left', jsonb_build_object('seat', s, 'reason', reason));
  if m.game = 'chess' then
    update bsu_match_players set status = 'left' where match_id = mid and seat = s;
    update bsu_match_players set rank = case when seat = s then 2 else 1 end where match_id = mid;
    update bsu_matches set result = jsonb_build_object('outcome', 'win', 'winner_seat', 1 - s,
      'reason', case when reason = 'disconnected' then 'abandonment' else 'resignation' end) where id = mid;
    perform bsu_match_finish(mid);
    return;
  end if;
  lr := (m.state->>'last_rank')::int;
  update bsu_match_players set status = 'left', rank = lr where match_id = mid and seat = s and rank is null;
  if found then
    update bsu_matches set state = jsonb_set(state, '{last_rank}', to_jsonb(lr - 1)) where id = mid;
  else
    update bsu_match_players set status = 'left' where match_id = mid and seat = s;
  end if;
  if not bsu_snakes_check_end(mid) and m.turn_seat = s then
    perform bsu_snakes_next_turn(mid);
  end if;
end $$;

create or replace function public.bsu_match_invite_one(mid uuid, host_uid text, target_pid text) returns void
language plpgsql set search_path = public as $$
declare m bsu_matches; t bsu_players; s int;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  if m.host_uid <> host_uid then raise exception 'bsu:not_host'; end if;
  if m.status <> 'waiting' then raise exception 'bsu:not_waiting'; end if;
  select * into t from bsu_players where pid = target_pid;
  if not found or t.uid = host_uid then raise exception 'bsu:unknown_player'; end if;
  if exists (select 1 from bsu_match_players where match_id = mid and uid = t.uid) then raise exception 'bsu:already_invited'; end if;
  if (select count(*) from bsu_match_players where match_id = mid) >= m.seats then raise exception 'bsu:match_full'; end if;
  select min(g) into s from generate_series(0, m.seats - 1) g
  where not exists (select 1 from bsu_match_players where match_id = mid and seat = g);
  insert into bsu_match_players(match_id, seat, uid, name, color, status)
  values (mid, s, t.uid, t.display_name, bsu_free_color(mid, null), 'invited');
  perform bsu_event(mid, 'invited', jsonb_build_object('seat', s, 'name', t.display_name));
end $$;

create or replace function public.bsu_match_create(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare g text := a->>'game'; md text := coalesce(a->>'mode', 'ai'); n int := bsu_int(a, 'seats', 2); mid uuid; i int;
  existing uuid; nm text; pid_ text; st jsonb := '{}'::jsonb; my_seat int := 0;
begin
  if g is null or g not in ('snakes', 'chess') then raise exception 'bsu:unknown_game'; end if;
  if md not in ('ai', 'online') then raise exception 'bsu:unknown_mode'; end if;
  if g = 'chess' then n := 2; end if;
  if n < 2 or n > 4 then raise exception 'bsu:bad_seats'; end if;
  perform bsu_touch(p_uid, a);
  existing := bsu_current_match(p_uid);
  if existing is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_match', 'match_id', existing);
  end if;
  select display_name into nm from bsu_players where uid = p_uid;
  if g = 'chess' then
    my_seat := 0;
    st := jsonb_build_object('white_seat', case when a->>'side' = 'black' then 1 else 0 end,
      'ai_level', least(3, greatest(1, bsu_int(a, 'ai_level', 2))));
  end if;
  insert into bsu_matches(game, mode, seats, host_uid, state) values (g, md, n, p_uid, st) returning id into mid;
  insert into bsu_match_players(match_id, seat, uid, hero_id, name, color, status)
  values (mid, my_seat, p_uid, left(a->>'hero_id', 80), nm, bsu_free_color(mid, a->>'color'), 'joined');
  perform bsu_event(mid, 'created', jsonb_build_object('game', g, 'mode', md, 'seats', n, 'host', nm));
  if md = 'ai' then
    for i in 1..n - 1 loop
      insert into bsu_match_players(match_id, seat, uid, name, color, is_ai, status)
      values (mid, i, null, 'Computer ' || i, bsu_free_color(mid, null), true, 'joined');
    end loop;
    perform bsu_match_start(mid);
  elsif jsonb_typeof(a->'invite') = 'array' then
    for pid_ in select jsonb_array_elements_text(a->'invite') limit n - 1 loop
      perform bsu_match_invite_one(mid, p_uid, pid_);
    end loop;
  end if;
  return bsu_match_view(p_uid, mid, 0);
end $$;

create or replace function public.bsu_match_invite(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
begin
  perform bsu_match_invite_one((a->>'match_id')::uuid, p_uid, a->>'pid');
  return bsu_match_view(p_uid, (a->>'match_id')::uuid, bsu_int(a, 'since', 0));
end $$;

create or replace function public.bsu_match_respond(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; my bsu_match_players; nm text; col text;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  select * into my from bsu_match_players where match_id = mid and uid = p_uid and status = 'invited';
  if not found then raise exception 'bsu:no_invite'; end if;
  if m.status <> 'waiting' then raise exception 'bsu:not_waiting'; end if;
  perform bsu_touch(p_uid, a);
  select display_name into nm from bsu_players where uid = p_uid;
  if not coalesce((a->>'accept')::boolean, false) then
    delete from bsu_match_players where match_id = mid and seat = my.seat;
    perform bsu_event(mid, 'rejected', jsonb_build_object('seat', my.seat, 'name', nm));
    return jsonb_build_object('ok', true, 'joined', false);
  end if;
  if bsu_current_match(p_uid) is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_match', 'match_id', bsu_current_match(p_uid));
  end if;
  update bsu_match_players set color = '' where match_id = mid and seat = my.seat;
  col := bsu_free_color(mid, coalesce(a->>'color', my.color));
  update bsu_match_players set status = 'joined', name = nm, color = col, hero_id = left(a->>'hero_id', 80),
    last_seen_at = now() where match_id = mid and seat = my.seat;
  perform bsu_event(mid, 'joined', jsonb_build_object('seat', my.seat, 'name', nm, 'color', col));
  if (select count(*) from bsu_match_players where match_id = mid and status = 'joined') = m.seats then
    perform bsu_match_start(mid);
  end if;
  return bsu_match_view(p_uid, mid, 0) || jsonb_build_object('joined', true);
end $$;

create or replace function public.bsu_match_state(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; my bsu_match_players; p bsu_match_players;
  away_s int := (bsu_cfg('away_seconds') #>> '{}')::int; out_s int := (bsu_cfg('turn_timeout_seconds') #>> '{}')::int;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  select * into my from bsu_match_players where match_id = mid and uid = p_uid;
  if not found then raise exception 'bsu:not_in_match'; end if;
  if my.status = 'joined' then
    update bsu_match_players set last_seen_at = now(), away = false where match_id = mid and seat = my.seat;
    if my.away and m.status = 'active' then perform bsu_event(mid, 'back', jsonb_build_object('seat', my.seat)); end if;
  end if;
  if m.status = 'active' and m.mode = 'online' then
    for p in select * from bsu_match_players where match_id = mid and status = 'joined' and not is_ai and uid <> p_uid loop
      if p.seat = m.turn_seat and p.rank is null and p.last_seen_at < now() - make_interval(secs => out_s) then
        perform bsu_forfeit(mid, p.seat, 'disconnected');
      elsif not p.away and p.last_seen_at < now() - make_interval(secs => away_s) then
        update bsu_match_players set away = true where match_id = mid and seat = p.seat;
        perform bsu_event(mid, 'away', jsonb_build_object('seat', p.seat));
      end if;
    end loop;
  end if;
  return bsu_match_view(p_uid, mid, bsu_int(a, 'since', 0));
end $$;

create or replace function public.bsu_match_leave(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare mid uuid := (a->>'match_id')::uuid; m bsu_matches; my bsu_match_players;
begin
  select * into m from bsu_matches where id = mid for update;
  if not found then raise exception 'bsu:no_match'; end if;
  select * into my from bsu_match_players where match_id = mid and uid = p_uid;
  if not found then raise exception 'bsu:not_in_match'; end if;
  if m.status = 'waiting' then
    if m.host_uid = p_uid then
      update bsu_matches set status = 'cancelled', finished_at = now() where id = mid;
      perform bsu_event(mid, 'cancelled', jsonb_build_object('name', my.name));
    else
      delete from bsu_match_players where match_id = mid and seat = my.seat;
      perform bsu_event(mid, 'rejected', jsonb_build_object('seat', my.seat, 'name', my.name));
      return jsonb_build_object('ok', true, 'left', true);
    end if;
  elsif m.status = 'active' and my.status = 'joined' then
    perform bsu_forfeit(mid, my.seat, 'left');
  end if;
  return bsu_match_view(p_uid, mid, bsu_int(a, 'since', 0)) || jsonb_build_object('left', true);
end $$;

create or replace function public.bsu_hall_poll(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare pres int := (bsu_cfg('presence_seconds') #>> '{}')::int; me bsu_players;
begin
  perform bsu_touch(p_uid, a);
  update bsu_players set in_hall_until = case when coalesce((a->>'leave')::boolean, false) then null
    else now() + make_interval(secs => pres) end where uid = p_uid returning * into me;
  -- Lobbies whose host walked away do not linger.
  update bsu_matches set status = 'cancelled', finished_at = now()
  where status = 'waiting' and updated_at < now() - interval '15 minutes';
  return jsonb_build_object('ok', true, 'server_now', bsu_ms(now()), 'me', jsonb_build_object('pid', me.pid, 'name', me.display_name),
    'players', coalesce((select jsonb_agg(jsonb_build_object('pid', p.pid, 'name', p.display_name,
        'busy', bsu_current_match(p.uid) is not null) order by p.display_name)
      from (select * from bsu_players where in_hall_until > now() and uid <> p_uid order by last_seen_at desc limit 40) p), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('match_id', m.id, 'game', m.game, 'seats', m.seats,
        'host', h.display_name) order by m.created_at)
      from bsu_match_players mp join bsu_matches m on m.id = mp.match_id join bsu_players h on h.uid = m.host_uid
      where mp.uid = p_uid and mp.status = 'invited' and m.status = 'waiting'), '[]'::jsonb),
    'match', (select jsonb_build_object('id', m.id, 'game', m.game, 'status', m.status, 'mode', m.mode)
      from bsu_matches m where m.id = bsu_current_match(p_uid)),
    'rewards_pending', (select count(*) from bsu_rewards where uid = p_uid and claimed_at is null));
end $$;

create or replace function public.bsu_match_history(p_uid text, a jsonb) returns jsonb
language plpgsql set search_path = public as $$
begin
  return jsonb_build_object('ok', true, 'matches', coalesce((select jsonb_agg(x.j order by x.finished_at desc) from (
    select m.finished_at, jsonb_build_object('id', m.id, 'game', m.game, 'mode', m.mode, 'seats', m.seats,
      'finished_at', bsu_ms(m.finished_at), 'outcome', m.result->>'outcome', 'reason', m.result->>'reason',
      'rank', mp.rank, 'left', mp.status = 'left', 'gold', coalesce(r.gold, 0), 'xp', coalesce(r.xp, 0),
      'players', (select jsonb_agg(jsonb_build_object('name', q.name, 'rank', q.rank, 'is_ai', q.is_ai) order by q.rank nulls last, q.seat)
                  from bsu_match_players q where q.match_id = m.id)) as j
    from bsu_match_players mp join bsu_matches m on m.id = mp.match_id
    left join bsu_rewards r on r.uid = p_uid and r.source = 'match' and r.source_id = m.id::text
    where mp.uid = p_uid and m.status = 'finished'
    order by m.finished_at desc limit 20) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- the single door
create or replace function public.bsu_api(p_uid text, p_action text, p_args jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if p_uid is null or length(p_uid) = 0 or length(p_uid) > 128 then raise exception 'bsu:unauthenticated'; end if;
  if jsonb_typeof(a) <> 'object' then raise exception 'bsu:bad_request'; end if;
  case p_action
    when 'tick' then return bsu_tick(p_uid, a);
    when 'eat' then return bsu_eat(p_uid, a);
    when 'pray' then return bsu_pray(p_uid, a);
    when 'permanent' then return bsu_permanent(p_uid, a);
    when 'quests' then return bsu_quests_list(p_uid, a);
    when 'quest_accept' then return bsu_quest_accept(p_uid, a);
    when 'quest_progress' then return bsu_quest_progress(p_uid, a);
    when 'quest_complete' then return bsu_quest_complete(p_uid, a);
    when 'save_put' then return bsu_save_put(p_uid, a);
    when 'save_get' then return bsu_save_get(p_uid, a);
    when 'rewards_claim' then return bsu_rewards_claim(p_uid, a);
    when 'hall_poll' then return bsu_hall_poll(p_uid, a);
    when 'match_create' then return bsu_match_create(p_uid, a);
    when 'match_invite' then return bsu_match_invite(p_uid, a);
    when 'match_respond' then return bsu_match_respond(p_uid, a);
    when 'match_state' then return bsu_match_state(p_uid, a);
    when 'match_leave' then return bsu_match_leave(p_uid, a);
    when 'match_history' then return bsu_match_history(p_uid, a);
    when 'snakes_roll' then return bsu_snakes_roll(p_uid, a);
    when 'chess_action' then return bsu_chess_action(p_uid, a);
    when 'chess_commit' then return bsu_chess_commit(p_uid, a);
    else raise exception 'bsu:unknown_action';
  end case;
exception when others then
  if sqlerrm like 'bsu:%' then
    return jsonb_build_object('ok', false, 'error', substr(sqlerrm, 5));
  end if;
  if sqlstate in ('22P02', '22003', '22023', '23514', '23503') then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  raise;
end $$;

-- Nobody but the service role may call any of this.
do $$
declare f record; r text;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'bsu\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on function %s from %I', f.sig, r);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
