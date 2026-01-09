alter table public.business_settings
  add column if not exists active_location_ids uuid[] null,
  add column if not exists created_at timestamptz default now();

-- Diagnostic (manual): rows with invalid user_id (does not exist in auth.users)
-- select bs.business_id, bs.user_id
-- from public.business_settings bs
-- left join auth.users u on u.id = bs.user_id
-- where bs.user_id is not null and u.id is null;

update public.business_settings bs
  set user_id = bs.business_id
  where bs.user_id is null
    and exists (
      select 1
      from auth.users u
      where u.id = bs.business_id
    );

create index if not exists business_settings_user_id_idx
  on public.business_settings (user_id);
