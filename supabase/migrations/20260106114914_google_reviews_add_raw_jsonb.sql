alter table public.google_reviews
  add column if not exists raw jsonb;
