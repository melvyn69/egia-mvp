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

type AlertSettings = {
  tolerance: "strict" | "standard" | "relaxed";
  noReplyHours: number;
  ratingDropThreshold: number;
  negativeSpikeCount: number;
  negativeSpikeWindowHours: number;
  longReviewChars: number;
};

type AlertInsert = {
  user_id: string;
  establishment_id: string;
  rule_code: string;
  severity: "low" | "medium" | "high";
  review_id: string;
  payload: Record<string, unknown>;
};

type ReviewRowForAlert = {
  review_id: string;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  reply_text: string | null;
  replied_at: string | null;
  owner_reply: string | null;
  author_name: string | null;
};

type ExistingReviewRow = {
  review_id: string | null;
  rating: number | null;
  comment: string | null;
  update_time: string | null;
  reply_text: string | null;
  replied_at: string | null;
};

type LocationAlertMetrics = {
  avg7d: number | null;
  avg30d: number | null;
  negativeCount48h: number;
};

type PendingAlertRow = {
  id: string;
  user_id: string;
  establishment_id: string;
  rule_code: string;
  severity: "low" | "medium" | "high";
  review_id: string;
  payload: Record<string, unknown> | null;
  triggered_at: string | null;
  last_notified_at: string | null;
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

const defaultAlertSettings = (): AlertSettings => ({
  tolerance: "standard",
  noReplyHours: 24,
  ratingDropThreshold: 0.2,
  negativeSpikeCount: 4,
  negativeSpikeWindowHours: 48,
  longReviewChars: 250
});

const normalizeTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const pickReviewTime = (review: ReviewRowForAlert): number | null =>
  normalizeTimestamp(review.create_time) ?? normalizeTimestamp(review.update_time);

const buildSnippet = (comment: string | null) => {
  if (!comment) return null;
  const trimmed = comment.trim();
  if (!trimmed) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
};

const computeLocationMetrics = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  locationResourceName: string,
  now: Date
): Promise<LocationAlertMetrics> => {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since30Iso = since30d.toISOString();
  const { data } = await supabaseAdmin
    .from("google_reviews")
    .select("rating, create_time")
    .eq("user_id", userId)
    .eq("location_id", locationResourceName)
    .gte("create_time", since30Iso);

  let sum7d = 0;
  let count7d = 0;
  let sum30d = 0;
  let count30d = 0;
  let negativeCount48h = 0;
  const since7dMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const since48hMs = now.getTime() - 48 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    const rating =
      row && typeof row === "object" && "rating" in row
        ? (row as { rating: number | null }).rating
        : null;
    const createTime =
      row && typeof row === "object" && "create_time" in row
        ? (row as { create_time: string | null }).create_time
        : null;
    if (rating === null || typeof rating !== "number") continue;
    const ts = normalizeTimestamp(createTime);
    if (!ts) continue;
    if (ts >= since30d.getTime()) {
      sum30d += rating;
      count30d += 1;
    }
    if (ts >= since7dMs) {
      sum7d += rating;
      count7d += 1;
    }
    if (ts >= since48hMs && rating <= 2) {
      negativeCount48h += 1;
    }
  }

  return {
    avg7d: count7d > 0 ? sum7d / count7d : null,
    avg30d: count30d > 0 ? sum30d / count30d : null,
    negativeCount48h
  };
};

const sendResendEmail = async (params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${text.slice(0, 200)}`);
  }
};

const buildAlertEmailHtml = (params: {
  title: string;
  summary: string;
  ctaUrl: string;
}) => `
  <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7fb;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e9ebf3;">
      <div style="font-size:12px;letter-spacing:.08em;color:#6b7280;">EGIA</div>
      <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#111827;">
        ${params.title}
      </h1>
      <p style="margin:16px 0 0 0;color:#111827;font-size:14px;line-height:1.6;">
        ${params.summary}
      </p>
      <a href="${params.ctaUrl}" style="display:inline-block;margin-top:18px;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;">
        Repondre maintenant
      </a>
      <p style="margin:18px 0 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
        Cet email est envoye automatiquement lorsqu'une alerte critique est detectee.
      </p>
    </div>
  </div>
`;

const buildAlertSummary = (alert: PendingAlertRow) => {
  const payload = alert.payload ?? {};
  const rating =
    typeof payload.rating === "number" ? `${payload.rating}★` : null;
  const snippet =
    typeof payload.snippet === "string" ? payload.snippet : null;
  const hours =
    typeof payload.hours_since === "number"
      ? `${payload.hours_since}h sans reponse`
      : null;
  const drop =
    typeof payload.drop === "number" ? `baisse de ${payload.drop}` : null;
  const spike =
    typeof payload.negative_count_48h === "number"
      ? `${payload.negative_count_48h} avis negatifs recents`
      : null;

  const parts = [rating, hours, drop, spike].filter(Boolean);
  if (snippet) {
    parts.push(`"${snippet}"`);
  }
  return parts.length > 0
    ? parts.join(" · ")
    : "Un signal prioritaire requiert votre attention.";
};

const sendPendingAlerts = async (params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  establishmentId: string;
}) => {
  const resendKey = process.env.RESEND_API_KEY ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? "";
  if (!resendKey || !emailFrom) {
    console.error("[alerts] missing email configuration");
    return;
  }

  const { data: userRow, error: userError } = await params.supabaseAdmin
    .from("users")
    .select("email")
    .eq("id", params.userId)
    .maybeSingle();
  if (userError) {
    console.error("[alerts] failed to load user email", userError);
    return;
  }
  const recipient =
    userRow && typeof userRow === "object" && "email" in userRow
      ? (userRow as { email?: string | null }).email
      : null;
  if (!recipient) {
    console.warn("[alerts] missing recipient email", {
      userId: params.userId
    });
    return;
  }

  const { data: alerts, error: alertsError } = await params.supabaseAdmin
    .from("alerts")
    .select(
      "id, user_id, establishment_id, rule_code, severity, review_id, payload, triggered_at, last_notified_at"
    )
    .eq("user_id", params.userId)
    .eq("establishment_id", params.establishmentId)
    .is("resolved_at", null)
    .is("last_notified_at", null)
    .order("triggered_at", { ascending: true })
    .limit(25);
  if (alertsError) {
    console.error("[alerts] load pending failed", alertsError);
    return;
  }

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
  const ctaUrl = appUrl ? `${appUrl}/inbox` : "";
  const nowIso = new Date().toISOString();

  for (const alert of alerts ?? []) {
    const summary = buildAlertSummary(alert as PendingAlertRow);
    const title = "Alerte intelligente EGIA";
    try {
      await sendResendEmail({
        apiKey: resendKey,
        from: emailFrom,
        to: recipient,
        subject: "EGIA — Alerte intelligente",
        html: buildAlertEmailHtml({ title, summary, ctaUrl })
      });
      await params.supabaseAdmin
        .from("alerts")
        .update({ last_notified_at: nowIso })
        .eq("id", (alert as PendingAlertRow).id)
        .is("last_notified_at", null);
    } catch (error) {
      console.error("[alerts] send failed", {
        alertId: (alert as PendingAlertRow).id,
        err: String(error)
      });
    }
  }
};

const hasReviewChanged = (
  existing: ExistingReviewRow | undefined,
  next: ReviewRowForAlert
) => {
  if (!existing) return true;
  return (
    existing.rating !== next.rating ||
    existing.comment !== next.comment ||
    existing.update_time !== next.update_time ||
    existing.reply_text !== next.reply_text ||
    existing.replied_at !== next.replied_at
  );
};

const evaluateRules = (params: {
  review: ReviewRowForAlert;
  establishmentId: string;
  userId: string;
  settings: AlertSettings;
  metrics: LocationAlertMetrics;
  now: Date;
}): AlertInsert[] => {
  const { review, establishmentId, userId, settings, metrics, now } = params;
  const alerts: AlertInsert[] = [];
  const rating = review.rating;
  const reviewId = review.review_id;
  const reviewTime = pickReviewTime(review);
  const hasReply =
    Boolean(review.reply_text && review.reply_text.trim()) ||
    Boolean(review.replied_at) ||
    Boolean(review.owner_reply && review.owner_reply.trim());

  if (rating !== null && rating <= 2 && !hasReply && reviewTime) {
    const hoursSince = (now.getTime() - reviewTime) / (1000 * 60 * 60);
    if (hoursSince >= settings.noReplyHours) {
      alerts.push({
        user_id: userId,
        establishment_id: establishmentId,
        rule_code: "NEGATIVE_NO_REPLY",
        severity: settings.tolerance === "strict" ? "high" : "medium",
        review_id: reviewId,
        payload: {
          rating,
          author: review.author_name ?? null,
          snippet: buildSnippet(review.comment),
          hours_since: Math.round(hoursSince),
          threshold_hours: settings.noReplyHours
        }
      });
    }
  }

  if (
    metrics.avg7d !== null &&
    metrics.avg30d !== null &&
    metrics.avg30d - metrics.avg7d > settings.ratingDropThreshold
  ) {
    const drop = metrics.avg30d - metrics.avg7d;
    alerts.push({
      user_id: userId,
      establishment_id: establishmentId,
      rule_code: "RATING_DROP",
      severity: drop >= 0.5 ? "high" : "medium",
      review_id: reviewId,
      payload: {
        avg_7d: Number(metrics.avg7d.toFixed(2)),
        avg_30d: Number(metrics.avg30d.toFixed(2)),
        drop: Number(drop.toFixed(2)),
        threshold: settings.ratingDropThreshold
      }
    });
  }

  if (metrics.negativeCount48h >= settings.negativeSpikeCount) {
    alerts.push({
      user_id: userId,
      establishment_id: establishmentId,
      rule_code: "NEGATIVE_SPIKE",
      severity:
        metrics.negativeCount48h >= settings.negativeSpikeCount + 2
          ? "high"
          : "medium",
      review_id: reviewId,
      payload: {
        negative_count_48h: metrics.negativeCount48h,
        threshold: settings.negativeSpikeCount
      }
    });
  }

  if (
    rating !== null &&
    rating <= 3 &&
    typeof review.comment === "string" &&
    review.comment.trim().length >= settings.longReviewChars
  ) {
    alerts.push({
      user_id: userId,
      establishment_id: establishmentId,
      rule_code: "LONG_NEGATIVE",
      severity: rating <= 2 ? "high" : "medium",
      review_id: reviewId,
      payload: {
        rating,
        author: review.author_name ?? null,
        snippet: buildSnippet(review.comment),
        length: review.comment.trim().length,
        min_length: settings.longReviewChars
      }
    });
  }

  return alerts;
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
    .select("id, account_resource_name, location_resource_name, location_title")
    .eq("user_id", userId);

  if (locationId) {
    locationQuery = locationQuery.eq("location_resource_name", locationId);
  }

  const { data: locations, error: locationsError } = await locationQuery;

  if (locationsError) {
    throw new Error("locations_load_failed");
  }

  const locationList = (locations ?? []).filter(
    (location) =>
      location.location_resource_name &&
      location.account_resource_name &&
      location.id
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
        } as ReviewRowForAlert & { [key: string]: unknown };
      })
      .filter(Boolean);

    const reviewIds = rows
      .map((row) => row.review_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const existingByReviewId = new Map<string, ExistingReviewRow>();
    if (reviewIds.length > 0) {
      const { data: existingRows } = await supabaseAdmin
        .from("google_reviews")
        .select("review_id, rating, comment, update_time, reply_text, replied_at")
        .eq("user_id", userId)
        .eq("location_id", location.location_resource_name)
        .in("review_id", reviewIds);
      for (const row of existingRows ?? []) {
        if (row && typeof row === "object" && "review_id" in row) {
          const key = (row as ExistingReviewRow).review_id;
          if (key) {
            existingByReviewId.set(key, row as ExistingReviewRow);
          }
        }
      }
    }

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

    const changedReviews = (rows as ReviewRowForAlert[]).filter((row) =>
      hasReviewChanged(existingByReviewId.get(row.review_id), row)
    );
    if (changedReviews.length > 0) {
      const now = new Date();
      const settings = defaultAlertSettings();
      const metrics = await computeLocationMetrics(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        now
      );
      const alertsToInsert = changedReviews.flatMap((review) =>
        evaluateRules({
          review,
          establishmentId: location.id,
          userId,
          settings,
          metrics,
          now
        })
      );
      if (alertsToInsert.length > 0) {
        const { error: alertError } = await supabaseAdmin
          .from("alerts")
          .insert(alertsToInsert, {
            onConflict: "rule_code,review_id",
            ignoreDuplicates: true
          });
        if (alertError) {
          console.error("[alerts] insert failed", alertError);
        }
      }
    }

    await sendPendingAlerts({
      supabaseAdmin,
      userId,
      establishmentId: location.id
    });

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
