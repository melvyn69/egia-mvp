import { useEffect, useMemo, useState } from "react";
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

type AutomationType =
  | "rating_drop"
  | "negative_review"
  | "volume_drop"
  | "weekly_summary";

type AutomationConfig = {
  id: string;
  type: AutomationType;
  name: string;
  enabled: boolean;
  scope: { mode: "all" | "location"; locationId: string | null };
  frequency: "daily" | "weekly";
  channel: { inApp: true; email: boolean };
  params: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type MockAlert = {
  id: string;
  automation_id: string;
  title: string;
  message: string;
  severity: "info" | "warn" | "crit" | "critical";
  created_at: string;
  location_name: string;
};

const AUTOMATION_STORAGE_KEY = "egia:automations:v1";
const ALERTS_STORAGE_KEY = "egia:alerts:v1";

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

const automationLabels: Record<AutomationType, string> = {
  rating_drop: "Alerte baisse de note",
  negative_review: "Alerte avis negatif",
  volume_drop: "Alerte volume",
  weekly_summary: "Resume hebdo"
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

const mapSeverity = (value: MockAlert["severity"]): AlertRow["severity"] => {
  if (value === "crit" || value === "critical") return "high";
  if (value === "warn") return "medium";
  return "low";
};

const getAutomationName = (automation: AutomationConfig) => {
  const trimmed = automation.name.trim();
  if (trimmed) return trimmed;
  return automationLabels[automation.type] ?? "Nouvelle automatisation";
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
  const accessToken = session?.access_token ?? null;
  const [automations, setAutomations] = useState<AutomationConfig[]>([]);
  const [mockAlerts, setMockAlerts] = useState<AlertRow[]>([]);
  const [mockFeedback, setMockFeedback] = useState<string | null>(null);

  const loadMockAlerts = () => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!stored) {
      setMockAlerts([]);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as MockAlert[];
      if (Array.isArray(parsed)) {
        const mapped: AlertRow[] = parsed.map((item) => ({
          id: item.id,
          rule_code: "AUTOMATION",
          severity: mapSeverity(item.severity),
          review_id: item.automation_id,
          triggered_at: item.created_at,
          payload: {
            message: item.message,
            location_name: item.location_name,
            title: item.title
          }
        }));
        setMockAlerts(mapped);
        return;
      }
      setMockAlerts([]);
    } catch {
      setMockAlerts([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as AutomationConfig[];
      if (Array.isArray(parsed)) {
        setAutomations(parsed);
      }
    } catch {
      setAutomations([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadMockAlerts();
    const handler = (event: StorageEvent) => {
      if (event.key === ALERTS_STORAGE_KEY) {
        loadMockAlerts();
      }
    };
    const customHandler = () => loadMockAlerts();
    window.addEventListener("storage", handler);
    window.addEventListener("egia:alerts:updated", customHandler as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("egia:alerts:updated", customHandler as EventListener);
    };
  }, []);

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
  const combinedAlerts = [...mockAlerts, ...alerts];
  const formattedAlerts = useMemo(
    () =>
      combinedAlerts.map((alert) => ({
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
    [combinedAlerts]
  );

  const activeAutomations = useMemo(
    () => automations.filter((item) => item.enabled),
    [automations]
  );
  const mockCount = mockAlerts.length;
  const lastMockAt =
    mockAlerts.length > 0 ? mockAlerts[0]?.triggered_at ?? null : null;
  const lastMockLabel = lastMockAt ? formatRelativeDate(lastMockAt) : "—";

  const buildAutomationPreview = (automation: AutomationConfig) => {
    const lastRun = new Date(automation.updatedAt);
    const nextRun = new Date(lastRun.getTime());
    nextRun.setDate(
      nextRun.getDate() + (automation.frequency === "weekly" ? 7 : 1)
    );
    return {
      lastLabel: formatRelativeDate(lastRun.toISOString()),
      nextLabel: nextRun.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short"
      })
    };
  };

  const handleTestAutomation = (automation: AutomationConfig) => {
    const message =
      automation.type === "rating_drop"
        ? "Un concurrent passe devant vous en note."
        : automation.type === "negative_review"
          ? "Un nouvel avis negatif sans reponse est detecte."
          : automation.type === "volume_drop"
            ? "Le volume d'avis est en baisse sur 7 jours."
            : "Resume hebdomadaire pret a consulter.";
    const mockAlert: MockAlert = {
      id: `mock-${automation.id}-${Date.now()}`,
      automation_id: automation.id,
      title: getAutomationName(automation),
      message,
      severity: automation.type === "weekly_summary" ? "info" : "warn",
      created_at: new Date().toISOString(),
      location_name:
        automation.scope.mode === "all" ? "Tous les etablissements" : "Etablissement"
    };
    const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as MockAlert[]) : [];
    const next = [mockAlert, ...(Array.isArray(parsed) ? parsed : [])].slice(0, 20);
    window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(next));
    const mapped: AlertRow[] = next.map((item) => ({
      id: item.id,
      rule_code: "AUTOMATION",
      severity: mapSeverity(item.severity),
      review_id: item.automation_id,
      triggered_at: item.created_at,
      payload: { message: item.message, location_name: item.location_name }
    }));
    setMockAlerts(mapped);
    window.dispatchEvent(new CustomEvent("egia:alerts:updated"));
    setMockFeedback("Alerte simulee envoyee.");
    setTimeout(() => setMockFeedback(null), 1500);
  };

  const lastCheckedLabel =
    alertsQuery.dataUpdatedAt && alertsQuery.dataUpdatedAt > 0
      ? new Date(alertsQuery.dataUpdatedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : null;

  const handleRefresh = async () => {
    loadMockAlerts();
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
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-700">
                  Automatisations (aperçu)
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Déclenchements simulés pour tester vos règles.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{activeAutomations.length} actives</Badge>
                <Badge variant="neutral">{mockCount} alertes simulées</Badge>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Dernier déclenchement : {lastMockLabel}
            </div>
            {activeAutomations.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Aucune automatisation active pour le moment.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {activeAutomations.map((automation) => {
                  const preview = buildAutomationPreview(automation);
                  return (
                    <div
                      key={automation.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600"
                    >
                      <div>
                        <div className="font-semibold text-slate-700">
                          {getAutomationName(automation)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Dernier declenchement: {preview.lastLabel} · Prochaine
                          execution: {preview.nextLabel}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestAutomation(automation)}
                      >
                        Tester
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {mockFeedback && (
              <div className="mt-2 text-[11px] font-semibold text-emerald-600">
                {mockFeedback}
              </div>
            )}
          </div>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default Alerts;

// Manual test plan:
// 1) Ouvrir /automation -> tester une automatisation -> creer un mock.
// 2) Ouvrir /alerts -> voir le mock dans la liste.
// 3) Actualiser la page -> le mock reste via localStorage egia:alerts:v1.
// 4) Cliquer Tester dans l'aperçu -> alerte simulée et compteur mis a jour.
