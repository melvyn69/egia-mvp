-- user_profiles: allow authenticated app access
grant usage on schema public to authenticated;

grant select, insert, update
on table public.user_profiles
to authenticated;

-- If a serial sequence exists, grant usage/select
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'user_profiles_id_seq'
  ) THEN
    EXECUTE 'grant usage, select on sequence public.user_profiles_id_seq to authenticated';
  END IF;
END $$;
