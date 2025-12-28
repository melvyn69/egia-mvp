import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
});

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
  const hasAuth = Boolean(
    req.headers.get("authorization") ?? req.headers.get("Authorization")
  );
  const hasApiKey = Boolean(req.headers.get("apikey"));
  const hasUserJwtHeader = Boolean(
    req.headers.get("x-user-jwt") ?? req.headers.get("X-User-JWT")
  );
  console.log("oauth_start request:", {
    origin,
    hasAuth,
    hasApiKey,
    hasUserJwtHeader
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  if (!supabaseUrl || !serviceRoleKey || !googleClientId || !appBaseUrl) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  let userJwt =
    req.headers.get("x-user-jwt") ?? req.headers.get("X-User-JWT");
  if (!userJwt) {
    try {
      const payload = await req.json();
      if (payload && typeof payload.jwt === "string") {
        userJwt = payload.jwt;
      }
    } catch {
      userJwt = null;
    }
  }

  if (!userJwt) {
    return jsonResponse(401, { error: "Missing user JWT" }, origin);
  }

  const jwtPreview = `${userJwt.slice(0, 12)}...${userJwt.slice(-6)}`;
  console.log("oauth_start jwt preview:", jwtPreview);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(userJwt);
  if (error || !user) {
    const preview = `${userJwt.slice(0, 12)}...${userJwt.slice(-6)}`;
    console.error("Invalid user JWT:", preview, error?.message);
    return jsonResponse(401, { error: "Invalid user JWT" }, origin);
  }

  const redirectUri = getRedirectUrl();
  if (!redirectUri) {
    return jsonResponse(500, { error: "Cannot build redirect URL" }, origin);
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
  authUrl.searchParams.set("state", userJwt);

  return jsonResponse(200, { url: authUrl.toString() }, origin);
});
