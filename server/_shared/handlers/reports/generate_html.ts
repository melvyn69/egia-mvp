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
const HEALTH_SCORE_PENDING_NOTICE =
  "Le Business Health Score apparaîtra automatiquement lorsque suffisamment d'historique sera disponible.";

const normalizeLocationTitle = (value: string) =>
  value.replace(/\s*-\s*/g, " - ").replace(/\s{2,}/g, " ").trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
  businessId: string,
  entityId: string,
  logoPath: string | null
) => {
  const expectedPrefix = `business/${businessId}/legal_entities/${entityId}/logo.`;
  if (
    !logoPath ||
    !logoPath.startsWith(expectedPrefix) ||
    !["png", "jpg", "webp"].includes(logoPath.slice(expectedPrefix.length))
  ) {
    return null;
  }
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
      .select("id, company_name, legal_name, logo_path, is_default, created_at")
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const entity = Array.isArray(entities)
      ? (entities[0] as
          | {
              id?: string | null;
              company_name?: string | null;
              legal_name?: string | null;
              logo_path?: string | null;
            }
          | undefined)
      : undefined;
    const companyName = entity?.company_name?.trim() || settingsName || fallback;
    const legalName = entity?.legal_name?.trim() || null;
    const logoUrl = entity?.id
      ? await getSignedBrandLogoUrl(
          supabaseAdmin,
          businessId,
          entity.id,
          entity.logo_path ?? null
        )
      : null;

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
      ? null
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
  const ratingPercent =
    params.kpis.avgRating === null
      ? 0
      : Math.max(0, Math.min(100, (params.kpis.avgRating / 5) * 100));
  const responsePercent =
    params.kpis.responseRate === null
      ? 0
      : Math.max(0, Math.min(100, params.kpis.responseRate * 100));
  const healthPercent =
    businessHealthScoreValue === null
      ? null
      : Math.max(0, Math.min(100, businessHealthScoreValue));
  const sourceSummaryItems = params.aiSummary.filter(
    (item) => item.trim() && item.trim() !== EMPTY_DASH
  );
  const summarySignals = sourceSummaryItems
    .map((raw) => ({ raw, text: rewritePdfInsight(raw).trim() }))
    .filter((item) => item.text)
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.text === item.text) === index
    );
  const selectInsightSlots = () => {
    const takeMatching = (patterns: RegExp[], used: Set<string>) => {
      const match = summarySignals.find(
        (item) =>
          !used.has(item.text) &&
          patterns.some(
            (pattern) => pattern.test(item.raw) || pattern.test(item.text)
          )
      );
      if (!match) return "";
      used.add(match.text);
      return match.text;
    };

    const summary = summarySignals[0]?.text ?? "";
    const used = new Set<string>(summary ? [summary] : []);
    if (summarySignals.length <= 1) {
      return { summary, risk: "", action: "" };
    }

    return {
      summary,
      risk: takeMatching(
        [/négatif/i, /critique/i, /vigilance/i, /réponse prioritaire/i],
        used
      ),
      action: takeMatching(
        [/priorit/i, /nécessitent/i, /levier/i, /traitement/i],
        used
      )
    };
  };
  const insightSlots = selectInsightSlots();
  const compactInsight = (value: string, maxLength = 84) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
    const clean = firstSentence.replace(/\s*[;:]\s*$/, "").trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}.`;
  };
  const renderActionItems = (items: string[]) =>
    items
      .map((item) => compactInsight(item, 76))
      .filter(Boolean)
      .map(
        (item) =>
          `<div class="action-item">${escapeHtml(item)}</div>`
      )
      .join("");
  const renderInsightBanner = (label: string, value: string) => {
    const text = compactInsight(value, 96);
    if (!text) return "";
    return `
    <div class="insight-banner">
      <div class="insight-banner-label">${escapeHtml(label)}</div>
      <div class="insight-banner-text">${escapeHtml(text)}</div>
    </div>
  `;
  };
  const renderConsultHeader = (kicker: string, title: string) => `
    <div class="consult-header">
      <div>
        <div class="page-kicker">${escapeHtml(kicker)}</div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
      </div>
      <div class="header-rule"></div>
    </div>
  `;
  const renderBoardMetric = (
    label: string,
    value: string,
    index: number,
    featured = false,
    detail?: string | null
  ) => `
    <div class="${featured ? "board-metric board-metric-featured" : "board-metric"}">
      <div class="metric-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="board-label">${escapeHtml(label)}</div>
      <div class="board-value">${escapeHtml(value)}</div>
      ${
        detail
          ? `<div class="board-detail">${escapeHtml(detail)}</div>`
          : ""
      }
    </div>
  `;
  const renderGauge = (
    label: string,
    value: string,
    percent: number | null,
    caption: string
  ) => {
    if (percent === null || !Number.isFinite(percent)) return "";
    const safePercent = Math.max(0, Math.min(100, percent));
    return `
      <div class="viz-card viz-gauge-card">
        <div class="viz-label">${escapeHtml(label)}</div>
        <div class="gauge-shell">
          <div class="gauge-ring" style="background: conic-gradient(#2563eb 0 ${safePercent}%, #e2e8f0 ${safePercent}% 100%);">
            <div class="gauge-core">
              <div class="gauge-value">${escapeHtml(value)}</div>
              <div class="gauge-caption">${escapeHtml(caption)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  };
  const renderDonut = (
    label: string,
    value: string,
    percent: number | null,
    caption: string
  ) => {
    if (percent === null || !Number.isFinite(percent)) return "";
    const safePercent = Math.max(0, Math.min(100, percent));
    return `
      <div class="viz-card donut-card">
        <div class="viz-label">${escapeHtml(label)}</div>
        <div class="donut-row">
          <div class="donut-ring" style="background: conic-gradient(#2563eb 0 ${safePercent}%, #e2e8f0 ${safePercent}% 100%);">
            <div class="donut-core"></div>
          </div>
          <div>
            <div class="donut-value">${escapeHtml(value)}</div>
            <div class="donut-caption">${escapeHtml(caption)}</div>
          </div>
        </div>
      </div>
    `;
  };
  const renderProgress = (
    label: string,
    value: string,
    percent: number | null
  ) => {
    if (percent === null || !Number.isFinite(percent)) return "";
    const safePercent = Math.max(0, Math.min(100, percent));
    return `
      <div class="progress-row">
        <div class="progress-top">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
        <div class="progress-track">
          <span style="width:${safePercent}%;"></span>
        </div>
      </div>
    `;
  };
  const renderHorizontalBars = (
    title: string,
    items: Array<{ label: string; value: number }>
  ) => {
    const validItems = items.filter((item) => Number.isFinite(item.value));
    if (!validItems.length) return "";
    const maxValue = Math.max(...validItems.map((item) => item.value));
    if (maxValue <= 0) return "";
    return `
      <div class="viz-card bars-card">
        <div class="viz-label">${escapeHtml(title)}</div>
        <div class="bars-list">
          ${validItems
            .map((item) => {
              const width =
                item.value <= 0
                  ? 0
                  : Math.max(2, Math.min(100, (item.value / maxValue) * 100));
              return `
                <div class="bar-row">
                  <div class="bar-meta">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${escapeHtml(formatCoverNumber(item.value))}</strong>
                  </div>
                  <div class="bar-track">
                    <span style="width:${width}%;"></span>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  };
  const renderMiniSparkline = (
    label: string,
    values: number[],
    caption: string
  ) => {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length < 3) return "";
    const maxValue = Math.max(...validValues);
    const minValue = Math.min(...validValues);
    if (maxValue <= 0) return "";
    const range = maxValue - minValue || 1;
    const points = validValues
      .map((value, index) => {
        const x = (index / (validValues.length - 1)) * 100;
        const y = 34 - ((value - minValue) / range) * 28;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return `
      <div class="viz-card spark-card">
        <div class="viz-label">${escapeHtml(label)}</div>
        <svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${points}" />
        </svg>
        <div class="spark-caption">${escapeHtml(caption)}</div>
      </div>
    `;
  };
  const renderTimelineItem = (
    label: string,
    value: string,
    detail: string,
    index: number
  ) => `
    <div class="timeline-item">
      <div class="timeline-index">${String(index + 1).padStart(2, "0")}</div>
      <div>
        <div class="timeline-label">${escapeHtml(label)}</div>
        <div class="timeline-value">${escapeHtml(value)}</div>
        <div class="timeline-detail">${escapeHtml(compactInsight(detail, 72))}</div>
      </div>
    </div>
  `;
  const renderThemeCloud = () => {
    if (!tags.length) return "";
    const cloudItems = tags.slice(0, 10).map((tag, index) => ({
      label: tag.tag,
      value: formatCoverNumber(tag.count),
      size: Math.min(3, Math.floor(index / 3)),
      stars: "★".repeat(Math.max(3, 5 - Math.min(index, 2)))
    }));

    return cloudItems
      .map(
        (item) => `
    <div class="theme-pill theme-size-${item.size}">
      <em>${escapeHtml(item.stars)}</em>
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `
      )
      .join("");
  };
  const renderVerticalActionCard = (
    title: string,
    items: string[],
    index: number,
    featured = false
  ) => {
    const renderedItems = renderActionItems(items);
    if (!renderedItems) return "";
    return `
    <div class="${featured ? "action-lane-card action-lane-featured" : "action-lane-card"}">
      <div class="action-lane-index">${String(index + 1).padStart(2, "0")}</div>
      <div>
        <div class="action-title">${escapeHtml(title)}</div>
        <div class="action-lane-items">
          ${renderedItems}
        </div>
      </div>
    </div>
  `;
  };
  const performanceBoardMetrics = [
    {
      label: "Avis analysés",
      value: formatCoverNumber(params.kpis.reviewsTotal),
      featured: true
    },
    ...(params.kpis.avgRating !== null
      ? [
          {
            label: "Note moyenne",
            value: formatRating(params.kpis.avgRating) ?? "",
            featured: false
          }
        ]
      : []),
    ...(params.kpis.responseRate !== null
      ? [
          {
            label: "Taux de réponse",
            value: formatRatio(params.kpis.responseRate) ?? "",
            featured: false
          }
        ]
      : []),
    {
      label: "Avis négatifs",
      value: formatCoverNumber(params.kpis.negativeCount),
      featured: false
    }
  ].map((metric, index) =>
    renderBoardMetric(metric.label, metric.value, index, metric.featured)
  );
  const reputationTimelineItems = [
    ...(businessHealthScore
      ? [
          {
            label: "Score",
            value: businessHealthScore,
            detail: "Score actuel"
          }
        ]
      : []),
    {
      label: "Volume",
      value: formatCoverNumber(params.kpis.reviewsTotal),
      detail: "Avis analysés"
    },
    {
      label: "Vigilance",
      value: formatCoverNumber(params.kpis.negativeCount),
      detail: "Avis négatifs"
    },
    {
      label: "Réponse",
      value: formatCoverNumber(params.kpis.untreatedNegativeCount),
      detail: "Réponses prioritaires"
    },
    {
      label: "IA",
      value: formatCoverNumber(params.ai.criticalCount),
      detail: "Avis critiques IA"
    }
  ].map((item, index) =>
    renderTimelineItem(item.label, item.value, item.detail, index)
  );
  const healthGauge = businessHealthScore
    ? renderGauge(
        "Business Health Score",
        businessHealthScore,
        healthPercent,
        "Score actuel"
      )
    : "";
  const ratingGauge =
    params.kpis.avgRating === null
      ? ""
      : renderGauge(
          "Note moyenne",
          formatRating(params.kpis.avgRating) ?? "",
          ratingPercent,
          "Sur 5"
        );
  const responseDonut =
    params.kpis.responseRate === null
      ? ""
      : renderDonut(
          "Taux de réponse",
          formatRatio(params.kpis.responseRate) ?? "",
          responsePercent,
          "Avis avec réponse"
        );
  const riskShare =
    params.kpis.reviewsTotal > 0
      ? (params.kpis.negativeCount / params.kpis.reviewsTotal) * 100
      : null;
  const riskDonut =
    riskShare === null
      ? ""
      : renderDonut(
          "Avis négatifs",
          formatCoverNumber(params.kpis.negativeCount),
          riskShare,
          "Part des avis analysés"
        );
  const progressVisuals = [
    healthPercent === null || !businessHealthScore
      ? ""
      : renderProgress("Business Health Score", businessHealthScore, healthPercent),
    params.kpis.avgRating === null
      ? ""
      : renderProgress(
          "Note moyenne",
          formatRating(params.kpis.avgRating) ?? "",
          ratingPercent
        ),
    params.kpis.responseRate === null
      ? ""
      : renderProgress(
          "Taux de réponse",
          formatRatio(params.kpis.responseRate) ?? "",
          responsePercent
        )
  ]
    .filter(Boolean)
    .join("");
  const progressPanel = progressVisuals
    ? `<div class="progress-panel">${progressVisuals}</div>`
    : "";
  const riskBars = renderHorizontalBars("Signaux de vigilance", [
    { label: "Avis négatifs", value: params.kpis.negativeCount },
    {
      label: "Réponses prioritaires",
      value: params.kpis.untreatedNegativeCount
    },
    { label: "Critiques IA", value: params.ai.criticalCount }
  ]);
  const tagBars = renderHorizontalBars(
    "Thèmes les plus cités",
    tags.slice(0, 5).map((tag) => ({ label: tag.tag, value: tag.count }))
  );
  const locationBars = renderHorizontalBars(
    "Répartition établissements",
    params.perLocation
      .slice(0, 5)
      .map((location) => ({
        label: location.name,
        value: location.reviewsTotal
      }))
  );
  const themeSparkline = renderMiniSparkline(
    "Intensité des thèmes",
    tags.slice(0, 6).map((tag) => tag.count),
    "Lecture classée des thèmes existants"
  );
  const locationSparkline = renderMiniSparkline(
    "Volumes établissements",
    params.perLocation.slice(0, 6).map((location) => location.reviewsTotal),
    "Répartition des avis par établissement"
  );
  const themeCloud = renderThemeCloud();
  const summaryVisuals = [healthGauge, progressPanel].filter(Boolean).join("");
  const performanceVisuals = [ratingGauge, responseDonut, riskDonut]
    .filter(Boolean)
    .join("");
  const reputationVisuals = [riskBars, locationBars, locationSparkline]
    .filter(Boolean)
    .join("");
  const voiceVisuals = [tagBars, themeSparkline].filter(Boolean).join("");
  const riskInsightBanner = renderInsightBanner(
    "Lecture risque",
    insightSlots.risk
  );
  const summaryFallback =
    !insightSlots.summary && !summaryVisuals
      ? renderInsightBanner(
          "Lecture factuelle",
          `${formatCoverNumber(params.kpis.reviewsTotal)} avis analysés sur la période.`
        )
      : "";
  const voiceFallback =
    !themeCloud && !voiceVisuals
      ? renderInsightBanner(
          "Lecture thèmes",
          "Aucun thème récurrent exploitable sur la période analysée."
        )
      : "";
  const actionCardDefinitions = [
    ...(insightSlots.action
      ? [
          {
            title: "Priorité IA",
            items: [insightSlots.action],
            featured: true
          }
        ]
      : []),
    ...(params.kpis.responseRate !== null
      ? [
          {
            title: "Réponse",
            items: [`Taux de réponse : ${formatRatio(params.kpis.responseRate)}.`],
            featured: false
          }
        ]
      : []),
    {
      title: "Vigilance",
      items: [
        `Avis négatifs : ${formatCoverNumber(params.kpis.negativeCount)}.`,
        `Réponses prioritaires : ${formatCoverNumber(params.kpis.untreatedNegativeCount)}.`
      ],
      featured: false
    },
    ...(tags[0]
      ? [
          {
            title: "Thème principal",
            items: [`${tags[0].tag} : ${formatCoverNumber(tags[0].count)} avis.`],
            featured: false
          }
        ]
      : []),
    ...(locationCount !== null
      ? [
          {
            title: "Périmètre",
            items: [
              `${formatCoverNumber(locationCount)} établissement${locationCount > 1 ? "s" : ""} concerné${locationCount > 1 ? "s" : ""}.`
            ],
            featured: false
          }
        ]
      : [])
  ];
  const actionCards = actionCardDefinitions
    .map((card, index) =>
      renderVerticalActionCard(card.title, card.items, index, card.featured)
    )
    .filter(Boolean)
    .join("");
  const coverBoardMetrics = [
    ...(businessHealthScore
      ? [
          renderBoardMetric(
            "Business Health Score",
            businessHealthScore,
            0,
            true
          )
        ]
      : []),
    ...coverKpis.map((kpi, index) =>
      renderBoardMetric(
        kpi.label,
        kpi.value,
        index + (businessHealthScore ? 1 : 0)
      )
    )
  ].join("");
  const healthScorePendingBanner = businessHealthScore
    ? ""
    : `<div class="score-pending-banner">${escapeHtml(HEALTH_SCORE_PENDING_NOTICE)}</div>`;
  const conclusionBoardMetrics = [
    ...(businessHealthScore
      ? [
          renderBoardMetric(
            "Business Health Score",
            businessHealthScore,
            0,
            true
          )
        ]
      : []),
    renderBoardMetric(
      "Avis analysés",
      formatCoverNumber(params.kpis.reviewsTotal),
      businessHealthScore ? 1 : 0
    ),
    ...(params.kpis.avgRating !== null
      ? [
          renderBoardMetric(
            "Note moyenne",
            formatRating(params.kpis.avgRating) ?? "",
            businessHealthScore ? 2 : 1
          )
        ]
      : []),
    ...(params.kpis.responseRate !== null
      ? [
          renderBoardMetric(
            "Taux de réponse",
            formatRatio(params.kpis.responseRate) ?? "",
            businessHealthScore ? 3 : 2
          )
        ]
      : []),
    ...(locationCount !== null
      ? [
          renderBoardMetric(
            "Établissements",
            formatCoverNumber(locationCount),
            businessHealthScore ? 4 : 3
          )
        ]
      : [])
  ]
    .slice(0, 4)
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
          color: #020617;
          background: #ffffff;
        }
        .page {
          min-height: 250mm;
          break-after: page;
          page-break-after: always;
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 2mm 0;
          word-break: normal;
          overflow-wrap: normal;
        }
        .page:last-child {
          page-break-after: auto;
        }
        .brand {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          font-weight: 800;
          color: #020617;
        }
        .page-kicker {
          font-size: 10px;
          font-weight: 780;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
        }
        .page-title {
          margin: 6px 0 0;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: 0;
          font-weight: 760;
          color: #020617;
        }
        h1 {
          margin: 0;
        }
        .muted {
          color: #64748b;
        }
        .cover {
          justify-content: flex-start;
          gap: 16px;
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
          border-radius: 18px;
          object-fit: cover;
          border: 1px solid #e2e8f0;
        }
        .cover-brand-name {
          font-size: 22px;
          line-height: 1.08;
          letter-spacing: 0;
          font-weight: 780;
          color: #020617;
        }
        .cover-legal {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.35;
          color: #2563eb;
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
          letter-spacing: 0;
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
          border-radius: 24px;
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
          color: #2563eb;
        }
        .meta-value {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.25;
          font-weight: 740;
          color: #020617;
        }
        .cover-score-hero {
          margin-top: 2px;
          border-radius: 24px;
          padding: 30px;
          min-height: 186px;
          color: #ffffff;
          background:
            linear-gradient(135deg, #020617 0%, #0f172a 64%, #1d4ed8 140%);
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
          color: #bfdbfe;
        }
        .cover-score-value,
        .score-value {
          margin-top: 10px;
          font-size: 76px;
          line-height: 0.9;
          letter-spacing: 0;
          font-weight: 780;
        }
        .cover-score-value {
          font-size: 68px;
          letter-spacing: 0;
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
          border-radius: 24px;
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
          letter-spacing: 0;
          font-weight: 780;
          color: #ffffff;
        }
        .cover-ai-line {
          margin-top: 18px;
          border-radius: 24px;
          padding: 18px 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 20px;
          line-height: 1.25;
          letter-spacing: 0;
          font-weight: 720;
          color: #020617;
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
          background: #020617;
          color: #ffffff;
        }
        .insight-dark .eyebrow {
          color: #cbd5e1;
        }
        .insight-green {
          background: #eff6ff;
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
          letter-spacing: 0;
          font-weight: 780;
          color: #020617;
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
          color: #020617;
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
          background: #2563eb;
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
          color: #020617;
        }
        .volume-strip {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-top: 22px;
        }
        .strip-item {
          border-radius: 24px;
          background: #f8fafc;
          padding: 14px;
        }
        .strip-value {
          font-size: 26px;
          font-weight: 760;
          letter-spacing: 0;
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
          color: #020617;
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
          border-radius: 18px;
          background: #ffffff;
          padding: 12px;
          font-size: 13px;
          line-height: 1.45;
          color: #334155;
          border: 1px solid #e2e8f0;
        }
        .action-high {
          background: #eff6ff;
        }
        .location-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .location-name {
          font-size: 14px;
          font-weight: 740;
          color: #020617;
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
          border-radius: 24px;
          padding: 28px;
          background: #020617;
          color: #ffffff;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 180px;
          gap: 30px;
          align-items: end;
        }
        .conclusion-panel .eyebrow {
          color: #bfdbfe;
        }
        .conclusion-text {
          margin-top: 12px;
          font-size: 28px;
          line-height: 1.15;
          letter-spacing: 0;
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
        .consult-page {
          gap: 14px;
          padding: 8mm 0;
        }
        .consult-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 132px;
          align-items: start;
          gap: 28px;
        }
        .header-rule {
          height: 2px;
          margin-top: 18px;
          border-radius: 999px;
          background: linear-gradient(90deg, #2563eb, rgba(37,99,235,0));
        }
        .consult-cover {
          gap: 20px;
          padding-top: 7mm;
        }
        .cover-stage {
          display: grid;
          gap: 14px;
          margin-top: 8px;
        }
        .brand-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .brand-pill {
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          padding: 9px 12px;
          color: #475569;
          font-size: 12px;
          line-height: 1.2;
          font-weight: 760;
        }
        .cover-stage-title {
          max-width: 680px;
          font-size: 56px;
          line-height: 0.96;
          letter-spacing: 0;
          font-weight: 790;
        }
        .cover-subtitle {
          max-width: 560px;
          font-size: 18px;
          line-height: 1.35;
          color: #475569;
          font-weight: 650;
        }
        .location-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .location-strip-label {
          margin-right: 4px;
          font-size: 11px;
          font-weight: 820;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
        }
        .board-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .cover-board-grid {
          grid-template-columns: repeat(3, 1fr);
        }
        .score-pending-banner {
          border-radius: 999px;
          border: 1px solid #dbeafe;
          background: #ffffff;
          color: #475569;
          padding: 9px 13px;
          font-size: 11px;
          line-height: 1.35;
          font-weight: 700;
          display: inline-block;
          max-width: 420px;
        }
        .board-metric {
          break-inside: avoid;
          page-break-inside: avoid;
          min-height: 128px;
          border-radius: 24px;
          padding: 16px;
          background: #ffffff;
          border: 1px solid rgba(15,23,42,0.06);
          box-shadow: 0 18px 46px rgba(15,23,42,0.045);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .board-metric-featured {
          background: #020617;
          color: #ffffff;
          border-color: #020617;
        }
        .metric-index {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 10px;
          font-weight: 820;
          letter-spacing: 0.08em;
        }
        .board-metric-featured .metric-index {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.16);
          color: #cbd5e1;
        }
        .board-label {
          margin-top: 14px;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
          font-weight: 820;
        }
        .board-metric-featured .board-label {
          color: #cbd5e1;
        }
        .board-value {
          margin-top: 10px;
          font-size: 36px;
          line-height: 0.92;
          letter-spacing: 0;
          font-weight: 790;
        }
        .board-detail {
          margin-top: 10px;
          font-size: 11px;
          line-height: 1.45;
          color: #64748b;
          font-weight: 650;
        }
        .board-metric-featured .board-detail {
          color: #cbd5e1;
        }
        .visual-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .viz-card {
          break-inside: avoid;
          page-break-inside: avoid;
          border-radius: 24px;
          padding: 16px;
          background: rgba(255,255,255,0.88);
          border: 1px solid rgba(15,23,42,0.05);
          box-shadow: 0 16px 38px rgba(15,23,42,0.035);
        }
        .viz-label {
          font-size: 11px;
          line-height: 1.2;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          font-weight: 850;
          color: #64748b;
        }
        .gauge-shell {
          margin-top: 12px;
          display: flex;
          justify-content: center;
        }
        .gauge-ring {
          width: 116px;
          height: 116px;
          border-radius: 999px;
          padding: 9px;
        }
        .gauge-core {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
        }
        .gauge-value {
          font-size: 28px;
          line-height: 0.92;
          font-weight: 820;
          color: #020617;
        }
        .gauge-caption,
        .donut-caption,
        .spark-caption {
          margin-top: 8px;
          font-size: 11px;
          line-height: 1.25;
          color: #64748b;
          font-weight: 700;
        }
        .donut-row {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
        }
        .donut-ring {
          width: 76px;
          height: 76px;
          border-radius: 999px;
          padding: 11px;
        }
        .donut-core {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
        }
        .donut-value {
          font-size: 30px;
          line-height: 0.96;
          font-weight: 820;
          color: #020617;
        }
        .progress-panel {
          display: grid;
          gap: 10px;
        }
        .progress-row {
          border-radius: 24px;
          padding: 12px;
          background: rgba(255,255,255,0.82);
          border: 1px solid rgba(37,99,235,0.12);
        }
        .progress-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          line-height: 1.2;
          color: #475569;
          font-weight: 760;
        }
        .progress-top strong {
          color: #020617;
        }
        .progress-track,
        .bar-track {
          margin-top: 11px;
          height: 7px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .progress-track span,
        .bar-track span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: #2563eb;
        }
        .bars-list {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }
        .bar-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          line-height: 1.25;
          color: #475569;
          font-weight: 730;
        }
        .bar-meta strong {
          color: #020617;
        }
        .sparkline {
          margin-top: 14px;
          width: 100%;
          height: 62px;
          overflow: visible;
        }
        .sparkline polyline {
          fill: none;
          stroke: #2563eb;
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
        }
        .summary-visual-grid {
          grid-template-columns: 220px minmax(0, 1fr);
        }
        .summary-visual-grid .progress-panel {
          align-self: stretch;
        }
        .performance-visual-grid {
          grid-template-columns: repeat(3, 1fr);
        }
        .reputation-body {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 12px;
          align-items: start;
        }
        .reputation-visual-grid {
          grid-template-columns: 1fr;
        }
        .voice-visual-grid {
          grid-template-columns: 1.2fr 0.8fr;
        }
        .hero-decision {
          border-radius: 24px;
          padding: 24px;
          background: linear-gradient(135deg, #020617 0%, #0f172a 74%, #1d4ed8 145%);
          color: #ffffff;
        }
        .hero-decision-label {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 820;
          color: #cbd5e1;
        }
        .hero-decision-text {
          margin-top: 14px;
          max-width: 720px;
          font-size: 30px;
          line-height: 1.12;
          letter-spacing: 0;
          font-weight: 770;
        }
        .insight-banner {
          break-inside: avoid;
          page-break-inside: avoid;
          border-radius: 24px;
          padding: 16px 18px;
          background: #ffffff;
          border: 1px solid rgba(37,99,235,0.14);
          box-shadow: 0 14px 34px rgba(15,23,42,0.04);
        }
        .insight-banner-label {
          font-size: 11px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          font-weight: 850;
          color: #2563eb;
        }
        .insight-banner-text {
          margin-top: 8px;
          font-size: 17px;
          line-height: 1.35;
          letter-spacing: 0;
          font-weight: 760;
        }
        .consult-panel {
          border-radius: 24px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 22px;
        }
        .consult-panel-title {
          font-size: 12px;
          line-height: 1.2;
          font-weight: 820;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #64748b;
        }
        .consult-panel-value {
          margin-top: 18px;
          font-size: 52px;
          line-height: 0.92;
          letter-spacing: 0;
          font-weight: 790;
        }
        .consult-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .wide-panel {
          border-radius: 24px;
          padding: 30px;
          background: #020617;
          color: #ffffff;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 1fr;
          gap: 28px;
          align-items: end;
        }
        .wide-panel .page-kicker {
          color: #cbd5e1;
        }
        .big-score {
          margin-top: 14px;
          font-size: 86px;
          line-height: 0.88;
          letter-spacing: 0;
          font-weight: 790;
        }
        .action-card {
          min-height: 210px;
          border-radius: 24px;
          padding: 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .action-high {
          background: #eff6ff;
          border-color: #bfdbfe;
        }
        .action-item {
          border-radius: 16px;
          padding: 11px 12px;
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(15,23,42,0.06);
          color: #334155;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 650;
        }
        .conclusion-stage {
          border-radius: 24px;
          padding: 34px;
          background: #020617;
          color: #ffffff;
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 30px;
          align-items: center;
        }
        .conclusion-stage .page-kicker {
          color: #cbd5e1;
        }
        .conclusion-line {
          font-size: 34px;
          line-height: 1.04;
          letter-spacing: 0;
          font-weight: 770;
        }
        .consult-cover {
          background:
            linear-gradient(180deg, #ffffff 0%, #ffffff 62%, #f8fafc 62%, #f8fafc 100%);
        }
        .consult-cover .cover-top {
          border-bottom-color: #020617;
        }
        .consult-cover .board-metric-featured {
          min-height: 150px;
        }
        .page-summary {
          background:
            linear-gradient(180deg, #f8fafc 0%, #ffffff 76%);
          padding: 8mm;
          border: 0;
        }
        .page-summary .consult-header {
          grid-template-columns: minmax(0, 1fr) 180px;
        }
        .page-summary .hero-decision {
          background: #ffffff;
          color: #020617;
          border: 0;
          box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
        }
        .page-summary .hero-decision-label {
          color: #2563eb;
        }
        .page-performance {
          background:
            linear-gradient(180deg, #f8fafc 0%, #f8fafc 58%, #ffffff 58%, #ffffff 100%);
          padding: 8mm;
          border: 0;
        }
        .page-performance .board-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .page-performance .board-metric {
          min-height: 158px;
          padding: 20px;
          border: 0;
          box-shadow: 0 20px 52px rgba(15,23,42,0.055);
        }
        .page-performance .board-value {
          font-size: 62px;
          line-height: 0.9;
        }
        .page-performance .consult-panel {
          min-height: 140px;
        }
        .page-performance .consult-panel-value {
          font-size: 54px;
        }
        .page-reputation {
          background: #ffffff;
          padding: 8mm;
          border: 0;
        }
        .page-reputation .reputation-body {
          margin-top: 2px;
        }
        .reputation-timeline {
          position: relative;
          display: grid;
          gap: 12px;
          padding-left: 26px;
        }
        .reputation-timeline::before {
          content: "";
          position: absolute;
          left: 14px;
          top: 18px;
          bottom: 18px;
          width: 2px;
          border-radius: 999px;
          background: #bfdbfe;
        }
        .timeline-item {
          position: relative;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          border-radius: 24px;
          padding: 12px 14px;
          background: #ffffff;
          border: 1px solid rgba(15,23,42,0.06);
          box-shadow: 0 14px 32px rgba(15,23,42,0.035);
        }
        .timeline-index {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2563eb;
          color: #ffffff;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.08em;
        }
        .timeline-label {
          font-size: 11px;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          font-weight: 820;
          color: #2563eb;
        }
        .timeline-value {
          margin-top: 4px;
          font-size: 24px;
          line-height: 1;
          font-weight: 790;
          color: #020617;
        }
        .timeline-detail {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.3;
          color: #64748b;
          font-weight: 650;
        }
        .location-timeline {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .location-timeline .timeline-item {
          min-height: 120px;
          grid-template-columns: 36px minmax(0, 1fr);
        }
        .location-timeline .timeline-index {
          width: 36px;
          height: 36px;
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        .page-voice {
          background:
            linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
          padding: 8mm;
          border: 0;
        }
        .theme-cloud {
          break-inside: avoid;
          page-break-inside: avoid;
          min-height: 238px;
          border-radius: 24px;
          padding: 22px;
          background: #ffffff;
          border: 0;
          box-shadow: inset 0 0 0 1px rgba(15,23,42,0.04);
          display: flex;
          flex-wrap: wrap;
          align-content: center;
          justify-content: center;
          gap: 10px;
        }
        .theme-pill {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border-radius: 999px;
          padding: 10px 14px;
          background: #ffffff;
          color: #020617;
          border: 1px solid #dbeafe;
          font-weight: 780;
          box-shadow: 0 12px 28px rgba(15,23,42,0.05);
        }
        .theme-pill em {
          color: #2563eb;
          font-size: 12px;
          font-style: normal;
          letter-spacing: 0;
        }
        .theme-pill strong {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
        }
        .theme-size-0 {
          font-size: 22px;
          padding: 13px 18px;
        }
        .theme-size-1 {
          font-size: 18px;
        }
        .theme-size-2 {
          font-size: 15px;
        }
        .theme-size-3 {
          font-size: 13px;
        }
        .action-stack {
          display: grid;
          gap: 12px;
        }
        .page-action {
          background: #ffffff;
          padding: 8mm;
          border: 0;
        }
        .action-lane-card {
          break-inside: avoid;
          page-break-inside: avoid;
          min-height: 104px;
          border-radius: 24px;
          padding: 16px;
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          background: #f8fafc;
          border: 0;
          box-shadow: 0 16px 38px rgba(15,23,42,0.045);
        }
        .action-lane-featured {
          background: #020617;
          color: #ffffff;
          border-color: #020617;
        }
        .action-lane-featured .action-title {
          color: #ffffff;
        }
        .action-lane-index {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          color: #020617;
          font-size: 15px;
          font-weight: 850;
        }
        .action-lane-items {
          display: grid;
          gap: 8px;
        }
        .conclusion-board-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .page-conclusion {
          background:
            linear-gradient(135deg, #020617 0%, #0f172a 72%, #1d4ed8 155%);
          color: #ffffff;
          padding: 8mm;
          border: 0;
        }
        .page-conclusion .page-title,
        .page-conclusion .page-kicker {
          color: #ffffff;
        }
        .page-conclusion .header-rule {
          background: linear-gradient(90deg, #60a5fa, rgba(96,165,250,0));
        }
        .projection-roadmap {
          break-inside: avoid;
          page-break-inside: avoid;
          position: relative;
          margin-top: auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          align-items: stretch;
        }
        .projection-roadmap::before {
          content: "";
          position: absolute;
          left: 7%;
          right: 7%;
          top: 28px;
          height: 2px;
          border-radius: 999px;
          background: rgba(147,197,253,0.42);
        }
        .projection-roadmap .board-metric {
          position: relative;
          z-index: 1;
          min-height: 164px;
          background: rgba(255,255,255,0.08);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: none;
        }
        .projection-roadmap .board-label {
          color: #bfdbfe;
        }
        .projection-roadmap .board-detail {
          color: #cbd5e1;
        }
        .projection-roadmap .metric-index {
          background: #ffffff;
          color: #020617;
          border-color: #ffffff;
        }
        .page-conclusion .page-number {
          color: #cbd5e1;
        }
        @media print {
          .page,
          .consult-page {
            gap: 12px;
          }
          .visual-grid,
          .board-grid,
          .action-stack,
          .reputation-timeline {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .page-voice,
          .page-action,
          .page-reputation,
          .page-performance {
            padding-top: 7mm;
            padding-bottom: 7mm;
          }
          .theme-cloud {
            min-height: 220px;
          }
          .action-lane-card {
            min-height: 96px;
          }
        }
      </style>
    </head>
    <body>
      <section class="page consult-page consult-cover">
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
        <div class="cover-stage">
          <div class="brand-line">
            <div class="page-kicker">Cover</div>
            <div class="brand-pill">${escapeHtml(params.subtitle)}</div>
          </div>
          <h1 class="cover-stage-title">Rapport exécutif réputation</h1>
          <div class="cover-subtitle">
            ${escapeHtml(commercialName)} · ${escapeHtml(generatedDate)}
          </div>
          ${
            locationNames.length > 0
              ? `
          <div class="location-strip">
            <span class="location-strip-label">Périmètre</span>
            ${locationNames
              .slice(0, 5)
              .map(
                (name) =>
                  `<span class="cover-location-pill">${escapeHtml(name)}</span>`
              )
              .join("")}
            ${
              locationNames.length > 5
                ? `<span class="cover-location-pill">+${escapeHtml(
                    formatCoverNumber(locationNames.length - 5)
                  )}</span>`
                : ""
            }
          </div>
          `
              : ""
          }
        </div>
        ${healthScorePendingBanner}
        <div class="board-grid cover-board-grid">
          ${coverBoardMetrics}
        </div>
        <div class="page-number">Page 1</div>
      </section>

      <section class="page consult-page page-summary">
        ${renderConsultHeader("Décision", "Executive Summary")}
        ${
          insightSlots.summary
            ? `
        <div class="hero-decision">
          <div class="hero-decision-label">Ce que l'IA retient</div>
          <div class="hero-decision-text">${escapeHtml(compactInsight(insightSlots.summary, 96))}</div>
        </div>
        `
            : ""
        }
        ${
          summaryVisuals
            ? `<div class="visual-grid summary-visual-grid">${summaryVisuals}</div>`
            : ""
        }
        ${summaryFallback}
        <div class="page-number">Page 2</div>
      </section>

      <section class="page consult-page page-performance">
        ${renderConsultHeader("Mesure", "Performance")}
        <div class="board-grid">
          ${performanceBoardMetrics.join("")}
        </div>
        ${
          performanceVisuals
            ? `<div class="visual-grid performance-visual-grid">${performanceVisuals}</div>`
            : ""
        }
        <div class="page-number">Page 3</div>
      </section>

      <section class="page consult-page page-reputation">
        ${renderConsultHeader("Diagnostic", "Réputation")}
        ${riskInsightBanner}
        ${
          reputationVisuals
            ? `
        <div class="reputation-body">
          <div class="reputation-timeline">
            ${reputationTimelineItems.join("")}
          </div>
          <div class="visual-grid reputation-visual-grid">${reputationVisuals}</div>
        </div>
        `
            : `
        <div class="reputation-timeline">
          ${reputationTimelineItems.join("")}
        </div>
        `
        }
        <div class="page-number">Page 4</div>
      </section>

      <section class="page consult-page page-voice">
        ${renderConsultHeader("Signal client", "Voix des clients")}
        ${themeCloud ? `<div class="theme-cloud">${themeCloud}</div>` : ""}
        ${
          voiceVisuals
            ? `<div class="visual-grid voice-visual-grid">${voiceVisuals}</div>`
            : ""
        }
        ${voiceFallback}
        <div class="page-number">Page 5</div>
      </section>

      <section class="page consult-page page-action">
        ${renderConsultHeader("Exécution", "Plan d'action")}
        ${actionCards ? `<div class="action-stack">${actionCards}</div>` : ""}
        <div class="page-number">Page 6</div>
      </section>

      <section class="page consult-page page-conclusion">
        ${renderConsultHeader("Suite", "Projection")}
        ${
          conclusionBoardMetrics
            ? `<div class="projection-roadmap">${conclusionBoardMetrics}</div>`
            : ""
        }
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
