-- Ensure RLS and grants (client read/update only)
alter table public.user_profiles enable row level security;

grant usage on schema public to authenticated;
grant select, update on table public.user_profiles to authenticated;
revoke insert on table public.user_profiles from authenticated;

-- Ensure unique(user_id)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.user_profiles'::regclass
      and c.contype in ('p', 'u')
      and a.attname = 'user_id'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_user_id_key unique (user_id);
  end if;
end$$;

-- Reset policies (no insert policy)
drop policy if exists "user_profiles_select_own" on public.user_profiles;
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
drop policy if exists "user_profiles_update_own" on public.user_profiles;

create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Create/ensure profile via SECURITY DEFINER
create or replace function public.ensure_user_profile(
  p_user_id uuid,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if p_user_id is null then
    return;
  end if;

  if p_email is null then
    select email into v_email from auth.users where id = p_user_id;
  else
    v_email := p_email;
  end if;

  insert into public.user_profiles (user_id, email, created_at, updated_at)
  values (p_user_id, v_email, now(), now())
  on conflict (user_id) do update
    set email = coalesce(public.user_profiles.email, excluded.email),
        updated_at = now();
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_user_profile(new.id, new.email);
  return new;
end;
$$;

-- Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Optional callable ensure_profile (for existing users)
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform public.ensure_user_profile(auth.uid(), null);
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
