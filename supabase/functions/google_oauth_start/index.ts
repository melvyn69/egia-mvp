import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

const baseAllowedOrigins = [
  "http://localhost:5173",
  "https://egia-six.vercel.app"
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
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, string>,
  origin: string | null
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin)
    }
  });

const getRedirectUrl = () => {
  if (!appBaseUrl) {
    return null;
  }

  return `${appBaseUrl.replace(/\/$/, "")}/google_oauth_callback`;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey");
  const hasAuth = Boolean(authHeader);
  const hasApiKey = Boolean(apiKeyHeader);

  if (req.method === "OPTIONS") {
    console.log("oauth_start options:", {
      origin,
      hasAuth,
      hasApiKey
    });
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  console.log("oauth_start post:", {
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
    !appBaseUrl
  ) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!jwt) {
    return jsonResponse(401, { code: 401, message: "Missing JWT" }, origin);
  }

  const jwtPreview = `${jwt.slice(0, 12)}...${jwt.slice(-6)}`;
  console.log("oauth_start jwt preview:", jwtPreview);

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
  const user = authData?.user;

  if (authError || !user) {
    const preview = `${jwt.slice(0, 12)}...${jwt.slice(-6)}`;
    console.error("Invalid user JWT:", preview, authError?.message);
    return jsonResponse(
      401,
      { code: 401, message: "Invalid JWT", details: authError?.message },
      origin
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const redirectUri = getRedirectUrl();
  if (!redirectUri) {
    return jsonResponse(500, { error: "Cannot build redirect URL" }, origin);
  }

  const oauthState = crypto.randomUUID();
  const stateExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: stateError } = await supabaseAdmin
    .from("google_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
        oauth_state: oauthState,
        oauth_state_expires_at: stateExpiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,provider" }
    );

  if (stateError) {
    console.error("Failed to store oauth state:", stateError);
    return jsonResponse(500, { error: "Failed to store oauth state" }, origin);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/business.manage"
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", oauthState);

  return jsonResponse(200, { url: authUrl.toString() }, origin);
});
