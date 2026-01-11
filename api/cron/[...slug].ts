import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleAiTagReviews from "../../server/cron/ai/tag-reviews.js";
import handleSyncReplies from "../../server/cron/google/sync-replies.js";

const routeCron = async (req: VercelRequest, res: VercelResponse) => {
  const slugParam = req.query?.slug;
  const parts = Array.isArray(slugParam)
    ? slugParam
    : slugParam
    ? [slugParam]
    : [];
  const route = parts.join("/");

  if (route === "ai/tag-reviews") {
    return handleAiTagReviews(req, res);
  }
  if (route === "google/sync-replies") {
    return handleSyncReplies(req, res);
  }

  return res.status(404).json({ error: "Not found" });
};

export default routeCron;
