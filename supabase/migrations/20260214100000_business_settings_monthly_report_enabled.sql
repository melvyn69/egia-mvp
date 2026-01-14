-- Add monthly report toggle to business_settings
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS monthly_report_enabled boolean NOT NULL DEFAULT false;

-- Optional index for cron filtering
CREATE INDEX IF NOT EXISTS business_settings_monthly_report_enabled_idx
ON public.business_settings (monthly_report_enabled, user_id);

-- Optional: enable for all existing users
-- UPDATE public.business_settings
-- SET monthly_report_enabled = true
-- WHERE monthly_report_enabled = false;
