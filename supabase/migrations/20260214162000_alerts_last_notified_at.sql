alter table public.alerts
add column last_notified_at timestamptz null;
