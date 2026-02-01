drop index if exists public.alerts_unique_rule_per_review;

alter table public.alerts
  drop constraint if exists alerts_unique_rule_per_review;
