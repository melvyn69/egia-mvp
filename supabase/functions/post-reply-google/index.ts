import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PostReplyPayload = {
  reviewId?: string;
  replyText?: string;
};

const configuredOrigin = (() => {
  const value = Deno.env.get("ALLOWED_ORIGIN") ?? Deno.env.get("APP_BASE_URL") ?? "";
  try {
    return new URL(value).origin;
  } catch {
    return "https://egia-six.vercel.app";
  }
})();

const corsHeaders = {
  "Access-Control-Allow-Origin": configuredOrigin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonWithCors = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const logEvent = (payload: Record<string, unknown>) => {
  console.log(JSON.stringify(payload));
};

const safeJsonParse = async (
  response: Response,
  requestId: string,
  step: string
): Promise<{ json: Record<string, unknown> | null; isJson: boolean }> => {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  if (!isJson) {
    await response.body?.cancel();
    logEvent({
      requestId,
      step,
      upstreamStatus: response.status,
      upstreamContentType: contentType
    });
    return { json: null, isJson: false };
  }
  try {
    const json = (await response.json()) as Record<string, unknown>;
    return { json, isJson: true };
  } catch {
    return { json: null, isJson: false };
  }
};

// Required scopes: https://www.googleapis.com/auth/business.manage
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const stepBase = "post_reply_google";
  let userId: string | null = null;
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonWithCors(405, { error: "Method not allowed", requestId });
  }

  const apiKeyHeader = req.headers.get("apikey");
  if (!apiKeyHeader) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonWithCors(401, {
      error: "Unauthorized",
      code: "MISSING_AUTH_HEADER",
      requestId
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonWithCors(500, {
        error: "Supabase env missing.",
        code: "MISSING_SECRET",
        requestId
      });
    }

    const payload = (await req.json()) as PostReplyPayload;
    if (!payload.reviewId || !payload.replyText) {
      return jsonWithCors(400, {
        error: "Missing required fields: reviewId, replyText.",
        code: "MISSING_FIELDS",
        requestId
      });
    }

    const userToken = authHeader.slice("Bearer ".length).trim();
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
      userToken
    );
    userId = userData?.user?.id ?? null;
    if (userError || !userId) {
      logEvent({
        requestId,
        step: `${stepBase}:auth_user`,
        upstreamStatus: userError?.status ?? null,
        error: userError ? "invalid_jwt" : "user_not_found"
      });
      return jsonWithCors(401, {
        error: "Unauthorized",
        code: "INVALID_JWT",
        requestId
      });
    }

    const supabaseDb = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    const { data: connection, error: connectionError } = await supabaseDb
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    if (connectionError || !connection?.refresh_token) {
      logEvent({
        requestId,
        step: `${stepBase}:connection`,
        userId,
        error: connectionError ? "connection_lookup_failed" : "missing_refresh_token"
      });
      return jsonWithCors(400, {
        error: "Missing Google connection.",
        code: "MISSING_GOOGLE_CONNECTION",
        requestId
      });
    }

    const { data: ownedReview, error: reviewError } = await supabaseDb
      .from("google_reviews")
      .select("review_name")
      .eq("user_id", userId)
      .eq("review_name", payload.reviewId)
      .maybeSingle();

    if (reviewError || !ownedReview?.review_name) {
      logEvent({
        requestId,
        step: `${stepBase}:review_ownership`,
        userId,
        error: reviewError ? "review_lookup_failed" : "review_not_owned"
      });
      return jsonWithCors(404, {
        error: "Review not found.",
        code: "REVIEW_NOT_FOUND",
        requestId
      });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonWithCors(500, {
        error: "Google OAuth env missing.",
        code: "MISSING_SECRET",
        requestId
      });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token
      })
    });

    if (!tokenResponse.ok) {
      const contentType = tokenResponse.headers.get("content-type") ?? "";
      await tokenResponse.body?.cancel();
      logEvent({
        requestId,
        step: `${stepBase}:google_token`,
        userId,
        upstreamStatus: tokenResponse.status,
        upstreamContentType: contentType
      });
      return jsonWithCors(500, {
        error: "Google token failed.",
        code: "GOOGLE_TOKEN_FAILED",
        requestId
      });
    }

    const { json: tokenJson, isJson: tokenIsJson } = await safeJsonParse(
      tokenResponse,
      requestId,
      `${stepBase}:google_token_parse`
    );
    if (!tokenIsJson || !tokenJson) {
      return jsonWithCors(502, {
        error: "Google token response not JSON.",
        code: "GOOGLE_UPSTREAM_HTML",
        requestId
      });
    }
    if (!tokenJson.access_token) {
      return jsonWithCors(500, {
        error: "Missing Google access token.",
        code: "MISSING_GOOGLE_ACCESS_TOKEN",
        requestId
      });
    }

    const replyUrl = `https://mybusiness.googleapis.com/v4/${ownedReview.review_name}/reply`;
    const gbpStart = Date.now();
    const gbpResponse = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token as string}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ comment: payload.replyText })
    });
    const gbpDurationMs = Date.now() - gbpStart;
    const gbpContentType = gbpResponse.headers.get("content-type") ?? "";

    if (!gbpResponse.ok) {
      await gbpResponse.body?.cancel();
      logEvent({
        requestId,
        step: `${stepBase}:gbp_reply`,
        userId,
        reviewId: payload.reviewId,
        upstreamStatus: gbpResponse.status,
        upstreamContentType: gbpContentType,
        durationMs: gbpDurationMs
      });
      const code = gbpResponse.status === 401
        ? "GOOGLE_401"
        : gbpResponse.status === 403
          ? "GOOGLE_403"
          : "GOOGLE_REPLY_FAILED";
      return jsonWithCors(502, { error: "Google reply failed.", code, requestId });
    }

    const { json: gbpPayload, isJson: gbpIsJson } = await safeJsonParse(
      gbpResponse,
      requestId,
      `${stepBase}:gbp_reply_parse`
    );
    if (!gbpIsJson) {
      return jsonWithCors(502, {
        error: "Google reply response not JSON.",
        code: "GOOGLE_UPSTREAM_HTML",
        requestId
      });
    }

    logEvent({
      requestId,
      step: `${stepBase}:success`,
      userId,
      reviewId: payload.reviewId,
      status: 200,
      durationMs: gbpDurationMs
    });
    return jsonWithCors(200, {
      ok: true,
      googleResponse: gbpPayload,
      requestId
    });
  } catch (error) {
    console.error("post-reply-google failed", {
      requestId,
      error: error instanceof Error ? error.name : "unknown"
    });
    logEvent({
      requestId,
      step: `${stepBase}:exception`,
      userId,
      error: error instanceof Error ? error.name : "unknown"
    });
    return jsonWithCors(500, {
      error: "Unexpected error.",
      code: "UNEXPECTED_ERROR",
      requestId
    });
  }
});
