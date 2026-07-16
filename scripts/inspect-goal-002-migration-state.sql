with prospective as (
  select count(*) filter (where present)::integer as present
  from (
    values
      (to_regclass('public.security_rate_limits') is not null),
      (to_regclass('public.loyalty_enrollment_requests') is not null),
      (to_regprocedure(
        'public.consume_security_rate_limit(text,integer,integer,integer)'
      ) is not null),
      (to_regprocedure(
        'public.finalize_loyalty_enrollment(text)'
      ) is not null),
      (exists (
        select 1 from pg_constraint
        where conname = 'loyalty_programs_scope_unique'
          and conrelid = 'public.loyalty_programs'::regclass
      )),
      (exists (
        select 1 from pg_constraint
        where conname = 'loyalty_members_scope_unique'
          and conrelid = 'public.loyalty_members'::regclass
      )),
      (exists (
        select 1 from pg_constraint
        where conname = 'loyalty_members_program_scope_fk'
          and conrelid = 'public.loyalty_members'::regclass
      )),
      (exists (
        select 1 from pg_constraint
        where conname = 'loyalty_visits_member_scope_fk'
          and conrelid = 'public.loyalty_visits'::regclass
      )),
      (exists (
        select 1 from pg_constraint
        where conname = 'loyalty_rewards_member_scope_fk'
          and conrelid = 'public.loyalty_rewards'::regclass
      )),
      (exists (
        select 1 from pg_constraint
        where conname = 'wallet_passes_member_scope_fk'
          and conrelid = 'public.wallet_passes'::regclass
      ))
  ) as checks(present)
),
hardening as (
  select
    count(*) filter (where passed)::integer as passed,
    string_agg(case when passed then '1' else '0' end, '' order by ordinal)
      as vector
  from (
    values
      (1, (
        select count(*) = 2
        from pg_class
        where oid in (
          to_regclass('public.security_rate_limits'),
          to_regclass('public.loyalty_enrollment_requests')
        )
          and relrowsecurity
      )),
      (2, (
        coalesce(has_function_privilege(
          'service_role',
          to_regprocedure(
            'public.consume_security_rate_limit(text,integer,integer,integer)'
          ),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'anon',
          to_regprocedure(
            'public.consume_security_rate_limit(text,integer,integer,integer)'
          ),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'authenticated',
          to_regprocedure(
            'public.consume_security_rate_limit(text,integer,integer,integer)'
          ),
          'EXECUTE'
        ), false)
      )),
      (3, (
        coalesce(has_function_privilege(
          'service_role',
          to_regprocedure('public.join_loyalty_program(uuid,text,text)'),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'anon',
          to_regprocedure('public.join_loyalty_program(uuid,text,text)'),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'authenticated',
          to_regprocedure('public.join_loyalty_program(uuid,text,text)'),
          'EXECUTE'
        ), false)
      )),
      (4, (
        coalesce(has_function_privilege(
          'service_role',
          to_regprocedure('public.finalize_loyalty_enrollment(text)'),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'anon',
          to_regprocedure('public.finalize_loyalty_enrollment(text)'),
          'EXECUTE'
        ), false)
        and not coalesce(has_function_privilege(
          'authenticated',
          to_regprocedure('public.finalize_loyalty_enrollment(text)'),
          'EXECUTE'
        ), false)
      )),
      (5, exists (
        select 1
        from storage.buckets
        where id = 'brand-assets'
          and not public
          and file_size_limit = 3145728
          and allowed_mime_types =
            array['image/png', 'image/jpeg', 'image/webp']::text[]
      )),
      (6, (
        select count(*) = 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'cron_state'
          and policyname = 'cron_state_select_own'
          and roles = array['authenticated']::name[]
          and qual like '%auth.uid()%'
      )),
      (7, (
        has_column_privilege(
          'authenticated', 'public.google_connections', 'active', 'SELECT'
        )
        and not has_column_privilege(
          'authenticated',
          'public.google_connections',
          'refresh_token',
          'SELECT'
        )
      )),
      (8, (
        has_column_privilege(
          'authenticated', 'public.legal_entities', 'logo_path', 'SELECT'
        )
        and not has_column_privilege(
          'authenticated', 'public.legal_entities', 'logo_url', 'SELECT'
        )
      ))
  ) as checks(ordinal, passed)
),
evidence as (
  select
    (
      select count(*)::integer
      from pg_stat_activity
      where application_name = 'goal002_migration_20260713073853'
    ) as active_sessions,
    (
      select count(*)::integer
      from supabase_migrations.schema_migrations
      where version = '20260713073853'
    ) as ledger_count,
    prospective.present as prospective_present,
    10 as prospective_expected,
    hardening.passed as hardening_passed,
    8 as hardening_expected,
    hardening.vector as hardening_vector
  from prospective, hardening
)
select json_build_object(
  'active_sessions', active_sessions,
  'ledger_count', ledger_count,
  'prospective_present', prospective_present,
  'prospective_expected', prospective_expected,
  'hardening_passed', hardening_passed,
  'hardening_expected', hardening_expected,
  'hardening_vector', hardening_vector
)::text
from evidence;
