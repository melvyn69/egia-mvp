create table if not exists public.business_settings (
  business_id uuid primary key,
  business_name text not null,
  default_tone text default 'professionnel',
  default_length text default 'moyen',
  signature text,
  do_not_say text,
  preferred_phrases text,
  updated_at timestamptz default now()
);

create table if not exists public.business_memory (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_settings(business_id) on delete cascade,
  kind text default 'note',
  content text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists business_settings_business_id_idx
  on public.business_settings (business_id);

create index if not exists business_memory_business_id_idx
  on public.business_memory (business_id);

insert into public.business_settings (
  business_id,
  business_name,
  default_tone,
  default_length,
  signature
) values (
  '00000000-0000-0000-0000-000000000001',
  'Boulangerie Saint-Roch',
  'professionnel',
  'moyen',
  'L''équipe Boulangerie Saint-Roch'
) on conflict (business_id) do nothing;

insert into public.business_memory (
  business_id,
  kind,
  content
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'style',
    'Réponse courte, polie, sans jargon, ton chaleureux.'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rule',
    'Ne jamais promettre de remboursement. Proposer un contact si besoin.'
  )
on conflict do nothing;
