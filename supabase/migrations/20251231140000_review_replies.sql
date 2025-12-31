create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id text not null,
  source text null,
  location_id uuid null,
  business_name text null,
  tone text null,
  length text null,
  reply_text text not null,
  status text not null default 'draft',
  created_at timestamptz default now(),
  sent_at timestamptz null
);

create index if not exists review_replies_user_id_idx
  on public.review_replies (user_id);

create index if not exists review_replies_review_id_idx
  on public.review_replies (review_id);

alter table public.review_replies enable row level security;

create policy "select_own_review_replies"
on public.review_replies
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert_own_review_replies"
on public.review_replies
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update_own_review_replies"
on public.review_replies
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
