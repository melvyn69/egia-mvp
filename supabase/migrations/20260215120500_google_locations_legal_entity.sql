alter table public.google_locations
add column if not exists legal_entity_id uuid null;

create index if not exists google_locations_legal_entity_id_idx
on public.google_locations(legal_entity_id);

alter table public.google_locations
add constraint google_locations_legal_entity_fk
foreign key (legal_entity_id) references public.legal_entities(id)
on delete set null;
