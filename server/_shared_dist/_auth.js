"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUser = void 0;
const _utils_js_1 = require("./google/_utils.js");
const api_utils_js_1 = require("./api_utils.js");
const requireUser = async (req, res) => {
    const requestId = (0, api_utils_js_1.getRequestId)(req);
    const token = (0, _utils_js_1.getBearerToken)(req.headers);
    if (!token) {
        (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
        return null;
    }
    const supabaseAdmin = (0, _utils_js_1.createSupabaseAdmin)();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
        (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
        return null;
    }
    (0, api_utils_js_1.logRequest)("[auth]", {
        requestId,
        userId: data.user.id,
        route: req.url ?? ""
    });
    return { userId: data.user.id, supabaseAdmin };
};
exports.requireUser = requireUser;
