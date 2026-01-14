-- Add tracking fields for monthly report cron
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS rendered_at timestamptz null,
ADD COLUMN IF NOT EXISTS emailed_at timestamptz null;
