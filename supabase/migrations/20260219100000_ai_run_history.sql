-- AI cron run history
create table if not exists public.ai_run_history (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  processed integer not null default 0,
  tags_upserted integer not null default 0,
  errors_count integer not null default 0,
  aborted boolean not null default false,
  skip_reason text null
);

create index if not exists ai_run_history_started_at_idx
  on public.ai_run_history (started_at desc);
