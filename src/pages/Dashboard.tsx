import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  ChevronRight,
  Globe2,
  MessageSquare,
  RefreshCw
} from "lucide-react";
import { BusinessHealthScoreCard } from "../components/coach/BusinessHealthScore";
import { buildBusinessHealthScoreModel } from "../components/coach/businessHealthScoreModel";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { buildAreaPath, buildLinePath } from "./analytics/utils";
import {
  type AppNotificationBase,
  type AppNotification,
  type NotificationKind,
  type NotificationSeverity,
  addNotificationDedup,
  getNotifications,
  STORAGE_KEY_READ_NOTIFICATIONS,
  getReadNotificationIds,
  dispatchNotificationsUpdated
} from "../lib/notifications";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import {
  type DashboardKpiPreset,
  dashboardAiKpisQueryKey,
  dashboardKpiSummaryQueryKey,
  useDashboardActiveLocationSettings,
  useDashboardAiKpis,
  useDashboardKpiSummary,
  useSaveDashboardActiveLocations
} from "../hooks/useDashboardQueries";
import { useCoachResult } from "../services/coach";

type DashboardProps = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  googleLastError?: string;
  onSyncLocations: () => void;
  syncDisabled?: boolean;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
  syncing: boolean;
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Bonjour";
  } else if (hour >= 12 && hour < 18) {
    return "Bon après-midi";
  } else {
    return "Bonsoir";
  }
};

const getFirstName = (session: Session | null): string | null => {
  if (!session?.user) {
    return null;
  }

  const metadata = session.user.user_metadata;
  if (metadata?.first_name) {
    return metadata.first_name;
  }

  if (metadata?.full_name) {
    const parts = metadata.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  if (session.user.email) {
    const emailPart = session.user.email.split("@")[0];
    const parts = emailPart.split(/[._-]/);
    if (parts.length > 0 && parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }

  return null;
};

const formatKpiValue = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  const stringValue = String(value);
  if (
    stringValue === "undefined%" ||
    stringValue === "NaN%" ||
    stringValue === "-" ||
    stringValue.trim() === ""
  ) {
    return "—";
  }
  return stringValue;
};

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatRating = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}/5`;

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

const formatScore = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const formatDisplayUrl = (value: string | null): string => {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "—";
  }

  try {
    const parsedUrl = new URL(
      /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`
    );
    const hostname = parsedUrl.hostname.replace(/^www\./i, "");
    const pathname =
      parsedUrl.pathname === "/" ? "" : parsedUrl.pathname.replace(/\/$/, "");
    return `${hostname}${pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return rawValue;
  }
};

const getKpiReason = (reasons?: string[]): string => {
  if (!reasons || reasons.length === 0) {
    return "Pas assez de données";
  }
  if (reasons.includes("no_locations")) {
    return "Aucune fiche connectée";
  }
  if (reasons.includes("no_reviews_in_range")) {
    return "Aucun avis sur la période";
  }
  if (reasons.includes("no_sentiment_yet")) {
    return "Analyse en cours";
  }
  if (reasons.includes("invalid_source")) {
    return "Source incompatible";
  }
  return "Pas assez de données";
};

const DashboardSparkline = ({
  values,
  tone = "neutral"
}: {
  values: Array<number | null>;
  tone?: "neutral" | "positive" | "critical";
}) => {
  const width = 150;
  const height = 38;
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const stroke =
    tone === "positive" ? "#059669" : tone === "critical" ? "#e11d48" : "#0f172a";

  if (validValues.length < 2) {
    return (
      <div className="flex h-9 items-center">
        <div className="h-px w-full bg-slate-200" />
      </div>
    );
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const lineMin = min === max ? min - 1 : min;
  const lineMax = min === max ? max + 1 : max;
  const path = buildLinePath(values, lineMin, lineMax, width, height, 5);
  const area = buildAreaPath(path, values, width, height, 5);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Mini tendance"
      className="h-9 w-full"
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity="0.08" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
};

const CompactEmptyState = ({
  icon,
  title,
  description,
  tone = "neutral"
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "success" | "info";
}) => {
  const toneClass =
    tone === "success"
      ? {
          shell: "border-emerald-200 bg-emerald-50/70",
          icon: "border-emerald-200 bg-white text-emerald-700",
          title: "text-emerald-900",
          description: "text-emerald-700/80"
        }
      : tone === "info"
        ? {
            shell: "border-sky-200 bg-sky-50/60",
            icon: "border-sky-200 bg-white text-sky-700",
            title: "text-sky-950",
            description: "text-sky-700/80"
          }
        : {
            shell: "border-slate-200 bg-slate-50/80",
            icon: "border-slate-200 bg-white text-slate-600",
            title: "text-slate-900",
            description: "text-slate-500"
          };

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass.shell}`}>
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${toneClass.icon}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-5 ${toneClass.title}`}>
            {title}
          </p>
          <p className={`mt-0.5 text-xs leading-5 ${toneClass.description}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

const getPresetLabel = (preset: string): string => {
  switch (preset) {
    case "this_week":
      return "Cette semaine";
    case "this_month":
      return "Ce mois";
    case "this_quarter":
      return "Ce trimestre";
    case "last_quarter":
      return "Trimestre précédent";
    case "this_year":
      return "Cette année";
    case "last_year":
      return "Année dernière";
    case "all_time":
      return "Depuis toujours";
    case "custom":
      return "Personnalisé";
    default:
      return "—";
  }
};

const getSeverityOrder = (severity: NotificationSeverity): number => {
  const order: Record<NotificationSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };
  return order[severity];
};

const getNotificationIcon = (
  kind: NotificationKind,
  severity: NotificationSeverity
) => {
  if (kind === "review") {
    if (severity === "critical" || severity === "high") {
      return <AlertTriangle className="h-4 w-4" />;
    }
    return <MessageSquare className="h-4 w-4" />;
  }
  if (kind === "sync") {
    return <RefreshCw className="h-4 w-4" />;
  }
  if (kind === "connection") {
    return <CheckCircle className="h-4 w-4" />;
  }
  return <Bell className="h-4 w-4" />;
};

const getNotificationTimelineTone = (
  kind: NotificationKind,
  severity: NotificationSeverity
): string => {
  if (kind === "review") {
    return severity === "critical" || severity === "high"
      ? "border-rose-200 bg-rose-50 text-rose-600"
      : "border-emerald-200 bg-emerald-50 text-emerald-600";
  }
  if (kind === "sync") {
    return "border-sky-200 bg-sky-50 text-sky-600";
  }
  if (kind === "connection") {
    return "border-emerald-200 bg-emerald-50 text-emerald-600";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
};

const formatRelativeTime = (isoDate: string): string => {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Il y a moins d'une minute";
  } else if (diffMins < 60) {
    return `Il y a ${diffMins} minute${diffMins > 1 ? "s" : ""}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? "s" : ""}`;
  } else {
    return `Il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  }
};

type NotificationDraft = Omit<AppNotificationBase, "id" | "createdAt" | "message"> & {
  message?: string | null;
};

const createNotification = (
  partial: NotificationDraft,
  opts?: { key?: string; cooldownMs?: number }
): void => {
  const rawMessage = partial.message;
  const normalizedMessage =
    typeof rawMessage === "string" ? rawMessage.trim().toLowerCase() : "";
  const message =
    normalizedMessage === "" ||
    normalizedMessage === "undefined" ||
    normalizedMessage === "null"
      ? "Une erreur est survenue"
      : (rawMessage as string);

  const notification: AppNotificationBase = {
    ...partial,
    message,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString()
  };

  addNotificationDedup(notification, opts);
};

const Dashboard = ({
  session,
  googleStatus,
  onSyncLocations,
  syncDisabled = false,
  locations,
  locationsLoading,
  locationsError,
  syncing
}: DashboardProps) => {
  const greeting = getGreeting();
  const firstName = getFirstName(session);
  const greetingText = firstName ? `${greeting}, ${firstName}` : `${greeting}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const prevSyncingRef = useRef<boolean>(syncing);
  const prevLocationsErrorRef = useRef<string | null>(locationsError);

  const [readNotificationIds] = useState<Set<string>>(
    getReadNotificationIds
  );
  const [kpiPreset, setKpiPreset] =
    useState<DashboardKpiPreset>("all_time");
  const [kpiFrom, setKpiFrom] = useState("");
  const [kpiTo, setKpiTo] = useState("");
  const [kpiLocationId, setKpiLocationId] = useState("");
  const queryClient = useQueryClient();
  const userId = session?.user?.id ?? null;
  const workspaceId = userId;
  const accountId = userId;
  const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const idsArray = Array.from(readNotificationIds);
      window.localStorage.setItem(
        STORAGE_KEY_READ_NOTIFICATIONS,
        JSON.stringify(idsArray)
      );
      dispatchNotificationsUpdated();
    } catch {
      // Ignore storage errors
    }
  }, [readNotificationIds]);

  useEffect(() => {
    if (!kpiLocationId) {
      setKpiLocationId("all");
    }
  }, [kpiLocationId]);

  const kpiQuery = useDashboardKpiSummary({
    accessToken: session?.access_token ?? null,
    workspaceId,
    accountId,
    userId,
    locationId: kpiLocationId,
    preset: kpiPreset,
    from: kpiFrom,
    to: kpiTo,
    timeZone
  });

  const aiKpiQuery = useDashboardAiKpis({
    workspaceId,
    accountId,
    userId,
    locationId: kpiLocationId,
    preset: kpiPreset,
    from: kpiFrom,
    to: kpiTo,
    timeZone
  });

  const activeLocationSettingsQuery = useDashboardActiveLocationSettings({
    workspaceId,
    accountId,
    userId
  });
  const saveActiveLocationsMutation = useSaveDashboardActiveLocations();

  const kpiData = kpiQuery.data ?? null;
  const kpiLoading = kpiQuery.isLoading && !kpiQuery.data;
  const kpiRefreshing = kpiQuery.isFetching && Boolean(kpiQuery.data);
  const kpiError = kpiQuery.isError ? "Impossible de charger les KPIs." : null;

  const aiKpiData = aiKpiQuery.data ?? null;
  const aiKpiLoading = aiKpiQuery.isLoading && !aiKpiQuery.data;
  const aiKpiRefreshing = aiKpiQuery.isFetching && Boolean(aiKpiQuery.data);
  const aiKpiError = aiKpiQuery.isError ? "Impossible de charger l'analyse IA." : null;

  useEffect(() => {
    if (!session) {
      setSelectedActiveIds([]);
      return;
    }
    if (activeLocationSettingsQuery.isError) {
      console.error("business_settings load error:", activeLocationSettingsQuery.error);
      setSelectedActiveIds(locations.map((location) => location.id));
      return;
    }
    if (!activeLocationSettingsQuery.isSuccess) {
      return;
    }
    const ids = activeLocationSettingsQuery.data.active_location_ids;
    const resolved =
      ids && ids.length > 0 ? ids : locations.map((location) => location.id);
    setSelectedActiveIds(resolved);
  }, [
    activeLocationSettingsQuery.data,
    activeLocationSettingsQuery.error,
    activeLocationSettingsQuery.isError,
    activeLocationSettingsQuery.isSuccess,
    locations,
    session
  ]);

  const saveActiveLocations = async () => {
    if (!session || !userId || !accountId) {
      return;
    }
    const allIds = locations.map((location) => location.id);
    try {
      const saved = await saveActiveLocationsMutation.mutateAsync({
        workspaceId,
        accountId,
        userId,
        businessName: session.user.email ?? "Business",
        selectedActiveIds,
        allLocationIds: allIds
      });
      setSelectedActiveIds(saved.activeLocationIds ?? allIds);
    } catch (error) {
      console.error("business_settings save error:", error);
    }
  };
  const activeLocationsSaving = saveActiveLocationsMutation.isPending;

  useEffect(() => {
    const prevSyncing = prevSyncingRef.current;
    if (prevSyncing !== syncing) {
      if (!prevSyncing && syncing) {
        createNotification({
          kind: "sync",
          severity: "info",
          title: "Synchronisation lancée",
          message: "Synchronisation des lieux en cours…"
        });
      } else if (prevSyncing && !syncing) {
        if (locationsError) {
          createNotification({
            kind: "sync",
            severity: "high",
            title: "Erreur de synchronisation",
            message: locationsError
          });
        } else {
          const count = locations.length;
          createNotification({
            kind: "sync",
            severity: "info",
            title: "Synchronisation terminée",
            message: `${count} ${count === 1 ? "lieu disponible" : "lieux disponibles"}.`
          });
        }
      }
    }
    prevSyncingRef.current = syncing;
  }, [syncing, locationsError, locations.length]);

  useEffect(() => {
    const currentError = locationsError?.trim() ?? "";
    const prevError = prevLocationsErrorRef.current?.trim() ?? "";
    if (!syncing && currentError && !prevError) {
      createNotification({
        kind: "sync",
        severity: "high",
        title: "Erreur",
        message: locationsError ?? "Une erreur est survenue"
      });
    }
    prevLocationsErrorRef.current = locationsError;
  }, [locationsError, syncing]);

  const notificationsWithStatus: AppNotification[] = getNotifications().map((notif) => ({
    ...notif,
    status: readNotificationIds.has(notif.id) ? ("read" as const) : ("unread" as const)
  }));

  const urgentActionsCount = notificationsWithStatus.filter(
    (n) => n.requiresAction === true
  ).length;
  const coach = useCoachResult({
    session,
    googleStatus,
    locations,
    notifications: notificationsWithStatus
  });
  const healthModel = useMemo(
    () => buildBusinessHealthScoreModel(coach.coachResult, coach.coachInput),
    [coach.coachInput, coach.coachResult]
  );

  const sortedNotifications = notificationsWithStatus
    .slice()
    .sort((a, b) => {
      const aRequiresAction = a.requiresAction === true;
      const bRequiresAction = b.requiresAction === true;
      if (aRequiresAction !== bRequiresAction) {
        return aRequiresAction ? -1 : 1;
      }
      if (a.status !== b.status) {
        return a.status === "unread" ? -1 : 1;
      }
      const severityDiff = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const recentActivities = sortedNotifications.slice(0, 5);

  const handleOpenInbox = () => {
    window.location.href = "/inbox";
  };

  const kpiReason = getKpiReason(kpiData?.meta?.reasons);
  const noData = kpiData?.meta?.data_status === "no_data";
  const responseRate = kpiData?.response.response_rate_pct ?? null;
  const responseRateValid =
    responseRate !== null && responseRate >= 0 && responseRate <= 100;
  const kpiCards = [
    {
      id: "reviews_total",
      label: "Volume d'avis",
      value: noData ? "—" : formatCount(kpiData?.counts.reviews_total),
      variation: noData
        ? kpiReason
        : `Avec texte: ${formatCount(kpiData?.counts.reviews_with_text)}`
    },
    {
      id: "avg_rating",
      label: "Note moyenne",
      value: formatRating(kpiData?.ratings.avg_rating ?? null),
      variation:
        kpiData?.ratings.avg_rating === null ? kpiReason : "Sur 5"
    },
    {
      id: "response_rate",
      label: "Taux de réponse",
      value: responseRateValid ? formatPercent(responseRate) : "—",
      variation:
        !responseRateValid
          ? kpiReason
          : `Sur ${formatCount(kpiData?.counts.reviews_replyable)} avis`
    },
    {
      id: "sentiment_positive",
      label: "Sentiment positif",
      value: formatPercent(kpiData?.sentiment.sentiment_positive_pct ?? null),
      variation:
        kpiData?.sentiment.sentiment_positive_pct === null
          ? kpiReason
          : `Sur ${formatCount(kpiData?.sentiment.sentiment_samples)} avis`
    },
    {
      id: "nps",
      label: (
        <span className="inline-flex items-center gap-1">
          Indice de recommandation
          <span
            className="text-xs text-slate-400"
            title="Mesure la probabilite que vos clients vous recommandent."
          >
            ⓘ
          </span>
        </span>
      ),
      value: kpiData?.nps.nps_score ?? "—",
      variation:
        kpiData?.nps.nps_score === null
          ? kpiReason
          : `Sur ${formatCount(kpiData?.nps.nps_samples)} avis`
    }
  ];

  const aiSamples = aiKpiData?.sentiment.samples ?? 0;
  const aiTrend = aiKpiData?.trend ?? [];
  const activeAiTrend = aiTrend.filter(
    (point) =>
      point.samples > 0 ||
      point.avgScore !== null ||
      point.criticalCount > 0
  );
  const latestAiTrendPoint =
    activeAiTrend[activeAiTrend.length - 1] ?? aiTrend[aiTrend.length - 1] ?? null;
  const aiTopTags = aiKpiData?.topTags ?? [];
  const aiSentimentBreakdown = [
    {
      label: "Positif",
      value: aiKpiData?.sentiment.positivePct ?? null,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    },
    {
      label: "Neutre",
      value: aiKpiData?.sentiment.neutralPct ?? null,
      className: "border-slate-200 bg-slate-50 text-slate-600"
    },
    {
      label: "Négatif",
      value: aiKpiData?.sentiment.negativePct ?? null,
      className: "border-rose-200 bg-rose-50 text-rose-700"
    },
    {
      label: "Mixte",
      value: aiKpiData?.sentiment.mixedPct ?? null,
      className: "border-amber-200 bg-amber-50 text-amber-700"
    }
  ];
  const dominantAiSentiment = aiSentimentBreakdown.reduce<
    (typeof aiSentimentBreakdown)[number] | null
  >((current, item) => {
    if (item.value === null) {
      return current;
    }
    if (!current || item.value > (current.value ?? 0)) {
      return item;
    }
    return current;
  }, null);
  const aiPositivePct = aiKpiData?.sentiment.positivePct ?? null;
  const aiNegativePct = aiKpiData?.sentiment.negativePct ?? null;
  const aiPriorityCount = aiKpiData?.priorityCount ?? 0;
  const aiPrimaryTag = aiTopTags[0] ?? null;
  const aiSummarySentence =
    aiSamples === 0
      ? "Les conclusions apparaîtront dès que des avis seront analysés."
      : `${dominantAiSentiment?.label ?? "Signal principal"} ressort en premier (${formatPercent(
          dominantAiSentiment?.value ?? null
        )}) sur ${formatCount(aiSamples)} avis analysés.`;
  const aiConclusionCards = [
    {
      id: "forces",
      label: "Forces",
      value: formatPercent(aiPositivePct),
      body:
        aiPositivePct === null
          ? "Les points forts seront isolés dès que le volume qualifié sera suffisant."
          : `${formatPercent(aiPositivePct)} d'avis positifs dans l'échantillon IA.`,
      icon: <CheckCircle className="h-4 w-4" />,
      shellClass: "border-emerald-200 bg-emerald-50/70",
      iconClass: "border-emerald-200 bg-white text-emerald-700",
      valueClass: "text-emerald-900",
      bodyClass: "text-emerald-700/80"
    },
    {
      id: "risks",
      label: "Risques",
      value: formatCount(aiPriorityCount),
      body:
        aiPriorityCount > 0
          ? `${formatCount(aiPriorityCount)} avis critique${aiPriorityCount > 1 ? "s" : ""} à surveiller.`
          : `Risque faible sur la période (${formatPercent(aiNegativePct)} négatifs).`,
      icon: <AlertTriangle className="h-4 w-4" />,
      shellClass: "border-rose-200 bg-rose-50/70",
      iconClass: "border-rose-200 bg-white text-rose-700",
      valueClass: "text-rose-900",
      bodyClass: "text-rose-700/80"
    },
    {
      id: "opportunities",
      label: "Opportunités",
      value: aiPrimaryTag?.tag ?? "À détecter",
      body: aiPrimaryTag
        ? `${aiPrimaryTag.count} mention${aiPrimaryTag.count > 1 ? "s" : ""} autour de ce thème à exploiter.`
        : "Aucun thème récurrent ne ressort encore assez nettement.",
      icon: <MessageSquare className="h-4 w-4" />,
      shellClass: "border-sky-200 bg-sky-50/70",
      iconClass: "border-sky-200 bg-white text-sky-700",
      valueClass: "text-sky-950",
      bodyClass: "text-sky-700/80"
    }
  ];
  const aiMetricCards = [
    {
      label: "Score moyen",
      value: aiKpiLoading ? "…" : formatScore(aiKpiData?.avgScore ?? null),
      caption: aiSamples === 0 ? "En attente de signal" : `Sur ${aiSamples} avis`
    },
    {
      label: "Avis analysés",
      value: aiKpiLoading ? "…" : formatCount(aiSamples),
      caption: aiSamples === 0 ? "Aucun avis qualifié" : "Sur la période"
    },
    {
      label: "Avis critiques",
      value: aiKpiLoading ? "…" : formatCount(aiKpiData?.priorityCount ?? null),
      caption: aiSamples === 0 ? "Rien à prioriser" : "À traiter en priorité"
    }
  ];
  const activeLocationsCount = locations.filter((location) =>
    selectedActiveIds.includes(location.id)
  ).length;

  return (
    <div className="space-y-4">
      <div className="-mb-2">
        <h2 className="text-sm font-medium text-slate-500">{greetingText}</h2>
      </div>

      <BusinessHealthScoreCard
        model={healthModel}
        variant="dashboard"
        loading={kpiLoading || aiKpiLoading || coach.isLoading}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.045)]">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100/70 bg-white px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem]">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Lieu
              </label>
              <select
                className="mt-1 h-8 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                value={kpiLocationId}
                onChange={(event) => setKpiLocationId(event.target.value)}
              >
                <option value="all">Toutes les fiches</option>
                {locations.map((location) => (
                  <option
                    key={location.location_resource_name}
                    value={location.location_resource_name}
                  >
                    {location.location_title ?? location.location_resource_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[10rem]">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Période
              </label>
              <select
                className="mt-1 h-8 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                value={kpiPreset}
                onChange={(event) =>
                  setKpiPreset(event.target.value as typeof kpiPreset)
                }
              >
                <option value="this_week">Cette semaine</option>
                <option value="this_month">Ce mois</option>
                <option value="this_quarter">Ce trimestre</option>
                <option value="last_quarter">Trimestre précédent</option>
                <option value="this_year">Cette année</option>
                <option value="last_year">Année dernière</option>
                <option value="all_time">Depuis toujours</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {kpiPreset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="h-8 w-36 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={kpiFrom}
                  onChange={(event) => setKpiFrom(event.target.value)}
                />
                <input
                  type="date"
                  className="h-8 w-36 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={kpiTo}
                  onChange={(event) => setKpiTo(event.target.value)}
                />
              </div>
            )}
            {kpiError && (
              <span className="text-xs text-amber-700">{kpiError}</span>
            )}
            <span className="mb-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {getPresetLabel(kpiPreset)}
            </span>
            {(kpiRefreshing || aiKpiRefreshing) && (
              <span className="mb-2 text-xs font-medium text-slate-400">
                Actualisation...
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 text-xs font-semibold"
            onClick={() => {
              void queryClient.invalidateQueries({
                queryKey: dashboardKpiSummaryQueryKey({
                  workspaceId,
                  accountId,
                  userId,
                  locationId: kpiLocationId,
                  preset: kpiPreset,
                  from: kpiFrom,
                  to: kpiTo,
                  timeZone
                }),
                exact: true
              });
              void queryClient.invalidateQueries({
                queryKey: dashboardAiKpisQueryKey({
                  workspaceId,
                  accountId,
                  userId,
                  locationId: kpiLocationId,
                  preset: kpiPreset,
                  from: kpiFrom,
                  to: kpiTo,
                  timeZone
                }),
                exact: true
              });
            }}
          >
            Rafraîchir
          </Button>
        </div>
        <div className="flex overflow-x-auto divide-x divide-slate-100">
          {kpiCards.map((kpi) => (
            <article
              key={kpi.id}
              className="min-w-[10.5rem] flex-1 bg-white px-3 py-2.5 transition duration-200 hover:bg-slate-50/80"
            >
              <p className="truncate text-3xl font-semibold tracking-tight text-slate-950">
                {formatKpiValue(kpi.value)}
              </p>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {kpi.label}
                </span>
                <span className="max-w-[7rem] shrink-0 truncate text-right text-xs font-medium text-slate-500">
                  {formatKpiValue(kpi.variation)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.045)]">
        <div className="flex items-center justify-between border-b border-slate-100/70 bg-slate-50/20 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Analyse IA</h3>
          {aiKpiError && (
            <span className="text-xs text-amber-700">{aiKpiError}</span>
          )}
        </div>
        <div className="p-4">
          <article className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-slate-50/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.34fr)] lg:items-start">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Aujourd'hui l'IA retient :
                </p>
                {aiKpiLoading ? (
                  <div className="mt-3 space-y-3">
                    <Skeleton className="h-8 w-2/3" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : aiSamples === 0 ? (
                  <div className="mt-3">
                    <CompactEmptyState
                      icon={<MessageSquare className="h-4 w-4" />}
                      title="Analyse prête à se remplir"
                      description="Les signaux IA apparaîtront dès que des avis seront qualifiés."
                      tone="info"
                    />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-slate-950">
                      {aiSummarySentence}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {aiConclusionCards.map((card) => (
                        <div
                          key={card.id}
                          className={`rounded-2xl border px-3 py-3 ${card.shellClass}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${card.iconClass}`}
                            >
                              {card.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {card.label}
                              </p>
                              <p
                                className={`mt-1 truncate text-lg font-semibold leading-tight ${card.valueClass}`}
                              >
                                {card.value}
                              </p>
                              <p className={`mt-1 text-xs leading-5 ${card.bodyClass}`}>
                                {card.body}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {aiMetricCards.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                  >
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {metric.label}
                    </p>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <span className="text-xl font-semibold tracking-tight text-slate-950">
                        {metric.value}
                      </span>
                      <span className="truncate text-right text-xs text-slate-500">
                        {metric.caption}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-3 px-4 pb-4 lg:grid-cols-3">
          <details className="group rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">
                  Sentiment et score
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Répartition complète des avis analysés.
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {formatCount(aiSamples)} avis
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition group-open:rotate-90">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </summary>
            <div className="mt-3">
              {aiKpiLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : aiSamples === 0 ? (
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Aucun sentiment qualifié"
                  description="La répartition apparaîtra dès que l'IA aura assez d'avis."
                />
              ) : (
                <div className="grid gap-2">
                  {aiSentimentBreakdown.map((sentiment) => (
                    <div
                      key={sentiment.label}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${sentiment.className}`}
                    >
                      <span>{sentiment.label}</span>
                      <span>{formatPercent(sentiment.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className="group rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">
                  Thèmes détectés
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Motifs clients à explorer.
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  Top {aiTopTags.length || 0}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition group-open:rotate-90">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </summary>
            <div className="mt-3">
              {aiKpiLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : aiTopTags.length ? (
                <div className="grid gap-2">
                  {aiTopTags.map((tag) => (
                    <div
                      key={tag.tag}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate font-semibold text-slate-700">
                        {tag.tag}
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {tag.count} mention{tag.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Aucun thème dominant"
                  description="Les motifs récurrents seront regroupés ici dès qu'ils ressortent."
                />
              )}
            </div>
          </details>

          <details className="group rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">
                  Évolution récente
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Tendance et jours actifs.
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {activeAiTrend.length}/{aiTrend.length || 30}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition group-open:rotate-90">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </summary>
            <div className="mt-3">
              {aiKpiLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : aiTrend.length === 0 ? (
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Pas encore de tendance"
                  description="La courbe se construira dès que des avis analysés existent sur la période."
                  tone="info"
                />
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Dernier score
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">
                        {formatScore(latestAiTrendPoint?.avgScore ?? null)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {latestAiTrendPoint?.date ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Avis analysés
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">
                        {formatCount(latestAiTrendPoint?.samples)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                      <p className="text-xs font-semibold text-rose-600">
                        Critiques
                      </p>
                      <p className="mt-1 text-lg font-semibold text-rose-700">
                        {formatCount(latestAiTrendPoint?.criticalCount)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <DashboardSparkline
                      values={aiTrend.map((point) => point.avgScore)}
                      tone="positive"
                    />
                  </div>
                  <div className="mt-3 max-h-28 space-y-1.5 overflow-auto pr-2 text-xs">
                    {activeAiTrend.length === 0 ? (
                      <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-500">
                        Aucun jour actif à détailler pour l'instant.
                      </p>
                    ) : (
                      activeAiTrend.map((point) => (
                        <div
                          key={point.date}
                          className="flex items-center justify-between gap-3 border-t border-slate-200/70 pt-1.5 first:border-t-0 first:pt-0"
                        >
                          <span className="text-slate-600">{point.date}</span>
                          <span className="text-right text-slate-500">
                            Score {formatScore(point.avgScore)} · {point.samples} avis ·{" "}
                            {point.criticalCount} critiques
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      </section>

      <section
        id="locations-section"
        className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.045)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/70 bg-slate-50/20 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Lieux connectés
            </h2>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              {locations.length} fiche{locations.length > 1 ? "s" : ""}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              {activeLocationsCount} active
              {activeLocationsCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {googleStatus === "connected" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs font-semibold"
                onClick={onSyncLocations}
                disabled={syncing || syncDisabled}
              >
                {syncing ? "Synchronisation..." : "Synchroniser"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs font-semibold"
              onClick={saveActiveLocations}
              disabled={
                activeLocationsSaving ||
                (locationsLoading && locations.length === 0)
              }
            >
              {activeLocationsSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
        {locationsError && (
          <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {locationsError}
          </div>
        )}
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {locationsLoading && locations.length === 0 &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card
                key={`skeleton-${index}`}
                className="border-slate-200/70 bg-white/75 shadow-none"
              >
                <CardContent className="space-y-2 p-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          {!locationsLoading && locations.length === 0 && (
            <Card className="border-slate-200/70 bg-white/75 shadow-none md:col-span-2">
              <CardContent className="p-3">
                <CompactEmptyState
                  icon={<Globe2 className="h-4 w-4" />}
                  title="Aucune fiche connectée"
                  description="Synchronisez Google pour afficher vos fiches et gérer leur statut ici."
                  tone="info"
                />
              </CardContent>
            </Card>
          )}
          {locations.map((location) => {
              const isActive = selectedActiveIds.includes(location.id);
              const displayUrl = formatDisplayUrl(location.website_uri);
              return (
                <Card
                  key={location.id}
                  className="border-slate-200/70 bg-white/85 shadow-none"
                >
                  <CardContent className="grid gap-2.5 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold text-slate-900"
                        title={
                          location.location_title ??
                          location.location_resource_name
                        }
                      >
                        {location.location_title ??
                          location.location_resource_name}
                      </p>
                      <div className="mt-1 grid min-w-0 gap-1 text-xs text-slate-500">
                        {location.website_uri && (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Globe2 className="h-3.5 w-3.5 shrink-0" />
                            <span
                              className="truncate font-medium text-slate-600"
                              title={location.website_uri}
                            >
                              {displayUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <label
                      className={
                        isActive
                          ? "inline-flex w-fit justify-self-start items-center justify-end gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 sm:justify-self-end"
                          : "inline-flex w-fit justify-self-start items-center justify-end gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 sm:justify-self-end"
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-slate-950"
                        checked={isActive}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedActiveIds((prev) =>
                            checked
                              ? [...prev, location.id]
                              : prev.filter((id) => id !== location.id)
                          );
                        }}
                      />
                      {isActive ? "Actif" : "Inactif"}
                    </label>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      <section>
        <Card className="overflow-hidden border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.045)]">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <CardTitle className="text-base">À traiter maintenant</CardTitle>
                <p className="text-xs text-slate-500">
                  File courte des points qui méritent une réponse.
                </p>
              </div>
              {urgentActionsCount === 0 ? (
                <CompactEmptyState
                  icon={<CheckCircle className="h-4 w-4" />}
                  title="Tout est sous contrôle"
                  description="Aucun avis urgent ni alerte client ne demande d’action."
                  tone="success"
                />
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900">
                    {urgentActionsCount} action
                    {urgentActionsCount > 1 ? "s" : ""} urgente
                    {urgentActionsCount > 1 ? "s" : ""}.
                  </p>
                  <p className="text-xs text-slate-500">
                    Priorité aux avis négatifs sans réponse.
                  </p>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs font-semibold"
                onClick={handleOpenInbox}
              >
                Aller à la boîte de réception
              </Button>
            </div>

            <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div>
                <CardTitle className="text-base">Activité récente</CardTitle>
                <p className="text-xs text-slate-500">
                  Derniers signaux utiles, limités aux 5 plus récents.
                </p>
              </div>
              <div className="mt-3">
                {recentActivities.length === 0 ? (
                  <CompactEmptyState
                    icon={<Bell className="h-4 w-4" />}
                    title="Aucune activité récente"
                    description="Rien de nouveau à signaler depuis la dernière synchronisation."
                  />
                ) : (
                  <ol className="relative space-y-0">
                    {recentActivities.map((notif, index) => (
                      <li
                        key={notif.id}
                        className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0"
                      >
                        {index < recentActivities.length - 1 && (
                          <span className="absolute left-4 top-8 h-[calc(100%-1.5rem)] w-px bg-slate-200/80" />
                        )}
                        <span
                          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border ${getNotificationTimelineTone(
                            notif.kind,
                            notif.severity
                          )}`}
                        >
                          {getNotificationIcon(notif.kind, notif.severity)}
                        </span>
                        <article className="min-w-0 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                              {notif.title || "Événement"}
                            </p>
                            <time
                              dateTime={notif.createdAt}
                              className="shrink-0 text-xs font-medium text-slate-400"
                            >
                              {formatRelativeTime(notif.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {notif.message || "—"}
                          </p>
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export { Dashboard };
