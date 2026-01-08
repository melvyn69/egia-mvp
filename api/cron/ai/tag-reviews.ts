import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

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

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
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

const upsertAiStatus = async (
  userId: string,
  locationId: string,
  value: {
    status: "idle" | "running" | "done" | "error";
    last_run_at?: string;
    aborted?: boolean;
    cursor?: Cursor | null;
    stats?: { processed?: number; tagsUpserted?: number };
    errors_count?: number;
    last_error?: string | null;
    missing_insights_count?: number;
  }
) => {
  await supabaseAdmin.from("cron_state").upsert({
    key: `ai_status_v1:${userId}:${locationId}`,
    value,
    updated_at: new Date().toISOString()
  });
};

const LOCK_TTL_MS = 90_000;

const acquireLock = async (
  userId: string,
  locationId: string
): Promise<boolean> => {
  const key = `lock_ai_tag_v1:${userId}:${locationId}`;
  const { data } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const lockedAt = (data?.value as { locked_at?: string } | null)?.locked_at;
  if (lockedAt) {
    const age = Date.now() - new Date(lockedAt).getTime();
    if (Number.isFinite(age) && age < LOCK_TTL_MS) {
      return false;
    }
  }
  await supabaseAdmin.from("cron_state").upsert({
    key,
    value: { locked_at: new Date().toISOString() },
    updated_at: new Date().toISOString()
  });
  return true;
};

const releaseLock = async (userId: string, locationId: string) => {
  const key = `lock_ai_tag_v1:${userId}:${locationId}`;
  await supabaseAdmin.from("cron_state").delete().eq("key", key);
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const analyzeReview = async (
  review: { id: string; comment: string },
  requestId: string,
  debugInfo?: {
    openaiStatus?: number;
    openaiId?: string;
    outputTextPreview?: string;
    parsedKeys?: string[];
  }
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const shouldRetry = (status: number) => [429, 503, 504].includes(status);

  try {
    const body = JSON.stringify({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "review_ai_tags",
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
                    sentiment: {
                      type: "string",
                      enum: ["positive", "neutral", "negative"]
                    },
                    confidence: { type: "number" }
                  },
                  required: ["name", "sentiment", "confidence"]
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
            "Return ONLY valid JSON matching the schema. No prose. No markdown. " +
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
    });

    let response: Response | null = null;
    let attempt = 0;
    while (attempt < 2) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal,
          body
        });
      } finally {
        clearTimeout(timeout);
      }
      if (response.ok || !shouldRetry(response.status) || attempt === 1) {
        break;
      }
      await sleep(400);
      attempt += 1;
    }
    if (!response) {
      throw new Error("OpenAI response missing");
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    if (debugInfo) {
      debugInfo.openaiStatus = response.status;
      debugInfo.openaiId = payload?.id ?? null;
    }
    const outputText =
      (typeof payload?.output_text === "string" && payload.output_text.trim()
        ? payload.output_text
        : null) ??
      (() => {
        const chunks: string[] = [];
        const outputItems = Array.isArray(payload?.output) ? payload.output : [];
        for (const item of outputItems) {
          const contentItems = Array.isArray(item?.content) ? item.content : [];
          for (const content of contentItems) {
            const text =
              typeof content?.text === "string" ? content.text : undefined;
            if (text) {
              chunks.push(text);
            }
          }
        }
        return chunks.length ? chunks.join("\n") : null;
      })();
    if (!outputText) {
      throw new Error("OpenAI response missing output_text");
    }

    let parsed: AiResult;
    try {
      parsed = JSON.parse(outputText) as AiResult;
    } catch (error) {
      if (debugInfo) {
        debugInfo.outputTextPreview = outputText.slice(0, 200);
      }
      console.error(
        "[ai-tag]",
        requestId,
        "OpenAI JSON parse failed",
        outputText.slice(0, 300)
      );
      throw error;
    }
    if (debugInfo) {
      debugInfo.outputTextPreview = outputText.slice(0, 200);
      debugInfo.parsedKeys = Object.keys(parsed ?? {});
    }
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
  const errorsByLocation = new Map<string, number>();
  const processedByLocation = new Map<string, number>();
  const tagsByLocation = new Map<string, number>();
  const lastErrorByLocation = new Map<string, string>();
  const locationUserMap = new Map<string, string>();

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

    const { data: missingCountData, error: missingCountError } =
      await supabaseAdmin.rpc("ai_tag_candidates_count", {
        p_user_id: null,
        p_location_id: null
      });
    if (missingCountError) {
      console.error("[ai-tag]", requestId, "missing count failed", missingCountError);
    }
    totalMissingInsights = Number(missingCountData ?? 0);
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
    const { data: candidates, error: candidatesError } =
      await supabaseAdmin.rpc("ai_tag_candidates", {
        p_user_id: null,
        p_location_id: null,
        p_since_time: lastSourceTime,
        p_since_id: lastReviewPk,
        p_limit: MAX_REVIEWS,
        p_force: force
      });

    if (candidatesError) {
      console.error("[ai-tag]", requestId, "candidates rpc failed", candidatesError);
      return res.status(500).json({ error: "Failed to load candidates" });
    }

    const candidateRows = candidates ?? [];
    candidatesFound = candidateRows.length;
    console.log(
      "[ai-tag]",
      requestId,
      "candidatesFound",
      candidatesFound
    );
    if (candidateRows.length > 0) {
      console.log(
        "[ai-tag]",
        requestId,
        "candidateRange",
        candidateRows[0]?.id,
        candidateRows[candidateRows.length - 1]?.id
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
            since_time: string;
            since_id: string;
          };
          openaiStatus?: number;
          openaiId?: string | null;
          outputTextPreview?: string;
          parsedKeys?: string[];
          reason?: string;
        }
      | undefined;

    if (debugEnabled) {
      debug = {
        cursorIn: cursor,
        candidatesSample: candidateRows.slice(0, 5).map((review) => ({
          id: review.id,
          update_time: review.update_time ?? null,
          create_time: review.create_time ?? null,
          user_id: review.user_id ?? null,
          location_id: review.location_id ?? null,
          comment_len: review.comment?.length ?? 0
        })),
        candidateQueryMeta: {
          filter:
            "comment not null and length(trim(comment))>0 and no existing insights",
          order: "coalesce(update_time, create_time, created_at) asc, id asc",
          limit: MAX_REVIEWS,
          force,
          since_time: lastSourceTime,
          since_id: lastReviewPk
        }
      };
    }

    if (totalMissingInsights > 0 && candidatesFound === 0) {
      if (!debug) {
        debug = {
          cursorIn: cursor,
          candidatesSample: [],
          candidateQueryMeta: {
            filter:
              "comment not null and length(trim(comment))>0 and no existing insights",
            order: "coalesce(update_time, create_time, created_at) asc, id asc",
            limit: MAX_REVIEWS,
            force,
            since_time: lastSourceTime,
            since_id: lastReviewPk
          }
        };
      }
      debug.reason = force
        ? "RPC returned 0 rows; data may not match filters (comment empty/blank or missing timestamps)."
        : "RPC returned 0 rows; cursor may be too advanced (try &force=1 or reset ai_tag_cursor_v2).";
    }

    const nowIso = new Date().toISOString();
    candidateRows.forEach((review) => {
      if (review.location_id && review.user_id) {
        if (!locationUserMap.has(review.location_id)) {
          locationUserMap.set(review.location_id, review.user_id);
        }
      }
    });
    const locationIds = Array.from(
      new Set(
        candidateRows
          .map((review) => review.location_id)
          .filter((value): value is string => Boolean(value))
      )
    );
    const lockedLocations = new Set<string>();
    const locationStats = new Map<
      string,
      { withText: number; missingInsights: number }
    >();
    for (const locationId of locationIds) {
      const { count } = await supabaseAdmin
        .from("google_reviews")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .not("comment", "is", null)
        .neq("comment", "");
      const { data: missingData } = await supabaseAdmin.rpc(
        "ai_tag_candidates_count",
        {
          p_user_id: null,
          p_location_id: locationId
        }
      );
      const withText = count ?? 0;
      const missingInsights = Number(missingData ?? 0);
      locationStats.set(locationId, { withText, missingInsights });
      const userIdForLocation = locationUserMap.get(locationId);
      if (userIdForLocation) {
        const locked = await acquireLock(userIdForLocation, locationId);
        if (!locked) {
          continue;
        }
        lockedLocations.add(locationId);
        await upsertAiStatus(userIdForLocation, locationId, {
          status: "running",
          last_run_at: nowIso,
          aborted: false,
          cursor,
          stats: { processed: 0, tagsUpserted: 0 },
          errors_count: 0,
          last_error: null,
          missing_insights_count: missingInsights
        });
      }
    }

    if (lockedLocations.size === 0 && locationIds.length > 0) {
      return res.status(200).json({
        ok: true,
        requestId,
        aborted: false,
        skipReason: "locked",
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

    const candidateRowsByLock = candidateRows.filter((review) =>
      review.location_id ? lockedLocations.has(review.location_id) : false
    );

    if (candidateRowsByLock.length === 0 && candidatesFound > 0) {
      return res.status(200).json({
        ok: true,
        requestId,
        aborted: false,
        skipReason: "locked",
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

    for (const review of candidateRowsByLock) {
      if (timeUp() || reviewsScanned >= MAX_REVIEWS) {
        break;
      }
      const effectiveUpdateTime =
        review.update_time ?? review.create_time ?? review.created_at ?? null;
      const locationId = review.location_id ?? null;
      if (!effectiveUpdateTime) {
        errors.push({ reviewId: review.id, message: "Missing source_time" });
        console.error("[ai-tag]", requestId, "missing source_time", review.id);
        if (locationId) {
          errorsByLocation.set(
            locationId,
            (errorsByLocation.get(locationId) ?? 0) + 1
          );
          lastErrorByLocation.set(locationId, "Missing source_time");
        }
        continue;
      }

      reviewsScanned += 1;
      try {
        reviewsProcessed += 1;
        const analysis = await analyzeReview(
          {
            id: review.id,
            comment: review.comment
          },
          requestId,
          debug
        );

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
          if (review.location_id) {
            errorsByLocation.set(
              review.location_id,
              (errorsByLocation.get(review.location_id) ?? 0) + 1
            );
            lastErrorByLocation.set(
              review.location_id,
              insightError.message ?? "insight upsert failed"
            );
          }
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
          if (locationId) {
            tagsByLocation.set(
              locationId,
              (tagsByLocation.get(locationId) ?? 0) + 1
            );
          }
        }

        if (locationId) {
          processedByLocation.set(
            locationId,
            (processedByLocation.get(locationId) ?? 0) + 1
          );
        }
        await saveCursor({
          last_source_time: effectiveUpdateTime,
          last_review_pk: review.id
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({ reviewId: review.id, message });
        console.error("[ai]", requestId, "review failed", message);
        if (review.location_id) {
          errorsByLocation.set(
            review.location_id,
            (errorsByLocation.get(review.location_id) ?? 0) + 1
          );
          lastErrorByLocation.set(review.location_id, message);
        }
        await saveCursor({
          last_source_time: effectiveUpdateTime ?? lastSourceTime,
          last_review_pk: review.id
        });
      }
    }

    const aborted = timeUp() || reviewsScanned >= MAX_REVIEWS;

    for (const locationId of lockedLocations) {
      const { data: missingData } = await supabaseAdmin.rpc(
        "ai_tag_candidates_count",
        {
          p_user_id: null,
          p_location_id: locationId
        }
      );
      const missingInsights = Number(missingData ?? 0);
      const withText = locationStats.get(locationId)?.withText ?? 0;
      const errorsCount = errorsByLocation.get(locationId) ?? 0;
      const processedCount = processedByLocation.get(locationId) ?? 0;
      const tagsCount = tagsByLocation.get(locationId) ?? 0;
      let status: "idle" | "running" | "done" | "error" = "running";
      if (!aborted && errorsCount === 0 && missingInsights === 0) {
        status = "done";
      } else if (errorsCount > 0) {
        status = "error";
      }
      const userIdForLocation = locationUserMap.get(locationId);
      if (userIdForLocation) {
        await upsertAiStatus(userIdForLocation, locationId, {
          status,
          last_run_at: nowIso,
          aborted,
          cursor,
          stats: { processed: processedCount, tagsUpserted: tagsCount },
          errors_count: errorsCount,
          last_error: lastErrorByLocation.get(locationId) ?? null,
          missing_insights_count: missingInsights
        });
        await releaseLock(userIdForLocation, locationId);
      }
    }

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
    if (locationUserMap.size > 0) {
      const nowIso = new Date().toISOString();
      for (const [locationId, userId] of locationUserMap.entries()) {
        await upsertAiStatus(userId, locationId, {
          status: "error",
          last_run_at: nowIso,
          aborted: false,
          cursor: null,
          stats: { processed: 0, tagsUpserted: 0 },
          errors_count: 1,
          last_error: message,
          missing_insights_count: null
        });
        await releaseLock(userId, locationId);
      }
    }
    return res.status(500).json({ error: message });
  }
}
