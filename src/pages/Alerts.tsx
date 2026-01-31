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
  alert_type?: string | null;
  rule_label?: string | null;
  resolved_at?: string | null;
  workflow_name?: string | null;
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

const alertTitleByType: Record<string, string> = {
  LOW_RATING: "Nouvel avis avec note faible",
  NO_REPLY: "Avis client sans réponse",
  NEGATIVE_SENTIMENT: "Avis au ton négatif détecté"
};

const secondaryTextByType: Record<string, string> = {
  LOW_RATING:
    "Note faible détectée automatiquement par votre scénario d’automatisation.",
  NO_REPLY: "Aucun retour n’a encore été publié pour cet avis.",
  NEGATIVE_SENTIMENT:
    "Le ton de cet avis a été identifié comme négatif par l’analyse automatique."
};

const alertBadgeByType: Record<string, string> = {
  LOW_RATING: "Note faible",
  NO_REPLY: "Sans réponse",
  NEGATIVE_SENTIMENT: "Ton négatif"
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

const getPayloadString = (
  payload: Record<string, unknown> | null | undefined,
  key: string
) => (typeof payload?.[key] === "string" ? payload[key] : null);

const getPayloadNumber = (
  payload: Record<string, unknown> | null | undefined,
  key: string
) => (typeof payload?.[key] === "number" ? payload[key] : null);

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
  const formattedAlerts = useMemo(() => {
    const sorted = alerts.slice().sort((a, b) => {
      const aResolved = Boolean(a.resolved_at);
      const bResolved = Boolean(b.resolved_at);
      if (aResolved !== bResolved) {
        return aResolved ? 1 : -1;
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      const severityDiff =
        severityRank[a.severity] - severityRank[b.severity];
      if (severityDiff !== 0) return severityDiff;
      const aTime = new Date(a.triggered_at).getTime();
      const bTime = new Date(b.triggered_at).getTime();
      return bTime - aTime;
    });

    return sorted.map((alert) => {
      const payload = alert.payload ?? null;
      const title =
        alertTitleByType[alert.alert_type ?? ""] ??
        alert.rule_label ??
        ruleLabelMap[alert.rule_code] ??
        alert.rule_code;
      const secondaryText =
        secondaryTextByType[alert.alert_type ?? ""] ??
        "Alerte détectée par votre scénario d’automatisation.";
      const author = getPayloadString(payload, "author");
      const locationName = getPayloadString(payload, "location_name");
      const rating = getPayloadNumber(payload, "rating");
      const text = getPayloadString(payload, "text") ?? getPayloadString(payload, "message");
      const createTime =
        getPayloadString(payload, "create_time") ??
        getPayloadString(payload, "update_time");
      const excerpt =
        text && text.trim().length > 0
          ? text.trim().slice(0, 160)
          : "Aucun extrait disponible.";

      return {
        ...alert,
        label: title,
        secondaryText,
        author,
        locationName,
        rating,
        excerpt,
        dateSource: createTime ?? alert.triggered_at,
        relativeDate: formatRelativeDate(createTime ?? alert.triggered_at),
        dateLabel: createTime
          ? new Date(createTime).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "short",
              day: "numeric"
            })
          : alert.triggered_at
          ? new Date(alert.triggered_at).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "short",
              day: "numeric"
            })
          : "Date inconnue"
      };
    });
  }, [alerts]);

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
                    <Badge className={severityClassMap[alert.severity]}>
                      {severityLabelMap[alert.severity]}
                    </Badge>
                    <Badge className="border border-slate-200 text-slate-600">
                      {alertBadgeByType[alert.alert_type ?? ""] ?? "Type"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600">
                    {alert.secondaryText}
                  </p>
                  {alert.workflow_name && (
                    <p className="text-xs text-slate-500">
                      🔁 Générée par : {alert.workflow_name}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    {alert.locationName && (
                      <span>{alert.locationName}</span>
                    )}
                    {alert.author && <span>• {alert.author}</span>}
                    {typeof alert.rating === "number" && (
                      <span>• {alert.rating.toFixed(1)}★</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{alert.excerpt}</p>
                  <p className="text-xs text-slate-400" title={alert.dateLabel}>
                    {alert.relativeDate}
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.location.assign(
                        `/inbox?review_id=${encodeURIComponent(alert.review_id)}`
                      )
                    }
                  >
                    Repondre maintenant
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResolve(alert)}
                  >
                    Marquer comme traite
                  </Button>
                </div>
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
