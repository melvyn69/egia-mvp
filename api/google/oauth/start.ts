import crypto from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import {
  createSupabaseAdmin,
  getGoogleRedirectUri,
  getOauthStateExpiry,
  getRequiredEnv,
  getUserFromRequest
} from "../_utils";

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId, error: userError } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );

    if (!userId) {
      if (userError) {
        console.warn("google oauth start auth error:", userError.message);
      }
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: "Missing authenticated user."
        })
      );
      return;
    }

    const state = crypto.randomBytes(32).toString("hex");
    const expiresAt = getOauthStateExpiry();
    const { error: stateError } = await supabaseAdmin
      .from("google_oauth_states")
      .insert({
        user_id: userId,
        state,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      });

    if (stateError) {
      console.error("google oauth state insert failed:", stateError);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "State storage failed." }));
      return;
    }

    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage");
    oauthUrl.searchParams.set("redirect_uri", getGoogleRedirectUri());
    oauthUrl.searchParams.set("client_id", getRequiredEnv("GOOGLE_CLIENT_ID"));
    oauthUrl.searchParams.set("state", state);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        url: oauthUrl.toString(),
        expiresAt
      })
    );
  } catch (error) {
    console.error("google oauth start error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "OAuth start failed." }));
  }
};

export default handler;
