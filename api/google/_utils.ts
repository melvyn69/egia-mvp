import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClient = ReturnType<typeof createClient>;

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const createSupabaseAdmin = (): SupabaseAdminClient => {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
};

const getBearerToken = (req: { headers: Record<string, string | undefined> }) => {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
};

const getUserFromRequest = async (
  req: { headers: Record<string, string | undefined> },
  supabaseAdmin: SupabaseAdminClient
) => {
  const token = getBearerToken(req);
  if (!token) {
    return { userId: null, error: new Error("Missing bearer token.") };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    return { userId: null, error };
  }
  if (!data.user?.id) {
    return { userId: null, error: new Error("User not found.") };
  }

  return { userId: data.user.id, error: null };
};

const getGoogleRedirectUri = () => {
  const appBaseUrl = getRequiredEnv("APP_BASE_URL");
  return new URL("/api/google/oauth/callback", appBaseUrl).toString();
};

const getOauthStateExpiry = () =>
  new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();

export {
  createSupabaseAdmin,
  getBearerToken,
  getGoogleRedirectUri,
  getOauthStateExpiry,
  getRequiredEnv,
  getUserFromRequest
};
