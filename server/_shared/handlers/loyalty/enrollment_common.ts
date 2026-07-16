import type { VercelRequest } from "@vercel/node";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const getLoyaltyEnvironment = () => {
  const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const serviceRoleKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  const resendApiKey = getEnv(["RESEND_API_KEY"]);
  const emailFrom = getEnv(["EMAIL_FROM"]);
  return { supabaseUrl, serviceRoleKey, resendApiKey, emailFrom };
};

const createSupabaseAdmin = (supabaseUrl: string, serviceRoleKey: string) =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

const parseBody = (req: VercelRequest): Record<string, unknown> | null => {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    try {
      return Buffer.byteLength(JSON.stringify(body), "utf8") <= 16 * 1024
        ? (body as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof body !== "string" || body.length > 16 * 1024) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeFirstName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const isEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const getClientIp = (req: VercelRequest) => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || "unknown";
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const createOpaqueToken = () => randomBytes(32).toString("base64url");

const createBucketKey = (serviceRoleKey: string, material: string) =>
  createHmac("sha256", serviceRoleKey).update(material).digest("hex");

const consumeRateLimit = async (params: {
  supabaseAdmin: AdminClient;
  serviceRoleKey: string;
  material: string;
  limit: number;
  windowSeconds: number;
}) => {
  const { data, error } = await params.supabaseAdmin.rpc(
    "consume_security_rate_limit",
    {
      p_bucket_key: createBucketKey(params.serviceRoleKey, params.material),
      p_limit: params.limit,
      p_window_seconds: params.windowSeconds,
      p_cost: 1
    }
  );
  if (error) {
    throw new Error("rate_limit_unavailable");
  }
  return data === true;
};

const getBaseUrl = () => {
  const configured = getEnv([
    "APP_URL",
    "APP_BASE_URL",
    "VITE_APP_BASE_URL",
    "VERCEL_PROJECT_PRODUCTION_URL"
  ]);
  if (configured) {
    const withProtocol = configured.startsWith("http")
      ? configured
      : `https://${configured}`;
    return new URL(withProtocol).origin;
  }
  return "";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendVerificationEmail = async (params: {
  apiKey: string;
  from: string;
  to: string;
  firstName: string;
  programName: string;
  verificationUrl: string;
}) => {
  const hello = params.firstName
    ? `Bonjour ${escapeHtml(params.firstName)},`
    : "Bonjour,";
  const programName = escapeHtml(params.programName || "Programme fidélité");
  const verificationUrl = escapeHtml(params.verificationUrl);
  const html = `
    <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7fb;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e9ebf3;">
        <p style="margin:0 0 12px;color:#111827;font-size:14px;line-height:1.6;">${hello}</p>
        <h1 style="margin:0 0 12px;color:#111827;font-size:21px;line-height:1.35;">
          Confirmez votre adresse e-mail
        </h1>
        <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.65;">
          Confirmez cette adresse pour poursuivre votre accès au programme
          « ${programName} ». Aucune carte ni capacité fidélité n'est délivrée
          avant cette vérification.
        </p>
        <a href="${verificationUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;">
          Confirmer mon e-mail
        </a>
        <p style="margin:18px 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
          Ce lien est personnel, à usage unique et expire dans 15 minutes.
          Si vous n'avez pas demandé cet accès, ignorez cet e-mail.
        </p>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: "Confirmez votre accès fidélité EGIA",
      html
    })
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`email_send_failed_${response.status}`);
  }
};

export {
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
};
