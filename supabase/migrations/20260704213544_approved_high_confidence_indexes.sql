-- CREATE INDEX CONCURRENTLY must run outside a transaction block.
-- This migration intentionally contains only approved concurrent index creation statements.

-- Dashboard/Reports: all-location review ranges filter by user_id and create_time.
create index concurrently if not exists google_reviews_user_create_time_idx
  on public.google_reviews (user_id, create_time desc)
  where create_time is not null;

-- Reports: report history is owned by user_id and ordered by created_at desc.
create index concurrently if not exists reports_user_created_at_idx
  on public.reports (user_id, created_at desc);

-- Reports/Competitors: benchmark histories filter by report_type and user ownership, then order by created_at desc.
create index concurrently if not exists generated_reports_user_type_created_idx
  on public.generated_reports (user_id, report_type, created_at desc);

-- Competitors: radar/list queries filter by user/location and order by distance_m.
create index concurrently if not exists competitors_user_location_distance_idx
  on public.competitors (user_id, location_id, distance_m);

-- Loyalty: recent members filter by user/location and order by newest member.
create index concurrently if not exists loyalty_members_user_location_created_idx
  on public.loyalty_members (user_id, location_id, created_at desc);

-- Loyalty: highlights filter by user/location and order by points balance.
create index concurrently if not exists loyalty_members_user_location_points_idx
  on public.loyalty_members (user_id, location_id, points_balance desc);

-- Loyalty: scanner lookup uses program_id plus upper(member_code) for active members.
create index concurrently if not exists loyalty_members_program_upper_code_active_idx
  on public.loyalty_members (program_id, (upper(member_code)))
  where status = 'active';

-- Loyalty: available rewards filter by user/location/status and order by unlock time.
create index concurrently if not exists loyalty_rewards_user_location_status_unlocked_idx
  on public.loyalty_rewards (user_id, location_id, status, unlocked_at desc);
