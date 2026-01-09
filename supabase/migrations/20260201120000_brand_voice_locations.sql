do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'brand_voice_user_id_key'
      and conrelid = 'public.brand_voice'::regclass
  ) then
    alter table public.brand_voice drop constraint brand_voice_user_id_key;
  end if;
end $$;

alter table public.brand_voice
  add column if not exists location_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brand_voice_location_fk'
      and conrelid = 'public.brand_voice'::regclass
  ) then
    alter table public.brand_voice
      add constraint brand_voice_location_fk
      foreign key (location_id)
      references public.google_locations (id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists brand_voice_user_location_key
  on public.brand_voice (user_id, location_id);

create unique index if not exists brand_voice_user_global_key
  on public.brand_voice (user_id)
  where location_id is null;
