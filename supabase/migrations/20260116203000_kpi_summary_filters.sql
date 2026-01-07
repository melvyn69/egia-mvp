create or replace function public.kpi_summary(
  p_location_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_rating_min numeric default null,
  p_rating_max numeric default null,
  p_sentiment text default null,
  p_status text default null,
  p_tags text[] default null
)
returns table (
  reviews_total bigint,
  reviews_with_text bigint,
  avg_rating numeric,
  sentiment_positive bigint,
  sentiment_neutral bigint,
  sentiment_negative bigint,
  top_tags jsonb
)
language sql stable as $$
  with base as (
    select
      gr.id,
      gr.rating,
      gr.comment,
      gr.status,
      coalesce(gr.update_time, gr.create_time, gr.created_at) as source_time
    from public.google_reviews gr
    where gr.location_id = p_location_id
      and coalesce(gr.update_time, gr.create_time, gr.created_at) >= p_from
      and coalesce(gr.update_time, gr.create_time, gr.created_at) <= p_to
      and (p_rating_min is null or gr.rating >= p_rating_min)
      and (p_rating_max is null or gr.rating <= p_rating_max)
      and (p_status is null or gr.status = p_status)
  ),
  filtered as (
    select b.*
    from base b
    where
      (p_sentiment is null or exists (
        select 1
        from public.review_ai_insights ai
        where ai.review_pk = b.id
          and ai.sentiment = p_sentiment
      ))
      and (
        p_tags is null or exists (
          select 1
          from public.review_ai_tags rat
          join public.ai_tags at on at.id = rat.tag_id
          where rat.review_pk = b.id
            and at.tag = any(p_tags)
        )
      )
  ),
  tag_counts as (
    select at.tag, count(*) as count
    from filtered f
    join public.review_ai_tags rat on rat.review_pk = f.id
    join public.ai_tags at on at.id = rat.tag_id
    group by at.tag
    order by count desc
    limit 8
  )
  select
    (select count(*) from filtered) as reviews_total,
    (select count(*) from filtered where comment is not null and length(btrim(comment)) > 0)
      as reviews_with_text,
    (select avg(rating) from filtered) as avg_rating,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'positive') as sentiment_positive,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'neutral') as sentiment_neutral,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'negative') as sentiment_negative,
    (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb)
      from tag_counts) as top_tags;
$$;
