-- 20260215120000_legal_entities.sql

create table if not exists public.legal_entities (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  is_default boolean not null default false,

  company_name text not null,
  legal_name text,
  industry text,

  siret text,
  vat_number text,

  billing_email text,
  billing_phone text,

  billing_address_line1 text,
  billing_address_line2 text,
  billing_postal_code text,
  billing_city text,
  billing_region text,
  billing_country text not null default 'FR',

  logo_path text,
  logo_url text,

  constraint legal_entities_siret_unique_per_business unique (business_id, siret)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_legal_entities_updated_at on public.legal_entities;
create trigger trg_legal_entities_updated_at
before update on public.legal_entities
for each row execute function public.set_updated_at();

create unique index if not exists legal_entities_one_default_per_org
on public.legal_entities(business_id)
where is_default = true;

alter table public.legal_entities enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'legal_entities'
      and policyname = 'legal_entities_select_own_org'
  ) then
    create policy "legal_entities_select_own_business"
      on public.legal_entities
      for select
      using (
        exists (
          select 1
          from public.business_settings bs
          where bs.business_id = legal_entities.business_id
            and bs.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'legal_entities'
      and policyname = 'legal_entities_write_own_org'
  ) then
    create policy "legal_entities_write_own_business"
      on public.legal_entities
      for all
      using (
        exists (
          select 1
          from public.business_settings bs
          where bs.business_id = legal_entities.business_id
            and bs.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.business_settings bs
          where bs.business_id = legal_entities.business_id
            and bs.user_id = auth.uid()
        )
      );
  end if;
end $$;
