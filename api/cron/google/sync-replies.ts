import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../_shared/database.types";

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

const CURSOR_KEY = "google_sync_replies_cursor_v1";
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

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

const loadCursor = async (): Promise<Cursor> => {
  const { data } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  return (data?.value as Cursor) ?? { location_pk: null, page_token: null };
};

const saveCursor = async (cursor: Cursor) => {
  await supabaseAdmin
    .from("cron_state")
    .upsert({
      key: CURSOR_KEY,
      value: cursor,
      updated_at: new Date().toISOString()
    });
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

const getAuthSecret = (req: VercelRequest) => {
  const secretParam = req.query?.secret;
  if (Array.isArray(secretParam)) {
    return secretParam[0] ?? "";
  }
  return secretParam ?? "";
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    req.headers["x-request-id"]?.toString() ?? `req_${crypto.randomUUID()}`;
  const start = Date.now();
  const MAX_MS = Number(process.env.CRON_MAX_MS ?? 24000);
  const MAX_REVIEWS = Number(process.env.CRON_MAX_REVIEWS ?? 80);
  const timeUp = () => Date.now() - start > MAX_MS;

  const method = req.method ?? "GET";
  res.setHeader("Cache-Control", "no-store");
  console.log("[cron]", requestId, method, req.url ?? "/api/cron/google/sync-replies");
  if (method !== "POST" && method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    console.error("[sync]", requestId, "missing env:", missingEnv);
    return res
      .status(500)
      .json({ error: `Missing env: ${missingEnv.join(", ")}` });
  }

  const providedSecret = getAuthSecret(req);
  if (!providedSecret || providedSecret !== cronSecret) {
    console.error("[sync]", requestId, "invalid cron secret");
    return res.status(403).json({ error: "Unauthorized" });
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

  const errors: Array<{ locationId: string; message: string }> = [];
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
      return res.status(500).json({ error: "Failed to load connections" });
    }

    const refreshTokenByUser = new Map<string, string>();
    (connections ?? []).forEach((conn) => {
      if (conn.user_id && conn.refresh_token) {
        refreshTokenByUser.set(conn.user_id, conn.refresh_token);
      }
    });

    const cursor = await loadCursor();
    const { data: locations, error: locationsError } = await supabaseAdmin
      .from("google_locations")
      .select(
        "id, user_id, account_resource_name, location_resource_name, location_title"
      )
      .order("id", { ascending: true })
      .limit(1000);

    if (locationsError) {
      console.error("[sync]", requestId, "locations fetch failed", locationsError);
      return res.status(500).json({ error: "Failed to load locations" });
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
    const { data: recentReviews } = await supabaseAdmin
      .from("google_reviews")
      .select("location_id, update_time, status")
      .or("status.is.null,status.neq.replied")
      .gte("update_time", recentSince)
      .order("update_time", { ascending: false })
      .limit(50);

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

            const row: Record<string, unknown> = {
              user_id: location.user_id,
              location_id: location.location_resource_name,
              location_name: displayName,
              review_id: reviewId,
              review_name: reviewName,
              author_name: review.reviewer?.displayName ?? null,
              rating: mapRating(review.starRating),
              comment: review.comment ?? null,
              create_time: review.createTime ?? null,
              update_time: review.updateTime ?? null,
              last_synced_at: nowIso
            };

            if (replyComment) {
              row.status = "replied";
              row.reply_text = replyComment;
              row.replied_at = replyUpdateTime ?? nowIso;
            }

            const { data: upserted, error: upsertError } = await supabaseAdmin
              .from("google_reviews")
              .upsert(row, { onConflict: "user_id,location_id,review_id" })
              .select("id, status")
              .maybeSingle();

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
              } else {
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
    return res.status(500).json({ error: message });
  }
}
