import type { SupabaseClient } from "@supabase/supabase-js";

const startGoogleConnection = async (supabase: SupabaseClient) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    throw new Error("Missing Supabase session.");
  }
  const response = await fetch("/api/google/oauth/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("API route not reached (rewrite?).");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data?.url) {
    throw new Error(data?.error ?? "OAuth URL missing.");
  }
  window.location.assign(data.url);
};

export { startGoogleConnection };
