# Supabase Index Recommendations

Scope: Dashboard, Reports, Competitors, and Loyalty queries currently used by the app.

No migrations were applied. The final minimal SQL proposal is in [index-migration-proposal.sql](index-migration-proposal.sql).

## Existing Coverage Removed From Proposal

| Recommendation | Existing coverage | Decision |
| --- | --- | --- |
| `google_reviews_user_location_create_time_idx` | `idx_google_reviews_location_create_time`, plus existing review source-time/location indexes | Removed. Current location-specific review scans already have targeted location/time coverage. |
| Business settings user lookup | `business_settings_user_id_idx` | Not proposed. Current reads filter by `user_id`. |
| Google locations user lookup | `google_locations_user_id_idx`, `google_locations_id_user_id_uidx`, unique `(user_id, location_resource_name)` | Not proposed. Current focused reads are per-user and already covered. |
| Competitor follow/update lookup | Unique `(user_id, location_id, place_id)` and `competitors_user_location_followed_idx` | Not proposed. Existing indexes cover exact update and followed-filter paths. |
| Loyalty program and visit lookups | Loyalty program user/location indexes, public token unique index, and loyalty visit member/user/location indexes | Not proposed. Existing indexes cover current program and visit query shapes. |

## Unsafe Or Low-Confidence Recommendation Removed

| Recommendation | Reason |
| --- | --- |
| `competitors_user_location_scanned_idx` | Removed because `last_scanned_at` is referenced by application code but is not defined in local migrations/schema. |

## Final Proposal

```sql
-- Dashboard/Reports: all-location review ranges filter by user_id and create_time.
create index if not exists google_reviews_user_create_time_idx
  on public.google_reviews (user_id, create_time desc)
  where create_time is not null;

-- Reports: report history is owned by user_id and ordered by created_at desc.
create index if not exists reports_user_created_at_idx
  on public.reports (user_id, created_at desc);

-- Reports/Competitors: benchmark histories filter by report_type and user ownership, then order by created_at desc.
create index if not exists generated_reports_user_type_created_idx
  on public.generated_reports (user_id, report_type, created_at desc);

-- Competitors: radar/list queries filter by user/location and order by distance_m.
create index if not exists competitors_user_location_distance_idx
  on public.competitors (user_id, location_id, distance_m);

-- Loyalty: recent members filter by user/location and order by newest member.
create index if not exists loyalty_members_user_location_created_idx
  on public.loyalty_members (user_id, location_id, created_at desc);

-- Loyalty: highlights filter by user/location and order by points balance.
create index if not exists loyalty_members_user_location_points_idx
  on public.loyalty_members (user_id, location_id, points_balance desc);

-- Loyalty: scanner lookup uses program_id plus upper(member_code) for active members.
create index if not exists loyalty_members_program_upper_code_active_idx
  on public.loyalty_members (program_id, (upper(member_code)))
  where status = 'active';

-- Loyalty: available rewards filter by user/location/status and order by unlock time.
create index if not exists loyalty_rewards_user_location_status_unlocked_idx
  on public.loyalty_rewards (user_id, location_id, status, unlocked_at desc);
```
