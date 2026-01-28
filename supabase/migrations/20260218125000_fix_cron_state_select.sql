-- Fix cron_state read access for authenticated
alter table public.cron_state enable row level security;

drop policy if exists "cron_state_select_auth" on public.cron_state;
create policy "cron_state_select_auth"
on public.cron_state
for select
to authenticated
using (true);
