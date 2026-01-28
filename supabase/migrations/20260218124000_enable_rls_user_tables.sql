-- ===============================
-- ENABLE RLS ON USER-FACING TABLES
-- ===============================

-- alerts (app UI)
alter table public.alerts enable row level security;

drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own"
on public.alerts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "alerts_update_own" on public.alerts;
create policy "alerts_update_own"
on public.alerts
for update
to authenticated
using (user_id = auth.uid());

-- review_ai_insights (dashboard)
alter table public.review_ai_insights enable row level security;

drop policy if exists "review_ai_insights_select_own" on public.review_ai_insights;
create policy "review_ai_insights_select_own"
on public.review_ai_insights
for select
to authenticated
using (user_id = auth.uid());

-- review_ai_tags (via reviews join)
alter table public.review_ai_tags enable row level security;

drop policy if exists "review_ai_tags_select_own" on public.review_ai_tags;
create policy "review_ai_tags_select_own"
on public.review_ai_tags
for select
to authenticated
using (
  exists (
    select 1
    from public.google_reviews gr
    where gr.id = review_ai_tags.review_pk
      and gr.user_id = auth.uid()
  )
);

-- ai_tags (global reference table)
alter table public.ai_tags enable row level security;

drop policy if exists "ai_tags_select_auth" on public.ai_tags;
create policy "ai_tags_select_auth"
on public.ai_tags
for select
to authenticated
using (true);

-- ===============================
-- SYSTEM-ONLY TABLES (NO FRONT ACCESS)
-- ===============================

-- google_oauth_states (OAuth flow)
alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from anon, authenticated;

-- cron_state (background jobs)
alter table public.cron_state enable row level security;
revoke all on public.cron_state from anon, authenticated;
