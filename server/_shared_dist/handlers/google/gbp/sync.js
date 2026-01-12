"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncGoogleLocationsForUser = void 0;
const _utils_js_1 = require("../../../../_shared_dist/google/_utils.js");
const _auth_js_1 = require("../../../../_shared_dist/_auth.js");
const api_utils_js_1 = require("../../../../_shared_dist/api_utils.js");
const refreshAccessToken = async (refreshToken) => {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            client_id: (0, _utils_js_1.getRequiredEnv)("GOOGLE_CLIENT_ID"),
            client_secret: (0, _utils_js_1.getRequiredEnv)("GOOGLE_CLIENT_SECRET"),
            grant_type: "refresh_token",
            refresh_token: refreshToken
        })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error) {
        const refreshError = new Error(tokenData.error_description ?? "Token refresh failed.");
        refreshError.code = tokenData.error;
        throw refreshError;
    }
    return tokenData;
};
const listAccounts = async (accessToken) => {
    const response = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error?.message ?? "Failed to list accounts.");
    }
    return (data.accounts ?? []);
};
const listLocationsForAccount = async (accessToken, accountName) => {
    const locations = [];
    let pageToken;
    const normalizedAccountName = accountName.startsWith("accounts/")
        ? accountName
        : `accounts/${accountName}`;
    do {
        const baseUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${normalizedAccountName}/locations` +
            `?readMask=name,title,storefrontAddress,metadata,phoneNumbers,websiteUri` +
            `&pageSize=100`;
        const url = pageToken
            ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
            : baseUrl;
        console.log("[GBP] account.name =", accountName);
        console.log("[GBP] list locations url =", url);
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error?.message ?? "Failed to list locations.");
        }
        locations.push(...(data.locations ?? []));
        pageToken = data.nextPageToken;
    } while (pageToken);
    return locations;
};
const syncGoogleLocationsForUser = async (supabaseAdmin, userId) => {
    const { data: connection, error: connectionError } = await supabaseAdmin
        .from("google_connections")
        .select("access_token,refresh_token,expires_at")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
    if (connectionError || !connection) {
        throw new Error("google_not_connected");
    }
    let accessToken = connection.access_token ?? "";
    const expiresAt = connection.expires_at
        ? new Date(connection.expires_at).getTime()
        : 0;
    const shouldRefresh = !accessToken || expiresAt - Date.now() < 60_000;
    if (shouldRefresh) {
        if (!connection.refresh_token) {
            throw new Error("reauth_required");
        }
        let refreshed;
        try {
            refreshed = await refreshAccessToken(connection.refresh_token);
        }
        catch (error) {
            const refreshError = error;
            const reauthRequired = refreshError.code === "invalid_grant" ||
                /expired or revoked/i.test(refreshError.message);
            if (reauthRequired) {
                await supabaseAdmin
                    .from("google_connections")
                    .delete()
                    .eq("user_id", userId)
                    .eq("provider", "google");
                throw new Error("reauth_required");
            }
            throw error;
        }
        accessToken = refreshed.access_token;
        const newExpiresAt = refreshed.expires_in && refreshed.expires_in > 0
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : null;
        const { error: refreshError } = await supabaseAdmin
            .from("google_connections")
            .update({
            access_token: accessToken,
            expires_at: newExpiresAt,
            scope: refreshed.scope ?? null,
            token_type: refreshed.token_type ?? null
        })
            .eq("user_id", userId)
            .eq("provider", "google");
        if (refreshError) {
            console.error("google token refresh update failed:", refreshError);
        }
    }
    const accounts = await listAccounts(accessToken);
    let locationsCount = 0;
    for (const account of accounts) {
        if (!account.name) {
            continue;
        }
        const locations = await listLocationsForAccount(accessToken, account.name);
        locationsCount += locations.length;
        if (locations.length === 0) {
            continue;
        }
        const rows = locations.map((location) => ({
            user_id: userId,
            provider: "google",
            account_resource_name: account.name,
            location_resource_name: location.name,
            location_title: location.title ?? null,
            store_code: location.storeCode ?? null,
            address_json: (location.storefrontAddress ?? null),
            phone: location.primaryPhone ?? null,
            website_uri: location.websiteUri ?? null,
            updated_at: new Date().toISOString()
        }));
        const { error: upsertError } = await supabaseAdmin
            .from("google_locations")
            .upsert(rows, { onConflict: "user_id,location_resource_name" });
        if (upsertError) {
            console.error("google locations upsert failed:", upsertError);
        }
    }
    return { locationsCount };
};
exports.syncGoogleLocationsForUser = syncGoogleLocationsForUser;
const fetchActiveLocationIds = async (supabaseAdmin, userId) => {
    const { data } = await supabaseAdmin
        .from("business_settings")
        .select("active_location_ids")
        .eq("user_id", userId)
        .maybeSingle();
    const activeIds = Array.isArray(data?.active_location_ids)
        ? data?.active_location_ids.filter(Boolean)
        : null;
    return activeIds && activeIds.length > 0 ? new Set(activeIds) : null;
};
const handler = async (req, res) => {
    const requestId = (0, api_utils_js_1.getRequestId)(req);
    if (req.method === "GET") {
        try {
            const auth = await (0, _auth_js_1.requireUser)(req, res);
            if (!auth) {
                return;
            }
            const { userId, supabaseAdmin } = auth;
            const { params } = (0, api_utils_js_1.parseQuery)(req);
            const activeOnly = (0, api_utils_js_1.getParam)(params, "active_only") === "1";
            let query = supabaseAdmin
                .from("google_locations")
                .select("id, location_resource_name, location_title, updated_at")
                .eq("user_id", userId);
            if (activeOnly) {
                const activeIds = await fetchActiveLocationIds(supabaseAdmin, userId);
                if (activeIds && activeIds.size > 0) {
                    query = query.in("id", Array.from(activeIds));
                }
            }
            const { data, error } = await query.order("location_title", {
                ascending: true
            });
            if (error) {
                console.error("google locations list failed:", error);
                return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Failed to load locations" }, 500);
            }
            const locations = (data ?? []).map((row) => ({
                id: row.id,
                location_resource_name: row.location_resource_name,
                location_title: row.location_title ?? null,
                updated_at: row.updated_at ?? null
            }));
            (0, api_utils_js_1.logRequest)("[gbp/locations]", {
                requestId,
                userId,
                activeOnly,
                count: locations.length
            });
            return res.status(200).json({ ok: true, locations, requestId });
        }
        catch (error) {
            console.error("google gbp get locations error:", error);
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Failed to load locations" }, 500);
        }
    }
    if (req.method !== "POST") {
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    try {
        const supabaseAdmin = (0, _utils_js_1.createSupabaseAdmin)();
        const { userId } = await (0, _utils_js_1.getUserFromRequest)({ headers: req.headers, url: req.url }, supabaseAdmin);
        if (!userId) {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
        }
        const { data: connection, error: connectionError } = await supabaseAdmin
            .from("google_connections")
            .select("refresh_token")
            .eq("user_id", userId)
            .eq("provider", "google")
            .maybeSingle();
        if (connectionError || !connection) {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "NOT_FOUND", message: "Google not connected" }, 404);
        }
        if (!connection.refresh_token) {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "reauth_required" }, 401);
        }
        const { data: existingJob } = await supabaseAdmin
            .from("job_queue")
            .select("id, status")
            .eq("user_id", userId)
            .eq("type", "google_gbp_sync")
            .in("status", ["queued", "running"])
            .order("created_at", { ascending: false })
            .maybeSingle();
        if (existingJob) {
            (0, api_utils_js_1.logRequest)("[gbp/sync]", {
                requestId,
                userId,
                status: "already_queued",
                jobId: existingJob.id
            });
            return res.status(200).json({
                ok: true,
                queued: true,
                job_id: existingJob.id,
                status: existingJob.status,
                requestId
            });
        }
        const nowIso = new Date().toISOString();
        const { data: job, error: jobError } = await supabaseAdmin
            .from("job_queue")
            .insert({
            user_id: userId,
            type: "google_gbp_sync",
            payload: { include_reviews: true },
            status: "queued",
            run_at: nowIso,
            updated_at: nowIso
        })
            .select("id, status")
            .single();
        if (jobError || !job) {
            console.error("job_queue insert failed:", jobError);
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Queue failed" }, 500);
        }
        (0, api_utils_js_1.logRequest)("[gbp/sync]", {
            requestId,
            userId,
            status: "queued",
            jobId: job.id
        });
        return res.status(200).json({
            ok: true,
            queued: true,
            job_id: job.id,
            status: job.status,
            requestId
        });
    }
    catch (error) {
        console.error("google gbp sync error:", error);
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Sync failed" }, 500);
    }
};
exports.default = handler;
// Smoke test:
// curl -i "https://<app>/api/google/gbp/sync?active_only=1" -H "Authorization: Bearer $JWT"
// curl -i -X POST "https://<app>/api/google/gbp/sync" -H "Authorization: Bearer $JWT"
