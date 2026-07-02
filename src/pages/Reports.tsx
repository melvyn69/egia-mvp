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

const getReportHealthScore = (report: ReportRow) =>
  formatOptionalMetric(
    getReportMetric(report, [
      "business_health_score",
      "businessHealthScore",
      "health_score",
      "score"
    ]),
    "/100"
  ) ?? "Calcul en cours";

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
            "shrink-0 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm",
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
      "rounded-2xl border p-4 shadow-[0_12px_32px_rgba(15,23,42,0.045)]",
      highlight
        ? "border-slate-900 bg-slate-950 text-white"
        : "border-white/80 bg-white/85 text-slate-950"
    )}
  >
    <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", highlight ? "text-slate-300" : "text-slate-500")}>
      {label}
    </p>
    <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
    {detail && (
      <p className={cn("mt-2 truncate text-xs", highlight ? "text-slate-300" : "text-slate-500")}>
        {detail}
      </p>
    )}
  </div>
);

const ReportDataPoint = ({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
  </div>
);

const ReportReadyKpiCard = ({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) => (
  <div
    className={cn(
      "rounded-2xl border p-4 shadow-[0_14px_34px_rgba(15,23,42,0.055)]",
      highlight
        ? "border-slate-950 bg-slate-950 text-white"
        : "border-slate-100 bg-white text-slate-950"
    )}
  >
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.09em]",
        highlight ? "text-slate-300" : "text-slate-500"
      )}
    >
      {label}
    </p>
    <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
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
  const healthScore = getReportHealthScore(state.report);
  const rating = formatOptionalMetric(
    getReportMetric(state.report, [
      "average_rating",
      "avg_rating",
      "rating",
      "note"
    ]),
    "/5"
  );
  const reviews = formatOptionalMetric(
    getReportMetric(state.report, [
      "reviews_count",
      "review_count",
      "reviews",
      "avis"
    ])
  );
  const responseRate = formatOptionalMetric(
    getReportMetric(state.report, [
      "response_rate",
      "responseRate",
      "response_rate_pct",
      "responses_rate"
    ]),
    "%"
  );
  const kpiCards = [
    {
      label: "Business Health Score",
      value: healthScore,
      highlight: true
    },
    ...(rating ? [{ label: "Note moyenne", value: rating }] : []),
    ...(reviews ? [{ label: "Avis analysés", value: reviews }] : []),
    ...(responseRate ? [{ label: "Taux réponse", value: responseRate }] : []),
    ...(state.report.locations.length > 0
      ? [
          {
            label: "Établissements",
            value: state.report.locations.length
          }
        ]
      : [])
  ];

  return (
    <div
      className="report-ready-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-ready-title"
    >
      <div className="report-ready-modal relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_34px_100px_rgba(15,23,42,0.26)]">
        <button
          type="button"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-slate-50/90 px-5 pb-5 pt-6 md:px-8 md:pb-7 md:pt-8">
          <div className="flex items-start gap-4 pr-10">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.2)]">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              {(branding.companyName || branding.logoUrl) && (
                <div className="mb-4">
                  <ReportBrandBlock
                    branding={branding}
                    locationNames={locationNames}
                    compact
                  />
                </div>
              )}
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Génération terminée
              </div>
              <h3
                id="report-ready-title"
                className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl"
              >
                Votre rapport est prêt.
              </h3>
              <p className="mt-2 truncate text-sm font-medium text-slate-500">
                {state.report.name}
              </p>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
                L'IA a identifié les principaux leviers d'amélioration de votre réputation.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 md:p-8">
          {kpiCards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kpiCards.map((card) => (
                <ReportReadyKpiCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  highlight={card.highlight}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={!canAccessPdf}
              onClick={onOpenReport}
            >
              <Eye className="h-4 w-4" />
              Voir
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!canAccessPdf}
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
              Télécharger
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
  const latestHealthScore = latestReport ? getReportHealthScore(latestReport) : "Calcul en cours";
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
    <div className="space-y-6">
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 shadow-[0_18px_48px_rgba(15,23,42,0.055)]">
        <div className="grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="flex min-h-[180px] flex-col justify-between">
            <div>
              {(reportBranding.companyName || reportBranding.logoUrl) ? (
                <div className="mb-5">
                  <ReportBrandBlock
                    branding={reportBranding}
                    locationNames={allLocationNames}
                  />
                </div>
              ) : (
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm">
                  <FileText className="h-5 w-5" />
                </div>
              )}
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
                Rapports
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-500">
                Retrouvez toute l'évolution de votre réputation.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                Timeline mensuelle
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                PDF premium
              </span>
              {allLocationNames.length > 0 && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
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
            <ReportHeroMetric
              label="Business Health Score"
              value={latestHealthScore}
              detail="Donnée du rapport"
              highlight
            />
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-slate-200/70 bg-white/95 shadow-[0_16px_44px_rgba(15,23,42,0.045)]">
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
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Rapport mensuel"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Période</label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
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
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
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
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white"
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

          <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Notes</label>
              <textarea
                className="mt-2 min-h-[112px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5"
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
                      ? "border-slate-900 bg-white text-slate-950"
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
                      ? "border-slate-900 bg-white text-slate-950"
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
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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

      <Card className="overflow-hidden border-slate-200/70 bg-white/95 shadow-[0_16px_44px_rgba(15,23,42,0.045)]">
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
                        ? "bg-slate-950 text-white shadow-sm"
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
                  className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 sm:w-64"
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
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
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
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
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
                  <div className="absolute left-2 top-9 h-[calc(100%-1rem)] w-px bg-slate-200 md:left-3" />
                  <div className="mb-4 flex items-center gap-3">
                    <span className="absolute left-0 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 ring-4 ring-white md:left-1">
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
                      const healthScore = getReportHealthScore(report);
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
                      const responses = formatOptionalMetric(
                        getReportMetric(report, [
                          "responses_count",
                          "response_count",
                          "responses",
                          "reponses"
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
                          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_14px_38px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.07)] md:p-5"
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
                            <ReportDataPoint label="Business Health Score" value={healthScore} />
                            {rating && <ReportDataPoint label="Note" value={rating} />}
                            {reviews && <ReportDataPoint label="Avis" value={reviews} />}
                            {responses && <ReportDataPoint label="Réponses" value={responses} />}
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
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_0.8fr_1.2fr]">
                            <div className="rounded-2xl border border-slate-100 bg-slate-950 p-4 text-white">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                                    Aperçu
                                  </p>
                                  {reportBranding.companyName && (
                                    <p className="mt-1 truncate text-xs font-medium text-slate-300">
                                      {reportBranding.companyName}
                                    </p>
                                  )}
                                  <p className="mt-2 text-3xl font-semibold leading-none">
                                    {healthScore}
                                  </p>
                                </div>
                                <TrendingUp className="h-5 w-5 text-slate-300" />
                              </div>
                              <div className="mt-4 h-2 rounded-full bg-white/15">
                                {typeof rawHealthScore === "number" && (
                                  <div
                                    className="h-full rounded-full bg-white"
                                    style={{ width: `${scoreWidth}%` }}
                                  />
                                )}
                              </div>
                            </div>
                            {evolution && (
                              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
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
                              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  Top thèmes
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {themes.map((theme) => (
                                    <span
                                      key={theme}
                                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                                    >
                                      {theme}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
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

      {(benchmarkQuery.isLoading ||
        (benchmarkQuery.data && benchmarkQuery.data.length > 0)) && (
      <Card>
        <CardHeader>
          <CardTitle>Benchmark concurrents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto">
          {benchmarkQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : benchmarkQuery.data && benchmarkQuery.data.length > 0 ? (
            benchmarkQuery.data.map((report) => {
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
                  }
                | null;
              const isOpen = selectedBenchmarkId === report.id;
              return (
                <div
                  key={report.id}
                  className="rounded-xl border border-slate-100 bg-white px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">
                        {report.title ?? "Benchmark concurrents"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Genere le {report.created_at.slice(0, 10)}
                      </p>
                      {report.summary && (
                        <p className="text-xs text-slate-500">{report.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">Snapshot</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadBenchmark(report.id)}
                      >
                        Télécharger PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedBenchmarkId(isOpen ? null : report.id)
                        }
                      >
                        {isOpen ? "Fermer" : "Voir"}
                      </Button>
                    </div>
                  </div>
                  {isOpen && (() => {
                    const stats = payload?.stats ?? {};
                    const swot = payload?.swot ?? {};
                    const plan = payload?.plan_14_days ?? [];
                    const topCompetitors = payload?.top_competitors ?? [];
                    const locationLabel =
                      locations.find((location) => location.id === report.location_id)
                        ?.location_title ?? null;
                    const zoneLabel =
                      report.title || (report as { name?: string | null }).name || null;
                    const radiusLabel =
                      typeof (payload as { radius_km?: number | null })?.radius_km === "number"
                        ? `${(payload as { radius_km?: number | null }).radius_km} km`
                        : null;
                    const generatedAt = formatDateLabel(report.created_at ?? null);
                    const positioning =
                      typeof stats.high_risk_count === "number" && stats.high_risk_count >= 3
                        ? "Outsider"
                        : typeof stats.best_rating === "number" && stats.best_rating >= 4.7
                          ? "Challenger"
                          : "Leader";
                    const risks =
                      swot.threats?.length
                        ? swot.threats.slice(0, 3)
                        : typeof stats.high_risk_count === "number"
                          ? [`${stats.high_risk_count} concurrent(s) à fort impact local.`]
                          : [];
                    const opportunities =
                      swot.opportunities?.length
                        ? swot.opportunities.slice(0, 3)
                        : typeof stats.median_reviews === "number"
                          ? [
                              `Volume moyen ~${Math.round(
                                stats.median_reviews
                              )} avis à capter.`
                            ]
                          : [];
                    const executiveSummary =
                      report.summary ||
                      (typeof stats.best_rating === "number"
                        ? `Marché compétitif avec des acteurs jusqu'à ${stats.best_rating.toFixed(
                            1
                          )}/5.`
                        : null);
                    const actions = plan.length > 0 ? plan.slice(0, 3) : [];
                    const actionWhy =
                      typeof stats.best_rating === "number"
                        ? `Pourquoi : marché noté jusqu'à ${stats.best_rating.toFixed(1)}/5.`
                        : typeof stats.total === "number"
                          ? `Pourquoi : ${stats.total} concurrents observés.`
                          : null;
                    const actionImpact =
                      "Impact attendu : améliorer la perception et la préférence locale.";
                    return (
                      <div className="mt-6 space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <Badge variant="neutral">
                              Veille concurrentielle
                            </Badge>
                            {generatedAt && (
                              <span className="text-xs text-slate-500">
                                {generatedAt}
                              </span>
                            )}
                          </div>
                          <div className="mt-4 space-y-1">
                            {locationLabel && (
                              <p className="text-xl font-semibold text-slate-900">
                                {locationLabel}
                              </p>
                            )}
                            {(zoneLabel || radiusLabel) && (
                              <p className="text-sm text-slate-500">
                                {[
                                  zoneLabel ? `Zone analysée : ${zoneLabel}` : null,
                                  radiusLabel ? `Rayon : ${radiusLabel}` : null
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="text-sm font-semibold text-slate-900">
                            Résumé exécutif
                          </div>
                          <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 text-sm text-slate-600">
                              <div>
                                <span className="font-semibold text-slate-900">
                                  Positionnement global : {positioning}
                                </span>
                              </div>
                              {typeof stats.total === "number" && (
                                <div>
                                  Concurrents observés :{" "}
                                  <span className="font-semibold text-slate-900">
                                    {stats.total}
                                  </span>
                                </div>
                              )}
                              {executiveSummary && (
                                <div className="text-xs text-slate-500">
                                  {executiveSummary}
                                </div>
                              )}
                            </div>
                            {(risks.length > 0 || opportunities.length > 0) && (
                              <div className="grid gap-3 text-xs text-slate-600">
                              {risks.length > 0 && <div>
                                <div className="font-semibold text-slate-700">
                                  Top 3 risques
                                </div>
                                <ul className="mt-2 list-disc space-y-1 pl-4">
                                  {risks.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>}
                              {opportunities.length > 0 && <div>
                                <div className="font-semibold text-slate-700">
                                  Top 3 opportunités
                                </div>
                                <ul className="mt-2 list-disc space-y-1 pl-4">
                                  {opportunities.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>}
                            </div>
                            )}
                          </div>
                        </div>

                        {topCompetitors.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="text-sm font-semibold text-slate-900">
                            Podium concurrentiel
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            {topCompetitors.slice(0, 2).map((item, index) => (
                              <div
                                key={`${item.name ?? "competitor"}-${index}`}
                                className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600"
                              >
                                <div className="font-semibold text-slate-900">
                                  {item.name ?? "Concurrent"}
                                </div>
                                <div className="mt-2 space-y-1">
                                  {typeof item.rating === "number" && (
                                    <div>Note : {item.rating}</div>
                                  )}
                                  {typeof item.reviews === "number" && (
                                    <div>Avis : {item.reviews}</div>
                                  )}
                                  {formatDistance(item.distance_m) && (
                                    <div>Distance : {formatDistance(item.distance_m)}</div>
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
                        <div className="rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="text-sm font-semibold text-slate-900">
                            Analyse radar
                          </div>
                          <div className="mt-3 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
                            {typeof stats.closest_m === "number" && (
                              <div>
                              Concurrent le plus proche :{" "}
                              <span className="font-semibold text-slate-900">
                                {formatDistance(stats.closest_m)}
                              </span>
                            </div>
                            )}
                            {typeof stats.best_rating === "number" && (
                              <div>
                              Meilleure note du marché :{" "}
                              <span className="font-semibold text-slate-900">
                                {stats.best_rating.toFixed(1)}
                              </span>
                            </div>
                            )}
                            {typeof stats.high_risk_count === "number" &&
                              stats.high_risk_count > 0 && (
                              <div className="text-xs text-slate-500">
                              {typeof stats.high_risk_count === "number" &&
                              stats.high_risk_count > 0
                                ? "Pression concurrentielle élevée à proximité."
                                : "Marché concurrentiel maîtrisable avec des actions ciblées."}
                            </div>
                            )}
                          </div>
                        </div>
                        )}

                        {(["forces", "weaknesses", "opportunities", "threats"] as const).some(
                          (key) => swot[key]?.[0]
                        ) && (
                        <div className="grid gap-4 md:grid-cols-2">
                          {([
                            ["forces", "Force"],
                            ["weaknesses", "Faiblesse"],
                            ["opportunities", "Opportunité"],
                            ["threats", "Menace"]
                          ] as const).map(([key, label]) => (
                            swot[key]?.[0] ? (
                            <div
                              key={key}
                              className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600"
                            >
                              <div className="font-semibold text-slate-700">
                                {label}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                {swot[key]?.[0]}
                              </div>
                              <div className="mt-2 text-[11px] text-slate-500">
                                Prochaine action :{" "}
                                {key === "forces" &&
                                  "capitaliser sur ce point fort dans la communication."}
                                {key === "weaknesses" &&
                                  "corriger ce point faible avant le prochain cycle d’avis."}
                                {key === "opportunities" &&
                                  "prioriser ce levier pour gagner des avis."}
                                {key === "threats" &&
                                  "mettre en place un suivi hebdomadaire dédié."}
                              </div>
                            </div>
                            ) : null
                          ))}
                        </div>
                        )}

                        {actions.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-6">
                          <div className="text-sm font-semibold text-slate-900">
                            Actions recommandées
                          </div>
                          <div className="mt-4 grid gap-3 text-xs text-slate-600">
                            {actions.length > 0 ? (
                              actions.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                                >
                                  <div className="font-semibold text-slate-700">
                                    Action : {item}
                                  </div>
                                  {actionWhy && <div className="mt-1">{actionWhy}</div>}
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {actionImpact}
                                  </div>
                                </div>
                              ))
                            ) : null}
                          </div>
                        </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          ) : null}
        </CardContent>
      </Card>
      )}
      <p className="pb-2 text-center text-[11px] font-medium text-slate-400">
        Powered by EGIA
      </p>
    </div>
  );
};

export { Reports };
