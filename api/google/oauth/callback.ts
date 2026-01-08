import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../_shared/database.types";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APP_BASE_URL"
];

const getMissingEnv = () =>
  requiredEnv.filter((key) => !process.env[key]);

const buildAppRedirect = (appBaseUrl: string, status: "success" | "error") =>
  `${appBaseUrl.replace(/\/$/, "")}/google_oauth_callback?status=${status}`;

const normalizeQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const handler = async (req: any, res: any) => {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    res.status(500).send(`Missing env: ${missingEnv.join(", ")}`);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const googleClientId = process.env.GOOGLE_CLIENT_ID as string;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET as string;
  const appBaseUrl = process.env.APP_BASE_URL as string;

  const code = normalizeQueryValue(req.query.code);
  const state = normalizeQueryValue(req.query.state);

  if (!code || !state) {
    res.status(400).send("Missing OAuth code or state");
    return;
  }

  const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: oauthState, error: stateError } = await supabaseAdmin
    .from("google_oauth_states")
    .select("user_id, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !oauthState) {
    res.redirect(buildAppRedirect(appBaseUrl, "error"));
    return;
  }

  if (oauthState.expires_at) {
    const expiresAt = new Date(oauthState.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      res.redirect(buildAppRedirect(appBaseUrl, "error"));
      return;
    }
  }

  const redirectUri = `${appBaseUrl.replace(/\/$/, "")}/api/google/oauth/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    res.redirect(buildAppRedirect(appBaseUrl, "error"));
    return;
  }

  const tokenData = await tokenResponse.json();
  const expiresIn = Number(tokenData.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const refreshToken = tokenData.refresh_token ?? null;

  const { data: existingConnection } = await supabaseAdmin
    .from("google_connections")
    .select("refresh_token")
    .eq("user_id", oauthState.user_id)
    .eq("provider", "google")
    .maybeSingle();

  const { error: upsertError } = await supabaseAdmin
    .from("google_connections")
    .upsert(
      {
        user_id: oauthState.user_id,
        provider: "google",
        access_token: tokenData.access_token ?? null,
        refresh_token: refreshToken ?? existingConnection?.refresh_token ?? null,
        token_type: tokenData.token_type ?? null,
        scope: tokenData.scope ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertError) {
    res.redirect(buildAppRedirect(appBaseUrl, "error"));
    return;
  }

  await supabaseAdmin
    .from("google_oauth_states")
    .delete()
    .eq("state", state);

  res.redirect(buildAppRedirect(appBaseUrl, "success"));
};

export default handler;
