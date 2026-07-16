-- GOAL-006: make pgcrypto resolution deterministic inside the privileged
-- AI-candidate claim RPC. Supabase installs pgcrypto in the extensions schema,
-- while the previous function forced search_path=public and called digest()
-- without qualification.

begin;

do $goal006_preflight$
begin
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null then
    raise exception
      'GOAL-006 requires extensions.digest(text,text); pgcrypto is unavailable in the expected schema';
  end if;
end;
$goal006_preflight$;

create or replace function public.claim_ai_tag_candidates(
  p_limit int default 10,
  p_version text default 'v1',
  p_location_id text default null
)
returns table (
  id uuid, review_id text, update_time timestamptz, create_time timestamptz,
  created_at timestamptz, user_id uuid, location_id text, location_name text,
  comment text, reply_text text, owner_reply text, content_hash text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return query
  with locked as (
    select r.id,
      pg_catalog.encode(
        extensions.digest(
          (coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''))::pg_catalog.text,
          'sha256'::pg_catalog.text
        ),
        'hex'::pg_catalog.text
      ) as computed_hash
    from public.google_reviews r
    where r.comment is not null and pg_catalog.btrim(r.comment) <> ''
      and r.user_id is not null and r.location_id is not null
      and (p_location_id is null or r.location_id = p_location_id)
      and (
        r.ai_tag_status in ('pending', 'error')
        or r.ai_tag_version is distinct from p_version
        or r.content_hash is distinct from pg_catalog.encode(
          extensions.digest(
            (coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''))::pg_catalog.text,
            'sha256'::pg_catalog.text
          ),
          'hex'::pg_catalog.text
        )
        or (
          r.ai_tag_status = 'processing'
          and r.ai_tag_claimed_at < pg_catalog.now() - interval '10 minutes'
        )
      )
    order by coalesce(r.update_time, r.create_time, r.created_at), r.id
    limit least(greatest(coalesce(p_limit, 10), 1), 20)
    for update skip locked
  ), claimed as (
    update public.google_reviews r
    set ai_tag_status = 'processing',
      ai_tag_claimed_at = pg_catalog.now(),
      content_hash = locked.computed_hash
    from locked
    where r.id = locked.id
    returning r.*
  )
  select c.id, c.review_id, c.update_time, c.create_time, c.created_at,
    c.user_id, c.location_id, c.location_name, c.comment, c.reply_text,
    c.owner_reply, c.content_hash
  from claimed c;
end;
$$;

revoke all on function public.claim_ai_tag_candidates(int, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_tag_candidates(int, text, text)
  to service_role;

commit;
