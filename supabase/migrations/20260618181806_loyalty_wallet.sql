-- Loyalty Wallet MVP
-- Scope: simple visit-based loyalty, no payment, no ordering, no POS, no marketing.

create unique index if not exists google_locations_id_user_id_uidx
  on public.google_locations (id, user_id);

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.google_locations(id) on delete cascade,
  is_enabled boolean not null default false,
  name text not null default 'Programme fidelite',
  points_per_visit integer not null default 10,
  reward_threshold_points integer not null default 100,
  reward_label text not null default 'Recompense disponible',
  public_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_programs_points_per_visit_positive
    check (points_per_visit > 0),
  constraint loyalty_programs_reward_threshold_positive
    check (reward_threshold_points > 0),
  constraint loyalty_programs_user_location_unique
    unique (user_id, location_id),
  constraint loyalty_programs_public_token_unique
    unique (public_token)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_programs_location_owner_fk'
      and conrelid = 'public.loyalty_programs'::regclass
  ) then
    alter table public.loyalty_programs
      add constraint loyalty_programs_location_owner_fk
      foreign key (location_id, user_id)
      references public.google_locations (id, user_id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.google_locations(id) on delete cascade,
  first_name text not null,
  email text not null,
  member_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  qr_token uuid not null default gen_random_uuid(),
  points_balance integer not null default 0,
  lifetime_points integer not null default 0,
  visits_count integer not null default 0,
  last_visit_at timestamptz null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_members_points_balance_nonnegative
    check (points_balance >= 0),
  constraint loyalty_members_lifetime_points_nonnegative
    check (lifetime_points >= 0),
  constraint loyalty_members_visits_count_nonnegative
    check (visits_count >= 0),
  constraint loyalty_members_status_check
    check (status in ('active', 'archived')),
  constraint loyalty_members_member_code_unique
    unique (member_code),
  constraint loyalty_members_qr_token_unique
    unique (qr_token)
);

create unique index if not exists loyalty_members_program_email_uidx
  on public.loyalty_members (program_id, lower(email));

create table if not exists public.loyalty_visits (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.google_locations(id) on delete cascade,
  points_added integer not null,
  scan_source text not null default 'scanner',
  idempotency_key text null,
  recorded_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_visits_points_added_positive
    check (points_added > 0),
  constraint loyalty_visits_scan_source_check
    check (scan_source in ('scanner', 'manual', 'public', 'system'))
);

create unique index if not exists loyalty_visits_member_id_idempotency_uidx
  on public.loyalty_visits (member_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.google_locations(id) on delete cascade,
  threshold_points integer not null,
  reward_label text not null,
  status text not null default 'available',
  unlocked_at timestamptz not null default now(),
  redeemed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_rewards_threshold_positive
    check (threshold_points > 0),
  constraint loyalty_rewards_status_check
    check (status in ('available', 'redeemed', 'expired', 'cancelled'))
);

create unique index if not exists loyalty_rewards_one_available_per_member_uidx
  on public.loyalty_rewards (member_id)
  where status = 'available';

create table if not exists public.wallet_passes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.google_locations(id) on delete cascade,
  provider text not null default 'generic',
  status text not null default 'ready',
  serial_number text not null default replace(gen_random_uuid()::text, '-', ''),
  public_token uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_passes_provider_check
    check (provider in ('generic', 'apple', 'google')),
  constraint wallet_passes_status_check
    check (status in ('ready', 'active', 'disabled', 'revoked')),
  constraint wallet_passes_member_provider_unique
    unique (member_id, provider),
  constraint wallet_passes_serial_number_unique
    unique (serial_number),
  constraint wallet_passes_public_token_unique
    unique (public_token)
);

create index if not exists loyalty_programs_location_id_idx
  on public.loyalty_programs (location_id);
create index if not exists loyalty_programs_user_location_idx
  on public.loyalty_programs (user_id, location_id);

create index if not exists loyalty_members_location_id_idx
  on public.loyalty_members (location_id);
create index if not exists loyalty_members_user_location_idx
  on public.loyalty_members (user_id, location_id);
create index if not exists loyalty_members_program_id_idx
  on public.loyalty_members (program_id);
create index if not exists loyalty_members_member_code_idx
  on public.loyalty_members (member_code);

create index if not exists loyalty_visits_location_id_idx
  on public.loyalty_visits (location_id);
create index if not exists loyalty_visits_member_created_idx
  on public.loyalty_visits (member_id, created_at desc);
create index if not exists loyalty_visits_user_location_created_idx
  on public.loyalty_visits (user_id, location_id, created_at desc);

create index if not exists loyalty_rewards_location_id_idx
  on public.loyalty_rewards (location_id);
create index if not exists loyalty_rewards_member_status_idx
  on public.loyalty_rewards (member_id, status);
create index if not exists loyalty_rewards_user_location_status_idx
  on public.loyalty_rewards (user_id, location_id, status);

create index if not exists wallet_passes_location_id_idx
  on public.wallet_passes (location_id);
create index if not exists wallet_passes_member_id_idx
  on public.wallet_passes (member_id);

drop trigger if exists trg_loyalty_programs_updated_at on public.loyalty_programs;
create trigger trg_loyalty_programs_updated_at
before update on public.loyalty_programs
for each row execute function public.set_updated_at();

drop trigger if exists trg_loyalty_members_updated_at on public.loyalty_members;
create trigger trg_loyalty_members_updated_at
before update on public.loyalty_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_loyalty_rewards_updated_at on public.loyalty_rewards;
create trigger trg_loyalty_rewards_updated_at
before update on public.loyalty_rewards
for each row execute function public.set_updated_at();

drop trigger if exists trg_wallet_passes_updated_at on public.wallet_passes;
create trigger trg_wallet_passes_updated_at
before update on public.wallet_passes
for each row execute function public.set_updated_at();

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_visits enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.wallet_passes enable row level security;

grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.loyalty_programs from anon;
revoke all on table public.loyalty_members from anon;
revoke all on table public.loyalty_visits from anon;
revoke all on table public.loyalty_rewards from anon;
revoke all on table public.wallet_passes from anon;

grant select, insert, update, delete
  on table public.loyalty_programs,
           public.loyalty_members,
           public.loyalty_rewards,
           public.wallet_passes
  to authenticated;

grant select, insert
  on table public.loyalty_visits
  to authenticated;

grant select, insert, update, delete
  on table public.loyalty_programs,
           public.loyalty_members,
           public.loyalty_visits,
           public.loyalty_rewards,
           public.wallet_passes
  to service_role;

drop policy if exists loyalty_programs_select_own on public.loyalty_programs;
create policy loyalty_programs_select_own
on public.loyalty_programs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_programs_insert_own on public.loyalty_programs;
create policy loyalty_programs_insert_own
on public.loyalty_programs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.google_locations gl
    where gl.id = loyalty_programs.location_id
      and gl.user_id = auth.uid()
  )
);

drop policy if exists loyalty_programs_update_own on public.loyalty_programs;
create policy loyalty_programs_update_own
on public.loyalty_programs
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.google_locations gl
    where gl.id = loyalty_programs.location_id
      and gl.user_id = auth.uid()
  )
);

drop policy if exists loyalty_programs_delete_own on public.loyalty_programs;
create policy loyalty_programs_delete_own
on public.loyalty_programs
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_members_select_own on public.loyalty_members;
create policy loyalty_members_select_own
on public.loyalty_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_members_insert_own on public.loyalty_members;
create policy loyalty_members_insert_own
on public.loyalty_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = loyalty_members.program_id
      and lp.user_id = auth.uid()
      and lp.location_id = loyalty_members.location_id
  )
);

drop policy if exists loyalty_members_update_own on public.loyalty_members;
create policy loyalty_members_update_own
on public.loyalty_members
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = loyalty_members.program_id
      and lp.user_id = auth.uid()
      and lp.location_id = loyalty_members.location_id
  )
);

drop policy if exists loyalty_members_delete_own on public.loyalty_members;
create policy loyalty_members_delete_own
on public.loyalty_members
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_visits_select_own on public.loyalty_visits;
create policy loyalty_visits_select_own
on public.loyalty_visits
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_visits_insert_own on public.loyalty_visits;
create policy loyalty_visits_insert_own
on public.loyalty_visits
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = loyalty_visits.program_id
      and lp.user_id = auth.uid()
      and lp.location_id = loyalty_visits.location_id
  )
);

drop policy if exists loyalty_rewards_select_own on public.loyalty_rewards;
create policy loyalty_rewards_select_own
on public.loyalty_rewards
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists loyalty_rewards_insert_own on public.loyalty_rewards;
create policy loyalty_rewards_insert_own
on public.loyalty_rewards
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = loyalty_rewards.program_id
      and lp.user_id = auth.uid()
      and lp.location_id = loyalty_rewards.location_id
  )
);

drop policy if exists loyalty_rewards_update_own on public.loyalty_rewards;
create policy loyalty_rewards_update_own
on public.loyalty_rewards
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists loyalty_rewards_delete_own on public.loyalty_rewards;
create policy loyalty_rewards_delete_own
on public.loyalty_rewards
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists wallet_passes_select_own on public.wallet_passes;
create policy wallet_passes_select_own
on public.wallet_passes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists wallet_passes_insert_own on public.wallet_passes;
create policy wallet_passes_insert_own
on public.wallet_passes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = wallet_passes.program_id
      and lp.user_id = auth.uid()
      and lp.location_id = wallet_passes.location_id
  )
);

drop policy if exists wallet_passes_update_own on public.wallet_passes;
create policy wallet_passes_update_own
on public.wallet_passes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists wallet_passes_delete_own on public.wallet_passes;
create policy wallet_passes_delete_own
on public.wallet_passes
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.get_public_loyalty_program(
  p_public_token uuid
)
returns table (
  program_id uuid,
  location_id uuid,
  location_name text,
  program_name text,
  points_per_visit integer,
  reward_threshold_points integer,
  reward_label text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    lp.id,
    lp.location_id,
    coalesce(gl.location_title, gl.location_resource_name),
    lp.name,
    lp.points_per_visit,
    lp.reward_threshold_points,
    lp.reward_label
  from public.loyalty_programs lp
  join public.google_locations gl on gl.id = lp.location_id
  where lp.public_token = p_public_token
    and lp.is_enabled = true
  limit 1;
end;
$$;

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
  on conflict (member_id, provider)
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

revoke all on function public.get_public_loyalty_program(uuid) from public;
revoke all on function public.join_loyalty_program(uuid, text, text) from public;
revoke all on function public.record_loyalty_visit(uuid, text, uuid, text) from public;

grant execute on function public.get_public_loyalty_program(uuid)
  to anon, authenticated, service_role;
grant execute on function public.join_loyalty_program(uuid, text, text)
  to anon, authenticated, service_role;
grant execute on function public.record_loyalty_visit(uuid, text, uuid, text)
  to authenticated, service_role;
