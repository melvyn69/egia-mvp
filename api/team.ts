import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomBytes } from "crypto";
import { requireUser } from "../server/_shared_dist/_auth.js";

type Action = "invite" | "accept" | "resend" | "cancel";

const parseBody = (req: VercelRequest) => {
  if (typeof req.body !== "string") {
    return req.body ?? {};
  }
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getBaseUrl = () => {
  const configured =
    process.env.APP_URL?.trim() ?? process.env.APP_BASE_URL?.trim() ?? "";
  if (!configured) return "";
  try {
    const url = new URL(
      configured.startsWith("http") ? configured : `https://${configured}`
    );
    return url.origin;
  } catch {
    return "";
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const consumeInvitationRateLimit = async (params: {
  supabaseAdmin: any;
  ownerUserId: string;
  email: string;
}) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!serviceRoleKey) {
    throw new Error("rate_limit_unavailable");
  }
  const bucket = (material: string) =>
    createHmac("sha256", serviceRoleKey).update(material).digest("hex");
  const requests = [
    {
      p_bucket_key: bucket(`team-invite:owner:${params.ownerUserId}`),
      p_limit: 30,
      p_window_seconds: 3600,
      p_cost: 1
    },
    {
      p_bucket_key: bucket(
        `team-invite:owner-email:${params.ownerUserId}:${params.email}`
      ),
      p_limit: 5,
      p_window_seconds: 3600,
      p_cost: 1
    },
    {
      p_bucket_key: bucket(`team-invite:email:${params.email}`),
      p_limit: 10,
      p_window_seconds: 86400,
      p_cost: 1
    }
  ];
  const results = await Promise.all(
    requests.map((args) =>
      params.supabaseAdmin.rpc("consume_security_rate_limit", args)
    )
  );
  if (results.some((result) => result.error)) {
    throw new Error("rate_limit_unavailable");
  }
  return results.every((result) => result.data === true);
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
    await response.body?.cancel();
    throw new Error(`Resend request failed (${response.status})`);
  }
};

const handleInvite = async (
  req: VercelRequest,
  res: VercelResponse,
  ownerUserId: string,
  supabaseAdmin: any
) => {
  const payload = parseBody(req);
  const firstNameValue = String(payload.first_name ?? "").trim();
  const firstName = firstNameValue || null;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const role = String(payload.role ?? "editor");
  const receiveMonthly = Boolean(payload.receive_monthly_reports);

  if (
    firstNameValue.length > 100 ||
    !email ||
    email.length > 320 ||
    !isEmail(email) ||
    !["admin", "editor"].includes(role)
  ) {
    return res.status(400).json({ error: "Invalid invitation" });
  }

  const resendKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const emailFrom = process.env.EMAIL_FROM?.trim() ?? "";
  const baseUrl = getBaseUrl();
  if (!resendKey || !emailFrom || !baseUrl) {
    return res.status(503).json({ error: "Service unavailable" });
  }

  try {
    const quotaAllowed = await consumeInvitationRateLimit({
      supabaseAdmin,
      ownerUserId,
      email
    });
    if (!quotaAllowed) {
      return res.status(429).json({ error: "Try again later" });
    }
  } catch {
    return res.status(503).json({ error: "Service unavailable" });
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

  const inviteUrl = new URL(
    `/invite?token=${encodeURIComponent(token)}`,
    baseUrl
  ).toString();
  const hello = firstName
    ? `Bonjour ${escapeHtml(firstName)},`
    : "Bonjour,";
  const safeInviteUrl = escapeHtml(inviteUrl);
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
        <a href="${safeInviteUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;">
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
      error: error instanceof Error ? error.name : "unknown"
    });
    return res.status(200).json({
      ok: true,
      emailSent: false,
      warning: "Email send failed"
    });
  }

  return res.status(200).json({ ok: true, emailSent: true });
};

const handleAccept = async (
  req: VercelRequest,
  res: VercelResponse,
  authUserId: string,
  authUserEmail: string | null,
  supabaseAdmin: any
) => {
  const payload = parseBody(req);
  const token = String(payload.token ?? "").trim();
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const now = new Date();
  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from("team_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError || !invitation) {
    return res.status(404).json({ error: "Invitation not found" });
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < now) {
    return res.status(410).json({ error: "Invitation expired" });
  }

  const ownerUserId = invitation.owner_user_id as string;
  const email = invitation.email as string;
  if (!authUserEmail || authUserEmail !== email.trim().toLowerCase()) {
    return res.status(403).json({ error: "Invitation belongs to another email" });
  }
  const firstName = invitation.first_name as string | null;
  const role = invitation.role as string | null;
  const receiveMonthly = Boolean(invitation.receive_monthly_reports);

  const { data: existingMember } = await supabaseAdmin
    .from("team_members")
    .select("id, first_name")
    .eq("user_id", ownerUserId)
    .eq("email", email)
    .maybeSingle();

  const nowIso = now.toISOString();
  if (existingMember?.id) {
    const nextFirstName =
      existingMember.first_name && existingMember.first_name.trim().length > 0
        ? existingMember.first_name
        : firstName;
    const { error: updateError } = await supabaseAdmin
      .from("team_members")
      .update({
        first_name: nextFirstName,
        role,
        is_active: true,
        receive_monthly_reports: receiveMonthly,
        auth_user_id: authUserId,
        updated_at: nowIso
      })
      .eq("id", existingMember.id);
    if (updateError) {
      return res.status(500).json({ error: "Failed to update member" });
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("team_members")
      .insert({
        user_id: ownerUserId,
        auth_user_id: authUserId,
        first_name: firstName ?? "",
        email,
        role,
        is_active: true,
        receive_monthly_reports: receiveMonthly,
        created_at: nowIso,
        updated_at: nowIso
      });
    if (insertError) {
      return res.status(500).json({ error: "Failed to add member" });
    }
  }

  const { error: updateInviteError } = await supabaseAdmin
    .from("team_invitations")
    .update({
      status: "accepted",
      accepted_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", invitation.id);
  if (updateInviteError) {
    return res.status(500).json({ error: "Failed to update invitation" });
  }

  return res.status(200).json({ ok: true });
};

const handleCancel = async (
  req: VercelRequest,
  res: VercelResponse,
  ownerUserId: string,
  supabaseAdmin: any
) => {
  const payload = parseBody(req);
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("team_invitations")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("owner_user_id", ownerUserId)
    .eq("email", email)
    .eq("status", "pending");
  if (error) {
    return res.status(500).json({ error: "Failed to cancel invitation" });
  }
  return res.status(200).json({ ok: true });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId, userEmail, supabaseAdmin } = auth;

  const payload = parseBody(req);
  const action = String(payload.action ?? "").trim() as Action;

  if (!action) {
    return res.status(400).json({ error: "Missing action" });
  }

  if (action === "invite" || action === "resend") {
    return handleInvite(req, res, userId, supabaseAdmin);
  }
  if (action === "accept") {
    return handleAccept(req, res, userId, userEmail, supabaseAdmin);
  }
  if (action === "cancel") {
    return handleCancel(req, res, userId, supabaseAdmin);
  }

  return res.status(400).json({ error: "Unsupported action" });
}
