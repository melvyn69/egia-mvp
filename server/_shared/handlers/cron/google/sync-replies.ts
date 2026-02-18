import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../database.types.js";
import { syncGoogleLocationsForUser } from "../../google/gbp/sync.js";
import { syncGoogleReviewsForUser } from "../../google/gbp/reviews/sync.js";
import {
  getRequestId,
  sendError,
  logRequest
} from "../../../api_utils.js";
import { withRetry } from "../../../utils/withRetry.js";

type GoogleReview = {
  reviewId?: string;
  name?: string;
  comment?: string;
  starRating?: string;
  createTime?: string;
  updateTime?: string;
  reviewer?: {
    displayName?: string;
  };
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
};

type GoogleReviewUpsert =
  Database["public"]["Tables"]["google_reviews"]["Insert"];
type JobQueueRow = Database["public"]["Tables"]["job_queue"]["Row"];

const CURSOR_KEY = "google_sync_replies_cursor_v1";
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const SUPABASE_RETRY_TRIES = 4;
const SUPABASE_RETRY_BASE_MS = 300;
const CRON_SYNC_REPLIES_PATH = "/api/cron/google/sync-replies";

const withSupabaseRetry = async <T>(
  operation: () => PromiseLike<T> | T,
  params: { requestId?: string; label: string }
) =>
  withRetry(() => operation(), {
    tries: SUPABASE_RETRY_TRIES,
    baseMs: SUPABASE_RETRY_BASE_MS,
    requestId: params.requestId,
    method: "POST",
    path: CRON_SYNC_REPLIES_PATH,
    label: params.label
  });

const getEnv = (keys: string[]) => {
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
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!googleClientId) missing.push("GOOGLE_OAUTH_CLIENT_ID|GOOGLE_CLIENT_ID");
  if (!googleClientSecret)
    missing.push("GOOGLE_OAUTH_CLIENT_SECRET|GOOGLE_CLIENT_SECRET");
  if (!cronSecret) missing.push("CRON_SECRET");
  return missing;
};

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

type Cursor = {
  location_pk: string | null;
  page_token: string | null;
  errors_count?: number;
};

const loadCursor = async (requestId?: string): Promise<Cursor> => {
  const { data } = await withSupabaseRetry(
    () =>
      supabaseAdmin
        .from("cron_state")
        .select("value")
        .eq("key", CURSOR_KEY)
        .is("user_id", null)
        .maybeSingle(),
    {
      requestId,
      label: "cron_state.load_cursor"
    }
  );
  return (data?.value as Cursor) ?? { location_pk: null, page_token: null };
};

const saveCursor = async (cursor: Cursor, requestId?: string) => {
  await withSupabaseRetry(
    () =>
      supabaseAdmin.from("cron_state").upsert({
        key: CURSOR_KEY,
        value: cursor,
        user_id: null,
        updated_at: new Date().toISOString()
      }),
    {
      requestId,
      label: "cron_state.save_cursor"
    }
  );
};

const mapRating = (starRating?: string): number | null => {
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

const isAuthFailureReauth = (reason: string, rawMessage: string) => {
  if (reason === "missing_refresh_token" || reason === "token_revoked") {
    return true;
  }
  const normalized = rawMessage.toLowerCase();
  const hasTransientHint =
    normalized.includes("429") ||
    normalized.includes("5xx") ||
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("520") ||
    normalized.includes("cloudflare") ||
    normalized.includes("timeout") ||
    normalized.includes("network");
  if (hasTransientHint) {
    return false;
  }
  return (
    normalized.includes("invalid_grant") ||
    normalized.includes("request had invalid authentication credentials") ||
    normalized.includes("invalid authentication credentials") ||
    normalized.includes("token has been expired or revoked") ||
    normalized.includes("expired or revoked") ||
    normalized.includes("insufficient authentication scopes")
  );
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
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
  return json.access_token as string;
};

const listReviewsPage = async (
  accessToken: string,
  parent: string,
  pageToken?: string
) => {
  const url = new URL(
    `https://mybusiness.googleapis.com/v4/${parent}/reviews`
  );
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
    reviews: (data?.reviews ?? []) as GoogleReview[],
    nextPageToken: data?.nextPageToken ?? null
  };
};

const getCronSecrets = (req: VercelRequest) => {
  const expected = String(cronSecret ?? "").trim();
  const headerSecret =
    (req.headers["x-cron-secret"] as string | undefined) ??
    (req.headers["x-cron-key"] as string | undefined);
  const auth = (req.headers.authorization as string | undefined) ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7)
    : "";
  const provided = String(headerSecret ?? bearer ?? "").trim();
  return { expected, provided };
};

const JOB_RATE_LIMIT_DELAY_MS = 60_000;

const claimJobs = async (limit: number, requestId?: string) => {
  // Keep claim single-shot: retrying a state-mutating claim can over-claim when the
  // first DB transaction committed but the response was lost in transit.
  const { data, error } = await supabaseAdmin.rpc("job_queue_claim", {
    max_jobs: limit
  });
  if (error) {
    console.error("[jobs] claim failed", { requestId, message: error.message });
    return [];
  }
  return (data ?? []) as JobQueueRow[];
};

const updateJob = async (
  jobId: string,
  patch: Partial<Pick<JobQueueRow, "status" | "attempts" | "last_error" | "run_at" | "updated_at">>,
  requestId?: string
) => {
  await withSupabaseRetry(
    () => supabaseAdmin.from("job_queue").update(patch).eq("id", jobId),
    {
      requestId,
      label: "job_queue.update"
    }
  );
};

const processJobQueue = async (requestId?: string) => {
  const maxJobs = Number(process.env.JOB_QUEUE_MAX ?? 50);
  const jobs = await claimJobs(maxJobs, requestId);
  if (jobs.length === 0) {
    return { processed: 0, failed: 0, skipped: 0 };
  }

  const jobIds = jobs.map((job) => job.id);
  const userIds = Array.from(new Set(jobs.map((job) => job.user_id)));
  const { data: runningRows } = await withSupabaseRetry(
    () =>
      supabaseAdmin
        .from("job_queue")
        .select("id, user_id")
        .eq("status", "running")
        .in("user_id", userIds),
    {
      requestId,
      label: "job_queue.load_running"
    }
  );
  const activeUsers = new Set(
    (runningRows ?? [])
      .filter((row) => !jobIds.includes(row.id))
      .map((row) => row.user_id)
  );

  const inBatchUsers = new Set<string>();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const attempts = (job.attempts ?? 0) + 1;
    if (activeUsers.has(job.user_id) || inBatchUsers.has(job.user_id)) {
      skipped += 1;
      await updateJob(
        job.id,
        {
          status: "queued",
          attempts,
          last_error: "rate_limited",
          run_at: new Date(Date.now() + JOB_RATE_LIMIT_DELAY_MS).toISOString(),
          updated_at: new Date().toISOString()
        },
        requestId
      );
      continue;
    }
    inBatchUsers.add(job.user_id);
    try {
      if (job.type === "google_gbp_sync") {
        await syncGoogleLocationsForUser(supabaseAdmin, job.user_id);
        await syncGoogleReviewsForUser(
          supabaseAdmin,
          job.user_id,
          null,
          requestId
        );
        await updateJob(
          job.id,
          {
            status: "done",
            attempts,
            last_error: null,
            updated_at: new Date().toISOString()
          },
          requestId
        );
        processed += 1;
      } else {
        await updateJob(
          job.id,
          {
            status: "failed",
            attempts,
            last_error: `Unknown job type: ${job.type}`,
            updated_at: new Date().toISOString()
          },
          requestId
        );
        failed += 1;
      }
    } catch (error) {
      await updateJob(
        job.id,
        {
          status: "failed",
          attempts,
          last_error: error instanceof Error ? error.message : "Job failed",
          updated_at: new Date().toISOString()
        },
        requestId
      );
      failed += 1;
    }
  }

  return { processed, failed, skipped };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const MAX_MS = Number(process.env.CRON_MAX_MS ?? 24000);
  const MAX_REVIEWS = Number(process.env.CRON_MAX_REVIEWS ?? 80);
  const timeUp = () => Date.now() - start > MAX_MS;

  const method = req.method ?? "GET";
  res.setHeader("Cache-Control", "no-store");
  logRequest("[cron]", {
    requestId,
    method,
    route: req.url ?? "/api/cron/google/sync-replies"
  });
  if (method !== "POST" && method !== "GET") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    console.error("[sync]", requestId, "missing env:", missingEnv);
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: `Missing env: ${missingEnv.join(", ")}` },
      500
    );
  }

  const { expected, provided } = getCronSecrets(req);
  if (!expected || !provided || provided !== expected) {
    console.error("[sync]", requestId, "invalid cron secret");
    return sendError(
      res,
      requestId,
      { code: "FORBIDDEN", message: "Unauthorized" },
      403
    );
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

  const jobStats = await processJobQueue(requestId);

  const errors: Array<{ locationId: string; message: string }> = [];
  let processedUsers = 0;
  let processedLocations = 0;
  let processedReviews = 0;
  let repliesUpserted = 0;
  const isProd = process.env.NODE_ENV === "production";

  try {
    const { data: connections, error: connectionsError } = await withSupabaseRetry(
      () => supabaseAdmin.from("google_connections").select("user_id, refresh_token"),
      {
        requestId,
        label: "google_connections.load_for_cron"
      }
    );

    if (connectionsError) {
      console.error("[sync]", requestId, "connections fetch failed", connectionsError);
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load connections" },
        500
      );
    }

    const refreshTokenByUser = new Map<string, string>();
    (connections ?? []).forEach((conn) => {
      if (conn.user_id && conn.refresh_token) {
        refreshTokenByUser.set(conn.user_id, conn.refresh_token);
      }
    });

    for (const userId of refreshTokenByUser.keys()) {
      try {
        const result = await syncGoogleReviewsForUser(
          supabaseAdmin,
          userId,
          null,
          requestId
        );
        if (!isProd) {
          console.log("[sync] reviews synced", {
            requestId,
            userId,
            locations: result.locationsCount,
            reviews: result.reviewsCount
          });
        } else {
          console.log("[sync] reviews synced", { userId });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.startsWith("reauth_required")) {
          const reason =
            message.includes("missing_refresh_token")
              ? "missing_refresh_token"
              : message.includes("token_revoked")
                ? "token_revoked"
                : "unknown";
          if (!isAuthFailureReauth(reason, message)) {
            console.warn("[sync] reauth marker ignored (non-auth)", {
              requestId,
              userId,
              message
            });
            continue;
          }
          await withSupabaseRetry(
            () =>
              supabaseAdmin.from("cron_state").upsert({
                key: "google_reviews_last_error",
                user_id: userId,
                value: {
                  at: new Date().toISOString(),
                  code: "reauth_required",
                  reason,
                  message: "reconnexion_google_requise",
                  location_pk: null
                },
                updated_at: new Date().toISOString()
              }),
            {
              requestId,
              label: "cron_state.upsert_last_error"
            }
          );
          console.warn("[sync] reviews reauth_required", {
            requestId,
            userId,
            reason
          });
          continue;
        }
        console.warn("[sync] reviews sync failed", { userId, message });
      }
    }

    const cursor = await loadCursor(requestId);
    const { data: locations, error: locationsError } = await withSupabaseRetry(
      () =>
        supabaseAdmin
          .from("google_locations")
          .select(
            "id, user_id, account_resource_name, location_resource_name, location_title"
          )
          .order("id", { ascending: true })
          .limit(1000),
      {
        requestId,
        label: "google_locations.load_for_cron"
      }
    );

    if (locationsError) {
      console.error("[sync]", requestId, "locations fetch failed", locationsError);
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load locations" },
        500
      );
    }

    const accessTokenByUser = new Map<string, string>();
    processedUsers = refreshTokenByUser.size;

    const locationsList = locations ?? [];
    const locationByResource = new Map(
      locationsList.map((location) => [
        location.location_resource_name,
        location
      ])
    );

    const recentSince = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    const { data: recentReviews } = await withSupabaseRetry(
      () =>
        supabaseAdmin
          .from("google_reviews")
          .select("location_id, update_time, status")
          .or("status.is.null,status.neq.replied")
          .gte("update_time", recentSince)
          .order("update_time", { ascending: false })
          .limit(50),
      {
        requestId,
        label: "google_reviews.load_recent_for_cron"
      }
    );

    const priorityLocations: typeof locationsList = [];
    const seenPriority = new Set<string>();
    (recentReviews ?? []).forEach((review) => {
      const location = locationByResource.get(review.location_id);
      if (location && !seenPriority.has(location.id)) {
        seenPriority.add(location.id);
        priorityLocations.push(location);
      }
    });

    const processedLocationIds = new Set<string>();

    const processLocation = async (
      location: (typeof locationsList)[number],
      allowCursorUpdate: boolean
    ) => {
      if (!location.location_resource_name || !location.user_id) {
        return;
      }
      processedLocations += 1;
      processedLocationIds.add(location.id);
      const displayName =
        location.location_title ?? location.location_resource_name;
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
        } catch (error) {
          console.error("[sync]", requestId, "token refresh failed", error);
          return;
        }
      }

      try {
        let pageToken = allowCursorUpdate ? cursor.page_token ?? null : null;
        while (!timeUp()) {
          const page = await listReviewsPage(
            accessToken,
            parent,
            pageToken ?? undefined
          );
          for (const review of page.reviews) {
            if (timeUp()) {
              break;
            }
            processedReviews += 1;
            const reviewName =
              typeof review.name === "string" && review.name.trim().length > 0
                ? review.name.trim()
                : null;
            const rawReviewId =
              typeof review.reviewId === "string" && review.reviewId.trim().length > 0
                ? review.reviewId.trim()
                : null;
            const normalizedReviewName = reviewName
              ? reviewName
              : rawReviewId
                ? rawReviewId.includes("/reviews/")
                  ? rawReviewId
                  : `${location.location_resource_name}/reviews/${rawReviewId}`
                : null;
            const reviewId =
              (normalizedReviewName
                ? normalizedReviewName.split("/").pop() ?? null
                : null) ??
              (rawReviewId && !rawReviewId.includes("/reviews/") ? rawReviewId : null);
            if (!reviewId || !normalizedReviewName) {
              continue;
            }

            const replyComment = review.reviewReply?.comment ?? null;
            const replyUpdateTime = review.reviewReply?.updateTime ?? null;
            const nowIso = new Date().toISOString();
            const reviewUpdateTime = review.updateTime ?? null;

            const { data: existingReview } = await withSupabaseRetry(
              () =>
                supabaseAdmin
                  .from("google_reviews")
                  .select("last_synced_at, status")
                  .eq("user_id", location.user_id)
                  .eq("location_id", location.location_resource_name)
                  .eq("review_name", normalizedReviewName)
                  .maybeSingle(),
              {
                requestId,
                label: "google_reviews.load_existing_for_reply"
              }
            );

            if (
              existingReview?.last_synced_at &&
              reviewUpdateTime &&
              new Date(reviewUpdateTime).getTime() <=
                new Date(existingReview.last_synced_at).getTime() &&
              (!replyComment || existingReview.status === "replied")
            ) {
              if (processedReviews >= MAX_REVIEWS) {
                break;
              }
              continue;
            }

            const rating = mapRating(review.starRating);
            const row: GoogleReviewUpsert = {
              user_id: String(location.user_id),
              location_id: String(location.location_resource_name),
              location_name: displayName ? String(displayName) : null,
              review_id: String(reviewId),
              review_name: String(normalizedReviewName),
              author_name: review.reviewer?.displayName
                ? String(review.reviewer.displayName)
                : null,
              rating: typeof rating === "number" ? rating : null,
              comment: review.comment ? String(review.comment) : null,
              create_time: review.createTime ? String(review.createTime) : null,
              update_time: review.updateTime ? String(review.updateTime) : null,
              last_synced_at: nowIso,
              raw: review as unknown as Json
            };

            if (replyComment) {
              row.status = "replied";
              row.reply_text = String(replyComment);
              row.replied_at = replyUpdateTime ? String(replyUpdateTime) : nowIso;
            }

            const { data: upserted, error: upsertError } = await withSupabaseRetry(
              () =>
                supabaseAdmin
                  .from("google_reviews")
                  .upsert(row, { onConflict: "user_id,review_name" })
                  .select("id, status")
                  .maybeSingle(),
              {
                requestId,
                label: "google_reviews.upsert"
              }
            );

            if (upsertError || !upserted?.id) {
              console.error(
                "[sync]",
                requestId,
                "google_reviews upsert failed",
                upsertError
              );
              continue;
            }
            if (replyComment) {
              const reviewKey = String(upserted.id);
              const { data: existingSent } = await withSupabaseRetry(
                () =>
                  supabaseAdmin
                    .from("review_replies")
                    .select("id")
                    .eq("user_id", location.user_id)
                    .eq("source", "google")
                    .eq("review_id", reviewKey)
                    .eq("status", "sent")
                    .maybeSingle(),
                {
                  requestId,
                  label: "review_replies.load_existing_sent"
                }
              );

              if (existingSent?.id) {
                await withSupabaseRetry(
                  () =>
                    supabaseAdmin
                      .from("review_replies")
                      .update({
                        reply_text: replyComment,
                        sent_at: replyUpdateTime ?? nowIso
                      })
                      .eq("id", existingSent.id),
                  {
                    requestId,
                    label: "review_replies.update_sent"
                  }
                );
              } else {
                // Keep single-shot insert: no retry to avoid duplicating a non-idempotent write.
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
              await saveCursor(cursor, requestId);
            }
            break;
          }

          if (allowCursorUpdate) {
            cursor.location_pk = location.id;
            cursor.page_token = page.nextPageToken;
            await saveCursor(cursor, requestId);
          }
          pageToken = page.nextPageToken;
        }
      } catch (error) {
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
          await saveCursor(cursor, requestId);
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
    await saveCursor(cursor, requestId);

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync]", requestId, "fatal error", message);
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message },
      500
    );
  }
}
