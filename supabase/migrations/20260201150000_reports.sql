create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  locations text[] not null,
  period_preset text null,
  from_date timestamptz null,
  to_date timestamptz null,
  timezone text not null default 'Europe/Paris',
  status text not null default 'draft',
  storage_path text null,
  last_generated_at timestamptz null,
  schedule_enabled boolean not null default false,
  schedule_rrule text null,
  recipients text[] null,
  notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists reports_user_id_idx
  on public.reports (user_id);

alter table public.reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_select_own'
  ) then
    create policy "reports_select_own"
      on public.reports
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
      and tablename = 'reports'
      and policyname = 'reports_insert_own'
  ) then
    create policy "reports_insert_own"
      on public.reports
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
      and tablename = 'reports'
      and policyname = 'reports_update_own'
  ) then
    create policy "reports_update_own"
      on public.reports
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
      and tablename = 'reports'
      and policyname = 'reports_delete_own'
  ) then
    create policy "reports_delete_own"
      on public.reports
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'reports_objects_select_own'
  ) then
    create policy "reports_objects_select_own"
      on storage.objects
      for select
      using (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'reports_objects_insert_own'
  ) then
    create policy "reports_objects_insert_own"
      on storage.objects
      for insert
      with check (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'reports_objects_update_own'
  ) then
    create policy "reports_objects_update_own"
      on storage.objects
      for update
      using (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'reports_objects_delete_own'
  ) then
    create policy "reports_objects_delete_own"
      on storage.objects
      for delete
      using (
        bucket_id = 'reports'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
