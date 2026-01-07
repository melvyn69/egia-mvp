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

const CURSOR_KEY = "ai_tag_cursor_v2";

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
  last_source_time: string | null;
  last_review_pk: string | null;
};

const loadCursor = async (): Promise<Cursor> => {
  const { data } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  return (data?.value as Cursor) ?? {
    last_source_time: "1970-01-01T00:00:00.000Z",
    last_review_pk: "00000000-0000-0000-0000-000000000000"
  };
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeTopics = (topics: AiTag[]) => {
  const maxTopics = Number(process.env.AI_TAG_MAX_TOPICS ?? 8);
  const seen = new Set<string>();
  const allowedCategories = new Set([
    "service",
    "produit",
    "prix",
    "attente",
    "livraison",
    "propreté",
    "ambiance",
    "communication",
    "qualité",
    "autre"
  ]);

  const normalized: AiTag[] = [];
  for (const topic of topics ?? []) {
    if (!topic?.name) {
      continue;
    }
    const name = String(topic.name).trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const category = allowedCategories.has(topic.category ?? "")
      ? topic.category
      : "autre";
    normalized.push({
      name,
      weight: typeof topic.weight === "number" ? topic.weight : undefined,
      polarity:
        typeof topic.polarity === "number"
          ? clamp(topic.polarity, -1, 1)
          : undefined,
      confidence:
        typeof topic.confidence === "number"
          ? clamp(topic.confidence, 0, 1)
          : undefined,
      evidence: topic.evidence ? String(topic.evidence).slice(0, 90) : undefined,
      category
    });
    if (normalized.length >= maxTopics) {
      break;
    }
  }
  return normalized;
};

const analyzeReview = async (review: { id: string; comment: string }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "review_ai_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                sentiment: {
                  type: "string",
                  enum: ["positive", "neutral", "negative", "mixed"]
                },
                sentiment_score: { type: "number" },
                summary: { type: "string" },
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      weight: { type: "number" },
                      polarity: { type: "number" },
                      confidence: { type: "number" },
                      evidence: { type: "string" },
                      category: { type: "string" }
                    },
                    required: ["name"]
                  }
                }
              },
              required: ["sentiment", "sentiment_score", "summary", "topics"]
            }
          }
        },
        input: [
          {
            role: "system",
            content:
              "Tu es un analyste d'avis Google. Réponds en français uniquement. " +
              "Retourne strictement du JSON valide selon le schéma fourni. " +
              "Les tags doivent être courts (2-4 mots), sans emoji."
          },
          {
            role: "user",
            content:
              "Analyse cet avis client et produis les champs demandés (sentiment, score, résumé, topics). " +
              "Base-toi uniquement sur le commentaire suivant:\n\n" +
              review.comment
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const outputText =
      payload?.output_text ??
      payload?.output?.[0]?.content?.[0]?.text ??
      null;
    if (!outputText) {
      throw new Error("OpenAI response missing output_text");
    }

    const parsed = JSON.parse(outputText) as AiResult;
    const sentimentScore = clamp(parsed.sentiment_score, -1, 1);
    return {
      sentiment: parsed.sentiment,
      sentiment_score: sentimentScore,
      summary: String(parsed.summary ?? "").slice(0, 180),
      topics: normalizeTopics(parsed.topics ?? []),
      model
    } satisfies AiResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("OpenAI request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  let candidatesFound = 0;
  let totalWithText = 0;
  let totalMissingInsights = 0;
  let skipReason: string | null = null;

  try {
    const cursor = await loadCursor();
    console.log("[ai-tag]", requestId, "cursor", cursor);
    const forceParam = req.query?.force;
    const force =
      forceParam === "1" || (Array.isArray(forceParam) && forceParam[0] === "1");

    const totalWithTextQuery = await supabaseAdmin
      .from("google_reviews")
      .select("id", { count: "exact", head: true })
      .not("comment", "is", null)
      .neq("comment", "");
    totalWithText = totalWithTextQuery.count ?? 0;

    const totalMissingInsightsQuery = await supabaseAdmin
      .from("google_reviews")
      .select("id, review_ai_insights(review_pk)", { count: "exact", head: true })
      .not("comment", "is", null)
      .neq("comment", "")
      .is("review_ai_insights.review_pk", null);
    totalMissingInsights = totalMissingInsightsQuery.count ?? 0;
    console.log(
      "[ai-tag]",
      requestId,
      "totalMissingInsights",
      totalMissingInsights
    );

    const lastSourceTime = force
      ? "1970-01-01T00:00:00.000Z"
      : cursor.last_source_time ?? "1970-01-01T00:00:00.000Z";
    const lastReviewPk = force
      ? "00000000-0000-0000-0000-000000000000"
      : cursor.last_review_pk ?? "00000000-0000-0000-0000-000000000000";
    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, user_id, location_id, location_name, comment, update_time, create_time, created_at, review_ai_insights(review_pk)"
      )
      .not("comment", "is", null)
      .neq("comment", "")
      .is("review_ai_insights.review_pk", null)
      .order("update_time", { ascending: true, nullsFirst: false })
      .order("create_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(MAX_REVIEWS);

    if (!force) {
      query = query.or(
        `and(update_time.gt.${lastSourceTime}),` +
          `and(update_time.eq.${lastSourceTime},id.gt.${lastReviewPk}),` +
          `and(update_time.is.null,create_time.gt.${lastSourceTime}),` +
          `and(update_time.is.null,create_time.eq.${lastSourceTime},id.gt.${lastReviewPk}),` +
          `and(update_time.is.null,create_time.is.null,created_at.gt.${lastSourceTime}),` +
          `and(update_time.is.null,create_time.is.null,created_at.eq.${lastSourceTime},id.gt.${lastReviewPk})`
      );
    }

    const { data: reviews, error: reviewsError } = await query;

    if (reviewsError) {
      console.error("[ai]", requestId, "reviews fetch failed", reviewsError);
      return res.status(500).json({ error: "Failed to load reviews" });
    }

    const reviewsList = reviews ?? [];

    const candidates = reviewsList.filter((review) => {
      if (!review.comment || review.comment.trim().length === 0) {
        return false;
      }
      return true;
    });

    candidates.sort((a, b) => {
      const timeA = a.update_time ?? a.create_time ?? a.created_at ?? "";
      const timeB = b.update_time ?? b.create_time ?? b.created_at ?? "";
      if (timeA === timeB) {
        return a.id.localeCompare(b.id);
      }
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    candidatesFound = candidates.length;
    console.log(
      "[ai-tag]",
      requestId,
      "candidatesFound",
      candidatesFound
    );
    if (candidates.length > 0) {
      console.log(
        "[ai-tag]",
        requestId,
        "candidateRange",
        candidates[0]?.id,
        candidates[candidates.length - 1]?.id
      );
    }

    const debugEnabled =
      req.query?.debug === "1" ||
      (Array.isArray(req.query?.debug) && req.query?.debug[0] === "1");
    let debug:
      | {
          cursorIn: Cursor;
          candidatesSample: Array<{
            id: string;
            update_time: string | null;
            create_time: string | null;
            user_id: string | null;
            location_id: string | null;
            comment_len: number;
          }>;
          candidateQueryMeta: {
            filter: string;
            order: string;
            limit: number;
            force: boolean;
          };
          reason?: string;
        }
      | undefined;

    if (debugEnabled) {
      debug = {
        cursorIn: cursor,
        candidatesSample: candidates.slice(0, 5).map((review) => ({
          id: review.id,
          update_time: review.update_time ?? null,
          create_time: review.create_time ?? null,
          user_id: review.user_id ?? null,
          location_id: review.location_id ?? null,
          comment_len: review.comment?.length ?? 0
        })),
        candidateQueryMeta: {
          filter:
            "comment not null and length(trim(comment))>0 and review_ai_insights.review_pk is null",
          order: "coalesce(update_time, create_time, created_at) asc, id asc",
          limit: MAX_REVIEWS,
          force
        }
      };
    }

    if (totalMissingInsights > 0 && candidatesFound === 0 && debug) {
      debug.reason = force
        ? "No candidates returned; data may not match filters (comment empty/blank or missing timestamps)."
        : "Cursor may be too advanced; try &force=1 or reset ai_tag_cursor_v2.";
    }

    if (candidatesFound === 0) {
      skipReason = "no_candidates";
      const aborted = timeUp();
      return res.status(200).json({
        ok: true,
        requestId,
        aborted,
        skipReason,
        debug,
        stats: {
          totalWithText,
          totalMissingInsights,
          reviewsProcessed,
          tagsUpserted,
          candidatesFound,
          errors
        }
      });
    }

    for (const review of candidates) {
      if (timeUp() || reviewsScanned >= MAX_REVIEWS) {
        break;
      }
      const effectiveUpdateTime =
        review.update_time ?? review.create_time ?? review.created_at ?? null;
      if (!effectiveUpdateTime) {
        errors.push({ reviewId: review.id, message: "Missing source_time" });
        console.error("[ai-tag]", requestId, "missing source_time", review.id);
        continue;
      }

      reviewsScanned += 1;
      try {
        reviewsProcessed += 1;
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
            source_update_time: effectiveUpdateTime,
            error: null
          });

        if (insightError) {
          console.error("[ai]", requestId, "insight upsert failed", insightError);
          await supabaseAdmin.from("review_ai_insights").upsert({
            review_pk: review.id,
            user_id: review.user_id,
            location_resource_name: review.location_id ?? review.location_name,
            processed_at: nowIso,
            source_update_time: effectiveUpdateTime,
            error: insightError.message ?? "insight upsert failed"
          });
          errors.push({ reviewId: review.id, message: insightError.message });
          await saveCursor({
            last_source_time: effectiveUpdateTime,
            last_review_pk: review.id
          });
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

        await saveCursor({
          last_source_time: effectiveUpdateTime,
          last_review_pk: review.id
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({ reviewId: review.id, message });
        console.error("[ai]", requestId, "review failed", message);
        await saveCursor({
          last_source_time: effectiveUpdateTime ?? lastSourceTime,
          last_review_pk: review.id
        });
      }
    }

    const aborted = timeUp() || reviewsScanned >= MAX_REVIEWS;
    if (reviewsProcessed === 0 && !skipReason) {
      skipReason = "short_circuit_removed";
    }
    return res.status(200).json({
      ok: true,
      requestId,
      aborted,
      skipReason,
      debug,
      stats: {
        totalWithText,
        totalMissingInsights,
        reviewsProcessed,
        tagsUpserted,
        candidatesFound,
        errors
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ai]", requestId, "fatal error", message);
    return res.status(500).json({ error: message });
  }
}
