-- Fix RPC selection for inbox/generation by resolving real google_reviews columns.
-- Handles:
-- - review PK column: review_pk (if exists) else id
-- - location text column: location_resource_name (if exists) else location_id
-- - SQL editor calls (auth.uid() is null): no forced user filter

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
  v_review_pk_col text;
  v_location_col text;
  v_inserted_col text;
  v_created_col text;
  v_mode_exists boolean;
  v_mode_predicate text;
  v_inserted_expr text;
  v_source_time_expr text;
  v_sql text;
  v_user_id uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'id'
      ) then 'id'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'review_pk'
      ) then 'review_pk'
      else null
    end
  into v_review_pk_col;

  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'location_id'
      ) then 'location_id'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'location_resource_name'
      ) then 'location_resource_name'
      else null
    end
  into v_location_col;

  if v_review_pk_col is null then
    raise exception 'get_inbox_reviews: missing review PK column (review_pk/id) on public.google_reviews';
  end if;
  if v_location_col is null then
    raise exception 'get_inbox_reviews: missing location column (location_resource_name/location_id) on public.google_reviews';
  end if;

  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'inserted_at'
      ) then 'inserted_at'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'created_at'
      ) then 'created_at'
      else null
    end
  into v_inserted_col;

  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'created_at'
      ) then 'created_at'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'inserted_at'
      ) then 'inserted_at'
      else null
    end
  into v_created_col;

  v_inserted_expr := case when v_inserted_col is not null then format('r.%I', v_inserted_col) else 'r.create_time' end;
  v_source_time_expr := case
    when v_created_col is not null then format('coalesce(r.create_time, r.update_time, r.%I)', v_created_col)
    else 'coalesce(r.create_time, r.update_time)'
  end;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_ai_replies'
      and column_name = 'mode'
  )
  into v_mode_exists;
  v_mode_predicate := case when v_mode_exists then 'and coalesce(ar.mode, ''draft'') = ''draft''' else '' end;

  v_sql := format(
    $fmt$
      with base as (
        select
          r.%1$I::uuid as review_id,
          r.review_name,
          r.review_id as google_review_id,
          r.%2$I::text as location_id,
          r.author_name,
          r.status,
          r.create_time,
          r.update_time,
          %4$s as inserted_at,
          r.rating,
          r.comment,
          r.owner_reply,
          %5$s as source_time
        from public.google_reviews r
        where ($1::text is null or r.%2$I = $1::text)
          and ($5::uuid is null or r.user_id = $5::uuid)
          and nullif(btrim(coalesce(r.owner_reply, '')), '') is null
          and ($3::boolean or nullif(btrim(coalesce(r.comment, '')), '') is not null)
          and (
            $4::int <= 0
            or %5$s
              >= now() - make_interval(days => $4::int)
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
        coalesce(d.has_draft, false) as has_draft,
        coalesce(j.has_job_inflight, false) as has_job_inflight,
        (
          nullif(btrim(coalesce(b.comment, '')), '') is not null
          and (
            $4::int <= 0
            or b.source_time >= now() - make_interval(days => $4::int)
          )
          and not coalesce(d.has_draft, false)
          and not coalesce(j.has_job_inflight, false)
        ) as is_eligible_to_generate
      from base b
      left join lateral (
        select
          true as has_draft,
          ar.status as draft_status,
          ar.draft_text as draft_preview,
          ar.updated_at as draft_updated_at
        from public.review_ai_replies ar
        where ar.review_id = b.review_id
          and ($5::uuid is null or ar.user_id = $5::uuid)
          %3$s
        order by ar.updated_at desc nulls last
        limit 1
      ) d on true
      left join lateral (
        select true as has_job_inflight
        from public.ai_jobs aj
        where aj.type in ('review_reply_draft', 'review_analyze')
          and coalesce(aj.payload->>'review_id', '') = b.review_id::text
          and aj.status in ('queued', 'processing', 'generating')
          and ($1::text is null or coalesce(aj.payload->>'location_id', '') in ('', $1::text))
          and ($5::uuid is null or coalesce(aj.payload->>'user_id', '') in ('', $5::text))
        limit 1
      ) j on true
      order by coalesce(b.create_time, b.update_time, b.inserted_at) desc, b.review_id desc
      limit $2::int
    $fmt$,
    v_review_pk_col,
    v_location_col,
    v_mode_predicate,
    v_inserted_expr,
    v_source_time_expr
  );

  return query execute v_sql
    using p_location_id, v_limit, coalesce(p_include_no_comment, false), v_lookback_days, v_user_id;
end;
$$;

create or replace function public.get_reviews_to_reply(
  p_location_id text,
  p_limit int,
  p_lookback_days int default 180,
  p_user_id uuid default null,
  p_review_id uuid default null
)
returns table (
  review_pk uuid,
  user_id uuid,
  location_id text,
  review_id text,
  location_name text,
  comment text,
  rating int,
  create_time timestamptz,
  update_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_pk_col text;
  v_location_col text;
  v_created_col text;
  v_mode_exists boolean;
  v_mode_predicate text;
  v_source_time_expr text;
  v_sql text;
  v_effective_user_id uuid := coalesce(p_user_id, auth.uid());
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 200));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'id'
      ) then 'id'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'review_pk'
      ) then 'review_pk'
      else null
    end
  into v_review_pk_col;

  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'location_id'
      ) then 'location_id'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'location_resource_name'
      ) then 'location_resource_name'
      else null
    end
  into v_location_col;

  if v_review_pk_col is null then
    raise exception 'get_reviews_to_reply: missing review PK column (review_pk/id) on public.google_reviews';
  end if;
  if v_location_col is null then
    raise exception 'get_reviews_to_reply: missing location column (location_resource_name/location_id) on public.google_reviews';
  end if;

  select
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'created_at'
      ) then 'created_at'
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'google_reviews'
          and column_name = 'inserted_at'
      ) then 'inserted_at'
      else null
    end
  into v_created_col;

  v_source_time_expr := case
    when v_created_col is not null then format('coalesce(r.create_time, r.update_time, r.%I)', v_created_col)
    else 'coalesce(r.create_time, r.update_time)'
  end;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_ai_replies'
      and column_name = 'mode'
  )
  into v_mode_exists;
  v_mode_predicate := case when v_mode_exists then 'and coalesce(rar.mode, ''draft'') = ''draft''' else '' end;

  v_sql := format(
    $fmt$
      select
        r.%1$I::uuid as review_pk,
        r.user_id,
        r.%2$I::text as location_id,
        r.review_id,
        r.location_name,
        r.comment,
        r.rating,
        r.create_time,
        r.update_time
      from public.google_reviews r
      where ($1::text is null or r.%2$I = $1::text)
        and ($4::uuid is null or r.user_id = $4::uuid)
        and ($5::uuid is null or r.%1$I::text = $5::text)
        and nullif(btrim(coalesce(r.owner_reply, '')), '') is null
        and nullif(btrim(coalesce(r.comment, '')), '') is not null
        and (
          $3::int <= 0
          or %4$s
            >= now() - make_interval(days => $3::int)
        )
        and not exists (
          select 1
          from public.review_ai_replies rar
          where rar.review_id = r.%1$I::uuid
            and ($4::uuid is null or rar.user_id = $4::uuid)
            %3$s
        )
        and not exists (
          select 1
          from public.ai_jobs aj
          where aj.type in ('review_reply_draft', 'review_analyze')
            and coalesce(aj.payload->>'review_id', '') = r.%1$I::text
            and aj.status in ('queued', 'processing', 'generating')
            and ($1::text is null or coalesce(aj.payload->>'location_id', '') in ('', $1::text))
            and ($4::uuid is null or coalesce(aj.payload->>'user_id', '') in ('', $4::text))
        )
      order by %4$s desc, r.%1$I::text desc
      limit $2::int
    $fmt$,
    v_review_pk_col,
    v_location_col,
    v_mode_predicate,
    v_source_time_expr
  );

  return query execute v_sql
    using p_location_id, v_limit, v_lookback_days, v_effective_user_id, p_review_id;
end;
$$;

revoke all on function public.get_inbox_reviews(text, int, boolean, int) from public;
grant execute on function public.get_inbox_reviews(text, int, boolean, int) to authenticated;
grant execute on function public.get_inbox_reviews(text, int, boolean, int) to service_role;

revoke all on function public.get_reviews_to_reply(text, int, int, uuid, uuid) from public;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to authenticated;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to service_role;
