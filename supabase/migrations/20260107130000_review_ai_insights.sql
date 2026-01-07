-- 1) INSIGHTS (1:1)
create table if not exists public.review_ai_insights (
  review_pk uuid primary key references public.google_reviews(id) on delete cascade,
  user_id uuid not null,
  location_resource_name text not null,
  sentiment text,
  sentiment_score real,
  summary text,
  topics jsonb,
  model text,
  processed_at timestamptz,
  source_update_time timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_ai_insights_user_id on public.review_ai_insights(user_id);
create index if not exists idx_review_ai_insights_location on public.review_ai_insights(location_resource_name);
create index if not exists idx_review_ai_insights_processed_at on public.review_ai_insights(processed_at);
create index if not exists idx_review_ai_insights_sentiment on public.review_ai_insights(sentiment);

-- 2) TAG CATALOG
create table if not exists public.ai_tags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  category text,
  created_at timestamptz not null default now()
);

-- 3) REVIEW <-> TAGS
create table if not exists public.review_ai_tags (
  review_pk uuid not null references public.google_reviews(id) on delete cascade,
  tag_id uuid not null references public.ai_tags(id) on delete restrict,
  polarity real,
  confidence real,
  evidence text,
  created_at timestamptz not null default now(),
  primary key (review_pk, tag_id)
);

create index if not exists idx_review_ai_tags_tag_id on public.review_ai_tags(tag_id);
create index if not exists idx_review_ai_tags_review_pk on public.review_ai_tags(review_pk);

-- 4) updated_at auto (optionnel mais propre)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_review_ai_insights_updated_at'
  ) then
    create or replace function public.set_updated_at()
    returns trigger as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$ language plpgsql;

    create trigger trg_review_ai_insights_updated_at
    before update on public.review_ai_insights
    for each row execute function public.set_updated_at();
  end if;
end$$;
