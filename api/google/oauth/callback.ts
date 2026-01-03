import type { IncomingMessage, ServerResponse } from "http";
import {
  createSupabaseAdmin,
  getGoogleRedirectUri,
  getRequiredEnv
} from "../_utils";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  const url = new URL(req.url ?? "", "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Missing OAuth code/state." }));
    return;
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { data: stateRow, error: stateError } = await supabaseAdmin
      .from("google_oauth_states")
      .select("user_id, expires_at")
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stateError) {
      console.error("google oauth state lookup failed:", stateError);
    }

    const userIdFromState = stateRow?.user_id ?? null;
    const expiresAt = stateRow?.expires_at ?? null;
    const isExpired =
      !expiresAt || Number.isNaN(Date.parse(expiresAt))
        ? true
        : Date.parse(expiresAt) <= Date.now();

    if (!userIdFromState) {
      console.warn("google oauth callback invalid state.");
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Invalid OAuth state." }));
      return;
    }

    if (isExpired) {
      console.warn("google oauth callback expired state.");
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "OAuth state expired." }));
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("google_oauth_states")
      .delete()
      .eq("state", state);
    if (deleteError) {
      console.error("google oauth state delete failed:", deleteError);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
        client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
        redirect_uri: getGoogleRedirectUri(),
        grant_type: "authorization_code"
      })
    });

    const tokenData = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok || tokenData.error) {
      console.error("google oauth token error:", tokenData);
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: tokenData.error_description ?? "Token exchange failed."
        })
      );
      return;
    }

    let refreshToken = tokenData.refresh_token ?? null;
    if (!refreshToken) {
      const { data: existing } = await supabaseAdmin
        .from("google_connections")
        .select("refresh_token")
        .eq("user_id", userIdFromState)
        .eq("provider", "google")
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? null;
    }

    const expiresInSeconds = tokenData.expires_in ?? 0;
    const expiresAt =
      expiresInSeconds > 0
        ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        : null;

    const { error: upsertError } = await supabaseAdmin
      .from("google_connections")
      .upsert(
        {
          user_id: userIdFromState,
          provider: "google",
          access_token: tokenData.access_token ?? null,
          refresh_token: refreshToken,
          token_type: tokenData.token_type ?? null,
          scope: tokenData.scope ?? null,
          expires_at: expiresAt
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      console.error("google oauth upsert failed:", upsertError);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Token storage failed." }));
      return;
    }

    const appBaseUrl = getRequiredEnv("APP_BASE_URL");
    res.statusCode = 302;
    res.setHeader("Location", `${appBaseUrl}/connect?google=connected`);
    res.end();
  } catch (error) {
    console.error("google oauth callback error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "OAuth callback failed." }));
  }
};

export default handler;
