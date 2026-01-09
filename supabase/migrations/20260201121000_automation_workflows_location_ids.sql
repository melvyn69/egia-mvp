alter table public.automation_workflows
  add column if not exists location_ids uuid[] null;
