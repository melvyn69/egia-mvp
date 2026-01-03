import type { SupabaseClient } from "@supabase/supabase-js";

const startGoogleConnection = async (supabase: SupabaseClient) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    throw new Error("Missing Supabase session.");
  }
  const response = await fetch("/api/google/oauth/start", {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.url) {
    throw new Error("OAuth URL missing.");
  }
  window.location.assign(data.url);
};

export { startGoogleConnection };
