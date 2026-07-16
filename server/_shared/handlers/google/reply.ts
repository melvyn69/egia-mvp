import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import {
  generateAiReply,
  isMissingAiIdentityError
} from "../../ai_reply";
import { createProductionSafeConsole } from "../../safe_console";

const console = createProductionSafeConsole("/api/google/reply");

type BrandVoiceTone = Database["public"]["Enums"]["brand_voice_tone"];
type BrandVoiceLanguageLevel =
  Database["public"]["Enums"]["brand_voice_language_level"];

const brandVoiceTones: BrandVoiceTone[] = [
  "professional",
  "friendly",
  "warm",
  "formal"
];
const brandVoiceLanguageLevels: BrandVoiceLanguageLevel[] = [
  "tutoiement",
  "vouvoiement"
];

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
const googleClientId = getEnv(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"]);
const googleClientSecret = getEnv([
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET"
]);
const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const internalApiKey = (process.env.INTERNAL_API_KEY ?? "").trim();
const MAX_REPLY_REQUEST_BYTES = 32 * 1024;
const MAX_REVIEW_TEXT_LENGTH = 1200;
const MAX_REPLY_TEXT_LENGTH = 4096;

const getMissingEnv = (mode: "reply" | "draft" | "test" | "automation") => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (mode === "reply") {
    if (!googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID|GOOGLE_CLIENT_ID");
    if (!googleClientSecret)
      missing.push("GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_CLIENT_SECRET");
  }
  if ((mode === "draft" || mode === "test" || mode === "automation") && !openaiApiKey) {
    missing.push("OPENAI_API_KEY");
  }
  return missing;
};

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const getUserIdFromJwt = async (jwt: string) => {
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) {
    throw new Error("Unauthorized");
  }
  return data.user.id;
};

const isAdminUser = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[reply] user_roles lookup failed", error);
    return false;
  }
  return data?.role === "admin";
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Google token refresh failed (${res.status})`);
  }

  const json = await res.json();
  return json.access_token as string;
};

const getLookupPath = (params: {
  id?: string | null;
  review_id?: string | null;
  review_name?: string | null;
  location_id?: string | null;
}) => {
  if (params.id) return "id";
  if (params.review_name) return "review_name";
  if (params.review_id && params.location_id) return "review_id+location_id";
  if (params.review_id) return "review_id";
  return "missing";
};

const insertReplyHistory = async (params: {
  userId: string;
  reviewId: string;
  locationId: string | null;
  replyText: string;
  source: "manual" | "automation" | "test";
}) => {
  const { error } = await supabaseAdmin.from("review_replies").insert({
    user_id: params.userId,
    review_id: params.reviewId,
    location_id: params.locationId,
    reply_text: params.replyText,
    source: params.source
  });
  if (error) {
    console.warn("[reply] review_replies insert failed", error);
  }
};

const resolveReviewRecord = async (
  userId: string,
  params: {
    id?: string | null;
    review_id?: string | null;
    review_name?: string | null;
    location_id?: string | null;
  }
) => {
  let query = supabaseAdmin
    .from("google_reviews")
    .select("review_name, status")
    .eq("user_id", userId);
  if (params.id) {
    query = query.eq("id", params.id);
  } else if (params.review_name) {
    query = query.eq("review_name", params.review_name);
  } else if (params.review_id && params.location_id) {
    query = query
      .eq("review_id", params.review_id)
      .eq("location_id", params.location_id);
  } else if (params.review_id) {
    query = query.eq("review_id", params.review_id);
  } else {
    return { data: null, error: null };
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    return { data: null, error };
  }
  if (!data) {
    return { data: null, error: null };
  }
  return {
    data: { reviewName: data.review_name ?? null, status: data.status ?? null },
    error: null
  };
};

const resolveDraftReview = async (
  userId: string,
  params: {
    id?: string | null;
    review_id?: string | null;
    review_name?: string | null;
    location_id?: string | null;
  }
) => {
  let query = supabaseAdmin
    .from("google_reviews")
    .select(
      "id, review_id, review_name, rating, comment, location_id, author_name, create_time"
    )
    .eq("user_id", userId);
  if (params.id) {
    query = query.eq("id", params.id);
  } else if (params.review_name) {
    query = query.eq("review_name", params.review_name);
  } else if (params.review_id && params.location_id) {
    query = query
      .eq("review_id", params.review_id)
      .eq("location_id", params.location_id);
  } else if (params.review_id) {
    query = query.eq("review_id", params.review_id);
  } else {
    return null;
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    return { data: null, error };
  }
  return { data: data ?? null, error: null };
};

const normalizeBrandVoiceOverride = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const tone =
    typeof raw.tone === "string" &&
    brandVoiceTones.includes(raw.tone as BrandVoiceTone)
      ? (raw.tone as BrandVoiceTone)
      : null;
  const languageLevel =
    typeof raw.language_level === "string" &&
    brandVoiceLanguageLevels.includes(
      raw.language_level as BrandVoiceLanguageLevel
    )
      ? (raw.language_level as BrandVoiceLanguageLevel)
      : null;
  return {
    enabled: Boolean(raw.enabled),
    tone,
    language_level: languageLevel,
    context: typeof raw.context === "string" ? raw.context : null,
    use_emojis: Boolean(raw.use_emojis),
    forbidden_words: Array.isArray(raw.forbidden_words)
      ? raw.forbidden_words.filter((word): word is string => typeof word === "string")
      : []
  };
};

const fetchAiInsights = async (reviewPk: string) => {
  const { data: insight, error: insightError } = await supabaseAdmin
    .from("review_ai_insights")
    .select("sentiment, sentiment_score, summary")
    .eq("review_pk", reviewPk)
    .maybeSingle();
  if (insightError) {
    console.error("[reply] review_ai_insights fetch failed", insightError);
  }
  const { data: tags, error: tagsError } = await supabaseAdmin
    .from("review_ai_tags")
    .select("ai_tags(tag)")
    .eq("review_pk", reviewPk);
  if (tagsError) {
    console.error("[reply] review_ai_tags fetch failed", tagsError);
  }
  const tagList = (tags ?? [])
    .map((row) => row?.ai_tags?.tag)
    .filter((tag): tag is string => typeof tag === "string");
  return {
    sentiment: insight?.sentiment ?? null,
    score:
      typeof insight?.sentiment_score === "number"
        ? insight.sentiment_score
        : null,
    summary: insight?.summary ?? null,
    tags: tagList
  };
};

const sendPublicError = (
  res: VercelResponse,
  requestId: string,
  status: number,
  code: string,
  extra?: Record<string, unknown>
) =>
  res.status(status).json({
    ok: false,
    error: "Request failed",
    code,
    requestId,
    ...extra
  });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    req.headers["x-request-id"]?.toString() ??
    `req_${crypto.randomUUID()}`;

  if (req.method !== "POST") {
    return sendPublicError(res, requestId, 405, "METHOD_NOT_ALLOWED");
  }

  try {
    let payload = req.body ?? {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (err) {
        console.error("[reply]", requestId, "payload parse failed", err);
        payload = {};
      }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return sendPublicError(res, requestId, 400, "INVALID_JSON");
    }
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_REPLY_REQUEST_BYTES) {
      return sendPublicError(res, requestId, 413, "PAYLOAD_TOO_LARGE");
    }
    const mode =
      payload?.mode === "draft" ||
      payload?.mode === "test" ||
      payload?.mode === "automation"
        ? payload.mode
        : "reply";
    const internalHeader = req.headers["x-internal-api-key"];
    const internalHeaderValue = Array.isArray(internalHeader)
      ? internalHeader[0] ?? ""
      : internalHeader ?? "";
    const isInternalAutomationRequest =
      mode === "automation" &&
      internalApiKey.length > 0 &&
      internalHeaderValue.trim() === internalApiKey;
    let userId = "";
    if (isInternalAutomationRequest) {
      const internalUserId =
        typeof (payload as { user_id?: unknown }).user_id === "string"
          ? (payload as { user_id: string }).user_id.trim()
          : "";
      if (!internalUserId) {
        return sendPublicError(res, requestId, 400, "INVALID_AUTOMATION_REQUEST");
      }
      userId = internalUserId;
    } else {
      const auth = req.headers.authorization || "";
      const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!jwt) {
        console.error("[reply]", requestId, "missing bearer token");
        return sendPublicError(res, requestId, 401, "UNAUTHORIZED");
      }
      userId = await getUserIdFromJwt(jwt);
    }
    const missingEnv = getMissingEnv(mode);
    if (missingEnv.length) {
      console.error("[reply]", {
        requestId,
        route: "/api/google/reply",
        status: 500,
        code: "SERVER_MISCONFIGURED",
        count: missingEnv.length
      });
      return sendPublicError(res, requestId, 500, "SERVER_MISCONFIGURED");
    }
    if (mode === "automation" && !isInternalAutomationRequest) {
      const isAdmin = await isAdminUser(userId);
      if (!isAdmin) {
        return sendPublicError(res, requestId, 403, "FORBIDDEN");
      }
    }

    const {
      id,
      reviewId,
      review_id,
      review_name,
      location_id,
      review_text,
      rating,
      replyText,
      draftReplyId,
      googleReviewId,
      brand_voice_override,
      allow_identity_override
    } =
      payload as {
        id?: string;
        reviewId?: string;
        review_id?: string;
        review_name?: string;
        location_id?: string;
        review_text?: string;
        rating?: number;
        replyText?: string;
        draftReplyId?: string;
        googleReviewId?: string;
        user_id?: string;
        brand_voice_override?: unknown;
        allow_identity_override?: boolean;
      };

    const boundedIdentifiers: Array<[unknown, number]> = [
      [id, 128],
      [reviewId, 2048],
      [review_id, 2048],
      [review_name, 2048],
      [location_id, 2048],
      [draftReplyId, 128],
      [googleReviewId, 2048]
    ];
    if (
      boundedIdentifiers.some(
        ([value, limit]) =>
          value !== undefined &&
          (typeof value !== "string" || value.length > limit)
      ) ||
      (review_text !== undefined &&
        (typeof review_text !== "string" ||
          review_text.length > MAX_REVIEW_TEXT_LENGTH)) ||
      (replyText !== undefined &&
        (typeof replyText !== "string" ||
          replyText.length > MAX_REPLY_TEXT_LENGTH)) ||
      (rating !== undefined &&
        (typeof rating !== "number" ||
          !Number.isFinite(rating) ||
          rating < 1 ||
          rating > 5))
    ) {
      return sendPublicError(res, requestId, 400, "INVALID_PAYLOAD");
    }

    if (mode === "test") {
      const safeText =
        typeof review_text === "string" ? review_text.trim() : "";
      if (!safeText) {
        return sendPublicError(res, requestId, 400, "INVALID_PAYLOAD");
      }
      try {
        const aiResult = await generateAiReply({
          reviewText: safeText,
          rating: typeof rating === "number" ? rating : null,
          userId,
          locationId: typeof location_id === "string" ? location_id : null,
          supabaseAdmin,
          allowIdentityOverride: Boolean(allow_identity_override),
          brandVoiceOverride: normalizeBrandVoiceOverride(brand_voice_override),
          openaiApiKey,
          model: openaiModel,
          requestId,
          strictIdentity: true
        });
        void insertReplyHistory({
          userId,
          reviewId: "test",
          locationId: null,
          replyText: aiResult.replyText,
          source: "test"
        });
        return res.status(200).json({
          reply_text: aiResult.replyText,
          meta: aiResult.meta
        });
      } catch (error) {
        if (isMissingAiIdentityError(error)) {
          console.error("[reply]", requestId, "missing ai identity (test)", {
            userId,
            locationId: typeof location_id === "string" ? location_id : null
          });
          return sendPublicError(res, requestId, 422, "MISSING_AI_IDENTITY", {
            failed_reason: "missing_ai_identity"
          });
        }
        if ((error as Error).name === "AbortError") {
          console.error("[reply]", requestId, "test openai timeout");
          return sendPublicError(res, requestId, 504, "UPSTREAM_TIMEOUT");
        }
        console.error("[reply]", requestId, "test openai error", error);
        return sendPublicError(res, requestId, 502, "UPSTREAM_FAILED");
      }
    }

    const resolvedReviewId = review_id ?? reviewId ?? null;
    const resolvedReviewName =
      review_name ??
      (resolvedReviewId && resolvedReviewId.includes("accounts/")
        ? resolvedReviewId
        : null);
    const resolvedId = id ?? googleReviewId ?? null;
    const lookupPath = getLookupPath({
      id: resolvedId,
      review_id: resolvedReviewId,
      review_name: resolvedReviewName,
      location_id
    });
    if (!resolvedId && !resolvedReviewId && !resolvedReviewName) {
      console.error("[reply]", requestId, "missing review identifiers");
      return sendPublicError(res, requestId, 400, "INVALID_PAYLOAD");
    }

    if (mode === "draft" || mode === "automation") {
      console.log("[reply]", requestId, "lookup", lookupPath);
      const { data: review, error: lookupError } = await resolveDraftReview(userId, {
        id: resolvedId,
        review_id: resolvedReviewId,
        review_name: resolvedReviewName,
        location_id
      });
      if (lookupError) {
        console.error("[reply]", requestId, "draft lookup error", lookupError);
        return sendPublicError(res, requestId, 500, "LOOKUP_FAILED");
      }
      if (!review) {
        return sendPublicError(res, requestId, 404, "NOT_FOUND");
      }
      const reviewText = typeof review.comment === "string" ? review.comment : "";
      try {
        const insights = await fetchAiInsights(review.id);
        const aiResult = await generateAiReply({
          reviewText: reviewText || "Avis sans commentaire.",
          rating: typeof review.rating === "number" ? review.rating : null,
          userId,
          locationId:
            review.location_id ?? (typeof location_id === "string" ? location_id : null),
          supabaseAdmin,
          insights,
          openaiApiKey,
          model: openaiModel,
          requestId,
          strictIdentity: true
        });
        if (mode === "automation" && process.env.NODE_ENV !== "production") {
          const aiMeta = aiResult.meta as Record<string, unknown> | undefined;
          const hasIdentityFields = Boolean(
            aiMeta?.ai_identity_hash || aiMeta?.ai_identity_id || aiMeta?.ai_identity_applied
          );
          console.info("[reply] automation prompt context", {
            requestId,
            userId,
            locationId:
              review.location_id ?? (typeof location_id === "string" ? location_id : null),
            hasIdentityFields
          });
        }
        void insertReplyHistory({
          userId,
          reviewId: review.review_id ?? review.id,
          locationId: review.location_id ?? null,
          replyText: aiResult.replyText,
          source: mode === "automation" ? "automation" : "manual"
        });
        return res.status(200).json({
          draft_text: aiResult.replyText,
          meta: aiResult.meta
        });
      } catch (error) {
        if (isMissingAiIdentityError(error)) {
          console.error("[reply]", requestId, "missing ai identity (draft)", {
            userId,
            locationId:
              review.location_id ?? (typeof location_id === "string" ? location_id : null)
          });
          return sendPublicError(res, requestId, 422, "MISSING_AI_IDENTITY", {
            failed_reason: "missing_ai_identity"
          });
        }
        if ((error as Error).name === "AbortError") {
          console.error("[reply]", requestId, "draft openai timeout");
          return sendPublicError(res, requestId, 504, "UPSTREAM_TIMEOUT");
        }
        console.error("[reply]", requestId, "draft openai error", error);
        return sendPublicError(res, requestId, 502, "UPSTREAM_FAILED");
      }
    }

    if (!replyText) {
      console.error("[reply]", requestId, "missing replyText", {
        hasReplyText: Boolean(replyText)
      });
      return sendPublicError(res, requestId, 400, "INVALID_PAYLOAD");
    }

    console.log("[reply]", requestId, "lookup", lookupPath);
    const { data: reviewRecord, error: reviewLookupError } =
      await resolveReviewRecord(userId, {
      id: resolvedId,
      review_id: resolvedReviewId,
      review_name: resolvedReviewName,
      location_id
    });
    if (reviewLookupError) {
      console.error("[reply]", requestId, "reply lookup error", reviewLookupError);
      return sendPublicError(res, requestId, 500, "LOOKUP_FAILED");
    }
    if (!reviewRecord) {
      return sendPublicError(res, requestId, 404, "NOT_FOUND");
    }
    if (reviewRecord.status === "replied") {
      console.error("[reply]", requestId, "already replied", {
        reviewId: resolvedReviewId,
        googleReviewId: resolvedId
      });
      return sendPublicError(res, requestId, 409, "ALREADY_REPLIED");
    }
    if (!reviewRecord.reviewName) {
      console.error("[reply]", requestId, "review name missing", {
        reviewId: resolvedReviewId,
        googleReviewId: resolvedId
      });
      return sendPublicError(res, requestId, 400, "INVALID_REVIEW");
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn?.refresh_token) {
      console.error("[reply]", requestId, "missing refresh token", connErr);
      return sendPublicError(res, requestId, 400, "GOOGLE_CONNECTION_REQUIRED");
    }

    let accessToken: string;
    try {
      accessToken = await refreshGoogleAccessToken(conn.refresh_token);
    } catch (error) {
      console.error("[reply]", requestId, "token refresh failed", {
        errorType: error instanceof Error ? error.name : "unknown"
      });
      return sendPublicError(res, requestId, 502, "UPSTREAM_AUTH_FAILED");
    }
    const googleReviewName = reviewRecord.reviewName;

    const googleRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ comment: replyText })
      }
    );

    if (!googleRes.ok) {
      await googleRes.body?.cancel();
      console.error("[reply]", requestId, "google reply failed", {
        upstreamStatus: googleRes.status
      });
      return sendPublicError(res, requestId, 502, "UPSTREAM_FAILED");
    }

    const sentAt = new Date().toISOString();
    if (draftReplyId) {
      const { error: draftUpdateError } = await supabaseAdmin
        .from("review_replies")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", draftReplyId)
        .eq("user_id", userId);
      if (draftUpdateError) {
        console.error("[reply]", requestId, "review_replies update failed", draftUpdateError);
      }
    } else {
      const { error: replyInsertError } = await supabaseAdmin
        .from("review_replies")
        .insert({
          user_id: userId,
          review_id: googleReviewId ?? reviewId,
          reply_text: replyText,
          provider: "google",
          status: "sent",
          sent_at: sentAt
        });
      if (replyInsertError) {
        console.error("[reply]", requestId, "review_replies insert failed", replyInsertError);
      }
    }

    let reviewUpdate = supabaseAdmin
      .from("google_reviews")
      .update({ status: "replied", reply_text: replyText, replied_at: sentAt })
      .eq("user_id", userId);
    if (resolvedId) {
      reviewUpdate = reviewUpdate.eq("id", resolvedId);
    } else if (resolvedReviewId) {
      reviewUpdate = reviewUpdate.eq("review_id", resolvedReviewId);
    }
    const { error: reviewUpdateError } = await reviewUpdate;
    if (reviewUpdateError) {
      console.error("[reply]", requestId, "google_reviews update failed", reviewUpdateError);
    }

    return res.status(200).json({ ok: true, requestId, sentAt });
  } catch (e: unknown) {
    const status = e instanceof Error && e.message === "Unauthorized" ? 401 : 500;
    console.error("[reply]", {
      requestId,
      route: "/api/google/reply",
      status,
      code: status === 401 ? "UNAUTHORIZED" : "INTERNAL",
      count: 1
    });
    return sendPublicError(
      res,
      requestId,
      status,
      status === 401 ? "UNAUTHORIZED" : "INTERNAL"
    );
  }
}
