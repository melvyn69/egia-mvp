import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";
import { requireUser } from "../../server/_shared_dist/_auth.js";

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getBaseUrl = (req: VercelRequest) => {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = req.headers.host ?? "";
  return host ? `${proto}://${host}` : "";
};

const sendResendEmail = async (params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${text.slice(0, 200)}`);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId: ownerUserId, supabaseAdmin } = auth;

  const payload = parseBody(req);
  const firstName = String(payload.first_name ?? "").trim() || null;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "editor");
  const receiveMonthly = Boolean(payload.receive_monthly_reports);

  if (!email || !isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("team_invitations")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) {
    return res.status(500).json({ error: "Failed to load invitation" });
  }

  if (existing?.id) {
    const { error: updateError } = await supabaseAdmin
      .from("team_invitations")
      .update({
        token,
        expires_at: expiresAt,
        first_name: firstName,
        role,
        receive_monthly_reports: receiveMonthly,
        invited_by: ownerUserId,
        updated_at: nowIso
      })
      .eq("id", existing.id);
    if (updateError) {
      return res.status(500).json({ error: "Failed to refresh invitation" });
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("team_invitations")
      .insert({
        owner_user_id: ownerUserId,
        invited_by: ownerUserId,
        email,
        first_name: firstName,
        role,
        receive_monthly_reports: receiveMonthly,
        token,
        status: "pending",
        created_at: nowIso,
        updated_at: nowIso,
        expires_at: expiresAt
      });
    if (insertError) {
      return res.status(500).json({ error: "Failed to create invitation" });
    }
  }

  const resendKey = process.env.RESEND_API_KEY ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? "";
  if (!resendKey || !emailFrom) {
    return res.status(500).json({ error: "Missing email configuration" });
  }

  const baseUrl = getBaseUrl(req);
  const inviteUrl = baseUrl ? `${baseUrl}/invite?token=${token}` : "";
  const hello = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const html = `
    <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7fb;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e9ebf3;">
        <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#111827;">
          Invitation a rejoindre EGIA
        </h1>
        <p style="margin:0 0 12px 0;color:#111827;font-size:14px;line-height:1.6;">
          ${hello}
        </p>
        <p style="margin:0 0 16px 0;color:#111827;font-size:14px;line-height:1.6;">
          Vous avez ete invite a rejoindre EGIA. Cliquez sur le bouton ci-dessous pour accepter.
        </p>
        <a href="${inviteUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;">
          Accepter l'invitation
        </a>
      </div>
    </div>
  `;

  try {
    await sendResendEmail({
      apiKey: resendKey,
      from: emailFrom,
      to: email,
      subject: "Invitation a rejoindre EGIA",
      html
    });
  } catch (error) {
    console.error("[team/invite] resend_failed", {
      ownerUserId,
      email,
      err: String(error)
    });
    return res.status(200).json({
      ok: true,
      emailSent: false,
      warning: error instanceof Error ? error.message : "Email send failed"
    });
  }

  return res.status(200).json({ ok: true, emailSent: true });
}
