import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleTagReviews from "../../server/_shared_dist/handlers/cron/ai/tag-reviews.js";
import handleSyncReplies from "../../server/_shared_dist/handlers/cron/google/sync-replies.js";

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
  if (route === "ai/tag-reviews") {
    return handleTagReviews(req, res);
  }
  if (route === "google/sync-replies") {
    return handleSyncReplies(req, res);
  }
  return res.status(404).json({ error: "Not found" });
}
