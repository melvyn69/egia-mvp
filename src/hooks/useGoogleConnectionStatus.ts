import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

export type GoogleConnectionStatus =
  | "disconnected"
  | "connected"
  | "reauth_required"
  | "unknown";

export type GoogleConnectionReason =
  | "ok"
  | "token_revoked"
  | "missing_refresh_token"
  | "expired"
  | "unknown"
  | "no_connection";

type GoogleConnectionStatusResult = {
  status: GoogleConnectionStatus;
  reason: GoogleConnectionReason;
  expiresAt?: string;
  userId?: string;
  lastError?: string;
  lastCheckedAt?: string;
};

type GoogleConnectionPayload = {
  connection?: {
    status?: string;
    reason?: string;
    expiresAt?: string | null;
    userId?: string;
    lastError?: string | null;
    last_checked_at?: string | null;
    lastCheckedAt?: string | null;
  };
  error?: string | { message?: string };
};

const isGoogleConnectionStatus = (value: unknown): value is GoogleConnectionStatus =>
  value === "disconnected" ||
  value === "connected" ||
  value === "reauth_required" ||
  value === "unknown";

const isGoogleConnectionReason = (value: unknown): value is GoogleConnectionReason =>
  value === "ok" ||
  value === "token_revoked" ||
  value === "missing_refresh_token" ||
  value === "expired" ||
  value === "unknown" ||
  value === "no_connection";

export const formatGoogleConnectionReason = (
  reason: GoogleConnectionReason
): string => {
  if (reason === "token_revoked") {
    return "Connexion Google expirée : merci de reconnecter.";
  }
  if (reason === "missing_refresh_token") {
    return "Autorisation incomplète : reconnecte Google.";
  }
  if (reason === "expired") {
    return "Access token expiré : renouvellement automatique possible.";
  }
  if (reason === "no_connection") return "Aucune connexion Google";
  if (reason === "ok") return "Connexion valide";
  return "Raison inconnue";
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as GoogleConnectionPayload;
  if (typeof data.error === "string") {
    return data.error;
  }
  if (
    data.error &&
    typeof data.error === "object" &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }
  if (
    data.connection &&
    typeof data.connection.lastError === "string" &&
    data.connection.lastError.trim().length > 0
  ) {
    return data.connection.lastError;
  }
  return null;
};

export const mapGoogleConnectionStatus = (
  httpStatus: number,
  payload: unknown
): GoogleConnectionStatusResult => {
  if (httpStatus === 404) {
    return { status: "disconnected", reason: "no_connection" };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "unknown",
      reason: "unknown",
      lastError: extractErrorMessage(payload) ?? "unauthorized"
    };
  }

  if (httpStatus >= 400) {
    return {
      status: "unknown",
      reason: "unknown",
      lastError: extractErrorMessage(payload) ?? "request_failed"
    };
  }

  if (!payload || typeof payload !== "object") {
    return { status: "unknown", reason: "unknown" };
  }

  const data = payload as GoogleConnectionPayload;
  const status = data.connection?.status;

  if (!isGoogleConnectionStatus(status)) {
    return {
      status: "unknown",
      reason: "unknown",
      lastError: extractErrorMessage(payload) ?? undefined
    };
  }

  const reason = isGoogleConnectionReason(data.connection?.reason)
    ? data.connection.reason
    : "unknown";

  return {
    status,
    reason,
    expiresAt: data.connection?.expiresAt ?? undefined,
    userId: data.connection?.userId ?? undefined,
    lastError: data.connection?.lastError ?? undefined,
    lastCheckedAt:
      data.connection?.last_checked_at ?? data.connection?.lastCheckedAt ?? undefined
  };
};

export const useGoogleConnectionStatus = (session: Session | null) => {
  const [status, setStatus] = useState<GoogleConnectionStatus>("unknown");
  const [reason, setReason] = useState<GoogleConnectionReason>("unknown");
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setStatus("unknown");
      setReason("unknown");
      setExpiresAt(undefined);
      setUserId(undefined);
      setLastError(undefined);
      setLastCheckedAt(undefined);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/google/gbp/sync?connection_only=1", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const payload = await response.json().catch(() => null);
      const mapped = mapGoogleConnectionStatus(response.status, payload);
      setStatus(mapped.status);
      setReason(mapped.reason);
      setExpiresAt(mapped.expiresAt);
      setUserId(mapped.userId);
      setLastError(mapped.lastError);
      setLastCheckedAt(mapped.lastCheckedAt);
    } catch (error) {
      setStatus("unknown");
      setReason("unknown");
      setExpiresAt(undefined);
      setUserId(undefined);
      setLastError(error instanceof Error ? error.message : "network_error");
      setLastCheckedAt(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    status,
    reason,
    expiresAt,
    userId,
    lastError,
    lastCheckedAt,
    isLoading,
    refresh
  };
};
