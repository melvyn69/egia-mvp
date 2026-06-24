-- Optional operational log retention helpers.
-- This migration does not delete rows and does not schedule automatic cleanup.
-- After validation, run:
--   select * from internal.preview_operational_logs_retention_30d();
--   select * from internal.cleanup_operational_logs_retention_30d();

create schema if not exists internal;

create or replace function internal.preview_operational_logs_retention_30d()
returns table(table_name text, rows_to_delete bigint)
language sql
stable
set search_path = public
as $$
  select 'google_sync_runs'::text, count(*)::bigint
  from public.google_sync_runs
  where started_at < now() - interval '30 days'

  union all

  select 'ai_run_history'::text, count(*)::bigint
  from public.ai_run_history
  where started_at < now() - interval '30 days'

  union all

  select 'ai_jobs_done_error'::text, count(*)::bigint
  from public.ai_jobs
  where status in ('done', 'error')
    and created_at < now() - interval '30 days'

  union all

  select 'job_queue_done_failed'::text, count(*)::bigint
  from public.job_queue
  where status in ('done', 'failed')
    and created_at < now() - interval '30 days';
$$;

create or replace function internal.cleanup_operational_logs_retention_30d()
returns table(table_name text, deleted_rows bigint)
language plpgsql
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.google_sync_runs
  where started_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return query select 'google_sync_runs'::text, deleted_count;

  delete from public.ai_run_history
  where started_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return query select 'ai_run_history'::text, deleted_count;

  delete from public.ai_jobs
  where status in ('done', 'error')
    and created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return query select 'ai_jobs_done_error'::text, deleted_count;

  delete from public.job_queue
  where status in ('done', 'failed')
    and created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return query select 'job_queue_done_failed'::text, deleted_count;
end;
$$;

revoke all on schema internal from public, anon, authenticated;
revoke all on function internal.preview_operational_logs_retention_30d()
from public, anon, authenticated;
revoke all on function internal.cleanup_operational_logs_retention_30d()
from public, anon, authenticated;

grant usage on schema internal to service_role;
grant execute on function internal.preview_operational_logs_retention_30d()
to service_role;
grant execute on function internal.cleanup_operational_logs_retention_30d()
to service_role;
