-- Fix public loyalty signup wallet upsert ambiguity.

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
set search_path = public
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
  else
    update public.loyalty_members lm
    set
      first_name = v_first_name,
      status = 'active',
      updated_at = now()
    where lm.id = v_member.id
    returning * into v_member;
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

revoke all on function public.join_loyalty_program(uuid, text, text) from public;

grant execute on function public.join_loyalty_program(uuid, text, text)
  to anon, authenticated, service_role;
