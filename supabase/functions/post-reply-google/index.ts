import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PostReplyPayload = {
  reviewId?: string;
  replyText?: string;
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

const getUserIdFromJwt = (req: Request): string | null => {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
};

// Required scopes: https://www.googleapis.com/auth/business.manage
// Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const apiKeyHeader = req.headers.get("apikey");
  if (!apiKeyHeader) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const userId = getUserIdFromJwt(req);
  if (!authHeader || !userId) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  try {
    const payload = (await req.json()) as PostReplyPayload;
    if (!payload.reviewId || !payload.replyText) {
      return jsonWithCors(400, {
        error: "Missing required fields: reviewId, replyText.",
        requestId
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonWithCors(500, { error: "Supabase env missing.", requestId });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: connection, error: connectionError } = await supabase
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    if (connectionError || !connection?.refresh_token) {
      return jsonWithCors(400, { error: "Missing Google connection.", requestId });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonWithCors(500, { error: "Google OAuth env missing.", requestId });
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
      const text = await tokenResponse.text();
      console.error("Google token error:", tokenResponse.status, text);
      return jsonWithCors(500, { error: "Google token failed.", requestId });
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      token_type?: string;
    };
    if (!tokenJson.access_token) {
      return jsonWithCors(500, { error: "Missing Google access token.", requestId });
    }

    const replyUrl = `https://mybusiness.googleapis.com/v4/${payload.reviewId}/reply`;
    const gbpStart = Date.now();
    const gbpResponse = await fetch(replyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ comment: payload.replyText })
    });
    const gbpDurationMs = Date.now() - gbpStart;
    const gbpText = await gbpResponse.text();
    const gbpPayload = gbpText ? JSON.parse(gbpText) : null;

    if (!gbpResponse.ok) {
      console.error("GBP reply error:", gbpResponse.status, gbpText);
      console.log(
        JSON.stringify({
          requestId,
          userId,
          reviewId: payload.reviewId,
          status: gbpResponse.status,
          durationMs: gbpDurationMs
        })
      );
      return jsonWithCors(500, { error: "Google reply failed.", requestId });
    }

    console.log(
      JSON.stringify({
        requestId,
        userId,
        reviewId: payload.reviewId,
        status: 200,
        durationMs: gbpDurationMs
      })
    );
    return jsonWithCors(200, {
      ok: true,
      googleResponse: gbpPayload,
      requestId
    });
  } catch (error) {
    console.error("post-reply-google error:", error);
    return jsonWithCors(500, { error: "Unexpected error.", requestId });
  }
});
