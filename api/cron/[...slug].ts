import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleAiTagReviews from "../../server/_shared/handlers/cron/ai/tag-reviews";
import handleGoogleSyncReplies from "../../server/_shared/handlers/cron/google/sync-replies";
import handleMonthlyReports from "../../server/_shared/handlers/cron/monthly-reports-api";

const CRON_ROUTES = {
  "ai/tag-reviews": handleAiTagReviews,
  "google/sync-replies": handleGoogleSyncReplies,
  "monthly-reports": handleMonthlyReports
} as const;

const safeDecodeRoutePart = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const splitRouteParts = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .map(String)
    .flatMap((part) => part.split("/"))
    .map((part) => safeDecodeRoutePart(part).trim())
    .filter((part) => part.length > 0 && part !== "[...slug]");
};

const getRouteParts = (req: VercelRequest) => {
  const query = req.query as Record<string, unknown>;
  const parts = [
    ...splitRouteParts(query?.slug),
    ...splitRouteParts(query?.["...slug"]),
    ...splitRouteParts(query?.["slug[]"])
  ];

  if (parts.length > 0) {
    return parts;
  }

  const pathname = new URL(req.url ?? "/api/cron", "http://localhost").pathname;
  return pathname
    .replace(/^\/api\/cron\/?/, "")
    .split("/")
    .map((part) => safeDecodeRoutePart(part).trim())
    .filter((part) => part.length > 0);
};

const getRequestId = (req: VercelRequest) => {
  const value = req.headers["x-request-id"];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && value[0]) {
    return value[0];
  }
  return `cron-${Date.now()}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const parts = getRouteParts(req);
  const routeKey = parts.join("/");

  console.log("[api/cron]", {
    method: req.method ?? "GET",
    url: req.url ?? null,
    parts,
    routeKey,
    requestId
  });

  const routeHandler = CRON_ROUTES[routeKey as keyof typeof CRON_ROUTES];
  if (routeHandler) {
    return routeHandler(req, res);
  }

  return res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Cron API route not found"
    },
    requestId
  });
}
