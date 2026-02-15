drop extension if exists "pg_net";

drop policy "ai_run_history_select" on "public"."ai_run_history";

drop policy "delete_own_google_connections" on "public"."google_connections";

drop policy "insert_own_google_connections" on "public"."google_connections";

drop policy "insert_own_review_replies" on "public"."review_replies";

drop policy "select_own_review_replies" on "public"."review_replies";

drop policy "update_own_review_replies" on "public"."review_replies";

drop policy "brand_voice_delete_admin" on "public"."brand_voice";

drop policy "brand_voice_insert_admin" on "public"."brand_voice";

drop policy "brand_voice_update_admin" on "public"."brand_voice";

drop policy "review_replies_insert_own" on "public"."review_replies";

drop policy "review_replies_select_own" on "public"."review_replies";

alter table "public"."google_reviews" drop constraint "google_reviews_user_id_location_id_review_id_key";

drop index if exists "public"."google_accounts_user_id_idx";

drop index if exists "public"."google_locations_user_id_idx";

drop index if exists "public"."google_reviews_user_id_location_id_review_id_key";

drop index if exists "public"."google_reviews_update_time_idx";


  create table "public"."cron_state" (
    "key" text not null,
    "value" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone not null default now(),
    "user_id" uuid
      );


alter table "public"."cron_state" enable row level security;


  create table "public"."simple_automations" (
    "user_id" uuid not null,
    "negative_alert_enabled" boolean not null default true,
    "ai_suggestion_enabled" boolean not null default true,
    "monthly_report_enabled" boolean not null default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."simple_automations" enable row level security;

alter table "public"."business_memory" add column "user_id" uuid;

alter table "public"."business_memory" alter column "created_at" set not null;

alter table "public"."business_memory" alter column "is_active" set not null;

alter table "public"."business_memory" alter column "kind" set not null;

alter table "public"."business_memory" enable row level security;

alter table "public"."business_settings" add column "language_level" text;

alter table "public"."business_settings" add column "use_emojis" boolean default false;

alter table "public"."business_settings" alter column "business_id" set default gen_random_uuid();

alter table "public"."business_settings" alter column "default_length" set not null;

alter table "public"."business_settings" alter column "default_tone" set not null;

alter table "public"."business_settings" alter column "updated_at" set not null;

alter table "public"."business_settings" enable row level security;

alter table "public"."google_connections" add column "token_expiry" timestamp with time zone;

alter table "public"."google_connections" alter column "provider" set default 'google_gbp'::text;

alter table "public"."google_connections" alter column "refresh_token" set not null;

alter table "public"."google_oauth_states" add column "redirect_to" text;

alter table "public"."google_oauth_states" alter column "expires_at" set default (now() + '00:15:00'::interval);

alter table "public"."google_reviews" drop column "inserted_at";

alter table "public"."google_reviews" add column "account_resource_name" text;

alter table "public"."google_reviews" add column "provider" text not null default 'google'::text;

alter table "public"."google_reviews" add column "reply" jsonb;

alter table "public"."google_reviews" add column "review_name" text not null;

alter table "public"."google_reviews" add column "reviewer" jsonb;

alter table "public"."google_reviews" add column "star_rating" text;

alter table "public"."google_reviews" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."google_reviews" alter column "created_at" set default now();

alter table "public"."google_reviews" alter column "created_at" set not null;

alter table "public"."google_reviews" alter column "location_id" drop not null;

alter table "public"."google_reviews" alter column "location_name" set default ''::text;

alter table "public"."google_reviews" alter column "location_name" set not null;

alter table "public"."google_reviews" alter column "needs_reply" set default true;

alter table "public"."google_reviews" alter column "review_id" drop not null;

alter table "public"."reports" add column "error" text;

alter table "public"."reports" add column "generated_at" timestamp with time zone;

alter table "public"."reports" add column "pdf_path" text;

alter table "public"."reports" add column "period" text;

alter table "public"."review_replies" alter column "created_at" set not null;

CREATE INDEX business_memory_user_id_idx ON public.business_memory USING btree (user_id);

CREATE UNIQUE INDEX business_settings_user_business_unique ON public.business_settings USING btree (user_id, business_name);

CREATE UNIQUE INDEX business_settings_user_id_unique ON public.business_settings USING btree (user_id);

CREATE UNIQUE INDEX cron_state_key_idx ON public.cron_state USING btree (key);

CREATE UNIQUE INDEX cron_state_pkey ON public.cron_state USING btree (key);

CREATE UNIQUE INDEX google_connections_user_provider_uniq ON public.google_connections USING btree (user_id, provider);

CREATE UNIQUE INDEX google_connections_user_provider_unique ON public.google_connections USING btree (user_id, provider);

CREATE INDEX google_oauth_states_expires_at_idx ON public.google_oauth_states USING btree (expires_at);

CREATE UNIQUE INDEX google_oauth_states_state_key ON public.google_oauth_states USING btree (state);

CREATE INDEX google_reviews_location_update_idx ON public.google_reviews USING btree (location_id, update_time DESC);

CREATE INDEX google_reviews_update_idx ON public.google_reviews USING btree (update_time DESC);

CREATE UNIQUE INDEX google_reviews_user_id_review_name_key ON public.google_reviews USING btree (user_id, review_name);

CREATE UNIQUE INDEX google_reviews_user_location_review_uniq ON public.google_reviews USING btree (user_id, location_id, review_id);

CREATE INDEX idx_review_replies_user_review ON public.review_replies USING btree (user_id, review_id);

CREATE UNIQUE INDEX simple_automations_pkey ON public.simple_automations USING btree (user_id);

CREATE INDEX team_members_email_idx ON public.team_members USING btree (email);

CREATE UNIQUE INDEX uniq_sent_reply_per_review ON public.review_replies USING btree (user_id, source, review_id) WHERE (status = 'sent'::text);

CREATE INDEX google_reviews_update_time_idx ON public.google_reviews USING btree (update_time DESC NULLS LAST);

alter table "public"."cron_state" add constraint "cron_state_pkey" PRIMARY KEY using index "cron_state_pkey";

alter table "public"."simple_automations" add constraint "simple_automations_pkey" PRIMARY KEY using index "simple_automations_pkey";

alter table "public"."business_memory" add constraint "business_memory_user_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."business_memory" validate constraint "business_memory_user_fk";

alter table "public"."business_settings" add constraint "business_settings_user_business_unique" UNIQUE using index "business_settings_user_business_unique";

alter table "public"."business_settings" add constraint "business_settings_user_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."business_settings" validate constraint "business_settings_user_fk";

alter table "public"."business_settings" add constraint "business_settings_user_id_unique" UNIQUE using index "business_settings_user_id_unique";

alter table "public"."google_oauth_states" add constraint "google_oauth_states_state_key" UNIQUE using index "google_oauth_states_state_key";

alter table "public"."google_reviews" add constraint "google_reviews_user_id_review_name_key" UNIQUE using index "google_reviews_user_id_review_name_key";

alter table "public"."google_reviews" add constraint "google_reviews_user_location_review_uniq" UNIQUE using index "google_reviews_user_location_review_uniq";

alter table "public"."simple_automations" add constraint "simple_automations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."simple_automations" validate constraint "simple_automations_user_id_fkey";

set check_function_bodies = off;

create or replace view "public"."business_memory_effective" as  SELECT DISTINCT ON (kind, content, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), business_id) kind,
    content,
    business_id,
    user_id,
    created_at
   FROM public.business_memory
  WHERE (is_active = true);


create or replace view "public"."inbox_reviews" as  SELECT id,
    user_id,
    provider,
    account_resource_name,
    location_name,
    review_name,
    star_rating,
    comment,
    create_time,
    update_time,
    reviewer,
    reply,
    created_at,
    updated_at,
    status,
    needs_reply,
    replied_at,
    reply_text,
    last_synced_at,
    location_id,
    review_id
   FROM public.google_reviews gr;


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ai_tag_candidates(p_user_id uuid DEFAULT NULL::uuid, p_location_id text DEFAULT NULL::text, p_since_time timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, p_since_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_limit integer DEFAULT 150, p_force boolean DEFAULT false)
 RETURNS TABLE(id uuid, user_id uuid, location_id text, location_name text, comment text, update_time timestamp with time zone, create_time timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

grant delete on table "public"."ai_jobs" to "anon";

grant insert on table "public"."ai_jobs" to "anon";

grant references on table "public"."ai_jobs" to "anon";

grant select on table "public"."ai_jobs" to "anon";

grant trigger on table "public"."ai_jobs" to "anon";

grant truncate on table "public"."ai_jobs" to "anon";

grant update on table "public"."ai_jobs" to "anon";

grant delete on table "public"."ai_jobs" to "authenticated";

grant insert on table "public"."ai_jobs" to "authenticated";

grant references on table "public"."ai_jobs" to "authenticated";

grant select on table "public"."ai_jobs" to "authenticated";

grant trigger on table "public"."ai_jobs" to "authenticated";

grant truncate on table "public"."ai_jobs" to "authenticated";

grant update on table "public"."ai_jobs" to "authenticated";

grant delete on table "public"."cron_state" to "authenticated";

grant insert on table "public"."cron_state" to "authenticated";

grant select on table "public"."cron_state" to "authenticated";

grant update on table "public"."cron_state" to "authenticated";

grant delete on table "public"."cron_state" to "service_role";

grant insert on table "public"."cron_state" to "service_role";

grant references on table "public"."cron_state" to "service_role";

grant select on table "public"."cron_state" to "service_role";

grant trigger on table "public"."cron_state" to "service_role";

grant truncate on table "public"."cron_state" to "service_role";

grant update on table "public"."cron_state" to "service_role";

grant delete on table "public"."simple_automations" to "anon";

grant insert on table "public"."simple_automations" to "anon";

grant references on table "public"."simple_automations" to "anon";

grant select on table "public"."simple_automations" to "anon";

grant trigger on table "public"."simple_automations" to "anon";

grant truncate on table "public"."simple_automations" to "anon";

grant update on table "public"."simple_automations" to "anon";

grant delete on table "public"."simple_automations" to "authenticated";

grant insert on table "public"."simple_automations" to "authenticated";

grant references on table "public"."simple_automations" to "authenticated";

grant select on table "public"."simple_automations" to "authenticated";

grant trigger on table "public"."simple_automations" to "authenticated";

grant truncate on table "public"."simple_automations" to "authenticated";

grant update on table "public"."simple_automations" to "authenticated";

grant delete on table "public"."simple_automations" to "service_role";

grant insert on table "public"."simple_automations" to "service_role";

grant references on table "public"."simple_automations" to "service_role";

grant select on table "public"."simple_automations" to "service_role";

grant trigger on table "public"."simple_automations" to "service_role";

grant truncate on table "public"."simple_automations" to "service_role";

grant update on table "public"."simple_automations" to "service_role";


  create policy "business_memory_delete_own"
  on "public"."business_memory"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = user_id));



  create policy "business_memory_insert_own"
  on "public"."business_memory"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "business_memory_select_own"
  on "public"."business_memory"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "business_settings_insert_own"
  on "public"."business_settings"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "business_settings_select_own"
  on "public"."business_settings"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "business_settings_update_own"
  on "public"."business_settings"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "cron_state_delete_own"
  on "public"."cron_state"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));



  create policy "cron_state_insert_own"
  on "public"."cron_state"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "cron_state_select_auth"
  on "public"."cron_state"
  as permissive
  for select
  to authenticated
using (true);



  create policy "cron_state_select_own"
  on "public"."cron_state"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "cron_state_update_own"
  on "public"."cron_state"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "no delete from client"
  on "public"."google_connections"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "no insert from client"
  on "public"."google_connections"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "no update from client"
  on "public"."google_connections"
  as permissive
  for update
  to authenticated
using (false);



  create policy "read own google connections"
  on "public"."google_connections"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "select own google_connections"
  on "public"."google_connections"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "update own google connections"
  on "public"."google_connections"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "upsert own google connections"
  on "public"."google_connections"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "upsert_own_google_connections"
  on "public"."google_connections"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "user can read own google connection"
  on "public"."google_connections"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "google_reviews_delete_own"
  on "public"."google_reviews"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "google_reviews_insert_own"
  on "public"."google_reviews"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "google_reviews_select_own"
  on "public"."google_reviews"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "google_reviews_update_own"
  on "public"."google_reviews"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "review_replies_update_own"
  on "public"."review_replies"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "review_tags_delete"
  on "public"."review_tags"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "review_tags_insert"
  on "public"."review_tags"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "review_tags_select"
  on "public"."review_tags"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "simple_automations_select_own"
  on "public"."simple_automations"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "simple_automations_write_own"
  on "public"."simple_automations"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "brand_voice_delete_admin"
  on "public"."brand_voice"
  as permissive
  for delete
  to public
using ((auth.role() = 'service_role'::text));



  create policy "brand_voice_insert_admin"
  on "public"."brand_voice"
  as permissive
  for insert
  to public
with check ((auth.role() = 'service_role'::text));



  create policy "brand_voice_update_admin"
  on "public"."brand_voice"
  as permissive
  for update
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "review_replies_insert_own"
  on "public"."review_replies"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "review_replies_select_own"
  on "public"."review_replies"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));


CREATE TRIGGER trg_google_connections_updated_at BEFORE UPDATE ON public.google_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_simple_automations_updated_at BEFORE UPDATE ON public.simple_automations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

drop trigger if exists "objects_delete_delete_prefix" on "storage"."objects";

drop trigger if exists "objects_insert_create_prefix" on "storage"."objects";

drop trigger if exists "objects_update_create_prefix" on "storage"."objects";

drop trigger if exists "prefixes_create_hierarchy" on "storage"."prefixes";

drop trigger if exists "prefixes_delete_hierarchy" on "storage"."prefixes";

drop policy "brand_assets_objects_delete_own" on "storage"."objects";

drop policy "brand_assets_objects_insert_own" on "storage"."objects";

drop policy "brand_assets_objects_select_own" on "storage"."objects";

drop policy "brand_assets_objects_update_own" on "storage"."objects";


  create policy "brand_assets_objects_select_public"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'brand-assets'::text));


CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


