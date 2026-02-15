drop policy "ai_run_history_select" on "public"."ai_run_history";

drop view if exists "public"."inbox_reviews";

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

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


