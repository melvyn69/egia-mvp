alter table public.ai_draft_runs
  add column if not exists last_run_at timestamptz not null default now();

create unique index if not exists ai_draft_runs_user_location_uniq
  on public.ai_draft_runs(user_id, location_id);

drop policy if exists ai_draft_runs_update_own on public.ai_draft_runs;
create policy ai_draft_runs_update_own
on public.ai_draft_runs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
