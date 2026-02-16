type RetryOptions = {
  tries?: number;
  baseMs?: number;
  requestId?: string;
  method?: string;
  path?: string;
  label?: string;
  isTransientError?: (error: unknown) => boolean;
};

const DEFAULT_TRIES = 4;
const DEFAULT_BASE_MS = 300;
const ERROR_MESSAGE_MAX = 220;

type RetryError = Error & {
  status?: number;
  contentType?: string | null;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const truncate = (value: string, max = ERROR_MESSAGE_MAX) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const toLower = (value: string | null | undefined) =>
  typeof value === "string" ? value.toLowerCase() : "";

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractStatus = (value: unknown): number | null => {
  if (!isRecord(value)) {
    return null;
  }
  const directStatus = value.status;
  if (typeof directStatus === "number") {
    return directStatus;
  }
  const statusCode = value.statusCode;
  if (typeof statusCode === "number") {
    return statusCode;
  }
  const response = value.response;
  if (isRecord(response) && typeof response.status === "number") {
    return response.status;
  }
  return null;
};

const extractHeaderValue = (headers: unknown, key: string): string | null => {
  if (!headers) {
    return null;
  }
  if (typeof (headers as { get?: unknown }).get === "function") {
    const getter = (headers as { get: (k: string) => string | null }).get;
    const value = getter(key);
    return typeof value === "string" ? value : null;
  }
  if (isRecord(headers)) {
    const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
    if (typeof direct === "string") {
      return direct;
    }
    if (Array.isArray(direct) && typeof direct[0] === "string") {
      return direct[0];
    }
  }
  return null;
};

const extractContentType = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.contentType === "string") {
    return value.contentType;
  }
  if (typeof value.content_type === "string") {
    return value.content_type;
  }
  if (isRecord(value.response)) {
    return extractHeaderValue(value.response.headers, "content-type");
  }
  return null;
};

const toRetryError = (error: unknown): RetryError => {
  if (error instanceof Error) {
    const retryError = error as RetryError;
    if (retryError.status === undefined) {
      retryError.status = extractStatus(error) ?? undefined;
    }
    if (retryError.contentType === undefined) {
      retryError.contentType = extractContentType(error);
    }
    return retryError;
  }
  const message = toErrorMessage(error);
  const retryError = new Error(message) as RetryError;
  retryError.status = extractStatus(error) ?? undefined;
  retryError.contentType = extractContentType(error);
  return retryError;
};

const toSupabaseResultError = (result: unknown): RetryError | null => {
  if (!isRecord(result) || !("error" in result)) {
    return null;
  }
  const supabaseError = result.error;
  if (!supabaseError) {
    return null;
  }
  const retryError = toRetryError(supabaseError);
  const resultStatus = extractStatus(result);
  if (resultStatus !== null) {
    retryError.status = resultStatus;
  }
  const resultContentType = extractContentType(result);
  if (resultContentType) {
    retryError.contentType = resultContentType;
  }
  return retryError;
};

const isTransientError = (error: unknown) => {
  const message = toLower(toErrorMessage(error));
  const retryError = toRetryError(error);
  const status = retryError.status ?? null;
  const contentType = toLower(retryError.contentType ?? null);

  if (status !== null) {
    if (status === 520 || status === 429 || status >= 500) {
      return true;
    }
    // Non-retryable business/auth errors.
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  if (contentType.length > 0 && !contentType.includes("application/json")) {
    // No status: likely upstream HTML gateway/proxy glitch.
    if (status === null) {
      return true;
    }
    return false;
  }
  if (
    message.includes("520") ||
    message.includes("cloudflare") ||
    message.includes("text/html") ||
    message.includes("<html") ||
    message.includes("<!doctype html") ||
    message.includes("unexpected token <")
  ) {
    return true;
  }
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("eai_again")
  );
};

const sanitizeFinalErrorMessage = (error: RetryError) => {
  const message = toLower(toErrorMessage(error));
  const status = error.status ?? null;
  const contentType = toLower(error.contentType ?? null);
  const statusLabel = status === null ? "status=unknown" : `status=${status}`;
  const rawMessage = truncate(toErrorMessage(error), ERROR_MESSAGE_MAX);

  if (status === 520 || message.includes("cloudflare")) {
    return `Transient upstream error after retries (${statusLabel}, hint=cloudflare_520): ${rawMessage}`;
  }
  if (
    (contentType.length > 0 && !contentType.includes("application/json")) ||
    message.includes("text/html") ||
    message.includes("<html") ||
    message.includes("<!doctype html") ||
    message.includes("unexpected token <")
  ) {
    return `Unexpected non-JSON upstream response after retries (${statusLabel}, hint=html_response): ${rawMessage}`;
  }
  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("eai_again")
  ) {
    return `Transient network error after retries (${statusLabel}, hint=network): ${rawMessage}`;
  }
  return `${statusLabel}: ${rawMessage}`;
};

const withRetry = async <T>(
  operation: (attempt: number) => PromiseLike<T> | T,
  options: RetryOptions = {}
): Promise<T> => {
  const tries = Math.max(1, options.tries ?? DEFAULT_TRIES);
  const baseMs = Math.max(1, options.baseMs ?? DEFAULT_BASE_MS);
  const isRetryable = options.isTransientError ?? isTransientError;
  const label = options.label ?? "operation";

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const result = await operation(attempt);
      const resultError = toSupabaseResultError(result);
      if (resultError) {
        if (isRetryable(resultError)) {
          throw resultError;
        }
        return result;
      }
      return result;
    } catch (rawError) {
      const error = toRetryError(rawError);
      const retryable = isRetryable(error);
      const canRetry = retryable && attempt < tries;
      const delayMs = baseMs * 2 ** (attempt - 1);

      const logPayload = {
        label,
        requestId: options.requestId ?? null,
        method: options.method ?? null,
        path: options.path ?? null,
        attempt,
        tries,
        status: error.status ?? null,
        message: truncate(toErrorMessage(error))
      };

      if (canRetry) {
        console.warn("[withRetry]", {
          ...logPayload,
          delay_ms: delayMs,
          outcome: "retrying"
        });
        await sleep(delayMs);
        continue;
      }

      console.error("[withRetry]", {
        ...logPayload,
        outcome: "final_fail"
      });
      const finalError = new Error(sanitizeFinalErrorMessage(error)) as RetryError;
      finalError.status = error.status;
      finalError.contentType = error.contentType;
      throw finalError;
    }
  }

  throw new Error("Retry attempts exhausted");
};

export { withRetry, isTransientError };
export type { RetryOptions };
