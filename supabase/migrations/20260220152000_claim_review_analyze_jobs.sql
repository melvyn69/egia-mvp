create or replace function public.claim_review_analyze_jobs(
  p_limit int default 10,
  p_user_id text default null,
  p_location_id text default null
)
returns table(id uuid, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cte as (
    select id
    from public.ai_jobs
    where status = 'pending'
      and type = 'review_analyze'
      and (p_user_id is null or payload->>'user_id' = p_user_id)
      and (p_location_id is null or payload->>'location_id' = p_location_id)
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.ai_jobs j
  set status = 'processing',
      started_at = now()
  from cte
  where j.id = cte.id
  returning j.id, j.payload;
end;
$$;
