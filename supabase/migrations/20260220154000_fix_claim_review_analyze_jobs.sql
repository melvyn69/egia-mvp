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
    select aj.id as job_id
    from public.ai_jobs aj
    where aj.status = 'pending'
      and aj.type = 'review_analyze'
      and (p_user_id is null or aj.payload->>'user_id' = p_user_id)
      and (p_location_id is null or aj.payload->>'location_id' = p_location_id)
    order by aj.created_at asc
    limit p_limit
    for update skip locked
  )
  update public.ai_jobs j
  set status = 'processing',
      started_at = now()
  from cte
  where j.id = cte.job_id
  returning j.id, j.payload;
end;
$$;
