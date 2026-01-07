import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";

const getRequiredEnv = () => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!googleClientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  return missing;
};

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
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

const resolveReviewName = async (
  userId: string,
  reviewId: string,
  googleReviewId?: string | null
) => {
  if (reviewId.includes("accounts/")) {
    return reviewId;
  }
  let query = supabaseAdmin
    .from("google_reviews")
    .select("review_name")
    .eq("user_id", userId)
    .eq("review_id", reviewId);
  if (googleReviewId) {
    query = query.eq("id", googleReviewId);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data?.review_name) {
    throw new Error("Review name not found");
  }
  return data.review_name as string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missingEnv = getRequiredEnv();
  if (missingEnv.length) {
    return res.status(500).json({ error: `Missing env: ${missingEnv.join(", ")}` });
  }

  try {
    const auth = req.headers.authorization || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const userId = await getUserIdFromJwt(jwt);

    const { reviewId, replyText, draftReplyId, googleReviewId } = req.body ?? {};
    if (!reviewId || !replyText) {
      return res.status(400).json({ error: "Missing reviewId or replyText" });
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn?.refresh_token) {
      return res
        .status(400)
        .json({ error: "Google not connected (missing refresh token)" });
    }

    const accessToken = await refreshGoogleAccessToken(conn.refresh_token);
    const googleReviewName = await resolveReviewName(
      userId,
      reviewId,
      googleReviewId ?? null
    );

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
      return res.status(400).json({ error: `Google reply failed: ${txt}` });
    }

    const sentAt = new Date().toISOString();
    if (draftReplyId) {
      await supabaseAdmin
        .from("review_replies")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", draftReplyId);
    } else {
      await supabaseAdmin.from("review_replies").insert({
        user_id: userId,
        review_id: googleReviewId ?? reviewId,
        reply_text: replyText,
        provider: "google",
        status: "sent",
        sent_at: sentAt
      });
    }

    const reviewUpdate = supabaseAdmin
      .from("google_reviews")
      .update({ status: "replied", reply_text: replyText, replied_at: sentAt })
      .eq("user_id", userId);
    if (googleReviewId) {
      await reviewUpdate.eq("id", googleReviewId);
    } else {
      await reviewUpdate.eq("review_id", reviewId);
    }

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
