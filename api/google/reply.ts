import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

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

const getMissingEnv = () => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID|GOOGLE_CLIENT_ID");
  if (!googleClientSecret)
    missing.push("GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_CLIENT_SECRET");
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

const resolveReviewRecord = async (
  userId: string,
  reviewId: string,
  googleReviewId?: string | null
) => {
  let query = supabaseAdmin
    .from("google_reviews")
    .select("review_name, status")
    .eq("user_id", userId);
  if (googleReviewId) {
    query = query.eq("id", googleReviewId);
  } else if (reviewId.includes("accounts/")) {
    query = query.eq("review_name", reviewId);
  } else {
    query = query.eq("review_id", reviewId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error("Review lookup failed");
  }
  const reviewName =
    data?.review_name ?? (reviewId.includes("accounts/") ? reviewId : null);
  return { reviewName, status: data?.status ?? null };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestId =
    req.headers["x-request-id"]?.toString() ??
    `req_${crypto.randomUUID()}`;
  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    console.error("[reply]", requestId, "missing env:", missingEnv);
    return res
      .status(500)
      .json({ error: `Missing env: ${missingEnv.join(", ")}` });
  }

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
    const { reviewId, replyText, draftReplyId, googleReviewId } = payload as {
      reviewId?: string;
      replyText?: string;
      draftReplyId?: string;
      googleReviewId?: string;
    };
    if (!reviewId || !replyText) {
      console.error("[reply]", requestId, "missing payload", {
        hasReviewId: Boolean(reviewId),
        hasReplyText: Boolean(replyText)
      });
      return res.status(400).json({ error: "Missing reviewId or replyText" });
    }

    const reviewRecord = await resolveReviewRecord(
      userId,
      reviewId,
      googleReviewId ?? null
    );
    if (reviewRecord.status === "replied") {
      console.error("[reply]", requestId, "already replied", {
        reviewId,
        googleReviewId
      });
      return res.status(409).json({ error: "already_replied" });
    }
    if (!reviewRecord.reviewName) {
      console.error("[reply]", requestId, "review name missing", {
        reviewId,
        googleReviewId
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
    if (googleReviewId) {
      reviewUpdate = reviewUpdate.eq("id", googleReviewId);
    } else {
      reviewUpdate = reviewUpdate.eq("review_id", reviewId);
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
