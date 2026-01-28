-- Ensure alerts are unique per workflow/review/type to prevent duplicate spam
-- Safe: nullable columns + partial unique index

alter table public.alerts
add column if not exists workflow_id uuid;

alter table public.alerts
add column if not exists alert_type text;

create unique index if not exists alerts_unique_workflow_review_type
on public.alerts (workflow_id, review_id, alert_type)
where workflow_id is not null and alert_type is not null;
