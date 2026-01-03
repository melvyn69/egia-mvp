import type { SupabaseClient } from "@supabase/supabase-js";

const getAuthRedirectTo = () => {
  const origin = window.location.origin;
  const redirectTo = `${origin}/auth/callback`;
  if (import.meta.env.DEV) {
    console.log("auth redirectTo", redirectTo);
  }
  return redirectTo;
};

const signInWithGoogle = async (supabase: SupabaseClient) =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectTo()
    }
  });

const startGoogleConnection = async (supabase: SupabaseClient) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    throw new Error("Missing Supabase session.");
  }
  const url = new URL("/api/google/oauth/start", window.location.origin);
  url.searchParams.set("user_id", session.user.id);
  window.location.assign(url.toString());
};

export { signInWithGoogle, startGoogleConnection };
