import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

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
  payload: Record<string, unknown>,
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

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

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
  const user = authData?.user;

  if (authError || !user) {
    return jsonResponse(
      401,
      { code: 401, message: "Invalid JWT" },
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
    .from("google_oauth_states")
    .insert({
      user_id: user.id,
      state: oauthState,
      expires_at: stateExpiresAt
    });

  if (stateError) {
    console.error("Failed to store oauth state");
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
