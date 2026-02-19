-- Deterministic "reviews to reply" selection + dedupe guards for drafts/jobs.

-- 1) Draft idempotence guard (one draft mode per review)
create unique index if not exists review_ai_replies_review_mode_uidx
  on public.review_ai_replies (review_id, mode);

-- 2) Replace global ai_jobs unique index by inflight-only dedupe
drop index if exists public.ai_jobs_unique_review;

create unique index if not exists ai_jobs_review_analyze_inflight_uidx
  on public.ai_jobs (
    type,
    coalesce(payload->>'review_id', ''),
    coalesce(payload->>'location_id', '')
  )
  where type = 'review_analyze'
    and status in ('queued', 'pending', 'processing', 'generating');

-- 3) Keep trigger enqueue logic safe with generic ON CONFLICT DO NOTHING
create or replace function public.enqueue_ai_job_for_review()
returns trigger
language plpgsql
as $$
begin
  if new.comment is not null and length(btrim(new.comment)) > 0 then
    insert into public.ai_jobs(type, payload, status)
    values (
      'review_analyze',
      jsonb_build_object(
        'review_id', new.id,
        'location_id', new.location_id
      ),
      'pending'
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- 4) RPC for reliable selection of reviews to process
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
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 200));
  v_lookback_days int := greatest(0, least(coalesce(p_lookback_days, 180), 3650));
begin
  if v_user_id is null then
    return;
  end if;

  return query
  select
    gr.id as review_pk,
    gr.user_id,
    gr.location_id,
    gr.review_id,
    gr.location_name,
    gr.comment,
    gr.rating,
    gr.create_time,
    gr.update_time
  from public.google_reviews gr
  where gr.user_id = v_user_id
    and (p_location_id is null or gr.location_id = p_location_id)
    and (p_review_id is null or gr.id = p_review_id)
    and nullif(btrim(coalesce(gr.comment, '')), '') is not null
    and nullif(btrim(coalesce(gr.owner_reply, '')), '') is null
    and (
      v_lookback_days = 0
      or coalesce(gr.create_time, gr.update_time, gr.inserted_at)
        >= now() - make_interval(days => v_lookback_days)
    )
    and not exists (
      select 1
      from public.review_ai_replies rar
      where rar.review_id = gr.id
        and coalesce(rar.mode, 'draft') = 'draft'
        and coalesce(rar.status, 'draft') in ('draft', 'queued', 'processing', 'generating')
    )
    and not exists (
      select 1
      from public.ai_jobs aj
      where aj.type = 'review_analyze'
        and coalesce(aj.payload->>'review_id', '') = gr.id::text
        and (
          coalesce(aj.payload->>'location_id', '') = coalesce(gr.location_id, '')
          or coalesce(aj.payload->>'location_id', '') = ''
        )
        and aj.status in ('queued', 'pending', 'processing', 'generating')
    )
  order by coalesce(gr.update_time, gr.create_time, gr.inserted_at) desc, gr.id desc
  limit v_limit;
end;
$$;

revoke all on function public.get_reviews_to_reply(text, int, int, uuid, uuid) from public;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to authenticated;
grant execute on function public.get_reviews_to_reply(text, int, int, uuid, uuid) to service_role;
