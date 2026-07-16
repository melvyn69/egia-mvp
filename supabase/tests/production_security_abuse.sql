-- GOAL-002 production security abuse tests.
-- Run only against an isolated database after the canonical baseline and all
-- prospective migrations. Every inserted fixture is rolled back.

begin;

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'goal002-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002', 'goal002-b@example.invalid')
on conflict (id) do nothing;

insert into public.google_connections (user_id, provider, refresh_token)
values
  ('10000000-0000-4000-8000-000000000001', 'google', 'fixture-a'),
  ('20000000-0000-4000-8000-000000000002', 'google', 'fixture-b')
on conflict (user_id, provider) do update set refresh_token = excluded.refresh_token;

insert into public.business_settings (business_id, business_name, user_id)
values
  ('12000000-0000-4000-8000-000000000001', 'GOAL-002 business A', '10000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000002', 'GOAL-002 business B', '20000000-0000-4000-8000-000000000002')
on conflict (business_id) do update set
  business_name = excluded.business_name,
  user_id = excluded.user_id;

insert into public.legal_entities (
  id,
  business_id,
  company_name,
  logo_path,
  logo_url
)
values
  (
    '12100000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    'GOAL-002 entity A',
    'business/12000000-0000-4000-8000-000000000001/legal_entities/12100000-0000-4000-8000-000000000001/logo.png',
    'https://attacker.invalid/a.png'
  ),
  (
    '23200000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000002',
    'GOAL-002 entity B',
    'business/23000000-0000-4000-8000-000000000002/legal_entities/23200000-0000-4000-8000-000000000002/logo.png',
    'https://attacker.invalid/b.png'
  )
on conflict (id) do update set
  logo_path = excluded.logo_path,
  logo_url = excluded.logo_url;

insert into public.google_locations (
  id,
  user_id,
  provider,
  account_resource_name,
  location_resource_name,
  location_title
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'google',
    'accounts/goal002-a',
    'accounts/goal002-a/locations/a',
    'Fixture A'
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'google',
    'accounts/goal002-b',
    'accounts/goal002-b/locations/b',
    'Fixture B'
  )
on conflict (id) do nothing;

insert into public.google_reviews (
  id,
  user_id,
  provider,
  location_name,
  review_name,
  location_id,
  review_id,
  comment,
  rating
)
values
  (
    '11100000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'google',
    'Fixture A',
    'accounts/goal002-a/locations/a/reviews/a',
    'accounts/goal002-a/locations/a',
    'review-a',
    'Review A',
    5
  ),
  (
    '22200000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'google',
    'Fixture B',
    'accounts/goal002-b/locations/b/reviews/b',
    'accounts/goal002-b/locations/b',
    'review-b',
    'Review B',
    1
  )
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
values ('20000000-0000-4000-8000-000000000002', 'admin')
on conflict (user_id) do update set role = excluded.role;

insert into public.cron_state (key, value, user_id, updated_at)
values
  (
    'goal002:user-a:status',
    '{"status":"ok"}'::jsonb,
    '10000000-0000-4000-8000-000000000001',
    now()
  ),
  (
    'goal002:user-b:status',
    '{"status":"private"}'::jsonb,
    '20000000-0000-4000-8000-000000000002',
    now()
  )
on conflict (key) do update set
  value = excluded.value,
  user_id = excluded.user_id,
  updated_at = excluded.updated_at;

insert into public.loyalty_programs (
  id,
  user_id,
  location_id,
  is_enabled,
  name,
  public_token
)
values
(
  '33000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  true,
  'GOAL-002 fixture A',
  '33300000-0000-4000-8000-000000000003'
),
(
  '55000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002',
  true,
  'GOAL-002 fixture B',
  '55500000-0000-4000-8000-000000000005'
)
on conflict (id) do nothing;

insert into public.loyalty_members (
  id,
  program_id,
  user_id,
  location_id,
  first_name,
  email,
  member_code,
  qr_token
)
values
(
  '44000000-0000-4000-8000-000000000004',
  '33000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Existing',
  'existing@example.invalid',
  'EGEXISTING',
  '44400000-0000-4000-8000-000000000004'
),
(
  '66000000-0000-4000-8000-000000000006',
  '55000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002',
  'Foreign',
  'foreign@example.invalid',
  'EGFOREIGN',
  '66600000-0000-4000-8000-000000000006'
)
on conflict (id) do nothing;

-- Catalog-wide invariants for the exposed public schema.
do $$
declare
  violations integer;
begin
  select count(*) into violations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;
  if violations <> 0 then
    raise exception 'public schema contains tables without RLS: %', violations;
  end if;

  select count(*) into violations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if violations <> 0 then
    raise exception 'public schema contains non-security-invoker views: %', violations;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cron_state'
      and policyname = 'cron_state_select_auth'
  ) then
    raise exception 'broad cron_state policy still exists';
  end if;

  select count(*) into violations
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proconfig is null;
  if violations <> 0 then
    raise exception 'SECURITY DEFINER functions without fixed config: %', violations;
  end if;

  select count(*) into violations
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.oid::regprocedure::text not in (
      'get_public_loyalty_program(uuid)'
    );
  if violations <> 0 then
    raise exception 'anon can execute unexpected SECURITY DEFINER functions: %', violations;
  end if;

  select count(*) into violations
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.oid::regprocedure::text not in (
      'ensure_profile()',
      'get_public_loyalty_program(uuid)',
      'is_admin()',
      'record_loyalty_visit(uuid,text,uuid,text)'
    );
  if violations <> 0 then
    raise exception 'authenticated can execute unexpected SECURITY DEFINER functions: %', violations;
  end if;

  select count(*) into violations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and (
      has_table_privilege('anon', c.oid, 'TRUNCATE')
      or has_table_privilege('anon', c.oid, 'REFERENCES')
      or has_table_privilege('anon', c.oid, 'TRIGGER')
      or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      or has_table_privilege('authenticated', c.oid, 'REFERENCES')
      or has_table_privilege('authenticated', c.oid, 'TRIGGER')
    );
  if violations <> 0 then
    raise exception 'Data API roles retain schema-management table privileges: %', violations;
  end if;

  if has_table_privilege('anon', 'public.google_connections', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'anonymous caller retains google_connections access';
  end if;
  if has_table_privilege('authenticated', 'public.google_connections', 'INSERT,UPDATE,DELETE') then
    raise exception 'authenticated caller can mutate google_connections';
  end if;
  if has_column_privilege('authenticated', 'public.google_connections', 'refresh_token', 'SELECT')
    or has_column_privilege('authenticated', 'public.google_connections', 'access_token', 'SELECT')
    or has_column_privilege('authenticated', 'public.google_connections', 'oauth_state', 'SELECT') then
    raise exception 'authenticated caller can read OAuth credentials/state';
  end if;
  if not has_column_privilege('authenticated', 'public.google_connections', 'sync_status', 'SELECT') then
    raise exception 'authenticated caller lost safe Google status projection';
  end if;

  if has_table_privilege('authenticated', 'public.legal_entities', 'INSERT,UPDATE,DELETE') then
    raise exception 'authenticated caller can mutate legal_entities directly';
  end if;
  if has_column_privilege('authenticated', 'public.legal_entities', 'logo_url', 'SELECT') then
    raise exception 'authenticated caller can read deprecated external logo URL';
  end if;
  if not has_column_privilege('authenticated', 'public.legal_entities', 'logo_path', 'SELECT') then
    raise exception 'authenticated caller lost canonical logo path projection';
  end if;

  if has_table_privilege(
    'anon',
    'public.loyalty_enrollment_requests',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'authenticated',
    'public.loyalty_enrollment_requests',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'browser role can access loyalty enrollment requests';
  end if;
  if has_table_privilege(
    'anon',
    'public.security_rate_limits',
    'SELECT,INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'authenticated',
    'public.security_rate_limits',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'browser role can access durable rate-limit state';
  end if;
  if has_function_privilege(
    'anon',
    'public.join_loyalty_program(uuid,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.join_loyalty_program(uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'browser role can create or recover loyalty membership';
  end if;
  if has_function_privilege(
    'anon',
    'public.finalize_loyalty_enrollment(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_loyalty_enrollment(text)',
    'EXECUTE'
  ) then
    raise exception 'browser role can finalize loyalty enrollment';
  end if;
  if has_function_privilege(
    'anon',
    'public.consume_security_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.consume_security_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'browser role can mutate durable rate-limit state';
  end if;
  if has_table_privilege('authenticated', 'public.loyalty_visits', 'INSERT')
    or has_table_privilege('authenticated', 'public.loyalty_rewards', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.wallet_passes', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated role retains direct loyalty capability mutation';
  end if;
  if (
    select count(*)
    from pg_constraint
    where conname in (
      'loyalty_programs_scope_unique',
      'loyalty_members_scope_unique',
      'loyalty_members_program_scope_fk',
      'loyalty_visits_member_scope_fk',
      'loyalty_rewards_member_scope_fk',
      'wallet_passes_member_scope_fk'
    )
      and convalidated
  ) <> 6 then
    raise exception 'loyalty member-scope constraints are missing or unvalidated';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'brand-assets'
      and public = false
      and file_size_limit = 3145728
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']::text[]
      and cardinality(allowed_mime_types) = 3
  ) then
    raise exception 'brand-assets bucket security configuration is missing';
  end if;
end;
$$;

-- Anonymous callers have table grants for PostgREST compatibility, but RLS
-- must still expose no tenant rows and sensitive RPCs must not be executable.
set local role anon;
do $$
declare
  visible_reviews integer;
  visible_cron_rows integer;
begin
  select count(*) into visible_reviews from public.google_reviews;
  if visible_reviews <> 0 then
    raise exception 'anonymous caller can read reviews';
  end if;
  begin
    select count(*) into visible_cron_rows from public.cron_state;
    if visible_cron_rows <> 0 then
      raise exception 'anonymous caller can read cron state';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  if has_function_privilege('anon', 'public.claim_review_analyze_jobs(integer,text,text)', 'EXECUTE') then
    raise exception 'anon can claim review analysis jobs';
  end if;
  if has_function_privilege('anon', 'public.ensure_user_profile(uuid,text)', 'EXECUTE') then
    raise exception 'anon can execute ensure_user_profile';
  end if;
  if has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') then
    raise exception 'anon can execute is_admin';
  end if;
  if has_function_privilege('anon', 'public.record_loyalty_visit(uuid,text,uuid,text)', 'EXECUTE') then
    raise exception 'anon can execute record_loyalty_visit';
  end if;

end;
$$;
reset role;

-- User A sees and modifies only A. The foreign establishment and B's review
-- remain invisible, and a normal authenticated role is not an administrator.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  own_reviews integer;
  foreign_reviews integer;
  foreign_locations integer;
  own_cron_rows integer;
  foreign_cron_rows integer;
  own_connections integer;
  foreign_connections integer;
  own_entities integer;
  foreign_entities integer;
  changed integer;
begin
  select count(*) into own_reviews
  from public.google_reviews
  where user_id = '10000000-0000-4000-8000-000000000001';
  if own_reviews <> 1 then
    raise exception 'user A cannot read own review';
  end if;

  select count(*) into foreign_reviews
  from public.google_reviews
  where user_id = '20000000-0000-4000-8000-000000000002';
  if foreign_reviews <> 0 then
    raise exception 'user A can read user B review';
  end if;

  select count(*) into foreign_locations
  from public.google_locations
  where user_id = '20000000-0000-4000-8000-000000000002';
  if foreign_locations <> 0 then
    raise exception 'user A can read a foreign establishment';
  end if;

  select count(*) into own_cron_rows
  from public.cron_state
  where user_id = '10000000-0000-4000-8000-000000000001';
  if own_cron_rows <> 1 then
    raise exception 'user A cannot read own cron state';
  end if;

  select count(*) into foreign_cron_rows
  from public.cron_state
  where user_id = '20000000-0000-4000-8000-000000000002';
  if foreign_cron_rows <> 0 then
    raise exception 'user A can read user B cron state';
  end if;

  select count(id) into own_connections
  from public.google_connections
  where user_id = '10000000-0000-4000-8000-000000000001';
  if own_connections <> 1 then
    raise exception 'user A cannot read own safe Google connection status';
  end if;

  select count(id) into foreign_connections
  from public.google_connections
  where user_id = '20000000-0000-4000-8000-000000000002';
  if foreign_connections <> 0 then
    raise exception 'user A can read user B Google connection status';
  end if;

  begin
    perform refresh_token
    from public.google_connections
    where user_id = '10000000-0000-4000-8000-000000000001';
    raise exception 'user A can read own Google refresh token';
  exception
    when insufficient_privilege then
      null;
  end;

  select count(id) into own_entities
  from public.legal_entities
  where business_id = '12000000-0000-4000-8000-000000000001';
  if own_entities <> 1 then
    raise exception 'user A cannot read own legal entity';
  end if;

  select count(id) into foreign_entities
  from public.legal_entities
  where business_id = '23000000-0000-4000-8000-000000000002';
  if foreign_entities <> 0 then
    raise exception 'user A can read user B legal entity';
  end if;

  begin
    update public.legal_entities
    set logo_path = 'business/23000000-0000-4000-8000-000000000002/legal_entities/23200000-0000-4000-8000-000000000002/logo.png'
    where id = '12100000-0000-4000-8000-000000000001';
    raise exception 'user A can forge own logo path';
  exception
    when insufficient_privilege then
      null;
  end;

  update public.google_reviews
  set comment = 'tampered'
  where id = '22200000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'user A can modify user B review';
  end if;

  update public.cron_state
  set value = '{"status":"tampered"}'::jsonb
  where key = 'goal002:user-b:status';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'user A can modify user B cron state';
  end if;

  if public.is_admin() then
    raise exception 'normal user A is treated as admin';
  end if;
  if has_function_privilege('authenticated', 'public.claim_review_analyze_jobs(integer,text,text)', 'EXECUTE') then
    raise exception 'authenticated caller can claim review analysis jobs';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_user_profile(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated caller can execute inner profile definer';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.join_loyalty_program(uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated caller can bypass loyalty e-mail proof';
  end if;
end;
$$;
reset role;

-- The worker capability remains available only to service_role.
set local role service_role;
do $$
declare
  token text;
  new_member_id uuid;
  existing_member_id uuid;
  recovered_member_id uuid;
  reused_token_rejected boolean := false;
  forged_member_rejected boolean := false;
  forged_visit_rejected boolean := false;
  forged_reward_rejected boolean := false;
  forged_wallet_rejected boolean := false;
begin
  select refresh_token into token
  from public.google_connections
  where user_id = '10000000-0000-4000-8000-000000000001';
  if token <> 'fixture-a' then
    raise exception 'service_role lost Google credential access';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.claim_review_analyze_jobs(integer,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role lost the worker RPC';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.kpi_summary(text,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated caller can execute server-only KPI RPC';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.join_loyalty_program(uuid,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.finalize_loyalty_enrollment(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.consume_security_rate_limit(text,integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role lost a required server-only capability';
  end if;

  if not public.consume_security_rate_limit(
    repeat('9', 64),
    2,
    3600,
    1
  ) or not public.consume_security_rate_limit(
    repeat('9', 64),
    2,
    3600,
    1
  ) or public.consume_security_rate_limit(
    repeat('9', 64),
    2,
    3600,
    1
  ) then
    raise exception 'durable rate limit is not atomic and bounded';
  end if;

  insert into public.loyalty_enrollment_requests (
    public_token,
    first_name,
    email,
    token_hash,
    expires_at
  )
  values (
    '33300000-0000-4000-8000-000000000003',
    'New member',
    'new-member@example.invalid',
    repeat('a', 64),
    now() + interval '15 minutes'
  );

  select member_id into new_member_id
  from public.finalize_loyalty_enrollment(repeat('a', 64));
  if new_member_id is null then
    raise exception 'verified new loyalty enrollment did not create a member';
  end if;

  insert into public.loyalty_enrollment_requests (
    public_token,
    first_name,
    email,
    token_hash,
    expires_at
  )
  values (
    '33300000-0000-4000-8000-000000000003',
    'Existing',
    'existing@example.invalid',
    repeat('b', 64),
    now() + interval '15 minutes'
  );

  select member_id into existing_member_id
  from public.finalize_loyalty_enrollment(repeat('b', 64));
  if existing_member_id <> '44000000-0000-4000-8000-000000000004' then
    raise exception 'verified existing member recovery returned a foreign member';
  end if;

  insert into public.loyalty_enrollment_requests (
    public_token,
    first_name,
    email,
    token_hash,
    expires_at
  )
  values (
    '33300000-0000-4000-8000-000000000003',
    'Existing',
    'existing@example.invalid',
    repeat('c', 64),
    now() + interval '15 minutes'
  );

  select member_id into recovered_member_id
  from public.finalize_loyalty_enrollment(repeat('c', 64));
  if recovered_member_id <> existing_member_id then
    raise exception 'existing-member recovery is not stable';
  end if;

  begin
    perform *
    from public.finalize_loyalty_enrollment(repeat('b', 64));
  exception
    when others then
      reused_token_rejected :=
        position('invalid_or_expired_enrollment_token' in sqlerrm) > 0;
  end;
  if not reused_token_rejected then
    raise exception 'a loyalty verification token can be reused';
  end if;

  begin
    insert into public.loyalty_members (
      program_id,
      user_id,
      location_id,
      first_name,
      email
    )
    values (
      '33000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000002',
      '22000000-0000-4000-8000-000000000002',
      'Forged',
      'forged-member@example.invalid'
    );
  exception
    when foreign_key_violation then
      forged_member_rejected := true;
  end;

  begin
    insert into public.loyalty_visits (
      program_id,
      member_id,
      user_id,
      location_id,
      points_added
    )
    values (
      '33000000-0000-4000-8000-000000000003',
      '66000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      10
    );
  exception
    when foreign_key_violation then
      forged_visit_rejected := true;
  end;

  begin
    insert into public.loyalty_rewards (
      program_id,
      member_id,
      user_id,
      location_id,
      threshold_points,
      reward_label
    )
    values (
      '33000000-0000-4000-8000-000000000003',
      '66000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      100,
      'Forged'
    );
  exception
    when foreign_key_violation then
      forged_reward_rejected := true;
  end;

  begin
    insert into public.wallet_passes (
      program_id,
      member_id,
      user_id,
      location_id,
      provider
    )
    values (
      '33000000-0000-4000-8000-000000000003',
      '66000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      'generic'
    );
  exception
    when foreign_key_violation then
      forged_wallet_rejected := true;
  end;

  if not forged_member_rejected
    or not forged_visit_rejected
    or not forged_reward_rejected
    or not forged_wallet_rejected then
    raise exception 'a loyalty member or child row can reference a foreign scope';
  end if;
end;
$$;
reset role;

rollback;
