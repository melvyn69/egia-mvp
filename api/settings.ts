import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createSupabaseAdmin,
  getUserFromRequest
} from "../server/_shared_dist/google/_utils.js";

type Action =
  | "legal_entities_list"
  | "legal_entities_upsert"
  | "legal_entities_set_default"
  | "legal_entities_delete";

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

const getAction = (req: VercelRequest) => {
  const actionParam = req.query.action;
  if (typeof actionParam === "string") {
    return actionParam;
  }
  if (Array.isArray(actionParam)) {
    return actionParam[0];
  }
  return null;
};

const getOrgIdForUser = async (supabaseAdmin: any, userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("org_id")
    .eq("user_id", userId)
    .not("org_id", "is", null)
    .maybeSingle();
  if (error || !data?.org_id) {
    return null;
  }
  return data.org_id as string;
};

const sendError = (
  res: VercelResponse,
  status: number,
  message: string
) => res.status(status).json({ ok: false, error: { message } });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseAdmin = createSupabaseAdmin();
  const auth = await getUserFromRequest(
    { headers: req.headers as Record<string, string | undefined> },
    supabaseAdmin
  );
  if (!auth.userId) {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const action = getAction(req);
  if (!action) {
    return sendError(res, 400, "Missing action");
  }

  const userId = auth.userId;
  const orgId = await getOrgIdForUser(supabaseAdmin, userId);
  if (!orgId) {
    return sendError(res, 403, "Organization not found");
  }

  if (action === "legal_entities_list") {
    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed");
    }
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .select(
        "id, org_id, is_default, company_name, legal_name, industry, siret, vat_number, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_postal_code, billing_city, billing_region, billing_country, logo_path, logo_url, created_at, updated_at"
      )
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      return sendError(res, 500, "Failed to load legal entities");
    }
    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed");
  }

  const payload = parseBody(req);

  if (action === "legal_entities_upsert") {
    const entityId = payload?.id ? String(payload.id) : null;
    const companyName = String(payload.company_name ?? "").trim();
    if (!companyName) {
      return sendError(res, 400, "company_name is required");
    }
    const row = {
      org_id: orgId,
      is_default: Boolean(payload.is_default),
      company_name: companyName,
      legal_name: payload.legal_name ?? null,
      industry: payload.industry ?? null,
      siret: payload.siret ?? null,
      vat_number: payload.vat_number ?? null,
      billing_email: payload.billing_email ?? null,
      billing_phone: payload.billing_phone ?? null,
      billing_address_line1: payload.billing_address_line1 ?? null,
      billing_address_line2: payload.billing_address_line2 ?? null,
      billing_postal_code: payload.billing_postal_code ?? null,
      billing_city: payload.billing_city ?? null,
      billing_region: payload.billing_region ?? null,
      billing_country: payload.billing_country ?? "FR",
      logo_path: payload.logo_path ?? null,
      logo_url: payload.logo_url ?? null,
      updated_at: new Date().toISOString()
    };

    if (entityId) {
      const { data, error } = await supabaseAdmin
        .from("legal_entities")
        .update(row)
        .eq("id", entityId)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (error) {
        return sendError(res, 500, "Failed to update legal entity");
      }
      return res.status(200).json({ ok: true, data });
    }

    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .insert({
        ...row,
        created_at: new Date().toISOString()
      })
      .select("*")
      .maybeSingle();
    if (error) {
      return sendError(res, 500, "Failed to create legal entity");
    }
    return res.status(200).json({ ok: true, data });
  }

  if (action === "legal_entities_set_default") {
    const entityId = String(payload?.id ?? "").trim();
    if (!entityId) {
      return sendError(res, 400, "Missing id");
    }
    const { error: unsetError } = await supabaseAdmin
      .from("legal_entities")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("is_default", true)
      .neq("id", entityId);
    if (unsetError) {
      return sendError(res, 500, "Failed to update default entity");
    }
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", entityId)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error) {
      return sendError(res, 500, "Failed to set default entity");
    }
    if (!data) {
      return sendError(res, 404, "Legal entity not found");
    }
    return res.status(200).json({ ok: true, data });
  }

  if (action === "legal_entities_delete") {
    const entityId = String(payload?.id ?? "").trim();
    if (!entityId) {
      return sendError(res, 400, "Missing id");
    }
    const { data: existing, error: loadError } = await supabaseAdmin
      .from("legal_entities")
      .select("id, is_default")
      .eq("id", entityId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (loadError) {
      return sendError(res, 500, "Failed to load legal entity");
    }
    if (!existing) {
      return sendError(res, 404, "Legal entity not found");
    }
    if (existing.is_default) {
      return sendError(res, 400, "Default entity cannot be deleted");
    }
    const { error: deleteError } = await supabaseAdmin
      .from("legal_entities")
      .delete()
      .eq("id", entityId)
      .eq("org_id", orgId);
    if (deleteError) {
      return sendError(res, 500, "Failed to delete legal entity");
    }
    return res.status(200).json({ ok: true, data: { id: entityId } });
  }

  return sendError(res, 400, "Unsupported action");
}
