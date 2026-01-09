create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  trigger text not null default 'new_review',
  location_id text null,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.automation_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  field text not null,
  operator text not null,
  value text not null,
  created_at timestamptz default now()
);

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  type text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.review_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  review_id text not null,
  location_id text null,
  workflow_id uuid null references public.automation_workflows(id) on delete set null,
  tone text null,
  draft_text text not null,
  status text not null default 'draft',
  created_at timestamptz default now()
);

create table if not exists public.review_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  review_id text not null,
  location_id text null,
  tag text not null,
  created_at timestamptz default now()
);

alter table public.automation_workflows enable row level security;
alter table public.automation_conditions enable row level security;
alter table public.automation_actions enable row level security;
alter table public.review_drafts enable row level security;
alter table public.review_tags enable row level security;

create policy "automation_workflows_select_own" on public.automation_workflows
  for select using (auth.uid() = user_id);
create policy "automation_workflows_insert_own" on public.automation_workflows
  for insert with check (auth.uid() = user_id);
create policy "automation_workflows_update_own" on public.automation_workflows
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation_workflows_delete_own" on public.automation_workflows
  for delete using (auth.uid() = user_id);

create policy "automation_conditions_select_own" on public.automation_conditions
  for select using (auth.uid() = user_id);
create policy "automation_conditions_insert_own" on public.automation_conditions
  for insert with check (auth.uid() = user_id);
create policy "automation_conditions_update_own" on public.automation_conditions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation_conditions_delete_own" on public.automation_conditions
  for delete using (auth.uid() = user_id);

create policy "automation_actions_select_own" on public.automation_actions
  for select using (auth.uid() = user_id);
create policy "automation_actions_insert_own" on public.automation_actions
  for insert with check (auth.uid() = user_id);
create policy "automation_actions_update_own" on public.automation_actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation_actions_delete_own" on public.automation_actions
  for delete using (auth.uid() = user_id);

create policy "review_drafts_select_own" on public.review_drafts
  for select using (auth.uid() = user_id);
create policy "review_drafts_insert_own" on public.review_drafts
  for insert with check (auth.uid() = user_id);
create policy "review_drafts_update_own" on public.review_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review_drafts_delete_own" on public.review_drafts
  for delete using (auth.uid() = user_id);

create policy "review_tags_select_own" on public.review_tags
  for select using (auth.uid() = user_id);
create policy "review_tags_insert_own" on public.review_tags
  for insert with check (auth.uid() = user_id);
create policy "review_tags_update_own" on public.review_tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review_tags_delete_own" on public.review_tags
  for delete using (auth.uid() = user_id);
