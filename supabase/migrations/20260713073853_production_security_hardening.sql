-- Production security hardening. This migration is additive/restrictive only.
-- It must be deployed through the approved migration-history gate; this Run
-- does not apply it to any remote environment.

-- Supabase/Postgres grants EXECUTE on new functions broadly unless default
-- privileges are restricted. Keep future privileged functions closed by
-- default and grant each intended API explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

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

-- Public enrollment is intentionally anonymous, but a repeated call used to
-- return the existing member code, QR token and Wallet capability to anyone
-- who guessed an email address. Existing memberships now fail without being
-- modified or disclosed; only the first successful enrollment returns tokens.
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

  if v_member.id is not null then
    raise exception 'loyalty_member_already_registered';
  end if;

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
        if exists (
          select 1
          from public.loyalty_members existing_member
          where existing_member.program_id = v_program.program_id
            and lower(existing_member.email) = v_email
        ) then
          raise exception 'loyalty_member_already_registered';
        end if;
        if v_attempts >= 5 then
          raise;
        end if;
    end;
  end loop;

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

revoke all on function public.join_loyalty_program(uuid, text, text) from public;
grant execute on function public.join_loyalty_program(uuid, text, text)
  to anon, authenticated, service_role;

-- Production metadata previously showed this bucket as public. The API serves
-- short-lived signed URLs, so public listing/access is not required.
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[]
where id = 'brand-assets';
