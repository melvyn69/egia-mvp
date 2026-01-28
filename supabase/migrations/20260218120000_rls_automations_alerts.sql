-- Enable RLS
alter table public.automation_workflows enable row level security;
alter table public.automation_conditions enable row level security;
alter table public.automation_actions enable row level security;
alter table public.alerts enable row level security;

-- Policies for automation_workflows
drop policy if exists "automation_workflows_select_own" on public.automation_workflows;
create policy "automation_workflows_select_own"
on public.automation_workflows
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "automation_workflows_insert_own" on public.automation_workflows;
create policy "automation_workflows_insert_own"
on public.automation_workflows
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "automation_workflows_update_own" on public.automation_workflows;
create policy "automation_workflows_update_own"
on public.automation_workflows
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "automation_workflows_delete_own" on public.automation_workflows;
create policy "automation_workflows_delete_own"
on public.automation_workflows
for delete
to authenticated
using (user_id = auth.uid());

-- Policies for automation_conditions
drop policy if exists "automation_conditions_select_own" on public.automation_conditions;
create policy "automation_conditions_select_own"
on public.automation_conditions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "automation_conditions_insert_own" on public.automation_conditions;
create policy "automation_conditions_insert_own"
on public.automation_conditions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "automation_conditions_update_own" on public.automation_conditions;
create policy "automation_conditions_update_own"
on public.automation_conditions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "automation_conditions_delete_own" on public.automation_conditions;
create policy "automation_conditions_delete_own"
on public.automation_conditions
for delete
to authenticated
using (user_id = auth.uid());

-- Policies for automation_actions
drop policy if exists "automation_actions_select_own" on public.automation_actions;
create policy "automation_actions_select_own"
on public.automation_actions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "automation_actions_insert_own" on public.automation_actions;
create policy "automation_actions_insert_own"
on public.automation_actions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "automation_actions_update_own" on public.automation_actions;
create policy "automation_actions_update_own"
on public.automation_actions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "automation_actions_delete_own" on public.automation_actions;
create policy "automation_actions_delete_own"
on public.automation_actions
for delete
to authenticated
using (user_id = auth.uid());

-- Policies for alerts
drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own"
on public.alerts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own"
on public.alerts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "alerts_update_own" on public.alerts;
create policy "alerts_update_own"
on public.alerts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "alerts_delete_own" on public.alerts;
create policy "alerts_delete_own"
on public.alerts
for delete
to authenticated
using (user_id = auth.uid());
