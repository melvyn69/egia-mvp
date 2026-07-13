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

insert into public.loyalty_programs (
  id,
  user_id,
  location_id,
  is_enabled,
  name,
  public_token
)
values (
  '33000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  true,
  'GOAL-002 fixture',
  '33300000-0000-4000-8000-000000000003'
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
values (
  '44000000-0000-4000-8000-000000000004',
  '33000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Existing',
  'existing@example.invalid',
  'EGEXISTING',
  '44400000-0000-4000-8000-000000000004'
)
on conflict (id) do nothing;

-- Anonymous callers have table grants for PostgREST compatibility, but RLS
-- must still expose no tenant rows and sensitive RPCs must not be executable.
set local role anon;
do $$
declare
  visible_reviews integer;
begin
  select count(*) into visible_reviews from public.google_reviews;
  if visible_reviews <> 0 then
    raise exception 'anonymous caller can read reviews';
  end if;
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

  begin
    perform *
    from public.join_loyalty_program(
      '33300000-0000-4000-8000-000000000003',
      'Attacker',
      'existing@example.invalid'
    );
    raise exception 'existing loyalty credentials were returned';
  exception
    when others then
      if sqlerrm = 'existing loyalty credentials were returned' then
        raise;
      end if;
      if position('loyalty_member_already_registered' in sqlerrm) = 0 then
        raise exception 'unexpected repeated-enrollment result: %', sqlerrm;
      end if;
  end;

  perform *
  from public.join_loyalty_program(
    '33300000-0000-4000-8000-000000000003',
    'New member',
    'new-member@example.invalid'
  );
  if not found then
    raise exception 'new loyalty enrollment no longer works';
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

  update public.google_reviews
  set comment = 'tampered'
  where id = '22200000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'user A can modify user B review';
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
end;
$$;
reset role;

-- The worker capability remains available only to service_role.
do $$
begin
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
end;
$$;

rollback;
