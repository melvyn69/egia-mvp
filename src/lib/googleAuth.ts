import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_OAUTH_SCOPES =
  "https://www.googleapis.com/auth/business.manage openid email profile";

const GOOGLE_OAUTH_PARAMS = {
  prompt: "consent",
  access_type: "offline",
  include_granted_scopes: "true"
};

const getRedirectTo = () => {
  const origin = window.location.origin;
  const callbackPath = "/google_oauth_callback";
  const redirectTo = `${origin}${callbackPath}`;
  if (import.meta.env.DEV) {
    console.log("google oauth origin", origin);
    console.log("google oauth redirectTo", redirectTo);
  }
  return redirectTo;
};

const connectGoogle = async (supabase: SupabaseClient) =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getRedirectTo(),
      scopes: GOOGLE_OAUTH_SCOPES,
      queryParams: GOOGLE_OAUTH_PARAMS
    }
  });

export { connectGoogle };
