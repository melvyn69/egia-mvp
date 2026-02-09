-- Create ai_jobs table for queued AI review analysis
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  error text null
);

create index if not exists ai_jobs_status_created_at_idx
  on public.ai_jobs(status, created_at);

create unique index if not exists ai_jobs_unique_review
  on public.ai_jobs(type, (payload->>'review_id'));

-- System-only table: no direct access for anon/authenticated
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;
grant all on public.ai_jobs to service_role;

-- Trigger to enqueue jobs for new reviews with text
create or replace function public.enqueue_ai_job_for_review()
returns trigger
language plpgsql
as $$
begin
  if new.comment is not null and length(btrim(new.comment)) > 0 then
    insert into public.ai_jobs(type, payload, status)
    values (
      'review_analyze',
      jsonb_build_object(
        'review_id', new.id,
        'location_id', new.location_id
      ),
      'pending'
    )
    on conflict (type, (payload->>'review_id')) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ai_jobs_on_google_reviews on public.google_reviews;
create trigger trg_ai_jobs_on_google_reviews
after insert on public.google_reviews
for each row execute function public.enqueue_ai_job_for_review();

-- Optional: enqueue from inbox_reviews if it is a real table (not a view)
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'inbox_reviews'
      and c.relkind = 'r'
  ) then
    execute 'drop trigger if exists trg_ai_jobs_on_inbox_reviews on public.inbox_reviews';
    execute 'create trigger trg_ai_jobs_on_inbox_reviews
      after insert on public.inbox_reviews
      for each row execute function public.enqueue_ai_job_for_review()';
  end if;
end $$;
