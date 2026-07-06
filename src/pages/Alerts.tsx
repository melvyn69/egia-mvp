import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
  Settings,
  ShieldCheck,
  SignalHigh,
  Sparkles,
  Star
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
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

const secondaryTextByType: Record<string, string> = {
  LOW_RATING:
    "Note faible détectée automatiquement par votre scénario d'automatisation.",
  NO_REPLY: "Aucun retour n'a encore été publié pour cet avis.",
  NEGATIVE_SENTIMENT:
    "Le ton de cet avis a été identifié comme négatif par l'analyse automatique."
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

const buildReason = (alert: AlertRow, rating: number | null) => {
  const typeReason = secondaryTextByType[alert.alert_type ?? ""];
  if (typeReason) return typeReason;
  if (rating !== null && rating <= 2) {
    return "Avis sensible détecté à partir d'une note faible.";
  }
  if (alert.workflow_name) {
    return `Signal généré par l'automatisation ${alert.workflow_name}.`;
  }
  return "Signal priorisé à partir de la note, du délai de réponse et de l'activité récente.";
};

const filterLabels: Record<AlertFilter, string> = {
  all: "Toutes",
  urgent: "Urgentes",
  sensitive: "Avis sensibles",
  automation: "Automatisations",
  resolved: "Traitées"
};

const AlertKpiCard = ({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: "dark" | "rose" | "amber" | "slate";
}) => {
  const toneClass = {
    dark: "bg-slate-950 text-white",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-50 text-slate-700"
  }[tone];

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
            Actif
          </span>
        </div>
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
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${severityAccentMap[alert.severity]}`} />
          <Badge className="border-slate-200 bg-white text-slate-700">
            {alert.typeLabel}
          </Badge>
          <Badge className={severityClassMap[alert.severity]}>
            Priorité {severityLabelMap[alert.severity].toLowerCase()}
          </Badge>
          {alert.isResolved && (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Traité
            </Badge>
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            {alert.label}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{alert.author ?? "Client non identifié"}</span>
            {alert.locationName && <span>{alert.locationName}</span>}
            {alert.rating !== null && (
              <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {alert.rating.toFixed(1)}
              </span>
            )}
            <span>{getAlertAgeLabel(alert)}</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1.3fr]">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Raison
            </p>
            <p className="mt-2 text-sm text-slate-700">{alert.reason}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Signal
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-slate-700">
              {alert.excerpt}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row lg:w-44 lg:flex-col">
        <Button
          size="sm"
          onClick={() => window.location.assign(getReviewUrl(alert))}
          className="w-full"
        >
          Répondre maintenant
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.assign(getReviewUrl(alert))}
          className="w-full"
        >
          <Eye className="h-4 w-4" />
          Voir le signal
        </Button>
        {!alert.isResolved && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResolve(alert)}
            className="w-full"
          >
            <CheckCircle2 className="h-4 w-4" />
            Marquer traité
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
  <div className="flex gap-2 overflow-x-auto pb-1">
    {(Object.keys(filterLabels) as AlertFilter[]).map((filter) => (
      <button
        key={filter}
        type="button"
        onClick={() => onChange(filter)}
        className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition ${
          activeFilter === filter
            ? "border-slate-950 bg-slate-950 text-white"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
        }`}
      >
        {filterLabels[filter]} <span className="opacity-70">{counts[filter]}</span>
      </button>
    ))}
  </div>
);

const AlertListItem = ({
  alert,
  onResolve
}: {
  alert: FormattedAlert;
  onResolve: (alert: FormattedAlert) => void;
}) => (
  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${severityAccentMap[alert.severity]}`} />
        <p className="font-medium text-slate-950">{alert.label}</p>
        <Badge className={severityClassMap[alert.severity]}>
          {severityLabelMap[alert.severity]}
        </Badge>
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
          {alert.typeLabel}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{alert.author ?? "Client non identifié"}</span>
        {alert.locationName && <span>{alert.locationName}</span>}
        {alert.rating !== null && <span>{alert.rating.toFixed(1)}★</span>}
        <span title={alert.dateLabel}>{alert.relativeDate}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600">
        {alert.excerpt}
      </p>
    </div>
    <div className="flex flex-wrap gap-2 md:justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.location.assign(getReviewUrl(alert))}
      >
        Voir le signal
      </Button>
      {!alert.isResolved && (
        <Button variant="ghost" size="sm" onClick={() => onResolve(alert)}>
          Marquer traité
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
          : "Extrait non disponible, signal généré à partir de la note et du délai de réponse.";
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
        reason: buildReason(alert, rating),
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
      .slice(0, 5);
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              CENTRE D'ALERTES
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Alertes intelligentes
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Priorisez les avis sensibles, déclenchez les bonnes réponses et
              gardez la surveillance EGIA active sur les signaux qui demandent
              une action.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={alertsQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${alertsQuery.isFetching ? "animate-spin" : ""}`}
              />
              {alertsQuery.isFetching ? "Actualisation..." : "Actualiser"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => window.location.assign("/settings?tab=alerts")}
            >
              <Settings className="h-4 w-4" />
              Paramètres
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-medium">Surveillance active</span>
          <span className="text-emerald-700">
            Les scénarios suivent les notes, les délais de réponse et les
            signaux automatiques.
          </span>
          {lastCheckedLabel && (
            <span className="text-emerald-700">
              Dernière vérification: {lastCheckedLabel}
            </span>
          )}
        </div>
      </div>

      {alertsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AlertKpiCard
            label="À traiter"
            value={openAlerts.length}
            helper="Alertes ouvertes"
            tone="dark"
          />
          <AlertKpiCard
            label="Haute priorité"
            value={openAlerts.filter((alert) => alert.severity === "high").length}
            helper="Action rapide conseillée"
            tone="rose"
          />
          <AlertKpiCard
            label="Avis sensibles"
            value={openAlerts.filter((alert) => alert.isSensitiveReview).length}
            helper="Notes faibles ou ton négatif"
            tone="amber"
          />
          <AlertKpiCard
            label="Plus ancienne"
            value={oldestOpenAlert ? getAlertAgeLabel(oldestOpenAlert) : "Aucune"}
            helper="Âge de l'alerte ouverte"
            tone="slate"
          />
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SignalHigh className="h-5 w-5 text-slate-900" />
                Priorité du jour
              </CardTitle>
              <CardDescription>
                Les alertes les plus importantes, classées par priorité, avis
                sensible et ancienneté.
              </CardDescription>
            </div>
            <Badge className="w-fit border-slate-200 bg-slate-50 text-slate-600">
              {priorityAlerts.length}{" "}
              {priorityAlerts.length > 1 ? "signaux" : "signal"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          ) : priorityAlerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-950">
                Aucun signal prioritaire
              </p>
              <p className="mt-2 text-sm text-slate-500">
                La surveillance reste active et remontera uniquement les avis ou
                automatisations qui demandent une intervention.
              </p>
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

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-slate-900" />
                Toutes les alertes
              </CardTitle>
              <CardDescription>
                Vue compacte pour suivre les signaux ouverts, automatisés et
                traités.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-4 w-4" />
              {lastCheckedLabel
                ? `Vérifié à ${lastCheckedLabel}`
                : "En attente de vérification"}
            </div>
          </div>
          <AlertFilters
            activeFilter={activeFilter}
            counts={filterCounts}
            onChange={setActiveFilter}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {alertsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : formattedAlerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
              <BellRing className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-4 text-sm font-semibold text-slate-950">
                Tout est sous contrôle
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Aucune alerte ne demande d'action pour le moment. EGIA continue
                de surveiller les notes faibles, les avis sans réponse et les
                automatisations sensibles.
              </p>
              <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={alertsQuery.isFetching}
                >
                  <RefreshCw className="h-4 w-4" />
                  {alertsQuery.isFetching ? "Actualisation..." : "Actualiser"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.assign("/settings?tab=alerts")}
                >
                  Paramètres
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
              <p className="text-sm font-semibold text-slate-950">
                Aucun résultat pour ce filtre
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Changez de vue pour retrouver les autres alertes.
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <AlertListItem
                key={alert.id}
                alert={alert}
                onResolve={handleResolve}
              />
            ))
          )}
          {resolveError && (
            <p className="text-xs text-rose-600">{resolveError}</p>
          )}
          {resolveSuccess && (
            <p className="text-xs text-emerald-600">{resolveSuccess}</p>
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
