import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleGbpSync from "../../server/_shared/handlers/google/gbp/sync";
import handleGbpReviewsSync from "../../server/_shared/handlers/google/gbp/reviews/sync";
import handleOAuthStart from "../../server/_shared/handlers/google/oauth/start";
import handleOAuthCallback from "../../server/_shared/handlers/google/oauth/callback";
import handleReply from "../../server/_shared/handlers/google/reply";
import { createProductionSafeConsole } from "../../server/_shared/safe_console";

const console = createProductionSafeConsole("/api/google");

const GOOGLE_ROUTES = {
  "gbp/sync": handleGbpSync,
  "gbp/reviews/sync": handleGbpReviewsSync,
  "oauth/start": handleOAuthStart,
  "oauth/callback": handleOAuthCallback,
  reply: handleReply
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

  const pathname = new URL(req.url ?? "/api/google", "http://localhost").pathname;
  return pathname
    .replace(/^\/api\/google\/?/, "")
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
  return `google-${Date.now()}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const parts = getRouteParts(req);
  const routeKey = parts.join("/");

  console.log("[api/google]", {
    method: req.method ?? "GET",
    path: new URL(req.url ?? "/api/google", "http://localhost").pathname,
    parts,
    routeKey,
    requestId
  });

  const routeHandler = GOOGLE_ROUTES[routeKey as keyof typeof GOOGLE_ROUTES];
  if (routeHandler) {
    return routeHandler(req, res);
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
