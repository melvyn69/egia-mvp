-- Create user_profiles for email lookup (cron-safe)
create table if not exists public.user_profiles (
  user_id uuid primary key,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill updated_at for existing rows if needed
update public.user_profiles
set updated_at = now()
where updated_at is null;
