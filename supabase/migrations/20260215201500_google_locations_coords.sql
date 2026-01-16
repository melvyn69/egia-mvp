-- Add cached coordinates for google_locations
alter table public.google_locations
add column if not exists latitude double precision,
add column if not exists longitude double precision;
