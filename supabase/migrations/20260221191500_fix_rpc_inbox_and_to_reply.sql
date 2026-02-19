-- Fix definitif RPC inbox + to_reply.
-- Why nullable user filter:
-- - In SQL editor, auth.uid() is often NULL.
-- - We must avoid returning 0 rows only because auth.uid() is NULL.
-- - So we apply user filter only when uid is non-null.

drop function if exists public.get_inbox_reviews(text, int, boolean, int);
drop function if exists public.get_inbox_reviews(text, int, boolean, int, uuid);
drop function if exists public.get_reviews_to_reply(text, int, int, uuid);
drop function if exists public.get_reviews_to_reply(text, int, int, uuid, uuid);

create or replace function public.get_inbox_reviews(
  p_location_id text,
  p_limit int default 50,
  p_only_with_comment boolean default false,
  p_lookback_days int default 180,
  p_user_id uuid default null
)
returns table (
  review_id uuid,
  review_pk uuid,
  review_name text,
  google_review_id text,
  location_id text,
  location_name text,
  author_name text,
  status text,
  create_time timestamptz,
  update_time timestamptz,
  rating int,
  comment text,
  owner_reply text,
  owner_reply_time timestamptz,
  has_draft boolean,
  draft_status text,
  draft_preview text,
  draft_updated_at timestamptz,
  has_job_inflight boolean,
  is_eligible_to_generate boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  return query
  with base as (
    select
      r.id as review_id,
      r.review_name,
      r.review_id as google_review_id,
      r.location_id,
      r.location_name,
      r.author_name,
      r.status,
      r.create_time,
      r.update_time,
      r.rating,
      r.comment,
      r.owner_reply,
      r.owner_reply_time
    from public.google_reviews r
    where r.location_id = p_location_id
      and (uid is null or r.user_id = uid)
      and (r.owner_reply is null or btrim(r.owner_reply) = '')
      and (
        v_lookback_days = 0
        or r.create_time >= now() - (v_lookback_days || ' days')::interval
      )
      and (
        coalesce(p_only_with_comment, false) = false
        or coalesce(nullif(btrim(r.comment), ''), '') <> ''
      )
  )
  select
    b.review_id,
    b.review_id as review_pk,
    b.review_name,
    b.google_review_id,
    b.location_id,
    b.location_name,
    b.author_name,
    b.status,
    b.create_time,
    b.update_time,
    b.rating,
    b.comment,
    b.owner_reply,
    b.owner_reply_time,
    coalesce(ar.has_draft, false) as has_draft,
    ar.draft_status,
    ar.draft_preview,
    ar.draft_updated_at,
    coalesce(j.has_job_inflight, false) as has_job_inflight,
    (
      coalesce(nullif(btrim(b.comment), ''), '') <> ''
      and not coalesce(ar.has_draft, false)
      and not coalesce(j.has_job_inflight, false)
    ) as is_eligible_to_generate
  from base b
  left join lateral (
    select
      true as has_draft,
      ar0.status as draft_status,
      substring(coalesce(ar0.draft_text, '') for 160) as draft_preview,
      ar0.updated_at as draft_updated_at
    from public.review_ai_replies ar0
    where ar0.review_id = b.review_id
      and ar0.mode = 'draft'
      and (uid is null or ar0.user_id = uid)
    order by ar0.updated_at desc nulls last
    limit 1
  ) ar on true
  left join lateral (
    select true as has_job_inflight
    from public.ai_jobs j0
    where (j0.payload->>'review_id') = b.review_id::text
      and j0.type in ('review_reply_draft', 'review_analyze')
      and j0.status in ('queued', 'processing', 'generating')
      and (uid is null or j0.user_id = uid)
    limit 1
  ) j on true
  order by b.create_time desc nulls last, b.review_id desc
  limit v_limit;
end;
$$;

create or replace function public.get_reviews_to_reply(
  p_location_id text,
  p_limit int default 50,
  p_lookback_days int default 180,
  p_user_id uuid default null
)
returns table (
  review_pk uuid,
  comment text,
  rating int,
  create_time timestamptz,
  review_name text,
  location_id text,
  location_name text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  return query
  select
    r.id as review_pk,
    r.comment,
    r.rating,
    r.create_time,
    r.review_name,
    r.location_id,
    r.location_name
  from public.google_reviews r
  where r.location_id = p_location_id
    and (uid is null or r.user_id = uid)
    and (r.owner_reply is null or btrim(r.owner_reply) = '')
    and coalesce(nullif(btrim(r.comment), ''), '') <> ''
    and (
      v_lookback_days = 0
      or r.create_time >= now() - (v_lookback_days || ' days')::interval
    )
    and not exists (
      select 1
      from public.review_ai_replies ar
      where ar.review_id = r.id
        and ar.mode = 'draft'
        and (uid is null or ar.user_id = uid)
    )
    and not exists (
      select 1
      from public.ai_jobs j
      where (j.payload->>'review_id') = r.id::text
        and j.type in ('review_reply_draft', 'review_analyze')
        and j.status in ('queued', 'processing', 'generating')
        and (uid is null or j.user_id = uid)
    )
  order by r.create_time desc nulls last, r.id desc
  limit v_limit;
end;
$$;

-- Backward-compatible overload used by existing API calls that pass p_review_id.
create or replace function public.get_reviews_to_reply(
  p_location_id text,
  p_limit int,
  p_lookback_days int,
  p_user_id uuid,
  p_review_id uuid
)
returns table (
  review_pk uuid,
  comment text,
  rating int,
  create_time timestamptz,
  review_name text,
  location_id text,
  location_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.review_pk,
    r.comment,
    r.rating,
    r.create_time,
    r.review_name,
    r.location_id,
    r.location_name
  from public.get_reviews_to_reply(
    p_location_id => p_location_id,
    p_limit => p_limit,
    p_lookback_days => p_lookback_days,
    p_user_id => p_user_id
  ) r
  where p_review_id is null or r.review_pk = p_review_id
  order by r.create_time desc nulls last, r.review_pk desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

grant execute on function public.get_inbox_reviews(text, int, boolean, int, uuid) to authenticated;
grant execute on function public.get_inbox_reviews(text, int, boolean, int, uuid) to service_role;

grant execute on function public.get_reviews_to_reply(text, int, int, uuid) to authenticated;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid) to service_role;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to authenticated;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to service_role;

-- Tests:
-- select count(*) from public.get_inbox_reviews('locations/1116485163914248460', 50, false, 180);
-- select count(*) from public.get_reviews_to_reply('locations/1116485163914248460', 50, 180);
