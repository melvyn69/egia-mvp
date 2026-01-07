create index if not exists idx_google_reviews_location_source_time
  on public.google_reviews(
    location_id,
    coalesce(update_time, create_time, created_at)
  );
