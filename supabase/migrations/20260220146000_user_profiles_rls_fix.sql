-- 1) RLS + grants (safe)
alter table public.user_profiles enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.user_profiles to authenticated;

-- 2) Ensure unique(user_id) for upsert onConflict(user_id)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_user_id_key'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_user_id_key unique (user_id);
  end if;
end$$;

-- 3) Drop policies if they exist
Drop policy if exists "user_profiles_select_own" on public.user_profiles;
Drop policy if exists "user_profiles_insert_own" on public.user_profiles;
Drop policy if exists "user_profiles_update_own" on public.user_profiles;

-- 4) Recreate policies
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
