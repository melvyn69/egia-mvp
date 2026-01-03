create table if not exists public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists google_oauth_states_state_idx
  on public.google_oauth_states (state);

create index if not exists google_oauth_states_user_id_idx
  on public.google_oauth_states (user_id);
