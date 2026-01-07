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
