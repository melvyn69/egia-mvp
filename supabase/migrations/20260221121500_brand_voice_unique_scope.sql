-- Ensure one single Brand Voice row per scope (user_id, location_id),
-- including global scope where location_id is null.

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, location_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.brand_voice
)
delete from public.brand_voice bv
using ranked r
where bv.id = r.id
  and r.rn > 1;

drop index if exists public.brand_voice_user_location_key;
drop index if exists public.brand_voice_user_global_key;
drop index if exists public.brand_voice_unique_user_location;
drop index if exists public.brand_voice_unique_user_global;

create unique index if not exists brand_voice_unique_scope
on public.brand_voice (user_id, location_id) nulls not distinct;
