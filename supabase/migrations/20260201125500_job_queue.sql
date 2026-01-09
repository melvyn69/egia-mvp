create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_queue enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_queue'
      and policyname = 'job_queue_select_own'
  ) then
    create policy "job_queue_select_own"
      on public.job_queue
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_queue'
      and policyname = 'job_queue_insert_own'
  ) then
    create policy "job_queue_insert_own"
      on public.job_queue
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists job_queue_user_idx
  on public.job_queue (user_id);

create index if not exists job_queue_status_run_at_idx
  on public.job_queue (status, run_at);

create index if not exists job_queue_user_status_idx
  on public.job_queue (user_id, status);

create or replace function public.job_queue_claim(max_jobs int)
returns setof public.job_queue
language plpgsql
as $$
begin
  return query
  with locked as (
    select id
    from public.job_queue
    where status = 'queued'
      and run_at <= now()
    order by run_at asc, created_at asc
    limit max_jobs
    for update skip locked
  )
  update public.job_queue jq
    set status = 'running',
        updated_at = now()
  from locked
  where jq.id = locked.id
  returning jq.*;
end $$;
