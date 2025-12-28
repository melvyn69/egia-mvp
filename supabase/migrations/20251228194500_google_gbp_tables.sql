create table if not exists public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  account_name text,
  account_resource_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_resource_name)
);

create table if not exists public.google_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  account_resource_name text not null,
  location_resource_name text not null,
  location_title text,
  store_code text,
  address_json jsonb,
  phone text,
  website_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, location_resource_name)
);

alter table public.google_accounts enable row level security;
alter table public.google_locations enable row level security;

create policy "select_own_google_accounts"
on public.google_accounts
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert_own_google_accounts"
on public.google_accounts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update_own_google_accounts"
on public.google_accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete_own_google_accounts"
on public.google_accounts
for delete
to authenticated
using (auth.uid() = user_id);

create policy "select_own_google_locations"
on public.google_locations
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert_own_google_locations"
on public.google_locations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update_own_google_locations"
on public.google_locations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete_own_google_locations"
on public.google_locations
for delete
to authenticated
using (auth.uid() = user_id);
