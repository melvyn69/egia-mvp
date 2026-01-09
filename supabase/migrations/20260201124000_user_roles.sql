create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff',
  created_at timestamptz default now()
);

alter table public.user_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_select_own'
  ) then
    create policy "user_roles_select_own"
      on public.user_roles
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_insert_own'
  ) then
    drop policy "brand_voice_insert_own" on public.brand_voice;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_update_own'
  ) then
    drop policy "brand_voice_update_own" on public.brand_voice;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_delete_own'
  ) then
    drop policy "brand_voice_delete_own" on public.brand_voice;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_insert_admin'
  ) then
    create policy "brand_voice_insert_admin"
      on public.brand_voice
      for insert
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.user_roles roles
          where roles.user_id = auth.uid()
            and roles.role = 'admin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_update_admin'
  ) then
    create policy "brand_voice_update_admin"
      on public.brand_voice
      for update
      using (
        auth.uid() = user_id
        and exists (
          select 1
          from public.user_roles roles
          where roles.user_id = auth.uid()
            and roles.role = 'admin'
        )
      )
      with check (
        auth.uid() = user_id
        and exists (
          select 1
          from public.user_roles roles
          where roles.user_id = auth.uid()
            and roles.role = 'admin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_voice'
      and policyname = 'brand_voice_delete_admin'
  ) then
    create policy "brand_voice_delete_admin"
      on public.brand_voice
      for delete
      using (
        auth.uid() = user_id
        and exists (
          select 1
          from public.user_roles roles
          where roles.user_id = auth.uid()
            and roles.role = 'admin'
        )
      );
  end if;
end $$;
