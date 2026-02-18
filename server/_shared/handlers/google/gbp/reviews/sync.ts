import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import {
  createSupabaseAdmin,
  getRequiredEnv
} from "../../../../google/_utils";
import { requireUser } from "../../../../_auth";
import {
  getRequestId,
  sendError,
  parseQuery,
  getParam,
  logRequest
} from "../../../../api_utils";
import { withRetry } from "../../../../utils/withRetry";

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
  review_name: string;
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
  review_name: string;
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

type SyncRunStatus = "running" | "done" | "error";

type AuthStatusReason =
  | "ok"
  | "token_revoked"
  | "missing_refresh_token"
  | "expired"
  | "unknown"
  | "no_connection";

type AuthStatusSummary = {
  status: "connected" | "reauth_required" | "disconnected" | "unknown";
  reason: AuthStatusReason;
  last_checked_at: string;
  message: string | null;
};

type LocationSyncResult = {
  location_id: string;
  location_title: string | null;
  status: "ok" | "warning" | "error";
  inserted: number;
  updated: number;
  skipped: number;
  pages: number;
  pages_exhausted: boolean;
  http_statuses: Record<string, number>;
  error: string | null;
  warnings?: string[];
  run_id: string;
};

const MAX_REVIEWS_PAGES = 20;
const MAX_REVIEWS_RETRIES = 3;
const SUPABASE_RETRY_TRIES = 4;
const SUPABASE_RETRY_BASE_MS = 300;
const REVIEWS_SYNC_PATH = "/api/google/gbp/reviews/sync";
const EXISTING_LOAD_CHUNK_SIZE = (() => {
  const raw = Number(process.env.GOOGLE_EXISTING_LOAD_CHUNK_SIZE ?? 150);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 150;
  }
  return Math.min(Math.floor(raw), 500);
})();

const withSupabaseRetry = async <T>(
  operation: () => PromiseLike<T> | T,
  params: { requestId?: string; label: string }
) =>
  withRetry(() => operation(), {
    tries: SUPABASE_RETRY_TRIES,
    baseMs: SUPABASE_RETRY_BASE_MS,
    requestId: params.requestId,
    method: "POST",
    path: REVIEWS_SYNC_PATH,
    label: params.label
  });

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (items.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const loadExistingReviewsChunked = async (params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  locationId: string;
  reviewNames: string[];
  requestId?: string;
}) => {
  const uniqueReviewNames = Array.from(
    new Set(
      params.reviewNames.filter(
        (reviewName): reviewName is string =>
          typeof reviewName === "string" && reviewName.length > 0
      )
    )
  );

  const existingByReviewName = new Map<string, ExistingReviewRow>();
  if (uniqueReviewNames.length === 0) {
    return { existingByReviewName, existingLoadFailed: false as const };
  }

  const chunks = chunkArray(uniqueReviewNames, EXISTING_LOAD_CHUNK_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    try {
      const { data, error } = await withSupabaseRetry(
        () =>
          params.supabaseAdmin
            .from("google_reviews")
            .select("review_name, rating, comment, update_time, reply_text, replied_at")
            .eq("user_id", params.userId)
            .eq("location_id", params.locationId)
            .in("review_name", chunk),
        {
          requestId: params.requestId,
          label: `google_reviews.load_existing.chunk_${chunkIndex + 1}`
        }
      );

      if (error) {
        throw error;
      }

      for (const row of data ?? []) {
        if (row && typeof row === "object" && "review_name" in row) {
          const key = (row as ExistingReviewRow).review_name;
          if (typeof key === "string" && key.length > 0) {
            existingByReviewName.set(key, row as ExistingReviewRow);
          }
        }
      }
    } catch (error) {
      console.warn("[google_reviews.load_existing_fallback]", {
        requestId: params.requestId ?? null,
        user_id: params.userId,
        location_id: params.locationId,
        chunk_index: chunkIndex + 1,
        chunks_total: chunks.length,
        chunk_size: chunk.length,
        message: getErrorMessage(error).slice(0, 220)
      });
      return {
        existingByReviewName: new Map<string, ExistingReviewRow>(),
        existingLoadFailed: true as const
      };
    }
  }

  return { existingByReviewName, existingLoadFailed: false as const };
};

const getErrorMessage = (err: unknown): string =>
  err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : JSON.stringify(err);

const deriveReauthReasonFromMessage = (message: string | null): AuthStatusReason => {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("missing") && normalized.includes("refresh")) {
    return "missing_refresh_token";
  }
  if (
    normalized.includes("invalid_grant") ||
    normalized.includes("revoked") ||
    normalized.includes("expired")
  ) {
    return "token_revoked";
  }
  return "unknown";
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const backoffWithJitter = (attempt: number) => {
  const base = 400 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 160);
  return base + jitter;
};

const bumpHttpStatus = (map: Record<string, number>, status: number) => {
  const key = String(status);
  map[key] = (map[key] ?? 0) + 1;
};

const extractGoogleErrorMessage = (body: string) => {
  if (!body) {
    return "Google API error";
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  } catch {
    // ignore JSON parse failures
  }
  return body.slice(0, 300);
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

const getReviewIdFromReviewName = (reviewName: string | null) => {
  if (!reviewName) {
    return null;
  }
  const segment = reviewName.split("/").pop() ?? null;
  return segment && segment.length > 0 ? segment : null;
};

const buildReviewName = (params: {
  locationResourceName: string;
  reviewName: string | null;
  reviewId: string | null;
}) => {
  const { locationResourceName, reviewName, reviewId } = params;
  if (reviewName) {
    return reviewName;
  }
  if (!reviewId) {
    return null;
  }
  if (reviewId.includes("/reviews/")) {
    return reviewId;
  }
  return `${locationResourceName}/reviews/${reviewId}`;
};

const isSameOrNewerReviewSnapshot = (
  candidate: Pick<ReviewRowForAlert, "update_time" | "create_time">,
  baseline: Pick<ReviewRowForAlert, "update_time" | "create_time">
) => {
  const candidateTs =
    normalizeTimestamp(candidate.update_time) ??
    normalizeTimestamp(candidate.create_time) ??
    0;
  const baselineTs =
    normalizeTimestamp(baseline.update_time) ??
    normalizeTimestamp(baseline.create_time) ??
    0;
  return candidateTs >= baselineTs;
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
  now: Date,
  requestId?: string
): Promise<LocationAlertMetrics> => {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since30Iso = since30d.toISOString();
  const { data } = await withSupabaseRetry(
    () =>
      supabaseAdmin
        .from("google_reviews")
        .select("rating, create_time")
        .eq("user_id", userId)
        .eq("location_id", locationResourceName)
        .gte("create_time", since30Iso),
    {
      requestId,
      label: "google_reviews.compute_metrics"
    }
  );

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
  requestId?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = params.supabaseAdmin;
  const resendKey = process.env.RESEND_API_KEY ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? "";
  if (!resendKey || !emailFrom) {
    console.error("[alerts] missing email configuration");
    return;
  }

  let recipient: string | null = null;
  try {
    const { data: profileRow } = await withSupabaseRetry(
      () =>
        sb
          .from("profiles")
          .select("email")
          .eq("id", params.userId)
          .maybeSingle(),
      {
        requestId: params.requestId,
        label: "alerts.load_profile"
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipient = (profileRow as any)?.email ?? null;
  } catch {
    recipient = null;
  }
  if (!recipient) {
    return;
  }

  const { data: alerts, error: alertsError } = await withSupabaseRetry(
    () =>
      sb
        .from("alerts")
        .select(
          "id, user_id, establishment_id, rule_code, severity, review_id, payload, triggered_at, last_notified_at"
        )
        .eq("user_id", params.userId)
        .eq("establishment_id", params.establishmentId)
        .is("resolved_at", null)
        .is("last_notified_at", null)
        .order("triggered_at", { ascending: true })
        .limit(25),
    {
      requestId: params.requestId,
      label: "alerts.load_pending"
    }
  );
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
      await withSupabaseRetry(
        () =>
          sb
            .from("alerts")
            .update({ last_notified_at: nowIso })
            .eq("id", (alert as PendingAlertRow).id)
            .is("last_notified_at", null),
        {
          requestId: params.requestId,
          label: "alerts.mark_notified"
        }
      );
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

const isReviewReplied = (review: ReviewRowForAlert) =>
  Boolean(review.reply_text && review.reply_text.trim()) ||
  Boolean(review.replied_at) ||
  Boolean(review.owner_reply && review.owner_reply.trim());

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
  const hasReply = isReviewReplied(review);

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

class GoogleReviewsFetchError extends Error {
  status: number | null;
  httpStatuses: Record<string, number>;
  pages: number;

  constructor(
    message: string,
    status: number | null,
    httpStatuses: Record<string, number>,
    pages: number
  ) {
    super(message);
    this.status = status;
    this.httpStatuses = httpStatuses;
    this.pages = pages;
  }
}

const listReviewsForLocation = async (
  accessToken: string,
  parent: string
) => {
  const reviews: GoogleReview[] = [];
  const httpStatuses: Record<string, number> = {};
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let pages = 0;
  let pagesExhausted = false;

  while (true) {
    if (pages >= MAX_REVIEWS_PAGES) {
      pagesExhausted = true;
      break;
    }

    const tokenKey = pageToken ?? "__first__";
    if (seenTokens.has(tokenKey)) {
      pagesExhausted = true;
      break;
    }
    seenTokens.add(tokenKey);

    const baseUrl =
      `https://mybusiness.googleapis.com/v4/${parent}/reviews` +
      `?pageSize=50&orderBy=updateTime desc`;
    const url = pageToken
      ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;

    let response: Response | null = null;
    let responseBody = "";

    for (let attempt = 1; attempt <= MAX_REVIEWS_RETRIES; attempt += 1) {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      bumpHttpStatus(httpStatuses, response.status);
      responseBody = await response.text();

      if (response.ok || response.status === 404) {
        break;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_REVIEWS_RETRIES) {
        break;
      }

      await sleep(backoffWithJitter(attempt));
    }

    if (!response) {
      throw new GoogleReviewsFetchError(
        "No response from Google reviews API.",
        null,
        httpStatuses,
        pages
      );
    }

    if (response.status === 404) {
      return {
        reviews,
        notFound: true,
        pages,
        pagesExhausted,
        httpStatuses
      };
    }

    if (!response.ok) {
      throw new GoogleReviewsFetchError(
        extractGoogleErrorMessage(responseBody),
        response.status,
        httpStatuses,
        pages
      );
    }

    let data: Record<string, unknown> | null = null;
    if (responseBody) {
      try {
        data = JSON.parse(responseBody) as Record<string, unknown>;
      } catch {
        throw new GoogleReviewsFetchError(
          "Google reviews response parse failed.",
          response.status,
          httpStatuses,
          pages
        );
      }
    }

    reviews.push(...((data?.reviews ?? []) as GoogleReview[]));
    pages += 1;

    const nextToken =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).nextPageToken
        : null;
    pageToken =
      typeof nextToken === "string" && nextToken.length > 0
        ? nextToken
        : undefined;

    if (!pageToken) {
      break;
    }
  }

  return {
    reviews,
    notFound: false,
    pages,
    pagesExhausted,
    httpStatuses
  };
};

const createSyncRun = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    userId: string;
    locationId: string;
    meta?: Record<string, unknown>;
    requestId?: string;
  }
) => {
  const runId = randomUUID();
  try {
    await withSupabaseRetry(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () =>
        (supabaseAdmin as any).from("google_sync_runs").insert({
          id: runId,
          user_id: payload.userId,
          location_id: payload.locationId,
          run_type: "reviews_sync",
          status: "running",
          started_at: new Date().toISOString(),
          meta: payload.meta ?? {}
        }),
      {
        requestId: payload.requestId,
        label: "google_sync_runs.insert"
      }
    );
  } catch (error) {
    console.error("google_sync_runs insert failed:", getErrorMessage(error));
  }
  return runId;
};

const finishSyncRun = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    runId: string;
    status: SyncRunStatus;
    error?: string | null;
    meta?: Record<string, unknown>;
    requestId?: string;
  }
) => {
  try {
    await withSupabaseRetry(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () =>
        (supabaseAdmin as any)
          .from("google_sync_runs")
          .update({
            status: payload.status,
            finished_at: new Date().toISOString(),
            error: payload.error ?? null,
            meta: payload.meta ?? {}
          })
          .eq("id", payload.runId),
      {
        requestId: payload.requestId,
        label: "google_sync_runs.update"
      }
    );
  } catch (error) {
    console.error("google_sync_runs update failed:", getErrorMessage(error));
  }
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
  },
  requestId?: string
) => {
  try {
    await withSupabaseRetry(
      () =>
        supabaseAdmin.from("cron_state").upsert({
          key: `import_status_v1:${userId}:${locationId}`,
          value,
          user_id: userId,
          updated_at: new Date().toISOString()
        }),
      {
        requestId,
        label: "cron_state.upsert_import_status"
      }
    );
  } catch (error) {
    console.error("import status upsert failed:", getErrorMessage(error));
  }
};

export const syncGoogleReviewsForUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  locationId: string | null,
  requestId?: string
) => {
  const { data: connection, error: connectionError } = await withSupabaseRetry(
    () =>
      supabaseAdmin
        .from("google_connections")
        .select("access_token,refresh_token,expires_at")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle(),
    {
      requestId,
      label: "google_connections.load"
    }
  );

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
      throw new Error("reauth_required:missing_refresh_token");
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
        throw new Error("reauth_required:token_revoked");
      }
      throw error;
    }
    accessToken = refreshed.access_token;
    const newExpiresAt =
      refreshed.expires_in && refreshed.expires_in > 0
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;

    const { error: refreshError } = await withSupabaseRetry(
      () =>
        supabaseAdmin
          .from("google_connections")
          .update({
            access_token: accessToken,
            expires_at: newExpiresAt,
            scope: refreshed.scope ?? null,
            token_type: refreshed.token_type ?? null
          })
          .eq("user_id", userId)
          .eq("provider", "google"),
      {
        requestId,
        label: "google_connections.refresh_update"
      }
    );

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

  const { data: locations, error: locationsError } = await withSupabaseRetry(
    () => locationQuery,
    {
      requestId,
      label: "google_locations.load"
    }
  );

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
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let locationsFailed = 0;
  const locationResults: LocationSyncResult[] = [];

  for (const location of locationList) {
    const locationStart = Date.now();
    const runStartedAt = new Date().toISOString();
    const runAuthStatus: AuthStatusSummary = {
      status: "connected",
      reason: "ok",
      last_checked_at: runStartedAt,
      message: null
    };
    const runId = await createSyncRun(supabaseAdmin, {
      userId,
      locationId: location.location_resource_name,
      meta: {
        location_title: location.location_title ?? null
      },
      requestId
    });

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
      },
      requestId
    );
    const displayName =
      (location as { location_title?: string }).location_title ??
      (location as { title?: string }).title ??
      (location as { name?: string }).name ??
      location.location_resource_name;
    const parent = location.location_resource_name.startsWith("accounts/")
      ? location.location_resource_name
      : `${location.account_resource_name}/${location.location_resource_name}`;

    let pages = 0;
    let pagesExhausted = false;
    let httpStatuses: Record<string, number> = {};

    try {
      const result = await listReviewsForLocation(accessToken, parent);
      const reviews = result.reviews;
      pages = result.pages;
      pagesExhausted = result.pagesExhausted;
      httpStatuses = result.httpStatuses;

      if (result.notFound) {
        locationsFailed += 1;
        const notFoundMessage = "Location not found on Google.";
        await upsertImportStatus(
          supabaseAdmin,
          userId,
          location.location_resource_name,
          {
            status: "error",
            last_run_at: runStartedAt,
            aborted: false,
            cursor: null,
            pages_exhausted: pagesExhausted,
            stats: { scanned: 0, upserted: 0 },
            errors_count: 1,
            last_error: notFoundMessage
          },
          requestId
        );
        await finishSyncRun(supabaseAdmin, {
          runId,
          status: "error",
          error: notFoundMessage,
          meta: {
            auth_status: runAuthStatus,
            inserted: 0,
            updated: 0,
            skipped: 0,
            pages,
            pages_exhausted: pagesExhausted,
            http_statuses: httpStatuses
          },
          requestId
        });
        locationResults.push({
          location_id: location.location_resource_name,
          location_title: displayName ?? null,
          status: "error",
          inserted: 0,
          updated: 0,
          skipped: 0,
          pages,
          pages_exhausted: pagesExhausted,
          http_statuses: httpStatuses,
          error: notFoundMessage,
          warnings: [],
          run_id: runId
        });
        continue;
      }

      const nowIso = new Date().toISOString();
      if (reviews.length === 0) {
        await withSupabaseRetry(
          () =>
            supabaseAdmin
              .from("google_locations")
              .update({ last_synced_at: nowIso })
              .eq("user_id", userId)
              .eq("location_resource_name", location.location_resource_name),
          {
            requestId,
            label: "google_locations.update_last_synced_empty"
          }
        );
        await upsertImportStatus(
          supabaseAdmin,
          userId,
          location.location_resource_name,
          {
            status: "done",
            last_run_at: nowIso,
            aborted: false,
            cursor: null,
            pages_exhausted: pagesExhausted,
            stats: { scanned: 0, upserted: 0 },
            errors_count: 0
          },
          requestId
        );
        await finishSyncRun(supabaseAdmin, {
          runId,
          status: "done",
          meta: {
            inserted: 0,
            updated: 0,
            skipped: 0,
            pages,
            pages_exhausted: pagesExhausted,
            http_statuses: httpStatuses
          },
          requestId
        });
        locationResults.push({
          location_id: location.location_resource_name,
          location_title: displayName ?? null,
          status: "ok",
          inserted: 0,
          updated: 0,
          skipped: 0,
          pages,
          pages_exhausted: pagesExhausted,
          http_statuses: httpStatuses,
          error: null,
          warnings: [],
          run_id: runId
        });
        continue;
      }

      const rows = reviews
        .map((review) => {
          const reviewNameFromApi =
            typeof review.name === "string" && review.name.trim().length > 0
              ? review.name.trim()
              : null;
          const rawReviewId =
            typeof review.reviewId === "string" && review.reviewId.trim().length > 0
              ? review.reviewId.trim()
              : null;
          const reviewName = buildReviewName({
            locationResourceName: location.location_resource_name,
            reviewName: reviewNameFromApi,
            reviewId: rawReviewId
          });
          const reviewId =
            getReviewIdFromReviewName(reviewName) ??
            (rawReviewId && !rawReviewId.includes("/reviews/") ? rawReviewId : null);
          if (!reviewName || !reviewId) {
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
        .filter((row): row is ReviewRowForAlert & { [key: string]: unknown } =>
          Boolean(row)
        );

      const dedupedRowsByResource = new Map<
        string,
        ReviewRowForAlert & { [key: string]: unknown }
      >();
      for (const row of rows) {
        const existing = dedupedRowsByResource.get(row.review_name);
        if (!existing || isSameOrNewerReviewSnapshot(row, existing)) {
          dedupedRowsByResource.set(row.review_name, row);
        }
      }
      const dedupedRows = Array.from(dedupedRowsByResource.values());
      const conflictKey = "user_id,review_name";

      logRequest("[gbp/reviews-upsert]", {
        requestId: requestId ?? runId,
        location_id: location.location_resource_name,
        fetched: reviews.length,
        deduped: dedupedRows.length,
        conflictKey
      });

      const reviewNames = dedupedRows.map((row) => row.review_name);
      const { existingByReviewName, existingLoadFailed } = await loadExistingReviewsChunked({
        supabaseAdmin,
        userId,
        locationId: location.location_resource_name,
        reviewNames,
        requestId
      });

      let inserted = 0;
      let updated = 0;
      let skipped = Math.max(reviews.length - dedupedRows.length, 0);
      if (existingLoadFailed) {
        // We cannot reliably compute insert vs update when existing read failed.
        skipped += dedupedRows.length;
      } else {
        const existingReviewNames = new Set<string>(existingByReviewName.keys());
        for (const row of dedupedRows as ReviewRowForAlert[]) {
          if (!existingReviewNames.has(row.review_name)) {
            inserted += 1;
            existingReviewNames.add(row.review_name);
            continue;
          }
          updated += 1;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await withSupabaseRetry(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () =>
          (supabaseAdmin as any).from("google_reviews").upsert(dedupedRows as any, {
            onConflict: conflictKey
          }),
        {
          requestId,
          label: "google_reviews.upsert"
        }
      );

      if (upsertError) {
        throw new Error(upsertError.message ?? "Upsert failed.");
      }

      reviewsUpsertedCount += inserted + updated;
      totalInserted += inserted;
      totalUpdated += updated;
      totalSkipped += skipped;

      const changedReviews = existingLoadFailed
        ? []
        : (dedupedRows as ReviewRowForAlert[]).filter((row) =>
            hasReviewChanged(existingByReviewName.get(row.review_name), row)
          );
      let insertedAlerts = 0;
      let locationMetrics: LocationAlertMetrics | null = null;
      if (changedReviews.length > 0) {
        const now = new Date();
        const settings = defaultAlertSettings();
        locationMetrics = await computeLocationMetrics(
          supabaseAdmin,
          userId,
          location.location_resource_name,
          now,
          requestId
        );
        const alertsToInsert = changedReviews.flatMap((review) =>
          evaluateRules({
            review,
            establishmentId: location.id,
            userId,
            settings,
            metrics: locationMetrics,
            now
          })
        );
        insertedAlerts = alertsToInsert.length;
        if (alertsToInsert.length > 0) {
          const { error: alertError } = await withSupabaseRetry(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () =>
              (supabaseAdmin as any).from("alerts").insert(alertsToInsert, {
                onConflict: "rule_code,review_id",
                ignoreDuplicates: true
              }),
            {
              requestId,
              label: "alerts.insert_changed_reviews"
            }
          );
          if (alertError) {
            console.error("[alerts] insert failed", alertError);
          }
        }
      }

      if (insertedAlerts === 0) {
        const now = new Date();
        const settings = defaultAlertSettings();
        if (!locationMetrics) {
          locationMetrics = await computeLocationMetrics(
            supabaseAdmin,
            userId,
            location.location_resource_name,
            now,
            requestId
          );
        }
        const { data: backfillRows, error: backfillError } = await withSupabaseRetry(
          () =>
            supabaseAdmin
              .from("google_reviews")
              .select(
                "review_id, rating, comment, create_time, update_time, reply_text, replied_at, owner_reply, author_name"
              )
              .eq("user_id", userId)
              .eq("location_id", location.location_resource_name)
              .lte("rating", 2)
              .order("create_time", { ascending: false })
              .limit(20),
          {
            requestId,
            label: "google_reviews.load_backfill_candidates"
          }
        );

        if (backfillError) {
          console.error("[alerts] backfill load failed", backfillError);
        } else if (backfillRows && backfillRows.length > 0) {
          const candidates = (backfillRows as ReviewRowForAlert[]).filter(
            (review) => !isReviewReplied(review)
          );
          const backfillAlerts = candidates.flatMap((review) =>
            evaluateRules({
              review,
              establishmentId: location.id,
              userId,
              settings,
              metrics: locationMetrics as LocationAlertMetrics,
              now
            })
          );
          if (backfillAlerts.length > 0) {
            const { error: backfillInsertError } = await withSupabaseRetry(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              () =>
                (supabaseAdmin as any).from("alerts").insert(backfillAlerts, {
                  onConflict: "rule_code,review_id",
                  ignoreDuplicates: true
                }),
              {
                requestId,
                label: "alerts.insert_backfill"
              }
            );
            if (backfillInsertError) {
              console.error("[alerts] backfill_insert_failed", {
                message: backfillInsertError.message,
                alerts: backfillAlerts.length
              });
            }
          }
        }
      }

      await sendPendingAlerts({
        supabaseAdmin,
        userId,
        establishmentId: location.id,
        requestId
      });

      await withSupabaseRetry(
        () =>
          supabaseAdmin
            .from("google_locations")
            .update({ last_synced_at: nowIso })
            .eq("user_id", userId)
            .eq("location_resource_name", location.location_resource_name),
        {
          requestId,
          label: "google_locations.update_last_synced"
        }
      );

      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "done",
          last_run_at: nowIso,
          aborted: false,
          cursor: null,
          pages_exhausted: pagesExhausted,
          stats: { scanned: reviews.length, upserted: inserted + updated },
          errors_count: 0
        },
        requestId
      );

      await finishSyncRun(supabaseAdmin, {
        runId,
        status: "done",
        meta: {
          auth_status: runAuthStatus,
          existing_load_failed: existingLoadFailed,
          inserted,
          updated,
          skipped,
          pages,
          pages_exhausted: pagesExhausted,
          http_statuses: httpStatuses
        },
        requestId
      });

      locationResults.push({
        location_id: location.location_resource_name,
        location_title: displayName ?? null,
        status: existingLoadFailed ? "warning" : "ok",
        inserted,
        updated,
        skipped,
        pages,
        pages_exhausted: pagesExhausted,
        http_statuses: httpStatuses,
        error: null,
        warnings: existingLoadFailed ? ["existing_load_failed"] : [],
        run_id: runId
      });

      console.log("[gbp_reviews]", {
        requestId: requestId ?? runId,
        user_id: userId,
        location_id: location.location_resource_name,
        conflictKey,
        existing_load_failed: existingLoadFailed,
        fetched: reviews.length,
        deduped: dedupedRows.length,
        inserted,
        updated,
        skipped,
        duration_ms: Date.now() - locationStart
      });
    } catch (error: unknown) {
      locationsFailed += 1;

      const message =
        error instanceof GoogleReviewsFetchError
          ? error.message
          : getErrorMessage(error);
      const failedPages =
        error instanceof GoogleReviewsFetchError ? error.pages : pages;
      const failedStatuses =
        error instanceof GoogleReviewsFetchError
          ? error.httpStatuses
          : httpStatuses;
      const failedPagesExhausted = pagesExhausted;
      const failedAuthStatus: AuthStatusSummary =
        error instanceof GoogleReviewsFetchError &&
        (error.status === 401 || error.status === 403)
          ? {
              status: "reauth_required",
              reason: "token_revoked",
              last_checked_at: new Date().toISOString(),
              message
            }
          : {
              status: "unknown",
              reason: "unknown",
              last_checked_at: new Date().toISOString(),
              message
            };

      await upsertImportStatus(
        supabaseAdmin,
        userId,
        location.location_resource_name,
        {
          status: "error",
          last_run_at: runStartedAt,
          aborted: false,
          cursor: null,
          pages_exhausted: failedPagesExhausted,
          stats: { scanned: 0, upserted: 0 },
          errors_count: 1,
          last_error: message
        },
        requestId
      );

      await finishSyncRun(supabaseAdmin, {
        runId,
        status: "error",
        error: message,
        meta: {
          auth_status: failedAuthStatus,
          inserted: 0,
          updated: 0,
          skipped: 0,
          pages: failedPages,
          pages_exhausted: failedPagesExhausted,
          http_statuses: failedStatuses
        },
        requestId
      });

      locationResults.push({
        location_id: location.location_resource_name,
        location_title: displayName ?? null,
        status: "error",
        inserted: 0,
        updated: 0,
        skipped: 0,
        pages: failedPages,
        pages_exhausted: failedPagesExhausted,
        http_statuses: failedStatuses,
        error: message,
        warnings: [],
        run_id: runId
      });

      console.warn("[gbp_reviews] location failed", {
        user_id: userId,
        location_id: location.location_resource_name,
        message
      });
      continue;
    }
  }

  console.log("gbp reviews sync:", {
    userId,
    locationsCount: locationList.length,
    reviewsUpsertedCount
  });

  if (locationList.length > 0) {
    await withSupabaseRetry(
      () =>
        supabaseAdmin
          .from("google_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("provider", "google"),
      {
        requestId,
        label: "google_connections.update_last_synced"
      }
    );
  }

  // Persist last run status per user (cron_state is user-scoped now)
  await withSupabaseRetry(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () =>
      (supabaseAdmin as any).from("cron_state").upsert({
        key: "google_reviews_last_run",
        user_id: userId,
        value: {
          at: new Date().toISOString(),
          inserted: totalInserted,
          updated: totalUpdated,
          skipped: totalSkipped,
          processed: totalInserted + totalUpdated + totalSkipped,
          locationsProcessed: locationList.length
        },
        updated_at: new Date().toISOString()
      }),
    {
      requestId,
      label: "cron_state.upsert_last_run"
    }
  );
  console.log("[cron_state] upsert google_reviews_last_run", userId);

  return {
    locationsCount: locationList.length,
    reviewsCount: reviewsUpsertedCount,
    locationsFailed,
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    locationResults
  };
};

const handler = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  const rawAuthHeader =
    (req.headers as Record<string, string | string[] | undefined>).authorization ??
    (req.headers as Record<string, string | string[] | undefined>).Authorization;
  const authHeader = Array.isArray(rawAuthHeader)
    ? (rawAuthHeader[0] ?? "")
    : (rawAuthHeader ?? "");
  const hasAuthHeader = authHeader.length > 0;
  const authHeaderPrefix = hasAuthHeader
    ? authHeader.startsWith("Bearer ")
      ? "Bearer"
      : authHeader.split(/\s+/)[0] ?? "unknown"
    : "none";

  logRequest("[gbp/reviews-sync]", {
    requestId,
    hasAuthHeader,
    authHeaderPrefix,
    method: req.method ?? "GET",
    path: req.url ?? "/api/google/gbp/reviews/sync"
  });
  if (req.method !== "POST") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  let userId: string | null = null;
  let locationId: string | null = null;
  try {
    const auth = await requireUser(req, res);
    if (!auth) {
      return;
    }
    const { userId: authenticatedUserId, supabaseAdmin } = auth;
    userId = authenticatedUserId;

    const { params } = parseQuery(req);
    locationId = getParam(params, "location_id");
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
      locationId,
      requestId
    );

    return res.status(200).json({
      ok: true,
      requestId,
      locationsCount: result.locationsCount,
      reviewsCount: result.reviewsCount,
      locationsFailed: result.locationsFailed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      locationResults: result.locationResults
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message.startsWith("reauth_required")) {
      const [, rawReason] = message.split(":");
      const reason = rawReason ? deriveReauthReasonFromMessage(rawReason) : "unknown";
      if (userId) {
        const supabaseAdmin = createSupabaseAdmin();
        const nowIso = new Date().toISOString();
        try {
          await withSupabaseRetry(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () =>
              (supabaseAdmin as any).from("cron_state").upsert({
                key: "google_reviews_last_error",
                user_id: userId,
                value: {
                  at: nowIso,
                  code: "reauth_required",
                  reason,
                  message: "reconnexion_google_requise",
                  location_pk: locationId ?? null
                },
                updated_at: nowIso
              }),
            {
              requestId,
              label: "cron_state.upsert_last_error"
            }
          );
        } catch (upsertError) {
          console.error("[google_reviews_auth] cron_state upsert failed", {
            requestId,
            userId,
            message: getErrorMessage(upsertError)
          });
        }
        console.warn("[google_reviews_auth]", {
          requestId,
          userId,
          reason
        });
      }
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
