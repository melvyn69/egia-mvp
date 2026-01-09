do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'brand_voice_tone'
      and n.nspname = 'public'
  ) then
    create type public.brand_voice_tone as enum (
      'professional',
      'friendly',
      'warm',
      'formal'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'brand_voice_language_level'
      and n.nspname = 'public'
  ) then
    create type public.brand_voice_language_level as enum (
      'tutoiement',
      'vouvoiement'
    );
  end if;
end $$;

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_select_own'
  ) then
    create policy "brand_voice_select_own" on public.brand_voice
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_insert_own'
  ) then
    create policy "brand_voice_insert_own" on public.brand_voice
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_update_own'
  ) then
    create policy "brand_voice_update_own" on public.brand_voice
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_delete_own'
  ) then
    create policy "brand_voice_delete_own" on public.brand_voice
      for delete using (auth.uid() = user_id);
  end if;
end $$;
