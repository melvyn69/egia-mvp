import { useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
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
import { cn } from "../lib/utils";
import {
  type GeneratedReportRow,
  type ReportRow,
  type ReportsBranding,
  reportsQueryKey,
  useCompetitorBenchmarkReports,
  useReports,
  useReportsBranding
} from "../hooks/useReportsQueries";

type ReportsProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
};

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
type BenchmarkPayload = {
  stats?: Record<string, number | null>;
  swot?: Record<string, string[]>;
  plan_14_days?: string[];
  top_competitors?: Array<{
    name?: string;
    rating?: number | null;
    reviews?: number | null;
    distance_m?: number | null;
    gap?: string | number | null;
    gap_to_leader?: string | number | null;
    leader_gap?: string | number | null;
    rating_gap?: string | number | null;
  }>;
  radius_km?: number | null;
  location_id?: string | null;
  keyword?: string | null;
};
type BenchmarkGroup = {
  key: string;
  report: GeneratedReportRow;
  payload: BenchmarkPayload | null;
  monthLabel: string;
  monthKey: string;
  versionCount: number;
  latestTs: number;
};

const reportFilterOptions: Array<{ value: ReportFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "monthly", label: "Mensuel" },
  { value: "weekly", label: "Hebdo" },
  { value: "yearly", label: "Annuel" }
];

const openExternalUrl = (url: string) => {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
};

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

const formatMonthKey = (value: string | null) => {
  if (!value) return "unknown-period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-period";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getDateTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const readBenchmarkPayload = (report: GeneratedReportRow) =>
  report.payload && typeof report.payload === "object"
    ? (report.payload as BenchmarkPayload)
    : null;

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

const getReportBriefSignal = (report: ReportRow, establishmentCount: number) => {
  const rating = getNumericReportMetric(report, [
    "average_rating",
    "avg_rating",
    "rating",
    "note"
  ]);
  const reviews = getNumericReportMetric(report, [
    "reviews_count",
    "review_count",
    "reviews",
    "avis"
  ]);
  if (reviews !== null && establishmentCount > 0) {
    return `${Math.round(reviews)} avis analysé${reviews > 1 ? "s" : ""} sur ${establishmentCount} établissement${establishmentCount > 1 ? "s" : ""}.`;
  }

  const criticalAlerts = getNumericReportMetric(report, [
    "critical_count",
    "critical_reviews",
    "criticalReviews",
    "ai_critical_count",
    "avis_critiques"
  ]);
  if (criticalAlerts === 0) {
    return "Aucune alerte critique détectée.";
  }

  if (rating !== null && rating >= 4.5) {
    return "La satisfaction client reste excellente.";
  }

  const negativeReviews = getNumericReportMetric(report, [
    "negative_count",
    "negative_reviews",
    "negativeReviews",
    "avis_negatifs"
  ]);
  if (negativeReviews === 0) {
    return "Aucun avis négatif détecté.";
  }

  if (establishmentCount > 0) {
    return `Rapport généré pour ${establishmentCount} établissement${establishmentCount > 1 ? "s" : ""}.`;
  }

  return null;
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
    "min-w-0 overflow-hidden rounded-[18px] border p-3 shadow-[0_18px_42px_rgba(15,23,42,0.045)] md:rounded-[24px] md:p-4",
      highlight
        ? "border-[#020617] bg-[#020617] text-white"
        : "border-slate-200/70 bg-white text-slate-950"
    )}
  >
    <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", highlight ? "text-blue-200" : "text-slate-500")}>
      {label}
    </p>
    <div className="mt-2 truncate text-xl font-semibold leading-none md:text-3xl">{value}</div>
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
  <div className="reports-print-card min-w-0 overflow-hidden rounded-[20px] border border-slate-200/70 bg-white px-3 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.035)] md:rounded-[24px] md:px-4 md:py-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <div className="mt-1 truncate text-base font-semibold text-slate-950 md:text-lg">{value}</div>
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
      "rounded-[20px] border p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] md:rounded-[24px] md:p-5",
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
    <div className="mt-2 text-2xl font-semibold leading-none tracking-tight md:mt-3 md:text-3xl">
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
  const periodLabel = formatReportPeriod(state.report);
  const establishmentCount = locationNames.length || state.report.locations.length;
  const briefSignal = getReportBriefSignal(state.report, establishmentCount);
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
  const kpiCards: Array<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
  }> = [
    ...(rating
      ? [{ label: "Note moyenne", value: rating, detail: ratingStars }]
      : []),
    ...(reviews ? [{ label: "Avis analysés", value: reviews }] : []),
    ...(responseRate ? [{ label: "Réponses", value: responseRate }] : []),
    ...(establishmentCount > 0
      ? [
          {
            label: "Établissements",
            value: establishmentCount
          }
        ]
      : [])
  ];
  const reportContents = [
    "Executive Summary",
    "Performance",
    "Réputation",
    "Plan d'action",
    "Benchmark"
  ];
  const brandName = branding.companyName ?? state.report.name;

  return (
    <div
      className="report-ready-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-ready-title"
    >
      <div className="report-ready-modal relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[22px] border border-white/80 bg-white shadow-[0_34px_110px_rgba(2,6,23,0.32)] md:rounded-[24px]">
        <button
          type="button"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-4 md:p-7">
          <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {branding.logoUrl && (
                <img
                  src={branding.logoUrl}
                  alt={brandName}
                  className="h-11 w-11 rounded-[18px] border border-slate-200 bg-white object-cover shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {brandName}
                </p>
                {branding.legalName && (
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                    {branding.legalName}
                  </p>
                )}
              </div>
            </div>
            {periodLabel && (
              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {periodLabel}
              </span>
            )}
          </div>

          <div className="mt-5 rounded-[24px] bg-[#020617] p-5 text-white shadow-[0_24px_70px_rgba(2,6,23,0.20)] md:mt-6 md:rounded-[28px] md:p-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-semibold text-blue-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Rapport généré
            </span>
            <h3
              id="report-ready-title"
              className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white md:mt-5 md:text-5xl"
            >
              Votre rapport stratégique est prêt.
            </h3>
            <p className="mt-4 text-lg font-medium leading-7 text-slate-300">
              L'analyse de votre réputation est terminée.
            </p>
            {briefSignal && (
              <p className="mt-4 max-w-2xl text-lg font-semibold leading-7 text-white md:mt-5 md:text-2xl md:leading-9">
                {briefSignal}
              </p>
            )}
          </div>

          <div
            className={cn(
              "mt-5 grid gap-5",
              kpiCards.length > 0 && "lg:grid-cols-[minmax(0,1fr)_300px]"
            )}
          >
            {kpiCards.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {kpiCards.map((card) => (
                  <ReportReadyKpiCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    detail={card.detail}
                  />
                ))}
              </div>
            )}

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Ce que contient votre rapport
              </p>
              <div className="mt-4 grid gap-2">
                {reportContents.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.035)]"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 mt-5 flex flex-col gap-2 border-t border-slate-100 bg-white/95 px-4 pt-4 pb-1 backdrop-blur sm:flex-row sm:items-center sm:justify-end md:-mx-7 md:px-7">
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
              Télécharger PDF
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
  const [downloadingBenchmarkId, setDownloadingBenchmarkId] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<ReportFilter>("all");
  const [reportSearch, setReportSearch] = useState("");
  const [generatedReportModal, setGeneratedReportModal] =
    useState<GeneratedReportModalState | null>(null);
  const userId = session?.user?.id ?? null;
  const workspaceId = userId;
  const accountId = userId;

  const reportsCacheKey = reportsQueryKey({ workspaceId, accountId, userId });
  const brandingQuery = useReportsBranding({ workspaceId, accountId, userId });
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

  const reportsQuery = useReports({
    workspaceId,
    accountId,
    userId
  });
  const reportsFirstLoad = reportsQuery.isLoading && !reportsQuery.data;
  const reportsRefreshing = reportsQuery.isFetching && Boolean(reportsQuery.data);

  const benchmarkQuery = useCompetitorBenchmarkReports({
    workspaceId,
    accountId,
    userId
  });
  const benchmarkFirstLoad = benchmarkQuery.isLoading && !benchmarkQuery.data;
  const benchmarkRefreshing =
    benchmarkQuery.isFetching && Boolean(benchmarkQuery.data);

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
      .upsert(payload);
    if (saveError) {
      setError("Impossible de sauvegarder le rapport.");
    } else {
      resetForm();
      void queryClient.invalidateQueries({
        queryKey: reportsCacheKey,
        exact: true
      });
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
    try {
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
      void queryClient.invalidateQueries({
        queryKey: reportsCacheKey,
        exact: true
      });
      void queryClient.invalidateQueries({
        queryKey: ["coach-reports-count", userId],
        exact: true
      });
    } catch {
      setError("Connexion nécessaire pour générer le PDF.");
    }
  };

  const handleDownload = async (report: ReportRow) => {
    if (!supabaseClient) {
      setError("Connexion nécessaire pour télécharger.");
      return;
    }
    if (!report.storage_path) {
      setError("PDF non disponible. Régénérez le rapport.");
      return;
    }
    const { data, error: urlError } = await supabaseClient.storage
      .from("reports")
      .createSignedUrl(report.storage_path, 60);
    if (urlError || !data?.signedUrl) {
      setError("Impossible de télécharger le PDF.");
      return;
    }
    openExternalUrl(data.signedUrl);
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
    void queryClient.invalidateQueries({
      queryKey: reportsCacheKey,
      exact: true
    });
    void queryClient.invalidateQueries({
      queryKey: ["coach-reports-count", userId],
      exact: true
    });
  };

  const handleDownloadBenchmark = async (reportId: string) => {
    if (!session?.access_token) {
      setError("Connectez-vous pour télécharger.");
      return;
    }
    setError(null);
    setDownloadingBenchmarkId(reportId);
    try {
      const res = await fetch(
        `/api/reports/competitors-benchmark/pdf?report_id=${reportId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      );
      if (!res.ok) {
        setError("Impossible de télécharger le PDF benchmark.");
        return;
      }
      const blob = await res.blob();
      if (!blob.size) {
        setError("PDF benchmark bientôt disponible.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `benchmark-${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Impossible de télécharger le PDF.");
    } finally {
      setDownloadingBenchmarkId(null);
    }
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
  const benchmarkGroups = useMemo(() => {
    const groups = new Map<
      string,
      { latest: BenchmarkGroup; versionCount: number }
    >();

    (benchmarkQuery.data ?? []).forEach((report) => {
      const payload = readBenchmarkPayload(report);
      const locationKey =
        payload?.location_id ?? report.location_id ?? "all-locations";
      const keywordKey = (payload?.keyword ?? "benchmark").trim().toLowerCase();
      const radiusKey =
        typeof payload?.radius_km === "number" ? `${payload.radius_km}` : "all-radius";
      const monthKey = formatMonthKey(report.created_at ?? null);
      const key = [
        report.report_type,
        locationKey,
        keywordKey,
        radiusKey,
        monthKey
      ].join("|");
      const latestTs = getDateTimestamp(report.created_at);
      const monthLabel = formatMonthSection(report.created_at ?? null) || "Benchmark";
      const groupItem: BenchmarkGroup = {
        key,
        report,
        payload,
        monthLabel,
        monthKey,
        versionCount: 1,
        latestTs
      };
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { latest: groupItem, versionCount: 1 });
        return;
      }
      existing.versionCount += 1;
      if (latestTs >= existing.latest.latestTs) {
        existing.latest = groupItem;
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group.latest,
        versionCount: group.versionCount
      }))
      .sort((a, b) => b.latestTs - a.latestTs);
  }, [benchmarkQuery.data]);
  const activeBenchmarkGroup = useMemo(() => {
    if (benchmarkGroups.length === 0) return null;
    return (
      benchmarkGroups.find((group) => group.report.id === selectedBenchmarkId) ??
      benchmarkGroups[0]
    );
  }, [benchmarkGroups, selectedBenchmarkId]);
  const latestHealthScore = getReportHealthScoreState(latestReport);
  const latestReportDate = latestReport ? formatDateLabel(getReportDateValue(latestReport)) : null;
  const generatedReportLocationNames = generatedReportModal
    ? getReportLocationNames(generatedReportModal.report, locations)
    : [];
  const handleOpenGeneratedReport = () => {
    if (!generatedReportModal) return;
    if (generatedReportModal.pdfUrl) {
      openExternalUrl(generatedReportModal.pdfUrl);
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
      openExternalUrl(generatedReportModal.pdfUrl);
    }
  };

  return (
    <div className="reports-page min-w-0 max-w-full space-y-4 overflow-x-hidden pb-4 md:space-y-6">
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
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body {
            background: #ffffff !important;
          }
          main {
            padding: 0 !important;
            background: #ffffff !important;
          }
          .reports-page {
            color: #0f172a !important;
            background: #ffffff !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .report-ready-backdrop,
          .reports-print-hidden,
          .reports-page button,
          .reports-page input,
          .reports-page select,
          .reports-page textarea,
          .reports-page [role="button"] {
            display: none !important;
          }
          .reports-print-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .reports-print-section {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }
          .reports-page section,
          .reports-page article,
          .reports-page .reports-print-card,
          .reports-page .reports-print-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .reports-page div,
          .reports-page section,
          .reports-page article {
            box-shadow: none !important;
          }
          .reports-page [class*="bg-slate-50"],
          .reports-page [class*="bg-[#020617]"],
          .reports-page [class*="bg-white"] {
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .reports-scroll-x {
            overflow: visible !important;
          }
          .reports-page h2 {
            font-size: 28px !important;
            line-height: 1.1 !important;
          }
          .reports-page h3,
          .reports-page h4,
          .reports-page h5,
          .reports-page p,
          .reports-page span {
            writing-mode: horizontal-tb !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
          }
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

      <section className="reports-print-section min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)] md:rounded-[24px]">
        <div className="grid min-w-0 gap-4 p-3 md:gap-5 md:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="flex min-w-0 flex-col justify-between md:min-h-[150px]">
            <div>
              {(reportBranding.companyName || reportBranding.logoUrl) ? (
                <div className="mb-3 md:mb-5">
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
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Rapports
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 md:mt-3 md:text-base md:leading-7">
                Retrouvez toute l'évolution de votre réputation.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 md:mt-7">
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

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-1 xl:grid-cols-3">
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

      <Card className="reports-print-hidden min-w-0 overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardHeader className="p-4 pb-0 md:p-6 md:pb-0">
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
        <CardContent className="grid min-w-0 gap-4 p-4 md:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.48fr)]">
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button onClick={handleSave} disabled={saving} className="min-h-11 sm:min-h-0">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm} className="min-h-11 sm:min-h-0">
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="reports-print-section min-w-0 overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardHeader className="p-4 pb-0 md:p-6 md:pb-0">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <CardTitle>Historique</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Une timeline claire de vos rapports et de leur aperçu.
              </p>
              {reportsRefreshing && (
                <p className="mt-1 text-xs font-medium text-slate-400">
                  Actualisation...
                </p>
              )}
            </div>
            <div className="reports-print-hidden flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex max-w-full overflow-x-auto rounded-full border border-slate-200 bg-slate-50 p-1">
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
                  className="h-10 w-full min-w-0 rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 sm:w-56 xl:w-64"
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  placeholder="Rechercher"
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {reportsFirstLoad ? (
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
            <div className="space-y-5 md:space-y-6">
              {reportGroups.map((group) => (
                <section key={group.label} className="reports-print-card relative min-w-0 pl-4 md:pl-7">
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
                          className="reports-print-card min-w-0 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_24px_64px_rgba(15,23,42,0.07)] md:rounded-[24px] md:p-5"
                        >
                          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                            <div className="reports-print-hidden grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center xl:justify-end">
                              <Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => handleEdit(report)}>
                                <Eye className="h-4 w-4" />
                                Voir
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 sm:min-h-0"
                                disabled={!report.storage_path}
                                onClick={() => handleDownload(report)}
                              >
                                <Download className="h-4 w-4" />
                                Télécharger
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 sm:min-h-0"
                                onClick={() => handleGenerate(report)}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Regénérer
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 text-red-600 hover:bg-red-50 hover:text-red-700 sm:min-h-0"
                                onClick={() => handleDelete(report)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Supprimer
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                          <div className="mt-3 grid min-w-0 gap-2 md:gap-3 lg:grid-cols-[0.9fr_0.8fr_1.2fr]">
                            {healthScore.value && (
                            <div className="reports-print-card min-w-0 overflow-hidden rounded-[22px] border border-[#020617] bg-[#020617] p-4 text-white shadow-[0_18px_42px_rgba(2,6,23,0.18)] md:rounded-[24px]">
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
                              <div className="reports-print-card min-w-0 overflow-hidden rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-4 md:rounded-[24px]">
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
                              <div className="reports-print-card min-w-0 overflow-hidden rounded-[22px] border border-slate-200/70 bg-slate-50/70 p-4 md:rounded-[24px]">
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

      <Card className="reports-print-section min-w-0 overflow-hidden rounded-[24px] border-slate-200/70 bg-white shadow-[0_18px_54px_rgba(15,23,42,0.045)]">
        <CardContent className="p-4 md:p-6">
          {benchmarkRefreshing && (
            <p className="mb-3 text-xs font-medium text-slate-400">
              Actualisation...
            </p>
          )}
          {benchmarkFirstLoad ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 w-full rounded-[24px]" />
              <Skeleton className="h-56 w-full rounded-[24px]" />
            </div>
          ) : benchmarkGroups.length > 0 && activeBenchmarkGroup ? (
            (() => {
              const activeBenchmark = activeBenchmarkGroup.report;
              const activePayload = activeBenchmarkGroup.payload;
              const activeStats = activePayload?.stats ?? {};
              const radiusLabel =
                typeof activePayload?.radius_km === "number"
                  ? `${activePayload.radius_km} km`
                  : null;
              const medianRating =
                typeof activeStats.median_rating === "number"
                  ? `${activeStats.median_rating.toFixed(1)}/5`
                  : null;
              const totalCompetitors =
                typeof activeStats.total === "number"
                  ? String(activeStats.total)
                  : null;
              const marketPhrase =
                totalCompetitors && radiusLabel && medianRating
                  ? `${totalCompetitors} concurrents analysés dans un rayon de ${radiusLabel}, avec une note médiane de ${medianRating}.`
                  : totalCompetitors && radiusLabel
                    ? `${totalCompetitors} concurrents analysés dans un rayon de ${radiusLabel}.`
                    : totalCompetitors
                      ? `${totalCompetitors} concurrents analysés.`
                      : activeBenchmark.summary?.trim() || null;
              const benchmarkHeroMetrics = [
                ...(totalCompetitors
                  ? [{ label: "Concurrents analysés", value: totalCompetitors }]
                  : []),
                ...(medianRating
                  ? [{ label: "Note médiane", value: medianRating }]
                  : []),
                ...(radiusLabel
                  ? [{ label: "Rayon étudié", value: radiusLabel }]
                  : [])
              ];
              const competitors = (activePayload?.top_competitors ?? [])
                .filter((item) => item.name?.trim())
                .slice(0, 5);
              const bestRating =
                typeof activeStats.best_rating === "number"
                  ? `${activeStats.best_rating.toFixed(1)}/5`
                  : null;
              const opportunities =
                activePayload?.swot?.opportunities?.slice(0, 2) ?? [];

              return (
                <div className="min-w-0 space-y-4 md:space-y-5">
                  <div className="reports-print-card rounded-[24px] bg-[#020617] p-4 text-white shadow-[0_24px_70px_rgba(2,6,23,0.18)] md:rounded-[28px] md:p-5">
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="min-w-0 max-w-3xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
                          Benchmark concurrentiel
                        </p>
                        <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                          Lecture du marché local
                        </h3>
                        {marketPhrase && (
                          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300 md:mt-4 md:text-base md:leading-7">
                            {marketPhrase}
                          </p>
                        )}
                      </div>
                      <div className="reports-print-hidden flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                        {formatDateLabel(activeBenchmark.created_at ?? null) && (
                          <span className="w-full rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-center text-xs font-semibold text-slate-200 sm:w-auto">
                            {formatDateLabel(activeBenchmark.created_at ?? null)}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={!session?.access_token || downloadingBenchmarkId === activeBenchmark.id}
                          onClick={() => handleDownloadBenchmark(activeBenchmark.id)}
                        >
                          <Download className="h-4 w-4" />
                          {!session?.access_token
                            ? "Connexion requise"
                            : downloadingBenchmarkId === activeBenchmark.id
                              ? "Téléchargement..."
                              : "Télécharger"}
                        </Button>
                      </div>
                    </div>

                    {benchmarkHeroMetrics.length > 0 && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-3 md:mt-6 md:gap-3">
                        {benchmarkHeroMetrics.map((metric) => (
                          <div
                            key={metric.label}
                            className="rounded-[18px] border border-white/10 bg-white/[0.08] px-3 py-3 md:rounded-[22px] md:px-4 md:py-4"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                              {metric.label}
                            </p>
                            <p className="mt-2 text-2xl font-semibold leading-none md:mt-3 md:text-3xl">
                              {metric.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(competitors.length > 0 || bestRating || opportunities.length > 0) && (
                    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_260px]">
                      {competitors.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                                Classement
                              </p>
                              <h4 className="mt-1 text-xl font-semibold text-slate-950">
                                Concurrents suivis
                              </h4>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {competitors.map((item, index) => {
                              const gapRaw =
                                item.gap ??
                                item.gap_to_leader ??
                                item.leader_gap ??
                                item.rating_gap ??
                                null;
                              const gapValue =
                                typeof gapRaw === "number"
                                  ? `${gapRaw > 0 ? "+" : ""}${gapRaw.toFixed(1)}`
                                  : typeof gapRaw === "string" && gapRaw.trim()
                                    ? gapRaw
                                    : formatDistance(item.distance_m);
                              const gapLabel = gapRaw !== null ? "Écart" : "Écart terrain";
                              const badges = [
                                index === 0 ? "Leader suivi" : `Rang ${index + 1}`,
                                typeof item.rating === "number" ? "Note suivie" : null,
                                typeof item.reviews === "number" ? "Volume avis" : null
                              ].filter((badge): badge is string => Boolean(badge));

                              return (
                                <article
                                  key={`${item.name}-${index}`}
                                  className="reports-print-card min-w-0 overflow-hidden rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.045)] md:rounded-[24px]"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
                                        Rang {index + 1}
                                      </div>
                                      <h5 className="mt-2 line-clamp-2 text-lg font-semibold leading-6 text-slate-950">
                                        {item.name}
                                      </h5>
                                    </div>
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[#020617] text-sm font-semibold text-white">
                                      #{index + 1}
                                    </div>
                                  </div>

                                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    {typeof item.rating === "number" && (
                                      <div className="rounded-[16px] bg-slate-50 px-3 py-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                                          Note
                                        </p>
                                        <p className="mt-2 text-xl font-semibold text-slate-950">
                                          {item.rating.toFixed(1)}
                                        </p>
                                      </div>
                                    )}
                                    {typeof item.reviews === "number" && (
                                      <div className="rounded-[16px] bg-slate-50 px-3 py-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                                          Avis
                                        </p>
                                        <p className="mt-2 text-xl font-semibold text-slate-950">
                                          {item.reviews}
                                        </p>
                                      </div>
                                    )}
                                    {gapValue && (
                                      <div className="rounded-[16px] bg-blue-50 px-3 py-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600">
                                          {gapLabel}
                                        </p>
                                        <p className="mt-2 text-xl font-semibold text-slate-950">
                                          {gapValue}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {badges.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {badges.map((badge) => (
                                        <span
                                          key={badge}
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                                        >
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {(bestRating || opportunities.length > 0) && (
                        <aside className="reports-print-card min-w-0 overflow-hidden rounded-[22px] border border-slate-200/70 bg-slate-50 p-4 md:rounded-[24px] md:p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Lecture Gartner
                          </p>
                          {bestRating && (
                            <div className="mt-4 rounded-[20px] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
                              <p className="text-xs font-medium text-slate-500">
                                Meilleure note observée
                              </p>
                              <p className="mt-2 text-3xl font-semibold leading-none text-slate-950">
                                {bestRating}
                              </p>
                            </div>
                          )}
                          {opportunities.length > 0 && (
                            <div className="mt-4 space-y-2">
                              {opportunities.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-[18px] border border-blue-100 bg-white px-4 py-3 text-sm font-medium leading-5 text-slate-700"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          )}
                        </aside>
                      )}
                    </div>
                  )}

                  {benchmarkGroups.length > 1 && (
                    <div className="reports-print-hidden rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)] md:rounded-[24px]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Timeline
                        </p>
                        <p className="text-xs font-medium text-slate-400">
                          {benchmarkGroups.length} périodes
                        </p>
                      </div>
                      <div className="reports-scroll-x mt-4 flex max-w-full gap-2 overflow-x-auto pb-1">
                        {benchmarkGroups.map((group) => {
                          const isActive = group.report.id === activeBenchmark.id;

                          return (
                            <button
                              key={group.key}
                              type="button"
                              onClick={() => setSelectedBenchmarkId(group.report.id)}
                              className={cn(
                                "min-w-[132px] rounded-[18px] border px-4 py-3 text-left transition",
                                isActive
                                  ? "border-[#020617] bg-[#020617] text-white shadow-[0_14px_34px_rgba(2,6,23,0.16)]"
                                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:bg-white"
                              )}
                            >
                              <span className="block text-sm font-semibold">
                                {group.monthLabel}
                              </span>
                              {group.versionCount > 1 && (
                                <span
                                  className={cn(
                                    "mt-1 block text-xs",
                                    isActive ? "text-slate-300" : "text-slate-400"
                                  )}
                                >
                                  {group.versionCount} versions
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
