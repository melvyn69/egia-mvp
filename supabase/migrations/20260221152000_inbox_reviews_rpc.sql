create or replace function public.get_inbox_reviews(
  p_location_id text,
  p_limit int,
  p_include_no_comment boolean default false,
  p_lookback_days int default 180
)
returns table (
  review_id uuid,
  review_name text,
  google_review_id text,
  location_id text,
  author_name text,
  status text,
  create_time timestamptz,
  update_time timestamptz,
  inserted_at timestamptz,
  rating int,
  comment text,
  owner_reply text,
  draft_status text,
  draft_preview text,
  draft_updated_at timestamptz,
  has_draft boolean,
  has_job_inflight boolean,
  is_eligible_to_generate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_user_id uuid := v_auth_uid;
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  if v_user_id is null then
    return;
  end if;

  return query
  with base_reviews as (
    select
      gr.id as review_id,
      gr.review_name,
      gr.review_id as google_review_id,
      gr.location_id,
      gr.author_name,
      gr.status,
      gr.create_time,
      gr.update_time,
      gr.inserted_at,
      gr.rating,
      gr.comment,
      gr.owner_reply
    from public.google_reviews gr
    where gr.user_id = v_user_id
      and (p_location_id is null or gr.location_id = p_location_id)
      and nullif(btrim(coalesce(gr.owner_reply, '')), '') is null
      and (
        coalesce(p_include_no_comment, false)
        or nullif(btrim(coalesce(gr.comment, '')), '') is not null
      )
  ),
  draft_rows as (
    select distinct on (rar.review_id)
      rar.review_id,
      rar.status as draft_status,
      rar.draft_text as draft_preview,
      rar.updated_at as draft_updated_at
    from public.review_ai_replies rar
    where rar.user_id = v_user_id
      and coalesce(rar.mode, 'draft') = 'draft'
    order by rar.review_id, rar.updated_at desc nulls last
  ),
  inflight_jobs as (
    select distinct coalesce(aj.payload->>'review_id', '') as review_id_text
    from public.ai_jobs aj
    where aj.type = 'review_analyze'
      and aj.status in ('queued', 'processing', 'generating')
      and (
        coalesce(aj.payload->>'user_id', '') = v_user_id::text
        or coalesce(aj.payload->>'user_id', '') = ''
      )
      and (
        p_location_id is null
        or coalesce(aj.payload->>'location_id', '') in (p_location_id, '')
      )
  )
  select
    b.review_id,
    b.review_name,
    b.google_review_id,
    b.location_id,
    b.author_name,
    b.status,
    b.create_time,
    b.update_time,
    b.inserted_at,
    b.rating,
    b.comment,
    b.owner_reply,
    d.draft_status,
    d.draft_preview,
    d.draft_updated_at,
    (d.review_id is not null) as has_draft,
    (j.review_id_text is not null) as has_job_inflight,
    (
      d.review_id is null
      and nullif(btrim(coalesce(b.comment, '')), '') is not null
      and (
        v_lookback_days = 0
        or coalesce(b.create_time, b.update_time, b.inserted_at)
          >= now() - make_interval(days => v_lookback_days)
      )
      and j.review_id_text is null
    ) as is_eligible_to_generate
  from base_reviews b
  left join draft_rows d
    on d.review_id = b.review_id
  left join inflight_jobs j
    on j.review_id_text = b.review_id::text
  order by coalesce(b.create_time, b.update_time, b.inserted_at) desc, b.review_id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_inbox_reviews(text, int, boolean, int) from public;
grant execute on function public.get_inbox_reviews(text, int, boolean, int) to authenticated;
grant execute on function public.get_inbox_reviews(text, int, boolean, int) to service_role;
