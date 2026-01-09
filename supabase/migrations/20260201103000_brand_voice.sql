create type if not exists public.brand_voice_tone as enum (
  'professional',
  'friendly',
  'warm',
  'formal'
);

create type if not exists public.brand_voice_language_level as enum (
  'tutoiement',
  'vouvoiement'
);

create table if not exists public.brand_voice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  enabled boolean not null default true,
  tone public.brand_voice_tone not null default 'professional',
  language_level public.brand_voice_language_level not null default 'vouvoiement',
  context text null,
  use_emojis boolean not null default false,
  forbidden_words text[] not null default '{}'::text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.brand_voice enable row level security;

create policy "brand_voice_select_own" on public.brand_voice
  for select using (auth.uid() = user_id);
create policy "brand_voice_insert_own" on public.brand_voice
  for insert with check (auth.uid() = user_id);
create policy "brand_voice_update_own" on public.brand_voice
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brand_voice_delete_own" on public.brand_voice
  for delete using (auth.uid() = user_id);
