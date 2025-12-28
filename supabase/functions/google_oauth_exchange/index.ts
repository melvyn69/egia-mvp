import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

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

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !googleClientId ||
    !googleClientSecret ||
    !appBaseUrl
  ) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  let payload: { code?: string; jwt?: string } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  const code = payload?.code;
  const jwt = payload?.jwt;

  if (!code || !jwt) {
    return jsonResponse(400, { error: "Missing code or jwt" }, origin);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  const user = userData?.user;

  if (userError || !user) {
    return jsonResponse(401, { error: "Invalid Supabase JWT" }, origin);
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

  const { error: upsertError } = await supabaseAdmin
    .from("google_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
        access_token: tokenData.access_token ?? null,
        refresh_token: tokenData.refresh_token ?? null,
        token_type: tokenData.token_type ?? null,
        scope: tokenData.scope ?? null,
        expires_at: expiresAt,
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