-- Definitive fix for inbox/to-reply RPCs.
-- No information_schema heuristics.
-- Source of truth:
-- - google_reviews.id (uuid) as review_pk
-- - google_reviews.location_id (text) for location filter
-- - review_ai_replies.review_id (uuid) for draft joins
-- - ai_jobs.payload->>'review_id' (text) for inflight jobs
-- - ai_jobs has NO user_id column; user id is read from payload->>'user_id'

drop function if exists public.get_inbox_reviews(text, int, boolean, int);
drop function if exists public.get_inbox_reviews(text, int, boolean, int, uuid);
drop function if exists public.get_reviews_to_reply(text, int, int);
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
  review_pk uuid,
  review_name text,
  google_review_id text,
  location_id text,
  location_name text,
  author_name text,
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
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      coalesce(p_user_id, auth.uid()) as uid,
      greatest(1, least(coalesce(p_limit, 50), 500)) as lim,
      greatest(0, least(coalesce(p_lookback_days, 180), 3650)) as lookback_days,
      coalesce(p_only_with_comment, false) as only_with_comment
  ),
  base as (
    select
      r.id as review_pk,
      r.review_name,
      r.review_id as google_review_id,
      r.location_id,
      r.location_name,
      r.author_name,
      r.create_time,
      r.update_time,
      r.rating,
      r.comment,
      r.owner_reply,
      r.owner_reply_time
    from public.google_reviews r
    cross join params p
    where r.location_id = p_location_id
      and (p.uid is null or r.user_id = p.uid)
      and (r.owner_reply is null or btrim(r.owner_reply) = '')
      and (
        p.lookback_days = 0
        or r.create_time >= now() - (p.lookback_days || ' days')::interval
      )
      and (
        p.only_with_comment = false
        or coalesce(nullif(btrim(r.comment), ''), '') <> ''
      )
  ),
  draft_latest as (
    select distinct on (ar.review_id)
      ar.review_id,
      ar.status as draft_status,
      substring(coalesce(ar.draft_text, '') for 160) as draft_preview,
      ar.updated_at as draft_updated_at
    from public.review_ai_replies ar
    cross join params p
    where ar.mode = 'draft'
      and (p.uid is null or ar.user_id = p.uid)
    order by ar.review_id, ar.updated_at desc nulls last
  ),
  jobs_inflight as (
    select distinct (j.payload->>'review_id') as review_id_text
    from public.ai_jobs j
    cross join params p
    where j.type in ('review_reply_draft', 'review_analyze')
      and j.status in ('queued', 'processing', 'generating')
      and (j.payload->>'review_id') is not null
      and (
        p.uid is null
        or (j.payload->>'user_id') = p.uid::text
        or (j.payload->>'user_id') is null
        or (j.payload->>'user_id') = ''
      )
  )
  select
    b.review_pk,
    b.review_name,
    b.google_review_id,
    b.location_id,
    b.location_name,
    b.author_name,
    b.create_time,
    b.update_time,
    b.rating,
    b.comment,
    b.owner_reply,
    b.owner_reply_time,
    (d.review_id is not null) as has_draft,
    d.draft_status,
    d.draft_preview,
    d.draft_updated_at,
    (j.review_id_text is not null) as has_job_inflight,
    (
      coalesce(nullif(btrim(b.comment), ''), '') <> ''
      and d.review_id is null
      and j.review_id_text is null
    ) as is_eligible_to_generate
  from base b
  left join draft_latest d
    on d.review_id = b.review_pk
  left join jobs_inflight j
    on j.review_id_text = b.review_pk::text
  order by b.create_time desc nulls last, b.review_pk desc
  limit (select lim from params);
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
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      coalesce(p_user_id, auth.uid()) as uid,
      greatest(1, least(coalesce(p_limit, 50), 500)) as lim,
      greatest(0, least(coalesce(p_lookback_days, 180), 3650)) as lookback_days
  )
  select
    r.id as review_pk,
    r.comment,
    r.rating,
    r.create_time,
    r.review_name,
    r.location_id,
    r.location_name
  from public.google_reviews r
  cross join params p
  where r.location_id = p_location_id
    and (p.uid is null or r.user_id = p.uid)
    and (r.owner_reply is null or btrim(r.owner_reply) = '')
    and coalesce(nullif(btrim(r.comment), ''), '') <> ''
    and (
      p.lookback_days = 0
      or r.create_time >= now() - (p.lookback_days || ' days')::interval
    )
    and not exists (
      select 1
      from public.review_ai_replies ar
      where ar.review_id = r.id
        and ar.mode = 'draft'
        and (p.uid is null or ar.user_id = p.uid)
    )
    and not exists (
      select 1
      from public.ai_jobs j
      where (j.payload->>'review_id') = r.id::text
        and j.type in ('review_reply_draft', 'review_analyze')
        and j.status in ('queued', 'processing', 'generating')
        and (
          p.uid is null
          or (j.payload->>'user_id') = p.uid::text
          or (j.payload->>'user_id') is null
          or (j.payload->>'user_id') = ''
        )
    )
  order by r.create_time desc nulls last, r.id desc
  limit (select lim from params);
$$;

-- Backward-compatible overload used by existing API calls.
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

-- Manual tests:
-- select count(*) from public.google_reviews where location_id = 'locations/1116485163914248460';
-- select count(*) from public.get_inbox_reviews('locations/1116485163914248460', 50, false, 180);
-- select count(*) from public.get_reviews_to_reply('locations/1116485163914248460', 50, 180);
--
-- Why breakdown for a location:
-- with params as (
--   select
--     'locations/1116485163914248460'::text as location_id,
--     180::int as lookback_days,
--     null::uuid as uid
-- ),
-- draft_latest as (
--   select distinct on (ar.review_id) ar.review_id
--   from public.review_ai_replies ar
--   cross join params p
--   where ar.mode = 'draft'
--     and (p.uid is null or ar.user_id = p.uid)
--   order by ar.review_id, ar.updated_at desc nulls last
-- ),
-- jobs_inflight as (
--   select distinct (j.payload->>'review_id') as review_id_text
--   from public.ai_jobs j
--   cross join params p
--   where j.type in ('review_reply_draft', 'review_analyze')
--     and j.status in ('queued', 'processing', 'generating')
--     and (
--       p.uid is null
--       or (j.payload->>'user_id') = p.uid::text
--       or (j.payload->>'user_id') is null
--       or (j.payload->>'user_id') = ''
--     )
-- )
-- select
--   r.id as review_pk,
--   (r.owner_reply is null or btrim(r.owner_reply) = '') as owner_reply_missing,
--   (coalesce(nullif(btrim(r.comment), ''), '') <> '') as has_comment,
--   ((select lookback_days from params) = 0
--     or r.create_time >= now() - ((select lookback_days from params) || ' days')::interval) as in_lookback,
--   (d.review_id is not null) as has_draft,
--   (j.review_id_text is not null) as has_job_inflight,
--   (
--     (r.owner_reply is null or btrim(r.owner_reply) = '')
--     and (coalesce(nullif(btrim(r.comment), ''), '') <> '')
--     and (((select lookback_days from params) = 0)
--       or r.create_time >= now() - ((select lookback_days from params) || ' days')::interval)
--     and d.review_id is null
--     and j.review_id_text is null
--   ) as is_eligible_to_generate
-- from public.google_reviews r
-- cross join params p
-- left join draft_latest d on d.review_id = r.id
-- left join jobs_inflight j on j.review_id_text = r.id::text
-- where r.location_id = p.location_id
-- order by r.create_time desc nulls last, r.id desc;
