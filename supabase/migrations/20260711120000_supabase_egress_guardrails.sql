-- Non-destructive guardrails for bounded, incremental cron processing.
create extension if not exists pgcrypto;

alter table public.google_connections
  add column if not exists active boolean not null default true,
  add column if not exists last_synced_at timestamptz,
  add column if not exists next_sync_at timestamptz not null default now(),
  add column if not exists sync_status text not null default 'idle',
  add column if not exists sync_cursor text,
  add column if not exists sync_claimed_at timestamptz;

alter table public.google_reviews
  add column if not exists content_hash text,
  add column if not exists ai_tag_version text,
  add column if not exists ai_tagged_at timestamptz,
  add column if not exists ai_tag_status text not null default 'pending',
  add column if not exists ai_tag_claimed_at timestamptz;

alter table public.automation_workflows
  add column if not exists next_run_at timestamptz not null default now(),
  add column if not exists run_status text not null default 'idle',
  add column if not exists run_claimed_at timestamptz;

alter table public.reports
  add column if not exists idempotency_key text;

create index if not exists google_connections_sync_due_idx
  on public.google_connections (next_sync_at, user_id)
  where active and sync_status = 'idle';

create index if not exists google_reviews_ai_due_idx
  on public.google_reviews (ai_tag_status, update_time, id)
  where comment is not null and btrim(comment) <> '';

create index if not exists automation_workflows_due_idx
  on public.automation_workflows (next_run_at, id)
  where enabled and trigger = 'new_review';

create unique index if not exists reports_monthly_period_unique_idx
  on public.reports (idempotency_key)
  where idempotency_key is not null;

create or replace function public.set_monthly_report_idempotency_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.period_preset = 'last_month' then
    new.idempotency_key := new.user_id::text || ':' ||
      coalesce(new.from_date::text, '') || ':' || coalesce(new.to_date::text, '');
  end if;
  return new;
end;
$$;

drop trigger if exists reports_monthly_idempotency_key on public.reports;
create trigger reports_monthly_idempotency_key
before insert or update of user_id, from_date, to_date, period_preset
on public.reports
for each row execute function public.set_monthly_report_idempotency_key();

drop function if exists public.job_queue_claim(int);
create or replace function public.job_queue_claim(max_jobs int default 25)
returns table (
  id uuid,
  user_id uuid,
  type text,
  status text,
  run_at timestamptz,
  attempts int,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with locked as (
    select jq.id
    from public.job_queue jq
    where jq.status = 'queued'
      and jq.run_at <= now()
      and jq.attempts < 5
    order by jq.run_at, jq.created_at
    limit least(greatest(coalesce(max_jobs, 25), 1), 50)
    for update skip locked
  )
  update public.job_queue jq
  set status = 'running', updated_at = now()
  from locked
  where jq.id = locked.id
  returning jq.id, jq.user_id, jq.type, jq.status, jq.run_at,
    jq.attempts, jq.last_error, jq.created_at, jq.updated_at;
end;
$$;

revoke all on function public.job_queue_claim(int) from public, anon, authenticated;
grant execute on function public.job_queue_claim(int) to service_role;

create or replace function public.claim_google_sync_connections(p_limit int default 5)
returns table (user_id uuid, refresh_token text, sync_cursor text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with locked as (
    select gc.id
    from public.google_connections gc
    where gc.active
      and gc.refresh_token is not null
      and gc.next_sync_at <= now()
      and (
        gc.sync_status = 'idle'
        or (gc.sync_status = 'processing' and gc.sync_claimed_at < now() - interval '10 minutes')
      )
    order by gc.next_sync_at, gc.id
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
    for update skip locked
  )
  update public.google_connections gc
  set sync_status = 'processing', sync_claimed_at = now(), updated_at = now()
  from locked
  where gc.id = locked.id
  returning gc.user_id, gc.refresh_token, gc.sync_cursor;
end;
$$;

revoke all on function public.claim_google_sync_connections(int) from public, anon, authenticated;
grant execute on function public.claim_google_sync_connections(int) to service_role;

create or replace function public.claim_ai_tag_candidates(
  p_limit int default 10,
  p_version text default 'v1',
  p_location_id text default null
)
returns table (
  id uuid, review_id text, update_time timestamptz, create_time timestamptz,
  created_at timestamptz, user_id uuid, location_id text, location_name text,
  comment text, reply_text text, owner_reply text, content_hash text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with locked as (
    select r.id,
      encode(digest(coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''), 'sha256'), 'hex') as computed_hash
    from public.google_reviews r
    where r.comment is not null and btrim(r.comment) <> ''
      and r.user_id is not null and r.location_id is not null
      and (p_location_id is null or r.location_id = p_location_id)
      and (
        r.ai_tag_status in ('pending', 'error')
        or r.ai_tag_version is distinct from p_version
        or r.content_hash is distinct from encode(digest(coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''), 'sha256'), 'hex')
        or (r.ai_tag_status = 'processing' and r.ai_tag_claimed_at < now() - interval '10 minutes')
      )
    order by coalesce(r.update_time, r.create_time, r.created_at), r.id
    limit least(greatest(coalesce(p_limit, 10), 1), 20)
    for update skip locked
  ), claimed as (
    update public.google_reviews r
    set ai_tag_status = 'processing', ai_tag_claimed_at = now(),
      content_hash = locked.computed_hash
    from locked
    where r.id = locked.id
    returning r.*
  )
  select c.id, c.review_id, c.update_time, c.create_time, c.created_at,
    c.user_id, c.location_id, c.location_name, c.comment, c.reply_text,
    c.owner_reply, c.content_hash
  from claimed c;
end;
$$;

revoke all on function public.claim_ai_tag_candidates(int, text, text) from public, anon, authenticated;
grant execute on function public.claim_ai_tag_candidates(int, text, text) to service_role;

create or replace function public.claim_due_automation_workflows(p_limit int default 25)
returns table (id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with locked as (
    select aw.id
    from public.automation_workflows aw
    where aw.enabled and aw.trigger = 'new_review'
      and aw.next_run_at <= now()
      and (aw.run_status = 'idle' or
        (aw.run_status = 'processing' and aw.run_claimed_at < now() - interval '10 minutes'))
    order by aw.next_run_at, aw.id
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
    for update skip locked
  )
  update public.automation_workflows aw
  set run_status = 'processing', run_claimed_at = now(), updated_at = now()
  from locked
  where aw.id = locked.id
  returning aw.id, aw.user_id;
end;
$$;

revoke all on function public.claim_due_automation_workflows(int) from public, anon, authenticated;
grant execute on function public.claim_due_automation_workflows(int) to service_role;
