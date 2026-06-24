import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleGbpSync from "../../server/_shared/handlers/google/gbp/sync";
import handleGbpReviewsSync from "../../server/_shared/handlers/google/gbp/reviews/sync";
import handleOAuthStart from "../../server/_shared/handlers/google/oauth/start";
import handleOAuthCallback from "../../server/_shared/handlers/google/oauth/callback";
import handleReply from "../../server/_shared/handlers/google/reply";

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

  const pathname = new URL(req.url ?? "/api/google", "http://localhost").pathname;
  return pathname
    .replace(/^\/api\/google\/?/, "")
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
  return `google-${Date.now()}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const parts = getRouteParts(req);

  console.log("[api/google]", {
    method: req.method ?? "GET",
    url: req.url ?? null,
    parts,
    requestId
  });

  if (parts.length === 2 && parts[0] === "gbp" && parts[1] === "sync") {
    return handleGbpSync(req, res);
  }

  if (
    parts.length === 3 &&
    parts[0] === "gbp" &&
    parts[1] === "reviews" &&
    parts[2] === "sync"
  ) {
    return handleGbpReviewsSync(req, res);
  }

  if (parts.length === 2 && parts[0] === "oauth" && parts[1] === "start") {
    return handleOAuthStart(req, res);
  }

  if (parts.length === 2 && parts[0] === "oauth" && parts[1] === "callback") {
    return handleOAuthCallback(req, res);
  }

  if (parts.length === 1 && parts[0] === "reply") {
    return handleReply(req, res);
  }

  return res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Google API route not found"
    },
    requestId
  });
}
