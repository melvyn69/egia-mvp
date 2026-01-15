create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  establishment_id uuid not null,
  rule_code text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  review_id text not null,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index alerts_unique_rule_per_review
on public.alerts (rule_code, review_id);

create index alerts_user_id_idx on public.alerts (user_id);
create index alerts_establishment_id_idx on public.alerts (establishment_id);
create index alerts_unresolved_idx on public.alerts (resolved_at)
where resolved_at is null;
