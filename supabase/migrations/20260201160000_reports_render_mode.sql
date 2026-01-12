alter table public.reports
  add column if not exists render_mode text not null default 'premium';

create index if not exists reports_render_mode_idx
  on public.reports (render_mode);
