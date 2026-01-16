-- Add competitive monitoring settings to business_settings
alter table public.business_settings
add column if not exists competitive_monitoring_enabled boolean not null default false,
add column if not exists competitive_monitoring_keyword text,
add column if not exists competitive_monitoring_radius_km integer not null default 5;
