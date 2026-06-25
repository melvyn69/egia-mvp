-- Allow the loyalty scanner to resolve Apple Wallet public tokens.

create or replace function public.record_loyalty_visit(
  p_location_id uuid,
  p_member_code text default null,
  p_qr_token uuid default null,
  p_idempotency_key text default null
)
returns table (
  member_id uuid,
  member_code text,
  points_balance integer,
  lifetime_points integer,
  visits_count integer,
  points_added integer,
  reward_available boolean,
  reward_id uuid,
  reward_label text,
  duplicate_scan boolean,
  last_visit_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_program public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_recent_visit public.loyalty_visits%rowtype;
  v_existing_reward public.loyalty_rewards%rowtype;
  v_new_reward public.loyalty_rewards%rowtype;
  v_member_code text := upper(nullif(btrim(coalesce(p_member_code, '')), ''));
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_next_balance integer;
  v_unlock_reward boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select lp.*
  into v_program
  from public.loyalty_programs lp
  where lp.user_id = v_user_id
    and lp.location_id = p_location_id
    and lp.is_enabled = true
  limit 1;

  if v_program.id is null then
    raise exception 'loyalty_program_not_found';
  end if;

  if v_member_code is null and p_qr_token is null then
    raise exception 'member_identifier_required';
  end if;

  select lm.*
  into v_member
  from public.loyalty_members lm
  where lm.program_id = v_program.id
    and lm.status = 'active'
    and (
      (p_qr_token is not null and lm.qr_token = p_qr_token)
      or (v_member_code is not null and upper(lm.member_code) = v_member_code)
      or (
        p_qr_token is not null
        and exists (
          select 1
          from public.wallet_passes wp
          where wp.member_id = lm.id
            and wp.program_id = v_program.id
            and wp.public_token = p_qr_token
            and wp.status in ('ready', 'active')
        )
      )
    )
  order by lm.created_at asc
  limit 1
  for update;

  if v_member.id is null then
    raise exception 'loyalty_member_not_found';
  end if;

  if v_idempotency_key is not null then
    select lv.*
    into v_recent_visit
    from public.loyalty_visits lv
    where lv.member_id = v_member.id
      and lv.idempotency_key = v_idempotency_key
    order by lv.created_at desc
    limit 1;
  end if;

  if v_recent_visit.id is null then
    select lv.*
    into v_recent_visit
    from public.loyalty_visits lv
    where lv.member_id = v_member.id
      and lv.created_at >= now() - interval '90 seconds'
    order by lv.created_at desc
    limit 1;
  end if;

  select lr.*
  into v_existing_reward
  from public.loyalty_rewards lr
  where lr.member_id = v_member.id
    and lr.status = 'available'
  order by lr.unlocked_at desc
  limit 1;

  if v_recent_visit.id is not null then
    return query
    select
      v_member.id,
      v_member.member_code,
      v_member.points_balance,
      v_member.lifetime_points,
      v_member.visits_count,
      0,
      v_existing_reward.id is not null,
      v_existing_reward.id,
      coalesce(v_existing_reward.reward_label, v_program.reward_label),
      true,
      v_member.last_visit_at;
    return;
  end if;

  v_next_balance := v_member.points_balance + v_program.points_per_visit;
  v_unlock_reward :=
    v_existing_reward.id is null
    and v_next_balance >= v_program.reward_threshold_points;

  if v_unlock_reward then
    v_next_balance := v_next_balance - v_program.reward_threshold_points;
  end if;

  insert into public.loyalty_visits (
    program_id,
    member_id,
    user_id,
    location_id,
    points_added,
    scan_source,
    idempotency_key,
    recorded_by
  )
  values (
    v_program.id,
    v_member.id,
    v_user_id,
    v_program.location_id,
    v_program.points_per_visit,
    'scanner',
    v_idempotency_key,
    v_user_id
  );

  update public.loyalty_members lm
  set
    points_balance = v_next_balance,
    lifetime_points = lm.lifetime_points + v_program.points_per_visit,
    visits_count = lm.visits_count + 1,
    last_visit_at = now(),
    updated_at = now()
  where lm.id = v_member.id
  returning * into v_member;

  if v_unlock_reward then
    insert into public.loyalty_rewards (
      program_id,
      member_id,
      user_id,
      location_id,
      threshold_points,
      reward_label,
      status
    )
    values (
      v_program.id,
      v_member.id,
      v_user_id,
      v_program.location_id,
      v_program.reward_threshold_points,
      v_program.reward_label,
      'available'
    )
    on conflict do nothing
    returning * into v_new_reward;

    if v_new_reward.id is null then
      select lr.*
      into v_new_reward
      from public.loyalty_rewards lr
      where lr.member_id = v_member.id
        and lr.status = 'available'
      order by lr.unlocked_at desc
      limit 1;
    end if;
  else
    v_new_reward := v_existing_reward;
  end if;

  return query
  select
    v_member.id,
    v_member.member_code,
    v_member.points_balance,
    v_member.lifetime_points,
    v_member.visits_count,
    v_program.points_per_visit,
    v_new_reward.id is not null,
    v_new_reward.id,
    coalesce(v_new_reward.reward_label, v_program.reward_label),
    false,
    v_member.last_visit_at;
end;
$$;

grant execute on function public.record_loyalty_visit(uuid, text, uuid, text)
  to authenticated, service_role;
