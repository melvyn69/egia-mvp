alter table public.review_ai_replies
  add column if not exists mode text not null default 'draft';

alter table public.review_ai_replies
  add column if not exists identity_hash text not null default 'none';

update public.review_ai_replies
set mode = 'draft'
where mode is null or btrim(mode) = '';

update public.review_ai_replies
set identity_hash = 'none'
where identity_hash is null or btrim(identity_hash) = '';

create index if not exists review_ai_replies_identity_hash_idx
  on public.review_ai_replies(identity_hash);

create unique index if not exists review_ai_replies_draft_identity_uidx
  on public.review_ai_replies(user_id, review_id, mode, identity_hash)
  where mode = 'draft';
