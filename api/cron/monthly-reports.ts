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

const formatPeriodLabel = (date: Date) => {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 7);
  }
};

const respondJson = (
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>
) => res.status(status).json(payload);

const isEmail = (value: string | null | undefined) =>
  typeof value === "string" && /.+@.+\..+/.test(value);

const toBase64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

const fetchPdfAsBase64 = async (pdfUrl: string) => {
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`PDF fetch failed: ${response.status}`);
  }
  const ab = await response.arrayBuffer();
  return toBase64(ab);
};

const buildMonthlyReportEmailHtml = (opts: {
  firstName?: string | null;
  periodLabel: string;
}) => {
  const name = (opts.firstName ?? "").trim();
  const hello = name ? `Bonjour ${name},` : "Bonjour,";

  return `
  <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7fb;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e9ebf3;">
      <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#111827;">
        Rapport mensuel EGIA – ${opts.periodLabel}
      </h1>
      <p style="margin:0 0 14px 0;color:#111827;font-size:14px;line-height:1.6;">
        ${hello}
      </p>
      <p style="margin:0 0 14px 0;color:#111827;font-size:14px;line-height:1.6;">
        Votre rapport mensuel EGIA pour la période ${opts.periodLabel} est maintenant disponible.
      </p>
      <p style="margin:0 0 12px 0;color:#111827;font-size:14px;line-height:1.6;">
        Vous y trouverez :<br/>
        • l’analyse de vos avis clients<br/>
        • les indicateurs clés de performance<br/>
        • le résumé IA des tendances
      </p>
      <p style="margin:0 0 12px 0;color:#111827;font-size:14px;line-height:1.6;">
        Le rapport est joint à cet email au format PDF.
      </p>
      <p style="margin:18px 0 0 0;color:#111827;font-size:14px;line-height:1.6;">
        Bonne lecture,<br/>
        L’équipe EGIA
      </p>
    </div>
  </div>`;
};

const buildMonthlyReportSubject = (periodLabel: string) =>
  `Votre rapport mensuel EGIA – ${periodLabel}`;

const sendResendEmail = async (params: {
  to: string;
  from: string;
  subject: string;
  html: string;
  apiKey: string;
  attachment?: { filename: string; content: string } | null;
}) => {
  const body: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html
  };
  if (params.attachment) {
    body.attachments = [
      {
        filename: params.attachment.filename,
        content: params.attachment.content
      }
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
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

  console.log("[cron][monthly-reports] start", { requestId, route: req.url });

  try {
    const { start, end, periodKey } = getLastMonthRange();
    const fromIso = start.toISOString();
    const toIso = end.toISOString();
    const periodLabel = formatPeriodLabel(start);

    const batchSize = Math.max(
      1,
      Number(process.env.CRON_MONTHLY_BATCH ?? 20)
    );
    const forceParam = req.query?.force;
    const force =
      forceParam === "1" ||
      (Array.isArray(forceParam) && forceParam[0] === "1");
    const runForUserParam = req.query?.run_for_user;
    const runForUser = Array.isArray(runForUserParam)
      ? runForUserParam[0]
      : runForUserParam;
    const runForReportParam = req.query?.run_for_report;
    const runForReport = Array.isArray(runForReportParam)
      ? runForReportParam[0]
      : runForReportParam;

    const resendApiKey = process.env.RESEND_API_KEY ?? "";
    const emailFrom = process.env.EMAIL_FROM ?? "";

    let users: string[] = [];

    if (!runForReport) {
      let settingsQuery = supabaseAdmin
        .from("business_settings")
        .select("user_id")
        .eq("monthly_report_enabled", true)
        .not("user_id", "is", null)
        .limit(batchSize);
      if (runForUser) {
        settingsQuery = settingsQuery.eq("user_id", runForUser);
      }
      const { data: enabledRows, error: enabledError } = await settingsQuery;
      if (enabledError) {
        return respondJson(res, 500, {
          ok: false,
          error: { message: "Failed to load enabled users", code: "INTERNAL" },
          requestId
        });
      }
      users = (enabledRows ?? [])
        .map((row) => (row as { user_id?: string | null }).user_id ?? null)
        .filter(Boolean) as string[];
      console.log("[monthly-report] users found:", users.length);
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
    }

    const { data: locationRows, error: locationsError } = await supabaseAdmin
      .from("google_locations")
      .select("user_id, location_resource_name")
      .in("user_id", users.length > 0 ? users : ["00000000-0000-0000-0000-000000000000"])
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

    const results: Array<{
      userId: string;
      reportId?: string;
      status: "created" | "skipped" | "failed";
      createdReport?: boolean;
      rendered?: boolean;
      emailed?: boolean;
      recipients?: string[];
      reason?: string;
      error?: string;
    }> = [];

    const getRecipients = async (userId: string) => {
      const recipients: Array<{ email: string; firstName?: string | null }> = [];
      const { data: teamRows } = await supabaseAdmin
        .from("team_members")
        .select("email, first_name, last_name, receive_monthly_reports, is_active")
        .eq("user_id", userId)
        .eq("receive_monthly_reports", true)
        .eq("is_active", true)
        .not("email", "is", null);

      for (const row of teamRows ?? []) {
        const email = (row as { email?: string | null }).email ?? null;
        if (email && isEmail(email)) {
          const firstName = (row as { first_name?: string | null }).first_name ?? null;
          recipients.push({ email, firstName });
        }
      }

      if (recipients.length === 0) {
        const { data: connRow, error: connError } = await supabaseAdmin
          .from("google_connections")
          .select("email")
          .eq("user_id", userId)
          .not("email", "is", null)
          .maybeSingle();
        if (!connError) {
          const connEmail = (connRow as { email?: string | null })?.email ?? null;
          if (isEmail(connEmail)) {
            recipients.push({ email: connEmail, firstName: null });
          }
        }
      }

      if (recipients.length === 0) {
        const { data: profileRow, error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle();
        if (!profileError) {
          const profileEmail =
            (profileRow as { email?: string | null })?.email ?? null;
          if (isEmail(profileEmail)) {
            recipients.push({ email: profileEmail, firstName: null });
          }
        }
      }

      return recipients;
    };

    const processReport = async (userId: string, reportId: string | null) => {
      console.log("[monthly-report] processing user:", userId);
      let reportRow = null as Record<string, unknown> | null;
      if (reportId) {
        const { data } = await supabaseAdmin
          .from("reports")
          .select("id, user_id, rendered_at, emailed_at, storage_path")
          .eq("id", reportId)
          .maybeSingle();
        reportRow = data as Record<string, unknown> | null;
      }

      let report = reportRow;
      if (!report) {
        const { data } = await supabaseAdmin
          .from("reports")
          .select("id, user_id, rendered_at, emailed_at, storage_path")
          .eq("user_id", userId)
          .eq("period_preset", "last_month")
          .eq("from_date", fromIso)
          .eq("to_date", toIso)
          .eq("render_mode", "premium")
          .maybeSingle();
        report = data as Record<string, unknown> | null;
      }

      let createdReport = false;
      let reportIdResolved = (report?.id as string | undefined) ?? undefined;
      let renderedAt = report?.rendered_at as string | null | undefined;
      let emailedAt = report?.emailed_at as string | null | undefined;
      let storagePath = report?.storage_path as string | null | undefined;

      const locations = locationsByUser.get(userId) ?? [];
      if (!reportIdResolved) {
        if (locations.length === 0) {
          results.push({
            userId,
            status: "skipped",
            reason: "no_locations"
          });
          return;
        }

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
          return;
        }
        reportIdResolved = inserted.id as string;
        createdReport = true;
      }

      let rendered = Boolean(renderedAt);
      let emailed = Boolean(emailedAt);
      let reportUrl: string | null = null;
      let reason: string | undefined;

      console.log("[monthly-report] fetching data for period:", fromIso, toIso);
      if (!rendered || force) {
        const renderResult = await generatePremiumReport({
          supabaseAdmin,
          reportId: reportIdResolved,
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
          .eq("id", reportIdResolved);
      }

      const recipients = await getRecipients(userId);
      if (recipients.length === 0) {
        reason = "no_email";
        console.log("[monthly-report] skipped email because:", reason);
      } else if (!emailed || force) {
        if (!resendApiKey || !emailFrom) {
          reason = "email_not_configured";
          console.log("[monthly-report] skipped email because:", reason);
        } else {
          if (!reportUrl) {
            if (!storagePath) {
              const { data: reportRowFresh } = await supabaseAdmin
                .from("reports")
                .select("storage_path")
                .eq("id", reportIdResolved)
                .maybeSingle();
              storagePath = (reportRowFresh as { storage_path?: string | null })
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
            reason = "no_report_url";
            console.log("[monthly-report] skipped email because:", reason);
          } else {
            const attachmentContent = await fetchPdfAsBase64(reportUrl);
            for (const recipient of recipients) {
              console.log("[monthly-report] sending email to:", recipient.email);
              const html = buildMonthlyReportEmailHtml({
                firstName: recipient.firstName,
                periodLabel
              });
              await sendResendEmail({
                to: recipient.email,
                from: emailFrom,
                subject: buildMonthlyReportSubject(periodLabel),
                html,
                apiKey: resendApiKey,
                attachment: {
                  filename: `rapport-mensuel-${periodKey}.pdf`,
                  content: attachmentContent
                }
              });
            }
            emailed = true;
            emailedAt = new Date().toISOString();
            await supabaseAdmin
              .from("reports")
              .update({ emailed_at: emailedAt, updated_at: emailedAt })
              .eq("id", reportIdResolved);
          }
        }
      }

      const status = createdReport ? "created" : "skipped";
      results.push({
        userId,
        reportId: reportIdResolved,
        status,
        createdReport,
        rendered,
        emailed,
        recipients: recipients.map((r) => r.email),
        reason
      });
    };

    if (runForReport) {
      const { data: reportRow, error: reportError } = await supabaseAdmin
        .from("reports")
        .select("id, user_id")
        .eq("id", runForReport)
        .maybeSingle();
      if (reportError || !reportRow?.id || !reportRow?.user_id) {
        return respondJson(res, 404, {
          ok: false,
          error: { message: "Report not found", code: "NOT_FOUND" },
          requestId
        });
      }
      await processReport(reportRow.user_id as string, reportRow.id as string);
    } else {
      for (const userId of users) {
        await processReport(userId, null);
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
    console.log("[monthly-report] stats:", stats);

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
