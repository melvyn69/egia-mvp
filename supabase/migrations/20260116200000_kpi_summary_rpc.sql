create or replace function public.kpi_summary(
  p_location_id text,
  p_from timestamptz,
  p_to timestamptz
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
  with filtered as (
    select
      gr.id,
      gr.rating,
      gr.comment,
      coalesce(gr.update_time, gr.create_time, gr.created_at) as source_time
    from public.google_reviews gr
    where gr.location_id = p_location_id
      and coalesce(gr.update_time, gr.create_time, gr.created_at) >= p_from
      and coalesce(gr.update_time, gr.create_time, gr.created_at) <= p_to
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

create index if not exists idx_google_reviews_location_update_time
  on public.google_reviews(location_id, update_time);
create index if not exists idx_google_reviews_location_create_time
  on public.google_reviews(location_id, create_time);
create index if not exists idx_google_reviews_location_created_at
  on public.google_reviews(location_id, created_at);
create index if not exists idx_review_ai_insights_review_pk_sentiment
  on public.review_ai_insights(review_pk, sentiment);
create index if not exists idx_review_ai_tags_review_pk
  on public.review_ai_tags(review_pk);
create index if not exists idx_ai_tags_name
  on public.ai_tags(tag);
