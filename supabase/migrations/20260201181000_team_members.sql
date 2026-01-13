create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  role text null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists team_members_user_id_idx
  on public.team_members (user_id);

alter table public.team_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_members'
      and policyname = 'team_members_select_own'
  ) then
    create policy "team_members_select_own"
      on public.team_members
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_members'
      and policyname = 'team_members_insert_own'
  ) then
    create policy "team_members_insert_own"
      on public.team_members
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_members'
      and policyname = 'team_members_update_own'
  ) then
    create policy "team_members_update_own"
      on public.team_members
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_members'
      and policyname = 'team_members_delete_own'
  ) then
    create policy "team_members_delete_own"
      on public.team_members
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.team_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.team_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_settings'
      and policyname = 'team_settings_select_own'
  ) then
    create policy "team_settings_select_own"
      on public.team_settings
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_settings'
      and policyname = 'team_settings_insert_own'
  ) then
    create policy "team_settings_insert_own"
      on public.team_settings
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_settings'
      and policyname = 'team_settings_update_own'
  ) then
    create policy "team_settings_update_own"
      on public.team_settings
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_settings'
      and policyname = 'team_settings_delete_own'
  ) then
    create policy "team_settings_delete_own"
      on public.team_settings
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
