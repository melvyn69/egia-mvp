import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { createSupabaseAdmin } from '../_shared/google/_utils.js';

const getRequestId = (req: VercelRequest) => {
  const header = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
  if (Array.isArray(header)) {
    return header[0] ?? randomUUID();
  }
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return randomUUID();
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestId = getRequestId(req);
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("google_reviews")
      .select("id", { count: "exact", head: true });
    if (error) {
      console.error("[health-reviews] query error", {
        requestId,
        message: error.message
      });
      return res.status(500).json({ error: "Internal server error", requestId });
    }
    return res.status(200).json({ ok: true, requestId });
  } catch (err) {
    const missingEnv =
      err instanceof Error && err.message === "Missing SUPABASE env vars";
    console.error("[health-reviews] error", {
      requestId,
      reason: missingEnv ? "missing_env" : undefined,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null
      }
    });
    return res.status(500).json({
      error: "Internal server error",
      requestId,
      reason: missingEnv ? "missing_env" : undefined
    });
  }
}
