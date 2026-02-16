create table if not exists public.google_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id text,
  run_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  meta jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sync_runs_run_type_check'
      and conrelid = 'public.google_sync_runs'::regclass
  ) then
    alter table public.google_sync_runs
      add constraint google_sync_runs_run_type_check
      check (run_type in ('locations_import', 'reviews_sync'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sync_runs_status_check'
      and conrelid = 'public.google_sync_runs'::regclass
  ) then
    alter table public.google_sync_runs
      add constraint google_sync_runs_status_check
      check (status in ('running', 'done', 'error'));
  end if;
end
$$;

create index if not exists google_sync_runs_user_started_idx
  on public.google_sync_runs (user_id, started_at desc);

create index if not exists google_sync_runs_user_type_status_idx
  on public.google_sync_runs (user_id, run_type, status);

alter table public.google_sync_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_sync_runs'
      and policyname = 'select_own_google_sync_runs'
  ) then
    create policy "select_own_google_sync_runs"
      on public.google_sync_runs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_sync_runs'
      and policyname = 'insert_own_google_sync_runs'
  ) then
    create policy "insert_own_google_sync_runs"
      on public.google_sync_runs
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert on public.google_sync_runs to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_reviews_user_location_review_unique'
      and conrelid = 'public.google_reviews'::regclass
  ) then
    alter table public.google_reviews
      add constraint google_reviews_user_location_review_unique
      unique (user_id, location_id, review_id);
  end if;
end
$$;
