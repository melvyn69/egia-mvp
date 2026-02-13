create table if not exists public.ai_draft_runs (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  requested_limit int not null default 0,
  generated_count int not null default 0
);

create index if not exists ai_draft_runs_location_created_idx
  on public.ai_draft_runs(location_id, created_at desc);

create index if not exists ai_draft_runs_user_created_idx
  on public.ai_draft_runs(user_id, created_at desc);

alter table public.ai_draft_runs enable row level security;

drop policy if exists ai_draft_runs_select_own on public.ai_draft_runs;
create policy ai_draft_runs_select_own
on public.ai_draft_runs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists ai_draft_runs_insert_own on public.ai_draft_runs;
create policy ai_draft_runs_insert_own
on public.ai_draft_runs
for insert
to authenticated
with check (user_id = auth.uid());
