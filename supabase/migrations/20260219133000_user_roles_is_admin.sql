-- Add role column if missing
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'role'
  ) then
    alter table public.user_roles
      add column role text not null default 'staff';
  end if;
end $$;

-- is_admin helper
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;
