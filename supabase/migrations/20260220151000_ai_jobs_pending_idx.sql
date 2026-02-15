create index if not exists ai_jobs_pending_idx
  on public.ai_jobs(created_at)
  where status = 'pending';
