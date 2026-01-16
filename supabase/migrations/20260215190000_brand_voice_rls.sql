-- Enable RLS and allow owners to manage brand_voice rows
alter table public.brand_voice enable row level security;

drop policy if exists brand_voice_select_own on public.brand_voice;
drop policy if exists brand_voice_insert_own on public.brand_voice;
drop policy if exists brand_voice_update_own on public.brand_voice;

create policy brand_voice_select_own
on public.brand_voice
for select
using (user_id = auth.uid());

create policy brand_voice_insert_own
on public.brand_voice
for insert
with check (user_id = auth.uid());

create policy brand_voice_update_own
on public.brand_voice
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create unique index if not exists brand_voice_unique_user_global
on public.brand_voice (user_id)
where location_id is null;

create unique index if not exists brand_voice_unique_user_location
on public.brand_voice (user_id, location_id)
where location_id is not null;
