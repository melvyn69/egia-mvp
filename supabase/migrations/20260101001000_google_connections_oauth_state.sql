alter table public.google_connections
  add column if not exists oauth_state text,
  add column if not exists oauth_state_expires_at timestamptz;

create index if not exists google_connections_user_id_idx
  on public.google_connections (user_id);
