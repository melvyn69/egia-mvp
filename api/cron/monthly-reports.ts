import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { generatePremiumReport } from "../../server/_shared/handlers/reports/generate_html";

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

const getLastMonthRange = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const periodKey = `${start.getUTCFullYear()}-${String(
    start.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  return { start, end, periodKey };
};

const respondJson = (
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>
) => res.status(status).json(payload);

const isEmail = (value: string | null | undefined) =>
  typeof value === "string" && /.+@.+\..+/.test(value);

const sendResendEmail = async (params: {
  to: string;
  from: string;
  subject: string;
  html: string;
  apiKey: string;
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
  return response.json().catch(() => ({}));
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return respondJson(res, 405, {
      ok: false,
      error: { message: "Method not allowed", code: "BAD_REQUEST" },
      requestId
    });
  }

  const expected = String(process.env.CRON_SECRET ?? "").trim();
  const provided = String(
    (req.headers["x-cron-secret"] as string | undefined) ?? ""
  ).trim();
  if (!expected || !provided || provided !== expected) {
    return respondJson(res, 403, {
      ok: false,
      error: { message: "Unauthorized", code: "FORBIDDEN" },
      requestId
    });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson(res, 500, {
      ok: false,
      error: { message: "Missing Supabase env", code: "INTERNAL" },
      requestId
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  console.log("[cron][monthly-reports]", { requestId, route: req.url });

  try {
    const { start, end, periodKey } = getLastMonthRange();
    const fromIso = start.toISOString();
    const toIso = end.toISOString();
    const batchSize = Math.max(
      1,
      Number(process.env.CRON_MONTHLY_BATCH ?? 20)
    );

    const { data: enabledRows, error: enabledError } = await supabaseAdmin
      .from("business_settings")
      .select("user_id, business_name")
      .eq("monthly_report_enabled", true)
      .not("user_id", "is", null)
      .limit(batchSize);
    if (enabledError) {
      return respondJson(res, 500, {
        ok: false,
        error: { message: "Failed to load enabled users", code: "INTERNAL" },
        requestId
      });
    }

    const emailByUser = new Map<string, string>();
    const users = (enabledRows ?? [])
      .map((row) => {
        const userId = (row as { user_id?: string | null }).user_id ?? null;
        const businessName = (row as { business_name?: string | null })
          .business_name ?? null;
        if (userId && isEmail(businessName)) {
          emailByUser.set(userId, businessName as string);
        }
        return userId;
      })
      .filter(Boolean) as string[];
    if (users.length === 0) {
      return respondJson(res, 200, {
        ok: true,
        requestId,
        period: { from: fromIso, to: toIso, key: periodKey },
        stats: { total: 0, created: 0, skipped: 1, failed: 0 },
        created: 0,
        skipped: 1,
        errors: [],
        results: [],
        skipReason: "no_candidates"
      });
    }

    const { data: locationRows, error: locationsError } = await supabaseAdmin
      .from("google_locations")
      .select("user_id, location_resource_name")
      .in("user_id", users)
      .not("location_resource_name", "is", null);
    if (locationsError) {
      return respondJson(res, 500, {
        ok: false,
        error: { message: "Failed to load locations", code: "INTERNAL" },
        requestId
      });
    }

    const locationsByUser = new Map<string, string[]>();
    for (const row of locationRows ?? []) {
      const userId = (row as { user_id?: string | null }).user_id ?? null;
      const locationId =
        (row as { location_resource_name?: string | null })
          .location_resource_name ?? null;
      if (!userId || !locationId) continue;
      const list = locationsByUser.get(userId) ?? [];
      list.push(locationId);
      locationsByUser.set(userId, list);
    }

    const resendApiKey = process.env.RESEND_API_KEY ?? "";
    const emailFrom = process.env.EMAIL_FROM ?? "";
    const appUrl = process.env.APP_URL ?? "";

    const results: Array<{
      userId: string;
      reportId?: string;
      status: "created" | "skipped" | "failed";
      createdReport?: boolean;
      rendered?: boolean;
      emailed?: boolean;
      reason?: string;
      error?: string;
    }> = [];

    for (const userId of users) {
      try {
        const existing = await supabaseAdmin
          .from("reports")
          .select("id, rendered_at, emailed_at, storage_path")
          .eq("user_id", userId)
          .eq("period_preset", "last_month")
          .eq("from_date", fromIso)
          .eq("to_date", toIso)
          .eq("render_mode", "premium")
          .maybeSingle();
        if (existing.error) {
          results.push({
            userId,
            status: "failed",
            error: existing.error.message ?? "report_lookup_failed"
          });
          continue;
        }

        const locations = locationsByUser.get(userId) ?? [];
        if (locations.length === 0) {
          results.push({
            userId,
            status: "skipped",
            reason: "no_locations"
          });
          continue;
        }

        let reportId = existing.data?.id as string | undefined;
        let renderedAt = existing.data?.rendered_at as string | null | undefined;
        let emailedAt = existing.data?.emailed_at as string | null | undefined;
        let storagePath = existing.data?.storage_path as string | null | undefined;
        let createdReport = false;

        if (!reportId) {
          const insertPayload = {
            user_id: userId,
            name: `Rapport mensuel ${periodKey}`,
            locations,
            period_preset: "last_month",
            from_date: fromIso,
            to_date: toIso,
            timezone: "Europe/Paris",
            status: "draft",
            render_mode: "premium",
            notes: null,
            updated_at: new Date().toISOString()
          };

          const { data: inserted, error: insertError } = await supabaseAdmin
            .from("reports")
            .insert(insertPayload)
            .select("id")
            .maybeSingle();
          if (insertError || !inserted?.id) {
            results.push({
              userId,
              status: "failed",
              reason: "insert_failed",
              error: insertError?.message ?? "insert_failed"
            });
            continue;
          }
          reportId = inserted.id as string;
          createdReport = true;
        }

        let rendered = Boolean(renderedAt);
        let emailed = Boolean(emailedAt);
        let resultReason: string | undefined;
        let reportUrl: string | null = null;

        if (!rendered) {
          const renderResult = await generatePremiumReport({
            supabaseAdmin,
            reportId,
            requestId
          });
          if (renderResult?.pdf?.url) {
            reportUrl = renderResult.pdf.url as string;
          }
          rendered = true;
          renderedAt = new Date().toISOString();
          await supabaseAdmin
            .from("reports")
            .update({ rendered_at: renderedAt, updated_at: renderedAt })
            .eq("id", reportId);
        }

        if (!emailed) {
          const recipient = emailByUser.get(userId) ?? null;
          if (!recipient) {
            resultReason = "no_email";
          } else if (!resendApiKey || !emailFrom) {
            resultReason = "email_not_configured";
          } else {
            if (!reportUrl) {
              if (!storagePath) {
                const { data: reportRow } = await supabaseAdmin
                  .from("reports")
                  .select("storage_path")
                  .eq("id", reportId)
                  .maybeSingle();
                storagePath = (reportRow as { storage_path?: string | null })
                  ?.storage_path;
              }
              if (storagePath) {
                const { data: signed, error: signError } = await supabaseAdmin
                  .storage
                  .from("reports")
                  .createSignedUrl(storagePath, 60 * 60);
                if (signError) {
                  throw new Error(signError.message ?? "signed_url_failed");
                }
                reportUrl = signed?.signedUrl ?? null;
              }
            }

            if (!reportUrl) {
              resultReason = "no_report_url";
            } else {
              const subject = `Votre rapport mensuel ${periodKey}`;
              const linkLabel = appUrl ? "Voir dans l'app" : "Télécharger le PDF";
              const html = `
                <p>Votre rapport mensuel est prêt.</p>
                <p><a href="${reportUrl}">${linkLabel}</a></p>
              `;
              await sendResendEmail({
                to: recipient,
                from: emailFrom,
                subject,
                html,
                apiKey: resendApiKey
              });
              emailed = true;
              emailedAt = new Date().toISOString();
              await supabaseAdmin
                .from("reports")
                .update({ emailed_at: emailedAt, updated_at: emailedAt })
                .eq("id", reportId);
            }
          }
        }

        const status =
          !rendered || !emailed
            ? createdReport
              ? "created"
              : "skipped"
            : createdReport
              ? "created"
              : "skipped";

        results.push({
          userId,
          reportId,
          status,
          createdReport,
          rendered,
          emailed,
          reason: resultReason
        });
      } catch (error) {
        results.push({
          userId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    const stats = results.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "failed") {
          acc.failed += 1;
          return acc;
        }
        if (item.createdReport) {
          acc.created += 1;
        } else {
          acc.skipped += 1;
        }
        return acc;
      },
      { total: 0, created: 0, skipped: 0, failed: 0 }
    );

    const errors = results
      .filter((item) => item.status === "failed")
      .map((item) => ({
        userId: item.userId,
        reportId: item.reportId ?? null,
        error: item.error ?? "Unknown error"
      }));

    return respondJson(res, 200, {
      ok: true,
      requestId,
      period: { from: fromIso, to: toIso, key: periodKey },
      stats,
      created: stats.created,
      skipped: stats.skipped,
      errors,
      results
    });
  } catch (error) {
    console.error("[cron][monthly-reports] fatal", error);
    return respondJson(res, 500, {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL"
      },
      requestId
    });
  }
}
