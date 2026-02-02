-- Add monthly_report_enabled flag to business_settings (idempotent)
alter table public.business_settings
add column if not exists monthly_report_enabled boolean not null default true;
