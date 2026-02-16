-- Fix cron_state read access for authenticated
DO $$
BEGIN
  IF to_regclass('public.cron_state') IS NOT NULL THEN
    EXECUTE 'alter table public.cron_state enable row level security';
    EXECUTE 'drop policy if exists "cron_state_select_auth" on public.cron_state';
    EXECUTE 'create policy "cron_state_select_auth" on public.cron_state for select to authenticated using (true)';
  END IF;
END $$;
