"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_js_1 = require("@supabase/supabase-js");
const sync_js_1 = require("../../google/gbp/sync.js");
const sync_js_2 = require("../../google/gbp/reviews/sync.js");
const api_utils_js_1 = require("../../../../_shared_dist/api_utils.js");
const CURSOR_KEY = "google_sync_replies_cursor_v1";
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const getEnv = (keys) => {
    for (const key of keys) {
        const value = process.env[key];
        if (value) {
            return value;
        }
    }
    return "";
};
const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceRoleKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
const googleClientId = getEnv(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"]);
const googleClientSecret = getEnv([
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET"
]);
const cronSecret = getEnv(["CRON_SECRET"]);
const getMissingEnv = () => {
    const missing = [];
    if (!supabaseUrl)
        missing.push("SUPABASE_URL");
    if (!serviceRoleKey)
        missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!googleClientId)
        missing.push("GOOGLE_OAUTH_CLIENT_ID|GOOGLE_CLIENT_ID");
    if (!googleClientSecret)
        missing.push("GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_CLIENT_SECRET");
    if (!cronSecret)
        missing.push("CRON_SECRET");
    return missing;
};
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
});
const loadCursor = async () => {
    const { data } = await supabaseAdmin
        .from("cron_state")
        .select("value")
        .eq("key", CURSOR_KEY)
        .maybeSingle();
    return data?.value ?? { location_pk: null, page_token: null };
};
const saveCursor = async (cursor) => {
    await supabaseAdmin
        .from("cron_state")
        .upsert({
        key: CURSOR_KEY,
        value: cursor,
        updated_at: new Date().toISOString()
    });
};
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
const refreshGoogleAccessToken = async (refreshToken) => {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken
        })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Google token refresh failed: ${txt}`);
    }
    const json = await res.json();
    return json.access_token;
};
const listReviewsPage = async (accessToken, parent, pageToken) => {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error?.message ?? "Google API error");
    }
    return {
        reviews: (data?.reviews ?? []),
        nextPageToken: data?.nextPageToken ?? null
    };
};
const getCronSecrets = (req) => {
    const expected = String(cronSecret ?? "").trim();
    const headerSecret = req.headers["x-cron-secret"] ??
        req.headers["x-cron-key"];
    const auth = req.headers.authorization ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ")
        ? auth.slice(7)
        : "";
    const provided = String(headerSecret ?? bearer ?? "").trim();
    return { expected, provided };
};
const JOB_RATE_LIMIT_DELAY_MS = 60_000;
const claimJobs = async (limit) => {
    const { data, error } = await supabaseAdmin.rpc("job_queue_claim", {
        max_jobs: limit
    });
    if (error) {
        console.error("[jobs] claim failed", error);
        return [];
    }
    return (data ?? []);
};
const updateJob = async (jobId, patch) => {
    await supabaseAdmin.from("job_queue").update(patch).eq("id", jobId);
};
const processJobQueue = async () => {
    const maxJobs = Number(process.env.JOB_QUEUE_MAX ?? 50);
    const jobs = await claimJobs(maxJobs);
    if (jobs.length === 0) {
        return { processed: 0, failed: 0, skipped: 0 };
    }
    const jobIds = jobs.map((job) => job.id);
    const userIds = Array.from(new Set(jobs.map((job) => job.user_id)));
    const { data: runningRows } = await supabaseAdmin
        .from("job_queue")
        .select("id, user_id")
        .eq("status", "running")
        .in("user_id", userIds);
    const activeUsers = new Set((runningRows ?? [])
        .filter((row) => !jobIds.includes(row.id))
        .map((row) => row.user_id));
    const inBatchUsers = new Set();
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    for (const job of jobs) {
        const attempts = (job.attempts ?? 0) + 1;
        if (activeUsers.has(job.user_id) || inBatchUsers.has(job.user_id)) {
            skipped += 1;
            await updateJob(job.id, {
                status: "queued",
                attempts,
                last_error: "rate_limited",
                run_at: new Date(Date.now() + JOB_RATE_LIMIT_DELAY_MS).toISOString(),
                updated_at: new Date().toISOString()
            });
            continue;
        }
        inBatchUsers.add(job.user_id);
        try {
            if (job.type === "google_gbp_sync") {
                await (0, sync_js_1.syncGoogleLocationsForUser)(supabaseAdmin, job.user_id);
                await (0, sync_js_2.syncGoogleReviewsForUser)(supabaseAdmin, job.user_id, null);
                await updateJob(job.id, {
                    status: "done",
                    attempts,
                    last_error: null,
                    updated_at: new Date().toISOString()
                });
                processed += 1;
            }
            else {
                await updateJob(job.id, {
                    status: "failed",
                    attempts,
                    last_error: `Unknown job type: ${job.type}`,
                    updated_at: new Date().toISOString()
                });
                failed += 1;
            }
        }
        catch (error) {
            await updateJob(job.id, {
                status: "failed",
                attempts,
                last_error: error instanceof Error ? error.message : "Job failed",
                updated_at: new Date().toISOString()
            });
            failed += 1;
        }
    }
    return { processed, failed, skipped };
};
async function handler(req, res) {
    const requestId = (0, api_utils_js_1.getRequestId)(req);
    const start = Date.now();
    const MAX_MS = Number(process.env.CRON_MAX_MS ?? 24000);
    const MAX_REVIEWS = Number(process.env.CRON_MAX_REVIEWS ?? 80);
    const timeUp = () => Date.now() - start > MAX_MS;
    const method = req.method ?? "GET";
    res.setHeader("Cache-Control", "no-store");
    (0, api_utils_js_1.logRequest)("[cron]", {
        requestId,
        method,
        route: req.url ?? "/api/cron/google/sync-replies"
    });
    if (method !== "POST" && method !== "GET") {
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    const missingEnv = getMissingEnv();
    if (missingEnv.length) {
        console.error("[sync]", requestId, "missing env:", missingEnv);
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: `Missing env: ${missingEnv.join(", ")}` }, 500);
    }
    const { expected, provided } = getCronSecrets(req);
    if (!expected || !provided || provided !== expected) {
        console.error("[sync]", requestId, "invalid cron secret");
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "FORBIDDEN", message: "Unauthorized" }, 403);
    }
    // GET = healthcheck (évite que cron-job.org ou un navigateur te fasse un sync complet)
    if (method === "GET") {
        return res.status(200).json({
            ok: true,
            requestId,
            mode: "healthcheck",
            message: "Use POST to run the sync."
        });
    }
    const jobStats = await processJobQueue();
    const errors = [];
    let processedUsers = 0;
    let processedLocations = 0;
    let processedReviews = 0;
    let repliesUpserted = 0;
    try {
        const { data: connections, error: connectionsError } = await supabaseAdmin
            .from("google_connections")
            .select("user_id, refresh_token");
        if (connectionsError) {
            console.error("[sync]", requestId, "connections fetch failed", connectionsError);
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Failed to load connections" }, 500);
        }
        const refreshTokenByUser = new Map();
        (connections ?? []).forEach((conn) => {
            if (conn.user_id && conn.refresh_token) {
                refreshTokenByUser.set(conn.user_id, conn.refresh_token);
            }
        });
        const cursor = await loadCursor();
        const { data: locations, error: locationsError } = await supabaseAdmin
            .from("google_locations")
            .select("id, user_id, account_resource_name, location_resource_name, location_title")
            .order("id", { ascending: true })
            .limit(1000);
        if (locationsError) {
            console.error("[sync]", requestId, "locations fetch failed", locationsError);
            return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message: "Failed to load locations" }, 500);
        }
        const accessTokenByUser = new Map();
        processedUsers = refreshTokenByUser.size;
        const locationsList = locations ?? [];
        const locationByResource = new Map(locationsList.map((location) => [
            location.location_resource_name,
            location
        ]));
        const recentSince = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
        const { data: recentReviews } = await supabaseAdmin
            .from("google_reviews")
            .select("location_id, update_time, status")
            .or("status.is.null,status.neq.replied")
            .gte("update_time", recentSince)
            .order("update_time", { ascending: false })
            .limit(50);
        const priorityLocations = [];
        const seenPriority = new Set();
        (recentReviews ?? []).forEach((review) => {
            const location = locationByResource.get(review.location_id);
            if (location && !seenPriority.has(location.id)) {
                seenPriority.add(location.id);
                priorityLocations.push(location);
            }
        });
        const processedLocationIds = new Set();
        const processLocation = async (location, allowCursorUpdate) => {
            if (!location.location_resource_name || !location.user_id) {
                return;
            }
            processedLocations += 1;
            processedLocationIds.add(location.id);
            const displayName = location.location_title ?? location.location_resource_name;
            const parent = location.location_resource_name.startsWith("accounts/")
                ? location.location_resource_name
                : `${location.account_resource_name}/${location.location_resource_name}`;
            const refreshToken = refreshTokenByUser.get(location.user_id);
            if (!refreshToken) {
                console.warn("[sync]", requestId, "missing refresh token", {
                    userId: location.user_id
                });
                return;
            }
            let accessToken = accessTokenByUser.get(location.user_id);
            if (!accessToken) {
                try {
                    accessToken = await refreshGoogleAccessToken(refreshToken);
                    accessTokenByUser.set(location.user_id, accessToken);
                }
                catch (error) {
                    console.error("[sync]", requestId, "token refresh failed", error);
                    return;
                }
            }
            try {
                let pageToken = allowCursorUpdate ? cursor.page_token ?? null : null;
                while (!timeUp()) {
                    const page = await listReviewsPage(accessToken, parent, pageToken ?? undefined);
                    for (const review of page.reviews) {
                        if (timeUp()) {
                            break;
                        }
                        processedReviews += 1;
                        const reviewName = review.name ?? null;
                        const reviewIdFromName = reviewName
                            ? reviewName.split("/").pop() ?? null
                            : null;
                        const reviewId = review.reviewId ?? reviewIdFromName ?? null;
                        if (!reviewId) {
                            continue;
                        }
                        const replyComment = review.reviewReply?.comment ?? null;
                        const replyUpdateTime = review.reviewReply?.updateTime ?? null;
                        const nowIso = new Date().toISOString();
                        const reviewUpdateTime = review.updateTime ?? null;
                        const { data: existingReview } = await supabaseAdmin
                            .from("google_reviews")
                            .select("last_synced_at, status")
                            .eq("user_id", location.user_id)
                            .eq("location_id", location.location_resource_name)
                            .eq("review_id", reviewId)
                            .maybeSingle();
                        if (existingReview?.last_synced_at &&
                            reviewUpdateTime &&
                            new Date(reviewUpdateTime).getTime() <=
                                new Date(existingReview.last_synced_at).getTime() &&
                            (!replyComment || existingReview.status === "replied")) {
                            if (processedReviews >= MAX_REVIEWS) {
                                break;
                            }
                            continue;
                        }
                        const rating = mapRating(review.starRating);
                        const row = {
                            user_id: String(location.user_id),
                            location_id: String(location.location_resource_name),
                            location_name: displayName ? String(displayName) : null,
                            review_id: String(reviewId),
                            review_name: reviewName ? String(reviewName) : null,
                            author_name: review.reviewer?.displayName
                                ? String(review.reviewer.displayName)
                                : null,
                            rating: typeof rating === "number" ? rating : null,
                            comment: review.comment ? String(review.comment) : null,
                            create_time: review.createTime ? String(review.createTime) : null,
                            update_time: review.updateTime ? String(review.updateTime) : null,
                            last_synced_at: nowIso,
                            raw: review
                        };
                        if (replyComment) {
                            row.status = "replied";
                            row.reply_text = String(replyComment);
                            row.replied_at = replyUpdateTime ? String(replyUpdateTime) : nowIso;
                        }
                        const { data: upserted, error: upsertError } = await supabaseAdmin
                            .from("google_reviews")
                            .upsert(row, { onConflict: "user_id,location_id,review_id" })
                            .select("id, status")
                            .maybeSingle();
                        if (upsertError || !upserted?.id) {
                            console.error("[sync]", requestId, "google_reviews upsert failed", upsertError);
                            continue;
                        }
                        if (replyComment) {
                            const reviewKey = String(upserted.id);
                            const { data: existingSent } = await supabaseAdmin
                                .from("review_replies")
                                .select("id")
                                .eq("user_id", location.user_id)
                                .eq("source", "google")
                                .eq("review_id", reviewKey)
                                .eq("status", "sent")
                                .maybeSingle();
                            if (existingSent?.id) {
                                await supabaseAdmin
                                    .from("review_replies")
                                    .update({
                                    reply_text: replyComment,
                                    sent_at: replyUpdateTime ?? nowIso
                                })
                                    .eq("id", existingSent.id);
                            }
                            else {
                                await supabaseAdmin.from("review_replies").insert({
                                    user_id: location.user_id,
                                    source: "google",
                                    review_id: reviewKey,
                                    location_id: location.id,
                                    business_name: displayName,
                                    reply_text: replyComment,
                                    status: "sent",
                                    sent_at: replyUpdateTime ?? nowIso
                                });
                            }
                            repliesUpserted += 1;
                        }
                        if (processedReviews >= MAX_REVIEWS) {
                            break;
                        }
                    }
                    if (!page.nextPageToken || processedReviews >= MAX_REVIEWS) {
                        if (allowCursorUpdate) {
                            cursor.location_pk = location.id;
                            cursor.page_token = null;
                            await saveCursor(cursor);
                        }
                        break;
                    }
                    if (allowCursorUpdate) {
                        cursor.location_pk = location.id;
                        cursor.page_token = page.nextPageToken;
                        await saveCursor(cursor);
                    }
                    pageToken = page.nextPageToken;
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                errors.push({
                    locationId: location.location_resource_name,
                    message
                });
                console.error("[sync]", requestId, "location failed", {
                    location: location.location_resource_name,
                    message
                });
                if (allowCursorUpdate) {
                    cursor.location_pk = location.id;
                    cursor.page_token = null;
                    await saveCursor(cursor);
                }
            }
        };
        for (const location of priorityLocations) {
            if (timeUp() || processedReviews >= MAX_REVIEWS) {
                break;
            }
            await processLocation(location, false);
        }
        for (const location of locationsList) {
            if (cursor.location_pk && location.id < cursor.location_pk) {
                continue;
            }
            if (processedLocationIds.has(location.id)) {
                continue;
            }
            if (timeUp() || processedReviews >= MAX_REVIEWS) {
                break;
            }
            await processLocation(location, true);
            if (timeUp()) {
                break;
            }
        }
        cursor.errors_count = errors.length;
        await saveCursor(cursor);
        const aborted = timeUp();
        return res.status(200).json({
            ok: true,
            requestId,
            aborted,
            jobs: jobStats,
            stats: {
                users: processedUsers,
                locations: processedLocations,
                reviewsScanned: processedReviews,
                repliesUpserted,
                errors
            }
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[sync]", requestId, "fatal error", message);
        return (0, api_utils_js_1.sendError)(res, requestId, { code: "INTERNAL", message }, 500);
    }
}
