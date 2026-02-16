import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleSync from "../../../server/_shared/handlers/google/gbp/sync";
import handleReviewsSync from "../../../server/_shared/handlers/google/gbp/reviews/sync";

const getRouteParts = (req: VercelRequest) => {
  const raw =
    (req.query as Record<string, unknown>)?.["...slug"] ??
    (req.query as Record<string, unknown>)?.slug ??
    (req.query as Record<string, unknown>)?.["slug[]"];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts
    .map(String)
    .flatMap((part) => part.split("/"))
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
  return `gbp-${Date.now()}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const slugNormalized = getRouteParts(req);
  console.log("[api/google/gbp]", {
    method: req.method ?? "GET",
    url: req.url ?? null,
    slugNormalized,
    requestId
  });

  if (slugNormalized.length === 1 && slugNormalized[0] === "sync") {
    return handleSync(req, res);
  }
  if (
    slugNormalized.length === 2 &&
    slugNormalized[0] === "reviews" &&
    slugNormalized[1] === "sync"
  ) {
    return handleReviewsSync(req, res);
  }
  return res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    },
    requestId
  });
}
