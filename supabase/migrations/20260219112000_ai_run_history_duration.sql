-- Add duration_ms to ai_run_history (idempotent)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_run_history'
      and column_name = 'duration_ms'
  ) then
    alter table public.ai_run_history add column duration_ms bigint null;
  end if;
end $$;

create index if not exists ai_run_history_started_at_idx
  on public.ai_run_history (started_at desc);
