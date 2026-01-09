alter table public.google_locations
  add column if not exists last_synced_at timestamptz;

alter table public.google_connections
  add column if not exists last_synced_at timestamptz;
