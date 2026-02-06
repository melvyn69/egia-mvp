do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_conditions'
      and column_name = 'label'
  ) then
    alter table public.automation_conditions
      add column label text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_conditions'
      and column_name = 'value_jsonb'
  ) then
    alter table public.automation_conditions
      add column value_jsonb jsonb;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_actions'
      and column_name = 'action_type'
  ) then
    alter table public.automation_actions
      add column action_type text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_actions'
      and column_name = 'params'
  ) then
    alter table public.automation_actions
      add column params jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automation_actions'
      and column_name = 'label'
  ) then
    alter table public.automation_actions
      add column label text;
  end if;
end $$;

update public.automation_actions
set action_type = coalesce(action_type, type)
where action_type is null;

update public.automation_actions
set params = coalesce(params, config)
where params is null;
