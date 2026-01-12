import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleSync from "../../../server/_shared_dist/handlers/google/gbp/sync.js";
import handleReviewsSync from "../../../server/_shared_dist/handlers/google/gbp/reviews/sync.js";

const getRouteParts = (req: VercelRequest) => {
  const raw =
    (req.query as Record<string, unknown>)?.["...slug"] ??
    (req.query as Record<string, unknown>)?.slug ??
    (req.query as Record<string, unknown>)?.["slug[]"];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map(String);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRouteParts(req).join("/");
  if (route === "sync") {
    return handleSync(req, res);
  }
  if (route === "reviews/sync") {
    return handleReviewsSync(req, res);
  }
  return res.status(404).json({ error: "Not found" });
}
