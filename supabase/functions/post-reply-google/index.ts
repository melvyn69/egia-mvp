import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PostReplyPayload = {
  reviewId?: string;
  replyText?: string;
  userToken?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
    const text = await response.text();
    logEvent({
      requestId,
      step,
      upstreamStatus: response.status,
      upstreamContentType: contentType,
      upstreamSnippet: text.slice(0, 200)
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const apiKeyHeader = req.headers.get("apikey");
  if (!apiKeyHeader) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  logEvent({
    requestId,
    step: `${stepBase}:headers_debug`,
    hasAuthLower: Boolean(req.headers.get("authorization")),
    hasAuthUpper: Boolean(req.headers.get("Authorization")),
    hasApikey: Boolean(req.headers.get("apikey"))
  });

  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  logEvent({
    requestId,
    step: `${stepBase}:auth`,
    hasAuthHeader: Boolean(authHeader)
  });
  if (!authHeader) {
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
    if (!payload.reviewId || !payload.replyText || !payload.userToken) {
      return jsonWithCors(400, {
        error: "Missing required fields: reviewId, replyText, userToken.",
        code: "MISSING_FIELDS",
        requestId
      });
    }

    const userToken = payload.userToken;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
      userToken
    );
    const userId = userData?.user?.id ?? null;
    if (userError || !userId) {
      logEvent({
        requestId,
        step: `${stepBase}:auth_user`,
        upstreamStatus: userError?.status ?? null,
        error: userError?.message ?? "user_not_found"
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
        error: connectionError?.message ?? "missing_refresh_token"
      });
      return jsonWithCors(400, {
        error: "Missing Google connection.",
        code: "MISSING_GOOGLE_CONNECTION",
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
      const text = await tokenResponse.text();
      logEvent({
        requestId,
        step: `${stepBase}:google_token`,
        userId,
        upstreamStatus: tokenResponse.status,
        upstreamContentType: contentType,
        upstreamSnippet: text.slice(0, 200)
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

    const replyUrl = `https://mybusiness.googleapis.com/v4/${payload.reviewId}/reply`;
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
      const gbpText = await gbpResponse.text();
      logEvent({
        requestId,
        step: `${stepBase}:gbp_reply`,
        userId,
        reviewId: payload.reviewId,
        upstreamStatus: gbpResponse.status,
        upstreamContentType: gbpContentType,
        upstreamSnippet: gbpText.slice(0, 200),
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
    console.error("post-reply-google error:", error);
    logEvent({
      requestId,
      step: `${stepBase}:exception`,
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return jsonWithCors(500, {
      error: "Unexpected error.",
      code: "UNEXPECTED_ERROR",
      requestId
    });
  }
});
