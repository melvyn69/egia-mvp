import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../_auth.js";
import { getRequestId, logRequest } from "../../api_utils.js";
import { renderPdfFromHtml } from "../../pdf_html.js";

type ReportPreset =
  | "last_7_days"
  | "last_30_days"
  | "custom"
  | "this_month"
  | "last_month"
  | "last_year"
  | "this_year"
  | "all_time";

type ReviewRow = {
  id: string;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  location_id: string | null;
  author_name: string | null;
  reply_text: string | null;
  replied_at: string | null;
  review_ai_insights?:
    | { sentiment?: string | null; sentiment_score?: number | null }
    | Array<{ sentiment?: string | null; sentiment_score?: number | null }>
    | null;
  review_ai_tags?:
    | Array<{ ai_tags?: { tag?: string | null; category?: string | null } | null }>
    | null;
};

const asOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const normalizePreset = (value: unknown): ReportPreset => {
  if (
    value === "last_7_days" ||
    value === "last_30_days" ||
    value === "custom" ||
    value === "this_month" ||
    value === "last_month" ||
    value === "last_year" ||
    value === "this_year" ||
    value === "all_time"
  ) {
    return value;
  }
  return "last_30_days";
};

const getRange = (
  preset: ReportPreset,
  from?: string | null,
  to?: string | null
) => {
  const now = new Date();
  if (preset === "custom" && from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  if (preset === "last_7_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: start, to: now };
  }
  if (preset === "last_30_days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: start, to: now };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now };
  }
  if (preset === "last_year") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { from: start, to: end };
  }
  if (preset === "this_year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start, to: now };
  }
  if (preset === "all_time") {
    return { from: null, to: null };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { from: start, to: now };
};

const formatDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

const formatRating = (value: number | null) =>
  value === null ? null : value.toFixed(1).replace(".", ",");

const formatRatio = (value: number | null) =>
  value === null ? null : `${Math.round(value * 100)}%`;

const EMPTY_DASH = String.fromCharCode(8212);

const normalizeLocationTitle = (value: string) =>
  value.replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderStars = (rating: number | null) => {
  if (rating === null) {
    return "";
  }
  const normalized = typeof rating === "number" ? Math.max(0, Math.min(5, rating)) : 0;
  const ratingLabel = formatRating(rating);
  const fullStars = Math.floor(normalized);
  const stars = Array.from({ length: 5 }, (_, index) => {
    const filled = index < fullStars;
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5l2.9 6.1 6.7.6-5 4.3 1.5 6.6L12 16.8 5.9 20l1.5-6.6-5-4.3 6.7-.6L12 2.5z"
          fill="${filled ? "#1f2937" : "none"}"
          stroke="#1f2937" stroke-width="1"/>
      </svg>
    `;
  });
  return `<div class="stars">${stars.join("")}<span>${escapeHtml(ratingLabel ?? "")}</span></div>`;
};

const buildAiSummary = (params: {
  avgRating: number | null;
  responseRate: number | null;
  negativeCount: number;
  untreatedNegativeCount: number;
  reviewsTotal: number;
  topTags: Array<{ tag: string; count: number }>;
  aiCriticalCount: number;
}) => {
  if (params.reviewsTotal === 0) {
    return ["Aucun avis sur la période."];
  }
  const sentences: string[] = [];
  if (params.avgRating !== null) {
    sentences.push(`La note moyenne est ${formatRating(params.avgRating)}.`);
  }
  if (params.responseRate !== null) {
    sentences.push(`Le taux de réponse est de ${formatRatio(params.responseRate)}.`);
  }
  sentences.push(
    `${params.negativeCount} avis négatifs ont été recensés historiquement sur la période.`
  );
  if (params.untreatedNegativeCount > 0) {
    sentences.push(
      `${params.untreatedNegativeCount} avis négatifs nécessitent une réponse ; priorité à leur traitement.`
    );
  } else {
    sentences.push(
      "Aucun avis négatif en attente de réponse : la situation est maîtrisée."
    );
  }
  if (params.topTags.length > 0) {
    const tagList = params.topTags.slice(0, 3).map((tag) => tag.tag).join(", ");
    sentences.push(`Sujets récurrents : ${tagList}.`);
  }
  if (params.aiCriticalCount > 0) {
    sentences.push(
      `${params.aiCriticalCount} avis critiques IA surveillés, sans action obligatoire si déjà répondus.`
    );
  }
  return sentences.slice(0, 5);
};

export type PremiumReportPayload = {
  title: string;
  subtitle: string;
  locationsLabel: string;
  notes?: string | null;
  businessName?: string | null;
  commercialName?: string | null;
  companyName?: string | null;
  legalName?: string | null;
  billingLegalName?: string | null;
  logoUrl?: string | null;
  billingLogoUrl?: string | null;
  locationsCount?: number | null;
  locationNames?: string[];
  kpis: {
    reviewsTotal: number;
    avgRating: number | null;
    responseRate: number | null;
    negativeCount: number;
    untreatedNegativeCount: number;
  };
  ai: {
    criticalCount: number;
    topTags: Array<{ tag: string; count: number }>;
  };
  untreatedNegatives: Array<{
    comment: string;
    rating: number | null;
    date: string;
    author: string | null;
    location: string;
  }>;
  aiSummary: string[];
  perLocation: Array<{
    name: string;
    reviewsTotal: number;
    avgRating: number | null;
    responseRate: number | null;
    untreatedNegativeCount: number;
    positiveCount: number;
    negativeCount: number;
  }>;
};

const getPayloadString = (params: PremiumReportPayload, keys: string[]) => {
  const source = params as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const getPayloadNumber = (source: unknown, keys: string[]) => {
  const record = source as Record<string, unknown> | null;
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

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

const resolveReportBranding = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  fallbackName: string,
  locationNames: string[]
) => {
  const fallback = fallbackName.trim() || null;
  const empty = {
    businessName: fallback,
    commercialName: fallback,
    companyName: fallback,
    legalName: null,
    billingLegalName: null,
    logoUrl: null,
    billingLogoUrl: null,
    locationsCount: locationNames.length || null,
    locationNames
  };

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

    if (!businessId) {
      return {
        ...empty,
        businessName: settingsName ?? empty.businessName,
        commercialName: settingsName ?? empty.commercialName,
        companyName: settingsName ?? empty.companyName
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
    const companyName = entity?.company_name?.trim() || settingsName || fallback;
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
    return empty;
  }
};

const formatCoverNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");

const buildCoverAiSentence = (params: PremiumReportPayload) => {
  const summaries = params.aiSummary;
  if (summaries.length === 0) return null;
  if (
    summaries.some((item) => /note moyenne/i.test(item)) &&
    typeof params.kpis.avgRating === "number" &&
    params.kpis.avgRating >= 4.5
  ) {
    return "Aujourd'hui votre réputation est excellente.";
  }
  if (
    summaries.some((item) => /note moyenne/i.test(item)) &&
    typeof params.kpis.avgRating === "number" &&
    params.kpis.avgRating >= 4
  ) {
    return "La satisfaction client reste votre principal point fort.";
  }
  if (summaries.some((item) => /Aucun avis négatif en attente/i.test(item))) {
    return "Votre réputation reste sous contrôle sur la période.";
  }
  if (
    summaries.some((item) => /taux de réponse/i.test(item)) &&
    typeof params.kpis.responseRate === "number" &&
    params.kpis.responseRate >= 0.8
  ) {
    return "Votre réactivité soutient la qualité de votre réputation.";
  }
  const first = summaries[0]?.trim();
  return first && first !== EMPTY_DASH ? first : null;
};

const rewritePdfInsight = (item: string) => {
  const trimmed = item.trim();
  if (!trimmed || trimmed === EMPTY_DASH) {
    return "";
  }

  const ratingMatch = trimmed.match(/^La note moyenne est ([0-9,.]+)\/?5?\.$/i);
  if (ratingMatch?.[1]) {
    const rating = Number(ratingMatch[1].replace(",", "."));
    if (Number.isFinite(rating) && rating >= 4.5) {
      return "Vos clients attribuent une excellente note moyenne, signe d'une satisfaction constante.";
    }
    if (Number.isFinite(rating) && rating >= 4) {
      return "Vos clients expriment une satisfaction solide, à consolider dans la durée.";
    }
    return "La note moyenne met en évidence un levier d'amélioration de l'expérience client.";
  }

  const responseMatch = trimmed.match(/^Le taux de réponse est de ([0-9]+)%\.$/i);
  if (responseMatch?.[1]) {
    const responseRate = Number(responseMatch[1]);
    if (responseRate >= 80) {
      return "Votre taux de réponse soutient efficacement la confiance client.";
    }
    if (responseRate >= 50) {
      return "Votre taux de réponse reste solide mais inférieur au potentiel maximal.";
    }
    return "Votre taux de réponse constitue un levier prioritaire pour renforcer la réputation.";
  }

  const negativeMatch = trimmed.match(
    /^(\d+) avis négatifs ont été recensés historiquement sur la période\.$/i
  );
  if (negativeMatch?.[1]) {
    const count = Number(negativeMatch[1]);
    if (count === 0) {
      return "Aucun avis négatif n'a été identifié sur la période.";
    }
    return `${count} avis négatif${count > 1 ? "s" : ""} concentrent les principaux points de vigilance.`;
  }

  const untreatedMatch = trimmed.match(
    /^(\d+) avis négatifs nécessitent une réponse ; priorité à leur traitement\.$/i
  );
  if (untreatedMatch?.[1]) {
    const count = Number(untreatedMatch[1]);
    if (count === 0) {
      return "Aucun avis négatif n'appelle de réponse prioritaire.";
    }
    return `${count} avis négatif${count > 1 ? "s" : ""} appellent une réponse prioritaire.`;
  }

  if (/^Aucun avis négatif en attente de réponse/i.test(trimmed)) {
    return "Aucun avis négatif n'attend de réponse : le traitement est maîtrisé.";
  }

  const tagsMatch = trimmed.match(/^Sujets récurrents\s*:\s*(.+)\.$/i);
  if (tagsMatch?.[1]) {
    return `Les thèmes clients les plus récurrents sont ${tagsMatch[1]}.`;
  }

  const criticalMatch = trimmed.match(/^(\d+) avis critiques IA surveillés/i);
  if (criticalMatch?.[1]) {
    const count = Number(criticalMatch[1]);
    if (count === 0) {
      return "Aucun avis critique n'a été signalé par l'IA.";
    }
    return `${count} avis critique${count > 1 ? "s" : ""} détecté${count > 1 ? "s" : ""} par l'IA mérite${count > 1 ? "nt" : ""} une surveillance spécifique.`;
  }

  if (/^Aucun avis sur la période/i.test(trimmed)) {
    return "Aucun avis n'a été collecté sur la période analysée.";
  }

  return trimmed;
};

const buildHtml = (params: PremiumReportPayload) => {
  const tags = params.ai.topTags.slice(0, 10);
  const generatedDate = formatDate(new Date()) ?? new Date().toISOString().slice(0, 10);
  const coverName = params.locationsLabel
    .replace(/^Établissement:\s*/i, "")
    .replace(/^Établissements:\s*/i, "")
    .trim();
  const commercialName =
    (getPayloadString(params, [
      "businessName",
      "business_name",
      "commercialName",
      "commercial_name",
      "tradeName",
      "trade_name",
      "companyName",
      "company_name"
    ]) ?? coverName) ||
    params.title;
  const legalName = getPayloadString(params, [
    "legalName",
    "legal_name",
    "raisonSociale",
    "raison_sociale",
    "billingLegalName",
    "billing_legal_name"
  ]);
  const logoUrl = getPayloadString(params, [
    "logoUrl",
    "logo_url",
    "billingLogoUrl",
    "billing_logo_url",
    "companyLogoUrl",
    "company_logo_url"
  ]);
  const payloadLocationNames = Array.isArray(params.locationNames)
    ? params.locationNames.filter(Boolean)
    : [];
  const locationNamesFromRows = payloadLocationNames.length
    ? payloadLocationNames
    : params.perLocation
        .map((location) => location.name)
        .filter((name) => name && name !== "Établissement");
  const singleLocationFromLabel = /^Établissement\s*:/i.test(params.locationsLabel)
    ? coverName
    : null;
  const locationNames =
    locationNamesFromRows.length > 0
      ? locationNamesFromRows
      : singleLocationFromLabel
        ? [singleLocationFromLabel]
        : [];
  const locationCountFromLabel = (() => {
    const match = params.locationsLabel.match(/(\d+)\s+établissements?/i);
    if (match?.[1]) return Number(match[1]);
    return singleLocationFromLabel ? 1 : null;
  })();
  const locationCount =
    params.locationsCount ?? (locationNamesFromRows.length || locationCountFromLabel);
  const businessHealthScoreValue =
    getPayloadNumber(params.kpis, [
      "businessHealthScore",
      "business_health_score",
      "healthScore",
      "health_score",
      "score"
    ]) ??
    getPayloadNumber(params, [
      "businessHealthScore",
      "business_health_score",
      "healthScore",
      "health_score",
      "score"
    ]);
  const businessHealthScore =
    businessHealthScoreValue === null
      ? "Calcul en cours"
      : `${formatCoverNumber(businessHealthScoreValue)}/100`;
  const coverKpis = [
    {
      label: "Avis analysés",
      value: formatCoverNumber(params.kpis.reviewsTotal),
      visible: Number.isFinite(params.kpis.reviewsTotal)
    },
    {
      label: "Note moyenne",
      value:
        params.kpis.avgRating === null
          ? null
          : `${formatCoverNumber(params.kpis.avgRating)}/5`,
      visible: params.kpis.avgRating !== null
    },
    {
      label: "Taux de réponse",
      value:
        params.kpis.responseRate === null
          ? null
          : `${Math.round(params.kpis.responseRate * 100)}%`,
      visible: params.kpis.responseRate !== null
    },
    {
      label: "Nombre établissements",
      value: locationCount === null ? null : formatCoverNumber(locationCount),
      visible: locationCount !== null
    },
    {
      label: "Avis négatifs",
      value: formatCoverNumber(params.kpis.negativeCount),
      visible: Number.isFinite(params.kpis.negativeCount)
    },
    {
      label: "Avis IA critiques",
      value: formatCoverNumber(params.ai.criticalCount),
      visible: Number.isFinite(params.ai.criticalCount)
    }
  ].filter(
    (item): item is { label: string; value: string; visible: true } =>
      item.visible && item.value !== null
  );
  const coverAiSentence = buildCoverAiSentence(params);
  const ratingPercent =
    params.kpis.avgRating === null
      ? 0
      : Math.max(0, Math.min(100, (params.kpis.avgRating / 5) * 100));
  const responsePercent =
    params.kpis.responseRate === null
      ? 0
      : Math.max(0, Math.min(100, params.kpis.responseRate * 100));
  const sourceSummaryItems = params.aiSummary.filter(
    (item) => item.trim() && item.trim() !== EMPTY_DASH
  );
  const summaryItems = sourceSummaryItems.length
    ? sourceSummaryItems.map(rewritePdfInsight)
    : ["Aucune synthèse IA disponible dans les données du rapport."];
  const findSummary = (patterns: RegExp[], fallbackIndex = 0) =>
    rewritePdfInsight(
      sourceSummaryItems.find((item) =>
        patterns.some((pattern) => pattern.test(item))
      ) ??
        sourceSummaryItems[fallbackIndex] ??
        ""
    ) ||
    summaryItems[fallbackIndex] ||
    "Aucune synthèse IA disponible dans les données du rapport.";
  const mainInsight =
    (sourceSummaryItems[0] && rewritePdfInsight(sourceSummaryItems[0])) ||
    "Aucune synthèse IA disponible dans les données du rapport.";
  const strengthInsight = findSummary(
    [/note moyenne/i, /taux de réponse/i, /maîtrisée/i],
    0
  );
  const weaknessInsight = findSummary(
    [/négatif/i, /critique/i, /nécessitent/i],
    1
  );
  const priorityInsight = findSummary([/priorit/i, /nécessitent/i], 0);
  const highImpactActions = sourceSummaryItems
    .filter((item) => /priorit|nécessitent|critique/i.test(item))
    .slice(0, 2)
    .map(rewritePdfInsight)
    .filter(Boolean);
  const mediumImpactActions = sourceSummaryItems
    .filter(
      (item) =>
        !highImpactActions.includes(rewritePdfInsight(item)) &&
        /taux de réponse|note moyenne|négatif/i.test(item)
    )
    .slice(0, 2)
    .map(rewritePdfInsight)
    .filter(Boolean);
  const lowImpactActions = sourceSummaryItems
    .filter(
      (item) =>
        !highImpactActions.includes(rewritePdfInsight(item)) &&
        !mediumImpactActions.includes(rewritePdfInsight(item)) &&
        /sujets|récurrents/i.test(item)
    )
    .slice(0, 2)
    .map(rewritePdfInsight)
    .filter(Boolean);
  const hasActionItems =
    highImpactActions.length > 0 ||
    mediumImpactActions.length > 0 ||
    lowImpactActions.length > 0;
  const renderInsightCard = (
    label: string,
    value: string,
    tone: "dark" | "light" | "green" = "light"
  ) => `
    <div class="insight-card insight-${tone}">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <div class="insight-text">${escapeHtml(value)}</div>
    </div>
  `;
  const renderKpi = (label: string, value: string, note = "") => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      ${note ? `<div class="metric-note">${escapeHtml(note)}</div>` : ""}
    </div>
  `;
  const performanceKpis = [
    renderKpi(
      "Avis analysés",
      String(params.kpis.reviewsTotal),
      "Volume d'avis collectés sur la période."
    ),
    ...(params.kpis.avgRating !== null
      ? [
          renderKpi(
            "Note moyenne",
            formatRating(params.kpis.avgRating) ?? "",
            "Satisfaction exprimée par vos clients."
          )
        ]
      : []),
    ...(params.kpis.responseRate !== null
      ? [
          renderKpi(
            "Taux de réponse",
            formatRatio(params.kpis.responseRate) ?? "",
            "Réactivité visible dans votre réputation."
          )
        ]
      : [])
  ];
  const renderTag = (tag: { tag: string; count: number }) => `
    <div class="tag-pill">
      <span>${escapeHtml(tag.tag)}</span>
      <strong>${tag.count}</strong>
    </div>
  `;
  const renderActionItems = (items: string[]) =>
    items
      .map((item) => `<div class="action-item">${escapeHtml(item)}</div>`)
      .join("");
  const renderMiniLocationCards = () =>
    params.perLocation
      .slice(0, 6)
      .map((row) => {
        const ratingLabel = formatRating(row.avgRating);
        const responseLabel = formatRatio(row.responseRate);
        const locationMetrics = [
          `<span>${row.reviewsTotal} avis</span>`,
          ratingLabel ? `<span>${escapeHtml(ratingLabel)}</span>` : "",
          responseLabel ? `<span>${escapeHtml(responseLabel)}</span>` : "",
          `<span>${
            row.untreatedNegativeCount === 0
              ? "Aucun avis prioritaire"
              : `${row.untreatedNegativeCount} réponse${row.untreatedNegativeCount > 1 ? "s" : ""} prioritaire${row.untreatedNegativeCount > 1 ? "s" : ""}`
          }</span>`
        ]
          .filter(Boolean)
          .join("");
        return `
          <div class="location-card">
            <div class="location-name">${escapeHtml(row.name)}</div>
            <div class="location-grid">
              ${locationMetrics}
            </div>
          </div>
        `;
      })
      .join("");

  return `
  <!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
        }
        .page {
          min-height: 250mm;
          page-break-after: always;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 2mm 0;
        }
        .page:last-child {
          page-break-after: auto;
        }
        .brand {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          font-weight: 800;
          color: #0f172a;
        }
        .page-kicker {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #64748b;
        }
        .page-title {
          margin: 6px 0 0;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.04em;
          font-weight: 760;
          color: #0f172a;
        }
        h1 {
          margin: 0;
        }
        .muted {
          color: #64748b;
        }
        .cover {
          justify-content: flex-start;
          gap: 18px;
          padding-top: 4mm;
          padding-bottom: 4mm;
        }
        .cover-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 26px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 22px;
        }
        .cover-brand-block {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .cover-logo {
          width: 54px;
          height: 54px;
          border-radius: 16px;
          object-fit: cover;
          border: 1px solid #e2e8f0;
        }
        .cover-brand-name {
          font-size: 22px;
          line-height: 1.08;
          letter-spacing: -0.035em;
          font-weight: 780;
          color: #0f172a;
        }
        .cover-legal {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.35;
          color: #64748b;
          font-weight: 650;
        }
        .cover-report-label {
          margin-top: 10px;
          font-size: 11px;
          font-weight: 780;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #64748b;
        }
        .cover-title {
          margin-top: 18px;
          max-width: 620px;
        }
        .cover-title h1 {
          font-size: 58px;
          line-height: 0.94;
          letter-spacing: -0.065em;
          font-weight: 780;
        }
        .cover-meta {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          max-width: 620px;
        }
        .cover-locations {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cover-location-pill {
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          padding: 8px 11px;
          font-size: 12px;
          line-height: 1.2;
          font-weight: 680;
          color: #334155;
          background: #ffffff;
        }
        .meta-card,
        .metric-card,
        .insight-card,
        .action-card,
        .theme-column,
        .location-card {
          border-radius: 18px;
          background: #f8fafc;
          padding: 16px;
        }
        .meta-label,
        .metric-label,
        .eyebrow {
          font-size: 12px;
          line-height: 1.2;
          font-weight: 740;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: #64748b;
        }
        .meta-value {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.25;
          font-weight: 740;
          color: #0f172a;
        }
        .cover-score-hero {
          margin-top: 2px;
          border-radius: 30px;
          padding: 30px;
          min-height: 186px;
          color: #ffffff;
          background:
            linear-gradient(135deg, #0f172a 0%, #111827 58%, #334155 138%);
          display: grid;
          grid-template-columns: minmax(0, 1fr) 1.35fr;
          gap: 26px;
          align-items: stretch;
          overflow: hidden;
          position: relative;
        }
        .cover-score-hero::after {
          content: "";
          position: absolute;
          right: -80px;
          top: -120px;
          width: 280px;
          height: 280px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
        }
        .cover-score-label,
        .score-label {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 760;
          color: #a7f3d0;
        }
        .cover-score-value,
        .score-value {
          margin-top: 10px;
          font-size: 76px;
          line-height: 0.9;
          letter-spacing: -0.06em;
          font-weight: 780;
        }
        .cover-score-value {
          font-size: 68px;
          letter-spacing: -0.07em;
        }
        .cover-score-subtitle {
          margin-top: 16px;
          max-width: 260px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.45;
        }
        .cover-kpi-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .cover-kpi-card {
          border-radius: 18px;
          padding: 14px;
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.14);
        }
        .cover-kpi-label {
          font-size: 10px;
          line-height: 1.2;
          font-weight: 780;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #cbd5e1;
        }
        .cover-kpi-value {
          margin-top: 9px;
          font-size: 26px;
          line-height: 0.98;
          letter-spacing: -0.045em;
          font-weight: 780;
          color: #ffffff;
        }
        .cover-ai-line {
          margin-top: 18px;
          border-radius: 22px;
          padding: 18px 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 20px;
          line-height: 1.25;
          letter-spacing: -0.03em;
          font-weight: 720;
          color: #0f172a;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }
        .section-header .muted {
          margin-top: 8px;
          max-width: 420px;
          font-size: 13px;
          line-height: 1.5;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .insight-card {
          min-height: 118px;
        }
        .insight-dark {
          background: #0f172a;
          color: #ffffff;
        }
        .insight-dark .eyebrow {
          color: #cbd5e1;
        }
        .insight-green {
          background: #ecfdf5;
        }
        .insight-light {
          background: #f8fafc;
        }
        .insight-text {
          margin-top: 12px;
          font-size: 17px;
          line-height: 1.38;
          font-weight: 650;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .metric-card {
          min-height: 126px;
        }
        .metric-value {
          margin-top: 12px;
          font-size: 38px;
          line-height: 0.96;
          letter-spacing: -0.045em;
          font-weight: 780;
          color: #0f172a;
        }
        .metric-note {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.35;
          color: #64748b;
        }
        .chart-panel {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 22px;
          align-items: stretch;
        }
        .chart-block {
          padding: 8px 0;
        }
        .chart-title {
          font-size: 14px;
          font-weight: 740;
          color: #0f172a;
          margin-bottom: 14px;
        }
        .big-bar {
          height: 26px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .big-bar span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: #0f172a;
        }
        .rating-band {
          margin-top: 22px;
          display: grid;
          gap: 10px;
        }
        .stars {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 16px;
          color: #0f172a;
        }
        .volume-strip {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-top: 22px;
        }
        .strip-item {
          border-radius: 16px;
          background: #f8fafc;
          padding: 14px;
        }
        .strip-value {
          font-size: 26px;
          font-weight: 760;
          letter-spacing: -0.04em;
        }
        .theme-grid,
        .action-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .theme-column,
        .action-card {
          min-height: 176px;
        }
        .theme-title,
        .action-title {
          font-size: 13px;
          line-height: 1.2;
          font-weight: 780;
          color: #0f172a;
          margin-bottom: 14px;
        }
        .tag-pill {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
          line-height: 1.35;
        }
        .tag-pill:last-child {
          border-bottom: 0;
        }
        .tag-pill strong {
          color: #64748b;
        }
        .text-list {
          display: grid;
          gap: 10px;
          font-size: 13px;
          line-height: 1.45;
          color: #334155;
        }
        .action-item {
          border-radius: 14px;
          background: #ffffff;
          padding: 12px;
          font-size: 13px;
          line-height: 1.45;
          color: #334155;
          border: 1px solid #e2e8f0;
        }
        .action-high {
          background: #ecfdf5;
        }
        .location-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .location-name {
          font-size: 14px;
          font-weight: 740;
          color: #0f172a;
          margin-bottom: 12px;
        }
        .location-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }
        .conclusion-panel {
          margin-top: auto;
          border-radius: 28px;
          padding: 28px;
          background: #0f172a;
          color: #ffffff;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 180px;
          gap: 30px;
          align-items: end;
        }
        .conclusion-panel .eyebrow {
          color: #a7f3d0;
        }
        .conclusion-text {
          margin-top: 12px;
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: -0.035em;
          font-weight: 740;
        }
        .page-number {
          position: absolute;
          right: 0;
          bottom: 0;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .page-number::before {
          content: "Powered by EGIA";
          margin-right: 18px;
          color: #cbd5e1;
          letter-spacing: 0.08em;
        }
      </style>
    </head>
    <body>
      <section class="page cover">
        <div class="cover-top">
          <div class="cover-brand-block">
            ${
              logoUrl
                ? `<img class="cover-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(commercialName)}" />`
                : ""
            }
            <div>
              <div class="cover-brand-name">${escapeHtml(commercialName)}</div>
              ${
                legalName
                  ? `<div class="cover-legal">${escapeHtml(legalName)}</div>`
                  : ""
              }
              <div class="cover-report-label">Rapport exécutif réputation</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="page-kicker">Rapport stratégique</div>
            <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(generatedDate)}</div>
          </div>
        </div>
        <div class="cover-title">
          <div class="page-kicker">${escapeHtml(params.subtitle)}</div>
          <h1>${escapeHtml(commercialName)}</h1>
          <div class="cover-meta">
            <div class="meta-card">
              <div class="meta-label">Période</div>
              <div class="meta-value">${escapeHtml(params.subtitle)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Date génération</div>
              <div class="meta-value">${escapeHtml(generatedDate)}</div>
            </div>
            ${
              locationCount !== null
                ? `
            <div class="meta-card">
              <div class="meta-label">Établissements</div>
              <div class="meta-value">${escapeHtml(formatCoverNumber(locationCount))}</div>
            </div>
            `
                : ""
            }
          </div>
          ${
            locationNames.length > 0
              ? `
          <div class="cover-locations">
            ${locationNames
              .slice(0, 8)
              .map(
                (name) =>
                  `<span class="cover-location-pill">${escapeHtml(name)}</span>`
              )
              .join("")}
            ${
              locationNames.length > 8
                ? `<span class="cover-location-pill">+${escapeHtml(
                    formatCoverNumber(locationNames.length - 8)
                  )}</span>`
                : ""
            }
          </div>
          `
              : ""
          }
        </div>
        <div class="cover-score-hero">
          <div>
            <div class="cover-score-label">Business Health Score</div>
            <div class="cover-score-value">${escapeHtml(businessHealthScore)}</div>
            <div class="cover-score-subtitle">Indice exécutif de réputation.</div>
          </div>
          <div class="cover-kpi-grid">
            ${coverKpis
              .map(
                (kpi) => `
            <div class="cover-kpi-card">
              <div class="cover-kpi-label">${escapeHtml(kpi.label)}</div>
              <div class="cover-kpi-value">${escapeHtml(kpi.value)}</div>
            </div>
            `
              )
              .join("")}
          </div>
        </div>
        ${
          coverAiSentence
            ? `<div class="cover-ai-line">${escapeHtml(coverAiSentence)}</div>`
            : ""
        }
        <div class="page-number">Page 1</div>
      </section>

      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Synthèse exécutive</div>
            <h1 class="page-title">Lecture métier de la période</h1>
            <div class="muted">Interprétation des signaux consolidés, strictement à partir des données du rapport.</div>
          </div>
        </div>
        <div class="summary-grid">
          ${renderInsightCard("Ce que cela signifie", mainInsight, "dark")}
          ${renderInsightCard("Forces à capitaliser", strengthInsight, "green")}
          ${renderInsightCard("Points de vigilance", weaknessInsight, "light")}
          ${renderInsightCard("Priorité de pilotage", priorityInsight, "light")}
        </div>
        <div class="summary-grid" style="margin-top:14px;">
          ${summaryItems
            .slice(0, 4)
            .map((item, index) =>
              renderInsightCard(`Lecture ${index + 1}`, item, "light")
            )
            .join("")}
        </div>
        <div class="page-number">Page 2</div>
      </section>

      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Performance commerciale</div>
            <h1 class="page-title">Indicateurs de pilotage</h1>
            <div class="muted">${escapeHtml(params.subtitle)}</div>
          </div>
        </div>
        <div class="metric-grid" style="grid-template-columns: repeat(${Math.min(performanceKpis.length, 3)}, 1fr);">
          ${performanceKpis.join("")}
        </div>
        <div class="chart-panel">
          <div class="chart-block">
            <div class="chart-title">Points de vigilance</div>
            <div class="volume-strip">
              <div class="strip-item">
                <div class="meta-label">Avis négatifs</div>
                <div class="strip-value">${params.kpis.negativeCount}</div>
              </div>
              <div class="strip-item">
                <div class="meta-label">Réponses prioritaires</div>
                <div class="strip-value">${params.kpis.untreatedNegativeCount}</div>
              </div>
              <div class="strip-item">
                <div class="meta-label">Critiques IA</div>
                <div class="strip-value">${params.ai.criticalCount}</div>
              </div>
            </div>
          </div>
          ${
            params.kpis.avgRating !== null
              ? `
          <div class="chart-block">
            <div class="chart-title">Satisfaction moyenne</div>
            ${renderStars(params.kpis.avgRating)}
            <div class="big-bar" style="margin-top:14px;">
              <span style="width:${ratingPercent}%;"></span>
            </div>
          </div>
          `
              : ""
          }
        </div>
        <div class="page-number">Page 3</div>
      </section>

      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Santé de votre réputation</div>
            <h1 class="page-title">Réactivité et signaux de risque</h1>
            <div class="muted">Lecture des indicateurs existants pour évaluer la solidité de votre réputation.</div>
          </div>
        </div>
        <div class="chart-panel">
          ${
            params.kpis.responseRate !== null
              ? `
          <div class="chart-block">
            <div class="chart-title">Réactivité client</div>
            <div style="font-size:56px;line-height:0.95;font-weight:780;letter-spacing:-0.06em;">
              ${escapeHtml(formatRatio(params.kpis.responseRate) ?? "")}
            </div>
            <div class="big-bar" style="margin-top:22px;">
              <span style="width:${responsePercent}%;background:#10b981;"></span>
            </div>
          </div>
          `
              : ""
          }
          <div class="chart-block">
            <div class="chart-title">Volume et vigilance réputationnelle</div>
            <div class="volume-strip">
              <div class="strip-item">
                <div class="meta-label">Avis analysés</div>
                <div class="strip-value">${params.kpis.reviewsTotal}</div>
              </div>
              <div class="strip-item">
                <div class="meta-label">Avis négatifs</div>
                <div class="strip-value">${params.kpis.negativeCount}</div>
              </div>
              <div class="strip-item">
                <div class="meta-label">Critiques IA</div>
                <div class="strip-value">${params.ai.criticalCount}</div>
              </div>
            </div>
          </div>
        </div>
        ${
          params.perLocation.length > 0
            ? `
        <div class="chart-title" style="margin-top:28px;">Lecture par établissement</div>
        <div class="location-list">
          ${renderMiniLocationCards()}
        </div>
        `
            : ""
        }
        <div class="page-number">Page 4</div>
      </section>

      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Voix client</div>
            <h1 class="page-title">Thèmes à piloter</h1>
            <div class="muted">Interprétation des thèmes et signaux déjà présents dans le rapport.</div>
          </div>
        </div>
        <div class="theme-grid">
          <div class="theme-column">
            <div class="theme-title">Forces perçues</div>
            <div class="text-list">
              <div>${escapeHtml(strengthInsight)}</div>
            </div>
          </div>
          <div class="theme-column">
            <div class="theme-title">Irritants à réduire</div>
            <div class="text-list">
              <div>${escapeHtml(weaknessInsight)}</div>
            </div>
          </div>
          ${
            tags.length
              ? `
          <div class="theme-column">
            <div class="theme-title">Leviers d'opportunité</div>
            ${tags.slice(0, 5).map(renderTag).join("")}
          </div>
          `
              : ""
          }
          <div class="theme-column">
            <div class="theme-title">Risques à surveiller</div>
            <div class="text-list">
              <div>${escapeHtml(rewritePdfInsight(`${params.kpis.untreatedNegativeCount} avis négatifs nécessitent une réponse ; priorité à leur traitement.`))}</div>
              <div>${escapeHtml(rewritePdfInsight(`${params.ai.criticalCount} avis critiques IA surveillés, sans action obligatoire si déjà répondus.`))}</div>
              ${
                params.untreatedNegatives[0]
                  ? `<div>${escapeHtml(params.untreatedNegatives[0].comment)}</div>`
                  : ""
              }
            </div>
          </div>
        </div>
        <div class="page-number">Page 5</div>
      </section>

      ${
        hasActionItems
          ? `
      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Priorités recommandées</div>
            <h1 class="page-title">Plan de décision</h1>
            <div class="muted">Priorisation des signaux déjà présents dans la synthèse IA.</div>
          </div>
        </div>
        <div class="action-grid" style="grid-template-columns: repeat(3, 1fr);">
          ${
            highImpactActions.length
              ? `
          <div class="action-card action-high">
            <div class="action-title">Priorité immédiate</div>
            ${renderActionItems(highImpactActions)}
          </div>
          `
              : ""
          }
          ${
            mediumImpactActions.length
              ? `
          <div class="action-card">
            <div class="action-title">Priorité de consolidation</div>
            ${renderActionItems(mediumImpactActions)}
          </div>
          `
              : ""
          }
          ${
            lowImpactActions.length
              ? `
          <div class="action-card">
            <div class="action-title">À surveiller</div>
            ${renderActionItems(lowImpactActions)}
          </div>
          `
              : ""
          }
        </div>
        <div class="page-number">Page 6</div>
      </section>
      `
          : ""
      }

      <section class="page">
        <div class="section-header">
          <div>
            <div class="page-kicker">Ce que nous recommandons</div>
            <h1 class="page-title">Décision du mois</h1>
          </div>
        </div>
        <div class="conclusion-panel">
          <div>
            <div class="eyebrow">Lecture IA</div>
            <div class="conclusion-text">${escapeHtml(mainInsight)}</div>
            <div style="margin-top:26px;display:grid;gap:10px;">
              <div class="eyebrow">Prochaine action recommandée</div>
              <div style="font-size:16px;line-height:1.45;color:#e2e8f0;">
                ${escapeHtml(priorityInsight)}
              </div>
            </div>
          </div>
          <div>
            <div class="score-label">Business Health Score</div>
            <div class="score-value" style="font-size:68px;">${businessHealthScore}</div>
          </div>
        </div>
        <div class="page-number">Page 7</div>
      </section>
    </body>
  </html>
  `;
};

class ReportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type GeneratePremiumReportParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any;
  reportId: string;
  requestId: string;
  userId?: string;
  htmlOnly?: boolean;
  includeEmailPayload?: boolean;
};

export const generatePremiumReport = async (
  params: GeneratePremiumReportParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const {
    supabaseAdmin,
    reportId,
    requestId,
    userId,
    htmlOnly,
    includeEmailPayload
  } = params;

  logRequest("[reports]", { requestId, reportId, renderMode: "premium" });

  let reportQuery = supabaseAdmin
    .from("reports")
    .select(
      "id, user_id, name, locations, period_preset, from_date, to_date, notes"
    )
    .eq("id", reportId);
  if (userId) {
    reportQuery = reportQuery.eq("user_id", userId);
  }
  const { data: report, error: reportError } = await reportQuery.maybeSingle();
  if (reportError || !report) {
    throw new ReportError("Report not found", 404);
  }

  const reportUserId = report.user_id;

  let locationsLabel = "Établissements: Tous";
  let selectedLocationNames: string[] = [];
  const locationNameByResource = new Map<string, string>();
  if (Array.isArray(report.locations) && report.locations.length > 0) {
    const { data: locationRows } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name, location_title")
      .eq("user_id", reportUserId)
      .in("location_resource_name", report.locations);
    const titles = (locationRows ?? [])
      .map((row) => {
        const label = normalizeLocationTitle(
          row.location_title || "Établissement"
        );
        if (row.location_resource_name) {
          locationNameByResource.set(row.location_resource_name, label);
        }
        return label;
      })
      .filter(Boolean) as string[];
    const uniqueTitles = Array.from(new Set(titles));
    selectedLocationNames = uniqueTitles;
    locationsLabel =
      uniqueTitles.length === 1
        ? `Établissement: ${uniqueTitles[0]}`
        : `${uniqueTitles.length} établissements`;
  }
  const branding = await resolveReportBranding(
    supabaseAdmin,
    reportUserId,
    report.name,
    selectedLocationNames
  );

  await supabaseAdmin
    .from("reports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", reportId);

  try {
    const preset = normalizePreset(report.period_preset ?? "last_30_days");
    const { from, to } = getRange(preset, report.from_date, report.to_date);
    const fromLabel = formatDate(from);
    const toLabel = formatDate(to);
    const periodLabel =
      preset === "all_time"
        ? "Période: Depuis toujours"
        : fromLabel && toLabel
          ? `Période: ${fromLabel} au ${toLabel}`
          : "Période analysée";

    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, rating, comment, create_time, location_id, author_name, reply_text, replied_at, review_ai_insights(sentiment, sentiment_score), review_ai_tags(ai_tags(tag, category))"
      )
      .eq("user_id", reportUserId);
    if (Array.isArray(report.locations) && report.locations.length > 0) {
      query = query.in("location_id", report.locations);
    }
    if (from) {
      query = query.gte("create_time", from.toISOString());
    }
    if (to) {
      query = query.lte("create_time", to.toISOString());
    }

    const { data: reviewsData, error: reviewsError } = await query;
    if (reviewsError) {
      throw reviewsError;
    }

    const reviews = (reviewsData ?? []) as ReviewRow[];
    const reviewsTotal = reviews.length;
    const ratingValues = reviews
      .map((review) => (typeof review.rating === "number" ? review.rating : null))
      .filter((value): value is number => typeof value === "number");
    const avgRating =
      ratingValues.length > 0
        ? ratingValues.reduce((acc, value) => acc + value, 0) / ratingValues.length
        : null;

    const replyable = reviews.filter(
      (review) => typeof review.comment === "string" && review.comment.trim() !== ""
    );
    const replied = replyable.filter(
      (review) =>
        (typeof review.reply_text === "string" && review.reply_text.trim() !== "") ||
        typeof review.replied_at === "string"
    );
    const responseRate =
      replyable.length > 0 ? replied.length / replyable.length : null;

    let positiveCount = 0;
    void positiveCount;
    let negativeCount = 0;
    let untreatedNegativeCount = 0;
    let aiCriticalCount = 0;
    const tagCounts = new Map<string, number>();
    const perLocationStats = new Map<
      string,
      {
        name: string;
        reviewsTotal: number;
        ratingSum: number;
        ratingCount: number;
        replyable: number;
        replied: number;
        positiveCount: number;
        negativeCount: number;
        untreatedNegativeCount: number;
      }
    >();
    const untreatedNegatives: Array<{
      comment: string;
      rating: number | null;
      date: string;
      dateValue: number;
      author: string | null;
      location: string;
    }> = [];

    reviews.forEach((review) => {
      const insight = asOne(review.review_ai_insights);
      const tags = Array.isArray(review.review_ai_tags)
        ? review.review_ai_tags
            .map((tagRow) => tagRow?.ai_tags)
            .filter(
              (tag): tag is { tag?: string | null; category?: string | null } =>
                Boolean(tag)
            )
        : [];
      let hasNegativeTag = false;
      tags.forEach((tag) => {
        if (typeof tag.tag === "string") {
          const key = tag.tag.toLowerCase();
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
        }
        if (tag.category === "negative") {
          hasNegativeTag = true;
        }
      });
      const ratingValue =
        typeof review.rating === "number" ? review.rating : null;
      const isNegativeByRating = ratingValue !== null && ratingValue <= 2;
      const isAiCritical =
        insight?.sentiment === "negative" ||
        (typeof insight?.sentiment_score === "number" &&
          insight.sentiment_score < 0.4) ||
        hasNegativeTag;
      const isPositive =
        (ratingValue !== null && ratingValue >= 4) ||
        insight?.sentiment === "positive";
      if (isPositive) {
        positiveCount += 1;
      }
      if (isNegativeByRating) {
        negativeCount += 1;
      }
      if (isAiCritical) {
        aiCriticalCount += 1;
      }

      const isReplyable =
        typeof review.comment === "string" && review.comment.trim() !== "";
      const isReplied =
        (typeof review.reply_text === "string" &&
          review.reply_text.trim() !== "") ||
        typeof review.replied_at === "string";
      const isUntreated = isNegativeByRating && !isReplied;
      if (isUntreated) {
        untreatedNegativeCount += 1;
      }

      const locationKey = review.location_id ?? "unknown";
      const locationName =
        locationNameByResource.get(locationKey) ?? "Établissement";
      const stats =
        perLocationStats.get(locationKey) ??
        {
          name: locationName,
          reviewsTotal: 0,
          ratingSum: 0,
          ratingCount: 0,
          replyable: 0,
          replied: 0,
          positiveCount: 0,
          negativeCount: 0,
          untreatedNegativeCount: 0
        };
      stats.reviewsTotal += 1;
      if (ratingValue !== null) {
        stats.ratingSum += ratingValue;
        stats.ratingCount += 1;
      }
      if (isReplyable) stats.replyable += 1;
      if (isReplied) stats.replied += 1;
      if (isPositive) stats.positiveCount += 1;
      if (isNegativeByRating) stats.negativeCount += 1;
      if (isUntreated) stats.untreatedNegativeCount += 1;
      perLocationStats.set(locationKey, stats);

      if (isUntreated) {
        const commentText = (review.comment ?? "").trim();
        untreatedNegatives.push({
          comment: commentText || "Avis sans commentaire",
          rating: ratingValue,
          date: review.create_time ? review.create_time.slice(0, 10) : "",
          dateValue: review.create_time
            ? new Date(review.create_time).getTime()
            : 0,
          author: review.author_name ?? null,
          location: locationName
        });
      }
    });

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    const perLocation = Array.from(perLocationStats.values()).map((row) => ({
      name: row.name,
      reviewsTotal: row.reviewsTotal,
      avgRating: row.ratingCount > 0 ? row.ratingSum / row.ratingCount : null,
      responseRate: row.replyable > 0 ? row.replied / row.replyable : null,
      untreatedNegativeCount: row.untreatedNegativeCount,
      positiveCount: row.positiveCount,
      negativeCount: row.negativeCount
    }));
    perLocation.sort((a, b) => b.reviewsTotal - a.reviewsTotal);
    const untreatedList = untreatedNegatives
      .sort((a, b) => b.dateValue - a.dateValue)
      .slice(0, 8)
      .map(({ dateValue, ...rest }) => {
        void dateValue;
        return rest;
      });
    const aiSummary = buildAiSummary({
      avgRating,
      responseRate,
      negativeCount,
      untreatedNegativeCount,
      reviewsTotal,
      topTags,
      aiCriticalCount
    });

    const reportPayload: PremiumReportPayload = {
      title: report.name,
      subtitle: periodLabel,
      locationsLabel,
      notes: report.notes ?? null,
      ...branding,
      kpis: {
        reviewsTotal,
        avgRating,
        responseRate,
        negativeCount,
        untreatedNegativeCount
      },
      ai: {
        criticalCount: aiCriticalCount,
        topTags
      },
      untreatedNegatives: untreatedList,
      aiSummary,
      perLocation
    };

    const html = buildHtml(reportPayload);

    if (htmlOnly) {
      return {
        ok: true,
        reportId,
        html,
        ...(includeEmailPayload ? { emailPayload: reportPayload } : {})
      };
    }

    const pdfBytes = await renderPdfFromHtml(html);

    const storagePath = `${reportUserId}/${reportId}/${Date.now()}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("reports")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true
      });
    if (uploadError) {
      await supabaseAdmin
        .from("reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      throw uploadError;
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("reports")
      .createSignedUrl(storagePath, 60 * 60);
    if (signError) {
      await supabaseAdmin
        .from("reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      throw signError;
    }

    await supabaseAdmin
      .from("reports")
      .update({
        status: "done",
        storage_path: storagePath,
        last_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", reportId);

    return {
      ok: true,
      reportId,
      pdf: { path: storagePath, url: signed?.signedUrl ?? null },
      ...(includeEmailPayload ? { emailPayload: reportPayload } : {})
    };
  } catch (error) {
    console.error("[reports] generate_html failed", error);
    await supabaseAdmin
      .from("reports")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", reportId);
    throw new ReportError("Report generation failed", 500);
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

  const { supabaseAdmin, userId } = auth;
  const requestId = getRequestId(req);
  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const reportId = payload?.report_id as string | undefined;

  if (!reportId) {
    return res.status(400).json({ error: "Missing report_id" });
  }

  const htmlOnly =
    req.query?.html === "1" && process.env.NODE_ENV !== "production";

  try {
    const result = await generatePremiumReport({
      supabaseAdmin,
      reportId,
      requestId,
      userId,
      htmlOnly
    });
    if ("html" in result) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(result.html);
    }
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof ReportError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(status).json({ error: message });
  }
}
