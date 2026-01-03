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
  const jwt = sessionData.session?.access_token ?? null;
  if (!jwt) {
    throw new Error("Missing Supabase session.");
  }
  const headers: Record<string, string> = {};
  headers.Authorization = `Bearer ${jwt}`;
  const { data, error } = await supabase.functions.invoke("google_oauth_start", {
    headers
  });
  if (error) {
    throw error;
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) {
    throw new Error("OAuth URL missing.");
  }
  window.location.assign(url);
};

export { signInWithGoogle, startGoogleConnection };
