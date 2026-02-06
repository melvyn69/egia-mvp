do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cron_state'
      and column_name = 'user_id'
  ) then
    alter table public.cron_state
      add column user_id uuid;
  end if;
end $$;

alter table public.cron_state enable row level security;

drop policy if exists "cron_state_select_own" on public.cron_state;
drop policy if exists "cron_state_insert_own" on public.cron_state;
drop policy if exists "cron_state_update_own" on public.cron_state;
drop policy if exists "cron_state_delete_own" on public.cron_state;

create policy "cron_state_select_own"
on public.cron_state
for select
to authenticated
using (user_id = auth.uid());

create policy "cron_state_insert_own"
on public.cron_state
for insert
to authenticated
with check (user_id = auth.uid());

create policy "cron_state_update_own"
on public.cron_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "cron_state_delete_own"
on public.cron_state
for delete
to authenticated
using (user_id = auth.uid());

revoke all on public.cron_state from anon;
grant select, insert, update, delete on public.cron_state to authenticated;

do $$
begin
  update public.cron_state
  set user_id = null
  where user_id is null;
end $$;

do $$
declare
  rec record;
  extracted uuid;
begin
  for rec in
    select key from public.cron_state
    where user_id is null and key ~ '^[^:]+:[0-9a-fA-F-]{36}(:|$)'
  loop
    begin
      extracted := substring(rec.key from '^[^:]+:([0-9a-fA-F-]{36})')::uuid;
      update public.cron_state
      set user_id = extracted
      where key = rec.key
        and user_id is null;
    exception when others then
      continue;
    end;
  end loop;
end $$;
