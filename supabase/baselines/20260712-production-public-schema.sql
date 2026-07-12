


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."brand_voice_language_level" AS ENUM (
    'tutoiement',
    'vouvoiement'
);


ALTER TYPE "public"."brand_voice_language_level" OWNER TO "postgres";


CREATE TYPE "public"."brand_voice_tone" AS ENUM (
    'professional',
    'friendly',
    'warm',
    'formal'
);


ALTER TYPE "public"."brand_voice_tone" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_tag_candidates"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_location_id" "text" DEFAULT NULL::"text", "p_since_time" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, "p_since_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid", "p_limit" integer DEFAULT 150, "p_force" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "user_id" "uuid", "location_id" "text", "location_name" "text", "comment" "text", "update_time" timestamp with time zone, "create_time" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  select gr.id,
         gr.user_id,
         gr.location_id,
         gr.location_name,
         gr.comment,
         gr.update_time,
         gr.create_time,
         gr.created_at
  from public.google_reviews gr
  where gr.comment is not null
    and length(btrim(gr.comment)) > 0
    and not exists (
      select 1
      from public.review_ai_insights ai
      where ai.review_pk = gr.id
    )
    and (
      p_force = true
      or (coalesce(gr.update_time, gr.create_time, gr.created_at) > p_since_time)
      or (
        coalesce(gr.update_time, gr.create_time, gr.created_at) = p_since_time
        and gr.id > p_since_id
      )
    )
    and (p_user_id is null or gr.user_id = p_user_id)
    and (p_location_id is null or gr.location_id = p_location_id)
  order by coalesce(gr.update_time, gr.create_time, gr.created_at) asc, gr.id asc
  limit p_limit;
$$;


ALTER FUNCTION "public"."ai_tag_candidates"("p_user_id" "uuid", "p_location_id" "text", "p_since_time" timestamp with time zone, "p_since_id" "uuid", "p_limit" integer, "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_tag_candidates_count"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_location_id" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "sql" STABLE
    AS $$
  select count(*)
  from public.google_reviews gr
  where gr.comment is not null
    and length(btrim(gr.comment)) > 0
    and not exists (
      select 1
      from public.review_ai_insights ai
      where ai.review_pk = gr.id
    )
    and (p_user_id is null or gr.user_id = p_user_id)
    and (p_location_id is null or gr.location_id = p_location_id);
$$;


ALTER FUNCTION "public"."ai_tag_candidates_count"("p_user_id" "uuid", "p_location_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_draft_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if old.mode='draft' and new.mode='draft' then
    if coalesce(btrim(old.draft_text),'') <> '' and coalesce(btrim(new.draft_text),'') = '' then
      insert into public.review_ai_replies_audit(review_id, old_status, new_status, old_len, new_len)
      values (old.review_id, old.status, new.status, length(old.draft_text), length(coalesce(new.draft_text,'')));
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."audit_draft_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_ai_tag_candidates"("p_limit" integer DEFAULT 10, "p_version" "text" DEFAULT 'v1'::"text", "p_location_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "review_id" "text", "update_time" timestamp with time zone, "create_time" timestamp with time zone, "created_at" timestamp with time zone, "user_id" "uuid", "location_id" "text", "location_name" "text", "comment" "text", "reply_text" "text", "owner_reply" "text", "content_hash" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with locked as (
    select r.id,
      encode(digest(coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''), 'sha256'), 'hex') as computed_hash
    from public.google_reviews r
    where r.comment is not null and btrim(r.comment) <> ''
      and r.user_id is not null and r.location_id is not null
      and (p_location_id is null or r.location_id = p_location_id)
      and (
        r.ai_tag_status in ('pending', 'error')
        or r.ai_tag_version is distinct from p_version
        or r.content_hash is distinct from encode(digest(coalesce(r.comment, '') || '|' || coalesce(r.rating::text, ''), 'sha256'), 'hex')
        or (r.ai_tag_status = 'processing' and r.ai_tag_claimed_at < now() - interval '10 minutes')
      )
    order by coalesce(r.update_time, r.create_time, r.created_at), r.id
    limit least(greatest(coalesce(p_limit, 10), 1), 20)
    for update skip locked
  ), claimed as (
    update public.google_reviews r
    set ai_tag_status = 'processing', ai_tag_claimed_at = now(),
      content_hash = locked.computed_hash
    from locked
    where r.id = locked.id
    returning r.*
  )
  select c.id, c.review_id, c.update_time, c.create_time, c.created_at,
    c.user_id, c.location_id, c.location_name, c.comment, c.reply_text,
    c.owner_reply, c.content_hash
  from claimed c;
end;
$$;


ALTER FUNCTION "public"."claim_ai_tag_candidates"("p_limit" integer, "p_version" "text", "p_location_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_automation_workflows"("p_limit" integer DEFAULT 25) RETURNS TABLE("id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with locked as (
    select aw.id
    from public.automation_workflows aw
    where aw.enabled and aw.trigger = 'new_review'
      and aw.next_run_at <= now()
      and (aw.run_status = 'idle' or
        (aw.run_status = 'processing' and aw.run_claimed_at < now() - interval '10 minutes'))
    order by aw.next_run_at, aw.id
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
    for update skip locked
  )
  update public.automation_workflows aw
  set run_status = 'processing', run_claimed_at = now(), updated_at = now()
  from locked
  where aw.id = locked.id
  returning aw.id, aw.user_id;
end;
$$;


ALTER FUNCTION "public"."claim_due_automation_workflows"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_google_sync_connections"("p_limit" integer DEFAULT 5) RETURNS TABLE("user_id" "uuid", "refresh_token" "text", "sync_cursor" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with locked as (
    select gc.id
    from public.google_connections gc
    where gc.active
      and gc.refresh_token is not null
      and gc.next_sync_at <= now()
      and (
        gc.sync_status = 'idle'
        or (gc.sync_status = 'processing' and gc.sync_claimed_at < now() - interval '10 minutes')
      )
    order by gc.next_sync_at, gc.id
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
    for update skip locked
  )
  update public.google_connections gc
  set sync_status = 'processing', sync_claimed_at = now(), updated_at = now()
  from locked
  where gc.id = locked.id
  returning gc.user_id, gc.refresh_token, gc.sync_cursor;
end;
$$;


ALTER FUNCTION "public"."claim_google_sync_connections"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_review_analyze_jobs"("p_limit" integer DEFAULT 10, "p_user_id" "text" DEFAULT NULL::"text", "p_location_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "payload" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with cte as (
    select aj.id as job_id
    from public.ai_jobs aj
    where aj.status = 'pending'
      and aj.type = 'review_analyze'
      and (p_user_id is null or aj.payload->>'user_id' = p_user_id)
      and (p_location_id is null or aj.payload->>'location_id' = p_location_id)
    order by aj.created_at asc
    limit p_limit
    for update skip locked
  )
  update public.ai_jobs j
  set status = 'processing',
      started_at = now()
  from cte
  where j.id = cte.job_id
  returning j.id, j.payload;
end;
$$;


ALTER FUNCTION "public"."claim_review_analyze_jobs"("p_limit" integer, "p_user_id" "text", "p_location_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_ai_job_for_review"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.comment is not null and length(btrim(new.comment)) > 0 then
    insert into public.ai_jobs(type, payload, status)
    values (
      'review_analyze',
      jsonb_build_object(
        'review_id', new.id,
        'location_id', new.location_id
      ),
      'pending'
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_ai_job_for_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_monthly_report_email"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.receive_monthly_reports = true then
    if not exists (
      select 1
      from public.user_profiles up
      where up.user_id = new.user_id
        and up.email is not null
        and up.email <> ''
    ) then
      raise exception 'email_required_for_monthly_report';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_monthly_report_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform public.ensure_user_profile(auth.uid(), null);
end;
$$;


ALTER FUNCTION "public"."ensure_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_profile"("p_user_id" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text;
begin
  if p_user_id is null then
    return;
  end if;

  if p_email is null then
    select email into v_email from auth.users where id = p_user_id;
  else
    v_email := p_email;
  end if;

  insert into public.user_profiles (user_id, email, created_at, updated_at)
  values (p_user_id, v_email, now(), now())
  on conflict (user_id) do update
    set email = coalesce(public.user_profiles.email, excluded.email),
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."ensure_user_profile"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inbox_reviews"("p_location_id" "text", "p_limit" integer DEFAULT 50, "p_only_with_comment" boolean DEFAULT false, "p_lookback_days" integer DEFAULT 180, "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("review_pk" "uuid", "review_name" "text", "google_review_id" "text", "location_id" "text", "location_name" "text", "author_name" "text", "create_time" timestamp with time zone, "update_time" timestamp with time zone, "rating" integer, "comment" "text", "owner_reply" "text", "owner_reply_time" timestamp with time zone, "has_draft" boolean, "draft_status" "text", "draft_preview" "text", "draft_updated_at" timestamp with time zone, "has_job_inflight" boolean, "is_eligible_to_generate" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with params as (
    select
      coalesce(p_user_id, auth.uid()) as uid,
      greatest(1, least(coalesce(p_limit, 50), 500)) as lim,
      greatest(0, least(coalesce(p_lookback_days, 180), 3650)) as lookback_days,
      coalesce(p_only_with_comment, false) as only_with_comment
  ),
  base as (
    select
      r.id as review_pk,
      r.review_name,
      r.review_id as google_review_id,
      r.location_id,
      r.location_name,
      r.author_name,
      r.create_time,
      r.update_time,
      r.rating,
      r.comment,
      r.owner_reply,
      r.owner_reply_time
    from public.google_reviews r
    cross join params p
    where r.location_id = p_location_id
      and (p.uid is null or r.user_id = p.uid)
      and (r.owner_reply is null or btrim(r.owner_reply) = '')
      and (
        p.lookback_days = 0
        or r.create_time >= now() - (p.lookback_days || ' days')::interval
      )
      and (
        p.only_with_comment = false
        or coalesce(nullif(btrim(r.comment), ''), '') <> ''
      )
  ),
  draft_latest as (
    select distinct on (ar.review_id)
      ar.review_id,
      ar.status as draft_status,
      substring(coalesce(ar.draft_text, '') for 160) as draft_preview,
      ar.updated_at as draft_updated_at
    from public.review_ai_replies ar
    cross join params p
    where ar.mode = 'draft'
      and (p.uid is null or ar.user_id = p.uid)
    order by ar.review_id, ar.updated_at desc nulls last
  ),
  jobs_inflight as (
    select distinct (j.payload->>'review_id') as review_id_text
    from public.ai_jobs j
    cross join params p
    where j.type in ('review_reply_draft', 'review_analyze')
      and j.status in ('queued', 'processing', 'generating')
      and (j.payload->>'review_id') is not null
      and (
        p.uid is null
        or (j.payload->>'user_id') = p.uid::text
        or (j.payload->>'user_id') is null
        or (j.payload->>'user_id') = ''
      )
  )
  select
    b.review_pk,
    b.review_name,
    b.google_review_id,
    b.location_id,
    b.location_name,
    b.author_name,
    b.create_time,
    b.update_time,
    b.rating,
    b.comment,
    b.owner_reply,
    b.owner_reply_time,
    (d.review_id is not null) as has_draft,
    d.draft_status,
    d.draft_preview,
    d.draft_updated_at,
    (j.review_id_text is not null) as has_job_inflight,
    (
      coalesce(nullif(btrim(b.comment), ''), '') <> ''
      and d.review_id is null
      and j.review_id_text is null
    ) as is_eligible_to_generate
  from base b
  left join draft_latest d
    on d.review_id = b.review_pk
  left join jobs_inflight j
    on j.review_id_text = b.review_pk::text
  order by b.create_time desc nulls last, b.review_pk desc
  limit (select lim from params);
$$;


ALTER FUNCTION "public"."get_inbox_reviews"("p_location_id" "text", "p_limit" integer, "p_only_with_comment" boolean, "p_lookback_days" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") RETURNS TABLE("program_id" "uuid", "location_id" "uuid", "location_name" "text", "program_name" "text", "points_per_visit" integer, "reward_threshold_points" integer, "reward_label" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    lp.id,
    lp.location_id,
    coalesce(gl.location_title, gl.location_resource_name),
    lp.name,
    lp.points_per_visit,
    lp.reward_threshold_points,
    lp.reward_label
  from public.loyalty_programs lp
  join public.google_locations gl on gl.id = lp.location_id
  where lp.public_token = p_public_token
    and lp.is_enabled = true
  limit 1;
end;
$$;


ALTER FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer DEFAULT 50, "p_lookback_days" integer DEFAULT 180, "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("review_pk" "uuid", "comment" "text", "rating" integer, "create_time" timestamp with time zone, "review_name" "text", "location_id" "text", "location_name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with params as (
    select
      coalesce(p_user_id, auth.uid()) as uid,
      greatest(1, least(coalesce(p_limit, 50), 500)) as lim,
      greatest(0, least(coalesce(p_lookback_days, 180), 3650)) as lookback_days
  )
  select
    r.id as review_pk,
    r.comment,
    r.rating,
    r.create_time,
    r.review_name,
    r.location_id,
    r.location_name
  from public.google_reviews r
  cross join params p
  where r.location_id = p_location_id
    and (p.uid is null or r.user_id = p.uid)
    and (r.owner_reply is null or btrim(r.owner_reply) = '')
    and coalesce(nullif(btrim(r.comment), ''), '') <> ''
    and (
      p.lookback_days = 0
      or r.create_time >= now() - (p.lookback_days || ' days')::interval
    )
    and not exists (
      select 1
      from public.review_ai_replies ar
      where ar.review_id = r.id
        and ar.mode = 'draft'
        and (p.uid is null or ar.user_id = p.uid)
    )
    and not exists (
      select 1
      from public.ai_jobs j
      where (j.payload->>'review_id') = r.id::text
        and j.type in ('review_reply_draft', 'review_analyze')
        and j.status in ('queued', 'processing', 'generating')
        and (
          p.uid is null
          or (j.payload->>'user_id') = p.uid::text
          or (j.payload->>'user_id') is null
          or (j.payload->>'user_id') = ''
        )
    )
  order by r.create_time desc nulls last, r.id desc
  limit (select lim from params);
$$;


ALTER FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid", "p_review_id" "uuid") RETURNS TABLE("review_pk" "uuid", "comment" "text", "rating" integer, "create_time" timestamp with time zone, "review_name" "text", "location_id" "text", "location_name" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    r.review_pk,
    r.comment,
    r.rating,
    r.create_time,
    r.review_name,
    r.location_id,
    r.location_name
  from public.get_reviews_to_reply(
    p_location_id => p_location_id,
    p_limit => p_limit,
    p_lookback_days => p_lookback_days,
    p_user_id => p_user_id
  ) r
  where p_review_id is null or r.review_pk = p_review_id
  order by r.create_time desc nulls last, r.review_pk desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;


ALTER FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid", "p_review_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  perform public.ensure_user_profile(new.id, new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_claim"("max_jobs" integer DEFAULT 25) RETURNS TABLE("id" "uuid", "user_id" "uuid", "type" "text", "status" "text", "run_at" timestamp with time zone, "attempts" integer, "last_error" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with locked as (
    select jq.id
    from public.job_queue jq
    where jq.status = 'queued'
      and jq.run_at <= now()
      and jq.attempts < 5
    order by jq.run_at, jq.created_at
    limit least(greatest(coalesce(max_jobs, 25), 1), 50)
    for update skip locked
  )
  update public.job_queue jq
  set status = 'running', updated_at = now()
  from locked
  where jq.id = locked.id
  returning jq.id, jq.user_id, jq.type, jq.status, jq.run_at,
    jq.attempts, jq.last_error, jq.created_at, jq.updated_at;
end;
$$;


ALTER FUNCTION "public"."job_queue_claim"("max_jobs" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") RETURNS TABLE("member_id" "uuid", "member_code" "text", "qr_token" "uuid", "wallet_public_token" "uuid", "points_balance" integer, "visits_count" integer, "program_name" "text", "points_per_visit" integer, "reward_threshold_points" integer, "reward_label" "text", "location_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_program record;
  v_member public.loyalty_members%rowtype;
  v_wallet public.wallet_passes%rowtype;
  v_first_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_code text;
  v_attempts integer := 0;
begin
  select
    lp.id as program_id,
    lp.user_id,
    lp.location_id,
    lp.name,
    lp.points_per_visit,
    lp.reward_threshold_points,
    lp.reward_label,
    coalesce(gl.location_title, gl.location_resource_name) as location_name
  into v_program
  from public.loyalty_programs lp
  join public.google_locations gl on gl.id = lp.location_id
  where lp.public_token = p_public_token
    and lp.is_enabled = true
  limit 1;

  if v_program.program_id is null then
    raise exception 'loyalty_program_not_found';
  end if;

  if v_first_name is null then
    raise exception 'first_name_required';
  end if;

  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'valid_email_required';
  end if;

  select lm.*
  into v_member
  from public.loyalty_members lm
  where lm.program_id = v_program.program_id
    and lower(lm.email) = v_email
  limit 1;

  if v_member.id is null then
    loop
      v_attempts := v_attempts + 1;
      v_code := 'EG' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

      begin
        insert into public.loyalty_members (
          program_id,
          user_id,
          location_id,
          first_name,
          email,
          member_code
        )
        values (
          v_program.program_id,
          v_program.user_id,
          v_program.location_id,
          v_first_name,
          v_email,
          v_code
        )
        returning * into v_member;
        exit;
      exception
        when unique_violation then
          select existing_member.*
          into v_member
          from public.loyalty_members existing_member
          where existing_member.program_id = v_program.program_id
            and lower(existing_member.email) = v_email
          limit 1;

          if v_member.id is not null then
            exit;
          end if;

          if v_attempts >= 5 then
            raise;
          end if;
      end;
    end loop;
  else
    update public.loyalty_members lm
    set
      first_name = v_first_name,
      status = 'active',
      updated_at = now()
    where lm.id = v_member.id
    returning * into v_member;
  end if;

  insert into public.wallet_passes (
    program_id,
    member_id,
    user_id,
    location_id,
    provider,
    status,
    payload
  )
  values (
    v_member.program_id,
    v_member.id,
    v_member.user_id,
    v_member.location_id,
    'generic',
    'ready',
    jsonb_build_object(
      'member_code', v_member.member_code,
      'qr_token', v_member.qr_token,
      'program_name', v_program.name
    )
  )
  on conflict on constraint wallet_passes_member_provider_unique
  do update set
    status = 'ready',
    payload = excluded.payload,
    updated_at = now()
  returning * into v_wallet;

  return query
  select
    v_member.id,
    v_member.member_code,
    v_member.qr_token,
    v_wallet.public_token,
    v_member.points_balance,
    v_member.visits_count,
    v_program.name,
    v_program.points_per_visit,
    v_program.reward_threshold_points,
    v_program.reward_label,
    v_program.location_name;
end;
$_$;


ALTER FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("reviews_total" bigint, "reviews_with_text" bigint, "avg_rating" numeric, "sentiment_positive" bigint, "sentiment_neutral" bigint, "sentiment_negative" bigint, "top_tags" "jsonb")
    LANGUAGE "sql" STABLE
    AS $$
  with filtered as (
    select
      gr.id,
      gr.rating,
      gr.comment,
      coalesce(gr.update_time, gr.create_time, gr.created_at) as source_time
    from public.google_reviews gr
    where gr.location_id = p_location_id
      and coalesce(gr.update_time, gr.create_time, gr.created_at) >= p_from
      and coalesce(gr.update_time, gr.create_time, gr.created_at) <= p_to
  ),
  tag_counts as (
    select at.tag, count(*) as count
    from filtered f
    join public.review_ai_tags rat on rat.review_pk = f.id
    join public.ai_tags at on at.id = rat.tag_id
    group by at.tag
    order by count desc
    limit 8
  )
  select
    (select count(*) from filtered) as reviews_total,
    (select count(*) from filtered where comment is not null and length(btrim(comment)) > 0)
      as reviews_with_text,
    (select avg(rating) from filtered) as avg_rating,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'positive') as sentiment_positive,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'neutral') as sentiment_neutral,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'negative') as sentiment_negative,
    (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb)
      from tag_counts) as top_tags;
$$;


ALTER FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_rating_min" numeric DEFAULT NULL::numeric, "p_rating_max" numeric DEFAULT NULL::numeric, "p_sentiment" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_tags" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("reviews_total" bigint, "reviews_with_text" bigint, "avg_rating" numeric, "sentiment_positive" bigint, "sentiment_neutral" bigint, "sentiment_negative" bigint, "top_tags" "jsonb")
    LANGUAGE "sql" STABLE
    AS $$
  with base as (
    select
      gr.id,
      gr.rating,
      gr.comment,
      gr.status,
      coalesce(gr.update_time, gr.create_time, gr.created_at) as source_time
    from public.google_reviews gr
    where gr.location_id = p_location_id
      and coalesce(gr.update_time, gr.create_time, gr.created_at) >= p_from
      and coalesce(gr.update_time, gr.create_time, gr.created_at) <= p_to
      and (p_rating_min is null or gr.rating >= p_rating_min)
      and (p_rating_max is null or gr.rating <= p_rating_max)
      and (p_status is null or gr.status = p_status)
  ),
  filtered as (
    select b.*
    from base b
    where
      (p_sentiment is null or exists (
        select 1
        from public.review_ai_insights ai
        where ai.review_pk = b.id
          and ai.sentiment = p_sentiment
      ))
      and (
        p_tags is null or exists (
          select 1
          from public.review_ai_tags rat
          join public.ai_tags at on at.id = rat.tag_id
          where rat.review_pk = b.id
            and at.tag = any(p_tags)
        )
      )
  ),
  tag_counts as (
    select at.tag, count(*) as count
    from filtered f
    join public.review_ai_tags rat on rat.review_pk = f.id
    join public.ai_tags at on at.id = rat.tag_id
    group by at.tag
    order by count desc
    limit 8
  )
  select
    (select count(*) from filtered) as reviews_total,
    (select count(*) from filtered where comment is not null and length(btrim(comment)) > 0)
      as reviews_with_text,
    (select avg(rating) from filtered) as avg_rating,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'positive') as sentiment_positive,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'neutral') as sentiment_neutral,
    (select count(*) from filtered f join public.review_ai_insights ai on ai.review_pk = f.id
      where ai.sentiment = 'negative') as sentiment_negative,
    (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb)
      from tag_counts) as top_tags;
$$;


ALTER FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_rating_min" numeric, "p_rating_max" numeric, "p_sentiment" "text", "p_status" "text", "p_tags" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_draft_regression"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Si on avait un texte non vide, on ne permet jamais de le vider
  if coalesce(btrim(old.draft_text), '') <> '' then
    if coalesce(btrim(new.draft_text), '') = '' then
      new.draft_text := old.draft_text;
    end if;

    -- Si on avait un texte, on ne repasse jamais queued
    if new.status = 'queued' then
      new.status := 'draft';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_draft_regression"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text" DEFAULT NULL::"text", "p_qr_token" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("member_id" "uuid", "member_code" "text", "points_balance" integer, "lifetime_points" integer, "visits_count" integer, "points_added" integer, "reward_available" boolean, "reward_id" "uuid", "reward_label" "text", "duplicate_scan" boolean, "last_visit_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_program public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_recent_visit public.loyalty_visits%rowtype;
  v_existing_reward public.loyalty_rewards%rowtype;
  v_new_reward public.loyalty_rewards%rowtype;
  v_member_code text := upper(nullif(btrim(coalesce(p_member_code, '')), ''));
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_next_balance integer;
  v_unlock_reward boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select lp.*
  into v_program
  from public.loyalty_programs lp
  where lp.user_id = v_user_id
    and lp.location_id = p_location_id
    and lp.is_enabled = true
  limit 1;

  if v_program.id is null then
    raise exception 'loyalty_program_not_found';
  end if;

  if v_member_code is null and p_qr_token is null then
    raise exception 'member_identifier_required';
  end if;

  select lm.*
  into v_member
  from public.loyalty_members lm
  where lm.program_id = v_program.id
    and lm.status = 'active'
    and (
      (p_qr_token is not null and lm.qr_token = p_qr_token)
      or (v_member_code is not null and upper(lm.member_code) = v_member_code)
      or (
        p_qr_token is not null
        and exists (
          select 1
          from public.wallet_passes wp
          where wp.member_id = lm.id
            and wp.program_id = v_program.id
            and wp.public_token = p_qr_token
            and wp.status in ('ready', 'active')
        )
      )
    )
  order by lm.created_at asc
  limit 1
  for update;

  if v_member.id is null then
    raise exception 'loyalty_member_not_found';
  end if;

  if v_idempotency_key is not null then
    select lv.*
    into v_recent_visit
    from public.loyalty_visits lv
    where lv.member_id = v_member.id
      and lv.idempotency_key = v_idempotency_key
    order by lv.created_at desc
    limit 1;
  end if;

  if v_recent_visit.id is null then
    select lv.*
    into v_recent_visit
    from public.loyalty_visits lv
    where lv.member_id = v_member.id
      and lv.created_at >= now() - interval '90 seconds'
    order by lv.created_at desc
    limit 1;
  end if;

  select lr.*
  into v_existing_reward
  from public.loyalty_rewards lr
  where lr.member_id = v_member.id
    and lr.status = 'available'
  order by lr.unlocked_at desc
  limit 1;

  if v_recent_visit.id is not null then
    return query
    select
      v_member.id,
      v_member.member_code,
      v_member.points_balance,
      v_member.lifetime_points,
      v_member.visits_count,
      0,
      v_existing_reward.id is not null,
      v_existing_reward.id,
      coalesce(v_existing_reward.reward_label, v_program.reward_label),
      true,
      v_member.last_visit_at;
    return;
  end if;

  v_next_balance := v_member.points_balance + v_program.points_per_visit;
  v_unlock_reward :=
    v_existing_reward.id is null
    and v_next_balance >= v_program.reward_threshold_points;

  if v_unlock_reward then
    v_next_balance := v_next_balance - v_program.reward_threshold_points;
  end if;

  insert into public.loyalty_visits (
    program_id,
    member_id,
    user_id,
    location_id,
    points_added,
    scan_source,
    idempotency_key,
    recorded_by
  )
  values (
    v_program.id,
    v_member.id,
    v_user_id,
    v_program.location_id,
    v_program.points_per_visit,
    'scanner',
    v_idempotency_key,
    v_user_id
  );

  update public.loyalty_members lm
  set
    points_balance = v_next_balance,
    lifetime_points = lm.lifetime_points + v_program.points_per_visit,
    visits_count = lm.visits_count + 1,
    last_visit_at = now(),
    updated_at = now()
  where lm.id = v_member.id
  returning * into v_member;

  if v_unlock_reward then
    insert into public.loyalty_rewards (
      program_id,
      member_id,
      user_id,
      location_id,
      threshold_points,
      reward_label,
      status
    )
    values (
      v_program.id,
      v_member.id,
      v_user_id,
      v_program.location_id,
      v_program.reward_threshold_points,
      v_program.reward_label,
      'available'
    )
    on conflict do nothing
    returning * into v_new_reward;

    if v_new_reward.id is null then
      select lr.*
      into v_new_reward
      from public.loyalty_rewards lr
      where lr.member_id = v_member.id
        and lr.status = 'available'
      order by lr.unlocked_at desc
      limit 1;
    end if;
  else
    v_new_reward := v_existing_reward;
  end if;

  return query
  select
    v_member.id,
    v_member.member_code,
    v_member.points_balance,
    v_member.lifetime_points,
    v_member.visits_count,
    v_program.points_per_visit,
    v_new_reward.id is not null,
    v_new_reward.id,
    coalesce(v_new_reward.reward_label, v_program.reward_label),
    false,
    v_member.last_visit_at;
end;
$$;


ALTER FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text", "p_qr_token" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_monthly_report_idempotency_key"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.period_preset = 'last_month' then
    new.idempotency_key := new.user_id::text || ':' ||
      coalesce(new.from_date::text, '') || ':' || coalesce(new.to_date::text, '');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_monthly_report_idempotency_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_draft_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requested_limit" integer DEFAULT 0 NOT NULL,
    "generated_count" integer DEFAULT 0 NOT NULL,
    "last_run_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_draft_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "error" "text"
);


ALTER TABLE "public"."ai_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_run_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "processed" integer DEFAULT 0 NOT NULL,
    "tags_upserted" integer DEFAULT 0 NOT NULL,
    "errors_count" integer DEFAULT 0 NOT NULL,
    "aborted" boolean DEFAULT false NOT NULL,
    "skip_reason" "text",
    "user_id" "uuid",
    "last_error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "duration_ms" bigint
);


ALTER TABLE "public"."ai_run_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tag" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "rule_code" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "review_id" "text" NOT NULL,
    "triggered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_notified_at" timestamp with time zone,
    "workflow_id" "uuid",
    "alert_type" "text",
    "workflow_name" "text",
    "rule_label" "text",
    "source" "text",
    CONSTRAINT "alerts_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "action_type" "text",
    "params" "jsonb",
    "label" "text"
);


ALTER TABLE "public"."automation_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_conditions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "field" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "label" "text",
    "value_jsonb" "jsonb"
);


ALTER TABLE "public"."automation_conditions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger" "text" DEFAULT 'new_review'::"text" NOT NULL,
    "location_id" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "location_ids" "uuid"[],
    "next_run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "run_claimed_at" timestamp with time zone
);


ALTER TABLE "public"."automation_workflows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_voice" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "tone" "public"."brand_voice_tone" DEFAULT 'professional'::"public"."brand_voice_tone" NOT NULL,
    "language_level" "public"."brand_voice_language_level" DEFAULT 'vouvoiement'::"public"."brand_voice_language_level" NOT NULL,
    "context" "text",
    "use_emojis" boolean DEFAULT false NOT NULL,
    "forbidden_words" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid"
);


ALTER TABLE "public"."brand_voice" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'note'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."business_memory" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."business_memory_effective" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("kind", "content", COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "business_id") "kind",
    "content",
    "business_id",
    "user_id",
    "created_at"
   FROM "public"."business_memory"
  WHERE ("is_active" = true);


ALTER VIEW "public"."business_memory_effective" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_settings" (
    "business_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" "text" NOT NULL,
    "default_tone" "text" DEFAULT 'professionnel'::"text" NOT NULL,
    "default_length" "text" DEFAULT 'moyen'::"text" NOT NULL,
    "signature" "text",
    "do_not_say" "text",
    "preferred_phrases" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "language_level" "text",
    "use_emojis" boolean DEFAULT false,
    "active_location_ids" "uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "monthly_report_enabled" boolean DEFAULT false NOT NULL,
    "competitive_monitoring_enabled" boolean DEFAULT false NOT NULL,
    "competitive_monitoring_keyword" "text",
    "competitive_monitoring_radius_km" integer DEFAULT 5 NOT NULL
);


ALTER TABLE "public"."business_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "place_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "lat" double precision,
    "lng" double precision,
    "distance_m" integer,
    "rating" numeric,
    "user_ratings_total" integer,
    "category" "text",
    "is_followed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_fetched_at" timestamp with time zone
);


ALTER TABLE "public"."competitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_state" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."cron_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "location_id" "uuid",
    "title" "text",
    "summary" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."generated_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "account_name" "text",
    "account_resource_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."google_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google_gbp'::"text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "token_expiry" timestamp with time zone,
    "scope" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "token_type" "text",
    "oauth_state" "text",
    "oauth_state_expires_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "next_sync_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "sync_cursor" "text",
    "sync_claimed_at" timestamp with time zone
);


ALTER TABLE "public"."google_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "account_resource_name" "text" NOT NULL,
    "location_resource_name" "text" NOT NULL,
    "location_title" "text",
    "store_code" "text",
    "address_json" "jsonb",
    "phone" "text",
    "website_uri" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_synced_at" timestamp with time zone,
    "legal_entity_id" "uuid",
    "latitude" double precision,
    "longitude" double precision
);


ALTER TABLE "public"."google_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "redirect_to" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL
);


ALTER TABLE "public"."google_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "account_resource_name" "text",
    "location_name" "text" DEFAULT ''::"text" NOT NULL,
    "review_name" "text" NOT NULL,
    "star_rating" "text",
    "comment" "text",
    "create_time" timestamp with time zone,
    "update_time" timestamp with time zone,
    "reviewer" "jsonb",
    "reply" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'new'::"text",
    "needs_reply" boolean DEFAULT true,
    "replied_at" timestamp with time zone,
    "reply_text" "text",
    "last_synced_at" timestamp with time zone,
    "location_id" "text",
    "review_id" "text",
    "owner_reply" "text",
    "owner_reply_time" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "author_name" "text",
    "rating" integer,
    "raw" "jsonb",
    "content_hash" "text",
    "ai_tag_version" "text",
    "ai_tagged_at" timestamp with time zone,
    "ai_tag_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ai_tag_claimed_at" timestamp with time zone
);


ALTER TABLE "public"."google_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "text",
    "run_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "google_sync_runs_run_type_check" CHECK (("run_type" = ANY (ARRAY['locations_import'::"text", 'reviews_sync'::"text"]))),
    CONSTRAINT "google_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'done'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."google_sync_runs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."inbox_reviews" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "provider",
    "account_resource_name",
    "location_name",
    "review_name",
    "star_rating",
    "comment",
    "create_time",
    "update_time",
    "reviewer",
    "reply",
    "created_at",
    "updated_at",
    "status",
    "needs_reply",
    "replied_at",
    "reply_text",
    "last_synced_at",
    "location_id",
    "review_id"
   FROM "public"."google_reviews" "gr";


ALTER VIEW "public"."inbox_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "company_name" "text" NOT NULL,
    "legal_name" "text",
    "industry" "text",
    "siret" "text",
    "vat_number" "text",
    "billing_email" "text",
    "billing_phone" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_postal_code" "text",
    "billing_city" "text",
    "billing_region" "text",
    "billing_country" "text" DEFAULT 'FR'::"text" NOT NULL,
    "logo_path" "text",
    "logo_url" "text"
);


ALTER TABLE "public"."legal_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "member_code" "text" DEFAULT "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 10)) NOT NULL,
    "qr_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "points_balance" integer DEFAULT 0 NOT NULL,
    "lifetime_points" integer DEFAULT 0 NOT NULL,
    "visits_count" integer DEFAULT 0 NOT NULL,
    "last_visit_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_members_lifetime_points_nonnegative" CHECK (("lifetime_points" >= 0)),
    CONSTRAINT "loyalty_members_points_balance_nonnegative" CHECK (("points_balance" >= 0)),
    CONSTRAINT "loyalty_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "loyalty_members_visits_count_nonnegative" CHECK (("visits_count" >= 0))
);


ALTER TABLE "public"."loyalty_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "name" "text" DEFAULT 'Programme fidelite'::"text" NOT NULL,
    "points_per_visit" integer DEFAULT 10 NOT NULL,
    "reward_threshold_points" integer DEFAULT 100 NOT NULL,
    "reward_label" "text" DEFAULT 'Recompense disponible'::"text" NOT NULL,
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_programs_points_per_visit_positive" CHECK (("points_per_visit" > 0)),
    CONSTRAINT "loyalty_programs_reward_threshold_positive" CHECK (("reward_threshold_points" > 0))
);


ALTER TABLE "public"."loyalty_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "threshold_points" integer NOT NULL,
    "reward_label" "text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "redeemed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_rewards_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'redeemed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "loyalty_rewards_threshold_positive" CHECK (("threshold_points" > 0))
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "points_added" integer NOT NULL,
    "scan_source" "text" DEFAULT 'scanner'::"text" NOT NULL,
    "idempotency_key" "text",
    "recorded_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_visits_points_added_positive" CHECK (("points_added" > 0)),
    CONSTRAINT "loyalty_visits_scan_source_check" CHECK (("scan_source" = ANY (ARRAY['scanner'::"text", 'manual'::"text", 'public'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."loyalty_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "locations" "text"[] NOT NULL,
    "period_preset" "text",
    "from_date" timestamp with time zone,
    "to_date" timestamp with time zone,
    "timezone" "text" DEFAULT 'Europe/Paris'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "storage_path" "text",
    "last_generated_at" timestamp with time zone,
    "schedule_enabled" boolean DEFAULT false NOT NULL,
    "schedule_rrule" "text",
    "recipients" "text"[],
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "render_mode" "text" DEFAULT 'premium'::"text" NOT NULL,
    "pdf_path" "text",
    "error" "text",
    "generated_at" timestamp with time zone,
    "period" "text",
    "rendered_at" timestamp with time zone,
    "emailed_at" timestamp with time zone,
    "idempotency_key" "text"
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_ai_insights" (
    "review_pk" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_resource_name" "text" NOT NULL,
    "sentiment" "text",
    "sentiment_score" real,
    "summary" "text",
    "topics" "jsonb",
    "model" "text",
    "processed_at" timestamp with time zone,
    "source_update_time" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_ai_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_ai_replies" (
    "review_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "text",
    "draft_text" "text",
    "tone" "text" DEFAULT 'professional'::"text" NOT NULL,
    "length" "text" DEFAULT 'short'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mode" "text" DEFAULT 'draft'::"text" NOT NULL,
    "identity_hash" "text" DEFAULT 'none'::"text" NOT NULL
);


ALTER TABLE "public"."review_ai_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_ai_replies_audit" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "old_len" integer,
    "new_len" integer
);


ALTER TABLE "public"."review_ai_replies_audit" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."review_ai_replies_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."review_ai_replies_audit_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."review_ai_replies_audit_id_seq" OWNED BY "public"."review_ai_replies_audit"."id";



CREATE TABLE IF NOT EXISTS "public"."review_ai_tags" (
    "review_pk" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "polarity" real,
    "confidence" real,
    "evidence" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_ai_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "review_id" "text" NOT NULL,
    "location_id" "text",
    "workflow_id" "uuid",
    "tone" "text",
    "draft_text" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."review_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "review_id" "text" NOT NULL,
    "location_id" "uuid",
    "business_name" "text",
    "source" "text",
    "tone" "text",
    "length" "text",
    "reply_text" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."review_replies" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."review_replies_unified" WITH ("security_invoker"='true') AS
 SELECT ("rar"."review_id")::"text" AS "review_id_text",
    "rar"."review_id" AS "review_id_uuid",
    "rar"."user_id",
    "rar"."location_id",
    "rar"."status",
    "rar"."created_at",
    "rar"."updated_at",
    "rar"."draft_text" AS "text",
    'review_ai_replies'::"text" AS "source_table"
   FROM "public"."review_ai_replies" "rar"
UNION ALL
 SELECT "rr"."review_id" AS "review_id_text",
        CASE
            WHEN (NULLIF("btrim"("rr"."review_id"), ''::"text") IS NULL) THEN NULL::"uuid"
            WHEN (NULLIF("btrim"("rr"."review_id"), ''::"text") ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") THEN (NULLIF("btrim"("rr"."review_id"), ''::"text"))::"uuid"
            ELSE NULL::"uuid"
        END AS "review_id_uuid",
    "rr"."user_id",
    ("rr"."location_id")::"text" AS "location_id",
    "rr"."status",
    "rr"."created_at",
    COALESCE("rr"."sent_at", "rr"."created_at") AS "updated_at",
    "rr"."reply_text" AS "text",
    'review_replies'::"text" AS "source_table"
   FROM "public"."review_replies" "rr";


ALTER VIEW "public"."review_replies_unified" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "review_id" "text" NOT NULL,
    "location_id" "text",
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."review_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."simple_automations" (
    "user_id" "uuid" NOT NULL,
    "negative_alert_enabled" boolean DEFAULT true NOT NULL,
    "ai_suggestion_enabled" boolean DEFAULT true NOT NULL,
    "monthly_report_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."simple_automations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "role" "text" DEFAULT 'editor'::"text" NOT NULL,
    "receive_monthly_reports" boolean DEFAULT false NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."team_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "role" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "receive_monthly_reports" boolean DEFAULT false NOT NULL,
    "email" "text",
    "auth_user_id" "uuid"
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_settings" (
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_passes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'generic'::"text" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "serial_number" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_passes_provider_check" CHECK (("provider" = ANY (ARRAY['generic'::"text", 'apple'::"text", 'google'::"text"]))),
    CONSTRAINT "wallet_passes_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'active'::"text", 'disabled'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."wallet_passes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."review_ai_replies_audit" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."review_ai_replies_audit_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ai_draft_runs"
    ADD CONSTRAINT "ai_draft_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_jobs"
    ADD CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_run_history"
    ADD CONSTRAINT "ai_run_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_tags"
    ADD CONSTRAINT "ai_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_tags"
    ADD CONSTRAINT "ai_tags_tag_key" UNIQUE ("tag");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_actions"
    ADD CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_conditions"
    ADD CONSTRAINT "automation_conditions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_workflows"
    ADD CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_voice"
    ADD CONSTRAINT "brand_voice_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_memory"
    ADD CONSTRAINT "business_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("business_id");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_user_business_unique" UNIQUE ("user_id", "business_name");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_user_id_location_id_place_id_key" UNIQUE ("user_id", "location_id", "place_id");



ALTER TABLE ONLY "public"."cron_state"
    ADD CONSTRAINT "cron_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_accounts"
    ADD CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_accounts"
    ADD CONSTRAINT "google_accounts_user_id_account_resource_name_key" UNIQUE ("user_id", "account_resource_name");



ALTER TABLE ONLY "public"."google_connections"
    ADD CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_connections"
    ADD CONSTRAINT "google_connections_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."google_locations"
    ADD CONSTRAINT "google_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_locations"
    ADD CONSTRAINT "google_locations_user_id_location_resource_name_key" UNIQUE ("user_id", "location_resource_name");



ALTER TABLE ONLY "public"."google_oauth_states"
    ADD CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_oauth_states"
    ADD CONSTRAINT "google_oauth_states_state_key" UNIQUE ("state");



ALTER TABLE ONLY "public"."google_reviews"
    ADD CONSTRAINT "google_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_reviews"
    ADD CONSTRAINT "google_reviews_user_id_review_name_key" UNIQUE ("user_id", "review_name");



ALTER TABLE ONLY "public"."google_reviews"
    ADD CONSTRAINT "google_reviews_user_location_review_uniq" UNIQUE ("user_id", "location_id", "review_id");



ALTER TABLE ONLY "public"."google_reviews"
    ADD CONSTRAINT "google_reviews_user_location_review_unique" UNIQUE ("user_id", "location_id", "review_id");



ALTER TABLE ONLY "public"."google_sync_runs"
    ADD CONSTRAINT "google_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_siret_unique_per_business" UNIQUE ("business_id", "siret");



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_member_code_unique" UNIQUE ("member_code");



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_qr_token_unique" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_public_token_unique" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_user_location_unique" UNIQUE ("user_id", "location_id");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_ai_insights"
    ADD CONSTRAINT "review_ai_insights_pkey" PRIMARY KEY ("review_pk");



ALTER TABLE ONLY "public"."review_ai_replies_audit"
    ADD CONSTRAINT "review_ai_replies_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_ai_replies"
    ADD CONSTRAINT "review_ai_replies_pkey" PRIMARY KEY ("review_id");



ALTER TABLE ONLY "public"."review_ai_tags"
    ADD CONSTRAINT "review_ai_tags_pkey" PRIMARY KEY ("review_pk", "tag_id");



ALTER TABLE ONLY "public"."review_drafts"
    ADD CONSTRAINT "review_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_tags"
    ADD CONSTRAINT "review_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."simple_automations"
    ADD CONSTRAINT "simple_automations_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_invitations"
    ADD CONSTRAINT "team_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_settings"
    ADD CONSTRAINT "team_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_member_provider_unique" UNIQUE ("member_id", "provider");



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_public_token_unique" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_serial_number_unique" UNIQUE ("serial_number");



CREATE INDEX "ai_draft_runs_location_created_idx" ON "public"."ai_draft_runs" USING "btree" ("location_id", "created_at" DESC);



CREATE INDEX "ai_draft_runs_user_created_idx" ON "public"."ai_draft_runs" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "ai_draft_runs_user_location_uniq" ON "public"."ai_draft_runs" USING "btree" ("user_id", "location_id");



CREATE INDEX "ai_jobs_pending_idx" ON "public"."ai_jobs" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "ai_jobs_review_analyze_inflight_uidx" ON "public"."ai_jobs" USING "btree" ("type", COALESCE(("payload" ->> 'review_id'::"text"), ''::"text"), COALESCE(("payload" ->> 'location_id'::"text"), ''::"text")) WHERE (("type" = 'review_analyze'::"text") AND ("status" = ANY (ARRAY['queued'::"text", 'pending'::"text", 'processing'::"text", 'generating'::"text"])));



CREATE INDEX "ai_jobs_status_created_at_idx" ON "public"."ai_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "ai_run_history_aborted_idx" ON "public"."ai_run_history" USING "btree" ("aborted");



CREATE INDEX "ai_run_history_errors_count_idx" ON "public"."ai_run_history" USING "btree" ("errors_count");



CREATE INDEX "ai_run_history_started_at_idx" ON "public"."ai_run_history" USING "btree" ("started_at" DESC);



CREATE INDEX "ai_run_history_user_id_idx" ON "public"."ai_run_history" USING "btree" ("user_id");



CREATE INDEX "alerts_establishment_id_idx" ON "public"."alerts" USING "btree" ("establishment_id");



CREATE UNIQUE INDEX "alerts_unique_legacy_rule_review" ON "public"."alerts" USING "btree" ("rule_code", "review_id") WHERE (("workflow_id" IS NULL) AND ("alert_type" IS NULL));



CREATE UNIQUE INDEX "alerts_unique_workflow_review_type" ON "public"."alerts" USING "btree" ("workflow_id", "review_id", "alert_type") WHERE (("workflow_id" IS NOT NULL) AND ("alert_type" IS NOT NULL));



CREATE INDEX "alerts_unresolved_idx" ON "public"."alerts" USING "btree" ("resolved_at") WHERE ("resolved_at" IS NULL);



CREATE INDEX "alerts_user_id_idx" ON "public"."alerts" USING "btree" ("user_id");



CREATE INDEX "automation_workflows_due_idx" ON "public"."automation_workflows" USING "btree" ("next_run_at", "id") WHERE ("enabled" AND ("trigger" = 'new_review'::"text"));



CREATE INDEX "automation_workflows_user_idx" ON "public"."automation_workflows" USING "btree" ("user_id");



CREATE UNIQUE INDEX "brand_voice_unique_scope" ON "public"."brand_voice" USING "btree" ("user_id", "location_id") NULLS NOT DISTINCT;



CREATE INDEX "business_memory_business_id_idx" ON "public"."business_memory" USING "btree" ("business_id");



CREATE INDEX "business_memory_user_id_idx" ON "public"."business_memory" USING "btree" ("user_id");



CREATE INDEX "business_settings_business_id_idx" ON "public"."business_settings" USING "btree" ("business_id");



CREATE INDEX "business_settings_monthly_report_enabled_idx" ON "public"."business_settings" USING "btree" ("monthly_report_enabled", "user_id");



CREATE INDEX "business_settings_user_id_idx" ON "public"."business_settings" USING "btree" ("user_id");



CREATE INDEX "competitors_user_location_distance_idx" ON "public"."competitors" USING "btree" ("user_id", "location_id", "distance_m");



CREATE INDEX "competitors_user_location_followed_idx" ON "public"."competitors" USING "btree" ("user_id", "location_id", "is_followed");



CREATE UNIQUE INDEX "cron_state_key_idx" ON "public"."cron_state" USING "btree" ("key");



CREATE INDEX "generated_reports_user_type_created_idx" ON "public"."generated_reports" USING "btree" ("user_id", "report_type", "created_at" DESC);



CREATE INDEX "google_connections_sync_due_idx" ON "public"."google_connections" USING "btree" ("next_sync_at", "user_id") WHERE ("active" AND ("sync_status" = 'idle'::"text"));



CREATE INDEX "google_connections_user_id_idx" ON "public"."google_connections" USING "btree" ("user_id");



CREATE UNIQUE INDEX "google_connections_user_provider_uniq" ON "public"."google_connections" USING "btree" ("user_id", "provider");



CREATE UNIQUE INDEX "google_connections_user_provider_unique" ON "public"."google_connections" USING "btree" ("user_id", "provider");



CREATE UNIQUE INDEX "google_locations_id_user_id_uidx" ON "public"."google_locations" USING "btree" ("id", "user_id");



CREATE INDEX "google_locations_legal_entity_id_idx" ON "public"."google_locations" USING "btree" ("legal_entity_id");



CREATE INDEX "google_oauth_states_expires_at_idx" ON "public"."google_oauth_states" USING "btree" ("expires_at");



CREATE INDEX "google_oauth_states_state_idx" ON "public"."google_oauth_states" USING "btree" ("state");



CREATE INDEX "google_oauth_states_user_id_idx" ON "public"."google_oauth_states" USING "btree" ("user_id");



CREATE INDEX "google_reviews_ai_due_idx" ON "public"."google_reviews" USING "btree" ("ai_tag_status", "update_time", "id") WHERE (("comment" IS NOT NULL) AND ("btrim"("comment") <> ''::"text"));



CREATE INDEX "google_reviews_location_id_idx" ON "public"."google_reviews" USING "btree" ("location_id");



CREATE INDEX "google_reviews_location_update_idx" ON "public"."google_reviews" USING "btree" ("location_id", "update_time" DESC);



CREATE INDEX "google_reviews_status_idx" ON "public"."google_reviews" USING "btree" ("status");



CREATE UNIQUE INDEX "google_reviews_unique_idx" ON "public"."google_reviews" USING "btree" ("user_id", "location_id", "review_id");



CREATE INDEX "google_reviews_update_idx" ON "public"."google_reviews" USING "btree" ("update_time" DESC);



CREATE INDEX "google_reviews_update_time_idx" ON "public"."google_reviews" USING "btree" ("update_time" DESC NULLS LAST);



CREATE INDEX "google_reviews_user_id_idx" ON "public"."google_reviews" USING "btree" ("user_id");



CREATE INDEX "google_reviews_user_location_status_idx" ON "public"."google_reviews" USING "btree" ("user_id", "location_id", "status");



CREATE INDEX "google_reviews_user_update_time_idx" ON "public"."google_reviews" USING "btree" ("user_id", "update_time" DESC);



CREATE INDEX "google_sync_runs_user_started_idx" ON "public"."google_sync_runs" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "google_sync_runs_user_type_status_idx" ON "public"."google_sync_runs" USING "btree" ("user_id", "run_type", "status");



CREATE INDEX "idx_ai_tags_name" ON "public"."ai_tags" USING "btree" ("tag");



CREATE INDEX "idx_google_reviews_location_create_time" ON "public"."google_reviews" USING "btree" ("location_id", "create_time");



CREATE INDEX "idx_google_reviews_location_created_at" ON "public"."google_reviews" USING "btree" ("location_id", "created_at");



CREATE INDEX "idx_google_reviews_location_source_time" ON "public"."google_reviews" USING "btree" ("location_id", COALESCE("update_time", "create_time", "created_at"));



CREATE INDEX "idx_google_reviews_location_update_time" ON "public"."google_reviews" USING "btree" ("location_id", "update_time");



CREATE INDEX "idx_review_ai_insights_location" ON "public"."review_ai_insights" USING "btree" ("location_resource_name");



CREATE INDEX "idx_review_ai_insights_processed_at" ON "public"."review_ai_insights" USING "btree" ("processed_at");



CREATE INDEX "idx_review_ai_insights_review_pk_sentiment" ON "public"."review_ai_insights" USING "btree" ("review_pk", "sentiment");



CREATE INDEX "idx_review_ai_insights_sentiment" ON "public"."review_ai_insights" USING "btree" ("sentiment");



CREATE INDEX "idx_review_ai_insights_user_id" ON "public"."review_ai_insights" USING "btree" ("user_id");



CREATE INDEX "idx_review_ai_tags_review_pk" ON "public"."review_ai_tags" USING "btree" ("review_pk");



CREATE INDEX "idx_review_ai_tags_tag_id" ON "public"."review_ai_tags" USING "btree" ("tag_id");



CREATE INDEX "job_queue_status_run_at_idx" ON "public"."job_queue" USING "btree" ("status", "run_at");



CREATE INDEX "job_queue_user_idx" ON "public"."job_queue" USING "btree" ("user_id");



CREATE INDEX "job_queue_user_status_idx" ON "public"."job_queue" USING "btree" ("user_id", "status");



CREATE UNIQUE INDEX "legal_entities_one_default_per_org" ON "public"."legal_entities" USING "btree" ("business_id") WHERE ("is_default" = true);



CREATE INDEX "loyalty_members_location_id_idx" ON "public"."loyalty_members" USING "btree" ("location_id");



CREATE INDEX "loyalty_members_member_code_idx" ON "public"."loyalty_members" USING "btree" ("member_code");



CREATE UNIQUE INDEX "loyalty_members_program_email_uidx" ON "public"."loyalty_members" USING "btree" ("program_id", "lower"("email"));



CREATE INDEX "loyalty_members_program_id_idx" ON "public"."loyalty_members" USING "btree" ("program_id");



CREATE INDEX "loyalty_members_program_upper_code_active_idx" ON "public"."loyalty_members" USING "btree" ("program_id", "upper"("member_code")) WHERE ("status" = 'active'::"text");



CREATE INDEX "loyalty_members_user_location_created_idx" ON "public"."loyalty_members" USING "btree" ("user_id", "location_id", "created_at" DESC);



CREATE INDEX "loyalty_members_user_location_idx" ON "public"."loyalty_members" USING "btree" ("user_id", "location_id");



CREATE INDEX "loyalty_members_user_location_points_idx" ON "public"."loyalty_members" USING "btree" ("user_id", "location_id", "points_balance" DESC);



CREATE INDEX "loyalty_programs_location_id_idx" ON "public"."loyalty_programs" USING "btree" ("location_id");



CREATE INDEX "loyalty_programs_user_location_idx" ON "public"."loyalty_programs" USING "btree" ("user_id", "location_id");



CREATE INDEX "loyalty_rewards_location_id_idx" ON "public"."loyalty_rewards" USING "btree" ("location_id");



CREATE INDEX "loyalty_rewards_member_status_idx" ON "public"."loyalty_rewards" USING "btree" ("member_id", "status");



CREATE UNIQUE INDEX "loyalty_rewards_one_available_per_member_uidx" ON "public"."loyalty_rewards" USING "btree" ("member_id") WHERE ("status" = 'available'::"text");



CREATE INDEX "loyalty_rewards_user_location_status_idx" ON "public"."loyalty_rewards" USING "btree" ("user_id", "location_id", "status");



CREATE INDEX "loyalty_rewards_user_location_status_unlocked_idx" ON "public"."loyalty_rewards" USING "btree" ("user_id", "location_id", "status", "unlocked_at" DESC);



CREATE INDEX "loyalty_visits_location_id_idx" ON "public"."loyalty_visits" USING "btree" ("location_id");



CREATE INDEX "loyalty_visits_member_created_idx" ON "public"."loyalty_visits" USING "btree" ("member_id", "created_at" DESC);



CREATE UNIQUE INDEX "loyalty_visits_member_id_idempotency_uidx" ON "public"."loyalty_visits" USING "btree" ("member_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "loyalty_visits_user_location_created_idx" ON "public"."loyalty_visits" USING "btree" ("user_id", "location_id", "created_at" DESC);



CREATE UNIQUE INDEX "reports_monthly_period_unique_idx" ON "public"."reports" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "reports_render_mode_idx" ON "public"."reports" USING "btree" ("render_mode");



CREATE INDEX "reports_user_created_at_idx" ON "public"."reports" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "reports_user_id_idx" ON "public"."reports" USING "btree" ("user_id");



CREATE UNIQUE INDEX "review_ai_replies_draft_identity_uidx" ON "public"."review_ai_replies" USING "btree" ("user_id", "review_id", "mode", "identity_hash") WHERE ("mode" = 'draft'::"text");



CREATE INDEX "review_ai_replies_identity_hash_idx" ON "public"."review_ai_replies" USING "btree" ("identity_hash");



CREATE INDEX "review_ai_replies_location_id_idx" ON "public"."review_ai_replies" USING "btree" ("location_id");



CREATE UNIQUE INDEX "review_ai_replies_review_mode_uidx" ON "public"."review_ai_replies" USING "btree" ("review_id", "mode");



CREATE INDEX "review_ai_replies_user_id_idx" ON "public"."review_ai_replies" USING "btree" ("user_id");



CREATE UNIQUE INDEX "review_ai_replies_user_id_review_id_uidx" ON "public"."review_ai_replies" USING "btree" ("user_id", "review_id");



CREATE INDEX "review_drafts_user_location_idx" ON "public"."review_drafts" USING "btree" ("user_id", "location_id");



CREATE INDEX "review_replies_review_id_idx" ON "public"."review_replies" USING "btree" ("review_id");



CREATE INDEX "review_replies_user_id_idx" ON "public"."review_replies" USING "btree" ("user_id");



CREATE UNIQUE INDEX "review_replies_user_review_uniq" ON "public"."review_replies" USING "btree" ("user_id", "review_id");



CREATE INDEX "team_invitations_email_status_idx" ON "public"."team_invitations" USING "btree" ("email", "status");



CREATE UNIQUE INDEX "team_invitations_owner_email_status_idx" ON "public"."team_invitations" USING "btree" ("owner_user_id", "email", "status");



CREATE INDEX "team_invitations_owner_status_idx" ON "public"."team_invitations" USING "btree" ("owner_user_id", "status");



CREATE INDEX "team_members_auth_user_id_idx" ON "public"."team_members" USING "btree" ("auth_user_id");



CREATE INDEX "team_members_email_idx" ON "public"."team_members" USING "btree" ("email");



CREATE INDEX "team_members_user_id_idx" ON "public"."team_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uniq_sent_reply_per_review" ON "public"."review_replies" USING "btree" ("user_id", "source", "review_id") WHERE ("status" = 'sent'::"text");



CREATE UNIQUE INDEX "user_profiles_user_id_uniq" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE INDEX "wallet_passes_location_id_idx" ON "public"."wallet_passes" USING "btree" ("location_id");



CREATE INDEX "wallet_passes_member_id_idx" ON "public"."wallet_passes" USING "btree" ("member_id");



CREATE OR REPLACE TRIGGER "reports_monthly_idempotency_key" BEFORE INSERT OR UPDATE OF "user_id", "from_date", "to_date", "period_preset" ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_monthly_report_idempotency_key"();



CREATE OR REPLACE TRIGGER "trg_ai_jobs_on_google_reviews" AFTER INSERT ON "public"."google_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_ai_job_for_review"();



CREATE OR REPLACE TRIGGER "trg_audit_draft_changes" AFTER UPDATE ON "public"."review_ai_replies" FOR EACH ROW EXECUTE FUNCTION "public"."audit_draft_changes"();



CREATE OR REPLACE TRIGGER "trg_competitors_updated_at" BEFORE UPDATE ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_google_connections_updated_at" BEFORE UPDATE ON "public"."google_connections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_legal_entities_updated_at" BEFORE UPDATE ON "public"."legal_entities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_loyalty_members_updated_at" BEFORE UPDATE ON "public"."loyalty_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_loyalty_programs_updated_at" BEFORE UPDATE ON "public"."loyalty_programs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_loyalty_rewards_updated_at" BEFORE UPDATE ON "public"."loyalty_rewards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_draft_regression" BEFORE UPDATE ON "public"."review_ai_replies" FOR EACH ROW WHEN ((("old"."mode" = 'draft'::"text") AND ("new"."mode" = 'draft'::"text"))) EXECUTE FUNCTION "public"."prevent_draft_regression"();



CREATE OR REPLACE TRIGGER "trg_review_ai_insights_updated_at" BEFORE UPDATE ON "public"."review_ai_insights" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_simple_automations_updated_at" BEFORE UPDATE ON "public"."simple_automations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_team_members_monthly_report_email" BEFORE INSERT OR UPDATE OF "receive_monthly_reports" ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_monthly_report_email"();



CREATE OR REPLACE TRIGGER "trg_wallet_passes_updated_at" BEFORE UPDATE ON "public"."wallet_passes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."automation_actions"
    ADD CONSTRAINT "automation_actions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_conditions"
    ADD CONSTRAINT "automation_conditions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brand_voice"
    ADD CONSTRAINT "brand_voice_location_fk" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_memory"
    ADD CONSTRAINT "business_memory_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."business_settings"("business_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_memory"
    ADD CONSTRAINT "business_memory_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_accounts"
    ADD CONSTRAINT "google_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_connections"
    ADD CONSTRAINT "google_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_locations"
    ADD CONSTRAINT "google_locations_legal_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."google_locations"
    ADD CONSTRAINT "google_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_oauth_states"
    ADD CONSTRAINT "google_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_reviews"
    ADD CONSTRAINT "google_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."google_sync_runs"
    ADD CONSTRAINT "google_sync_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_members"
    ADD CONSTRAINT "loyalty_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_location_owner_fk" FOREIGN KEY ("location_id", "user_id") REFERENCES "public"."google_locations"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_programs"
    ADD CONSTRAINT "loyalty_programs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_ai_insights"
    ADD CONSTRAINT "review_ai_insights_review_pk_fkey" FOREIGN KEY ("review_pk") REFERENCES "public"."google_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_ai_tags"
    ADD CONSTRAINT "review_ai_tags_review_pk_fkey" FOREIGN KEY ("review_pk") REFERENCES "public"."google_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_ai_tags"
    ADD CONSTRAINT "review_ai_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."ai_tags"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."review_drafts"
    ADD CONSTRAINT "review_drafts_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_replies"
    ADD CONSTRAINT "review_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."simple_automations"
    ADD CONSTRAINT "simple_automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_settings"
    ADD CONSTRAINT "team_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."google_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_passes"
    ADD CONSTRAINT "wallet_passes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ai_draft_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_draft_runs_insert_own" ON "public"."ai_draft_runs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "ai_draft_runs_select_own" ON "public"."ai_draft_runs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "ai_draft_runs_update_own" ON "public"."ai_draft_runs" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ai_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_jobs_insert_own" ON "public"."ai_jobs" FOR INSERT TO "authenticated" WITH CHECK ((COALESCE(("payload" ->> 'user_id'::"text"), ''::"text") = ("auth"."uid"())::"text"));



CREATE POLICY "ai_jobs_select_own" ON "public"."ai_jobs" FOR SELECT TO "authenticated" USING ((COALESCE(("payload" ->> 'user_id'::"text"), ''::"text") = ("auth"."uid"())::"text"));



ALTER TABLE "public"."ai_run_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_tags_select_auth" ON "public"."ai_tags" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alerts_delete_own" ON "public"."alerts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "alerts_insert_own" ON "public"."alerts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "alerts_select_own" ON "public"."alerts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "alerts_update_own" ON "public"."alerts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."automation_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_actions_delete_own" ON "public"."automation_actions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_actions_insert_own" ON "public"."automation_actions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_actions_select_own" ON "public"."automation_actions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_actions_update_own" ON "public"."automation_actions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."automation_conditions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_conditions_delete_own" ON "public"."automation_conditions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_conditions_insert_own" ON "public"."automation_conditions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_conditions_select_own" ON "public"."automation_conditions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_conditions_update_own" ON "public"."automation_conditions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."automation_workflows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_workflows_delete_own" ON "public"."automation_workflows" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_workflows_insert_own" ON "public"."automation_workflows" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_workflows_select_own" ON "public"."automation_workflows" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "automation_workflows_update_own" ON "public"."automation_workflows" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."brand_voice" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brand_voice_delete_admin" ON "public"."brand_voice" FOR DELETE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "brand_voice_insert_admin" ON "public"."brand_voice" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "brand_voice_insert_own" ON "public"."brand_voice" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "brand_voice_select_own" ON "public"."brand_voice" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "brand_voice_update_admin" ON "public"."brand_voice" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "brand_voice_update_own" ON "public"."brand_voice" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."business_memory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_memory_delete_own" ON "public"."business_memory" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "business_memory_insert_own" ON "public"."business_memory" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "business_memory_select_own" ON "public"."business_memory" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_settings_insert_own" ON "public"."business_settings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "business_settings_select_own" ON "public"."business_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "business_settings_update_own" ON "public"."business_settings" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."competitors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competitors_delete_own" ON "public"."competitors" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "competitors_insert_own" ON "public"."competitors" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "competitors_select_own" ON "public"."competitors" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "competitors_update_own" ON "public"."competitors" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."cron_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cron_state_delete_own" ON "public"."cron_state" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cron_state_insert_own" ON "public"."cron_state" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "cron_state_select_auth" ON "public"."cron_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cron_state_select_own" ON "public"."cron_state" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "cron_state_update_own" ON "public"."cron_state" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "delete_own_google_accounts" ON "public"."google_accounts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_google_locations" ON "public"."google_locations" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_google_reviews" ON "public"."google_reviews" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_reports_select_own" ON "public"."generated_reports" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "generated_reports_write_own" ON "public"."generated_reports" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."google_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "google_reviews_delete_own" ON "public"."google_reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "google_reviews_insert_own" ON "public"."google_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "google_reviews_select_own" ON "public"."google_reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "google_reviews_update_own" ON "public"."google_reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."google_sync_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own_google_accounts" ON "public"."google_accounts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_google_locations" ON "public"."google_locations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_google_reviews" ON "public"."google_reviews" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_google_sync_runs" ON "public"."google_sync_runs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_queue_insert_own" ON "public"."job_queue" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "job_queue_select_own" ON "public"."job_queue" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."legal_entities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_entities_select_own_business" ON "public"."legal_entities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."business_settings" "bs"
  WHERE (("bs"."business_id" = "legal_entities"."business_id") AND ("bs"."user_id" = "auth"."uid"())))));



CREATE POLICY "legal_entities_write_own_business" ON "public"."legal_entities" USING ((EXISTS ( SELECT 1
   FROM "public"."business_settings" "bs"
  WHERE (("bs"."business_id" = "legal_entities"."business_id") AND ("bs"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."business_settings" "bs"
  WHERE (("bs"."business_id" = "legal_entities"."business_id") AND ("bs"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."loyalty_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_members_delete_own" ON "public"."loyalty_members" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_members_insert_own" ON "public"."loyalty_members" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."loyalty_programs" "lp"
  WHERE (("lp"."id" = "loyalty_members"."program_id") AND ("lp"."user_id" = "auth"."uid"()) AND ("lp"."location_id" = "loyalty_members"."location_id"))))));



CREATE POLICY "loyalty_members_select_own" ON "public"."loyalty_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_members_update_own" ON "public"."loyalty_members" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."loyalty_programs" "lp"
  WHERE (("lp"."id" = "loyalty_members"."program_id") AND ("lp"."user_id" = "auth"."uid"()) AND ("lp"."location_id" = "loyalty_members"."location_id"))))));



ALTER TABLE "public"."loyalty_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_programs_delete_own" ON "public"."loyalty_programs" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_programs_insert_own" ON "public"."loyalty_programs" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."google_locations" "gl"
  WHERE (("gl"."id" = "loyalty_programs"."location_id") AND ("gl"."user_id" = "auth"."uid"()))))));



CREATE POLICY "loyalty_programs_select_own" ON "public"."loyalty_programs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_programs_update_own" ON "public"."loyalty_programs" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."google_locations" "gl"
  WHERE (("gl"."id" = "loyalty_programs"."location_id") AND ("gl"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."loyalty_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_rewards_delete_own" ON "public"."loyalty_rewards" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_rewards_insert_own" ON "public"."loyalty_rewards" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."loyalty_programs" "lp"
  WHERE (("lp"."id" = "loyalty_rewards"."program_id") AND ("lp"."user_id" = "auth"."uid"()) AND ("lp"."location_id" = "loyalty_rewards"."location_id"))))));



CREATE POLICY "loyalty_rewards_select_own" ON "public"."loyalty_rewards" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_rewards_update_own" ON "public"."loyalty_rewards" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."loyalty_visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_visits_insert_own" ON "public"."loyalty_visits" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."loyalty_programs" "lp"
  WHERE (("lp"."id" = "loyalty_visits"."program_id") AND ("lp"."user_id" = "auth"."uid"()) AND ("lp"."location_id" = "loyalty_visits"."location_id"))))));



CREATE POLICY "loyalty_visits_select_own" ON "public"."loyalty_visits" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "no delete from client" ON "public"."google_connections" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "no insert from client" ON "public"."google_connections" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "no update from client" ON "public"."google_connections" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "read own google connections" ON "public"."google_connections" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_delete_own" ON "public"."reports" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "reports_select_own" ON "public"."reports" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "reports_update_own" ON "public"."reports" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."review_ai_insights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_ai_insights_select_own" ON "public"."review_ai_insights" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."review_ai_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_ai_replies_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_ai_replies_insert_own" ON "public"."review_ai_replies" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "review_ai_replies_select_own" ON "public"."review_ai_replies" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "review_ai_replies_update_own" ON "public"."review_ai_replies" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."review_ai_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_ai_tags_select_own" ON "public"."review_ai_tags" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."google_reviews" "gr"
  WHERE (("gr"."id" = "review_ai_tags"."review_pk") AND ("gr"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."review_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_drafts_delete_own" ON "public"."review_drafts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_drafts_insert_own" ON "public"."review_drafts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "review_drafts_select_own" ON "public"."review_drafts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_drafts_update_own" ON "public"."review_drafts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."review_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_replies_insert_own" ON "public"."review_replies" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "review_replies_select_own" ON "public"."review_replies" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_replies_update_own" ON "public"."review_replies" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."review_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_tags_delete" ON "public"."review_tags" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_delete_own" ON "public"."review_tags" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_insert" ON "public"."review_tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_insert_own" ON "public"."review_tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_select" ON "public"."review_tags" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_select_own" ON "public"."review_tags" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "review_tags_update_own" ON "public"."review_tags" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "select own google_connections" ON "public"."google_connections" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_google_accounts" ON "public"."google_accounts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_google_connections" ON "public"."google_connections" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_google_locations" ON "public"."google_locations" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_google_reviews" ON "public"."google_reviews" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_google_sync_runs" ON "public"."google_sync_runs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."simple_automations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "simple_automations_select_own" ON "public"."simple_automations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "simple_automations_write_own" ON "public"."simple_automations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."team_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_invitations_owner_delete" ON "public"."team_invitations" FOR DELETE USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "team_invitations_owner_insert" ON "public"."team_invitations" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "team_invitations_owner_select" ON "public"."team_invitations" FOR SELECT USING (("auth"."uid"() = "owner_user_id"));



CREATE POLICY "team_invitations_owner_update" ON "public"."team_invitations" FOR UPDATE USING (("auth"."uid"() = "owner_user_id")) WITH CHECK (("auth"."uid"() = "owner_user_id"));



ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_members_auth_select" ON "public"."team_members" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "team_members_delete_own" ON "public"."team_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "team_members_insert_own" ON "public"."team_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "team_members_select_own" ON "public"."team_members" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "team_members_update_own" ON "public"."team_members" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."team_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_settings_delete_own" ON "public"."team_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "team_settings_insert_own" ON "public"."team_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "team_settings_select_own" ON "public"."team_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "team_settings_update_own" ON "public"."team_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update own google connections" ON "public"."google_connections" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_google_accounts" ON "public"."google_accounts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_google_connections" ON "public"."google_connections" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_google_locations" ON "public"."google_locations" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_google_reviews" ON "public"."google_reviews" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "upsert own google connections" ON "public"."google_connections" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "upsert_own_google_connections" ON "public"."google_connections" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user can read own google connection" ON "public"."google_connections" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_select_own" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_profiles_update_own" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_select_own" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."wallet_passes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_passes_delete_own" ON "public"."wallet_passes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_passes_insert_own" ON "public"."wallet_passes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."loyalty_programs" "lp"
  WHERE (("lp"."id" = "wallet_passes"."program_id") AND ("lp"."user_id" = "auth"."uid"()) AND ("lp"."location_id" = "wallet_passes"."location_id"))))));



CREATE POLICY "wallet_passes_select_own" ON "public"."wallet_passes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_passes_update_own" ON "public"."wallet_passes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_tag_candidates"("p_user_id" "uuid", "p_location_id" "text", "p_since_time" timestamp with time zone, "p_since_id" "uuid", "p_limit" integer, "p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."ai_tag_candidates"("p_user_id" "uuid", "p_location_id" "text", "p_since_time" timestamp with time zone, "p_since_id" "uuid", "p_limit" integer, "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_tag_candidates"("p_user_id" "uuid", "p_location_id" "text", "p_since_time" timestamp with time zone, "p_since_id" "uuid", "p_limit" integer, "p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_tag_candidates_count"("p_user_id" "uuid", "p_location_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ai_tag_candidates_count"("p_user_id" "uuid", "p_location_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_tag_candidates_count"("p_user_id" "uuid", "p_location_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_draft_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_draft_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_draft_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_ai_tag_candidates"("p_limit" integer, "p_version" "text", "p_location_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_ai_tag_candidates"("p_limit" integer, "p_version" "text", "p_location_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_automation_workflows"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_automation_workflows"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_google_sync_connections"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_google_sync_connections"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_review_analyze_jobs"("p_limit" integer, "p_user_id" "text", "p_location_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_ai_job_for_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_ai_job_for_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_ai_job_for_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_monthly_report_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_monthly_report_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_monthly_report_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_user_profile"("p_user_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_profile"("p_user_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_profile"("p_user_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inbox_reviews"("p_location_id" "text", "p_limit" integer, "p_only_with_comment" boolean, "p_lookback_days" integer, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inbox_reviews"("p_location_id" "text", "p_limit" integer, "p_only_with_comment" boolean, "p_lookback_days" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inbox_reviews"("p_location_id" "text", "p_limit" integer, "p_only_with_comment" boolean, "p_lookback_days" integer, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_loyalty_program"("p_public_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid", "p_review_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid", "p_review_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reviews_to_reply"("p_location_id" "text", "p_limit" integer, "p_lookback_days" integer, "p_user_id" "uuid", "p_review_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."job_queue_claim"("max_jobs" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_queue_claim"("max_jobs" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_loyalty_program"("p_public_token" "uuid", "p_first_name" "text", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_rating_min" numeric, "p_rating_max" numeric, "p_sentiment" "text", "p_status" "text", "p_tags" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_rating_min" numeric, "p_rating_max" numeric, "p_sentiment" "text", "p_status" "text", "p_tags" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."kpi_summary"("p_location_id" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_rating_min" numeric, "p_rating_max" numeric, "p_sentiment" "text", "p_status" "text", "p_tags" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_draft_regression"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_draft_regression"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_draft_regression"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text", "p_qr_token" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text", "p_qr_token" "uuid", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text", "p_qr_token" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_loyalty_visit"("p_location_id" "uuid", "p_member_code" "text", "p_qr_token" "uuid", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_monthly_report_idempotency_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_monthly_report_idempotency_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_monthly_report_idempotency_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_draft_runs" TO "anon";
GRANT ALL ON TABLE "public"."ai_draft_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_draft_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_jobs" TO "anon";
GRANT ALL ON TABLE "public"."ai_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_run_history" TO "anon";
GRANT ALL ON TABLE "public"."ai_run_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_run_history" TO "service_role";



GRANT ALL ON TABLE "public"."ai_tags" TO "anon";
GRANT ALL ON TABLE "public"."ai_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_tags" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."automation_actions" TO "anon";
GRANT ALL ON TABLE "public"."automation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_actions" TO "service_role";



GRANT ALL ON TABLE "public"."automation_conditions" TO "anon";
GRANT ALL ON TABLE "public"."automation_conditions" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_conditions" TO "service_role";



GRANT ALL ON TABLE "public"."automation_workflows" TO "anon";
GRANT ALL ON TABLE "public"."automation_workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_workflows" TO "service_role";



GRANT ALL ON TABLE "public"."brand_voice" TO "anon";
GRANT ALL ON TABLE "public"."brand_voice" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_voice" TO "service_role";



GRANT ALL ON TABLE "public"."business_memory" TO "anon";
GRANT ALL ON TABLE "public"."business_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."business_memory" TO "service_role";



GRANT ALL ON TABLE "public"."business_memory_effective" TO "service_role";
GRANT SELECT ON TABLE "public"."business_memory_effective" TO "authenticated";



GRANT ALL ON TABLE "public"."business_settings" TO "anon";
GRANT ALL ON TABLE "public"."business_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_settings" TO "service_role";



GRANT ALL ON TABLE "public"."competitors" TO "anon";
GRANT ALL ON TABLE "public"."competitors" TO "authenticated";
GRANT ALL ON TABLE "public"."competitors" TO "service_role";



GRANT ALL ON TABLE "public"."cron_state" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cron_state" TO "authenticated";



GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";



GRANT ALL ON TABLE "public"."google_accounts" TO "anon";
GRANT ALL ON TABLE "public"."google_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."google_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."google_connections" TO "anon";
GRANT ALL ON TABLE "public"."google_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."google_connections" TO "service_role";



GRANT ALL ON TABLE "public"."google_locations" TO "anon";
GRANT ALL ON TABLE "public"."google_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."google_locations" TO "service_role";



GRANT ALL ON TABLE "public"."google_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."google_reviews" TO "anon";
GRANT ALL ON TABLE "public"."google_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."google_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."google_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."google_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."google_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."inbox_reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."inbox_reviews" TO "authenticated";



GRANT ALL ON TABLE "public"."job_queue" TO "anon";
GRANT ALL ON TABLE "public"."job_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."job_queue" TO "service_role";



GRANT ALL ON TABLE "public"."legal_entities" TO "anon";
GRANT ALL ON TABLE "public"."legal_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_entities" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_members" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_members" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_programs" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_visits" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."review_ai_insights" TO "anon";
GRANT ALL ON TABLE "public"."review_ai_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."review_ai_insights" TO "service_role";



GRANT ALL ON TABLE "public"."review_ai_replies" TO "anon";
GRANT ALL ON TABLE "public"."review_ai_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."review_ai_replies" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."review_ai_replies_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."review_ai_replies_audit" TO "service_role";



GRANT ALL ON SEQUENCE "public"."review_ai_replies_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."review_ai_replies_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."review_ai_replies_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."review_ai_tags" TO "anon";
GRANT ALL ON TABLE "public"."review_ai_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."review_ai_tags" TO "service_role";



GRANT ALL ON TABLE "public"."review_drafts" TO "anon";
GRANT ALL ON TABLE "public"."review_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."review_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."review_replies" TO "anon";
GRANT ALL ON TABLE "public"."review_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."review_replies" TO "service_role";



GRANT ALL ON TABLE "public"."review_replies_unified" TO "anon";
GRANT ALL ON TABLE "public"."review_replies_unified" TO "authenticated";
GRANT ALL ON TABLE "public"."review_replies_unified" TO "service_role";



GRANT ALL ON TABLE "public"."review_tags" TO "anon";
GRANT ALL ON TABLE "public"."review_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."review_tags" TO "service_role";



GRANT ALL ON TABLE "public"."simple_automations" TO "anon";
GRANT ALL ON TABLE "public"."simple_automations" TO "authenticated";
GRANT ALL ON TABLE "public"."simple_automations" TO "service_role";



GRANT ALL ON TABLE "public"."team_invitations" TO "anon";
GRANT ALL ON TABLE "public"."team_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."team_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."team_settings" TO "anon";
GRANT ALL ON TABLE "public"."team_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."team_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."user_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_passes" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_passes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
