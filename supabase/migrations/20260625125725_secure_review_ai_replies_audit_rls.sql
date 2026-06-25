do $$
declare
  has_user_id boolean;
  has_business_id boolean;
  has_business_settings_owner boolean;
  has_team_members_business boolean;
  has_team_members_auth_user boolean;
  has_team_members_user boolean;
  select_predicate text := '';
begin
  if to_regclass('public.review_ai_replies_audit') is null then
    raise notice 'public.review_ai_replies_audit does not exist in this schema; skipping RLS hardening.';
    return;
  end if;

  alter table public.review_ai_replies_audit enable row level security;

  revoke all on table public.review_ai_replies_audit from anon;
  revoke insert, update, delete on table public.review_ai_replies_audit from authenticated;
  grant select on table public.review_ai_replies_audit to authenticated;
  grant select, insert, update, delete on table public.review_ai_replies_audit to service_role;

  drop policy if exists review_ai_replies_audit_select_own
    on public.review_ai_replies_audit;
  drop policy if exists review_ai_replies_audit_select_business_member
    on public.review_ai_replies_audit;
  drop policy if exists review_ai_replies_audit_select_owner_or_business_member
    on public.review_ai_replies_audit;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_ai_replies_audit'
      and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_ai_replies_audit'
      and column_name = 'business_id'
  ) into has_business_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_settings'
      and column_name = 'business_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_settings'
      and column_name = 'user_id'
  ) into has_business_settings_owner;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_members'
      and column_name = 'business_id'
  ) into has_team_members_business;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_members'
      and column_name = 'auth_user_id'
  ) into has_team_members_auth_user;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_members'
      and column_name = 'user_id'
  ) into has_team_members_user;

  if has_user_id then
    select_predicate := 'user_id = (select auth.uid())';
  end if;

  if has_business_id and has_business_settings_owner then
    select_predicate := concat_ws(
      ' or ',
      nullif(select_predicate, ''),
      'exists (
        select 1
        from public.business_settings bs
        where bs.business_id = review_ai_replies_audit.business_id
          and bs.user_id = (select auth.uid())
      )'
    );
  end if;

  if has_business_id and has_team_members_business and has_team_members_auth_user then
    select_predicate := concat_ws(
      ' or ',
      nullif(select_predicate, ''),
      'exists (
        select 1
        from public.team_members tm
        where tm.business_id = review_ai_replies_audit.business_id
          and tm.auth_user_id = (select auth.uid())
          and coalesce(tm.is_active, true)
      )'
    );
  elsif has_business_id and has_team_members_business and has_team_members_user then
    select_predicate := concat_ws(
      ' or ',
      nullif(select_predicate, ''),
      'exists (
        select 1
        from public.team_members tm
        where tm.business_id = review_ai_replies_audit.business_id
          and tm.user_id = (select auth.uid())
          and coalesce(tm.is_active, true)
      )'
    );
  end if;

  if select_predicate <> '' then
    execute format(
      'create policy review_ai_replies_audit_select_owner_or_business_member
       on public.review_ai_replies_audit
       for select
       to authenticated
       using (%s)',
      select_predicate
    );
  else
    raise warning 'RLS enabled on public.review_ai_replies_audit, but no ownership column was found; no authenticated SELECT policy was created.';
  end if;

  if has_user_id then
    create index if not exists review_ai_replies_audit_user_id_idx
      on public.review_ai_replies_audit (user_id);
  end if;

  if has_business_id then
    create index if not exists review_ai_replies_audit_business_id_idx
      on public.review_ai_replies_audit (business_id);
  end if;
end $$;

-- Manual verification after applying this migration:
-- select relrowsecurity from pg_class where relname = 'review_ai_replies_audit';
