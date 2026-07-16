-- Production security hardening. This migration is additive/restrictive only.
-- It must be deployed through the approved migration-history gate; this Run
-- does not apply it to any remote environment.

-- Supabase/Postgres grants EXECUTE on new functions broadly unless default
-- privileges are restricted. Keep future privileged functions closed by
-- default and grant each intended API explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Data API roles never need schema-management capabilities. RLS does not
-- apply to TRUNCATE, while REFERENCES/TRIGGER are also outside normal CRUD.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- A legacy permissive SELECT policy exposed every tenant's cron metadata to
-- any authenticated account and overrode the later user-scoped policy.
drop policy if exists "cron_state_select_auth" on public.cron_state;
drop policy if exists "cron_state_select_own" on public.cron_state;
create policy "cron_state_select_own"
  on public.cron_state
  for select
  to authenticated
  using (user_id = auth.uid());

-- OAuth tokens and state are server credentials. RLS ownership alone is not a
-- safe browser boundary because it would still let each user read or replace
-- their own refresh token through the Data API. Keep only the non-sensitive
-- connection status columns used by Settings/SystemHealth readable.
revoke all on table public.google_connections from anon, authenticated;
grant select (
  id,
  user_id,
  provider,
  created_at,
  updated_at,
  last_synced_at,
  active,
  next_sync_at,
  sync_status
) on table public.google_connections to authenticated;

drop policy if exists "no delete from client" on public.google_connections;
drop policy if exists "no insert from client" on public.google_connections;
drop policy if exists "no update from client" on public.google_connections;
drop policy if exists "read own google connections" on public.google_connections;
drop policy if exists "select own google_connections" on public.google_connections;
drop policy if exists "select_own_google_connections" on public.google_connections;
drop policy if exists "update own google connections" on public.google_connections;
drop policy if exists "update_own_google_connections" on public.google_connections;
drop policy if exists "upsert own google connections" on public.google_connections;
drop policy if exists "upsert_own_google_connections" on public.google_connections;
drop policy if exists "user can read own google connection" on public.google_connections;
drop policy if exists "google_connections_select_safe_own" on public.google_connections;

create policy "google_connections_select_safe_own"
  on public.google_connections
  for select
  to authenticated
  using (user_id = auth.uid());

-- Legal-entity mutations are implemented by /api/settings after tenant
-- authorization. A direct Data API write could otherwise forge logo_path or
-- logo_url and make a service-role renderer fetch a foreign/private object.
-- The browser branding helper only needs this narrow read projection.
revoke all on table public.legal_entities from anon, authenticated;
grant select (
  id,
  business_id,
  is_default,
  company_name,
  legal_name,
  logo_path,
  created_at
) on table public.legal_entities to authenticated;

drop policy if exists "legal_entities_write_own_business" on public.legal_entities;
drop policy if exists "legal_entities_write_own_org" on public.legal_entities;

-- Durable, atomic rate limits are shared by Vercel routes and Edge Functions.
-- Browser roles have no table or RPC access; callers pass an already hashed
-- bucket key so operational metadata does not contain raw IPs or e-mails.
create table if not exists public.security_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_key, window_start),
  constraint security_rate_limits_count_nonnegative
    check (request_count >= 0)
);

create index if not exists security_rate_limits_window_start_idx
  on public.security_rate_limits (window_start);

alter table public.security_rate_limits enable row level security;
revoke all on table public.security_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.security_rate_limits
  to service_role;

create or replace function public.consume_security_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_bucket_key is null
    or length(p_bucket_key) < 16
    or length(p_bucket_key) > 128
    or p_limit < 1
    or p_limit > 100000
    or p_window_seconds < 60
    or p_window_seconds > 2592000
    or p_cost < 1
    or p_cost > p_limit then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
      * p_window_seconds
  );

  delete from public.security_rate_limits
  where window_start < clock_timestamp() - interval '31 days';

  delete from public.security_rate_limits
  where bucket_key = p_bucket_key
    and window_start < v_window_start;

  insert into public.security_rate_limits (
    bucket_key,
    window_start,
    request_count,
    updated_at
  )
  values (
    p_bucket_key,
    v_window_start,
    p_cost,
    clock_timestamp()
  )
  on conflict (bucket_key, window_start)
  do update set
    request_count = public.security_rate_limits.request_count + excluded.request_count,
    updated_at = excluded.updated_at
  where public.security_rate_limits.request_count + excluded.request_count <= p_limit
  returning request_count into v_count;

  return v_count is not null and v_count <= p_limit;
end;
$$;

revoke all on function public.consume_security_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, integer, integer, integer)
  to service_role;

-- Enrollment requests contain no member capability. The random token is sent
-- only by e-mail; only its SHA-256 hash is stored. A successful finalization
-- atomically deletes the request before creating or recovering a membership.
create table if not exists public.loyalty_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null,
  first_name text not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint loyalty_enrollment_requests_first_name_length
    check (char_length(first_name) between 1 and 100),
  constraint loyalty_enrollment_requests_email_length
    check (char_length(email) between 3 and 320),
  constraint loyalty_enrollment_requests_token_hash_length
    check (char_length(token_hash) = 64)
);

create index if not exists loyalty_enrollment_requests_expiry_idx
  on public.loyalty_enrollment_requests (expires_at);

alter table public.loyalty_enrollment_requests enable row level security;
revoke all on table public.loyalty_enrollment_requests
  from public, anon, authenticated;
grant select, insert, update, delete on table public.loyalty_enrollment_requests
  to service_role;

-- Trigger and worker helpers are not public RPC APIs.
revoke execute on function public.audit_draft_changes() from public, anon, authenticated;
revoke execute on function public.enqueue_ai_job_for_review() from public, anon, authenticated;
revoke execute on function public.ensure_monthly_report_email() from public, anon, authenticated;
revoke execute on function public.ensure_user_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_draft_regression() from public, anon, authenticated;
revoke execute on function public.set_monthly_report_idempotency_key() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant execute on function public.ensure_user_profile(uuid, text) to service_role;

-- The self-service wrapper is authenticated, but its inner SECURITY DEFINER
-- helper must never accept a caller-controlled user id from public roles.
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated, service_role;

-- Role predicate: authenticated callers may ask about their own auth.uid(),
-- while anonymous callers must not enumerate role state.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- User-facing inbox RPCs run as invoker and rely on RLS. Remove the implicit
-- anonymous grant and retain only the roles used by the application.
revoke execute on function public.get_inbox_reviews(text, integer, boolean, integer, uuid)
  from public, anon;
revoke execute on function public.get_reviews_to_reply(text, integer, integer, uuid)
  from public, anon;
revoke execute on function public.get_reviews_to_reply(text, integer, integer, uuid, uuid)
  from public, anon;
grant execute on function public.get_inbox_reviews(text, integer, boolean, integer, uuid)
  to authenticated, service_role;
grant execute on function public.get_reviews_to_reply(text, integer, integer, uuid)
  to authenticated, service_role;
grant execute on function public.get_reviews_to_reply(text, integer, integer, uuid, uuid)
  to authenticated, service_role;

-- Analytics helpers are consumed by server workers only. A browser already
-- uses authenticated Vercel routes that enforce user/location ownership.
revoke execute on function public.ai_tag_candidates(uuid, text, timestamptz, uuid, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.ai_tag_candidates_count(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.kpi_summary(text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.kpi_summary(text, timestamptz, timestamptz, numeric, numeric, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.ai_tag_candidates(uuid, text, timestamptz, uuid, integer, boolean)
  to service_role;
grant execute on function public.ai_tag_candidates_count(uuid, text) to service_role;
grant execute on function public.kpi_summary(text, timestamptz, timestamptz) to service_role;
grant execute on function public.kpi_summary(text, timestamptz, timestamptz, numeric, numeric, text, text, text[])
  to service_role;

-- The visit RPC always verifies auth.uid(), but an explicit anonymous grant is
-- unnecessary and obscures the intended trust boundary.
revoke execute on function public.record_loyalty_visit(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.record_loyalty_visit(uuid, text, uuid, text)
  to authenticated, service_role;

-- Loyalty child rows must remain tied to one canonical member scope. Historical
-- policies checked the program but not member_id, so a forged cross-tenant
-- member reference could later be dereferenced by a service-role Wallet route.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_programs_scope_unique'
      and conrelid = 'public.loyalty_programs'::regclass
  ) then
    alter table public.loyalty_programs
      add constraint loyalty_programs_scope_unique
      unique (id, user_id, location_id);
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_members_scope_unique'
      and conrelid = 'public.loyalty_members'::regclass
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_scope_unique
      unique (id, program_id, user_id, location_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_members_program_scope_fk'
      and conrelid = 'public.loyalty_members'::regclass
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_program_scope_fk
      foreign key (program_id, user_id, location_id)
      references public.loyalty_programs (id, user_id, location_id)
      on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_visits_member_scope_fk'
      and conrelid = 'public.loyalty_visits'::regclass
  ) then
    alter table public.loyalty_visits
      add constraint loyalty_visits_member_scope_fk
      foreign key (member_id, program_id, user_id, location_id)
      references public.loyalty_members (id, program_id, user_id, location_id)
      on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_rewards_member_scope_fk'
      and conrelid = 'public.loyalty_rewards'::regclass
  ) then
    alter table public.loyalty_rewards
      add constraint loyalty_rewards_member_scope_fk
      foreign key (member_id, program_id, user_id, location_id)
      references public.loyalty_members (id, program_id, user_id, location_id)
      on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallet_passes_member_scope_fk'
      and conrelid = 'public.wallet_passes'::regclass
  ) then
    alter table public.wallet_passes
      add constraint wallet_passes_member_scope_fk
      foreign key (member_id, program_id, user_id, location_id)
      references public.loyalty_members (id, program_id, user_id, location_id)
      on delete cascade;
  end if;
end;
$$;

revoke insert on table public.loyalty_visits from authenticated;
revoke insert, update, delete on table public.loyalty_rewards from authenticated;
revoke all on table public.wallet_passes from authenticated;

drop policy if exists loyalty_visits_select_own on public.loyalty_visits;
create policy loyalty_visits_select_own
on public.loyalty_visits
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_visits.member_id
      and lm.program_id = loyalty_visits.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_visits.location_id
  )
);

drop policy if exists loyalty_visits_insert_own on public.loyalty_visits;
create policy loyalty_visits_insert_own
on public.loyalty_visits
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_visits.member_id
      and lm.program_id = loyalty_visits.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_visits.location_id
  )
);

drop policy if exists loyalty_rewards_select_own on public.loyalty_rewards;
create policy loyalty_rewards_select_own
on public.loyalty_rewards
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_rewards.member_id
      and lm.program_id = loyalty_rewards.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_rewards.location_id
  )
);

drop policy if exists loyalty_rewards_insert_own on public.loyalty_rewards;
create policy loyalty_rewards_insert_own
on public.loyalty_rewards
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_rewards.member_id
      and lm.program_id = loyalty_rewards.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_rewards.location_id
  )
);

drop policy if exists loyalty_rewards_update_own on public.loyalty_rewards;
create policy loyalty_rewards_update_own
on public.loyalty_rewards
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_rewards.member_id
      and lm.program_id = loyalty_rewards.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_rewards.location_id
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_rewards.member_id
      and lm.program_id = loyalty_rewards.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_rewards.location_id
  )
);

drop policy if exists loyalty_rewards_delete_own on public.loyalty_rewards;
create policy loyalty_rewards_delete_own
on public.loyalty_rewards
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = loyalty_rewards.member_id
      and lm.program_id = loyalty_rewards.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = loyalty_rewards.location_id
  )
);

drop policy if exists wallet_passes_select_own on public.wallet_passes;
create policy wallet_passes_select_own
on public.wallet_passes
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = wallet_passes.member_id
      and lm.program_id = wallet_passes.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = wallet_passes.location_id
  )
);

drop policy if exists wallet_passes_insert_own on public.wallet_passes;
create policy wallet_passes_insert_own
on public.wallet_passes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = wallet_passes.member_id
      and lm.program_id = wallet_passes.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = wallet_passes.location_id
  )
);

drop policy if exists wallet_passes_update_own on public.wallet_passes;
create policy wallet_passes_update_own
on public.wallet_passes
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = wallet_passes.member_id
      and lm.program_id = wallet_passes.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = wallet_passes.location_id
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = wallet_passes.member_id
      and lm.program_id = wallet_passes.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = wallet_passes.location_id
  )
);

drop policy if exists wallet_passes_delete_own on public.wallet_passes;
create policy wallet_passes_delete_own
on public.wallet_passes
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_members lm
    where lm.id = wallet_passes.member_id
      and lm.program_id = wallet_passes.program_id
      and lm.user_id = auth.uid()
      and lm.location_id = wallet_passes.location_id
  )
);

-- Membership creation/recovery is server-only and may run only after the
-- caller proved possession of the enrollment e-mail. It intentionally returns
-- an existing membership after verification so recovery and creation share
-- the same post-verification flow.
create or replace function public.join_loyalty_program(
  p_public_token uuid,
  p_first_name text,
  p_email text
)
returns table (
  member_id uuid,
  member_code text,
  qr_token uuid,
  wallet_public_token uuid,
  points_balance integer,
  visits_count integer,
  program_name text,
  points_per_visit integer,
  reward_threshold_points integer,
  reward_label text,
  location_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_program record;
  v_member public.loyalty_members%rowtype;
  v_wallet public.wallet_passes%rowtype;
  v_first_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_code text;
  v_attempts integer := 0;
begin
  select
    lp.id as program_id,
    lp.user_id,
    lp.location_id,
    lp.name,
    lp.points_per_visit,
    lp.reward_threshold_points,
    lp.reward_label,
    coalesce(gl.location_title, gl.location_resource_name) as location_name
  into v_program
  from public.loyalty_programs lp
  join public.google_locations gl on gl.id = lp.location_id
  where lp.public_token = p_public_token
    and lp.is_enabled = true
  limit 1;

  if v_program.program_id is null then
    raise exception 'loyalty_program_not_found';
  end if;
  if v_first_name is null then
    raise exception 'first_name_required';
  end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'valid_email_required';
  end if;

  select lm.*
  into v_member
  from public.loyalty_members lm
  where lm.program_id = v_program.program_id
    and lower(lm.email) = v_email
  limit 1;

  if v_member.id is null then
    loop
      v_attempts := v_attempts + 1;
      v_code := 'EG' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      begin
        insert into public.loyalty_members (
          program_id,
          user_id,
          location_id,
          first_name,
          email,
          member_code
        )
        values (
          v_program.program_id,
          v_program.user_id,
          v_program.location_id,
          v_first_name,
          v_email,
          v_code
        )
        returning * into v_member;
        exit;
      exception
        when unique_violation then
          select existing_member.*
          into v_member
          from public.loyalty_members existing_member
          where existing_member.program_id = v_program.program_id
            and lower(existing_member.email) = v_email
          limit 1;
          if v_member.id is not null then
            exit;
          end if;
          if v_attempts >= 5 then
            raise;
          end if;
      end;
    end loop;
  end if;

  insert into public.wallet_passes (
    program_id,
    member_id,
    user_id,
    location_id,
    provider,
    status,
    payload
  )
  values (
    v_member.program_id,
    v_member.id,
    v_member.user_id,
    v_member.location_id,
    'generic',
    'ready',
    jsonb_build_object(
      'member_code', v_member.member_code,
      'qr_token', v_member.qr_token,
      'program_name', v_program.name
    )
  )
  on conflict on constraint wallet_passes_member_provider_unique
  do update set
    status = 'ready',
    payload = excluded.payload,
    updated_at = now()
  returning * into v_wallet;

  return query
  select
    v_member.id,
    v_member.member_code,
    v_member.qr_token,
    v_wallet.public_token,
    v_member.points_balance,
    v_member.visits_count,
    v_program.name,
    v_program.points_per_visit,
    v_program.reward_threshold_points,
    v_program.reward_label,
    v_program.location_name;
end;
$$;

revoke all on function public.join_loyalty_program(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.join_loyalty_program(uuid, text, text)
  to service_role;

create or replace function public.finalize_loyalty_enrollment(
  p_token_hash text
)
returns table (
  member_id uuid,
  member_code text,
  qr_token uuid,
  wallet_public_token uuid,
  points_balance integer,
  visits_count integer,
  program_name text,
  points_per_visit integer,
  reward_threshold_points integer,
  reward_label text,
  location_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.loyalty_enrollment_requests%rowtype;
begin
  delete from public.loyalty_enrollment_requests
  where token_hash = p_token_hash
    and expires_at > clock_timestamp()
  returning * into v_request;

  if v_request.id is null then
    raise exception 'invalid_or_expired_enrollment_token';
  end if;

  return query
  select *
  from public.join_loyalty_program(
    v_request.public_token,
    v_request.first_name,
    v_request.email
  );
end;
$$;

revoke all on function public.finalize_loyalty_enrollment(text)
  from public, anon, authenticated;
grant execute on function public.finalize_loyalty_enrollment(text)
  to service_role;

-- Production metadata previously showed this bucket as public. Create it when
-- absent (for reproducible bootstrap), otherwise preserve its objects and
-- converge the security settings. The API serves short-lived signed URLs.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'brand-assets',
  'brand-assets',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
