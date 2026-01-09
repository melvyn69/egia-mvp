create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  review_id text not null,
  location_id text null,
  reply_text text not null,
  source text null,
  created_at timestamptz default now()
);

alter table public.review_replies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_replies'
      and policyname = 'review_replies_select_own'
  ) then
    create policy "review_replies_select_own" on public.review_replies
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_replies'
      and policyname = 'review_replies_insert_own'
  ) then
    create policy "review_replies_insert_own" on public.review_replies
      for insert with check (auth.uid() = user_id);
  end if;
end $$;
