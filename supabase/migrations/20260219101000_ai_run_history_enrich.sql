-- Enrich ai_run_history with optional metadata (idempotent)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_run_history'
      and column_name = 'user_id'
  ) then
    alter table public.ai_run_history add column user_id uuid null;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_run_history'
      and column_name = 'last_error'
  ) then
    alter table public.ai_run_history add column last_error text null;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_run_history'
      and column_name = 'meta'
  ) then
    alter table public.ai_run_history add column meta jsonb not null default '{}'::jsonb;
  end if;
end $$;

create index if not exists ai_run_history_user_id_idx
  on public.ai_run_history (user_id);

create index if not exists ai_run_history_errors_count_idx
  on public.ai_run_history (errors_count);

create index if not exists ai_run_history_aborted_idx
  on public.ai_run_history (aborted);
