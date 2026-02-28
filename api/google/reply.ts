import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../server/_shared_dist/database.types.js";
import {
  generateAiReply,
  isMissingAiIdentityError
} from "../../server/_shared_dist/ai_reply.js";

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
    const txt = await res.text();
    throw new Error(`Google token refresh failed: ${txt}`);
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
  return {
    enabled: Boolean(raw.enabled),
    tone: typeof raw.tone === "string" ? raw.tone : null,
    language_level:
      typeof raw.language_level === "string" ? raw.language_level : null,
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


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestId =
    req.headers["x-request-id"]?.toString() ??
    `req_${crypto.randomUUID()}`;

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
        return res.status(400).json({ error: "Missing user_id for internal automation" });
      }
      userId = internalUserId;
    } else {
      const auth = req.headers.authorization || "";
      const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!jwt) {
        console.error("[reply]", requestId, "missing bearer token");
        return res.status(401).json({ error: "Missing Authorization Bearer token" });
      }
      userId = await getUserIdFromJwt(jwt);
    }
    const missingEnv = getMissingEnv(mode);
    if (missingEnv.length) {
      console.error("[reply]", requestId, "missing env:", missingEnv);
      return res
        .status(500)
        .json({ error: `Missing env: ${missingEnv.join(", ")}` });
    }
    if (mode === "automation" && !isInternalAutomationRequest) {
      const isAdmin = await isAdminUser(userId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin role required" });
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

    if (mode === "test") {
      const safeText =
        typeof review_text === "string" ? review_text.trim() : "";
      if (!safeText) {
        return res.status(400).json({ error: "Missing review_text" });
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
          return res.status(422).json({
            error: "missing_ai_identity",
            failed_reason: "missing_ai_identity",
            meta: error.meta
          });
        }
        if ((error as Error).name === "AbortError") {
          console.error("[reply]", requestId, "test openai timeout");
          return res.status(504).json({ error: "OpenAI request timeout" });
        }
        console.error("[reply]", requestId, "test openai error", error);
        return res.status(502).json({ error: "OpenAI request failed" });
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
      return res.status(400).json({ error: "Missing review identifiers" });
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
        return res.status(500).json({ error: "Review lookup failed" });
      }
      if (!review) {
        return res.status(404).json({
          error: "Review not found",
          user_id: userId,
          lookup: {
            id: resolvedId,
            review_id: resolvedReviewId,
            review_name: resolvedReviewName,
            location_id,
            lookup_path: lookupPath
          }
        });
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
          return res.status(422).json({
            error: "missing_ai_identity",
            failed_reason: "missing_ai_identity",
            meta: error.meta
          });
        }
        if ((error as Error).name === "AbortError") {
          console.error("[reply]", requestId, "draft openai timeout");
          return res.status(504).json({ error: "OpenAI request timeout" });
        }
        console.error("[reply]", requestId, "draft openai error", error);
        return res.status(502).json({ error: "OpenAI request failed" });
      }
    }

    if (!replyText) {
      console.error("[reply]", requestId, "missing replyText", {
        hasReplyText: Boolean(replyText)
      });
      return res.status(400).json({ error: "Missing replyText" });
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
      return res.status(500).json({ error: "Review lookup failed" });
    }
    if (!reviewRecord) {
      return res.status(404).json({
        error: "Review not found",
        user_id: userId,
        lookup: {
          id: resolvedId,
          review_id: resolvedReviewId,
          review_name: resolvedReviewName,
          location_id,
          lookup_path: lookupPath
        }
      });
    }
    if (reviewRecord.status === "replied") {
      console.error("[reply]", requestId, "already replied", {
        reviewId: resolvedReviewId,
        googleReviewId: resolvedId
      });
      return res.status(409).json({ error: "already_replied" });
    }
    if (!reviewRecord.reviewName) {
      console.error("[reply]", requestId, "review name missing", {
        reviewId: resolvedReviewId,
        googleReviewId: resolvedId
      });
      return res.status(400).json({ error: "Review name not found" });
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn?.refresh_token) {
      console.error("[reply]", requestId, "missing refresh token", connErr);
      return res
        .status(400)
        .json({ error: "Google not connected (missing refresh token)" });
    }

    let accessToken: string;
    try {
      accessToken = await refreshGoogleAccessToken(conn.refresh_token);
    } catch (error) {
      console.error("[reply]", requestId, "token refresh failed", error);
      return res.status(502).json({ error: "Google token refresh failed" });
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
      const txt = await googleRes.text();
      console.error("[reply]", requestId, "google reply failed", txt);
      return res.status(502).json({ error: `Google reply failed: ${txt}` });
    }

    const sentAt = new Date().toISOString();
    if (draftReplyId) {
      const { error: draftUpdateError } = await supabaseAdmin
        .from("review_replies")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", draftReplyId);
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
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    console.error("[reply]", requestId, "unhandled error", msg);
    return res.status(status).json({ error: msg });
  }
}
