-- Deduplicate legacy alerts only.
-- Scope:
--   - public.alerts rows where workflow_id is null and alert_type is null
--   - keep one row per (rule_code, review_id)
--   - prefer the most recent unresolved alert
--
-- Preview before applying this migration:
--
-- with ranked as (
--   select
--     id,
--     rule_code,
--     review_id,
--     row_number() over (
--       partition by rule_code, review_id
--       order by (resolved_at is null) desc, created_at desc, id desc
--     ) as rn
--   from public.alerts
--   where workflow_id is null
--     and alert_type is null
-- )
-- select
--   count(*) filter (where rn = 1) as rows_kept,
--   count(*) filter (where rn > 1) as rows_to_delete
-- from ranked;
--
-- Verification after applying this migration:
--
-- select
--   count(*) as duplicate_groups_remaining
-- from (
--   select rule_code, review_id
--   from public.alerts
--   where workflow_id is null
--     and alert_type is null
--   group by rule_code, review_id
--   having count(*) > 1
-- ) d;

with ranked as (
  select
    id,
    row_number() over (
      partition by rule_code, review_id
      order by (resolved_at is null) desc, created_at desc, id desc
    ) as rn
  from public.alerts
  where workflow_id is null
    and alert_type is null
)
delete from public.alerts a
using ranked r
where a.id = r.id
  and r.rn > 1;
