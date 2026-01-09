import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../server/_shared/database.types.js";
import { generateAiReply } from "../server/_shared/ai_reply.js";

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

const getMissingEnv = (mode: "reply" | "draft" | "test") => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (mode === "reply") {
    if (!googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID|GOOGLE_CLIENT_ID");
    if (!googleClientSecret)
      missing.push("GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_CLIENT_SECRET");
  }
  if ((mode === "draft" || mode === "test") && !openaiApiKey) {
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


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestId =
    req.headers["x-request-id"]?.toString() ??
    `req_${crypto.randomUUID()}`;

  try {
    const auth = req.headers.authorization || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      console.error("[reply]", requestId, "missing bearer token");
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const userId = await getUserIdFromJwt(jwt);

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
      payload?.mode === "draft" || payload?.mode === "test"
        ? payload.mode
        : "reply";
    const missingEnv = getMissingEnv(mode);
    if (missingEnv.length) {
      console.error("[reply]", requestId, "missing env:", missingEnv);
      return res
        .status(500)
        .json({ error: `Missing env: ${missingEnv.join(", ")}` });
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
      tone
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
        tone?: string;
      };

    if (mode === "test") {
      const safeText =
        typeof review_text === "string" ? review_text.trim() : "";
      if (!safeText) {
        return res.status(400).json({ error: "Missing review_text" });
      }
      try {
        const { data: brandVoice, error: brandVoiceError } = await supabaseAdmin
          .from("brand_voice")
          .select(
            "enabled, tone, language_level, context, use_emojis, forbidden_words"
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (brandVoiceError) {
          console.error("[reply]", requestId, "brand_voice fetch failed", brandVoiceError);
        }
        const reply = await generateAiReply({
          reviewText: safeText,
          rating: typeof rating === "number" ? rating : null,
          brandVoice: brandVoice ?? null,
          overrideTone: tone ?? null,
          openaiApiKey,
          model: openaiModel,
          requestId
        });
        return res.status(200).json({ reply_text: reply });
      } catch (error) {
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

    if (mode === "draft") {
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
        const { data: brandVoice, error: brandVoiceError } = await supabaseAdmin
          .from("brand_voice")
          .select(
            "enabled, tone, language_level, context, use_emojis, forbidden_words"
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (brandVoiceError) {
          console.error("[reply]", requestId, "brand_voice fetch failed", brandVoiceError);
        }
        const reply = await generateAiReply({
          reviewText: reviewText || "Avis sans commentaire.",
          rating: typeof review.rating === "number" ? review.rating : null,
          brandVoice: brandVoice ?? null,
          overrideTone: tone ?? null,
          openaiApiKey,
          model: openaiModel,
          requestId
        });
        return res.status(200).json({ draft_text: reply });
      } catch (error) {
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
