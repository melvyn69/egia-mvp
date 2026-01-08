import type { IncomingMessage, ServerResponse } from "http";
import {
  createSupabaseAdmin,
  getRequiredEnv,
  getUserFromRequest
} from "../../../_shared/google/_utils";

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
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = await response.json().catch((err) => {
      console.error("google reviews response parse failed:", err);
      return null;
    });
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
      console.error(
        "google reviews fetch error:",
        response.status,
        data?.error?.message ?? data
      );
      throw new Error(data?.error?.message ?? "Failed to list reviews.");
    }
    reviews.push(...((data?.reviews ?? []) as GoogleReview[]));
    pageToken = data?.nextPageToken;
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

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );

    if (!userId) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Unauthorized." }));
      return;
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .select("access_token,refresh_token,expires_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    if (connectionError || !connection) {
      console.error("google connection missing:", connectionError);
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Google not connected." }));
      return;
    }

    let accessToken = connection.access_token ?? "";
    const expiresAt = connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : 0;
    const shouldRefresh = !accessToken || expiresAt - Date.now() < 60_000;

    if (shouldRefresh) {
      if (!connection.refresh_token) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "reauth_required" }));
        return;
      }
      let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>;
      try {
        refreshed = await refreshAccessToken(connection.refresh_token);
      } catch (error) {
        const refreshError = error as Error & { code?: string };
        const reauthRequired =
          refreshError.code === "invalid_grant" ||
          /expired or revoked/i.test(refreshError.message);
        if (reauthRequired) {
          await supabaseAdmin
            .from("google_connections")
            .delete()
            .eq("user_id", userId)
            .eq("provider", "google");
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "reauth_required" }));
          return;
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

    const requestUrl = new URL(req.url ?? "", "http://localhost");
    let locationId = requestUrl.searchParams.get("location_id");
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

    let locationQuery = supabaseAdmin
      .from("google_locations")
      .select("account_resource_name, location_resource_name, location_title")
      .eq("user_id", userId);

    if (locationId) {
      locationQuery = locationQuery.eq("location_resource_name", locationId);
    }

    const { data: locations, error: locationsError } = await locationQuery;

    if (locationsError) {
      console.error("google locations lookup failed:", locationsError);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Failed to load locations." }));
      return;
    }

    const locationList = (locations ?? []).filter(
      (location) => location.location_resource_name && location.account_resource_name
    );

    let reviewsUpsertedCount = 0;
    let locationsFailed = 0;
    for (const location of locationList) {
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
      } catch (error) {
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
            last_error: (error as Error)?.message ?? "Failed to sync reviews."
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
          return {
            user_id: userId,
            location_id: location.location_resource_name,
            location_name: displayName,
            review_name: reviewName,
            review_id: reviewId,
            author_name: review.reviewer?.displayName ?? null,
            rating: mapRating(review.starRating),
            comment: review.comment ?? null,
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

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        locationsCount: locationList.length,
        reviewsCount: reviewsUpsertedCount,
        locationsFailed
      })
    );
  } catch (error) {
    console.error("google reviews sync error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Sync failed." }));
  }
};

export default handler;
