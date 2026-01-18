create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  report_type text not null,
  location_id uuid,
  title text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.generated_reports enable row level security;

create policy "generated_reports_select_own"
on public.generated_reports
for select
using (user_id = auth.uid());

create policy "generated_reports_write_own"
on public.generated_reports
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
