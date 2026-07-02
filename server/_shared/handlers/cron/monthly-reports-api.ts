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
    ? `${value.toFixed(1).replace(".", ",")}/5`
    : null;

const formatEmailRatio = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : null;

const formatEmailCount = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value))
    : null;

type EmailBrandingPayload = Partial<
  Pick<
    PremiumReportPayload,
    | "businessName"
    | "commercialName"
    | "companyName"
    | "legalName"
    | "billingLegalName"
    | "logoUrl"
    | "billingLogoUrl"
    | "locationsCount"
    | "locationNames"
    | "locationsLabel"
  >
>;

const getAppBaseUrl = () => {
  const raw =
    process.env.APP_URL ??
    process.env.APP_BASE_URL ??
    process.env.VITE_APP_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.trim().replace(/\/+$/, "");
};

const getEmailStringField = (
  report: PremiumReportPayload | EmailBrandingPayload | null,
  keys: string[]
) => {
  const source = report as unknown as Record<string, unknown> | null;
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const getEmailNumberField = (
  report: PremiumReportPayload | EmailBrandingPayload | null,
  keys: string[]
) => {
  const source = report as unknown as Record<string, unknown> | null;
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const getEmailKpiNumber = (
  report: PremiumReportPayload | EmailBrandingPayload | null,
  keys: string[]
) => {
  const kpis = (report as PremiumReportPayload | null)?.kpis as
    | Record<string, unknown>
    | undefined;
  if (!kpis) return null;
  for (const key of keys) {
    const value = kpis[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const getLocationsCount = (
  report: PremiumReportPayload | EmailBrandingPayload | null
) => {
  if (!report) return null;
  const explicit = getEmailNumberField(report, [
    "locationsCount",
    "locationCount",
    "establishmentsCount",
    "establishmentCount"
  ]);
  if (explicit !== null) return explicit;
  const perLocation = (report as PremiumReportPayload).perLocation;
  if (Array.isArray(perLocation) && perLocation.length > 0) {
    return perLocation.length;
  }
  if (Array.isArray(report.locationNames) && report.locationNames.length > 0) {
    return report.locationNames.length;
  }
  const match = report.locationsLabel?.match(/(\d+)\s+établissements?/i);
  if (match?.[1]) return Number(match[1]);
  if (report.locationsLabel && /^Établissement\s*:/i.test(report.locationsLabel)) {
    return 1;
  }
  return null;
};

const getBusinessDisplayName = (
  report: PremiumReportPayload | EmailBrandingPayload | null
) => {
  const explicit = getEmailStringField(report, [
    "businessName",
    "business_name",
    "commercialName",
    "commercial_name",
    "tradeName",
    "trade_name",
    "companyName",
    "company_name"
  ]);
  if (explicit) return explicit;
  const perLocation = (report as PremiumReportPayload | null)?.perLocation;
  if (Array.isArray(perLocation) && perLocation.length === 1 && perLocation[0]?.name) {
    return perLocation[0].name;
  }
  if (report?.locationsLabel) {
    return report.locationsLabel.replace(/^Établissements?\s*:\s*/i, "");
  }
  return "Rapport mensuel";
};

const getLegalDisplayName = (
  report: PremiumReportPayload | EmailBrandingPayload | null
) =>
  getEmailStringField(report, [
    "legalName",
    "legal_name",
    "raisonSociale",
    "raison_sociale",
    "billingLegalName",
    "billing_legal_name"
  ]);

const getLogoUrl = (report: PremiumReportPayload | EmailBrandingPayload | null) =>
  getEmailStringField(report, [
    "logoUrl",
    "logo_url",
    "billingLogoUrl",
    "billing_logo_url",
    "companyLogoUrl",
    "company_logo_url"
  ]);

const naturalizeEmailInsight = (item: string) => {
  const trimmed = item.trim();
  const ratingMatch = trimmed.match(/^La note moyenne est ([0-9,.]+)\/?5?\.$/i);
  if (ratingMatch?.[1]) {
    const rating = Number(ratingMatch[1].replace(",", "."));
    if (Number.isFinite(rating) && rating >= 4.5) {
      return "Vos clients continuent de donner une excellente note moyenne.";
    }
    if (Number.isFinite(rating) && rating >= 4) {
      return "Vos clients maintiennent une note moyenne solide.";
    }
    return "La note moyenne invite à renforcer l'expérience client.";
  }

  const responseMatch = trimmed.match(/^Le taux de réponse est de ([0-9]+)%\.$/i);
  if (responseMatch?.[1]) {
    const responseRate = Number(responseMatch[1]);
    if (responseRate >= 80) {
      return "Votre équipe répond à une grande majorité des avis.";
    }
    if (responseRate >= 50) {
      return "Votre équipe répond à une part significative des avis.";
    }
    return "La réponse aux avis reste le levier prioritaire du mois.";
  }

  const negativeMatch = trimmed.match(
    /^(\d+) avis négatifs ont été recensés historiquement sur la période\.$/i
  );
  if (negativeMatch?.[1]) {
    const count = Number(negativeMatch[1]);
    return count > 0
      ? `${count} avis négatif${count > 1 ? "s" : ""} concentrent l'attention sur la période.`
      : "Aucun signal négatif notable n'a été recensé sur la période.";
  }

  const untreatedMatch = trimmed.match(
    /^(\d+) avis négatifs nécessitent une réponse ; priorité à leur traitement\.$/i
  );
  if (untreatedMatch?.[1]) {
    const count = Number(untreatedMatch[1]);
    return `${count} avis négatif${count > 1 ? "s" : ""} attendent encore une réponse prioritaire.`;
  }

  if (/^Aucun avis négatif en attente de réponse/i.test(trimmed)) {
    return "Aucun avis négatif n'attend de réponse : la situation est sous contrôle.";
  }

  const tagsMatch = trimmed.match(/^Sujets récurrents\s*:\s*(.+)\.$/i);
  if (tagsMatch?.[1]) {
    return `Les sujets qui reviennent le plus sont ${tagsMatch[1]}.`;
  }

  const criticalMatch = trimmed.match(/^(\d+) avis critiques IA surveillés/i);
  if (criticalMatch?.[1]) {
    const count = Number(criticalMatch[1]);
    return `${count} avis critique${count > 1 ? "s" : ""} identifié${count > 1 ? "s" : ""} par l'IA restent à surveiller.`;
  }

  if (/^Aucun avis sur la période/i.test(trimmed)) {
    return "Aucun avis n'a été enregistré sur la période.";
  }

  return trimmed;
};

const renderEmailKpiCard = (card: {
  label: string;
  value: string;
  detail?: string | null;
  featured?: boolean;
}) => `
  <td class="kpi-cell" style="padding:7px;width:50%;vertical-align:top;">
    <div class="${card.featured ? "kpi-card kpi-featured" : "kpi-card"}" style="border:1px solid ${
      card.featured ? "rgba(15,23,42,0.92)" : "rgba(15,23,42,0.08)"
    };border-radius:20px;background:${card.featured ? "#0f172a" : "#ffffff"};padding:17px 18px;box-shadow:0 14px 32px rgba(15,23,42,0.06);">
      <div class="kpi-label" style="font-size:10px;line-height:14px;letter-spacing:.11em;text-transform:uppercase;color:${
        card.featured ? "#cbd5e1" : "#64748b"
      };font-weight:800;">
        ${escapeEmailHtml(card.label)}
      </div>
      <div class="${card.featured ? "kpi-value kpi-value-featured" : "kpi-value"}" style="margin-top:9px;font-size:30px;line-height:34px;color:${
        card.featured ? "#ffffff" : "#0f172a"
      };font-weight:780;letter-spacing:-.02em;">
        ${escapeEmailHtml(card.value)}
      </div>
      ${
        card.detail
          ? `<div class="kpi-detail" style="margin-top:6px;color:${card.featured ? "#cbd5e1" : "#64748b"};font-size:12px;line-height:17px;font-weight:600;">${escapeEmailHtml(card.detail)}</div>`
          : ""
      }
    </div>
  </td>
`;

const renderEmailChecklist = (items: string[]) =>
  items
    .map(
      (item) => `
        <div class="check-row" style="display:block;margin:0 0 10px 0;color:#0f172a;font-size:15px;line-height:23px;font-weight:620;">
          <span style="display:inline-block;width:24px;color:#10b981;font-weight:900;">✓</span>${escapeEmailHtml(item)}
        </div>
      `
    )
    .join("");

const renderEmailBullets = (items: string[]) =>
  items
    .map(
      (item) => `
        <span class="tag-pill" style="display:inline-block;margin:0 6px 8px 0;border-radius:999px;border:1px solid rgba(15,23,42,0.10);background:#ffffff;padding:8px 11px;color:#0f172a;font-size:13px;line-height:16px;font-weight:700;">
          ${escapeEmailHtml(item)}
        </span>
      `
    )
    .join("");

const renderLogo = (logoUrl: string | null, displayName: string) =>
  logoUrl
    ? `<img src="${escapeEmailHtml(logoUrl)}" width="48" height="48" alt="${escapeEmailHtml(
        displayName
      )}" style="display:block;width:48px;height:48px;border-radius:16px;object-fit:cover;border:1px solid rgba(15,23,42,0.08);" />`
    : "";

const getSignedBrandLogoUrl = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  logoPath: string | null
) => {
  if (!logoPath) return null;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("brand-assets")
      .createSignedUrl(logoPath, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
};

const resolveEmailBranding = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string
): Promise<EmailBrandingPayload> => {
  try {
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("business_id, business_name")
      .eq("user_id", userId)
      .maybeSingle();
    const businessId =
      (settings as { business_id?: string | null } | null)?.business_id ?? null;
    const settingsName =
      (settings as { business_name?: string | null } | null)?.business_name?.trim() ??
      null;

    const { data: locations } = await supabaseAdmin
      .from("google_locations")
      .select("location_title, location_resource_name")
      .eq("user_id", userId);
    const locationNames = (locations ?? [])
      .map((row: { location_title?: string | null; location_resource_name?: string | null }) =>
        row.location_title ?? row.location_resource_name ?? null
      )
      .filter((item: string | null): item is string => Boolean(item));

    if (!businessId) {
      return {
        businessName: settingsName,
        commercialName: settingsName,
        companyName: settingsName,
        locationsCount: locationNames.length || null,
        locationNames
      };
    }

    const { data: entities } = await supabaseAdmin
      .from("legal_entities")
      .select("company_name, legal_name, logo_path, logo_url, is_default, created_at")
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const entity = Array.isArray(entities)
      ? (entities[0] as
          | {
              company_name?: string | null;
              legal_name?: string | null;
              logo_path?: string | null;
              logo_url?: string | null;
            }
          | undefined)
      : undefined;
    const companyName = entity?.company_name?.trim() || settingsName || null;
    const legalName = entity?.legal_name?.trim() || null;
    const logoUrl =
      entity?.logo_url ??
      (await getSignedBrandLogoUrl(supabaseAdmin, entity?.logo_path ?? null));

    return {
      businessName: companyName,
      commercialName: companyName,
      companyName,
      legalName,
      billingLegalName: legalName,
      logoUrl,
      billingLogoUrl: logoUrl,
      locationsCount: locationNames.length || null,
      locationNames
    };
  } catch {
    return {};
  }
};

const buildMonthlyReportEmailHtml = (opts: {
  firstName?: string | null;
  periodLabel: string;
  reportUrl: string;
  appUrl: string;
  report?: PremiumReportPayload | null;
  branding?: EmailBrandingPayload | null;
}) => {
  const name = (opts.firstName ?? "").trim();
  const report = opts.report ?? null;
  const brandingSource = report ?? opts.branding ?? null;
  const businessName = getBusinessDisplayName(brandingSource);
  const legalName = getLegalDisplayName(brandingSource);
  const logoUrl = getLogoUrl(brandingSource);
  const locationsCount = getLocationsCount(brandingSource);
  const healthScore =
    getEmailKpiNumber(report, [
      "businessHealthScore",
      "business_health_score",
      "healthScore",
      "health_score",
      "score"
    ]) ??
    getEmailNumberField(report, [
      "businessHealthScore",
      "business_health_score",
      "healthScore",
      "health_score",
      "score"
    ]);
  const aiFindings =
    report?.aiSummary.slice(0, 5).map(naturalizeEmailInsight) ?? [];
  const rawPriority =
    report?.aiSummary.find((item) => /priorit|nécessitent une réponse/i.test(item)) ??
    null;
  const priority = rawPriority ? naturalizeEmailInsight(rawPriority) : null;
  const opportunities =
    report?.ai.topTags.slice(0, 5).map((tag) => {
      const count = Number.isFinite(tag.count) ? tag.count : null;
      return count === null
        ? tag.tag
        : `${tag.tag} · ${count} mention${count > 1 ? "s" : ""}`;
    }) ?? [];
  const kpiCards: Array<{
    label: string;
    value: string;
    detail?: string | null;
    featured?: boolean;
  }> = [
    {
      label: "Business Health Score",
      value:
        typeof healthScore === "number" && Number.isFinite(healthScore)
          ? `${Math.round(healthScore)}/100`
          : "Calcul en cours",
      detail: "Score consolidé",
      featured: true
    },
    ...(formatEmailRating(report?.kpis.avgRating)
      ? [
          {
            label: "Note moyenne",
            value: formatEmailRating(report?.kpis.avgRating) as string,
            detail: "Avis clients"
          }
        ]
      : []),
    ...(report && formatEmailCount(report.kpis.reviewsTotal)
      ? [
          {
            label: "Avis analysés",
            value: formatEmailCount(report.kpis.reviewsTotal) as string,
            detail: opts.periodLabel
          }
        ]
      : []),
    ...(formatEmailRatio(report?.kpis.responseRate)
      ? [
          {
            label: "Taux de réponse",
            value: formatEmailRatio(report?.kpis.responseRate) as string,
            detail: "Sur les avis replyables"
          }
        ]
      : []),
    ...(locationsCount !== null && formatEmailCount(locationsCount)
      ? [
          {
            label: "Établissements concernés",
            value: formatEmailCount(locationsCount) as string,
            detail: report?.locationsLabel ?? null
          }
        ]
      : [])
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
        .outer { padding: 16px 10px !important; }
        .container { width: 100% !important; }
        .section { padding: 20px !important; }
        .header-card { padding: 18px !important; }
        .header-right { text-align: left !important; padding-top: 16px !important; }
        .kpi-cell { display: block !important; width: 100% !important; padding: 6px 0 !important; }
        .button-link { display: block !important; text-align: center !important; }
        .mobile-block { display: block !important; width: 100% !important; }
      }
      @media (prefers-color-scheme: dark) {
        body, .outer { background: #020617 !important; }
        .container, .panel, .header-card, .section-card, .kpi-card, .soft-card { background: #0f172a !important; }
        .hero { background: #111827 !important; }
        .text-main, .kpi-value, .check-row, .tag-pill { color: #f8fafc !important; }
        .text-muted, .kpi-label, .kpi-detail, .footer { color: #cbd5e1 !important; }
        .kpi-card, .section-card, .soft-card, .tag-pill { border-color: rgba(248,250,252,0.14) !important; }
        .kpi-featured { background: #f8fafc !important; border-color: #f8fafc !important; }
        .kpi-value-featured { color: #0f172a !important; }
        .divider { border-color: rgba(248,250,252,0.14) !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:#f8fafc;padding:0;">
    <div class="outer" style="background:#f8fafc;padding:34px 18px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
      <table role="presentation" class="container" style="width:640px;max-width:640px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td class="header-card" style="padding:24px 26px 22px;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:24px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td class="mobile-block" style="text-align:left;vertical-align:top;">
                  <table role="presentation" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;padding:0 14px 0 0;">
                        ${renderLogo(logoUrl, businessName)}
                      </td>
                      <td style="vertical-align:top;">
                        <div class="text-main" style="color:#0f172a;font-size:18px;line-height:24px;font-weight:820;letter-spacing:-.01em;">
                          ${escapeEmailHtml(businessName)}
                        </div>
                        ${
                          legalName
                            ? `<div class="text-muted" style="margin-top:3px;color:#64748b;font-size:12px;line-height:17px;font-weight:650;">${escapeEmailHtml(legalName)}</div>`
                            : ""
                        }
                        <div class="text-muted" style="margin-top:8px;color:#64748b;font-size:12px;line-height:17px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;">
                          Executive Monthly Report
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
                <td class="mobile-block header-right" style="text-align:right;vertical-align:top;">
                  <div class="text-main" style="color:#0f172a;font-size:18px;line-height:24px;font-weight:800;">
                    ${escapeEmailHtml(opts.periodLabel)}
                  </div>
                  ${
                    locationsCount !== null
                      ? `<div class="text-muted" style="margin-top:8px;color:#64748b;font-size:12px;line-height:17px;font-weight:700;">${escapeEmailHtml(formatEmailCount(locationsCount))} établissement${locationsCount > 1 ? "s" : ""}</div>`
                      : ""
                  }
                </td>
              </tr>
            </table>
            <div class="divider" style="border-top:1px solid rgba(15,23,42,0.10);margin-top:22px;line-height:1px;font-size:1px;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td>
        </tr>
        <tr>
          <td class="hero section" style="background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:24px;padding:30px;">
            ${
              name
                ? `<div class="text-muted" style="margin:0 0 12px 0;color:#64748b;font-size:13px;line-height:18px;font-weight:700;">Bonjour ${escapeEmailHtml(
                    name
                  )}</div>`
                : ""
            }
            <h1 class="text-main" style="margin:0;color:#0f172a;font-size:32px;line-height:38px;font-weight:820;letter-spacing:-.03em;">
              Executive Summary mensuel
            </h1>
            <div class="text-muted" style="margin:11px 0 0;color:#64748b;font-size:15px;line-height:23px;font-weight:560;">
              Les signaux clés de votre réputation, préparés pour décider rapidement.
            </div>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;">
              ${kpiRows
                .map(
                  (row) => `
                    <tr>
                      ${row
                        .map((card) => renderEmailKpiCard(card))
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
          <td style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td>
        </tr>
        <tr>
          <td class="section-card section" style="background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:24px;padding:24px 26px;">
            <div class="text-main" style="color:#0f172a;font-size:19px;line-height:25px;font-weight:800;margin:0 0 14px;">
              Aujourd’hui l’IA retient
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
          <td style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td>
        </tr>
        <tr>
          <td>
            <div class="soft-card section" style="border-radius:24px;background:#ecfdf5;border:1px solid rgba(16,185,129,0.22);padding:24px 26px;">
              <div style="color:#065f46;font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:.12em;font-weight:900;margin:0 0 9px;">
                Priorité du mois
              </div>
              <div style="color:#064e3b;font-size:17px;line-height:25px;font-weight:760;">
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
          <td style="height:14px;line-height:14px;font-size:14px;">&nbsp;</td>
        </tr>
        <tr>
          <td class="section-card section" style="background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:24px;padding:24px 26px;">
            <div class="text-main" style="color:#0f172a;font-size:19px;line-height:25px;font-weight:800;margin:0 0 14px;">
              Opportunités
            </div>
            ${renderEmailBullets(opportunities)}
          </td>
        </tr>
        `
            : ""
        }
        <tr>
          <td style="height:18px;line-height:18px;font-size:18px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="text-align:center;">
            <a class="button-link" href="${escapeEmailHtml(opts.reportUrl)}" style="display:inline-block;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:15px;line-height:21px;font-weight:820;padding:15px 24px;box-shadow:0 18px 36px rgba(15,23,42,0.18);">
              Voir mon rapport complet
            </a>
          </td>
        </tr>
        <tr>
          <td class="footer" style="padding:26px 8px 0;color:#64748b;font-size:11px;line-height:17px;text-align:center;">
            Vous recevez cet email car les rapports automatiques sont activés. Powered by EGIA.
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
};

const buildMonthlyReportSubject = (periodLabel: string) =>
  `Votre rapport mensuel – ${periodLabel}`;

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
      let emailBranding: EmailBrandingPayload | null = null;
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
            emailBranding = reportEmailPayload
              ? null
              : await resolveEmailBranding(supabaseAdmin, userId);
            const attachmentContent = await fetchPdfAsBase64(reportUrl);
            for (const recipient of recipients) {
              console.log("[monthly-report] sending email to:", recipient.email);
              const html = buildMonthlyReportEmailHtml({
                firstName: recipient.firstName,
                periodLabel,
                reportUrl,
                appUrl,
                report: reportEmailPayload,
                branding: emailBranding
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
