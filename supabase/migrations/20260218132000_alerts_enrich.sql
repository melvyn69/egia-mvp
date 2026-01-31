-- Enrich alerts metadata for intelligent notifications + cooldowns

alter table public.alerts
add column if not exists last_notified_at timestamptz null;

alter table public.alerts
add column if not exists workflow_name text null;

alter table public.alerts
add column if not exists rule_label text null;

alter table public.alerts
add column if not exists source text null;

-- Ensure uniqueness per workflow/review/type
create unique index if not exists alerts_unique_workflow_review_type
on public.alerts (workflow_id, review_id, alert_type)
where workflow_id is not null and alert_type is not null;

-- Optional backfill
update public.alerts
set last_notified_at = created_at
where last_notified_at is null;

update public.alerts
set source = 'automations'
where source is null and workflow_id is not null;
