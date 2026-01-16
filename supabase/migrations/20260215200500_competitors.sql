-- Competitors table for competitive monitoring
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid null,
  place_id text not null,
  name text not null,
  address text null,
  lat double precision null,
  lng double precision null,
  distance_m integer null,
  rating numeric null,
  user_ratings_total integer null,
  category text null,
  is_followed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_fetched_at timestamptz null,
  unique (user_id, location_id, place_id)
);

create index if not exists competitors_user_location_followed_idx
  on public.competitors (user_id, location_id, is_followed);

alter table public.competitors enable row level security;

create policy "competitors_select_own"
on public.competitors
for select
to authenticated
using (auth.uid() = user_id);

create policy "competitors_insert_own"
on public.competitors
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "competitors_update_own"
on public.competitors
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "competitors_delete_own"
on public.competitors
for delete
to authenticated
using (auth.uid() = user_id);

drop trigger if exists trg_competitors_updated_at on public.competitors;
create trigger trg_competitors_updated_at
before update on public.competitors
for each row execute function public.set_updated_at();
