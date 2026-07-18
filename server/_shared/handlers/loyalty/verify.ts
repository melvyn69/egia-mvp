import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId } from "../../api_utils.js";
import {
  consumeRateLimit,
  createSupabaseAdmin,
  getClientIp,
  getLoyaltyEnvironment,
  getSyntheticRateLimitPrefix,
  hashToken,
  parseBody
} from "./enrollment_common.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export default async function handleLoyaltyVerify(
  req: VercelRequest,
  res: VercelResponse
) {
  const requestId = getRequestId(req);
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
      requestId
    });
  }

  const body = parseBody(req);
  const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
  if (!TOKEN_PATTERN.test(rawToken)) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_TOKEN", message: "Invalid or expired link" },
      requestId
    });
  }

  const environment = getLoyaltyEnvironment();
  if (!environment.supabaseUrl || !environment.serviceRoleKey) {
    return res.status(503).json({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Service unavailable" },
      requestId
    });
  }
  const supabaseAdmin = createSupabaseAdmin(
    environment.supabaseUrl,
    environment.serviceRoleKey
  );

  try {
    const syntheticPrefix = await getSyntheticRateLimitPrefix({ req, supabaseAdmin });
    const allowed = await consumeRateLimit({
      supabaseAdmin,
      serviceRoleKey: environment.serviceRoleKey,
      material: syntheticPrefix ? undefined : `loyalty-verification:ip:${getClientIp(req)}`,
      syntheticBucketKey: syntheticPrefix ? `${syntheticPrefix}:loyalty:verification` : undefined,
      limit: 30,
      windowSeconds: 3600
    });
    if (!allowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Try again later" },
        requestId
      });
    }

    const tokenHash = hashToken(rawToken);
    const { data, error } = await supabaseAdmin.rpc(
      "finalize_loyalty_enrollment",
      { p_token_hash: tokenHash }
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      return res.status(410).json({
        ok: false,
        error: { code: "INVALID_TOKEN", message: "Invalid or expired link" },
        requestId
      });
    }
    return res.status(200).json({ ok: true, data: row, requestId });
  } catch (error) {
    console.error("[loyalty/verify]", {
      requestId,
      code: error instanceof Error ? error.message : "unknown_error"
    });
    return res.status(503).json({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Service unavailable" },
      requestId
    });
  }
}
