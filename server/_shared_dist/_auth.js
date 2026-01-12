import { createSupabaseAdmin, getBearerToken } from "./google/_utils.js";
import { getRequestId, sendError, logRequest } from "./api_utils.js";
const requireUser = async (req, res) => {
    const requestId = getRequestId(req);
    const token = getBearerToken(req.headers);
    if (!token) {
        sendError(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
        return null;
    }
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
        sendError(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
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
