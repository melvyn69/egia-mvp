import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  generatePremiumReport,
  type PremiumReportPayload
} from "../reports/generate_html";

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

const escapeEmailHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatEmailRating = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1).replace(".", ",")
    : "—";

const formatEmailRatio = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "—";

const getAppBaseUrl = () => {
  const raw =
    process.env.APP_URL ??
    process.env.APP_BASE_URL ??
    process.env.VITE_APP_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.trim().replace(/\/+$/, "");
};

const renderEmailKpiCard = (label: string, value: string) => `
  <td class="kpi-cell" style="padding:8px;width:50%;">
    <div class="kpi-card" style="border:1px solid rgba(15,23,42,0.08);border-radius:18px;background:#ffffff;padding:16px;">
      <div class="kpi-label" style="font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">
        ${escapeEmailHtml(label)}
      </div>
      <div class="kpi-value" style="margin-top:8px;font-size:28px;line-height:32px;color:#0f172a;font-weight:750;">
        ${escapeEmailHtml(value)}
      </div>
    </div>
  </td>
`;

const renderEmailChecklist = (items: string[]) =>
  items
    .map(
      (item) => `
        <div class="check-row" style="display:block;margin:0 0 10px 0;color:#0f172a;font-size:14px;line-height:20px;">
          <span style="display:inline-block;width:22px;color:#10b981;font-weight:800;">✓</span>${escapeEmailHtml(item)}
        </div>
      `
    )
    .join("");

const renderEmailBullets = (items: string[]) =>
  items
    .map(
      (item) => `
        <div style="display:block;margin:0 0 8px 0;color:#0f172a;font-size:14px;line-height:20px;">
          <span style="display:inline-block;width:18px;color:#64748b;">•</span>${escapeEmailHtml(item)}
        </div>
      `
    )
    .join("");

const buildMonthlyReportEmailHtml = (opts: {
  firstName?: string | null;
  periodLabel: string;
  reportUrl: string;
  appUrl: string;
  report?: PremiumReportPayload | null;
}) => {
  const name = (opts.firstName ?? "").trim();
  const report = opts.report ?? null;
  const aiFindings = report?.aiSummary.slice(0, 5) ?? [];
  const priority =
    aiFindings.find((item) => /priorit|nécessitent une réponse/i.test(item)) ??
    null;
  const opportunities =
    report?.ai.topTags.slice(0, 5).map((tag) => `${tag.tag} (${tag.count})`) ??
    [];
  const maybeHealthScore =
    report &&
    "businessHealthScore" in report.kpis &&
    typeof (report.kpis as { businessHealthScore?: unknown })
      .businessHealthScore === "number"
      ? String(
          (report.kpis as { businessHealthScore: number }).businessHealthScore
        )
      : null;
  const kpiCards = [
    {
      label: "Business Health Score",
      value: maybeHealthScore ?? "—"
    },
    {
      label: "Note moyenne",
      value: formatEmailRating(report?.kpis.avgRating)
    },
    {
      label: "Nombre d'avis",
      value: report ? String(report.kpis.reviewsTotal) : "—"
    },
    {
      label: "Taux de réponse",
      value: formatEmailRatio(report?.kpis.responseRate)
    }
  ];
  const kpiRows = [];
  for (let index = 0; index < kpiCards.length; index += 2) {
    kpiRows.push(kpiCards.slice(index, index + 2));
  }

  return `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      @media screen and (max-width: 640px) {
        .outer { padding: 18px 12px !important; }
        .container { width: 100% !important; }
        .section { padding: 20px !important; }
        .kpi-cell { display: block !important; width: 100% !important; padding: 6px 0 !important; }
        .button-wrap { display: block !important; width: 100% !important; margin: 0 0 10px 0 !important; }
        .button-link { display: block !important; text-align: center !important; }
      }
      @media (prefers-color-scheme: dark) {
        body, .outer { background: #0f172a !important; }
        .container, .section, .kpi-card { background: #111827 !important; }
        .hero { background: #101827 !important; }
        .text-main, .kpi-value, .check-row { color: #f8fafc !important; }
        .text-muted, .kpi-label, .footer { color: #cbd5e1 !important; }
        .secondary-button { color: #f8fafc !important; border-color: rgba(248,250,252,0.18) !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:#f8fafc;padding:0;">
    <div class="outer" style="background:#f8fafc;padding:36px 18px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
      <table role="presentation" class="container" style="width:640px;max-width:640px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="text-align:left;">
                  <div style="display:inline-block;border-radius:18px;background:#ffffff;padding:12px 16px;border:1px solid rgba(15,23,42,0.08);">
                    <span style="font-size:18px;letter-spacing:.18em;color:#0f172a;font-weight:800;">EGIA</span>
                  </div>
                </td>
                <td class="text-muted" style="text-align:right;color:#64748b;font-size:12px;line-height:18px;font-weight:650;">
                  ${escapeEmailHtml(opts.periodLabel)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="hero section" style="background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:20px;padding:28px;">
            ${
              name
                ? `<div class="text-muted" style="margin:0 0 12px 0;color:#64748b;font-size:13px;line-height:18px;font-weight:650;">Bonjour ${escapeEmailHtml(
                    name
                  )}</div>`
                : ""
            }
            <h1 class="text-main" style="margin:0;color:#0f172a;font-size:30px;line-height:36px;font-weight:780;letter-spacing:-.02em;">
              Votre rapport mensuel est prêt
            </h1>
            <div class="text-muted" style="margin:10px 0 0;color:#64748b;font-size:15px;line-height:22px;">
              Voici les principaux enseignements de votre activité.
            </div>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;">
              ${kpiRows
                .map(
                  (row) => `
                    <tr>
                      ${row
                        .map((card) => renderEmailKpiCard(card.label, card.value))
                        .join("")}
                      ${row.length === 1 ? '<td class="kpi-cell" style="padding:8px;width:50%;"></td>' : ""}
                    </tr>
                  `
                )
                .join("")}
            </table>
          </td>
        </tr>
        ${
          aiFindings.length > 0
            ? `
        <tr>
          <td class="section" style="padding:24px 28px 0;">
            <div class="text-main" style="color:#0f172a;font-size:18px;line-height:24px;font-weight:760;margin:0 0 14px;">
              Aujourd'hui l'IA retient
            </div>
            ${renderEmailChecklist(aiFindings)}
          </td>
        </tr>
        `
            : ""
        }
        ${
          priority
            ? `
        <tr>
          <td style="padding:24px 0 0;">
            <div class="section" style="border-radius:20px;background:#ecfdf5;border:1px solid rgba(16,185,129,0.24);padding:22px 24px;">
              <div style="color:#065f46;font-size:12px;line-height:16px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;margin:0 0 8px;">
                Priorité du mois
              </div>
              <div style="color:#064e3b;font-size:16px;line-height:24px;font-weight:720;">
                ${escapeEmailHtml(priority)}
              </div>
            </div>
          </td>
        </tr>
        `
            : ""
        }
        ${
          opportunities.length > 0
            ? `
        <tr>
          <td class="section" style="padding:24px 28px 0;">
            <div class="text-main" style="color:#0f172a;font-size:18px;line-height:24px;font-weight:760;margin:0 0 14px;">
              Opportunités détectées
            </div>
            ${renderEmailBullets(opportunities)}
          </td>
        </tr>
        `
            : ""
        }
        <tr>
          <td style="padding:28px 0 0;">
            <table role="presentation" style="border-collapse:collapse;">
              <tr>
                <td class="button-wrap" style="padding:0 10px 0 0;">
                  <a class="button-link" href="${escapeEmailHtml(opts.reportUrl)}" style="display:inline-block;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:760;padding:13px 20px;">
                    Consulter le rapport
                  </a>
                </td>
                ${
                  opts.appUrl
                    ? `
                <td class="button-wrap" style="padding:0;">
                  <a class="button-link secondary-button" href="${escapeEmailHtml(opts.appUrl)}" style="display:inline-block;border-radius:999px;background:transparent;color:#0f172a;text-decoration:none;font-size:14px;line-height:20px;font-weight:760;padding:12px 18px;border:1px solid rgba(15,23,42,0.14);">
                    Ouvrir EGIA
                  </a>
                </td>
                `
                    : ""
                }
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="footer" style="padding:28px 0 0;color:#64748b;font-size:11px;line-height:17px;">
            Vous recevez cet email car les rapports automatiques sont activés.
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
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
    const appUrl = getAppBaseUrl();

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
          usersTargeted: 0,
          usersSent: 0,
          usersSkippedReasons: { no_candidates: 1 },
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
      let missingEmail = false;
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
          } else {
            missingEmail = true;
          }
        }
      }

      return { recipients, missingEmail };
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
      let reportEmailPayload: PremiumReportPayload | null = null;
      let reason: string | undefined;

      console.log("[monthly-report] fetching data for period:", fromIso, toIso);
      if (!rendered || force) {
        const renderResult = await generatePremiumReport({
          supabaseAdmin,
          reportId: reportIdResolved,
          requestId,
          includeEmailPayload: true
        });
        if (renderResult?.pdf?.url) {
          reportUrl = renderResult.pdf.url as string;
        }
        reportEmailPayload =
          (renderResult?.emailPayload as PremiumReportPayload | undefined) ??
          null;
        rendered = true;
        renderedAt = new Date().toISOString();
        await supabaseAdmin
          .from("reports")
          .update({ rendered_at: renderedAt, updated_at: renderedAt })
          .eq("id", reportIdResolved);
      }

      const { recipients, missingEmail } = await getRecipients(userId);
      if (recipients.length === 0) {
        reason = missingEmail ? "missing_email" : "no_email";
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
                periodLabel,
                reportUrl,
                appUrl,
                report: reportEmailPayload
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

    const usersTargeted = results.length;
    const usersSent = results.filter((item) => item.emailed).length;
    const usersSkippedReasons = results.reduce<Record<string, number>>(
      (acc, item) => {
        if (!item.reason) return acc;
        acc[item.reason] = (acc[item.reason] ?? 0) + 1;
        return acc;
      },
      {}
    );

    return respondJson(res, 200, {
      ok: true,
      requestId,
      period: { from: fromIso, to: toIso, key: periodKey },
      stats,
      usersTargeted,
      usersSent,
      usersSkippedReasons,
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
