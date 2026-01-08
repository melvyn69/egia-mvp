import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSupabaseAdmin, getBearerToken } from "./google/_utils.js";

const requireUser = async (req: VercelRequest, res: VercelResponse) => {
  const token = getBearerToken(req.headers as Record<string, string | undefined>);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { userId: data.user.id, supabaseAdmin };
};

export { requireUser };
