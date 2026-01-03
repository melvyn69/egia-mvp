import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClient = ReturnType<typeof createClient>;

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

const parseCookies = (cookieHeader: string | undefined) => {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

const getBearerToken = (req: { headers: Record<string, string | undefined> }) => {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
};

const getUserFromRequest = async (
  req: { headers: Record<string, string | undefined>; url?: string },
  supabaseAdmin: SupabaseAdminClient
) => {
  const token = getBearerToken(req);
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      return { userId: null, error };
    }
    if (data.user?.id) {
      return { userId: data.user.id, error: null };
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken =
    cookies["sb-access-token"] ?? cookies["sb-refresh-token"] ?? null;
  if (cookieToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(cookieToken);
    if (error) {
      return { userId: null, error };
    }
    if (data.user?.id) {
      return { userId: data.user.id, error: null };
    }
  }

  if (req.url) {
    const url = new URL(req.url, "http://localhost");
    const userId = url.searchParams.get("user_id");
    if (userId) {
      return { userId, error: null };
    }
  }

  return { userId: null, error: null };
};

export {
  createSupabaseAdmin,
  getBearerToken,
  getRequiredEnv,
  getUserFromRequest
};
