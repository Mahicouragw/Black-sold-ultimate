-- v14 public dropped items expire after one hour.
alter table public.world_drops alter column expires_at set default(now()+interval '1 hour');
update public.world_drops set expires_at=least(expires_at,created_at+interval '1 hour') where expires_at>created_at+interval '1 hour';
