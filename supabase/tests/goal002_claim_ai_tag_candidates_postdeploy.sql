-- GOAL-002 production synthetic post-deployment probe.
-- Run only under the explicit production authorization for GOAL002_SYNTH.
-- Every fixture is synthetic and the transaction is always rolled back.

begin;

do $goal002_synth_catalog$
declare
  target oid;
  config text[];
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
    raise exception 'GOAL002_SYNTH target function is missing';
  end if;
  if config is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'GOAL002_SYNTH unexpected function config';
  end if;
  if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = target) then
    raise exception 'GOAL002_SYNTH target is not SECURITY DEFINER';
  end if;
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'GOAL002_SYNTH extensions.digest(text,text) is missing';
  end if;
  if pg_catalog.has_function_privilege(
    'anon',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_ai_tag_candidates(integer,text,text)',
    'EXECUTE'
  ) then
    raise exception 'GOAL002_SYNTH unexpected function privileges';
  end if;
end;
$goal002_synth_catalog$;

set local role anon;
do $goal002_synth_anon_denial$
begin
  begin
    perform *
    from public.claim_ai_tag_candidates(
      1,
      'GOAL002_SYNTH_v1',
      'GOAL002_SYNTH_location_a'
    );
    raise exception 'GOAL002_SYNTH anon unexpectedly executed claim';
  exception
    when insufficient_privilege then null;
  end;
end;
$goal002_synth_anon_denial$;
reset role;

set local role authenticated;
do $goal002_synth_authenticated_denial$
begin
  begin
    perform *
    from public.claim_ai_tag_candidates(
      1,
      'GOAL002_SYNTH_v1',
      'GOAL002_SYNTH_location_a'
    );
    raise exception 'GOAL002_SYNTH authenticated unexpectedly executed claim';
  exception
    when insufficient_privilege then null;
  end;
end;
$goal002_synth_authenticated_denial$;
reset role;

create schema goal002_synth_attacker;
create function goal002_synth_attacker.digest(text, text)
returns bytea
language plpgsql
as $goal002_synth_attacker$
begin
  raise exception 'GOAL002_SYNTH attacker digest was resolved';
end;
$goal002_synth_attacker$;
grant usage on schema goal002_synth_attacker to service_role;
grant execute on function goal002_synth_attacker.digest(text, text)
  to service_role;

insert into auth.users (id, email)
values (
  '60200000-0000-4000-8000-000000000002',
  'goal002-synth-claim@example.invalid'
);

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
    '61200000-0000-4000-8000-000000000002',
    '60200000-0000-4000-8000-000000000002',
    'google',
    'GOAL002_SYNTH location A',
    'accounts/GOAL002_SYNTH/locations/a/reviews/a',
    'GOAL002_SYNTH_location_a',
    'GOAL002_SYNTH_review_a',
    'GOAL002_SYNTH alpha',
    5,
    '2026-07-16T12:00:00Z',
    'pending'
  ),
  (
    '62200000-0000-4000-8000-000000000002',
    '60200000-0000-4000-8000-000000000002',
    'google',
    'GOAL002_SYNTH location B',
    'accounts/GOAL002_SYNTH/locations/b/reviews/b',
    'GOAL002_SYNTH_location_b',
    'GOAL002_SYNTH_review_b',
    'GOAL002_SYNTH beta',
    1,
    '2026-07-16T12:01:00Z',
    'pending'
  );

set local search_path = goal002_synth_attacker, public, extensions;
set local role service_role;
do $goal002_synth_behavior$
declare
  claimed integer;
  actual_hash text;
  expected_hash text;
begin
  select count(*) into claimed
  from public.claim_ai_tag_candidates(
    100,
    'GOAL002_SYNTH_v1',
    'GOAL002_SYNTH_location_a'
  );
  if claimed <> 1 then
    raise exception 'GOAL002_SYNTH location claim returned % rows', claimed;
  end if;

  select content_hash into actual_hash
  from public.google_reviews
  where id = '61200000-0000-4000-8000-000000000002';
  expected_hash := pg_catalog.encode(
    extensions.digest('GOAL002_SYNTH alpha|5'::text, 'sha256'::text),
    'hex'::text
  );
  if actual_hash is distinct from expected_hash then
    raise exception 'GOAL002_SYNTH content hash mismatch';
  end if;
  if (
    select ai_tag_status
    from public.google_reviews
    where id = '62200000-0000-4000-8000-000000000002'
  ) <> 'pending' then
    raise exception 'GOAL002_SYNTH location filter claimed location B';
  end if;
end;
$goal002_synth_behavior$;

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
  '60200000-0000-4000-8000-000000000002',
  'google',
  'GOAL002_SYNTH batch',
  'accounts/GOAL002_SYNTH/locations/limit/reviews/' || series,
  'GOAL002_SYNTH_location_limit',
  'GOAL002_SYNTH_limit_' || series,
  'GOAL002_SYNTH batch ' || series,
  4,
  '2026-07-16T12:30:00Z'::timestamptz + series * interval '1 second',
  'pending'
from pg_catalog.generate_series(1, 21) as series;

do $goal002_synth_limit$
declare
  claimed integer;
begin
  select count(*) into claimed
  from public.claim_ai_tag_candidates(
    100,
    'GOAL002_SYNTH_v1',
    'GOAL002_SYNTH_location_limit'
  );
  if claimed <> 20 then
    raise exception 'GOAL002_SYNTH batch cap returned % rows', claimed;
  end if;
end;
$goal002_synth_limit$;

reset role;
rollback;
