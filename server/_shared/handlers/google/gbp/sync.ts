import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import {
  createSupabaseAdmin,
  getRequiredEnv,
  getUserFromRequest
} from "../../../google/_utils.js";
import type { Json } from "../../../database.types.js";
import { requireUser } from "../../../_auth.js";
import {
  getRequestId,
  sendError,
  parseQuery,
  getParam,
  logRequest
} from "../../../api_utils.js";

type GoogleAccount = {
  name: string;
};

type GoogleLocation = {
  name: string;
  title?: string;
  storeCode?: string;
  storefrontAddress?: unknown;
  primaryPhone?: string;
  websiteUri?: string;
};

type SyncRunType = "locations_import" | "reviews_sync";
type SyncRunStatus = "running" | "done" | "error";

type SyncFailure = {
  step: "list_accounts" | "list_locations" | "upsert_location";
  account_resource_name: string | null;
  location_resource_name: string | null;
  message: string;
  status: number | null;
};

type GoogleConnectionStatus =
  | "disconnected"
  | "connected"
  | "reauth_required"
  | "unknown";

type GoogleConnectionReason =
  | "ok"
  | "token_revoked"
  | "missing_refresh_token"
  | "expired"
  | "unknown"
  | "no_connection";

type GoogleConnectionSnapshot = {
  status: GoogleConnectionStatus;
  reason: GoogleConnectionReason;
  lastError: string | null;
  lastCheckedAt: string;
};

const MAX_RETRY_ATTEMPTS = 3;
const MAX_PAGE_COUNT = 20;
const AUTH_REAUTH_SIGNAL_TTL_MS = Number(
  process.env.GOOGLE_AUTH_SIGNAL_TTL_MS ?? 6 * 60 * 60 * 1000
);

class GoogleHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Google API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const backoffWithJitter = (attempt: number) => {
  const base = 350 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 140);
  return base + jitter;
};

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);

const isGoogleConnectionReason = (
  value: unknown
): value is GoogleConnectionReason =>
  value === "ok" ||
  value === "token_revoked" ||
  value === "missing_refresh_token" ||
  value === "expired" ||
  value === "unknown" ||
  value === "no_connection";

const deriveReauthReasonFromMessage = (message: string | null) => {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("missing") && normalized.includes("refresh")) {
    return "missing_refresh_token" as const;
  }
  if (
    normalized.includes("invalid_grant") ||
    normalized.includes("revoked") ||
    normalized.includes("expired")
  ) {
    return "token_revoked" as const;
  }
  return "unknown" as const;
};

const readJsonBody = async (req: VercelRequest) => {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const bumpHttpStatus = (map: Record<string, number>, status: number) => {
  const key = String(status);
  map[key] = (map[key] ?? 0) + 1;
};

const parseGoogleErrorMessage = (body: string) => {
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
    // body is not JSON
  }
  return body.slice(0, 300);
};

const fetchGoogleJsonWithRetry = async (
  url: string,
  accessToken: string,
  httpStatuses: Record<string, number>
) => {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    lastStatus = response.status;
    lastBody = await response.text();
    bumpHttpStatus(httpStatuses, response.status);

    if (response.ok) {
      if (!lastBody) {
        return {} as Record<string, unknown>;
      }
      try {
        return JSON.parse(lastBody) as Record<string, unknown>;
      } catch {
        throw new GoogleHttpError(
          response.status,
          "Google API response is not valid JSON."
        );
      }
    }

    if (!isRetryableStatus(response.status) || attempt === MAX_RETRY_ATTEMPTS) {
      throw new GoogleHttpError(response.status, lastBody);
    }

    await sleep(backoffWithJitter(attempt));
  }

  throw new GoogleHttpError(lastStatus, lastBody);
};

const createSyncRun = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    userId: string;
    runType: SyncRunType;
    locationId?: string | null;
    meta?: Record<string, unknown>;
  }
) => {
  const runId = randomUUID();
  const nowIso = new Date().toISOString();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("google_sync_runs").insert({
      id: runId,
      user_id: payload.userId,
      location_id: payload.locationId ?? null,
      run_type: payload.runType,
      status: "running",
      started_at: nowIso,
      meta: payload.meta ?? {}
    });
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
  }
) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from("google_sync_runs")
      .update({
        status: payload.status,
        error: payload.error ?? null,
        finished_at: new Date().toISOString(),
        meta: payload.meta ?? {}
      })
      .eq("id", payload.runId);
  } catch (error) {
    console.error("google_sync_runs update failed:", getErrorMessage(error));
  }
};

const upsertGoogleReauthState = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    userId: string;
    reason: GoogleConnectionReason;
    message: string;
    requestId?: string;
  }
) => {
  const nowIso = new Date().toISOString();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("cron_state").upsert({
      key: "google_reviews_last_error",
      user_id: payload.userId,
      value: {
        at: nowIso,
        code: "reauth_required",
        reason: payload.reason,
        message: payload.message,
        request_id: payload.requestId ?? null
      },
      updated_at: nowIso
    });
  } catch (error) {
    console.error("cron_state upsert google_reviews_last_error failed:", getErrorMessage(error));
    return;
  }
  console.warn("[google_auth_state]", {
    requestId: payload.requestId ?? null,
    userId: payload.userId,
    reason: payload.reason
  });
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

const listAccounts = async (
  accessToken: string,
  httpStatuses: Record<string, number>
) => {
  const accounts: GoogleAccount[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let page = 0;

  while (page < MAX_PAGE_COUNT) {
    const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const tokenKey = pageToken ?? "__first__";
    if (seenTokens.has(tokenKey)) {
      break;
    }
    seenTokens.add(tokenKey);

    const data = await fetchGoogleJsonWithRetry(
      url.toString(),
      accessToken,
      httpStatuses
    );

    accounts.push(...((data.accounts ?? []) as GoogleAccount[]));
    const nextToken =
      typeof data.nextPageToken === "string" && data.nextPageToken.length > 0
        ? data.nextPageToken
        : undefined;

    page += 1;
    if (!nextToken) {
      break;
    }
    pageToken = nextToken;
  }

  return accounts;
};

const listLocationsForAccount = async (
  accessToken: string,
  accountName: string,
  httpStatuses: Record<string, number>
) => {
  const locations: GoogleLocation[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  const normalizedAccountName = accountName.startsWith("accounts/")
    ? accountName
    : `accounts/${accountName}`;

  for (let page = 0; page < MAX_PAGE_COUNT; page += 1) {
    const baseUrl =
      `https://mybusinessbusinessinformation.googleapis.com/v1/${normalizedAccountName}/locations` +
      `?readMask=name,title,storefrontAddress,metadata,phoneNumbers,websiteUri` +
      `&pageSize=100`;
    const url = pageToken
      ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;

    const tokenKey = pageToken ?? "__first__";
    if (seenTokens.has(tokenKey)) {
      break;
    }
    seenTokens.add(tokenKey);

    const data = await fetchGoogleJsonWithRetry(url, accessToken, httpStatuses);

    locations.push(...((data.locations ?? []) as GoogleLocation[]));
    const nextToken =
      typeof data.nextPageToken === "string" && data.nextPageToken.length > 0
        ? data.nextPageToken
        : undefined;

    if (!nextToken) {
      return locations;
    }

    pageToken = nextToken;
  }

  throw new Error("Locations pagination limit reached.");
};

export const syncGoogleLocationsForUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  requestId?: string
) => {
  const runId = await createSyncRun(supabaseAdmin, {
    userId,
    runType: "locations_import",
    meta: {
      source: "api/google/gbp/sync"
    }
  });

  const startedAt = new Date().toISOString();
  const httpStatuses: Record<string, number> = {};
  const failures: SyncFailure[] = [];
  let authStatusForMeta: GoogleConnectionSnapshot = {
    status: "connected",
    reason: "ok",
    lastError: null,
    lastCheckedAt: startedAt
  };

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("google_connections")
    .select("access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (connectionError || !connection) {
    authStatusForMeta = {
      status: "disconnected",
      reason: "no_connection",
      lastError: "Google not connected",
      lastCheckedAt: new Date().toISOString()
    };
    await finishSyncRun(supabaseAdmin, {
      runId,
      status: "error",
      error: "google_not_connected",
      meta: {
        started_at: startedAt,
        auth_status: authStatusForMeta,
        failures_count: 1,
        failures: [
          {
            step: "list_accounts",
            account_resource_name: null,
            location_resource_name: null,
            message: "Google not connected",
            status: null
          }
        ]
      }
    });
    throw new Error("google_not_connected");
  }

  let accessToken = connection.access_token ?? "";
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const shouldRefresh = !accessToken || expiresAt - Date.now() < 60_000;

  if (shouldRefresh) {
    if (!connection.refresh_token) {
      authStatusForMeta = {
        status: "reauth_required",
        reason: "missing_refresh_token",
        lastError: "Missing Google refresh token",
        lastCheckedAt: new Date().toISOString()
      };
      await upsertGoogleReauthState(supabaseAdmin, {
        userId,
        reason: "missing_refresh_token",
        message: "missing_refresh_token",
        requestId
      });
      await finishSyncRun(supabaseAdmin, {
        runId,
        status: "error",
        error: "reauth_required",
        meta: {
          started_at: startedAt,
          auth_status: authStatusForMeta,
          failures_count: 1,
          failures: [
            {
              step: "list_accounts",
              account_resource_name: null,
              location_resource_name: null,
              message: "Missing Google refresh token",
              status: null
            }
          ]
        }
      });
      throw new Error("reauth_required");
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
        authStatusForMeta = {
          status: "reauth_required",
          reason: "token_revoked",
          lastError: "Google token revoked or expired",
          lastCheckedAt: new Date().toISOString()
        };
        await upsertGoogleReauthState(supabaseAdmin, {
          userId,
          reason: "token_revoked",
          message: "google_token_revoked_or_expired",
          requestId
        });

        await finishSyncRun(supabaseAdmin, {
          runId,
          status: "error",
          error: "reauth_required",
          meta: {
            started_at: startedAt,
            auth_status: authStatusForMeta,
            failures_count: 1,
            failures: [
              {
                step: "list_accounts",
                account_resource_name: null,
                location_resource_name: null,
                message: "Google token revoked or expired",
                status: null
              }
            ]
          }
        });
        throw new Error("reauth_required");
      }

      await finishSyncRun(supabaseAdmin, {
        runId,
        status: "error",
        error: getErrorMessage(error),
        meta: {
          started_at: startedAt,
          auth_status: {
            status: "unknown",
            reason: "unknown",
            lastError: getErrorMessage(error),
            lastCheckedAt: new Date().toISOString()
          },
          failures_count: 1,
          failures: [
            {
              step: "list_accounts",
              account_resource_name: null,
              location_resource_name: null,
              message: getErrorMessage(error),
              status: null
            }
          ]
        }
      });
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

  let accounts: GoogleAccount[] = [];
  try {
    accounts = await listAccounts(accessToken, httpStatuses);
  } catch (error) {
    if (error instanceof GoogleHttpError && (error.status === 401 || error.status === 403)) {
      authStatusForMeta = {
        status: "reauth_required",
        reason: "token_revoked",
        lastError: "Google permission denied",
        lastCheckedAt: new Date().toISOString()
      };
      await upsertGoogleReauthState(supabaseAdmin, {
        userId,
        reason: "token_revoked",
        message: "google_permission_denied",
        requestId
      });
      await finishSyncRun(supabaseAdmin, {
        runId,
        status: "error",
        error: "reauth_required",
        meta: {
          started_at: startedAt,
          auth_status: authStatusForMeta,
          failures_count: 1,
          failures: [
            {
              step: "list_accounts",
              account_resource_name: null,
              location_resource_name: null,
              message: "Google permission denied",
              status: error.status
            }
          ],
          http_statuses: httpStatuses
        }
      });
      throw new Error("reauth_required");
    }

    failures.push({
      step: "list_accounts",
      account_resource_name: null,
      location_resource_name: null,
      message:
        error instanceof GoogleHttpError
          ? parseGoogleErrorMessage(error.body)
          : getErrorMessage(error),
      status: error instanceof GoogleHttpError ? error.status : null
    });
  }

  let accountsCount = 0;
  let locationsDiscovered = 0;
  let locationsUpserted = 0;

  for (const account of accounts) {
    if (!account.name) {
      continue;
    }

    accountsCount += 1;

    let locations: GoogleLocation[] = [];
    try {
      locations = await listLocationsForAccount(
        accessToken,
        account.name,
        httpStatuses
      );
    } catch (error) {
      failures.push({
        step: "list_locations",
        account_resource_name: account.name,
        location_resource_name: null,
        message:
          error instanceof GoogleHttpError
            ? parseGoogleErrorMessage(error.body)
            : getErrorMessage(error),
        status: error instanceof GoogleHttpError ? error.status : null
      });
      continue;
    }

    for (const location of locations) {
      if (!location.name) {
        continue;
      }

      locationsDiscovered += 1;

      const { error: upsertError } = await supabaseAdmin
        .from("google_locations")
        .upsert(
          {
            user_id: userId,
            provider: "google",
            account_resource_name: account.name,
            location_resource_name: location.name,
            location_title: location.title ?? null,
            store_code: location.storeCode ?? null,
            address_json: (location.storefrontAddress ?? null) as Json | null,
            phone: location.primaryPhone ?? null,
            website_uri: location.websiteUri ?? null,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id,location_resource_name" }
        );

      if (upsertError) {
        failures.push({
          step: "upsert_location",
          account_resource_name: account.name,
          location_resource_name: location.name,
          message: upsertError.message ?? "Failed to upsert location.",
          status: null
        });
        continue;
      }

      locationsUpserted += 1;
    }
  }

  const runStatus: SyncRunStatus = failures.length > 0 ? "error" : "done";
  const runError = failures.length > 0 ? `${failures.length} location errors` : null;
  const meta = {
    started_at: startedAt,
    auth_status: authStatusForMeta,
    accounts_count: accountsCount,
    locations_discovered: locationsDiscovered,
    locations_upserted: locationsUpserted,
    failures_count: failures.length,
    failures,
    http_statuses: httpStatuses
  };

  await finishSyncRun(supabaseAdmin, {
    runId,
    status: runStatus,
    error: runError,
    meta
  });

  console.log("[gbp_locations_sync]", {
    user_id: userId,
    accounts_count: accountsCount,
    locations_count: locationsUpserted,
    failures_count: failures.length
  });

  return {
    runId,
    status: runStatus,
    accountsCount,
    locationsCount: locationsUpserted,
    failuresCount: failures.length,
    failures
  };
};

type LocationRow = {
  id: string;
  location_resource_name: string;
  location_title?: string | null;
  updated_at?: string | null;
};

type GoogleConnectionRow = {
  user_id: string;
  expires_at: string | null;
  refresh_token: string | null;
  updated_at: string;
};

type CronStateErrorRow = {
  value: unknown;
  updated_at: string | null;
};

const parseConnectionStatus = (params: {
  connection: GoogleConnectionRow | null;
  cronError: CronStateErrorRow | null;
}): GoogleConnectionSnapshot => {
  const lastCheckedAt = new Date().toISOString();
  const value = params.cronError?.value;
  const parsed =
    value && typeof value === "object"
      ? (value as { code?: string; message?: string; reason?: string })
      : null;
  const errorCode = typeof parsed?.code === "string" ? parsed.code : null;
  const errorMessage =
    typeof parsed?.message === "string" ? parsed.message : null;
  const errorReason = isGoogleConnectionReason(parsed?.reason)
    ? parsed.reason
    : deriveReauthReasonFromMessage(errorMessage);

  const connectionUpdatedAt = params.connection?.updated_at
    ? new Date(params.connection.updated_at).getTime()
    : 0;
  const errorUpdatedAt = params.cronError?.updated_at
    ? new Date(params.cronError.updated_at).getTime()
    : 0;

  if (!params.connection) {
    return {
      status: "disconnected",
      reason: "no_connection",
      lastError: null,
      lastCheckedAt
    };
  }

  const refreshToken =
    typeof params.connection.refresh_token === "string"
      ? params.connection.refresh_token.trim()
      : "";
  if (!refreshToken) {
    return {
      status: "reauth_required",
      reason: "missing_refresh_token",
      lastError: errorMessage ?? "missing_refresh_token",
      lastCheckedAt
    };
  }

  const reauthSignalIsCurrent =
    errorCode === "reauth_required" &&
    !!errorUpdatedAt &&
    Date.now() - errorUpdatedAt <= AUTH_REAUTH_SIGNAL_TTL_MS &&
    (!connectionUpdatedAt || connectionUpdatedAt <= errorUpdatedAt);
  if (reauthSignalIsCurrent) {
    return {
      status: "reauth_required",
      reason: errorReason,
      lastError: errorMessage ?? null,
      lastCheckedAt
    };
  }

  const expiresAtMs = params.connection.expires_at
    ? new Date(params.connection.expires_at).getTime()
    : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return {
      status: "connected",
      reason: "expired",
      lastError: null,
      lastCheckedAt
    };
  }

  return {
    status: "connected",
    reason: Number.isFinite(expiresAtMs) ? "ok" : "unknown",
    lastError: null,
    lastCheckedAt
  };
};

const fetchActiveLocationIds = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
) => {
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

const handler = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  if (req.method === "GET") {
    try {
      const auth = await requireUser(req, res);
      if (!auth) {
        return;
      }
      const { userId, supabaseAdmin } = auth;
      const { params } = parseQuery(req);
      const activeOnly = getParam(params, "active_only") === "1";
      const connectionOnly = getParam(params, "connection_only") === "1";

      let locations: Array<{
        id: string;
        location_resource_name: string;
        location_title: string | null;
        updated_at: string | null;
      }> = [];

      if (!connectionOnly) {
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
          return sendError(
            res,
            requestId,
            { code: "INTERNAL", message: "Failed to load locations" },
            500
          );
        }

        locations = (data ?? []).map((row: LocationRow) => ({
          id: row.id,
          location_resource_name: row.location_resource_name,
          location_title: row.location_title ?? null,
          updated_at: row.updated_at ?? null
        }));
      }

      const { data: connectionData, error: connectionError } = await supabaseAdmin
        .from("google_connections")
        .select("user_id, expires_at, refresh_token, updated_at")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
      if (connectionError) {
        console.error("google connection read failed:", connectionError);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cronErrorData, error: cronError } = await (supabaseAdmin as any)
        .from("cron_state")
        .select("value, updated_at")
        .eq("user_id", userId)
        .eq("key", "google_reviews_last_error")
        .maybeSingle();
      if (cronError) {
        console.error("cron_state connection error read failed:", cronError);
      }

      const connection = (connectionData ?? null) as GoogleConnectionRow | null;
      const cronErrorRow = (cronErrorData ?? null) as CronStateErrorRow | null;
      const parsedStatus = parseConnectionStatus({
        connection,
        cronError: cronErrorRow
      });

      logRequest("[gbp/locations]", {
        requestId,
        userId,
        activeOnly,
        connectionOnly,
        count: locations.length,
        connection_status: parsedStatus.status,
        connection_reason: parsedStatus.reason
      });
      return res.status(200).json({
        ok: true,
        locations,
        requestId,
        connection: {
          status: parsedStatus.status,
          reason: parsedStatus.reason,
          expiresAt: connection?.expires_at ?? null,
          userId,
          lastError: parsedStatus.lastError,
          last_checked_at: parsedStatus.lastCheckedAt,
          lastCheckedAt: parsedStatus.lastCheckedAt
        }
      });
    } catch (error) {
      console.error("google gbp get locations error:", error);
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load locations" },
        500
      );
    }
  }

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
      { headers: req.headers as Record<string, string | undefined>, url: req.url },
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
    const body = await readJsonBody(req);
    const syncNow =
      getParam(params, "sync_now") === "1" || body?.sync_now === true;

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    if (connectionError || !connection) {
      return sendError(
        res,
        requestId,
        { code: "NOT_FOUND", message: "Google not connected" },
        404
      );
    }
    if (!connection.refresh_token) {
      return sendError(
        res,
        requestId,
        { code: "UNAUTHORIZED", message: "reauth_required" },
        401
      );
    }

    if (syncNow) {
      const result = await syncGoogleLocationsForUser(
        supabaseAdmin,
        userId,
        requestId
      );
      return res.status(200).json({
        ok: true,
        queued: false,
        requestId,
        run_id: result.runId,
        status: result.status,
        accountsCount: result.accountsCount,
        locationsCount: result.locationsCount,
        failuresCount: result.failuresCount,
        failures: result.failures
      });
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
      logRequest("[gbp/sync]", {
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
        payload: { include_reviews: true } as Json,
        status: "queued",
        run_at: nowIso,
        updated_at: nowIso
      })
      .select("id, status")
      .single();

    if (jobError || !job) {
      console.error("job_queue insert failed:", jobError);
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Queue failed" },
        500
      );
    }

    logRequest("[gbp/sync]", {
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
  } catch (error) {
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
    console.error("google gbp sync error:", error);
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Sync failed" },
      500
    );
  }
};

export default handler;

// Smoke test:
// curl -i "https://<app>/api/google/gbp/sync?active_only=1" -H "Authorization: Bearer $JWT"
// curl -i -X POST "https://<app>/api/google/gbp/sync" -H "Authorization: Bearer $JWT"
