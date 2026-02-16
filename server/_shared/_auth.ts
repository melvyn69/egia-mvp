import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSupabaseAdmin, getBearerToken } from "./google/_utils";
import { getRequestId, sendError, logRequest } from "./api_utils";

const requireUser = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  const token = getBearerToken(req.headers as Record<string, string | undefined>);
  if (!token) {
    sendError(
      res,
      requestId,
      { code: "UNAUTHORIZED", message: "Unauthorized" },
      401
    );
    return null;
  }
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    sendError(
      res,
      requestId,
      { code: "UNAUTHORIZED", message: "Unauthorized" },
      401
    );
    return null;
  }
  logRequest("[auth]", {
    requestId,
    userId: data.user.id,
    route: req.url ?? ""
  });
  return { userId: data.user.id, supabaseAdmin };
};

export { requireUser };
