import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../server/_shared_dist/_auth.js";

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId: authUserId, supabaseAdmin } = auth;

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
}
