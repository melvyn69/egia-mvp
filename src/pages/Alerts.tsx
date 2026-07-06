import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Settings } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type AlertsProps = {
  session: Session | null;
};

type AlertRow = {
  id: string;
  rule_code: string;
  severity: "low" | "medium" | "high";
  review_id: string;
  triggered_at: string;
  payload?: Record<string, unknown> | null;
  alert_type?: string | null;
  rule_label?: string | null;
  resolved_at?: string | null;
  workflow_name?: string | null;
};

type FormattedAlert = AlertRow & {
  label: string;
  typeLabel: string;
  reason: string;
  author: string | null;
  locationName: string | null;
  rating: number | null;
  excerpt: string;
  dateSource: string;
  relativeDate: string;
  dateLabel: string;
  isResolved: boolean;
  isSensitiveReview: boolean;
  isAutomation: boolean;
};

type AlertFilter = "all" | "urgent" | "sensitive" | "automation" | "resolved";

const ruleLabelMap: Record<string, string> = {
  NEGATIVE_NO_REPLY: "Avis négatif sans réponse",
  RATING_DROP: "Baisse de satisfaction récente",
  NEGATIVE_SPIKE: "Pic d'avis négatifs",
  LONG_NEGATIVE: "Avis détaillé et sensible",
  AUTO_RATING_DROP: "Concurrence en hausse de note",
  AUTO_NEGATIVE_REVIEW: "Avis négatif détecté",
  AUTO_VOLUME_DROP: "Volume d'avis en baisse",
  AUTO_WEEKLY_SUMMARY: "Résumé hebdomadaire"
};

const alertTitleByType: Record<string, string> = {
  LOW_RATING: "Nouvel avis avec note faible",
  NO_REPLY: "Avis client sans réponse",
  NEGATIVE_SENTIMENT: "Avis au ton négatif détecté"
};

const alertBadgeByType: Record<string, string> = {
  LOW_RATING: "Note faible",
  NO_REPLY: "Réponse attendue",
  NEGATIVE_SENTIMENT: "Ton sensible"
};

const severityLabelMap: Record<AlertRow["severity"], string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Haute"
};

const severityClassMap: Record<AlertRow["severity"], string> = {
  low: "border-slate-200 bg-slate-50 text-slate-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

const severityAccentMap: Record<AlertRow["severity"], string> = {
  low: "bg-slate-300",
  medium: "bg-amber-400",
  high: "bg-rose-500"
};

const getPayloadString = (
  payload: Record<string, unknown> | null | undefined,
  key: string
) => (typeof payload?.[key] === "string" ? payload[key] : null);

const getPayloadNumber = (
  payload: Record<string, unknown> | null | undefined,
  key: string
) => {
  const value = payload?.[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getTimestamp = (iso: string | null | undefined) => {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

const formatRelativeDate = (iso: string | null | undefined) => {
  const ts = getTimestamp(iso);
  if (!ts) return "Date inconnue";
  const diffMs = Math.max(0, Date.now() - ts);
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "A l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `Il y a ${diffDays} j`;
};

const normalizeAlertTitle = (alert: AlertRow) => {
  const rawTitle =
    alertTitleByType[alert.alert_type ?? ""] ??
    alert.rule_label ??
    ruleLabelMap[alert.rule_code] ??
    alert.rule_code;

  if (!rawTitle || /^AUTO[_\s-]/i.test(rawTitle)) {
    if (alert.alert_type === "LOW_RATING" || alert.rule_code.includes("NEGATIVE")) {
      return "Nouvel avis détecté";
    }
    return "Alerte automatique";
  }

  return rawTitle.replace(/^AUTO[_\s-]+/i, "").replaceAll("_", " ");
};

const getAlertTypeLabel = (alert: AlertRow) => {
  if (alertBadgeByType[alert.alert_type ?? ""]) {
    return alertBadgeByType[alert.alert_type ?? ""];
  }
  if (alert.workflow_name || alert.rule_code.startsWith("AUTO_")) {
    return "Automatisation";
  }
  if (alert.rule_code.includes("NEGATIVE")) return "Avis sensible";
  if (alert.rule_code.includes("RATING")) return "Satisfaction";
  return "Signal client";
};

const getPriorityRank = (alert: Pick<AlertRow, "severity">) => {
  const ranks: Record<AlertRow["severity"], number> = {
    high: 3,
    medium: 2,
    low: 1
  };
  return ranks[alert.severity];
};

const getAlertAgeLabel = (alert: Pick<FormattedAlert, "dateSource">) =>
  formatRelativeDate(alert.dateSource);

const getReviewUrl = (alert: AlertRow) =>
  alert.review_id
    ? `/inbox?review_id=${encodeURIComponent(alert.review_id)}`
    : "/inbox";

const canReplyToAlert = (alert: AlertRow) => Boolean(alert.review_id);

const getShortAlertReason = (alert: AlertRow, rating: number | null) => {
  if (alert.alert_type === "NO_REPLY") return "Avis sans réponse.";
  if (alert.alert_type === "LOW_RATING" || (rating !== null && rating <= 2)) {
    return "Avis sensible à traiter.";
  }
  if (alert.alert_type === "NEGATIVE_SENTIMENT") return "Ton négatif détecté.";
  if (alert.rule_code === "NEGATIVE_NO_REPLY") return "Avis sensible sans réponse.";
  if (alert.rule_code === "RATING_DROP" || alert.rule_code === "AUTO_RATING_DROP") {
    return "Baisse réputation.";
  }
  if (alert.workflow_name || alert.rule_code.startsWith("AUTO_")) {
    return "Automatisation à vérifier.";
  }
  return "Signal client à vérifier.";
};

const filterLabels: Record<AlertFilter, string> = {
  all: "Toutes",
  urgent: "Urgentes",
  sensitive: "Avis sensibles",
  automation: "Automatiques",
  resolved: "Traitées"
};

const INITIAL_VISIBLE_ALERTS = 20;

const AlertKpiCard = ({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone: "dark" | "rose" | "amber" | "slate";
}) => {
  const accentClass = {
    dark: "bg-slate-950",
    rose: "bg-rose-500",
    amber: "bg-amber-400",
    slate: "bg-slate-300"
  }[tone];

  return (
    <Card className="min-w-0 max-w-full rounded-xl shadow-none sm:rounded-2xl">
      <CardContent className="flex min-w-0 items-center justify-between gap-2 p-2.5 sm:gap-3 sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium leading-tight text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="mt-0.5 break-words text-lg font-semibold leading-tight text-slate-950 sm:mt-1 sm:text-2xl">
            {value}
          </p>
        </div>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${accentClass}`} />
      </CardContent>
    </Card>
  );
};

const PriorityAlertCard = ({
  alert,
  onResolve
}: {
  alert: FormattedAlert;
  onResolve: (alert: FormattedAlert) => void;
}) => (
  <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
          <Badge className={`${severityClassMap[alert.severity]} px-2 py-0.5 text-[11px]`}>
            {severityLabelMap[alert.severity]}
          </Badge>
          <span className="min-w-0 max-w-full truncate font-semibold text-slate-950">
            {alert.author ?? "Client non identifié"}
          </span>
          {alert.rating !== null && (
            <span className="font-medium text-slate-700">
              {alert.rating.toFixed(0)}★
            </span>
          )}
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{alert.relativeDate}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">{alert.typeLabel}</span>
        </div>
        <p className="mt-0.5 min-w-0 truncate text-xs text-slate-600 sm:mt-1 sm:text-sm">
          {alert.reason}
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:gap-2 md:shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.assign(getReviewUrl(alert))}
          className="h-7 min-w-0 flex-1 px-2 text-[11px] sm:h-9 sm:flex-none sm:px-3 sm:text-sm"
        >
          {canReplyToAlert(alert) ? "Répondre" : "Voir"}
        </Button>
        {!alert.isResolved && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResolve(alert)}
            className="h-7 min-w-0 flex-1 px-2 text-[11px] sm:h-9 sm:flex-none sm:px-3 sm:text-sm"
          >
            <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Traiter
          </Button>
        )}
      </div>
    </div>
  </div>
);

const AlertFilters = ({
  activeFilter,
  counts,
  onChange
}: {
  activeFilter: AlertFilter;
  counts: Record<AlertFilter, number>;
  onChange: (filter: AlertFilter) => void;
}) => (
  <div className="alerts-scroll-x max-w-full overflow-x-auto pb-1">
    <div className="flex w-max max-w-none gap-1.5">
    {(Object.keys(filterLabels) as AlertFilter[]).map((filter) => (
      <button
        key={filter}
        type="button"
        onClick={() => onChange(filter)}
        className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition sm:px-3 sm:py-1.5 sm:text-xs ${
          activeFilter === filter
            ? "border-slate-950 bg-slate-950 text-white"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-950"
        }`}
      >
        {filterLabels[filter]} <span className="opacity-70">{counts[filter]}</span>
      </button>
    ))}
    </div>
  </div>
);

const AlertListItem = ({
  alert,
  onResolve
}: {
  alert: FormattedAlert;
  onResolve: (alert: FormattedAlert) => void;
}) => (
  <div className="min-w-0 max-w-full border-t border-slate-100 px-2.5 py-2.5 first:border-t-0 sm:px-4 sm:py-3 md:grid md:grid-cols-[1.2fr_1.4fr_0.7fr_0.45fr_0.6fr_0.8fr] md:items-center md:gap-4 md:px-5">
    <div className="flex min-w-0 items-center justify-between gap-3 md:block">
      <p className="min-w-0 truncate text-xs font-medium text-slate-950 sm:text-sm">
        {alert.author ?? "Client non identifié"}
      </p>
      <Badge className={`shrink-0 px-2 py-0.5 text-[11px] md:hidden ${severityClassMap[alert.severity]}`}>
        {severityLabelMap[alert.severity]}
      </Badge>
    </div>
    <div className="mt-1 flex min-w-0 items-center gap-2 md:mt-0">
      <span className={`h-2 w-2 shrink-0 rounded-full ${severityAccentMap[alert.severity]}`} />
      <p className="truncate text-xs text-slate-600 sm:text-sm">{alert.typeLabel}</p>
    </div>
    <div className="hidden md:block">
      <Badge className={`${severityClassMap[alert.severity]} px-2 py-0.5 text-[11px]`}>
        {severityLabelMap[alert.severity]}
      </Badge>
    </div>
    <p className="hidden text-sm text-slate-600 md:block">
      {alert.rating !== null ? `${alert.rating.toFixed(0)}★` : "-"}
    </p>
    <p className="hidden text-sm text-slate-500 md:block" title={alert.dateLabel}>
      {alert.relativeDate}
    </p>
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 md:mt-0 md:justify-end">
      <p className="min-w-0 flex-1 text-xs text-slate-500 md:hidden">
        {alert.rating !== null ? `${alert.rating.toFixed(0)}★ · ` : ""}
        {alert.relativeDate}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.location.assign(getReviewUrl(alert))}
        className="h-7 min-w-0 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs"
      >
        {canReplyToAlert(alert) ? "Répondre" : "Voir"}
      </Button>
      {!alert.isResolved && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onResolve(alert)}
          className="h-7 min-w-0 px-2 text-[11px] sm:h-8 sm:px-3 sm:text-xs"
        >
          Traiter
        </Button>
      )}
    </div>
  </div>
);

const Alerts = ({ session }: AlertsProps) => {
  const queryClient = useQueryClient();
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AlertFilter>("all");
  const [visibleAlertCount, setVisibleAlertCount] = useState(
    INITIAL_VISIBLE_ALERTS
  );
  const accessToken = session?.access_token ?? null;

  const alertsQuery = useQuery({
    queryKey: ["alerts", session?.user?.id],
    queryFn: async () => {
      if (!accessToken) {
        return [] as AlertRow[];
      }
      const response = await fetch("/api/reviews?action=alerts_list", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load alerts");
      }
      const payload = (await response.json()) as { alerts?: AlertRow[] };
      return payload.alerts ?? [];
    },
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  const handleResolve = async (alert: AlertRow) => {
    if (!accessToken) return;
    setResolveError(null);
    setResolveSuccess(null);
    const previous = alertsQuery.data ?? [];
    queryClient.setQueryData(
      ["alerts", session?.user?.id],
      previous.filter((item) => item.id !== alert.id)
    );
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "alerts_resolve", alert_id: alert.id })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible de résoudre l'alerte.");
      }
      setResolveSuccess("Alerte marquée comme traitée.");
      await alertsQuery.refetch();
    } catch (error) {
      queryClient.setQueryData(["alerts", session?.user?.id], previous);
      setResolveError(
        error instanceof Error
          ? error.message
          : "Impossible de résoudre l'alerte."
      );
    }
  };

  const formattedAlerts = useMemo(() => {
    const alerts = alertsQuery.data ?? [];
    const sorted = alerts.slice().sort((a, b) => {
      const aResolved = Boolean(a.resolved_at);
      const bResolved = Boolean(b.resolved_at);
      if (aResolved !== bResolved) {
        return aResolved ? 1 : -1;
      }
      const severityDiff = getPriorityRank(b) - getPriorityRank(a);
      if (severityDiff !== 0) return severityDiff;
      return getTimestamp(a.triggered_at) - getTimestamp(b.triggered_at);
    });

    return sorted.map((alert): FormattedAlert => {
      const payload = alert.payload ?? null;
      const author = getPayloadString(payload, "author");
      const locationName = getPayloadString(payload, "location_name");
      const rating = getPayloadNumber(payload, "rating");
      const text =
        getPayloadString(payload, "text") ?? getPayloadString(payload, "message");
      const createTime =
        getPayloadString(payload, "create_time") ??
        getPayloadString(payload, "update_time");
      const excerpt =
        text && text.trim().length > 0
          ? text.trim().slice(0, 180)
          : getAlertTypeLabel(alert);
      const dateSource = createTime ?? alert.triggered_at;
      const isAutomation =
        Boolean(alert.workflow_name) || alert.rule_code.startsWith("AUTO_");
      const isSensitiveReview =
        (rating !== null && rating <= 2) ||
        alert.rule_code.includes("NEGATIVE") ||
        alert.alert_type === "NEGATIVE_SENTIMENT";

      return {
        ...alert,
        label: normalizeAlertTitle(alert),
        typeLabel: getAlertTypeLabel(alert),
        reason: getShortAlertReason(alert, rating),
        author,
        locationName,
        rating,
        excerpt,
        dateSource,
        relativeDate: formatRelativeDate(dateSource),
        dateLabel: dateSource
          ? new Date(dateSource).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "short",
              day: "numeric"
            })
          : "Date inconnue",
        isResolved: Boolean(alert.resolved_at),
        isSensitiveReview,
        isAutomation
      };
    });
  }, [alertsQuery.data]);

  const openAlerts = useMemo(
    () => formattedAlerts.filter((alert) => !alert.isResolved),
    [formattedAlerts]
  );

  const priorityAlerts = useMemo(() => {
    return openAlerts
      .slice()
      .sort((a, b) => {
        const priorityDiff = getPriorityRank(b) - getPriorityRank(a);
        if (priorityDiff !== 0) return priorityDiff;
        const sensitiveDiff = Number(b.isSensitiveReview) - Number(a.isSensitiveReview);
        if (sensitiveDiff !== 0) return sensitiveDiff;
        return getTimestamp(a.dateSource) - getTimestamp(b.dateSource);
      })
      .slice(0, 3);
  }, [openAlerts]);

  const filterCounts = useMemo<Record<AlertFilter, number>>(
    () => ({
      all: formattedAlerts.length,
      urgent: formattedAlerts.filter(
        (alert) => !alert.isResolved && alert.severity === "high"
      ).length,
      sensitive: formattedAlerts.filter((alert) => alert.isSensitiveReview).length,
      automation: formattedAlerts.filter((alert) => alert.isAutomation).length,
      resolved: formattedAlerts.filter((alert) => alert.isResolved).length
    }),
    [formattedAlerts]
  );

  const filteredAlerts = useMemo(() => {
    switch (activeFilter) {
      case "urgent":
        return formattedAlerts.filter(
          (alert) => !alert.isResolved && alert.severity === "high"
        );
      case "sensitive":
        return formattedAlerts.filter((alert) => alert.isSensitiveReview);
      case "automation":
        return formattedAlerts.filter((alert) => alert.isAutomation);
      case "resolved":
        return formattedAlerts.filter((alert) => alert.isResolved);
      case "all":
      default:
        return formattedAlerts;
    }
  }, [activeFilter, formattedAlerts]);

  const visibleAlerts = filteredAlerts.slice(0, visibleAlertCount);
  const hasMoreAlerts = filteredAlerts.length > visibleAlerts.length;

  const oldestOpenAlert = openAlerts
    .slice()
    .sort((a, b) => getTimestamp(a.dateSource) - getTimestamp(b.dateSource))[0];

  const lastCheckedLabel =
    alertsQuery.dataUpdatedAt && alertsQuery.dataUpdatedAt > 0
      ? new Date(alertsQuery.dataUpdatedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : null;

  const handleRefresh = async () => {
    await alertsQuery.refetch();
  };

  const handleFilterChange = (filter: AlertFilter) => {
    setActiveFilter(filter);
    setVisibleAlertCount(INITIAL_VISIBLE_ALERTS);
  };

  const urgentOpenCount = openAlerts.filter(
    (alert) => alert.severity === "high"
  ).length;
  const sensitiveOpenCount = openAlerts.filter(
    (alert) => alert.isSensitiveReview
  ).length;

  return (
    <div className="alerts-page min-w-0 max-w-full space-y-4 overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-6 lg:pb-4">
      <div className="mb-3 rounded-xl bg-red-500 p-3 text-sm font-bold text-white">
        DEBUG ALERTS RESPONSIVE ACTIVE
      </div>
      <style>{`
        .alerts-page,
        .alerts-page * {
          box-sizing: border-box;
        }
        .alerts-page > * {
          max-width: 100%;
          min-width: 0;
        }
        .alerts-page button {
          min-width: 0;
        }
      `}</style>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
              CENTRE D'ALERTES
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Alertes intelligentes
            </h1>
            <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">
              {openAlerts.length} ouvertes · {urgentOpenCount} urgentes ·
              Surveillance active
            </p>
          </div>
          <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden lg:w-auto lg:max-w-sm lg:space-y-0">
            <span
              className="block w-full min-w-0 max-w-full truncate rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-center text-[11px] font-medium text-emerald-700 sm:px-3 sm:py-1.5 sm:text-xs lg:mb-2"
              title={`Surveillance active${lastCheckedLabel ? ` · Vérifié à ${lastCheckedLabel}` : ""}`}
            >
              Surveillance active
              {lastCheckedLabel ? ` · Vérifié à ${lastCheckedLabel}` : ""}
            </span>
            <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={alertsQuery.isFetching}
                className="h-7 w-full min-w-0 max-w-full px-2 text-[11px] sm:h-8 sm:text-xs"
              >
                <RefreshCw
                  className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${alertsQuery.isFetching ? "animate-spin" : ""}`}
                />
                <span className="min-w-0 truncate">Actualiser</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => window.location.assign("/settings?tab=alerts")}
                className="h-7 w-full min-w-0 max-w-full px-2 text-[11px] sm:h-8 sm:text-xs"
              >
                <Settings className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span className="min-w-0 truncate">Réglages</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {alertsQuery.isLoading ? (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <Skeleton className="h-14 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <AlertKpiCard
            label="À traiter"
            value={openAlerts.length}
            tone="dark"
          />
          <AlertKpiCard
            label="Urgentes"
            value={urgentOpenCount}
            tone="rose"
          />
          <AlertKpiCard
            label="Avis sensibles"
            value={sensitiveOpenCount}
            tone="amber"
          />
          <AlertKpiCard
            label="Plus ancienne"
            value={oldestOpenAlert ? getAlertAgeLabel(oldestOpenAlert) : "Aucune"}
            tone="slate"
          />
        </div>
      )}

      <Card className="min-w-0 max-w-full overflow-hidden rounded-xl shadow-sm sm:rounded-2xl">
        <CardHeader className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base">À traiter en priorité</CardTitle>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-1 sm:text-xs">
                3 signaux maximum, classés par urgence.
              </p>
            </div>
            <Badge className="w-fit shrink-0 border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 sm:px-3 sm:py-1 sm:text-xs">
              {priorityAlerts.length}{" "}
              {priorityAlerts.length > 1 ? "signaux" : "signal"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 px-3 pb-3 sm:space-y-2 sm:px-5 sm:pb-5">
          {alertsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-xl sm:h-20 sm:rounded-2xl" />
            </div>
          ) : priorityAlerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center sm:rounded-2xl sm:px-4 sm:py-5">
              <p className="text-sm font-semibold text-slate-950">Aucun signal prioritaire</p>
              <p className="mt-1 text-xs text-slate-500">La surveillance reste active.</p>
            </div>
          ) : (
            priorityAlerts.map((alert) => (
              <PriorityAlertCard
                key={alert.id}
                alert={alert}
                onResolve={handleResolve}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full overflow-hidden rounded-xl shadow-sm sm:rounded-2xl">
        <CardHeader className="gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="shrink-0 text-sm sm:text-base">Toutes les alertes</CardTitle>
            <div className="min-w-0 max-w-full md:flex-1 md:pl-4">
              <AlertFilters
                activeFilter={activeFilter}
                counts={filterCounts}
                onChange={handleFilterChange}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 px-0 pb-0">
          {alertsQuery.isLoading ? (
            <div className="space-y-1.5 px-3 pb-3 sm:space-y-2 sm:px-5 sm:pb-5">
              <Skeleton className="h-12 w-full rounded-xl sm:h-14" />
              <Skeleton className="h-12 w-full rounded-xl sm:h-14" />
              <Skeleton className="h-12 w-full rounded-xl sm:h-14" />
            </div>
          ) : formattedAlerts.length === 0 ? (
            <div className="mx-3 mb-3 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-5 text-center sm:mx-5 sm:mb-5 sm:rounded-2xl sm:px-6 sm:py-8">
              <p className="text-sm font-semibold text-slate-950">
                Tout est sous contrôle
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500 sm:mt-2 sm:text-sm">
                Aucune alerte ne demande d'action pour le moment.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={alertsQuery.isFetching}
                  className="h-7 px-2 text-[11px] sm:h-9 sm:px-3 sm:text-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {alertsQuery.isFetching ? "Actualisation..." : "Actualiser"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.assign("/settings?tab=alerts")}
                  className="h-7 px-2 text-[11px] sm:h-9 sm:px-3 sm:text-sm"
                >
                  Paramètres
                </Button>
              </div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="mx-3 mb-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center sm:mx-5 sm:mb-5 sm:rounded-2xl sm:px-6 sm:py-6">
              <p className="text-sm font-semibold text-slate-950">
                Aucun résultat pour ce filtre
              </p>
            </div>
          ) : (
            <>
              <div className="hidden border-t border-slate-100 bg-slate-50 px-5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 md:grid md:grid-cols-[1.2fr_1.4fr_0.7fr_0.45fr_0.6fr_0.8fr] md:gap-4">
                <span>Client</span>
                <span>Signal</span>
                <span>Priorité</span>
                <span>Note</span>
                <span>Âge</span>
                <span className="text-right">Action</span>
              </div>
              <div>
                {visibleAlerts.map((alert) => (
                  <AlertListItem
                    key={alert.id}
                    alert={alert}
                    onResolve={handleResolve}
                  />
                ))}
              </div>
              {hasMoreAlerts && (
                <div className="border-t border-slate-100 px-3 py-3 text-center sm:px-5 sm:py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleAlertCount((count) => count + INITIAL_VISIBLE_ALERTS)
                    }
                  >
                    <span className="text-[11px] sm:text-sm">Afficher plus</span>
                  </Button>
                </div>
              )}
            </>
          )}
          {resolveError && (
            <p className="px-3 pb-3 text-xs text-rose-600 sm:px-5 sm:pb-4">{resolveError}</p>
          )}
          {resolveSuccess && (
            <p className="px-3 pb-3 text-xs text-emerald-600 sm:px-5 sm:pb-4">{resolveSuccess}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Alerts;

// Manual test plan:
// 1) Ouvrir /alerts -> les KPI, priorités et filtres s'affichent.
// 2) Marquer comme traité -> disparaît des alertes ouvertes et reste après refresh.
// 3) Actualiser -> refetch sans erreur.
