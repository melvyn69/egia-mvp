import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars");
  }
  const looksLikeJwt = serviceRoleKey.split(".").length === 3;
  if (!looksLikeJwt) {
    throw new Error("SERVICE_ROLE_KEY missing/invalid format");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      headers: { apikey: serviceRoleKey }
    }
  });
};

const buildFallbackDraft = (review: {
  author_name?: string | null;
  rating?: number | null;
  comment?: string | null;
  location_name?: string | null;
}) => {
  const author = review.author_name?.trim() || "merci";
  const rating = review.rating ?? null;
  const location = review.location_name?.trim();
  const intro = rating !== null && rating <= 2 ? "Nous sommes désolés" : "Merci";
  const body = review.comment
    ? `Nous avons bien pris en compte votre retour: "${review.comment}".`
    : "";
  const outro = "Nous restons à votre écoute.";
  return `${intro} ${author}${location ? ` (${location})` : ""}. ${body} ${outro}`.trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const processSecret = Deno.env.get("PROCESS_REVIEW_ANALYZE_SECRET");
    if (processSecret) {
      const header = req.headers.get("x-process-secret");
      if (header !== processSecret) {
        return json(401, { ok: false, error: "Unauthorized" });
      }
    }
    const key = (Deno.env.get("SERVICE_ROLE_KEY") ?? "").trim();
    const present = Boolean(key);
    const looksLikeJwt = key.split(".").length === 3;
    if (!present || !looksLikeJwt) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "SERVICE_ROLE_KEY missing/invalid format",
          debug: { present, looksLikeJwt }
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const supabaseAdmin = getSupabaseAdmin();
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limitRaw = (payload as { limit?: number }).limit ?? 10;
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 10));
    const userId = typeof payload.user_id === "string" ? payload.user_id : null;
    const locationId =
      typeof payload.location_id === "string" ? payload.location_id : null;

    const { data: jobs, error: claimError } = await supabaseAdmin.rpc(
      "claim_review_analyze_jobs",
      {
        p_limit: limit,
        p_user_id: userId,
        p_location_id: locationId
      }
    );
    if (claimError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to claim jobs",
          details: {
            message: claimError.message,
            code: (claimError as unknown as { code?: string }).code,
            hint: (claimError as unknown as { hint?: string }).hint,
            details: (claimError as unknown as { details?: string }).details
          }
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const claimed = (jobs ?? []) as Array<{ id: string; payload: Record<string, unknown> }>;
    if (claimed.length === 0) {
      return json(200, { ok: true, processed: 0, done: 0, error: 0 });
    }

    let done = 0;
    let errors = 0;

    for (const job of claimed) {
      const jobId = job.id;
      const payloadData = job.payload || {};
      const reviewId = typeof payloadData.review_id === "string" ? payloadData.review_id : "";
      const jobUserId = typeof payloadData.user_id === "string" ? payloadData.user_id : "";
      const jobLocationId =
        typeof payloadData.location_id === "string" ? payloadData.location_id : null;

      if (!reviewId || !jobUserId) {
        await supabaseAdmin
          .from("ai_jobs")
          .update({ status: "error", finished_at: new Date().toISOString(), error: "Missing payload" })
          .eq("id", jobId);
        errors += 1;
        continue;
      }

      try {
        const { data: reviewRow, error: reviewError } = await supabaseAdmin
          .from("google_reviews")
          .select("id, user_id, location_id, author_name, rating, comment, location_name")
          .eq("id", reviewId)
          .eq("user_id", jobUserId)
          .maybeSingle();
        if (reviewError) {
          throw new Error(reviewError.message || "Failed to load review");
        }
        if (!reviewRow) {
          throw new Error("Review not found");
        }

        const { data: existingDraft, error: existingDraftError } = await supabaseAdmin
          .from("review_ai_replies")
          .select("draft_text")
          .eq("review_id", reviewId)
          .eq("user_id", jobUserId)
          .maybeSingle();
        if (existingDraftError) {
          throw new Error(existingDraftError.message || "Failed to load existing draft");
        }
        const existingText = existingDraft?.draft_text
          ? String(existingDraft.draft_text).trim()
          : "";

        if (!existingText) {
          const draftText = buildFallbackDraft(reviewRow);
          const computedReviewIdForInsert = reviewId;
          console.log("[process-review-analyze] draft upsert", {
            job_id: jobId,
            payload_review_id: reviewId,
            computed_review_id_used_for_insert: computedReviewIdForInsert
          });
          const { error: upsertError } = await supabaseAdmin
            .from("review_ai_replies")
            .upsert(
              {
                review_id: computedReviewIdForInsert,
                user_id: jobUserId,
                location_id: jobLocationId ?? reviewRow.location_id ?? null,
                draft_text: draftText,
                status: "draft",
                updated_at: new Date().toISOString()
              },
              { onConflict: "user_id,review_id" }
            );
          if (upsertError) {
            throw new Error(upsertError.message || "Failed to upsert draft");
          }

          const { data: persistedDraft, error: persistedDraftError } = await supabaseAdmin
            .from("review_ai_replies")
            .select("review_id, draft_text")
            .eq("review_id", computedReviewIdForInsert)
            .eq("user_id", jobUserId)
            .maybeSingle();
          if (persistedDraftError) {
            throw new Error(persistedDraftError.message || "Failed to verify draft write");
          }
          const persistedText = persistedDraft?.draft_text
            ? String(persistedDraft.draft_text).trim()
            : "";
          if (!persistedDraft?.review_id || !persistedText) {
            throw new Error("Draft write verification failed");
          }
        }

        const { error: doneError } = await supabaseAdmin
          .from("ai_jobs")
          .update({ status: "done", finished_at: new Date().toISOString(), error: null })
          .eq("id", jobId);
        if (doneError) {
          throw new Error(doneError.message || "Failed to mark job done");
        }
        done += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Job failed";
        const shortMessage = message.slice(0, 500);
        const { error: markError } = await supabaseAdmin
          .from("ai_jobs")
          .update({ status: "error", finished_at: new Date().toISOString(), error: shortMessage })
          .eq("id", jobId);
        if (markError) {
          console.error("[process-review-analyze] failed to mark job error", {
            job_id: jobId,
            message: markError.message
          });
        }
        errors += 1;
      }
    }

    return json(200, { ok: true, processed: claimed.length, done, error: errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json(500, { ok: false, error: message });
  }
});
