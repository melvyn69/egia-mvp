import { useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { getActiveLegalEntityLogo } from "../lib/businessBranding";
import { cn } from "../lib/utils";
import type { Database } from "../database.types";

type ReportsProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
};

type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
type GeneratedReportRow = Database["public"]["Tables"]["generated_reports"]["Row"];

type Preset =
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "last_year"
  | "this_year"
  | "all_time"
  | "custom";

type RenderMode = "classic" | "premium";
type ReportFilter = "all" | "monthly" | "weekly" | "yearly";
type ReportGenerationResponse = {
  ok?: boolean;
  reportId?: string;
  report_id?: string;
  storage_path?: string | null;
  generated_at?: string | null;
  last_generated_at?: string | null;
  page_count?: number | null;
  pageCount?: number | null;
  pages?: number | null;
  pdf_size?: number | string | null;
  pdfSize?: number | string | null;
  size_bytes?: number | null;
  sizeBytes?: number | null;
  pdf?: {
    path?: string | null;
    url?: string | null;
    page_count?: number | null;
    pageCount?: number | null;
    pages?: number | null;
    size?: number | string | null;
    size_bytes?: number | null;
    sizeBytes?: number | null;
  };
};
type GeneratedReportModalState = {
  report: ReportRow;
  generatedAt: string;
  pdfUrl: string | null;
  storagePath: string | null;
  pageCount: number | null;
  pdfSize: string | null;
};
type ReportsBranding = {
  logoUrl: string | null;
  companyName: string | null;
  legalName: string | null;
};

const reportFilterOptions: Array<{ value: ReportFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "monthly", label: "Mensuel" },
  { value: "weekly", label: "Hebdo" },
  { value: "yearly", label: "Annuel" }
];

const periodLabels: Record<string, string> = {
  last_7_days: "7 derniers jours",
  last_30_days: "30 derniers jours",
  this_month: "Ce mois",
  last_month: "Mois précédent",
  last_year: "Année dernière",
  this_year: "Cette année",
  all_time: "Depuis toujours",
  custom: "Personnalisé"
};

const HEALTH_SCORE_PENDING_NOTICE =
  "Le Business Health Score apparaîtra automatiquement lorsque suffisamment d'historique sera disponible.";

const formatDateLabel = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
};

const formatDistance = (value: number | null | undefined) => {
  if (typeof value !== "number") return null;
  if (value < 1000) return `${value} m`;
  return `${(value / 1000).toFixed(1)} km`;
};

const getReportDateValue = (report: ReportRow) =>
  report.last_generated_at ?? report.updated_at ?? report.created_at;

const getReportTimestamp = (report: ReportRow) => {
  const value = getReportDateValue(report);
  return value ? new Date(value).getTime() : 0;
};

const formatMonthSection = (value: string | null) => {
  if (!value) return "";
  const label = new Date(value).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatReportPeriod = (report: ReportRow) => {
  if (report.period_preset === "custom") {
    const fromLabel = formatDateLabel(report.from_date);
    const toLabel = formatDateLabel(report.to_date);
    return fromLabel && toLabel ? `${fromLabel} - ${toLabel}` : null;
  }
  return report.period_preset ? periodLabels[report.period_preset] ?? report.period_preset : null;
};

const getReportPeriodFamily = (report: ReportRow): ReportFilter => {
  if (report.period_preset === "last_7_days") return "weekly";
  if (report.period_preset === "this_year" || report.period_preset === "last_year") {
    return "yearly";
  }
  if (
    report.period_preset === "last_30_days" ||
    report.period_preset === "this_month" ||
    report.period_preset === "last_month"
  ) {
    return "monthly";
  }
  return "all";
};

const getReportMetric = (report: ReportRow, keys: string[]) => {
  const source = report as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
};

const formatOptionalMetric = (value: unknown, suffix = "") => {
  if (typeof value === "number") {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return null;
};

const formatRatingStars = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.replace(",", ".").replace("/5", ""))
        : null;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  const filled = Math.max(0, Math.min(5, Math.round(numeric)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
};

const formatOptionalPercentMetric = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 0 && value <= 1 ? value * 100 : value;
    return `${Math.round(normalized)}%`;
  }
  if (typeof value === "string" && value.trim()) {
    return value.includes("%") ? value : `${value}`;
  }
  return null;
};

const getNumericReportMetric = (report: ReportRow, keys: string[]) => {
  const value = getReportMetric(report, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getReportTextSignal = (report: ReportRow, keys: string[]) => {
  const source = report as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find(
        (item) => typeof item === "string" && item.trim()
      );
      if (typeof first === "string") return first.trim();
      const firstObject = value.find(
        (item) => item && typeof item === "object"
      ) as Record<string, unknown> | undefined;
      const objectText =
        firstObject &&
        ["label", "name", "title", "summary", "recommendation", "action"]
          .map((field) => firstObject[field])
          .find((item) => typeof item === "string" && item.trim());
      if (typeof objectText === "string") return objectText.trim();
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const objectText = [
        "label",
        "name",
        "title",
        "summary",
        "recommendation",
        "action"
      ]
        .map((field) => record[field])
        .find((item) => typeof item === "string" && item.trim());
      if (typeof objectText === "string") return objectText.trim();
    }
  }
  return null;
};

const formatFileSize = (value: number | string | null | undefined) => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  }
  return `${Math.max(1, Math.round(value / 1024))} Ko`;
};

const getReportHealthScoreValue = (report: ReportRow | null) =>
  report
    ? formatOptionalMetric(
        getReportMetric(report, [
          "business_health_score",
          "businessHealthScore",
          "health_score",
          "score"
        ]),
        "/100"
      )
    : null;

const getReportHealthScoreState = (report: ReportRow | null) => {
  const value = getReportHealthScoreValue(report);
  return {
    value,
    pending: value === null,
    notice: value === null ? HEALTH_SCORE_PENDING_NOTICE : null
  };
};

const getGeneratedPageCount = (data: ReportGenerationResponse | null) =>
  data?.pdf?.page_count ??
  data?.pdf?.pageCount ??
  data?.pdf?.pages ??
  data?.page_count ??
  data?.pageCount ??
  data?.pages ??
  null;

const getGeneratedPdfSize = (data: ReportGenerationResponse | null) =>
  formatFileSize(
    data?.pdf?.size ??
      data?.pdf?.size_bytes ??
      data?.pdf?.sizeBytes ??
      data?.pdf_size ??
      data?.pdfSize ??
      data?.size_bytes ??
      data?.sizeBytes ??
      null
  );

const getReportThemes = (report: ReportRow) => {
  const source = report as unknown as Record<string, unknown>;
  const value =
    source.top_themes ?? source.themes ?? source.top_topics ?? source.top_tags;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const candidate = item as Record<string, unknown>;
        return (
          (typeof candidate.label === "string" && candidate.label) ||
          (typeof candidate.name === "string" && candidate.name) ||
          (typeof candidate.tag === "string" && candidate.tag) ||
          null
        );
      }
      return null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
};

const getReportExecutiveInsight = (report: ReportRow) => {
  const existing = getReportTextSignal(report, [
    "executive_summary",
    "executiveSummary",
    "ai_summary",
    "aiSummary",
    "summary",
    "ai_insight",
    "insight",
    "conclusion"
  ]);
  if (existing) return existing;

  const healthScore = getNumericReportMetric(report, [
    "business_health_score",
    "businessHealthScore",
    "health_score",
    "score"
  ]);
  if (healthScore !== null && healthScore >= 80) {
    return `Business Health Score : ${Math.round(healthScore)}/100.`;
  }

  const rating = getNumericReportMetric(report, [
    "average_rating",
    "avg_rating",
    "rating",
    "note"
  ]);
  if (rating !== null && rating >= 4.5) {
    return `Note moyenne : ${rating.toFixed(1)}/5.`;
  }

  const reviews = getNumericReportMetric(report, [
    "reviews_count",
    "review_count",
    "reviews",
    "avis"
  ]);
  if (reviews !== null) {
    return `${Math.round(reviews)} avis analysés.`;
  }

  return null;
};

const getReportFocusSignal = (report: ReportRow) => {
  const existing = getReportTextSignal(report, [
    "next_best_action",
    "nextBestAction",
    "priority",
    "priorite",
    "priority_action",
    "recommended_action",
    "recommendation",
    "ai_recommendation",
    "main_opportunity",
    "focus_area"
  ]);
  if (existing) return existing;
  return getReportThemes(report)[0] ?? null;
};

const getReportLocationNames = (
  report: ReportRow,
  locations: ReportsProps["locations"]
) => {
  const namesByKey = new Map<string, string>();
  locations.forEach((location) => {
    const label = location.location_title ?? location.location_resource_name;
    namesByKey.set(location.id, label);
    namesByKey.set(location.location_resource_name, label);
  });
  return report.locations
    .map((locationId) => namesByKey.get(locationId) ?? null)
    .filter((item): item is string => Boolean(item));
};

const ReportBrandBlock = ({
  branding,
  locationNames,
  compact = false
}: {
  branding: ReportsBranding;
  locationNames: string[];
  compact?: boolean;
}) => {
  if (!branding.companyName && !branding.logoUrl && locationNames.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex min-w-0 items-center gap-3", compact && "gap-2")}>
      {branding.logoUrl && (
        <img
          src={branding.logoUrl}
          alt={branding.companyName ?? "Logo entreprise"}
          className={cn(
            "shrink-0 rounded-[24px] border border-slate-200 bg-white object-cover shadow-[0_12px_30px_rgba(15,23,42,0.06)]",
            compact ? "h-10 w-10" : "h-12 w-12"
          )}
        />
      )}
      <div className="min-w-0">
        {branding.companyName && (
          <p
            className={cn(
              "truncate font-semibold text-slate-950",
              compact ? "text-sm" : "text-base"
            )}
          >
            {branding.companyName}
          </p>
        )}
        {branding.legalName && !compact && (
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
            {branding.legalName}
          </p>
        )}
        {locationNames.length > 0 && !compact && (
          <p className="mt-1 truncate text-xs text-slate-500">
            {locationNames.slice(0, 3).join(" · ")}
            {locationNames.length > 3 ? ` +${locationNames.length - 3}` : ""}
          </p>
        )}
      </div>
    </div>
  );
};

const ReportHeroMetric = ({
  label,
  value,
  detail,
  highlight = false
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  highlight?: boolean;
}) => (
  <div
    className={cn(
      "rounded-[24px] border p-5 shadow-[0_18px_42px_rgba(15,23,42,0.045)]",
      highlight
        ? "border-[#020617] bg-[#020617] text-white"
        : "border-slate-200/70 bg-white text-slate-950"
    )}
  >
    <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", highlight ? "text-blue-200" : "text-slate-500")}>
      {label}
    </p>
    <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
    {detail && (
      <p className={cn("mt-2 text-xs leading-5", highlight ? "text-slate-300" : "text-slate-500")}>
        {detail}
      </p>
    )}
  </div>
);

const ReportDataPoint = ({
  label,
  value,
  detail
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) => (
  <div className="rounded-[24px] border border-slate-200/70 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
  </div>
);

const ReportReadyKpiCard = ({
  label,
  value,
  detail,
  highlight = false
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  highlight?: boolean;
}) => (
  <div
    className={cn(
      "rounded-[24px] border p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)]",
      highlight
        ? "border-[#020617] bg-[#020617] text-white"
        : "border-slate-100 bg-white text-slate-950"
    )}
  >
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.11em]",
        highlight ? "text-blue-200" : "text-slate-500"
      )}
    >
      {label}
    </p>
    <div className="mt-3 text-3xl font-semibold leading-none tracking-tight">
      {value}
    </div>
    {detail && (
      <p className={cn("mt-3 text-xs leading-5", highlight ? "text-slate-300" : "text-slate-500")}>
        {detail}
      </p>
    )}
  </div>
);

const ReportReadyModal = ({
  state,
  branding,
  locationNames,
  onClose,
  onOpenReport,
  onDownload
}: {
  state: GeneratedReportModalState;
  branding: ReportsBranding;
  locationNames: string[];
  onClose: () => void;
  onOpenReport: () => void;
  onDownload: () => void;
}) => {
  const canAccessPdf = Boolean(state.pdfUrl || state.storagePath);
  const healthScore = getReportHealthScoreState(state.report);
  const periodLabel = formatReportPeriod(state.report);
  const executiveInsight = getReportExecutiveInsight(state.report);
  const focusSignal = getReportFocusSignal(state.report);
  const establishmentCount = locationNames.length || state.report.locations.length;
  const rawRating = getReportMetric(state.report, [
      "average_rating",
      "avg_rating",
      "rating",
      "note"
    ]);
  const rating = formatOptionalMetric(rawRating, "/5");
  const ratingStars = formatRatingStars(rawRating);
  const reviews = formatOptionalMetric(
    getReportMetric(state.report, [
      "reviews_count",
      "review_count",
      "reviews",
      "avis"
    ])
  );
  const responseRate = formatOptionalPercentMetric(
    getReportMetric(state.report, [
      "response_rate",
      "responseRate",
      "response_rate_pct",
      "responses_rate"
    ])
  );
  const negativeReviews = formatOptionalMetric(
    getReportMetric(state.report, [
      "negative_count",
      "negative_reviews",
      "negativeReviews",
      "avis_negatifs"
    ])
  );
  const kpiCards: Array<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    highlight?: boolean;
  }> = [
    ...(healthScore.value
      ? [
          {
            label: "Business Health Score",
            value: healthScore.value,
            highlight: true
          }
        ]
      : []),
    ...(reviews ? [{ label: "Avis analysés", value: reviews }] : []),
    ...(rating
      ? [{ label: "Note moyenne", value: rating, detail: ratingStars }]
      : []),
    ...(negativeReviews
      ? [{ label: "Avis négatifs", value: negativeReviews }]
      : []),
    ...(responseRate ? [{ label: "Taux de réponse", value: responseRate }] : []),
    ...(establishmentCount > 0
      ? [
          {
            label: "Établissements concernés",
            value: establishmentCount
          }
        ]
      : [])
  ];
  const hasAvailablePerformanceKpi = Boolean(
    healthScore.value || reviews || rating || negativeReviews || responseRate
  );
  const showCompactGeneratedSummary =
    healthScore.pending && establishmentCount > 0 && !hasAvailablePerformanceKpi;
  const executiveSummaryLines = showCompactGeneratedSummary
    ? [
        `Rapport généré pour ${establishmentCount} établissement${establishmentCount > 1 ? "s" : ""}.`,
        HEALTH_SCORE_PENDING_NOTICE
      ]
    : [
        executiveInsight,
        !executiveInsight && establishmentCount > 0
          ? `Rapport généré pour ${establishmentCount} établissement${establishmentCount > 1 ? "s" : ""}.`
          : null,
        focusSignal ? `Priorité identifiée : ${focusSignal}` : null
      ].filter((item): item is string => Boolean(item));
  const brandName = branding.companyName ?? state.report.name;

  return (
    <div
      className="report-ready-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-ready-title"
    >
      <div className="report-ready-modal relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-white/80 bg-white shadow-[0_34px_110px_rgba(2,6,23,0.32)]">
        <button
          type="button"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-slate-100 bg-[#f8fafc] px-5 pb-8 pt-7 md:px-10 md:pb-11 md:pt-9">
          <div className="flex flex-wrap items-center gap-3 pr-10 text-sm text-slate-500">
            {branding.logoUrl && (
              <img
                src={branding.logoUrl}
                alt={brandName}
                className="h-10 w-10 rounded-[18px] border border-white bg-white object-cover shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
              />
            )}
            <span className="font-semibold text-slate-950">{brandName}</span>
            {branding.legalName && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="font-medium">{branding.legalName}</span>
              </>
            )}
            {periodLabel && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{periodLabel}</span>
              </>
            )}
          </div>

          <div className="mt-8 max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-[0_10px_24px_rgba(37,99,235,0.10)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Rapport généré
            </div>
            <h3
              id="report-ready-title"
              className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl"
            >
              Votre rapport est prêt.
            </h3>
            {executiveSummaryLines.length > 0 && (
              <div className="mt-5 max-w-3xl rounded-[24px] border border-white bg-white/80 px-5 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                  Résumé exécutif
                </p>
                <div className="mt-3 space-y-2">
                  {executiveSummaryLines.map((line) => (
                    <p
                      key={line}
                      className="text-lg font-semibold leading-7 text-slate-950 md:text-xl md:leading-8"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-4 truncate text-sm font-medium text-slate-500">
              {state.report.name}
            </p>
          </div>
        </div>

        <div className="space-y-5 p-5 md:p-8">
          {!showCompactGeneratedSummary && kpiCards.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {kpiCards.map((card) => (
                <ReportReadyKpiCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  highlight={card.highlight}
                />
              ))}
            </div>
          ) : null}

          {healthScore.pending && !showCompactGeneratedSummary && (
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
              {HEALTH_SCORE_PENDING_NOTICE}
            </div>
          )}

          {focusSignal && (
            <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-slate-900">
              <span className="font-semibold text-blue-700">
                L'IA recommande de concentrer vos efforts sur
              </span>{" "}
              {focusSignal}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <Button
              size="lg"
              className="w-full bg-blue-600 px-7 shadow-[0_18px_38px_rgba(37,99,235,0.24)] hover:bg-blue-700 sm:w-auto"
              disabled={!canAccessPdf}
              onClick={onOpenReport}
            >
              <Eye className="h-4 w-4" />
              Voir le rapport
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={!canAccessPdf}
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
              Télécharger
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-slate-500 hover:text-slate-700 sm:w-auto"
              onClick={onClose}
            >
              Fermer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Reports = ({ session, locations }: ReportsProps) => {
  const supabaseClient = supabase;
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<Preset>("last_30_days");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [renderMode, setRenderMode] = useState<RenderMode>("premium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<ReportFilter>("all");
  const [reportSearch, setReportSearch] = useState("");
  const [generatedReportModal, setGeneratedReportModal] =
    useState<GeneratedReportModalState | null>(null);
  const userId = session?.user?.id ?? null;

  const brandingQuery = useQuery({
    queryKey: ["report-branding", userId],
    queryFn: async () => {
      if (!userId) {
        return {
          logoUrl: null,
          companyName: null,
          legalName: null
        } satisfies ReportsBranding;
      }
      const branding = await getActiveLegalEntityLogo(userId);
      return {
        logoUrl: branding.logoUrl,
        companyName: branding.companyName,
        legalName: branding.legalName
      } satisfies ReportsBranding;
    },
    enabled: Boolean(userId)
  });
  const reportBranding: ReportsBranding = brandingQuery.data ?? {
    logoUrl: null,
    companyName: null,
    legalName: null
  };
  const allLocationNames = useMemo(
    () =>
      locations
        .map((location) => location.location_title ?? location.location_resource_name)
        .filter(Boolean),
    [locations]
  );

  const reportsQuery = useQuery({
    queryKey: ["reports", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) {
        return [] as ReportRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as ReportRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const benchmarkQuery = useQuery({
    queryKey: ["generated-reports", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) {
        return [] as GeneratedReportRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("generated_reports")
        .select("*")
        .eq("report_type", "competitors_benchmark")
        .order("created_at", { ascending: false });
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as GeneratedReportRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        id: location.location_resource_name,
        label: location.location_title ?? location.location_resource_name
      })),
    [locations]
  );

  const resetForm = () => {
    setName("");
    setNotes("");
    setPreset("last_30_days");
    setFrom("");
    setTo("");
    setSelectedLocations([]);
    setRenderMode("premium");
    setEditingId(null);
  };

  const handleEdit = (report: ReportRow) => {
    setEditingId(report.id);
    setName(report.name ?? "");
    setNotes(report.notes ?? "");
    setPreset((report.period_preset as Preset) ?? "last_30_days");
    setFrom(report.from_date ? report.from_date.slice(0, 10) : "");
    setTo(report.to_date ? report.to_date.slice(0, 10) : "");
    setSelectedLocations(report.locations ?? []);
    setRenderMode(
      report.render_mode === "classic" ? "classic" : "premium"
    );
  };

  const handleSave = async () => {
    if (!supabaseClient || !session?.user?.id) {
      setError("Connectez-vous pour enregistrer.");
      return;
    }
    if (!name.trim()) {
      setError("Ajoutez un nom de rapport.");
      return;
    }
    if (selectedLocations.length === 0) {
      setError("Sélectionnez au moins un établissement.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      id: editingId ?? undefined,
      user_id: session.user.id,
      name: name.trim(),
      locations: selectedLocations,
      period_preset: preset,
      from_date: preset === "custom" && from ? new Date(from).toISOString() : null,
      to_date: preset === "custom" && to ? new Date(to).toISOString() : null,
      status: "draft",
      render_mode: renderMode,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error: saveError } = await supabaseClient
      .from("reports")
      .upsert(payload)
      .select()
      .single();
    if (saveError) {
      setError("Impossible de sauvegarder le rapport.");
    } else {
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
    setSaving(false);
  };

  const handleGenerate = async (report: ReportRow) => {
    if (!session?.access_token) {
      setError("Connectez-vous pour générer.");
      return;
    }
    setError(null);
    const mode = report.render_mode === "classic" ? "classic" : "premium";
    const endpoint =
      mode === "premium" ? "/api/reports/generate_html" : "/api/reports/generate";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ report_id: report.id })
    });
    if (!res.ok) {
      setError("Impossible de générer le PDF.");
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | ReportGenerationResponse
      | null;
    const generatedAt =
      data?.generated_at ??
      data?.last_generated_at ??
      new Date().toISOString();
    setGeneratedReportModal({
      report,
      generatedAt,
      pdfUrl: data?.pdf?.url ?? null,
      storagePath: data?.pdf?.path ?? data?.storage_path ?? report.storage_path,
      pageCount: getGeneratedPageCount(data),
      pdfSize: getGeneratedPdfSize(data)
    });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    void queryClient.invalidateQueries({
      queryKey: ["coach-reports-count", session?.user.id ?? null]
    });
  };

  const handleDownload = async (report: ReportRow) => {
    if (!supabaseClient || !report.storage_path) {
      return;
    }
    const { data, error: urlError } = await supabaseClient.storage
      .from("reports")
      .createSignedUrl(report.storage_path, 60);
    if (urlError || !data?.signedUrl) {
      setError("Impossible de télécharger le PDF.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const handleDelete = async (report: ReportRow) => {
    if (!supabaseClient) {
      return;
    }
    const { error: deleteError } = await supabaseClient
      .from("reports")
      .delete()
      .eq("id", report.id);
    if (deleteError) {
      setError("Impossible de supprimer le rapport.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    void queryClient.invalidateQueries({
      queryKey: ["coach-reports-count", session?.user.id ?? null]
    });
  };

  const handleDownloadBenchmark = async (reportId: string) => {
    if (!session?.access_token) {
      setError("Connectez-vous pour télécharger.");
      return;
    }
    setError(null);
    const res = await fetch(
      `/api/reports/competitors-benchmark/pdf?report_id=${reportId}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }
    );
    if (!res.ok) {
      setError("Impossible de télécharger le PDF.");
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `benchmark-${reportId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  };

  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const latestReport = useMemo(
    () =>
      reports.reduce<ReportRow | null>((latest, report) => {
        if (!latest) return report;
        return getReportTimestamp(report) > getReportTimestamp(latest) ? report : latest;
      }, null),
    [reports]
  );
  const filteredReports = useMemo(() => {
    const search = reportSearch.trim().toLowerCase();
    return reports
      .filter((report) => {
        const matchesFilter =
          reportFilter === "all" || getReportPeriodFamily(report) === reportFilter;
        const matchesSearch =
          !search ||
          [
            report.name,
            formatReportPeriod(report),
            report.status,
            report.locations.join(" ")
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);
        return matchesFilter && matchesSearch;
      })
      .slice()
      .sort((a, b) => getReportTimestamp(b) - getReportTimestamp(a));
  }, [reportFilter, reportSearch, reports]);
  const reportGroups = useMemo(() => {
    const groups = new Map<string, { label: string; reports: ReportRow[] }>();
    filteredReports.forEach((report) => {
      const dateValue = getReportDateValue(report);
      const key = dateValue ? new Date(dateValue).toISOString().slice(0, 7) : "undated";
      const label = formatMonthSection(dateValue) || "Historique";
      const group = groups.get(key) ?? { label, reports: [] };
      group.reports.push(report);
      groups.set(key, group);
    });
    return Array.from(groups.values());
  }, [filteredReports]);
  const latestHealthScore = getReportHealthScoreState(latestReport);
  const latestReportDate = latestReport ? formatDateLabel(getReportDateValue(latestReport)) : null;
  const generatedReportLocationNames = generatedReportModal
    ? getReportLocationNames(generatedReportModal.report, locations)
    : [];
  const handleOpenGeneratedReport = () => {
    if (!generatedReportModal) return;
    if (generatedReportModal.pdfUrl) {
      window.open(generatedReportModal.pdfUrl, "_blank", "noopener");
      return;
    }
    if (generatedReportModal.storagePath) {
      void handleDownload({
        ...generatedReportModal.report,
        storage_path: generatedReportModal.storagePath
      });
    }
  };
  const handleDownloadGeneratedReport = () => {
    if (!generatedReportModal) return;
    if (generatedReportModal.storagePath) {
      void handleDownload({
        ...generatedReportModal.report,
        storage_path: generatedReportModal.storagePath
      });
      return;
    }
    if (generatedReportModal.pdfUrl) {
      window.open(generatedReportModal.pdfUrl, "_blank", "noopener");
    }
  };

  return (
    <div className="space-y-8">
      <style>{`
        @keyframes reportReadyFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes reportReadyScale {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .report-ready-backdrop { animation: reportReadyFade 180ms ease-out both; }
          .report-ready-modal { animation: reportReadyScale 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        }
      `}</style>
      {generatedReportModal && (
        <ReportReadyModal
          state={generatedReportModal}
          branding={reportBranding}
          locationNames={generatedReportLocationNames}
          onClose={() => setGeneratedReportModal(null)}
          onOpenReport={handleOpenGeneratedReport}
          onDownload={handleDownloadGeneratedReport}
        />
      )}

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
        <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="flex min-h-[190px] flex-col justify-between">
            <div>
              {(reportBranding.companyName || reportBranding.logoUrl) ? (
                <div className="mb-5">
                  <ReportBrandBlock
                    branding={reportBranding}
                    locationNames={allLocationNames}
                  />
                </div>
              ) : (
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-blue-600 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <h2 className="text-5xl font-semibold tracking-tight text-slate-950">
                Rapports
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-500">
                Retrouvez toute l'évolution de votre réputation.
              </p>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-blue-700">
                Timeline mensuelle
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                PDF premium
              </span>
              {allLocationNames.length > 0 && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {allLocationNames.length} établissement{allLocationNames.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <ReportHeroMetric
              label="Total rapports"
              value={reports.length}
              detail={reports.length > 1 ? "rapports disponibles" : "rapport disponible"}
            />
            {latestReport && latestReportDate && (
              <ReportHeroMetric
                label="Dernier rapport"
                value={latestReportDate}
                detail={latestReport.name}
              />
            )}
            {latestHealthScore.value && (
              <ReportHeroMetric
                label="Business Health Score"
                value={latestHealthScore.value}
                highlight
              />
            )}
            {latestReport && latestHealthScore.pending && (
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:col-span-3 lg:col-span-1 xl:col-span-3">
                {HEALTH_SCORE_PENDING_NOTICE}
              </div>
            )}
          </div>
        </div>
      </section>

      <Card className="overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardHeader className="p-5 pb-0 md:p-6 md:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{editingId ? "Modifier un rapport" : "Créer un rapport"}</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Préparez le prochain PDF sans quitter l'historique.
              </p>
            </div>
            <Badge variant="neutral">{renderMode === "premium" ? "Premium" : "Classique"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Nom du rapport
              </label>
              <input
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Rapport mensuel"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Période</label>
              <select
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
              >
                <option value="last_7_days">7 derniers jours</option>
                <option value="last_30_days">30 derniers jours</option>
                <option value="this_month">Ce mois</option>
                <option value="last_month">Mois précédent</option>
                <option value="last_year">Année dernière</option>
                <option value="this_year">Cette année</option>
                <option value="all_time">Depuis toujours</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {preset === "custom" && (
              <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
                <input
                  type="date"
                  className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500">
                Établissements
              </label>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {locationOptions.map((location) => (
                  <label
                    key={location.id}
                    className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-600 transition hover:border-blue-200 hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLocations.includes(location.id)}
                      onChange={(event) => {
                        setSelectedLocations((prev) =>
                          event.target.checked
                            ? [...prev, location.id]
                            : prev.filter((id) => id !== location.id)
                        );
                      }}
                    />
                    <span className="min-w-0 truncate">{location.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Notes</label>
              <textarea
                className="mt-2 min-h-[112px] w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes internes à inclure dans le rapport."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Template PDF
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
                <label
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-full border px-3 py-2",
                    renderMode === "classic"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white/70"
                  )}
                >
                  <input
                    type="radio"
                    name="render_mode"
                    value="classic"
                    checked={renderMode === "classic"}
                    onChange={() => setRenderMode("classic")}
                  />
                  Classique
                </label>
                <label
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-full border px-3 py-2",
                    renderMode === "premium"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white/70"
                  )}
                >
                  <input
                    type="radio"
                    name="render_mode"
                    value="premium"
                    checked={renderMode === "premium"}
                    onChange={() => setRenderMode("premium")}
                  />
                  Premium
                </label>
              </div>
            </div>
            {error && (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardHeader className="p-5 pb-0 md:p-6 md:pb-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Historique</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Une timeline claire de vos rapports et de leur aperçu.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {reportFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      reportFilter === option.value
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    )}
                    onClick={() => setReportFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 sm:w-64"
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  placeholder="Rechercher"
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          {reportsQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full rounded-[24px]" />
              <Skeleton className="h-40 w-full rounded-[24px]" />
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[18px] bg-white text-blue-600 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                Aucun rapport pour le moment
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Créez un premier rapport pour suivre l'évolution de votre réputation dans le temps.
              </p>
            </div>
          ) : reportGroups.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[18px] bg-white text-blue-600 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <Search className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                Aucun rapport ne correspond aux filtres
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Ajustez la période ou la recherche pour retrouver un rapport existant.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {reportGroups.map((group) => (
                <section key={group.label} className="relative pl-7 md:pl-9">
                  <div className="absolute left-2 top-9 h-[calc(100%-1rem)] w-px bg-blue-100 md:left-3" />
                  <div className="mb-4 flex items-center gap-3">
                    <span className="absolute left-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 ring-4 ring-white md:left-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {group.label}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {group.reports.map((report) => {
                      const rawHealthScore = getReportMetric(report, [
                        "business_health_score",
                        "businessHealthScore",
                        "health_score",
                        "score"
                      ]);
                      const healthScore = getReportHealthScoreState(report);
                      const scoreWidth =
                        typeof rawHealthScore === "number"
                          ? Math.min(Math.max(rawHealthScore, 0), 100)
                          : 0;
                      const rating = formatOptionalMetric(
                        getReportMetric(report, [
                          "average_rating",
                          "avg_rating",
                          "rating",
                          "note"
                        ]),
                        "/5"
                      );
                      const reviews = formatOptionalMetric(
                        getReportMetric(report, [
                          "reviews_count",
                          "review_count",
                          "reviews",
                          "avis"
                        ])
                      );
                      const responseRate = formatOptionalPercentMetric(
                        getReportMetric(report, [
                          "response_rate",
                          "responseRate",
                          "response_rate_pct",
                          "responses_rate"
                        ])
                      );
                      const evolution = formatOptionalMetric(
                        getReportMetric(report, [
                          "evolution",
                          "trend",
                          "rating_delta",
                          "score_delta"
                        ])
                      );
                      const themes = getReportThemes(report);
                      const periodLabel = formatReportPeriod(report);
                      const generatedLabel = formatDateLabel(report.last_generated_at);
                      const reportLocationNames = getReportLocationNames(report, locations);
                      const reportLocationCount =
                        reportLocationNames.length || report.locations.length;

                      return (
                        <article
                          key={report.id}
                          className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_24px_64px_rgba(15,23,42,0.07)] md:p-6"
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              {(reportBranding.companyName || reportBranding.logoUrl) && (
                                <div className="mb-3">
                                  <ReportBrandBlock
                                    branding={reportBranding}
                                    locationNames={reportLocationNames}
                                    compact
                                  />
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="truncate text-lg font-semibold text-slate-950">
                                  {report.name}
                                </h4>
                                <Badge variant="neutral">{report.status}</Badge>
                              </div>
                              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                {periodLabel && <span>{periodLabel}</span>}
                                {periodLabel && reportLocationCount > 0 && (
                                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                                )}
                                {reportLocationCount > 0 && (
                                  <span>
                                    {reportLocationCount} établissement
                                    {reportLocationCount > 1 ? "s" : ""}
                                  </span>
                                )}
                              </p>
                              {reportLocationNames.length > 0 && (
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                                  {reportLocationNames.join(" · ")}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" onClick={() => handleEdit(report)}>
                                <Eye className="h-4 w-4" />
                                Voir
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!report.storage_path}
                                onClick={() => handleDownload(report)}
                              >
                                <Download className="h-4 w-4" />
                                Télécharger
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleGenerate(report)}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Regénérer
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => handleDelete(report)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Supprimer
                              </Button>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            {periodLabel && (
                              <ReportDataPoint
                                label="Période"
                                value={<span className="text-base">{periodLabel}</span>}
                              />
                            )}
                            {generatedLabel && (
                              <ReportDataPoint
                                label="Date génération"
                                value={<span className="text-base">{generatedLabel}</span>}
                              />
                            )}
                            {reportLocationCount > 0 && (
                              <ReportDataPoint
                                label="Établissements"
                                value={reportLocationCount}
                              />
                            )}
                            {reviews && <ReportDataPoint label="Avis" value={reviews} />}
                            {rating && <ReportDataPoint label="Note" value={rating} />}
                            {responseRate && (
                              <ReportDataPoint
                                label="Taux de réponse"
                                value={responseRate}
                              />
                            )}
                            {healthScore.value && (
                              <ReportDataPoint
                                label="Business Health Score"
                                value={healthScore.value}
                              />
                            )}
                          </div>

                          {(healthScore.value || evolution || themes.length > 0) && (
                          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_0.8fr_1.2fr]">
                            {healthScore.value && (
                            <div className="rounded-[24px] border border-[#020617] bg-[#020617] p-5 text-white shadow-[0_18px_42px_rgba(2,6,23,0.18)]">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-200">
                                    Aperçu
                                  </p>
                                  {reportBranding.companyName && (
                                    <p className="mt-1 truncate text-xs font-medium text-slate-300">
                                      {reportBranding.companyName}
                                    </p>
                                  )}
                                  <p className="mt-2 text-3xl font-semibold leading-none">
                                    {healthScore.value}
                                  </p>
                                </div>
                                <TrendingUp className="h-5 w-5 text-blue-200" />
                              </div>
                              {typeof rawHealthScore === "number" && (
                                <div className="mt-4 h-2 rounded-full bg-white/15">
                                  <div
                                    className="h-full rounded-full bg-blue-400"
                                    style={{ width: `${scoreWidth}%` }}
                                  />
                                </div>
                              )}
                            </div>
                            )}
                            {evolution && (
                              <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-5">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  <CalendarDays className="h-4 w-4" />
                                  Evolution
                                </div>
                                <p className="mt-3 text-2xl font-semibold text-slate-950">
                                  {evolution}
                                </p>
                              </div>
                            )}
                            {themes.length > 0 && (
                              <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  Top thèmes
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {themes.map((theme) => (
                                    <span
                                      key={theme}
                                      className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                                    >
                                      {theme}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardHeader className="p-5 pb-0 md:p-6 md:pb-0">
          <div>
            <CardTitle>Benchmark concurrentiel</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Comparez votre réputation aux acteurs suivis.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6">
          {benchmarkQuery.isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 w-full rounded-[24px]" />
              <Skeleton className="h-56 w-full rounded-[24px]" />
            </div>
          ) : benchmarkQuery.data && benchmarkQuery.data.length > 0 ? (
            (() => {
              const latestBenchmark = benchmarkQuery.data[0];
              const latestPayload = latestBenchmark.payload as
                | {
                    stats?: Record<string, number | null>;
                    radius_km?: number | null;
                    position?: string | number | null;
                    current_position?: string | number | null;
                    gap_to_leader?: string | number | null;
                    leader_gap?: string | number | null;
                  }
                | null;
              const latestStats = latestPayload?.stats ?? {};
              const positionValue =
                latestPayload?.current_position ?? latestPayload?.position ?? null;
              const gapValue =
                latestPayload?.gap_to_leader ?? latestPayload?.leader_gap ?? null;
              const benchmarkHeroMetrics = [
                ...(typeof latestStats.total === "number"
                  ? [{ label: "Concurrents", value: String(latestStats.total) }]
                  : []),
                ...(positionValue !== null && positionValue !== undefined
                  ? [{ label: "Position actuelle", value: String(positionValue) }]
                  : []),
                ...(gapValue !== null && gapValue !== undefined
                  ? [{ label: "Écart leader", value: String(gapValue) }]
                  : []),
                ...(typeof latestPayload?.radius_km === "number"
                  ? [{ label: "Rayon analysé", value: `${latestPayload.radius_km} km` }]
                  : [])
              ];

              return (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#020617] bg-[#020617] p-5 text-white shadow-[0_24px_70px_rgba(2,6,23,0.18)] md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
                      Benchmark concurrentiel
                    </p>
                    <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                      Lecture du marché local
                    </h3>
                  </div>
                  {formatDateLabel(latestBenchmark.created_at ?? null) && (
                    <p className="text-sm font-medium text-slate-300">
                      {formatDateLabel(latestBenchmark.created_at ?? null)}
                    </p>
                  )}
                </div>
                {benchmarkHeroMetrics.length > 0 && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {benchmarkHeroMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-[20px] border border-white/10 bg-white/[0.08] px-4 py-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                          {metric.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold leading-none">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
              {benchmarkQuery.data.map((report) => {
                const payload = report.payload as
                  | {
                      stats?: Record<string, number | null>;
                      swot?: Record<string, string[]>;
                      plan_14_days?: string[];
                      top_competitors?: Array<{
                        name?: string;
                        rating?: number | null;
                        reviews?: number | null;
                        distance_m?: number | null;
                      }>;
                      radius_km?: number | null;
                    }
                  | null;
                const stats = payload?.stats ?? {};
                const swot = payload?.swot ?? {};
                const plan = payload?.plan_14_days ?? [];
                const topCompetitors = payload?.top_competitors ?? [];
                const opportunities = swot.opportunities?.slice(0, 3) ?? [];
                const bestCompetitor = topCompetitors.find((item) =>
                  item.name?.trim()
                );
                const isOpen = selectedBenchmarkId === report.id;
                const generatedAt = formatDateLabel(report.created_at ?? null);
                const total =
                  typeof stats.total === "number"
                    ? String(stats.total)
                    : null;
                const medianRating =
                  typeof stats.median_rating === "number"
                    ? `${stats.median_rating.toFixed(1)}/5`
                    : null;
                const locationLabel =
                  locations.find((location) => location.id === report.location_id)
                    ?.location_title ?? null;
                const zoneLabel =
                  report.title || (report as { name?: string | null }).name || null;
                const radiusLabel =
                  typeof payload?.radius_km === "number"
                    ? `${payload.radius_km} km`
                    : null;
                const actions = plan.length > 0 ? plan.slice(0, 3) : [];

                return (
                  <article
                    key={report.id}
                    className={cn(
                      "rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_24px_64px_rgba(15,23,42,0.07)] md:p-6",
                      isOpen && "lg:col-span-2"
                    )}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                          <TrendingUp className="h-4 w-4" />
                          Veille concurrentielle
                        </div>
                        <h4 className="mt-2 truncate text-lg font-semibold text-slate-950">
                          {report.title ?? "Benchmark concurrentiel"}
                        </h4>
                        {(locationLabel || zoneLabel || radiusLabel) && (
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                            {[
                              locationLabel,
                              zoneLabel ? `Zone : ${zoneLabel}` : null,
                              radiusLabel ? `Rayon : ${radiusLabel}` : null
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setSelectedBenchmarkId(isOpen ? null : report.id)
                          }
                        >
                          <Eye className="h-4 w-4" />
                          {isOpen ? "Fermer" : "Voir"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadBenchmark(report.id)}
                        >
                          <Download className="h-4 w-4" />
                          Télécharger
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {generatedAt && (
                        <ReportDataPoint
                          label="Date"
                          value={<span className="text-base">{generatedAt}</span>}
                        />
                      )}
                      {total && <ReportDataPoint label="Total" value={total} />}
                      {medianRating && (
                        <ReportDataPoint label="Note médiane" value={medianRating} />
                      )}
                      {bestCompetitor?.name && (
                        <ReportDataPoint
                          label="Meilleur concurrent"
                          value={
                            <span className="line-clamp-1 text-base">
                              {bestCompetitor.name}
                            </span>
                          }
                          detail={[
                            typeof bestCompetitor.rating === "number"
                              ? `${bestCompetitor.rating.toFixed(1)}/5`
                              : null,
                            typeof bestCompetitor.reviews === "number"
                              ? `${bestCompetitor.reviews} avis`
                              : null
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      )}
                    </div>

                    {isOpen && (
                      <div className="mt-6 space-y-4">
                        {report.summary && (
                          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                              Résumé IA
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {report.summary}
                            </p>
                          </div>
                        )}

                        {topCompetitors.length > 0 && (
                          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Classement
                            </p>
                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                              {topCompetitors.slice(0, 3).map((item, index) => (
                                <div
                                  key={`${item.name ?? "competitor"}-${index}`}
                                  className="rounded-[20px] border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.035)]"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="font-semibold text-slate-950">
                                      {item.name ?? "Concurrent"}
                                    </div>
                                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                                      #{index + 1}
                                    </span>
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {typeof item.rating === "number" && (
                                      <div>Note : {item.rating.toFixed(1)}/5</div>
                                    )}
                                    {typeof item.reviews === "number" && (
                                      <div>Avis : {item.reviews}</div>
                                    )}
                                    {formatDistance(item.distance_m) && (
                                      <div>
                                        Distance : {formatDistance(item.distance_m)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(typeof stats.closest_m === "number" ||
                          typeof stats.best_rating === "number" ||
                          typeof stats.high_risk_count === "number") && (
                          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Concurrents
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {typeof stats.closest_m === "number" && (
                                <ReportDataPoint
                                  label="Plus proche"
                                  value={formatDistance(stats.closest_m)}
                                />
                              )}
                              {typeof stats.best_rating === "number" && (
                                <ReportDataPoint
                                  label="Meilleure note"
                                  value={`${stats.best_rating.toFixed(1)}/5`}
                                />
                              )}
                              {typeof stats.high_risk_count === "number" && (
                                <ReportDataPoint
                                  label="Forte pression"
                                  value={stats.high_risk_count}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {opportunities.length > 0 && (
                          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Opportunités
                            </p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {opportunities.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {actions.length > 0 && (
                          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                            <div className="text-sm font-semibold text-slate-950">
                              Actions recommandées
                            </div>
                            <div className="mt-4 grid gap-3">
                              {actions.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600"
                                >
                                  <div className="font-semibold text-slate-950">
                                    {item}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            </div>
              );
            })()
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[18px] bg-white text-blue-600 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <TrendingUp className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                Aucun benchmark concurrent pour le moment
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Les benchmarks générés apparaîtront ici pour comparer votre réputation aux acteurs suivis.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="pb-2 text-center text-[11px] font-medium text-slate-400">
        Powered by EGIA
      </p>
    </div>
  );
};

export { Reports };
