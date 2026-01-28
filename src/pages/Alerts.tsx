import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
};

const ruleLabelMap: Record<string, string> = {
  NEGATIVE_NO_REPLY: "Avis negatif sans reponse",
  RATING_DROP: "Baisse de satisfaction recente",
  NEGATIVE_SPIKE: "Pic d'avis negatifs",
  LONG_NEGATIVE: "Avis detaille et sensible",
  AUTO_RATING_DROP: "Concurrence en hausse de note",
  AUTO_NEGATIVE_REVIEW: "Avis negatif detecte",
  AUTO_VOLUME_DROP: "Volume d'avis en baisse",
  AUTO_WEEKLY_SUMMARY: "Resume hebdomadaire"
};

const severityLabelMap: Record<AlertRow["severity"], string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Haute"
};

const severityVariantMap: Record<AlertRow["severity"], "neutral" | "warning"> = {
  low: "neutral",
  medium: "warning",
  high: "warning"
};

const buildSummary = (payload: Record<string, unknown> | null | undefined) => {
  if (!payload) return "Une alerte prioritaire a ete detectee.";
  if (typeof payload.message === "string") return payload.message;
  const parts: string[] = [];
  if (typeof payload.rating === "number") {
    parts.push(`${payload.rating}★`);
  }
  if (typeof payload.hours_since === "number") {
    parts.push(`${payload.hours_since}h sans reponse`);
  }
  if (typeof payload.drop === "number") {
    parts.push(`baisse ${payload.drop}`);
  }
  if (typeof payload.negative_count_48h === "number") {
    parts.push(`${payload.negative_count_48h} avis negatifs (48h)`);
  }
  if (typeof payload.snippet === "string") {
    parts.push(`"${payload.snippet}"`);
  }
  return parts.length > 0
    ? parts.join(" · ")
    : "Une alerte prioritaire a ete detectee.";
};

const formatRelativeDate = (iso: string | null | undefined) => {
  if (!iso) return "Date inconnue";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Date inconnue";
  const diffMs = Date.now() - ts;
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "A l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `Il y a ${diffDays} j`;
};

const Alerts = ({ session }: AlertsProps) => {
  const queryClient = useQueryClient();
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null);
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
    enabled: Boolean(accessToken)
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
        throw new Error(text || "Impossible de resoudre l'alerte.");
      }
      setResolveSuccess("Alerte marquée comme traitée.");
      await alertsQuery.refetch();
    } catch (error) {
      queryClient.setQueryData(["alerts", session?.user?.id], previous);
      setResolveError(
        error instanceof Error
          ? error.message
          : "Impossible de resoudre l'alerte."
      );
    }
  };

  const alerts = alertsQuery.data ?? [];
  const formattedAlerts = useMemo(
    () =>
      alerts.map((alert) => ({
        ...alert,
        label: ruleLabelMap[alert.rule_code] ?? alert.rule_code,
        summary: buildSummary(alert.payload ?? null),
        relativeDate: formatRelativeDate(alert.triggered_at),
        dateLabel: alert.triggered_at
          ? new Date(alert.triggered_at).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "short",
              day: "numeric"
            })
          : "Date inconnue"
      })),
    [alerts]
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Centre d'alertes
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Alertes intelligentes
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Suivez les signaux prioritaires sans bruit inutile.
        </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={alertsQuery.isFetching}
        >
          {alertsQuery.isFetching ? "Actualisation..." : "Actualiser"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alertes a traiter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : formattedAlerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900">
                Tout est sous controle
              </p>
              <p className="mt-2 text-sm text-slate-500">
                EGIA ne remonte une alerte que lorsqu'une action est vraiment
                necessaire.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={alertsQuery.isFetching}
                >
                  {alertsQuery.isFetching ? "Actualisation..." : "Actualiser"}
                </Button>
                {lastCheckedLabel && (
                  <p className="text-xs text-slate-400">
                    Derniere verification: {lastCheckedLabel}
                  </p>
                )}
              </div>
            </div>
          ) : (
            formattedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {alert.label}
                    </p>
                    <Badge variant={severityVariantMap[alert.severity]}>
                      {severityLabelMap[alert.severity]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600">{alert.summary}</p>
                  <p className="text-xs text-slate-400" title={alert.dateLabel}>
                    {alert.relativeDate}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResolve(alert)}
                >
                  Marquer comme traite
                </Button>
              </div>
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
// 1) Ouvrir /alerts -> les alertes API s'affichent.
// 2) Marquer comme traite -> disparait et reste apres refresh.
// 3) Actualiser -> refetch sans erreur.
