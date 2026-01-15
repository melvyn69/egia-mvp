ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS receive_monthly_reports boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_members'
      AND column_name = 'business_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS team_members_receive_monthly_reports_idx
    ON public.team_members (business_id, receive_monthly_reports);
  END IF;
END $$;
