alter table public.business_settings
  add column if not exists active_location_ids uuid[] null,
  add column if not exists created_at timestamptz default now();

update public.business_settings
  set user_id = business_id
  where user_id is null;

create index if not exists business_settings_user_id_idx
  on public.business_settings (user_id);
