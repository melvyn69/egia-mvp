-- Table pour stocker les tokens Google (Business Profile etc.)
create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',

  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, provider)
);

alter table public.google_connections enable row level security;

-- RLS: l'utilisateur ne voit que ses lignes
create policy "select_own_google_connections"
on public.google_connections
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert_own_google_connections"
on public.google_connections
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update_own_google_connections"
on public.google_connections
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete_own_google_connections"
on public.google_connections
for delete
to authenticated
using (auth.uid() = user_id);
create table if not exists google_connections (
  user_id uuid not null,
  provider text not null,
  access_token text,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  primary key (user_id, provider)
);
