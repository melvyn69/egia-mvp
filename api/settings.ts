import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createSupabaseAdmin,
  getUserFromRequest,
  getBearerToken
} from "../server/_shared_dist/google/_utils.js";
import { getRequestId } from "../server/_shared_dist/api_utils.js";

type Action =
  | "legal_entities_list"
  | "legal_entities_upsert"
  | "legal_entities_set_default"
  | "legal_entities_delete"
  | "profile_get"
  | "profile_update"
  | "profile_delete_request";

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

const getAuthUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  req: VercelRequest
) => {
  const token = getBearerToken(
    req.headers as Record<string, string | undefined>
  );
  if (!token) {
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    return null;
  }
  return data?.user ?? null;
};

const getBusinessIdForUser = async (supabaseAdmin: any, userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("business_settings")
    .select("business_id")
    .eq("user_id", userId)
    .not("business_id", "is", null)
    .maybeSingle();
  if (error || !data?.business_id) {
    return null;
  }
  return data.business_id as string;
};

const sendError = (
  res: VercelResponse,
  status: number,
  message: string,
  requestId: string,
  code = "INTERNAL"
) =>
  res.status(status).json({
    ok: false,
    error: { message, code },
    requestId
  });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const supabaseAdmin = createSupabaseAdmin();
  const auth = await getUserFromRequest(
    { headers: req.headers as Record<string, string | undefined> },
    supabaseAdmin
  );
  if (!auth.userId) {
    return sendError(res, 401, "Unauthorized", requestId, "UNAUTHORIZED");
  }

  const action = getAction(req);
  if (!action) {
    return sendError(res, 400, "Missing action", requestId, "BAD_REQUEST");
  }

  const userId = auth.userId;
  const businessId = await getBusinessIdForUser(supabaseAdmin, userId);
  if (!businessId) {
    return sendError(res, 403, "Business not found", requestId, "FORBIDDEN");
  }

  if (action === "profile_get") {
    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed", requestId, "BAD_REQUEST");
    }
    const authUser = await getAuthUser(supabaseAdmin, req);
    const email = authUser?.email ?? null;
    const provider =
      typeof authUser?.app_metadata?.provider === "string"
        ? authUser.app_metadata.provider
        : null;

    const { data: memberRow, error: memberError } = await (
      supabaseAdmin as any
    )
      .from("team_members")
      .select("first_name, last_name, role, user_id, auth_user_id")
      .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (memberError) {
      return sendError(
        res,
        500,
        "Failed to load profile",
        requestId,
        "INTERNAL"
      );
    }

    const firstName = (memberRow as any)?.first_name ?? "";
    const lastName = (memberRow as any)?.last_name ?? "";
    const role = (memberRow as any)?.role ?? null;
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    return res.status(200).json({
      ok: true,
      data: {
        full_name: fullName,
        first_name: firstName || null,
        last_name: lastName || null,
        email,
        role,
        auth_provider: provider
      },
      requestId
    });
  }

  if (action === "profile_update") {
    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", requestId, "BAD_REQUEST");
    }
    const payload = parseBody(req);
    const fullName = String(payload.full_name ?? "").trim();
    const inputFirstName = String(payload.first_name ?? "").trim();
    const inputLastName = String(payload.last_name ?? "").trim();
    let firstName = inputFirstName;
    let lastName = inputLastName;
    if (!firstName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts.shift() ?? "";
      lastName = parts.join(" ");
    }
    if (!firstName) {
      return sendError(
        res,
        400,
        "first_name is required",
        requestId,
        "BAD_REQUEST"
      );
    }

    const { data: existing, error: existingError } = await (
      supabaseAdmin as any
    )
      .from("team_members")
      .select("id")
      .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) {
      return sendError(
        res,
        500,
        "Failed to load profile",
        requestId,
        "INTERNAL"
      );
    }

    if (existing?.id) {
      const { error: updateError } = await (supabaseAdmin as any)
        .from("team_members")
        .update({
          first_name: firstName,
          last_name: lastName || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);
      if (updateError) {
        return sendError(
          res,
          500,
          "Failed to update profile",
          requestId,
          "INTERNAL"
        );
      }
    } else {
      const authUser = await getAuthUser(supabaseAdmin, req);
      const { error: insertError } = await (supabaseAdmin as any)
        .from("team_members")
        .insert({
          user_id: userId,
          auth_user_id: userId,
          first_name: firstName,
          last_name: lastName || null,
          role: "admin",
          is_active: true,
          email: authUser?.email ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      if (insertError) {
        return sendError(
          res,
          500,
          "Failed to update profile",
          requestId,
          "INTERNAL"
        );
      }
    }

    return res.status(200).json({
      ok: true,
      data: {
        full_name: [firstName, lastName].filter(Boolean).join(" ").trim(),
        first_name: firstName,
        last_name: lastName || null
      },
      requestId
    });
  }

  if (action === "profile_delete_request") {
    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", requestId, "BAD_REQUEST");
    }
    const { error: updateError } = await (supabaseAdmin as any)
      .from("team_members")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .or(
        `auth_user_id.eq.${userId},and(user_id.eq.${userId},auth_user_id.is.null)`
      );
    if (updateError) {
      return sendError(
        res,
        500,
        "Failed to request deletion",
        requestId,
        "INTERNAL"
      );
    }
    return res.status(200).json({ ok: true, data: { status: "disabled" }, requestId });
  }

  if (action === "legal_entities_list") {
    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed", requestId, "BAD_REQUEST");
    }
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .select(
        "id, business_id, is_default, company_name, legal_name, industry, siret, vat_number, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_postal_code, billing_city, billing_region, billing_country, logo_path, logo_url, created_at, updated_at"
      )
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      return sendError(
        res,
        500,
        "Failed to load legal entities",
        requestId,
        "INTERNAL"
      );
    }
    return res.status(200).json({ ok: true, data: data ?? [], requestId });
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "Method not allowed", requestId, "BAD_REQUEST");
  }

  const payload = parseBody(req);

  if (action === "legal_entities_upsert") {
    const entityId = payload?.id ? String(payload.id) : null;
    const companyName = String(payload.company_name ?? "").trim();
    if (!companyName) {
      return sendError(
        res,
        400,
        "company_name is required",
        requestId,
        "BAD_REQUEST"
      );
    }
    const row = {
      business_id: businessId,
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
        .eq("business_id", businessId)
        .select("*")
        .maybeSingle();
      if (error) {
        return sendError(
          res,
          500,
          "Failed to update legal entity",
          requestId,
          "INTERNAL"
        );
      }
      return res.status(200).json({ ok: true, data, requestId });
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
      return sendError(
        res,
        500,
        "Failed to create legal entity",
        requestId,
        "INTERNAL"
      );
    }
    return res.status(200).json({ ok: true, data, requestId });
  }

  if (action === "legal_entities_set_default") {
    const entityId = String(payload?.id ?? "").trim();
    if (!entityId) {
      return sendError(res, 400, "Missing id", requestId, "BAD_REQUEST");
    }
    const { error: unsetError } = await supabaseAdmin
      .from("legal_entities")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("is_default", true)
      .neq("id", entityId);
    if (unsetError) {
      return sendError(
        res,
        500,
        "Failed to update default entity",
        requestId,
        "INTERNAL"
      );
    }
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", entityId)
      .eq("business_id", businessId)
      .select("*")
      .maybeSingle();
    if (error) {
      return sendError(
        res,
        500,
        "Failed to set default entity",
        requestId,
        "INTERNAL"
      );
    }
    if (!data) {
      return sendError(
        res,
        404,
        "Legal entity not found",
        requestId,
        "NOT_FOUND"
      );
    }
    return res.status(200).json({ ok: true, data, requestId });
  }

  if (action === "legal_entities_delete") {
    const entityId = String(payload?.id ?? "").trim();
    if (!entityId) {
      return sendError(res, 400, "Missing id", requestId, "BAD_REQUEST");
    }
    const { data: existing, error: loadError } = await supabaseAdmin
      .from("legal_entities")
      .select("id, is_default")
      .eq("id", entityId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (loadError) {
      return sendError(
        res,
        500,
        "Failed to load legal entity",
        requestId,
        "INTERNAL"
      );
    }
    if (!existing) {
      return sendError(
        res,
        404,
        "Legal entity not found",
        requestId,
        "NOT_FOUND"
      );
    }
    if (existing.is_default) {
      const { count, error: countError } = await supabaseAdmin
        .from("legal_entities")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId);
      if (countError) {
        return sendError(
          res,
          500,
          "Failed to validate delete",
          requestId,
          "INTERNAL"
        );
      }
      if (!count || count <= 1) {
        return sendError(
          res,
          400,
          "Default entity cannot be deleted",
          requestId,
          "BAD_REQUEST"
        );
      }
    }
    const { error: deleteError } = await supabaseAdmin
      .from("legal_entities")
      .delete()
      .eq("id", entityId)
      .eq("business_id", businessId);
    if (deleteError) {
      return sendError(
        res,
        500,
        "Failed to delete legal entity",
        requestId,
        "INTERNAL"
      );
    }
    return res.status(200).json({ ok: true, data: { id: entityId }, requestId });
  }

  return sendError(res, 400, "Unsupported action", requestId, "BAD_REQUEST");
}
