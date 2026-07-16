-- GOAL-006 local-only regression and abuse tests.
-- Run after applying all migrations to an isolated Supabase database.
-- All synthetic fixtures and attacker objects are rolled back.

begin;

do $goal006_catalog$
declare
  target oid;
  config text[];
  extension_schema text;
begin
  select p.oid, p.proconfig
  into target, config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_ai_tag_candidates'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_limit integer, p_version text, p_location_id text';

  if target is null then
    raise exception 'GOAL-006 target function is missing';
  end if;
  if config is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'unexpected function config: %', config;
  end if;
  if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = target) then
    raise exception 'target function is no longer SECURITY DEFINER';
  end if;
  if exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        (select p.proacl from pg_catalog.pg_proc p where p.oid = target),
        pg_catalog.acldefault('f', (select p.proowner from pg_catalog.pg_proc p where p.oid = target))
      )
    ) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC retains EXECUTE on target function';
  end if;
  if pg_catalog.has_function_privilege(
    'anon',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon retains EXECUTE on target function';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated retains EXECUTE on target function';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute target function';
  end if;

  select n.nspname
  into extension_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if extension_schema is distinct from 'extensions' then
    raise exception 'unexpected pgcrypto schema: %', extension_schema;
  end if;
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'extensions.digest(text,text) is missing';
  end if;
end;
$goal006_catalog$;

set local role anon;
do $goal006_anon_denial$
begin
  begin
    perform *
    from public.claim_ai_tag_candidates(1, 'goal006-v1', 'goal006-location-a');
    raise exception 'anon unexpectedly executed claim_ai_tag_candidates';
  exception
    when insufficient_privilege then null;
  end;
end;
$goal006_anon_denial$;
reset role;

set local role authenticated;
do $goal006_authenticated_denial$
begin
  begin
    perform *
    from public.claim_ai_tag_candidates(1, 'goal006-v1', 'goal006-location-a');
    raise exception 'authenticated unexpectedly executed claim_ai_tag_candidates';
  exception
    when insufficient_privilege then null;
  end;
end;
$goal006_authenticated_denial$;
reset role;

create schema goal006_attacker;
create function goal006_attacker.digest(text, text)
returns bytea
language plpgsql
as $goal006_attacker$
begin
  raise exception 'attacker digest was resolved';
end;
$goal006_attacker$;
grant usage on schema goal006_attacker to service_role;
grant execute on function goal006_attacker.digest(text, text) to service_role;

insert into auth.users (id, email)
values (
  '60000000-0000-4000-8000-000000000006',
  'goal006@example.invalid'
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
  rating,
  update_time,
  ai_tag_status
)
values
  (
    '61000000-0000-4000-8000-000000000006',
    '60000000-0000-4000-8000-000000000006',
    'google',
    'GOAL-006 A',
    'accounts/goal006/locations/a/reviews/a',
    'goal006-location-a',
    'goal006-review-a',
    'GOAL006 alpha',
    5,
    '2026-07-16T10:00:00Z',
    'pending'
  ),
  (
    '62000000-0000-4000-8000-000000000006',
    '60000000-0000-4000-8000-000000000006',
    'google',
    'GOAL-006 B',
    'accounts/goal006/locations/b/reviews/b',
    'goal006-location-b',
    'goal006-review-b',
    'GOAL006 beta',
    1,
    '2026-07-16T10:01:00Z',
    'pending'
  );

set local search_path = goal006_attacker, public, extensions;
set local role service_role;

do $goal006_behavior$
declare
  claimed integer;
  actual_hash text;
  expected_hash text;
begin
  select count(*) into claimed
  from public.claim_ai_tag_candidates(100, 'goal006-v1', 'goal006-location-a');
  if claimed <> 1 then
    raise exception 'location-scoped claim returned % rows instead of 1', claimed;
  end if;

  select content_hash into actual_hash
  from public.google_reviews
  where id = '61000000-0000-4000-8000-000000000006';
  expected_hash := pg_catalog.encode(
    extensions.digest('GOAL006 alpha|5'::text, 'sha256'::text),
    'hex'
  );
  if actual_hash is distinct from expected_hash then
    raise exception 'content hash mismatch';
  end if;
  if (
    select ai_tag_status
    from public.google_reviews
    where id = '62000000-0000-4000-8000-000000000006'
  ) <> 'pending' then
    raise exception 'location filter claimed the foreign fixture';
  end if;

  update public.google_reviews
  set ai_tag_status = 'done',
    ai_tag_version = 'goal006-v1',
    ai_tag_claimed_at = null
  where id = '61000000-0000-4000-8000-000000000006';

  select count(*) into claimed
  from public.claim_ai_tag_candidates(1, 'goal006-v1', 'goal006-location-a');
  if claimed <> 0 then
    raise exception 'unchanged completed content was reclaimed';
  end if;

  update public.google_reviews
  set comment = 'GOAL006 alpha changed'
  where id = '61000000-0000-4000-8000-000000000006';

  select count(*) into claimed
  from public.claim_ai_tag_candidates(1, 'goal006-v1', 'goal006-location-a');
  if claimed <> 1 then
    raise exception 'changed content was not reclaimed';
  end if;
end;
$goal006_behavior$;

insert into public.google_reviews (
  user_id,
  provider,
  location_name,
  review_name,
  location_id,
  review_id,
  comment,
  rating,
  update_time,
  ai_tag_status
)
select
  '60000000-0000-4000-8000-000000000006',
  'google',
  'GOAL-006 batch',
  'accounts/goal006/locations/limit/reviews/' || series,
  'goal006-location-limit',
  'goal006-limit-' || series,
  'GOAL006 batch ' || series,
  4,
  '2026-07-16T11:00:00Z'::timestamptz + series * interval '1 second',
  'pending'
from pg_catalog.generate_series(1, 21) as series;

do $goal006_limit$
declare
  claimed integer;
begin
  select count(*) into claimed
  from public.claim_ai_tag_candidates(
    100,
    'goal006-v1',
    'goal006-location-limit'
  );
  if claimed <> 20 then
    raise exception 'batch cap returned % rows instead of 20', claimed;
  end if;
end;
$goal006_limit$;

reset role;
rollback;
