create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  invited_by uuid not null,
  email text not null,
  first_name text null,
  role text not null default 'editor',
  receive_monthly_reports boolean not null default false,
  token text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz null
);

create index if not exists team_invitations_owner_status_idx
  on public.team_invitations (owner_user_id, status);

create index if not exists team_invitations_email_status_idx
  on public.team_invitations (email, status);

create unique index if not exists team_invitations_owner_email_status_idx
  on public.team_invitations (owner_user_id, email, status);

alter table public.team_invitations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_invitations'
      and policyname = 'team_invitations_owner_select'
  ) then
    create policy "team_invitations_owner_select"
      on public.team_invitations
      for select
      using (auth.uid() = owner_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_invitations'
      and policyname = 'team_invitations_owner_insert'
  ) then
    create policy "team_invitations_owner_insert"
      on public.team_invitations
      for insert
      with check (auth.uid() = owner_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_invitations'
      and policyname = 'team_invitations_owner_update'
  ) then
    create policy "team_invitations_owner_update"
      on public.team_invitations
      for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_invitations'
      and policyname = 'team_invitations_owner_delete'
  ) then
    create policy "team_invitations_owner_delete"
      on public.team_invitations
      for delete
      using (auth.uid() = owner_user_id);
  end if;
end $$;

alter table public.team_members
  add column if not exists auth_user_id uuid null;

alter table public.team_members
  add column if not exists email text null;

create index if not exists team_members_auth_user_id_idx
  on public.team_members (auth_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'team_members'
      and policyname = 'team_members_auth_select'
  ) then
    create policy "team_members_auth_select"
      on public.team_members
      for select
      using (auth.uid() = auth_user_id);
  end if;
end $$;
