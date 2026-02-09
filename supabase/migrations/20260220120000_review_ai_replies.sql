create table if not exists public.review_ai_replies (
  review_id uuid primary key,
  user_id uuid not null,
  location_id text null,
  draft_text text,
  tone text not null default 'professional',
  length text not null default 'short',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_ai_replies_user_id_idx
  on public.review_ai_replies(user_id);

create index if not exists review_ai_replies_location_id_idx
  on public.review_ai_replies(location_id);

alter table public.review_ai_replies enable row level security;

drop policy if exists review_ai_replies_select_own on public.review_ai_replies;
create policy review_ai_replies_select_own
on public.review_ai_replies
for select
to authenticated
using (user_id = auth.uid());
