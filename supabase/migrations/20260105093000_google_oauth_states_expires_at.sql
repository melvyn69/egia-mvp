alter table public.google_oauth_states
  add column if not exists expires_at timestamptz;
