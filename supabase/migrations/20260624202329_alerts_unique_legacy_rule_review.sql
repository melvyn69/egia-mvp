-- Prevent recurrence of legacy alert duplicates.
-- Run after 20260624202328_dedupe_legacy_alerts.sql.

do $$
begin
  if exists (
    select 1
    from public.alerts
    where workflow_id is null
      and alert_type is null
    group by rule_code, review_id
    having count(*) > 1
    limit 1
  ) then
    raise exception
      'Cannot create alerts_unique_legacy_rule_review: duplicate legacy alerts remain. Run the dedupe migration first.';
  end if;
end
$$;

create unique index if not exists alerts_unique_legacy_rule_review
on public.alerts (rule_code, review_id)
where workflow_id is null
  and alert_type is null;
