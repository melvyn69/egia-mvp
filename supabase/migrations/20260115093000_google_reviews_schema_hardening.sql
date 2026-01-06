alter table public.google_reviews
  add column if not exists location_id text,
  add column if not exists review_id text,
  add column if not exists status text default 'new',
  add column if not exists last_synced_at timestamptz,
  add column if not exists owner_reply text,
  add column if not exists owner_reply_time timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_text text,
  add column if not exists needs_reply boolean;

create unique index if not exists google_reviews_unique_idx
  on public.google_reviews (user_id, location_id, review_id);

create index if not exists google_reviews_status_idx
  on public.google_reviews (status);

create index if not exists google_reviews_update_time_idx
  on public.google_reviews (update_time desc);

create index if not exists google_reviews_user_update_time_idx
  on public.google_reviews (user_id, update_time desc);
