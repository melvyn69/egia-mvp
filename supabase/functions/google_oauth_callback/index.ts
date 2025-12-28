import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const jsonResponse = (status: number, payload: Record<string, string>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });

const getCallbackUrl = () => {
  if (!supabaseUrl) {
    return null;
  }

  const hostname = new URL(supabaseUrl).hostname;
  const projectRef = hostname.split(".")[0];
  if (!projectRef) {
    return null;
  }

  return `https://${projectRef}.functions.supabase.co/google_oauth_callback`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !googleClientId ||
    !googleClientSecret ||
    !appBaseUrl
  ) {
    return jsonResponse(500, { error: "Server misconfigured" });
  }

  const url = new URL(req.url);
  if (
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.startsWith("/functions/v1/google_oauth_callback")
  ) {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    const publicUrl = new URL(
      `https://${projectRef}.functions.supabase.co/google_oauth_callback`
    );
    publicUrl.search = url.search;
    console.log("Redirecting gateway callback to functions domain:", {
      from: url.toString(),
      to: publicUrl.toString()
    });
    return new Response(null, {
      status: 302,
      headers: { Location: publicUrl.toString(), ...corsHeaders }
    });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return jsonResponse(400, { error: "Missing code" });
  }

  const jwt = url.searchParams.get("state");
  if (!jwt) {
    return jsonResponse(401, { error: "Missing Supabase JWT" });
  }

  const redirectUri = getCallbackUrl();
  if (!redirectUri) {
    return jsonResponse(500, { error: "Cannot build redirect URL" });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error(
      "Google token exchange failed:",
      tokenResponse.status,
      errorText
    );
    return jsonResponse(500, {
      error: "Token exchange failed",
      details: errorText
    });
  }

  const tokenData = await tokenResponse.json();
  const expiresIn = Number(tokenData.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
    jwt
  );
  if (userError || !user) {
    return jsonResponse(401, { error: "Invalid Supabase JWT" });
  }

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
        expires_at: expiresAt
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertError) {
    return jsonResponse(500, { error: "Failed to store tokens" });
  }

  const redirectUrl = new URL(appBaseUrl);
  redirectUrl.searchParams.set("connected", "1");

  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl.toString(), ...corsHeaders }
  });
});
