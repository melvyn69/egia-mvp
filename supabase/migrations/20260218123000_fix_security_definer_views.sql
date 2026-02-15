-- ===============================
-- FIX SECURITY DEFINER VIEWS
-- ===============================

-- 1) Passer les vues en SECURITY INVOKER (respecte le RLS)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname = 'business_memory_effective'
  ) THEN
    EXECUTE 'alter view public.business_memory_effective set (security_invoker = true)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname = 'inbox_reviews'
  ) THEN
    EXECUTE 'alter view public.inbox_reviews set (security_invoker = true)';
  END IF;
END $$;

-- 2) Retirer TOUS les droits publics
revoke all on public.business_memory_effective from anon, authenticated;
revoke all on public.inbox_reviews from anon, authenticated;

-- 3) Autoriser seulement la lecture aux users loggés
grant select on public.business_memory_effective to authenticated;
grant select on public.inbox_reviews to authenticated;

-- 4) Laisser service_role tout faire (backend / edge functions)
grant all on public.business_memory_effective to service_role;
grant all on public.inbox_reviews to service_role;
