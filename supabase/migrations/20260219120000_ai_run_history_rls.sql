-- Enable RLS on ai_run_history (idempotent)
alter table public.ai_run_history enable row level security;

-- Read policy: admin sees all, users see their own runs (by user_id or meta.user_id)
drop policy if exists "ai_run_history_select" on public.ai_run_history;
create policy "ai_run_history_select"
on public.ai_run_history
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  )
  or user_id = auth.uid()
  or (meta->>'user_id')::uuid = auth.uid()
);

-- No insert/update policies: service_role bypasses RLS
