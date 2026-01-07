create or replace function public.ai_tag_candidates(
  p_user_id uuid default null,
  p_location_id text default null,
  p_since_time timestamptz default '1970-01-01',
  p_since_id uuid default '00000000-0000-0000-0000-000000000000',
  p_limit int default 150,
  p_force boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  location_id text,
  location_name text,
  comment text,
  update_time timestamptz,
  create_time timestamptz,
  created_at timestamptz
)
language sql stable as $$
  select gr.id,
         gr.user_id,
         gr.location_id,
         gr.location_name,
         gr.comment,
         gr.update_time,
         gr.create_time,
         gr.created_at
  from public.google_reviews gr
  where gr.comment is not null
    and length(btrim(gr.comment)) > 0
    and not exists (
      select 1
      from public.review_ai_insights ai
      where ai.review_pk = gr.id
    )
    and (
      p_force = true
      or (coalesce(gr.update_time, gr.create_time, gr.created_at) > p_since_time)
      or (
        coalesce(gr.update_time, gr.create_time, gr.created_at) = p_since_time
        and gr.id > p_since_id
      )
    )
    and (p_user_id is null or gr.user_id = p_user_id)
    and (p_location_id is null or gr.location_id = p_location_id)
  order by coalesce(gr.update_time, gr.create_time, gr.created_at) asc, gr.id asc
  limit p_limit;
$$;

create or replace function public.ai_tag_candidates_count(
  p_user_id uuid default null,
  p_location_id text default null
)
returns bigint
language sql stable as $$
  select count(*)
  from public.google_reviews gr
  where gr.comment is not null
    and length(btrim(gr.comment)) > 0
    and not exists (
      select 1
      from public.review_ai_insights ai
      where ai.review_pk = gr.id
    )
    and (p_user_id is null or gr.user_id = p_user_id)
    and (p_location_id is null or gr.location_id = p_location_id);
$$;
