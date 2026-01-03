alter table public.google_reviews enable row level security;

create policy "select_own_google_reviews"
on public.google_reviews
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert_own_google_reviews"
on public.google_reviews
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update_own_google_reviews"
on public.google_reviews
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete_own_google_reviews"
on public.google_reviews
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists google_accounts_user_id_idx
  on public.google_accounts (user_id);

create index if not exists google_locations_user_id_idx
  on public.google_locations (user_id);
