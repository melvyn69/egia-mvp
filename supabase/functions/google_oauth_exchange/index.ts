import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

const baseAllowedOrigins = [
  "http://localhost:5173",
  "https://egia-six.vercel.app",
];

const buildAllowedOrigins = () => {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const extra = fromEnv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set([...baseAllowedOrigins, ...extra]);
};

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = buildAllowedOrigins();
  const allowedOrigin =
    origin && allowedOrigins.has(origin) ? origin : "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-google-token, x-requested-with, accept, origin, referer, user-agent, cache-control, pragma",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  origin: string | null
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin),
    },
  });

const getRedirectUrl = () => {
  if (!appBaseUrl) return null;
  return `${appBaseUrl.replace(/\/$/, "")}/google_oauth_callback`;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey");
  const hasAuth = Boolean(authHeader);
  const hasApiKey = Boolean(apiKeyHeader);

  if (req.method === "OPTIONS") {
    console.log("oauth_exchange options:", {
      origin,
      hasAuth,
      hasApiKey
    });
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  console.log("oauth_exchange post:", {
    origin,
    hasAuth,
    hasApiKey
  });

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !supabaseAnonKey ||
    !googleClientId ||
    !googleClientSecret ||
    !appBaseUrl
  ) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  let payload: { code?: string; state?: string } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  const code = payload?.code;
  const state = payload?.state ?? null;
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!code || !jwt) {
    return jsonResponse(401, { code: 401, message: "Missing JWT" }, origin);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);
  const user = userData?.user;

  if (userError || !user) {
    return jsonResponse(
      401,
      { code: 401, message: "Invalid JWT", details: userError?.message },
      origin
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (!state) {
    return jsonResponse(400, { error: "Missing OAuth state" }, origin);
  }

  const { data: existingConnection, error: stateLookupError } =
    await supabaseAdmin
      .from("google_connections")
      .select("refresh_token, oauth_state, oauth_state_expires_at")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

  if (stateLookupError) {
    console.error("Failed to load oauth state:", stateLookupError);
    return jsonResponse(500, { error: "Failed to load oauth state" }, origin);
  }

  if (
    !existingConnection?.oauth_state ||
    existingConnection.oauth_state !== state
  ) {
    return jsonResponse(401, { error: "Invalid OAuth state" }, origin);
  }

  if (existingConnection.oauth_state_expires_at) {
    const expiresAt = new Date(existingConnection.oauth_state_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return jsonResponse(401, { error: "OAuth state expired" }, origin);
    }
  }

  const redirectUri = getRedirectUrl();
  if (!redirectUri) {
    return jsonResponse(500, { error: "Cannot build redirect URL" }, origin);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token exchange failed:", tokenResponse.status, errorText);
    return jsonResponse(
      500,
      { error: "Token exchange failed", details: errorText },
      origin
    );
  }

  const tokenData = await tokenResponse.json();
  const expiresIn = Number(tokenData.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const refreshToken =
    tokenData.refresh_token ?? existingConnection?.refresh_token ?? null;

  const { error: upsertError } = await supabaseAdmin
    .from("google_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
        access_token: tokenData.access_token ?? null,
        refresh_token: refreshToken,
        token_type: tokenData.token_type ?? null,
        scope: tokenData.scope ?? null,
        expires_at: expiresAt,
        oauth_state: null,
        oauth_state_expires_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertError) {
    console.error("Upsert failed:", upsertError);
    return jsonResponse(
      500,
      {
        error: "Failed to store tokens",
        details: upsertError.message ?? String(upsertError),
      },
      origin
    );
  }

  return jsonResponse(200, { ok: true }, origin);
});
