"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncGoogleReviewsForUser = void 0;
const _utils_js_1 = require("../../../../../_shared_dist/google/_utils.js");
const api_utils_js_1 = require("../../../../../_shared_dist/api_utils.js");
const getErrorMessage = (err) => err instanceof Error
    ? err.message
    : typeof err === "string"
        ? err
        : JSON.stringify(err);
const mapRating = (starRating) => {
    switch (starRating) {
        case "ONE":
            return 1;
        case "TWO":
            return 2;
        case "THREE":
            return 3;
        case "FOUR":
            return 4;
        case "FIVE":
            return 5;
        default:
            return null;
    }
};
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
const listReviewsForLocation = async (accessToken, parent, accountResourceName, locationResourceName) => {
    const reviews = [];
    let pageToken;
    const maxRetries = 3;
    do {
        const baseUrl = `https://mybusiness.googleapis.com/v4/${parent}/reviews` +
            `?pageSize=50&orderBy=updateTime desc`;
        const url = pageToken
            ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
            : baseUrl;
        console.log("google reviews request:", {
            account_resource_name: accountResourceName,
            location_resource_name: locationResourceName,
            url
        });
        let response = null;
        let data = null;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            if (response.ok) {
                break;
            }
            if (response.status === 429 || response.status >= 500) {
                const backoff = 500 * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, backoff));
                continue;
            }
            break;
        }
        if (!response) {
            throw new Error("No response from Google reviews API.");
        }
        data = (await response.json().catch((err) => {
            console.error("google reviews response parse failed:", err);
            return null;
        }));
        if (response.status === 404) {
            console.warn("google reviews 404:", {
                account_resource_name: accountResourceName,
                location_resource_name: locationResourceName,
                url,
                response: data
            });
            return { reviews: [], notFound: true };
        }
        if (!response.ok) {
            const apiError = getErrorMessage(data && typeof data === "object"
                ? data.error
                : data);
            console.error("google reviews fetch error:", response.status, apiError);
            throw new Error(apiError || "Failed to list reviews.");
        }
        reviews.push(...(data?.reviews ?? []));
        const nextToken = data && typeof data === "object"
            ? data.nextPageToken
            : null;
        pageToken =
            typeof nextToken === "string" && nextToken.length > 0
                ? nextToken
                : undefined;
    } while (pageToken);
    return { reviews, notFound: false };
};
const upsertImportStatus = async (supabaseAdmin, userId, locationId, value) => {
    await supabaseAdmin.from("cron_state").upsert({
        key: `import_status_v1:${userId}:${locationId}`,
        value,
        updated_at: new Date().toISOString()
    });
};
const syncGoogleReviewsForUser = async (supabaseAdmin, userId, locationId) => {
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
            const refreshMessage = getErrorMessage(error);
            const reauthRequired = refreshError.code === "invalid_grant" ||
                /expired or revoked/i.test(refreshMessage);
            if (reauthRequired) {
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
    let locationQuery = supabaseAdmin
        .from("google_locations")
        .select("account_resource_name, location_resource_name, location_title")
        .eq("user_id", userId);
    if (locationId) {
        locationQuery = locationQuery.eq("location_resource_name", locationId);
    }
    const { data: locations, error: locationsError } = await locationQuery;
    if (locationsError) {
        throw new Error("locations_load_failed");
    }
    const locationList = (locations ?? []).filter((location) => location.location_resource_name && location.account_resource_name);
    let reviewsUpsertedCount = 0;
    let locationsFailed = 0;
    for (const location of locationList) {
        const locationStart = Date.now();
        const runStartedAt = new Date().toISOString();
        await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
            status: "running",
            last_run_at: runStartedAt,
            aborted: false,
            cursor: null,
            pages_exhausted: false,
            stats: { scanned: 0, upserted: 0 },
            errors_count: 0
        });
        const displayName = location.location_title ??
            location.title ??
            location.name ??
            location.location_resource_name;
        const parent = location.location_resource_name.startsWith("accounts/")
            ? location.location_resource_name
            : `${location.account_resource_name}/${location.location_resource_name}`;
        let reviews = [];
        let notFound = false;
        try {
            const result = await listReviewsForLocation(accessToken, parent, location.account_resource_name, location.location_resource_name);
            reviews = result.reviews;
            notFound = result.notFound;
        }
        catch (error) {
            await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
                status: "error",
                last_run_at: runStartedAt,
                aborted: false,
                cursor: null,
                pages_exhausted: false,
                stats: { scanned: 0, upserted: 0 },
                errors_count: 1,
                last_error: getErrorMessage(error)
            });
            throw error;
        }
        if (notFound) {
            await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
                status: "error",
                last_run_at: runStartedAt,
                aborted: false,
                cursor: null,
                pages_exhausted: false,
                stats: { scanned: 0, upserted: 0 },
                errors_count: 1,
                last_error: "Location not found on Google."
            });
            locationsFailed += 1;
            continue;
        }
        if (reviews.length === 0) {
            await supabaseAdmin
                .from("google_locations")
                .update({ last_synced_at: runStartedAt })
                .eq("user_id", userId)
                .eq("location_resource_name", location.location_resource_name);
            console.log("[gbp_reviews]", {
                user_id: userId,
                location_id: location.location_resource_name,
                fetched: 0,
                upserted: 0,
                duration_ms: Date.now() - locationStart
            });
            await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
                status: "done",
                last_run_at: runStartedAt,
                aborted: false,
                cursor: null,
                pages_exhausted: true,
                stats: { scanned: 0, upserted: 0 },
                errors_count: 0
            });
            continue;
        }
        const nowIso = new Date().toISOString();
        const rows = reviews
            .map((review) => {
            const reviewName = review.name ?? null;
            const reviewIdFromName = review.name
                ? review.name.split("/").pop() ?? null
                : null;
            const reviewId = review.reviewId ?? reviewIdFromName ?? null;
            if (!reviewId) {
                return null;
            }
            const rawReview = review;
            const comment = (typeof rawReview.comment_original === "string"
                ? rawReview.comment_original
                : null) ??
                (rawReview.originalText &&
                    typeof rawReview.originalText.text === "string"
                    ? rawReview.originalText.text
                    : null) ??
                (typeof rawReview.comment === "string" ? rawReview.comment : null);
            return {
                user_id: userId,
                location_id: location.location_resource_name,
                location_name: displayName,
                review_name: reviewName,
                review_id: reviewId,
                author_name: review.reviewer?.displayName ?? null,
                rating: mapRating(review.starRating),
                comment,
                create_time: review.createTime ?? null,
                update_time: review.updateTime ?? null,
                owner_reply: review.reviewReply?.comment ?? null,
                owner_reply_time: review.reviewReply?.updateTime ?? null,
                reply_text: review.reviewReply?.comment ?? null,
                replied_at: review.reviewReply?.updateTime ?? null,
                last_synced_at: nowIso,
                raw: review
            };
        })
            .filter(Boolean);
        const { error: upsertError } = await supabaseAdmin
            .from("google_reviews")
            .upsert(rows, {
            onConflict: "user_id,location_id,review_id"
        });
        if (upsertError) {
            console.error("google reviews upsert failed:", upsertError);
            await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
                status: "error",
                last_run_at: nowIso,
                aborted: false,
                cursor: null,
                pages_exhausted: false,
                stats: { scanned: reviews.length, upserted: 0 },
                errors_count: 1,
                last_error: upsertError.message ?? "Upsert failed."
            });
            continue;
        }
        reviewsUpsertedCount += rows.length;
        await supabaseAdmin
            .from("google_locations")
            .update({ last_synced_at: nowIso })
            .eq("user_id", userId)
            .eq("location_resource_name", location.location_resource_name);
        console.log("[gbp_reviews]", {
            user_id: userId,
            location_id: location.location_resource_name,
            fetched: reviews.length,
            upserted: rows.length,
            duration_ms: Date.now() - locationStart
        });
        await upsertImportStatus(supabaseAdmin, userId, location.location_resource_name, {
            status: "done",
            last_run_at: nowIso,
            aborted: false,
            cursor: null,
            pages_exhausted: true,
            stats: { scanned: reviews.length, upserted: rows.length },
            errors_count: 0
        });
    }
    console.log("gbp reviews sync:", {
        userId,
        locationsCount: locationList.length,
        reviewsUpsertedCount
    });
    if (locationList.length > 0) {
        await supabaseAdmin
            .from("google_connections")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("provider", "google");
    }
    return {
        locationsCount: locationList.length,
        reviewsCount: reviewsUpsertedCount,
        locationsFailed
    };
};
exports.syncGoogleReviewsForUser = syncGoogleReviewsForUser;
const handler = async (req, res) => {
    const requestId = (0, api_utils_js_1.getRequestId)(req);
    (0, api_utils_js_1.logRequest)("[gbp/reviews-sync]", {
        requestId,
        method: req.method ?? "GET",
        route: req.url ?? "/api/google/gbp/reviews/sync"
    });
    if (req.method !== "POST") {
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    try {
        const supabaseAdmin = (0, _utils_js_1.createSupabaseAdmin)();
        const { userId } = await (0, _utils_js_1.getUserFromRequest)({ headers: req.headers }, supabaseAdmin);
        if (!userId) {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
        }
        const { params } = (0, api_utils_js_1.parseQuery)(req);
        let locationId = (0, api_utils_js_1.getParam)(params, "location_id");
        if (!locationId) {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
            }
            if (body) {
                try {
                    const parsed = JSON.parse(body);
                    locationId = parsed.location_id ?? null;
                }
                catch (err) {
                    console.error("google reviews request body parse failed:", err);
                }
            }
        }
        const result = await (0, exports.syncGoogleReviewsForUser)(supabaseAdmin, userId, locationId);
        return res.status(200).json({
            ok: true,
            requestId,
            locationsCount: result.locationsCount,
            reviewsCount: result.reviewsCount,
            locationsFailed: result.locationsFailed
        });
    }
    catch (error) {
        const message = getErrorMessage(error);
        if (message === "reauth_required") {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "UNAUTHORIZED", message: "reauth_required" }, 401);
        }
        if (message === "google_not_connected") {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "NOT_FOUND", message: "Google not connected" }, 404);
        }
        if (message === "locations_load_failed") {
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Failed to load locations" }, 500);
        }
        console.error("google reviews sync error:", error);
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Sync failed" }, 500);
    }
};
exports.default = handler;
