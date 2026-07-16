import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  RefreshCw
} from "lucide-react";
import { GoogleConnectionBadge } from "../components/GoogleConnectionBadge";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  formatGoogleConnectionReason,
  useGoogleConnectionStatus
} from "../hooks/useGoogleConnectionStatus";
import { cn } from "../lib/utils";
import { supabase } from "../lib/supabase";

type SystemHealthProps = {
  session: Session | null;
};

type LocationRow = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
  last_synced_at?: string | null;
};

type JobRow = {
  status: string | null;
  last_error: string | null;
  updated_at: string | null;
};

type CronStateRow = {
  key: string;
  value: unknown;
  updated_at: string | null;
};

type RunRow = {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
  processed: number | null;
  tags_upserted: number | null;
  errors_count: number | null;
  aborted: boolean | null;
  skip_reason: string | null;
  meta?: { location_id?: string | null; debug?: unknown } | null;
};

type StatusValue = {
  status?: "idle" | "running" | "done" | "error";
  last_run_at?: string;
  aborted?: boolean;
  stats?: { processed?: number; tagsUpserted?: number };
  errors_count?: number;
  last_error?: string | null;
  missing_insights_count?: number;
};

type HealthTone = "ok" | "late" | "error" | "unknown";

type JournalItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string | null;
  tone: HealthTone;
};

const statusCopy: Record<HealthTone, { label: string; className: string }> = {
  ok: {
    label: "OK",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  late: {
    label: "En retard",
    className: "border-amber-200 bg-amber-50 text-amber-700"
  },
  error: {
    label: "Erreur",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  },
  unknown: {
    label: "Inconnu",
    className: "border-slate-200 bg-slate-100 text-slate-600"
  }
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatDisplayTime = (value?: string | null) => {
  if (!value) return "Non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const relativeFormatter = new Intl.RelativeTimeFormat("fr-FR", {
    numeric: "auto"
  });

  if (absMs < 60 * 1000) return "à l'instant";
  if (absMs < 60 * 60 * 1000) {
    return relativeFormatter.format(Math.round(diffMs / (60 * 1000)), "minute");
  }
  if (absMs < 24 * 60 * 60 * 1000) {
    return relativeFormatter.format(Math.round(diffMs / (60 * 60 * 1000)), "hour");
  }
  if (absMs < 7 * 24 * 60 * 60 * 1000) {
    return relativeFormatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), "day");
  }

  return formatTimestamp(value);
};

const formatDurationSeconds = (
  startedAt?: string | null,
  finishedAt?: string | null,
  durationMs?: number | null
) => {
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  if (!startedAt || !finishedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }
  return `${Math.round((end - start) / 1000)}s`;
};

const formatSkipReason = (value?: string | null) => {
  if (!value) return "—";
  if (value === "no_candidates") return "Aucune tâche";
  if (value === "locked") return "Verrouillé";
  return value;
};

const isStale = (value?: string | null, maxAgeHours = 48) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp > maxAgeHours * 60 * 60 * 1000;
};

const isRecent = (value?: string | null, maxAgeHours = 24) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= maxAgeHours * 60 * 60 * 1000;
};

const getSyncTone = (value?: string | null): HealthTone => {
  if (!value) return "unknown";
  return isStale(value) ? "late" : "ok";
};

const getRunTone = (run: RunRow): HealthTone => {
  if ((run.errors_count ?? 0) > 0 || run.aborted) return "error";
  if (!run.finished_at && run.started_at) return "late";
  if (!run.started_at) return "unknown";
  return "ok";
};

const getAiStatusTone = (status: string, errors: number): HealthTone => {
  if (status === "error" || errors > 0) return "error";
  if (status === "running") return "late";
  if (status === "done") return "ok";
  return "unknown";
};

const StatusBadge = ({ tone }: { tone: HealthTone }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
      statusCopy[tone].className
    )}
  >
    {statusCopy[tone].label}
  </span>
);

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
    {children}
  </div>
);

const KpiCard = ({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: string;
  hint: string;
  tone: HealthTone;
}) => (
  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <StatusBadge tone={tone} />
    </div>
    <div className="mt-2 truncate text-2xl font-semibold text-slate-950">
      {value}
    </div>
    <p className="mt-1 min-h-8 text-xs leading-relaxed text-slate-500">{hint}</p>
  </div>
);

const statusPanelStyles: Record<HealthTone, string> = {
  ok: "border-emerald-200/80 bg-emerald-50/60",
  late: "border-amber-200/80 bg-amber-50/60",
  error: "border-rose-200/80 bg-rose-50/60",
  unknown: "border-slate-200/80 bg-white"
};

const statusDotStyles: Record<HealthTone, string> = {
  ok: "bg-emerald-500",
  late: "bg-amber-500",
  error: "bg-rose-500",
  unknown: "bg-slate-400"
};

const SystemHealth = ({ session }: SystemHealthProps) => {
  const supabaseClient = supabase;
  const googleConnection = useGoogleConnectionStatus(session);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [jobStats, setJobStats] = useState({
    queued: 0,
    running: 0,
    failed: 0,
    lastError: null as string | null,
    lastErrorAt: null as string | null
  });
  const [rows, setRows] = useState<CronStateRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runLocationLoading, setRunLocationLoading] = useState<string | null>(null);
  const [runLocationMessage, setRunLocationMessage] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseClient || !session) return;
    setLoading(true);
    setLoadError(null);
    const userId = session.user.id;

    const { data: settings } = await supabaseClient
      .from("business_settings")
      .select("active_location_ids")
      .eq("user_id", userId)
      .maybeSingle();
    const activeIds = Array.isArray(settings?.active_location_ids)
      ? settings.active_location_ids.filter(Boolean)
      : null;

    const { data: connection } = await supabaseClient
      .from("google_connections")
      .select("last_synced_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    const { data: cronRun } = await supabaseClient
      .from("cron_state")
      .select("value, updated_at")
      .eq("key", "google_reviews_last_run")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: locationRows, error: locationsError } = await supabaseClient
      .from("google_locations")
      .select("id, location_title, location_resource_name, last_synced_at")
      .eq("user_id", userId)
      .order("location_title", { ascending: true })
      .limit(50);

    const { data: jobs } = await supabaseClient
      .from("job_queue")
      .select("status, last_error, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    const { data: cronRows, error: cronError } = await supabaseClient
      .from("cron_state")
      .select("key, value, updated_at")
      .like("key", `ai_status_v1:${userId}:%`)
      .eq("user_id", userId)
      .limit(50);

    const dynamicSupabaseClient = supabaseClient as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => {
            limit: (count: number) => Promise<{ data: RunRow[] | null }>;
          };
        };
      };
    };
    const { data: runRows } = await dynamicSupabaseClient
      .from("ai_run_history")
      .select(
        "id, started_at, finished_at, duration_ms, processed, tags_upserted, errors_count, aborted, skip_reason, meta"
      )
      .order("started_at", { ascending: false })
      .limit(50);

    if (locationsError || cronError) {
      setLoadError(
        locationsError?.message ?? cronError?.message ?? "Erreur de chargement"
      );
      setLoading(false);
      return;
    }

    const filteredLocations =
      activeIds && activeIds.length > 0
        ? ((locationRows ?? []) as LocationRow[]).filter((loc) =>
            activeIds.includes(loc.id)
          )
        : ((locationRows ?? []) as LocationRow[]);
    const cronRunRow = cronRun as { value?: { at?: string }; updated_at?: string | null } | null;
    const cronRunAt = cronRunRow?.value?.at ?? cronRunRow?.updated_at ?? null;

    const stats = {
      queued: 0,
      running: 0,
      failed: 0,
      lastError: null as string | null,
      lastErrorAt: null as string | null
    };
    let latestFailed: JobRow | undefined;
    ((jobs ?? []) as JobRow[]).forEach((job) => {
      if (job.status === "queued") stats.queued += 1;
      if (job.status === "running") stats.running += 1;
      if (job.status === "failed") {
        stats.failed += 1;
        if (!latestFailed || (job.updated_at && job.updated_at > (latestFailed.updated_at ?? ""))) {
          latestFailed = job;
        }
      }
    });
    stats.lastError = latestFailed?.last_error ?? null;
    stats.lastErrorAt = latestFailed?.updated_at ?? null;

    setLastSyncAt(cronRunAt ?? connection?.last_synced_at ?? null);
    setLocations(filteredLocations);
    setJobStats(stats);
    setRows((cronRows ?? []) as CronStateRow[]);
    setRuns((runRows ?? []) as unknown as RunRow[]);
    setLoading(false);
  }, [session, supabaseClient]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const locationLabelById = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((loc) => {
      const label = loc.location_title ?? loc.location_resource_name ?? loc.id;
      map.set(loc.id, label);
      if (loc.location_resource_name) {
        map.set(loc.location_resource_name, label);
      }
    });
    return map;
  }, [locations]);

  const aiItems = useMemo(() => {
    const normalized = rows.map((row) => {
      const parts = row.key.split(":");
      const locationId = parts[2] ?? "";
      const value = row.value as StatusValue;
      return {
        locationId,
        location: locationLabelById.get(locationId) ?? locationId,
        status: value?.status ?? "idle",
        lastRunAt: value?.last_run_at ?? row.updated_at ?? null,
        processed: value?.stats?.processed ?? 0,
        tags: value?.stats?.tagsUpserted ?? 0,
        missing: value?.missing_insights_count ?? 0,
        errors: value?.errors_count ?? 0,
        lastError: value?.last_error ?? null
      };
    });
    const statusRank = (status: string) => {
      if (status === "error") return 0;
      if (status === "running") return 1;
      if (status === "done") return 2;
      return 3;
    };
    return normalized.sort((a, b) => {
      const statusDiff = statusRank(a.status) - statusRank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "");
    });
  }, [rows, locationLabelById]);

  const visibleRuns = useMemo(() => {
    return runs
      .filter((run) => {
        if (showErrorsOnly && (run.errors_count ?? 0) === 0) return false;
        if (showRecentOnly && (!run.started_at || isStale(run.started_at, 24))) {
          return false;
        }
        return true;
      })
      .slice(0, 8);
  }, [runs, showErrorsOnly, showRecentOnly]);

  const recentRunCount = useMemo(() => {
    return runs.filter((run) => run.started_at && !isStale(run.started_at, 24)).length;
  }, [runs]);

  const recentCriticalErrors = useMemo(() => {
    const recentAiErrors = runs.reduce((sum, run) => {
      if (!isRecent(run.started_at) || ((run.errors_count ?? 0) === 0 && !run.aborted)) {
        return sum;
      }
      return sum + Math.max(run.errors_count ?? 0, 1);
    }, 0);
    const recentJobError = jobStats.failed > 0 && isRecent(jobStats.lastErrorAt) ? 1 : 0;
    return recentAiErrors + recentJobError;
  }, [jobStats.failed, jobStats.lastErrorAt, runs]);

  const attentionIssues = useMemo(() => {
    const aiStatusErrors = aiItems.reduce((sum, item) => sum + item.errors, 0);
    return Math.max(jobStats.failed + aiStatusErrors - recentCriticalErrors, 0);
  }, [aiItems, jobStats.failed, recentCriticalErrors]);

  const hasAvailableData = useMemo(() => {
    return Boolean(
      lastSyncAt ||
        locations.length > 0 ||
        rows.length > 0 ||
        runs.length > 0 ||
        jobStats.queued > 0 ||
        jobStats.running > 0 ||
        jobStats.failed > 0 ||
        googleConnection.status !== "unknown"
    );
  }, [
    googleConnection.status,
    jobStats.failed,
    jobStats.queued,
    jobStats.running,
    lastSyncAt,
    locations.length,
    rows.length,
    runs.length
  ]);

  const globalStatus = useMemo(() => {
    if (recentCriticalErrors > 0) {
      return {
        tone: "error" as HealthTone,
        title: "Incident récent",
        message: "Une erreur récente demande une vérification."
      };
    }
    if (
      googleConnection.status === "reauth_required" ||
      googleConnection.status === "disconnected" ||
      getSyncTone(lastSyncAt) === "late" ||
      attentionIssues > 0
    ) {
      return {
        tone: "late" as HealthTone,
        title: "Attention",
        message: "Un point de connexion, de synchronisation ou d'analyse est à surveiller."
      };
    }
    if (!hasAvailableData) {
      return {
        tone: "unknown" as HealthTone,
        title: "Données indisponibles",
        message: "Aucune donnée de supervision n'est encore disponible."
      };
    }
    if (googleConnection.status === "connected" && getSyncTone(lastSyncAt) === "ok") {
      return {
        tone: "ok" as HealthTone,
        title: "Opérationnel",
        message: "Les connexions et traitements suivis sont au vert."
      };
    }
    return {
      tone: "unknown" as HealthTone,
      title: "À confirmer",
      message: "Certaines données nécessaires au diagnostic manquent encore."
    };
  }, [
    attentionIssues,
    googleConnection.status,
    hasAvailableData,
    lastSyncAt,
    recentCriticalErrors
  ]);

  const lastVerificationLabel = formatDisplayTime(
    googleConnection.lastCheckedAt ?? lastSyncAt
  );
  const globalActionCopy =
    globalStatus.tone === "ok"
      ? "Aucune action requise"
      : "Nous réessayons automatiquement";

  const journalItems = useMemo<JournalItem[]>(() => {
    const items: JournalItem[] = runs.slice(0, 6).map((run) => ({
      id: run.id,
      type: "Analyse IA",
      title: run.meta?.location_id
        ? locationLabelById.get(run.meta.location_id) ?? run.meta.location_id
        : "Tous les établissements",
      detail: `${run.processed ?? 0} avis analysés, ${run.errors_count ?? 0} erreurs`,
      at: run.started_at,
      tone: getRunTone(run)
    }));
    if (lastSyncAt) {
      items.push({
        id: "last-sync",
        type: "Google",
        title: "Synchronisation Google",
        detail: "Dernière mise à jour globale enregistrée",
        at: lastSyncAt,
        tone: getSyncTone(lastSyncAt)
      });
    }
    if (jobStats.lastError) {
      items.push({
        id: "last-job-error",
        type: "Traitement",
        title: "Traitement en erreur",
        detail: isRecent(jobStats.lastErrorAt)
          ? "Une erreur récente a été détectée."
          : "Une ancienne erreur reste enregistrée.",
        at: jobStats.lastErrorAt,
        tone: isRecent(jobStats.lastErrorAt) ? "error" : "late"
      });
    }
    return items
      .filter((item) => item.at)
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
      .slice(0, 8);
  }, [jobStats.lastError, jobStats.lastErrorAt, lastSyncAt, locationLabelById, runs]);

  const triggerRun = async () => {
    if (!session || runLoading) return;
    setRunLoading(true);
    setRunMessage(null);
    const token = session.access_token;
    try {
      let queued = 0;
      let skipped = 0;
      for (const location of locations) {
        const res = await fetch("/api/reviews?action=queue_analysis", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            location_id: location.id,
            mode: "backlog",
            limit: 20
          })
        });
        const payload = await res.json().catch(() => null);
        const requestId = payload?.requestId
          ? ` (requestId: ${payload.requestId})`
          : "";
        if (res.status === 401) {
          setRunMessage(`Non connecté${requestId}`);
          return;
        }
        if (res.status === 403) {
          setRunMessage(`Accès refusé${requestId}`);
          return;
        }
        if (!res.ok) {
          setRunMessage(`Erreur: ${res.status}${requestId}`);
          return;
        }
        queued += payload?.queued ?? 0;
        skipped += payload?.skipped ?? 0;
      }
      setRunMessage(`${queued} analyses en file, ${skipped} ignorées`);
      await load();
      window.setTimeout(() => setRefreshTick((value) => value + 1), 5000);
    } catch {
      setRunMessage("Erreur réseau.");
    } finally {
      setRunLoading(false);
    }
  };

  const triggerRunForLocation = async (locationId: string) => {
    if (!session || runLocationLoading) return;
    setRunLocationLoading(locationId);
    setRunLocationMessage((prev) => ({ ...prev, [locationId]: "" }));
    const token = session.access_token;
    try {
      const res = await fetch("/api/reviews?action=queue_analysis", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          location_id: locationId,
          mode: "backlog",
          limit: 20
        })
      });
      const payload = await res.json().catch(() => null);
      const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : "";
      if (res.status === 401) {
        setRunLocationMessage((prev) => ({ ...prev, [locationId]: `Non connecté${requestId}` }));
        return;
      }
      if (res.status === 403) {
        setRunLocationMessage((prev) => ({ ...prev, [locationId]: `Accès refusé${requestId}` }));
        return;
      }
      if (!res.ok) {
        setRunLocationMessage((prev) => ({ ...prev, [locationId]: `Erreur: ${res.status}${requestId}` }));
        return;
      }
      const queued = payload?.queued ?? 0;
      const skipped = payload?.skipped ?? 0;
      setRunLocationMessage((prev) => ({
        ...prev,
        [locationId]: `OK - ${queued} en file - ${skipped} ignorés`
      }));
      await load();
      window.setTimeout(() => setRefreshTick((value) => value + 1), 5000);
    } catch {
      setRunLocationMessage((prev) => ({ ...prev, [locationId]: "Erreur réseau." }));
    } finally {
      setRunLocationLoading(null);
    }
  };

  const handleCopyMeta = async (meta?: RunRow["meta"]) => {
    const resetCopyStatus = () => {
      window.setTimeout(() => setCopyStatus(null), 1800);
    };
    if (!meta) {
      setCopyStatus("Aucune donnée à copier.");
      resetCopyStatus();
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Copie indisponible.");
      resetCopyStatus();
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(meta, null, 2));
      setCopyStatus("Copié");
      resetCopyStatus();
    } catch {
      setCopyStatus("Copie indisponible.");
      resetCopyStatus();
    }
  };

  if (!supabaseClient) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-slate-500">
          Configuration Supabase manquante.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden md:space-y-4">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#f7f3ec] via-white to-[#eef3f1] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" className="bg-white/70">
                Centre de supervision
              </Badge>
              <span className="text-xs font-medium text-slate-500">
                Dernière vérification: {lastVerificationLabel}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
              Centre de supervision
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Connexion Google, mises à jour et analyses IA au même endroit.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <Button
              variant="outline"
              className="min-h-11 bg-white/80 focus-visible:ring-2 focus-visible:ring-ink/30"
              onClick={() => setRefreshTick((value) => value + 1)}
            >
              <RefreshCw size={16} />
              Rafraîchir
            </Button>
            <Button
              className="min-h-11 focus-visible:ring-2 focus-visible:ring-ink/30"
              onClick={() => {
                window.location.href = "/connect";
              }}
            >
              Gérer Google
            </Button>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="system-health-status"
        className={cn(
          "min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5",
          statusPanelStyles[globalStatus.tone]
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Statut global
            </p>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  statusDotStyles[globalStatus.tone]
                )}
                aria-hidden="true"
              />
              <h3 id="system-health-status" className="text-base font-semibold text-slate-950">
                {globalStatus.title}
              </h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">{globalStatus.message}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={globalStatus.tone} />
            <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600">
              {globalActionCopy}
            </span>
          </div>
        </div>
      </section>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : loadError ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="space-y-3 pt-6 text-sm text-rose-700">
            <p className="font-semibold">Impossible de charger la supervision.</p>
            <p>Réessayez dans quelques instants. Les données existantes ne sont pas modifiées.</p>
            <details className="rounded-xl border border-rose-200 bg-white/70 p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Détails techniques</summary>
              <p className="mt-2 break-words">{loadError}</p>
            </details>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Google connecté"
              value={googleConnection.status === "connected" ? "Connecté" : "À vérifier"}
              hint={
                googleConnection.status === "reauth_required"
                  ? formatGoogleConnectionReason(googleConnection.reason)
                  : googleConnection.lastCheckedAt
                    ? `Vérifié ${formatDisplayTime(googleConnection.lastCheckedAt)}`
                    : "Statut de connexion Google"
              }
              tone={
                googleConnection.status === "connected"
                  ? "ok"
                  : googleConnection.status === "unknown"
                    ? "unknown"
                    : googleConnection.status === "reauth_required"
                      ? "error"
                      : "late"
              }
            />
            <KpiCard
              label="Dernière synchro"
              value={formatDisplayTime(lastSyncAt)}
              hint="Dernière mise à jour Google globale"
              tone={getSyncTone(lastSyncAt)}
            />
            <KpiCard
              label="Analyses IA récentes"
              value={`${recentRunCount}`}
              hint="Analyses lancées sur les dernières 24h"
              tone={recentRunCount > 0 ? "ok" : runs.length > 0 ? "late" : "unknown"}
            />
            <KpiCard
              label="Incidents récents"
              value={`${recentCriticalErrors}`}
              hint="Points à surveiller sur les dernières 24h"
              tone={recentCriticalErrors > 0 ? "error" : attentionIssues > 0 ? "late" : "ok"}
            />
          </section>

          <section className="min-w-0">
            <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Connecteurs</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Google Business Profile
                    </p>
                  </div>
                  <DatabaseZap className="h-5 w-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-2 sm:p-5 sm:pt-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <GoogleConnectionBadge
                      status={googleConnection.status}
                      isLoading={googleConnection.isLoading}
                    />
                    <StatusBadge
                      tone={
                        googleConnection.status === "connected"
                          ? "ok"
                          : googleConnection.status === "reauth_required"
                            ? "error"
                            : googleConnection.status === "unknown"
                              ? "unknown"
                              : "late"
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <div className="rounded-xl bg-white px-3 py-2">
                      Dernière vérification: {lastVerificationLabel}
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      {googleConnection.status === "connected"
                        ? "Aucune action requise"
                        : "Nous réessayons automatiquement"}
                    </div>
                  </div>
                  {googleConnection.status === "reauth_required" && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {formatGoogleConnectionReason(googleConnection.reason)}
                    </p>
                  )}
                  {googleConnection.status === "disconnected" && (
                    <p className="mt-3 text-xs text-slate-600">
                      Connectez Google pour suivre les avis et les mises à jour.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Synchronisations</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Dernière mise à jour globale et par établissement.
                    </p>
                  </div>
                  <RefreshCw className="h-5 w-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2 sm:p-5 sm:pt-2">
                <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Mise à jour globale
                    </p>
                    <p className="text-xs text-slate-500">
                      Dernière vérification: {formatDisplayTime(lastSyncAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {getSyncTone(lastSyncAt) === "ok"
                        ? "Aucune action requise"
                        : "Nous réessayons automatiquement"}
                    </p>
                  </div>
                  <StatusBadge tone={getSyncTone(lastSyncAt)} />
                </div>
                {locations.length === 0 ? (
                  <EmptyState>Aucun établissement actif disponible.</EmptyState>
                ) : (
                  <div className="space-y-2">
                    {locations.map((loc) => (
                      <div
                        key={loc.id}
                        className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-100 bg-white px-3 py-3 transition hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {loc.location_title ?? loc.location_resource_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Dernière vérification: {formatDisplayTime(loc.last_synced_at)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {getSyncTone(loc.last_synced_at) === "ok"
                              ? "Aucune action requise"
                              : "Nous réessayons automatiquement"}
                          </p>
                        </div>
                        <StatusBadge tone={getSyncTone(loc.last_synced_at)} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Santé IA</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Dernières analyses et état par établissement.
                    </p>
                  </div>
                  <Bot className="h-5 w-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2 sm:p-5 sm:pt-2">
                {visibleRuns.length === 0 ? (
                  <EmptyState>Aucune analyse IA disponible pour le moment.</EmptyState>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {visibleRuns.map((run) => (
                      <button
                        type="button"
                        key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className="grid w-full min-w-0 gap-2 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 md:grid-cols-[minmax(0,1.35fr)_0.65fr_0.65fr_0.75fr_auto]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {run.meta?.location_id
                              ? locationLabelById.get(run.meta.location_id) ?? run.meta.location_id
                              : "Tous les établissements"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDisplayTime(run.started_at)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 md:block">
                          <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">
                            Avis
                          </span>
                          <span className="text-sm text-slate-700">{run.processed ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 md:block">
                          <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">
                            Erreurs
                          </span>
                          <span className="text-sm text-slate-700">{run.errors_count ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 md:block">
                          <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">
                            Durée
                          </span>
                          <span className="text-sm text-slate-700">
                            {formatDurationSeconds(
                              run.started_at,
                              run.finished_at,
                              run.duration_ms ?? null
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 md:justify-end">
                          <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">
                            Statut
                          </span>
                          <StatusBadge tone={getRunTone(run)} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {journalItems.length > 0 && (
              <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm xl:col-span-2">
              <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Journal récent</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Derniers événements utiles à suivre.
                    </p>
                  </div>
                  <Activity className="h-5 w-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
                <div className="grid gap-3 md:grid-cols-2">
                    {journalItems.map((item) => (
                      <div key={item.id} className="flex min-w-0 gap-3 rounded-xl bg-slate-50 p-3">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          {item.tone === "error" ? (
                            <AlertTriangle size={15} />
                          ) : item.tone === "ok" ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <Clock3 size={15} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {item.type}
                            </span>
                            <StatusBadge tone={item.tone} />
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                            {item.title}
                          </p>
                          <p className="break-words text-xs text-slate-500">{item.detail}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatDisplayTime(item.at)}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
            )}
          </section>

          <details
            className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
            open={technicalOpen}
            onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
          >
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 sm:p-5"
              aria-expanded={technicalOpen}
            >
              <span>Détails techniques</span>
              <span className="text-xs font-medium text-slate-400 group-open:hidden">
                Ouvrir
              </span>
              <span className="hidden text-xs font-medium text-slate-400 group-open:inline">
                Fermer
              </span>
            </summary>
            <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  File jobs: {jobStats.queued} en attente, {jobStats.running} en cours,{" "}
                  {jobStats.failed} en erreur
                </div>
                {googleConnection.lastError && (
                  <div className="break-words rounded-xl bg-slate-50 p-3">
                    Erreur Google: {googleConnection.lastError}
                  </div>
                )}
                <label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={showErrorsOnly}
                    onChange={(event) => setShowErrorsOnly(event.target.checked)}
                  />
                  Runs avec erreurs
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={showRecentOnly}
                    onChange={(event) => setShowRecentOnly(event.target.checked)}
                  />
                  Runs récents 24h
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={triggerRun}
                  disabled={runLoading}
                  className="min-h-11"
                >
                  {runLoading ? "Lancement..." : "Lancer l'analyse IA"}
                </Button>
                {runMessage && (
                  <p className="text-sm text-slate-600">{runMessage}</p>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {aiItems.length === 0 ? (
                  <EmptyState>Aucun statut IA par établissement.</EmptyState>
                ) : (
                  aiItems.map((item) => (
                    <div
                      key={item.locationId}
                      className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.location || "Établissement inconnu"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Dernier run: {formatTimestamp(item.lastRunAt)}
                          </p>
                        </div>
                        <StatusBadge tone={getAiStatusTone(item.status, item.errors)} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                        <span>Avis: {item.processed}</span>
                        <span>Tags: {item.tags}</span>
                        <span>Manquants: {item.missing}</span>
                        <span>Erreurs: {item.errors}</span>
                      </div>
                      {item.lastError && (
                        <p className="mt-2 break-words text-xs text-rose-600">
                          {item.lastError}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 min-h-11 w-full sm:w-auto"
                        disabled={runLocationLoading === item.locationId}
                        onClick={() => triggerRunForLocation(item.locationId)}
                      >
                        {runLocationLoading === item.locationId
                          ? "Lancement..."
                          : "Lancer pour ce lieu"}
                      </Button>
                      {runLocationMessage[item.locationId] && (
                        <p className="mt-2 text-xs text-slate-500">
                          {runLocationMessage[item.locationId]}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </>
      )}

      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Détails techniques de l'analyse
              </h3>
              <Button variant="outline" size="sm" onClick={() => setSelectedRun(null)}>
                Fermer
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Établissement:</span>{" "}
                {selectedRun.meta?.location_id
                  ? locationLabelById.get(selectedRun.meta.location_id) ??
                    selectedRun.meta.location_id
                  : "Tous"}
              </div>
              <div>
                <span className="font-semibold">Motif d'arrêt:</span>{" "}
                {formatSkipReason(selectedRun.skip_reason)}
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">Meta</span>
                  <div className="flex items-center gap-2">
                    {copyStatus && (
                      <span className="text-[11px] text-slate-500">{copyStatus}</span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-0"
                      onClick={() => handleCopyMeta(selectedRun.meta)}
                    >
                      Copier le JSON
                    </Button>
                  </div>
                </div>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {JSON.stringify(selectedRun.meta ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { SystemHealth };
export default SystemHealth;
