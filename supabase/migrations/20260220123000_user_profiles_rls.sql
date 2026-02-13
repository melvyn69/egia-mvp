-- Enable RLS on user_profiles (idempotent)
alter table public.user_profiles enable row level security;

-- Reduce exposure for client keys
revoke all on public.user_profiles from anon, authenticated;

-- Read own profile
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

-- Update own profile (no insert policy; service_role bypasses RLS)
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Insert own profile
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);
