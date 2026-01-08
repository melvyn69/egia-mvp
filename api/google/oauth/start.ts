import type { IncomingMessage, ServerResponse } from "http";
import {
  createSupabaseAdmin,
  getGoogleRedirectUri,
  getOauthStateExpiry,
  getRequiredEnv,
  getUserFromRequest
} from "../../../server/_shared/google/_utils.js";

const sendJson = (
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>
) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId, error } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );

    if (error || !userId) {
      sendJson(res, 401, {
        ok: false,
        error: error?.message ?? "Missing bearer token."
      });
      return;
    }

    const googleClientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    getRequiredEnv("APP_BASE_URL");

    const oauthState = crypto.randomUUID();
    const stateExpiresAt = getOauthStateExpiry();

    const { error: insertError } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({
        user_id: userId,
        state: oauthState,
        expires_at: stateExpiresAt
      });

    if (insertError) {
      sendJson(res, 500, { ok: false, error: "Failed to store OAuth state." });
      return;
    }

    const redirectUri = getGoogleRedirectUri();
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
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", oauthState);

    sendJson(res, 200, { ok: true, url: authUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    sendJson(res, 500, { ok: false, error: message });
  }
};

export default handler;
