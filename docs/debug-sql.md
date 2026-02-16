# AI Draft Debug SQL

## 1) Jobs par status
```sql
select status, count(*) as jobs
from public.ai_jobs
where type = 'review_analyze'
group by status
order by status;
```

## 2) Derniers jobs + payload review_id
```sql
select
  id,
  status,
  created_at,
  started_at,
  finished_at,
  error,
  payload->>'review_id' as review_id,
  payload->>'user_id' as user_id,
  payload->>'location_id' as location_id
from public.ai_jobs
where type = 'review_analyze'
order by created_at desc
limit 30;
```

## 3) Derniers drafts (review_ai_replies)
```sql
select
  review_id,
  user_id,
  location_id,
  status,
  updated_at,
  left(coalesce(draft_text, ''), 160) as draft_preview
from public.review_ai_replies
order by updated_at desc
limit 30;
```

## 4) Lecture unifiée (review_replies_unified) sur fenêtre temporelle
```sql
select
  source_table,
  review_id_text,
  review_id_uuid,
  user_id,
  location_id,
  status,
  updated_at,
  left(coalesce(text, ''), 160) as text_preview
from public.review_replies_unified
where updated_at >= now() - interval '24 hours'
order by updated_at desc
limit 100;
```

## 5) Jobs `done` sans draft correspondant
```sql
select
  j.id as job_id,
  j.finished_at,
  j.payload->>'review_id' as review_id,
  j.payload->>'user_id' as user_id
from public.ai_jobs j
left join public.review_ai_replies r
  on r.review_id::text = j.payload->>'review_id'
 and r.user_id::text = j.payload->>'user_id'
where j.type = 'review_analyze'
  and j.status = 'done'
  and r.review_id is null
order by j.finished_at desc
limit 50;
```

## 6) Drafts sans job correspondant (optionnel)
```sql
select
  r.review_id,
  r.user_id,
  r.updated_at
from public.review_ai_replies r
left join public.ai_jobs j
  on j.type = 'review_analyze'
 and j.payload->>'review_id' = r.review_id::text
 and j.payload->>'user_id' = r.user_id::text
where j.id is null
order by r.updated_at desc
limit 50;
```
