import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleAiTagReviews from "../../server/_shared/handlers/cron/ai/tag-reviews";
import handleGoogleSyncReplies from "../../server/_shared/handlers/cron/google/sync-replies";
import handleMonthlyReports from "../../server/_shared/handlers/cron/monthly-reports-api";

const getRouteParts = (req: VercelRequest) => {
  const query = req.query as Record<string, unknown>;
  const raw = query?.["...slug"] ?? query?.slug ?? query?.["slug[]"];
  const parts = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map(String)
    .flatMap((part) => part.split("/"))
    .filter((part) => part.length > 0);

  if (parts.length > 0) {
    return parts;
  }

  const pathname = new URL(req.url ?? "/api/cron", "http://localhost").pathname;
  return pathname
    .replace(/^\/api\/cron\/?/, "")
    .split("/")
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

  console.log("[api/cron]", {
    method: req.method ?? "GET",
    url: req.url ?? null,
    parts,
    requestId
  });

  if (parts.length === 2 && parts[0] === "ai" && parts[1] === "tag-reviews") {
    return handleAiTagReviews(req, res);
  }

  if (
    parts.length === 2 &&
    parts[0] === "google" &&
    parts[1] === "sync-replies"
  ) {
    return handleGoogleSyncReplies(req, res);
  }

  if (parts.length === 1 && parts[0] === "monthly-reports") {
    return handleMonthlyReports(req, res);
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
