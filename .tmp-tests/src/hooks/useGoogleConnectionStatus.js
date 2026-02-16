"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGoogleConnectionStatus = exports.mapGoogleConnectionStatus = exports.formatGoogleConnectionReason = void 0;
const react_1 = require("react");
const isGoogleConnectionStatus = (value) => value === "disconnected" ||
    value === "connected" ||
    value === "reauth_required" ||
    value === "unknown";
const isGoogleConnectionReason = (value) => value === "ok" ||
    value === "token_revoked" ||
    value === "missing_refresh_token" ||
    value === "expired" ||
    value === "unknown" ||
    value === "no_connection";
const formatGoogleConnectionReason = (reason) => {
    if (reason === "token_revoked") {
        return "Connexion Google expirée : merci de reconnecter.";
    }
    if (reason === "missing_refresh_token") {
        return "Autorisation incomplète : reconnecte Google.";
    }
    if (reason === "expired") {
        return "Access token expiré : renouvellement automatique possible.";
    }
    if (reason === "no_connection")
        return "Aucune connexion Google";
    if (reason === "ok")
        return "Connexion valide";
    return "Raison inconnue";
};
exports.formatGoogleConnectionReason = formatGoogleConnectionReason;
const extractErrorMessage = (payload) => {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const data = payload;
    if (typeof data.error === "string") {
        return data.error;
    }
    if (data.error &&
        typeof data.error === "object" &&
        typeof data.error.message === "string") {
        return data.error.message;
    }
    if (data.connection &&
        typeof data.connection.lastError === "string" &&
        data.connection.lastError.trim().length > 0) {
        return data.connection.lastError;
    }
    return null;
};
const mapGoogleConnectionStatus = (httpStatus, payload) => {
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
    const data = payload;
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
        lastCheckedAt: data.connection?.last_checked_at ?? data.connection?.lastCheckedAt ?? undefined
    };
};
exports.mapGoogleConnectionStatus = mapGoogleConnectionStatus;
const useGoogleConnectionStatus = (session) => {
    const [status, setStatus] = (0, react_1.useState)("unknown");
    const [reason, setReason] = (0, react_1.useState)("unknown");
    const [expiresAt, setExpiresAt] = (0, react_1.useState)(undefined);
    const [userId, setUserId] = (0, react_1.useState)(undefined);
    const [lastError, setLastError] = (0, react_1.useState)(undefined);
    const [lastCheckedAt, setLastCheckedAt] = (0, react_1.useState)(undefined);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const refresh = (0, react_1.useCallback)(async () => {
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
            const mapped = (0, exports.mapGoogleConnectionStatus)(response.status, payload);
            setStatus(mapped.status);
            setReason(mapped.reason);
            setExpiresAt(mapped.expiresAt);
            setUserId(mapped.userId);
            setLastError(mapped.lastError);
            setLastCheckedAt(mapped.lastCheckedAt);
        }
        catch (error) {
            setStatus("unknown");
            setReason("unknown");
            setExpiresAt(undefined);
            setUserId(undefined);
            setLastError(error instanceof Error ? error.message : "network_error");
            setLastCheckedAt(undefined);
        }
        finally {
            setIsLoading(false);
        }
    }, [session?.access_token]);
    (0, react_1.useEffect)(() => {
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
exports.useGoogleConnectionStatus = useGoogleConnectionStatus;
