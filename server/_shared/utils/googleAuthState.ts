type CronStateMutationError = {
  message?: string | null;
};

type CronStateMutationResult = {
  error?: CronStateMutationError | null;
};

type CronStateDeleteQuery = PromiseLike<CronStateMutationResult> & {
  eq: (column: string, value: unknown) => CronStateDeleteQuery;
};

type CronStateClient = {
  from: (table: string) => {
    upsert: (values: Record<string, unknown>) => PromiseLike<CronStateMutationResult>;
    delete: () => CronStateDeleteQuery;
  };
};

export type GoogleReauthReason =
  | "ok"
  | "token_revoked"
  | "missing_refresh_token"
  | "expired"
  | "unknown"
  | "no_connection";

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);

export const isAuthReauthRequiredError = (params: {
  status?: number | null;
  reason?: GoogleReauthReason | null;
  message?: string | null;
  errCode?: string | null;
}) => {
  if (
    params.reason === "missing_refresh_token" ||
    params.reason === "token_revoked"
  ) {
    return true;
  }

  const errCode = (params.errCode ?? "").toLowerCase();
  if (errCode === "invalid_grant") {
    return true;
  }

  const normalized = (params.message ?? "").toLowerCase();
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

  const hasAuthMessage =
    normalized.includes("invalid_grant") ||
    normalized.includes("request had invalid authentication credentials") ||
    normalized.includes("invalid authentication credentials") ||
    normalized.includes("token has been expired or revoked") ||
    normalized.includes("expired or revoked") ||
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("revoked");

  if (params.status === 401) {
    return true;
  }
  if (params.status === 403) {
    return hasAuthMessage;
  }
  return hasAuthMessage;
};

export const setGoogleReauthRequired = async (
  supabaseAdmin: unknown,
  params: {
    userId: string;
    reason: GoogleReauthReason;
    message: string;
    requestId?: string;
    httpStatus?: number | null;
    errCode?: string | null;
  }
) => {
  if (
    !isAuthReauthRequiredError({
      status: params.httpStatus,
      reason: params.reason,
      message: params.message,
      errCode: params.errCode
    })
  ) {
    return false;
  }

  const client = supabaseAdmin as CronStateClient;
  const nowIso = new Date().toISOString();
  try {
    const { error } = await client.from("cron_state").upsert({
      key: "google_reviews_last_error",
      user_id: params.userId,
      value: {
        at: nowIso,
        code: "reauth_required",
        reason: params.reason,
        message: params.message,
        http_status: params.httpStatus ?? null,
        err_code: params.errCode ?? null,
        request_id: params.requestId ?? null
      },
      updated_at: nowIso
    });

    if (error) {
      throw new Error(error.message ?? "cron_state upsert failed");
    }

    console.warn("[google_auth] reauth_required_set", {
      requestId: params.requestId ?? null,
      userId: params.userId,
      reason: params.reason,
      httpStatus: params.httpStatus ?? null,
      errCode: params.errCode ?? null
    });
    return true;
  } catch (error) {
    console.error("[google_auth] reauth_required_set_failed", {
      requestId: params.requestId ?? null,
      userId: params.userId,
      reason: params.reason,
      message: getErrorMessage(error)
    });
    return false;
  }
};

export const clearGoogleReauthRequired = async (
  supabaseAdmin: unknown,
  params: {
    userId: string;
    requestId?: string;
    source: "sync_success" | "oauth_callback";
  }
) => {
  const client = supabaseAdmin as CronStateClient;
  try {
    const { error } = await client
      .from("cron_state")
      .delete()
      .eq("key", "google_reviews_last_error")
      .eq("user_id", params.userId);

    if (error) {
      throw new Error(error.message ?? "cron_state delete failed");
    }

    console.info("[google_auth] reauth_required_cleared", {
      requestId: params.requestId ?? null,
      userId: params.userId,
      source: params.source
    });
    return true;
  } catch (error) {
    console.error("[google_auth] reauth_required_clear_failed", {
      requestId: params.requestId ?? null,
      userId: params.userId,
      source: params.source,
      message: getErrorMessage(error)
    });
    return false;
  }
};
