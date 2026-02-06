import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../database.types.js";
import {
  getRequestId,
  sendError,
  logRequest
} from "../../../api_utils.js";

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
  const cronTable = supabaseAdmin.from("cron_state") as any;
  const { data } = await cronTable
    .select("value")
    .eq("key", CURSOR_KEY)
    .is("user_id", null)
    .maybeSingle();
  return (data?.value as Cursor) ?? {
    last_source_time: "1970-01-01T00:00:00.000Z",
    last_review_pk: "00000000-0000-0000-0000-000000000000"
  };
};

const saveCursor = async (cursor: Cursor) => {
  const cronTable = supabaseAdmin.from("cron_state") as any;
  await cronTable.upsert({
    key: CURSOR_KEY,
    value: cursor,
    user_id: null,
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
  const cronTable = supabaseAdmin.from("cron_state") as any;
  await cronTable.upsert({
    key: `ai_status_v1:${userId}:${locationId}`,
    value,
    user_id: userId,
    updated_at: new Date().toISOString()
  });
};

const LOCK_TTL_MS = 90_000;

const acquireLock = async (
  userId: string,
  locationId: string
): Promise<boolean> => {
  const key = `lock_ai_tag_v1:${userId}:${locationId}`;
  const cronTable = supabaseAdmin.from("cron_state") as any;
  const { data } = await cronTable
    .select("value")
    .eq("key", key)
    .eq("user_id", userId)
    .maybeSingle();
  const lockedAt = (data?.value as { locked_at?: string } | null)?.locked_at;
  if (lockedAt) {
    const age = Date.now() - new Date(lockedAt).getTime();
    if (Number.isFinite(age) && age < LOCK_TTL_MS) {
      return false;
    }
  }
  await cronTable.upsert({
    key,
    value: { locked_at: new Date().toISOString() },
    user_id: userId,
    updated_at: new Date().toISOString()
  });
  return true;
};

const releaseLock = async (userId: string, locationId: string) => {
  const key = `lock_ai_tag_v1:${userId}:${locationId}`;
  const cronTable = supabaseAdmin.from("cron_state") as any;
  await cronTable.delete().eq("key", key).eq("user_id", userId);
};
const getCronSecrets = (req: VercelRequest) => {
  const expected = String(cronSecret ?? "").trim();
  const headerSecret =
    (req.headers["x-cron-secret"] as string | undefined) ??
    (req.headers["x-cron-key"] as string | undefined);
  const auth = (req.headers.authorization as string | undefined) ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7)
    : "";
  const provided = String(headerSecret ?? bearer ?? "").trim();
  return { expected, provided };
};

const getBearerToken = (req: VercelRequest) => {
  const auth = (req.headers.authorization as string | undefined) ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getReviewText = (review: { comment?: string | null }) =>
  String(review.comment ?? "").trim();

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
  review: { id: string; comment?: string },
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
            String(review.comment ?? "")
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

const analyzeWithRetry = async (
  review: { id: string; comment?: string },
  requestId: string,
  debugInfo?: {
    openaiStatus?: number;
    openaiId?: string | null;
    outputTextPreview?: string;
    parsedKeys?: string[];
  }
) => {
  const delays = [500, 1500];
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await analyzeReview(review, requestId, debugInfo);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown error";
      const shouldRetry =
        message === "OpenAI request timeout" ||
        /rate limit|timeout|temporarily|overloaded/i.test(message);
      if (!shouldRetry || attempt >= delays.length) {
        throw error;
      }
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const MAX_MS = Number(process.env.CRON_MAX_MS ?? 24000);
  const MAX_REVIEWS = Number(process.env.CRON_MAX_REVIEWS ?? 40);
  const isProd = process.env.NODE_ENV === "production";
  const logInfo = (...args: unknown[]) => {
    if (!isProd) {
      console.log(...args);
    }
  };
  const timeUp = () => Date.now() - start > MAX_MS;
  const method = req.method ?? "GET";
  res.setHeader("Cache-Control", "no-store");
  logRequest("[ai]", {
    requestId,
    method,
    route: req.url ?? "/api/cron/ai/tag-reviews"
  });

  if (method !== "POST" && method !== "GET") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    console.error("[ai]", requestId, "missing env:", missingEnv);
    return sendError(
      res,
      requestId,
      {
        code: "INTERNAL",
        message: `Missing env: ${missingEnv.join(", ")}`
      },
      500
    );
  }

  const { expected, provided } = getCronSecrets(req);
  const bearerToken = getBearerToken(req);
  if (!expected || !provided || provided !== expected) {
    if (!bearerToken) {
      console.error("[ai]", requestId, "invalid cron secret");
      return sendError(
        res,
        requestId,
        { code: "FORBIDDEN", message: "Unauthorized" },
        403
      );
    }
    try {
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.getUser(bearerToken);
      if (authError || !authData?.user?.id) {
        return sendError(
          res,
          requestId,
          { code: "FORBIDDEN", message: "Unauthorized" },
          403
        );
      }
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (roleRow?.role !== "admin") {
        return sendError(
          res,
          requestId,
          { code: "FORBIDDEN", message: "Admin only" },
          403
        );
      }
    } catch (error) {
      console.error("[ai]", requestId, "admin auth failed", error);
      return sendError(
        res,
        requestId,
        { code: "FORBIDDEN", message: "Unauthorized" },
        403
      );
    }
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
  let runId: string | null = null;
  let runCompleted = false;
  let runStartMs = 0;
  let cursor: Cursor | null = null;
  let force = false;
  let debugEnabled = false;
  let debug: Record<string, unknown> | null = null;
  let targetLocationId: string | null = null;
  let runMetaBase: Record<string, unknown> = { request_id: requestId };
  const errorsByLocation = new Map<string, number>();
  const processedByLocation = new Map<string, number>();
  const tagsByLocation = new Map<string, number>();
  const lastErrorByLocation = new Map<string, string>();
  const locationUserMap = new Map<string, string>();
  const errorByUser = new Map<string, { code: string; message: string; jobId?: string }>();

  try {
    cursor = await loadCursor();
    const locationParam = req.query?.location_id;
    const normalizeLocationId = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      const raw = Array.isArray(value) ? value[0] : value;
      if (raw === null || raw === undefined) {
        return null;
      }
      let str = String(raw).trim();
      if (!str) {
        return null;
      }
      try {
        str = decodeURIComponent(str);
      } catch {
        // keep raw if decode fails
      }
      str = str.trim();
      if (!str || str.toLowerCase() === "all") {
        return null;
      }
      return str;
    };
    targetLocationId = normalizeLocationId(locationParam);
    const forceParam = req.query?.force;
    force =
      forceParam === "1" || (Array.isArray(forceParam) && forceParam[0] === "1");
    debugEnabled =
      req.query?.debug === "1" ||
      (Array.isArray(req.query?.debug) && req.query?.debug[0] === "1");
    if (debugEnabled) {
      debug = {
        requestId,
        force,
        cursor,
        now: new Date().toISOString()
      };
    }

    const runStart = new Date().toISOString();
    runStartMs = Date.now();
    runMetaBase = {
      request_id: requestId,
      force,
      debug,
      cursor_in: cursor ?? null,
      ...(targetLocationId ? { location_id: targetLocationId } : {})
    };
    const { data: runRow } = await (supabaseAdmin as any)
      .from("ai_run_history")
      .insert({
        user_id: null,
        started_at: runStart,
        processed: 0,
        tags_upserted: 0,
        errors_count: 0,
        aborted: false,
        skip_reason: null,
        last_error: null,
        meta: runMetaBase
      })
      .select("id")
      .maybeSingle();
    runId = runRow?.id ?? null;

    // Recover stale running statuses / locks (15 min)
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const cronTable = supabaseAdmin.from("cron_state") as any;
    const { data: staleStatusRows } = await cronTable
      .select("key, user_id, value")
      .like("key", "ai_status_v1:%")
      .lt("updated_at", staleCutoff);
    for (const row of staleStatusRows ?? []) {
      const value = row?.value as { status?: string } | null;
      if (value?.status === "running" && row?.user_id) {
        await cronTable
          .update({
            value: {
              ...value,
              status: "error",
              last_error: "stale_running_recovered"
            },
            updated_at: new Date().toISOString()
          })
          .eq("key", row.key)
          .eq("user_id", row.user_id);
      }
    }
    const { data: staleLocks } = await cronTable
      .select("key, user_id")
      .like("key", "lock_ai_tag_v1:%")
      .lt("updated_at", staleCutoff);
    for (const row of staleLocks ?? []) {
      if (row?.key && row?.user_id) {
        await cronTable.delete().eq("key", row.key).eq("user_id", row.user_id);
      }
    }

    logInfo("[ai-tag]", requestId, "cursor", cursor);

    let totalWithTextQuery = supabaseAdmin
      .from("google_reviews")
      .select("id", { count: "exact", head: true })
      .not("comment", "is", null)
      .neq("comment", "");
    if (targetLocationId) {
      totalWithTextQuery = totalWithTextQuery.eq("location_id", targetLocationId);
    }
    const totalWithTextQueryResult = await totalWithTextQuery;
    totalWithText = totalWithTextQueryResult.count ?? 0;
    let backlogBase = supabaseAdmin
      .from("google_reviews")
      .select("id", { count: "exact", head: true })
      .not("comment", "is", null)
      .neq("comment", "");
    if (targetLocationId) {
      backlogBase = backlogBase.eq("location_id", targetLocationId);
    }
    const backlogBaseResult = await backlogBase;
    const totalWithTextGlobal = backlogBaseResult.count ?? 0;
    const { data: backlogInsightRows } = await supabaseAdmin
      .from("review_ai_insights")
      .select("review_pk, error, processed_at");
    const insightOk = new Set<string>();
    const insightMissingOrFailed = new Set<string>();
    (backlogInsightRows ?? []).forEach((row) => {
      const pk = String(row.review_pk ?? "");
      if (!pk) return;
      if (row.error || !row.processed_at) {
        insightMissingOrFailed.add(pk);
      } else {
        insightOk.add(pk);
      }
    });
    totalMissingInsights = Math.max(
      0,
      totalWithTextGlobal - insightOk.size
    );

    let textLocationsQuery = supabaseAdmin
      .from("google_reviews")
      .select("user_id, location_id")
      .not("comment", "is", null)
      .neq("comment", "")
      .not("location_id", "is", null)
      .limit(2000);
    if (targetLocationId) {
      textLocationsQuery = textLocationsQuery.eq("location_id", targetLocationId);
    }
    const { data: textLocations } = await textLocationsQuery;
    (textLocations ?? []).forEach((row) => {
      if (row.user_id && row.location_id) {
        locationUserMap.set(String(row.location_id), String(row.user_id));
      }
    });

    const lastSourceTime = force
      ? "1970-01-01T00:00:00.000Z"
      : cursor.last_source_time ?? "1970-01-01T00:00:00.000Z";
    const lastReviewPk = force
      ? "00000000-0000-0000-0000-000000000000"
      : cursor.last_review_pk ?? "00000000-0000-0000-0000-000000000000";
    const loadCandidates = async () => {
      const target = MAX_REVIEWS;
      const pageSize = 250;
      const maxPages = 10;
      const collected: Array<{
        id: string;
        review_id: string | null;
        update_time: string | null;
        create_time: string | null;
        created_at: string | null;
        user_id: string | null;
        location_id: string | null;
        location_name: string | null;
        comment: string | null;
      }> = [];

      for (let page = 0; page < maxPages && collected.length < target; page += 1) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        let candidatesQuery = supabaseAdmin
          .from("google_reviews")
          .select(
            "id, review_id, update_time, create_time, created_at, user_id, location_id, location_name, comment"
          )
          .not("comment", "is", null)
          .neq("comment", "")
          .not("review_id", "is", null)
          .neq("review_id", "")
          .not("location_id", "is", null)
          .not("user_id", "is", null)
          .order("update_time", { ascending: true, nullsFirst: false })
          .order("create_time", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true, nullsFirst: false })
          .range(from, to);
        if (targetLocationId) {
          candidatesQuery = candidatesQuery.eq("location_id", targetLocationId);
        }
        const { data: candidateSource, error: candidatesError } =
          await candidatesQuery;

        if (candidatesError) {
          console.error(
            "[ai-tag]",
            requestId,
            "candidates query failed",
            candidatesError
          );
          return { rows: [] as typeof candidateSource, error: candidatesError };
        }

        const reviewRows = (candidateSource ?? []).filter((review) => {
          const text = getReviewText(review as { comment?: string | null });
          if (!text) {
            return false;
          }
          return true;
        });

        if (reviewRows.length === 0) {
          break;
        }

        const reviewPks = reviewRows
          .map((row) => String((row as { id?: string | null }).id ?? ""))
          .filter((id) => id.length > 0);
        const insightIds = new Set<string>();
        if (reviewPks.length > 0) {
          const { data: insightRows } = await supabaseAdmin
            .from("review_ai_insights")
            .select("review_pk")
            .in("review_pk", reviewPks);
          (insightRows ?? []).forEach((row) => {
            if (row.review_pk) {
              insightIds.add(String(row.review_pk));
            }
          });
        }

        const rows = reviewRows.filter((row) => {
          const reviewPk = String((row as { id?: string | null }).id ?? "");
          return reviewPk && !insightIds.has(reviewPk);
        });

        collected.push(...rows);
      }

      return { rows: collected.slice(0, target), error: null };
    };

    const initialCandidates = await loadCandidates();
    if (initialCandidates.error) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load candidates" },
        500
      );
    }

    let candidateRows = initialCandidates.rows;
    candidatesFound = candidateRows.length;
    logInfo("[ai-tag]", requestId, "candidatesFound", candidatesFound);

    if (debugEnabled) {
      debug = {
        cursorIn: cursor,
          candidatesSample: candidateRows.slice(0, 5).map((review) => ({
            id: review.review_id ?? review.id,
            update_time: review.update_time ?? null,
            create_time: review.create_time ?? null,
            user_id: review.user_id ?? null,
            location_id: review.location_id ?? null,
            comment_len: review.comment?.length ?? 0
          })),
        candidateQueryMeta: {
          filter:
            "comment not null and missing review_ai_insights (AI backlog)",
          order: "coalesce(update_time, create_time, created_at) asc, id asc",
          limit: MAX_REVIEWS,
          force,
          since_time: lastSourceTime,
          since_id: lastReviewPk,
          location_id: targetLocationId ?? "all"
        }
      };
    }

    const nowIso = new Date().toISOString();
    candidateRows.forEach((review) => {
      const locationId = review.location_id ? String(review.location_id) : "";
      const userId = review.user_id ? String(review.user_id) : "";
      if (locationId && userId && !locationUserMap.has(locationId)) {
        locationUserMap.set(locationId, userId);
      }
    });
    const locationIds = Array.from(locationUserMap.keys());
    const lockedLocations = new Set<string>();
    const locationStats = new Map<string, { missingInsights: number }>();
    let totalMissing = 0;
    if (locationIds.length > 0) {
      let textRowsQuery = supabaseAdmin
        .from("google_reviews")
        .select("id, location_id, comment")
        .in("location_id", locationIds)
        .not("comment", "is", null)
        .neq("comment", "");
      if (targetLocationId) {
        textRowsQuery = textRowsQuery.eq("location_id", targetLocationId);
      }
      const { data: textRows } = await textRowsQuery;
      const reviewPks = (textRows ?? [])
        .map((row) => String((row as { id?: string | null }).id ?? ""))
        .filter((id) => id.length > 0);
      const { data: insightRows } = reviewPks.length
        ? await supabaseAdmin
            .from("review_ai_insights")
            .select("review_pk, error, processed_at")
            .in("review_pk", reviewPks)
        : {
            data: [] as Array<{
              review_pk?: string | null;
              error?: string | null;
              processed_at?: string | null;
            }>
          };
      const insightByPk = new Map<
        string,
        { error?: string | null; processed_at?: string | null }
      >();
      (insightRows ?? []).forEach((row) => {
        const reviewPk = String(row.review_pk ?? "");
        if (!reviewPk) return;
        insightByPk.set(reviewPk, {
          error: row.error ?? null,
          processed_at: row.processed_at ?? null
        });
      });

      const textByLocation = new Map<
        string,
        Array<{ review_pk: string }>
      >();
      (textRows ?? []).forEach((row) => {
        const locationId = String(row.location_id ?? "");
        const reviewPk = String((row as { id?: string | null }).id ?? "");
        const text = getReviewText(row as { comment?: string | null });
        if (!locationId || !reviewPk || !text) return;
        const list = textByLocation.get(locationId) ?? [];
        list.push({ review_pk: reviewPk });
        textByLocation.set(locationId, list);
      });

      for (const locationId of locationIds) {
        const textIds = textByLocation.get(locationId) ?? [];
        let missingInsights = 0;
        for (const row of textIds) {
          const insight = insightByPk.get(row.review_pk);
          if (!insight || insight.error || !insight.processed_at) {
            missingInsights += 1;
          }
        }
        totalMissing += missingInsights;
        locationStats.set(locationId, { missingInsights });
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
    }
    totalMissingInsights = totalMissing;

    if (!force && totalMissingInsights > 0 && candidatesFound === 0) {
      const fallbackCandidates = await loadCandidates();
      candidateRows = fallbackCandidates.rows;
      candidatesFound = candidateRows.length;
      logInfo("[ai-tag]", requestId, "candidatesFound(fallback)", candidatesFound);
      candidateRows.forEach((review) => {
        const locationId = review.location_id ? String(review.location_id) : "";
        const userId = review.user_id ? String(review.user_id) : "";
        if (locationId && userId && !locationUserMap.has(locationId)) {
          locationUserMap.set(locationId, userId);
        }
      });
    }

    if (totalMissingInsights > 0 && candidatesFound === 0) {
      if (!debug) {
        debug = {
          cursorIn: cursor,
          candidatesSample: [],
          candidateQueryMeta: {
            filter:
              "comment not null and missing review_ai_insights (AI backlog)",
            order: "coalesce(update_time, create_time, created_at) asc, id asc",
            limit: MAX_REVIEWS,
            force,
            since_time: lastSourceTime,
            since_id: lastReviewPk
          }
        };
      }
      debug.reason = force
        ? "Query returned 0 rows; data may not match filters (comment empty/blank or missing timestamps)."
        : "Query returned 0 rows; pagination backlog reached without candidates.";
    }

    const candidateRowsByLock = candidateRows.filter((review) =>
      review.location_id ? lockedLocations.has(review.location_id) : false
    );

    if (lockedLocations.size === 0 && locationIds.length > 0) {
      skipReason = "locked";
    } else if (candidateRowsByLock.length === 0 && candidatesFound > 0) {
      skipReason = "locked";
    } else if (candidatesFound === 0) {
      skipReason = "no_candidates";
    }

    for (const review of candidateRowsByLock) {
      if (timeUp() || reviewsScanned >= MAX_REVIEWS) {
        break;
      }
      const reviewPk =
        typeof review === "object" && review !== null && "id" in review
          ? String((review as { id?: unknown }).id ?? "")
          : "";
      const reviewIdText =
        typeof review === "object" && review !== null && "review_id" in review
          ? String((review as { review_id?: unknown }).review_id ?? "")
          : "";
      const reviewText = getReviewText(review as { comment?: string | null });
      const effectiveUpdateTime =
        review.update_time ?? review.create_time ?? null;
      const locationId = review.location_id ?? null;
      if (!effectiveUpdateTime) {
        errors.push({ reviewId: reviewIdText || reviewPk, message: "Missing source_time" });
        console.error("[ai-tag]", requestId, "missing source_time", reviewIdText || reviewPk);
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
        const analysis = await analyzeWithRetry(
          {
            id: reviewPk,
            comment: reviewText
          },
          requestId,
          debug
        );

        const nowIso = new Date().toISOString();
        const { error: insightError } = await supabaseAdmin
          .from("review_ai_insights")
          .upsert({
            review_pk: reviewPk,
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
            review_pk: reviewPk,
            user_id: review.user_id,
            location_resource_name: review.location_id ?? review.location_name,
            processed_at: nowIso,
            source_update_time: effectiveUpdateTime,
            error: insightError.message ?? "insight upsert failed"
          });
          errors.push({ reviewId: reviewIdText || reviewPk, message: insightError.message });
          await saveCursor({
            last_source_time: effectiveUpdateTime,
            last_review_pk: reviewPk
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
              reviewId: reviewIdText || reviewPk,
              message: tagError?.message ?? "tag upsert failed"
            });
            continue;
          }

          await supabaseAdmin
            .from("review_ai_tags")
            .upsert({
              review_pk: reviewPk,
              tag_id: tagRow.id,
              polarity: tag.polarity ?? null,
              confidence: tag.confidence ?? null,
              evidence: tag.evidence ?? null
            });
          if (review.user_id && reviewIdText) {
            await supabaseAdmin.from("review_tags").insert({
              user_id: review.user_id,
              review_id: reviewIdText,
              location_id: review.location_id ?? null,
              tag: tag.name
            });
          }
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
          last_review_pk: reviewPk
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({ reviewId: reviewIdText || reviewPk, message });
        console.error("[ai]", requestId, "review failed", message);
        if (message === "OpenAI request timeout") {
          if (review.user_id) {
            errorByUser.set(String(review.user_id), {
              code: "openai_timeout",
              message: "openai_timeout",
              jobId: reviewPk
            });
          }
        }
        if (review.location_id) {
          errorsByLocation.set(
            review.location_id,
            (errorsByLocation.get(review.location_id) ?? 0) + 1
          );
          lastErrorByLocation.set(review.location_id, message);
        }
        await saveCursor({
          last_source_time: effectiveUpdateTime ?? lastSourceTime,
          last_review_pk: reviewPk
        });
      }
    }

    const aborted = timeUp() || reviewsScanned >= MAX_REVIEWS;

    for (const locationId of lockedLocations) {
      const missingInsights = locationStats.get(locationId)?.missingInsights ?? 0;
      const errorsCount = errorsByLocation.get(locationId) ?? 0;
      const processedCount = processedByLocation.get(locationId) ?? 0;
      const tagsCount = tagsByLocation.get(locationId) ?? 0;
      const status: "idle" | "running" | "done" | "error" =
        errorsCount > 0 ? "error" : "done";
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

    // Persist last run status per user
    const runAt = new Date().toISOString();
    for (const userId of new Set(locationUserMap.values())) {
      await (supabaseAdmin as any).from("cron_state").upsert({
        key: "ai_tag_last_run",
        user_id: userId,
        value: {
          at: runAt,
          candidatesFound,
          tagged: tagsUpserted
        },
        updated_at: runAt
      });
      if (isProd) {
        console.log(
          "[ai/tag]",
          `user=${userId}`,
          `processed=${reviewsProcessed}`,
          `missing=${totalMissingInsights}`,
          `errors=${errors.length}`
        );
      } else {
        console.log("[cron_state] upsert ai_tag_last_run", userId);
      }
      const lastError = errorByUser.get(userId);
      if (lastError) {
        await (supabaseAdmin as any).from("cron_state").upsert({
          key: "ai_tag_last_error",
          user_id: userId,
          value: {
            at: runAt,
            code: lastError.code,
            message: lastError.message,
            job_id: lastError.jobId ?? null
          },
          updated_at: runAt
        });
      }
    }

    if (reviewsProcessed === 0 && !skipReason) {
      skipReason = "short_circuit_removed";
    }
    if (runId) {
      const finishedAt = new Date().toISOString();
      await (supabaseAdmin as any).from("ai_run_history").update({
        finished_at: finishedAt,
        duration_ms: Date.now() - runStartMs,
        processed: reviewsProcessed,
        tags_upserted: tagsUpserted,
        errors_count: errors.length,
        aborted,
        skip_reason: skipReason,
        last_error: errors.length > 0 ? errors[0]?.message ?? null : null,
        meta: {
          ...runMetaBase,
          stats: {
            totalWithText,
            totalMissingInsights,
            candidatesFound
          }
        }
      }).eq("id", runId);
      runCompleted = true;
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
    if (runId) {
      const finishedAt = new Date().toISOString();
      await (supabaseAdmin as any).from("ai_run_history").update({
        finished_at: finishedAt,
        duration_ms: Date.now() - runStartMs,
        processed: reviewsProcessed,
        tags_upserted: tagsUpserted,
        errors_count: errors.length + 1,
        aborted: false,
        skip_reason: "fatal_error",
        last_error: message,
        meta: runMetaBase
      }).eq("id", runId);
      runCompleted = true;
    }
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
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message },
      500
    );
  } finally {
    if (runId && !runCompleted) {
      const finishedAt = new Date().toISOString();
      await (supabaseAdmin as any).from("ai_run_history").update({
        finished_at: finishedAt,
        duration_ms: Date.now() - runStartMs,
        processed: reviewsProcessed,
        tags_upserted: tagsUpserted,
        errors_count: errors.length,
        aborted: timeUp() || reviewsScanned >= MAX_REVIEWS,
        skip_reason: skipReason,
        last_error: errors[0]?.message ?? null,
        meta: runMetaBase
      }).eq("id", runId);
    }
  }
}

// SQL check:
// select started_at, meta->>'location_id' from public.ai_run_history
// where meta->>'location_id' is not null order by started_at desc limit 20;

// Manual test plan:
// 1) curl -s -X POST "https://egia-six.vercel.app/api/cron/ai/tag-reviews?location_id=%2Faccounts%2F123%2Flocations%2F456&debug=1" -H "x-cron-secret: <secret>"
// 2) curl -s -X POST "https://egia-six.vercel.app/api/cron/ai/tag-reviews?location_id=all" -H "x-cron-secret: <secret>"
