import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRequestId } from "../../api_utils.js";
import {
  consumeRateLimit,
  createOpaqueToken,
  createSupabaseAdmin,
  getBaseUrl,
  getClientIp,
  getLoyaltyEnvironment,
  hashToken,
  isEmail,
  isUuid,
  normalizeEmail,
  normalizeFirstName,
  parseBody,
  sendVerificationEmail
} from "./enrollment_common.js";

const acceptedResponse = (res: VercelResponse, requestId: string) =>
  res.status(202).json({
    ok: true,
    accepted: true,
    message:
      "Si la demande est valide, un lien de confirmation vient d'être envoyé.",
    requestId
  });

export default async function handleLoyaltyJoin(
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
  const publicToken =
    typeof body?.public_token === "string" ? body.public_token.trim() : "";
  const firstName = normalizeFirstName(body?.first_name);
  const email = normalizeEmail(body?.email);
  const honeypot =
    typeof body?.company === "string" ? body.company.trim() : "";

  if (
    !body ||
    honeypot ||
    !isUuid(publicToken) ||
    firstName.length < 1 ||
    firstName.length > 100 ||
    !isEmail(email)
  ) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Invalid request" },
      requestId
    });
  }

  const environment = getLoyaltyEnvironment();
  if (
    !environment.supabaseUrl ||
    !environment.serviceRoleKey ||
    !environment.resendApiKey ||
    !environment.emailFrom
  ) {
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
    const ip = getClientIp(req);
    const [ipAllowed, emailAllowed, programAllowed] = await Promise.all([
      consumeRateLimit({
        supabaseAdmin,
        serviceRoleKey: environment.serviceRoleKey,
        material: `loyalty-enrollment:ip:${ip}`,
        limit: 20,
        windowSeconds: 3600
      }),
      consumeRateLimit({
        supabaseAdmin,
        serviceRoleKey: environment.serviceRoleKey,
        material: `loyalty-enrollment:email:${publicToken}:${email}`,
        limit: 3,
        windowSeconds: 3600
      }),
      consumeRateLimit({
        supabaseAdmin,
        serviceRoleKey: environment.serviceRoleKey,
        material: `loyalty-enrollment:program:${publicToken}`,
        limit: 500,
        windowSeconds: 86400
      })
    ]);
    if (!ipAllowed || !emailAllowed || !programAllowed) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Try again later" },
        requestId
      });
    }

    const { data: program, error: programError } = await supabaseAdmin
      .from("loyalty_programs")
      .select("name")
      .eq("public_token", publicToken)
      .eq("is_enabled", true)
      .maybeSingle();
    if (programError || !program) {
      return acceptedResponse(res, requestId);
    }

    await supabaseAdmin
      .from("loyalty_enrollment_requests")
      .delete()
      .lt("expires_at", new Date().toISOString());
    await supabaseAdmin
      .from("loyalty_enrollment_requests")
      .delete()
      .eq("public_token", publicToken)
      .eq("email", email);

    const rawToken = createOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: insertError } = await supabaseAdmin
      .from("loyalty_enrollment_requests")
      .insert({
        public_token: publicToken,
        first_name: firstName,
        email,
        token_hash: tokenHash,
        expires_at: expiresAt
      });
    if (insertError) {
      throw new Error("enrollment_request_insert_failed");
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      await supabaseAdmin
        .from("loyalty_enrollment_requests")
        .delete()
        .eq("token_hash", tokenHash);
      throw new Error("application_url_missing");
    }

    try {
      await sendVerificationEmail({
        apiKey: environment.resendApiKey,
        from: environment.emailFrom,
        to: email,
        firstName,
        programName: String(program.name ?? "Programme fidélité"),
        verificationUrl: `${baseUrl}/loyalty/verify#token=${encodeURIComponent(rawToken)}`
      });
    } catch {
      await supabaseAdmin
        .from("loyalty_enrollment_requests")
        .delete()
        .eq("token_hash", tokenHash);
      throw new Error("verification_email_failed");
    }

    return acceptedResponse(res, requestId);
  } catch (error) {
    console.error("[loyalty/join]", {
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
