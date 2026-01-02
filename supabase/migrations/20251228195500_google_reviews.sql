create table if not exists public.google_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id text not null,
  review_id text not null,
  author_name text,
  rating int,
  comment text,
  create_time timestamptz,
  update_time timestamptz,
  raw jsonb,
  inserted_at timestamptz default now(),
  unique (user_id, location_id, review_id)
);

create index if not exists google_reviews_user_id_idx
  on public.google_reviews (user_id);

create index if not exists google_reviews_location_id_idx
  on public.google_reviews (location_id);
