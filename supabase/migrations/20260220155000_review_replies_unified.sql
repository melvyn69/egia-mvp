create unique index if not exists review_ai_replies_user_id_review_id_uidx
  on public.review_ai_replies (user_id, review_id);

create or replace view public.review_replies_unified as
select
  rar.review_id::text as review_id_text,
  rar.review_id as review_id_uuid,
  rar.user_id,
  rar.location_id,
  rar.status,
  rar.created_at,
  rar.updated_at,
  rar.draft_text as text,
  'review_ai_replies'::text as source_table
from public.review_ai_replies rar
union all
select
  rr.review_id as review_id_text,
  case
    when nullif(btrim(rr.review_id), '') is null then null
    when nullif(btrim(rr.review_id), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then nullif(btrim(rr.review_id), '')::uuid
    else null
  end as review_id_uuid,
  rr.user_id,
  rr.location_id::text as location_id,
  rr.status,
  rr.created_at,
  coalesce(rr.sent_at, rr.created_at) as updated_at,
  rr.reply_text as text,
  'review_replies'::text as source_table
from public.review_replies rr;

alter view public.review_replies_unified set (security_invoker = true);
