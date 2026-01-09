create index if not exists google_reviews_user_location_status_idx
  on public.google_reviews (user_id, location_id, status);

create index if not exists review_drafts_user_location_idx
  on public.review_drafts (user_id, location_id);

create index if not exists automation_workflows_user_idx
  on public.automation_workflows (user_id);
