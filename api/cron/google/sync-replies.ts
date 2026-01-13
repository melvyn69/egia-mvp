import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as mod from "../../../server/_shared/handlers/cron/google/sync-replies";

const fn: unknown =
  (mod as { default?: unknown }).default ??
  (mod as { handler?: unknown }).handler ??
  (mod as { main?: unknown }).main;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (typeof fn !== "function") {
    return res
      .status(500)
      .json({ ok: false, error: "Cron handler export not found" });
  }
  return fn(req, res);
}
