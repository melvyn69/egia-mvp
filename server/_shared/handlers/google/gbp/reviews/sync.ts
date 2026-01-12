import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createSupabaseAdmin,
  getRequiredEnv,
  getUserFromRequest
} from "../../../../../_shared_dist/google/_utils.js";
import {
  getRequestId,
  sendError,
  parseQuery,
  getParam,
  logRequest
} from "../../../../../_shared_dist/api_utils.js";

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

const getErrorMessage = (err: unknown): string =>
  err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : JSON.stringify(err);

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

const refreshAccessToken = async (refreshToken: string) => {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || tokenData.error) {
    const refreshError = new Error(
      tokenData.error_description ?? "Token refresh failed."
    ) as Error & { code?: string };
    refreshError.code = tokenData.error;
    throw refreshError;
  }

  return tokenData as {
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
};

const listReviewsForLocation = async (
  accessToken: string,
  parent: string,
  accountResourceName: string,
  locationResourceName: string
) => {
  const reviews: GoogleReview[] = [];
  let pageToken: string | undefined;
  const maxRetries = 3;

  do {
    const baseUrl =
      `https://mybusiness.googleapis.com/v4/${parent}/reviews` +
      `?pageSize=50&orderBy=updateTime desc`;
    const url = pageToken
      ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;
    console.log("google reviews request:", {
      account_resource_name: accountResourceName,
      location_resource_name: locationResourceName,
      url
    });
    let response: Response | null = null;
    let data: Record<string, unknown> | null = null;
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
    })) as Record<string, unknown> | null;
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
      const apiError = getErrorMessage(
        data && typeof data === "object"
          ? (data as Record<string, unknown>).error
          : data
      );
      console.error(
        "google reviews fetch error:",
        response.status,
        apiError
      );
      throw new Error(apiError || "Failed to list reviews.");
    }
    reviews.push(...((data?.reviews ?? []) as GoogleReview[]));
    const nextToken =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).nextPageToken
        : null;
    pageToken =
      typeof nextToken === "string" && nextToken.length > 0
        ? nextToken
        : undefined;
  } while (pageToken);

  return { reviews, notFound: false };
};

const upsertImportStatus = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  locationId: string,
  value: {
    status: "idle" | "running" | "done" | "error";
    last_run_at?: string;
    aborted?: boolean;
    cursor?: string | null;
    pages_exhausted?: boolean;
    stats?: { scanned?: number; upserted?: number };
    errors_count?: number;
    last_error?: string | null;
  }
) => {
  await supabaseAdmin.from("cron_state").upsert({
    key: `import_status_v1:${userId}:${locationId}`,
    value,
    updated_at: new Date().toISOString()
  });
};

export const syncGoogleReviewsForUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  locationId: string | null
) => {
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
    let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      refreshed = await refreshAccessToken(connection.refresh_token);
    } catch (error: unknown) {
      const refreshError = error as Error & { code?: string };
      const refreshMessage = getErrorMessage(error);
      const reauthRequired =
        refreshError.code === "invalid_grant" ||
        /expired or revoked/i.test(refreshMessage);
      if (reauthRequired) {
        throw new Error("reauth_required");
      }
      throw error;
    }
    accessToken = refreshed.access_token;
    const newExpiresAt =
      refreshed.expires_in && refreshed.expires_in > 0
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

  const locationList = (locations ?? []).filter(
    (location) => location.location_resource_name && location.account_resource_name
  );

  let reviewsUpsertedCount = 0;
  let locationsFailed = 0;
  for (const location of locationList) {
    const locationStart = Date.now();
    const runStartedAt = new Date().toISOString();
    await upsertImportStatus(
      supabaseAdmin,
      userId,
      location.location_resource_name,
      {
        status: "running",
        last_run_at: runStartedAt,
        aborted: false,
        cursor: null,
        pages_exhausted: false,
        stats: { scanned: 0, upserted: 0 },
        errors_count: 0
      }
    );
    const displayName =
      (location as { location_title?: string }).location_title ??
      (location as { title?: string }).title ??
      (location as { name?: string }).name ??
      location.location_resource_name;
    const parent = location.location_resource_name.startsWith("accounts/")
      ? location.location_resource_name
      : `${location.account_resource_name}/${location.location_resource_name}`;
    let reviews: GoogleReview[] = [];
    let notFound = false;
    try {
      const result = await listReviewsForLocation(
        accessToken,
        parent,
        location.account_resource_name,
        location.location_resource_name
      );
      reviews = result.reviews;
      notFound = result.notFound;
    } catch (error: unknown) {
      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "error",
          last_run_at: runStartedAt,
          aborted: false,
          cursor: null,
          pages_exhausted: false,
          stats: { scanned: 0, upserted: 0 },
          errors_count: 1,
          last_error: getErrorMessage(error)
        }
      );
      throw error;
    }
    if (notFound) {
      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "error",
          last_run_at: runStartedAt,
          aborted: false,
          cursor: null,
          pages_exhausted: false,
          stats: { scanned: 0, upserted: 0 },
          errors_count: 1,
          last_error: "Location not found on Google."
        }
      );
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
      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "done",
          last_run_at: runStartedAt,
          aborted: false,
          cursor: null,
          pages_exhausted: true,
          stats: { scanned: 0, upserted: 0 },
          errors_count: 0
        }
      );
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
        const rawReview = review as {
          comment?: string;
          comment_original?: string;
          originalText?: { text?: string };
        };
        const comment =
          (typeof rawReview.comment_original === "string"
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
      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "error",
          last_run_at: nowIso,
          aborted: false,
          cursor: null,
          pages_exhausted: false,
          stats: { scanned: reviews.length, upserted: 0 },
          errors_count: 1,
          last_error: upsertError.message ?? "Upsert failed."
        }
      );
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
    await upsertImportStatus(
      supabaseAdmin,
      userId,
      location.location_resource_name,
      {
        status: "done",
        last_run_at: nowIso,
        aborted: false,
        cursor: null,
        pages_exhausted: true,
        stats: { scanned: reviews.length, upserted: rows.length },
        errors_count: 0
      }
    );
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

const handler = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  logRequest("[gbp/reviews-sync]", {
    requestId,
    method: req.method ?? "GET",
    route: req.url ?? "/api/google/gbp/reviews/sync"
  });
  if (req.method !== "POST") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );

    if (!userId) {
      return sendError(
        res,
        requestId,
        { code: "UNAUTHORIZED", message: "Unauthorized" },
        401
      );
    }

    const { params } = parseQuery(req);
    let locationId = getParam(params, "location_id");
    if (!locationId) {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      if (body) {
        try {
          const parsed = JSON.parse(body) as { location_id?: string };
          locationId = parsed.location_id ?? null;
        } catch (err) {
          console.error("google reviews request body parse failed:", err);
        }
      }
    }

    const result = await syncGoogleReviewsForUser(
      supabaseAdmin,
      userId,
      locationId
    );

    return res.status(200).json({
      ok: true,
      requestId,
      locationsCount: result.locationsCount,
      reviewsCount: result.reviewsCount,
      locationsFailed: result.locationsFailed
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message === "reauth_required") {
      return sendError(
        res,
        requestId,
        { code: "UNAUTHORIZED", message: "reauth_required" },
        401
      );
    }
    if (message === "google_not_connected") {
      return sendError(
        res,
        requestId,
        { code: "NOT_FOUND", message: "Google not connected" },
        404
      );
    }
    if (message === "locations_load_failed") {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load locations" },
        500
      );
    }
    console.error("google reviews sync error:", error);
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Sync failed" },
      500
    );
  }
};

export default handler;
