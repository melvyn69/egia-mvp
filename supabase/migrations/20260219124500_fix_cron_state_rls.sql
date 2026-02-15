DO $$
BEGIN
  IF to_regclass('public.cron_state') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'cron_state'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'alter table public.cron_state add column user_id uuid';
    END IF;

    EXECUTE 'alter table public.cron_state enable row level security';

    EXECUTE 'drop policy if exists "cron_state_select_own" on public.cron_state';
    EXECUTE 'drop policy if exists "cron_state_insert_own" on public.cron_state';
    EXECUTE 'drop policy if exists "cron_state_update_own" on public.cron_state';
    EXECUTE 'drop policy if exists "cron_state_delete_own" on public.cron_state';

    EXECUTE 'create policy "cron_state_select_own" on public.cron_state for select to authenticated using (user_id = auth.uid())';
    EXECUTE 'create policy "cron_state_insert_own" on public.cron_state for insert to authenticated with check (user_id = auth.uid())';
    EXECUTE 'create policy "cron_state_update_own" on public.cron_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    EXECUTE 'create policy "cron_state_delete_own" on public.cron_state for delete to authenticated using (user_id = auth.uid())';

    EXECUTE 'revoke all on public.cron_state from anon';
    EXECUTE 'grant select, insert, update, delete on public.cron_state to authenticated';

    EXECUTE 'update public.cron_state set user_id = null where user_id is null';

    EXECUTE $sql$
      DO $inner$
      DECLARE
        rec record;
        extracted uuid;
      BEGIN
        FOR rec IN
          SELECT key FROM public.cron_state
          WHERE user_id IS NULL AND key ~ '^[^:]+:[0-9a-fA-F-]{36}(:|$)'
        LOOP
          BEGIN
            extracted := substring(rec.key from '^[^:]+:([0-9a-fA-F-]{36})')::uuid;
            UPDATE public.cron_state
            SET user_id = extracted
            WHERE key = rec.key
              AND user_id IS NULL;
          EXCEPTION WHEN OTHERS THEN
            CONTINUE;
          END;
        END LOOP;
      END $inner$;
    $sql$;
  END IF;
END $$;
