import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type AiTag = {
  name: string;
  weight?: number;
  polarity?: number;
  confidence?: number;
  evidence?: string;
  category?: string;
};

type AiResult = {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sentiment_score: number;
  summary: string;
  topics: AiTag[];
  model: string;
};

const CURSOR_KEY = "ai_tag_cursor_v1";

const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return "";
};

const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceRoleKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
const cronSecret = getEnv(["CRON_SECRET"]);

const getMissingEnv = () => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!cronSecret) missing.push("CRON_SECRET");
  return missing;
};

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

type Cursor = {
  last_review_pk: string | null;
};

const loadCursor = async (): Promise<Cursor> => {
  const { data } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  return (data?.value as Cursor) ?? { last_review_pk: null };
};

const saveCursor = async (cursor: Cursor) => {
  await supabaseAdmin.from("cron_state").upsert({
    key: CURSOR_KEY,
    value: cursor,
    updated_at: new Date().toISOString()
  });
};

const getAuthSecret = (req: VercelRequest) => {
  const secretParam = req.query?.secret;
  if (Array.isArray(secretParam)) {
    return secretParam[0] ?? "";
  }
  return secretParam ?? "";
};

const analyzeReview = async (_review: {
  id: string;
  comment: string;
}) => {
  return {
    sentiment: "neutral",
    sentiment_score: 0,
    summary: "",
    topics: [],
    model: "stub"
  } as AiResult;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    req.headers["x-request-id"]?.toString() ?? `req_${crypto.randomUUID()}`;
  const start = Date.now();
  const MAX_MS = Number(process.env.CRON_MAX_MS ?? 24000);
  const MAX_REVIEWS = Number(process.env.CRON_MAX_REVIEWS ?? 40);
  const timeUp = () => Date.now() - start > MAX_MS;
  const method = req.method ?? "GET";
  res.setHeader("Cache-Control", "no-store");
  console.log("[ai]", requestId, method, req.url ?? "/api/cron/ai/tag-reviews");

  if (method !== "POST" && method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    console.error("[ai]", requestId, "missing env:", missingEnv);
    return res
      .status(500)
      .json({ error: `Missing env: ${missingEnv.join(", ")}` });
  }

  const providedSecret = getAuthSecret(req);
  if (!providedSecret || providedSecret !== cronSecret) {
    console.error("[ai]", requestId, "invalid cron secret");
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (method === "GET") {
    return res.status(200).json({
      ok: true,
      requestId,
      mode: "healthcheck",
      message: "Use POST to run the sync."
    });
  }

  const errors: Array<{ reviewId: string; message: string }> = [];
  let reviewsScanned = 0;
  let reviewsProcessed = 0;
  let tagsUpserted = 0;

  try {
    const cursor = await loadCursor();
    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, user_id, location_id, location_name, comment, update_time, review_ai_insights(source_update_time)"
      )
      .not("comment", "is", null)
      .neq("comment", "")
      .order("update_time", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_REVIEWS);

    if (cursor.last_review_pk) {
      query = query.gt("id", cursor.last_review_pk);
    }

    const { data: reviews, error: reviewsError } = await query;

    if (reviewsError) {
      console.error("[ai]", requestId, "reviews fetch failed", reviewsError);
      return res.status(500).json({ error: "Failed to load reviews" });
    }

    for (const review of reviews ?? []) {
      if (timeUp()) {
        break;
      }
      const insightValue = review.review_ai_insights as
        | { source_update_time?: string }
        | Array<{ source_update_time?: string }>
        | null;
      const existingSourceUpdate = Array.isArray(insightValue)
        ? insightValue[0]?.source_update_time ?? null
        : insightValue?.source_update_time ?? null;
      if (existingSourceUpdate && review.update_time) {
        if (new Date(review.update_time).getTime() <= new Date(existingSourceUpdate).getTime()) {
          await saveCursor({ last_review_pk: review.id });
          continue;
        }
      }
      reviewsScanned += 1;
      try {
        const analysis = await analyzeReview({
          id: review.id,
          comment: review.comment
        });

        const nowIso = new Date().toISOString();
        const { error: insightError } = await supabaseAdmin
          .from("review_ai_insights")
          .upsert({
            review_pk: review.id,
            user_id: review.user_id,
            location_resource_name: review.location_id ?? review.location_name,
            sentiment: analysis.sentiment,
            sentiment_score: analysis.sentiment_score,
            summary: analysis.summary,
            topics: analysis.topics,
            model: analysis.model,
            processed_at: nowIso,
            source_update_time: review.update_time ?? nowIso,
            error: null
          });

        if (insightError) {
          console.error("[ai]", requestId, "insight upsert failed", insightError);
          await supabaseAdmin.from("review_ai_insights").upsert({
            review_pk: review.id,
            user_id: review.user_id,
            location_resource_name: review.location_id ?? review.location_name,
            processed_at: nowIso,
            source_update_time: review.update_time ?? nowIso,
            error: insightError.message ?? "insight upsert failed"
          });
          errors.push({ reviewId: review.id, message: insightError.message });
          await saveCursor({ last_review_pk: review.id });
          continue;
        }

        for (const tag of analysis.topics ?? []) {
          const { data: tagRow, error: tagError } = await supabaseAdmin
            .from("ai_tags")
            .upsert(
              { tag: tag.name, category: tag.category ?? null },
              { onConflict: "tag" }
            )
            .select("id")
            .maybeSingle();

          if (tagError || !tagRow?.id) {
            errors.push({
              reviewId: review.id,
              message: tagError?.message ?? "tag upsert failed"
            });
            continue;
          }

          await supabaseAdmin
            .from("review_ai_tags")
            .upsert({
              review_pk: review.id,
              tag_id: tagRow.id,
              polarity: tag.polarity ?? null,
              confidence: tag.confidence ?? null,
              evidence: tag.evidence ?? null
            });
          tagsUpserted += 1;
        }

        reviewsProcessed += 1;
        await saveCursor({ last_review_pk: review.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({ reviewId: review.id, message });
        console.error("[ai]", requestId, "review failed", message);
        await saveCursor({ last_review_pk: review.id });
      }
    }

    const aborted = timeUp();
    return res.status(200).json({
      ok: true,
      requestId,
      aborted,
      stats: {
        reviewsScanned,
        reviewsProcessed,
        tagsUpserted,
        errors
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ai]", requestId, "fatal error", message);
    return res.status(500).json({ error: message });
  }
}
