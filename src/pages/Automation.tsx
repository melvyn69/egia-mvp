// Checklist non-regression (/automation):
// - "Créer manuellement" ouvre le builder
// - Templates ouvrent le builder avec preset
// - "Configurer" ouvre le builder pour l'ID
// - Toggle ON/OFF persiste
// - Aucun mock/localStorage
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type AutomationProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

type WorkflowRow = {
  id: string;
  name: string | null;
  enabled: boolean | null;
  trigger: string | null;
  location_ids: string[] | null;
  updated_at?: string | null;
};

const templateCards = [
  {
    id: "vip",
    title: "Fidélisation VIP",
    description:
      "Générer une réponse enthousiaste et taguer les avis 5 étoiles."
  },
  {
    id: "social",
    title: "Social Booster 5★",
    description: "Publier automatiquement les meilleurs avis."
  },
  {
    id: "recovery",
    title: "Récupération client",
    description: "Alerte immédiate pour avis négatif (win-back)."
  },
  {
    id: "autopilot",
    title: "Pilote automatique",
    description: "Répondre automatiquement aux avis positifs."
  }
];

const Automation = ({ session, locations }: AutomationProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    processed?: number;
    inserted?: number;
    skippedCooldown?: number;
    last_cursor?: string | null;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      if (!supabase) {
        setError("Client Supabase indisponible.");
        setLoading(false);
        return;
      }
      const { data, error: queryError } = await supabase
        .from("automation_workflows")
        .select("id,name,enabled,trigger,location_ids,updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (queryError) {
        setError("Impossible de charger les automatisations.");
        setLoading(false);
        return;
      }
      const nextWorkflows = (data as WorkflowRow[]) ?? [];
      setWorkflows(nextWorkflows);
      queryClient.setQueryData(
        ["coach-automation-count", session.user.id],
        nextWorkflows.filter((item) => item.enabled === true).length
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryClient, session]);

  const getLocationLabel = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return "Tous les établissements";
    const match = locations.find((loc) => loc.id === ids[0]);
    return match?.location_title ?? match?.location_resource_name ?? "Établissement";
  };

  const handleToggle = async (workflow: WorkflowRow, enabled: boolean) => {
    if (!session) return;
    if (!supabase) return;
    await supabase
      .from("automation_workflows")
      .update({ enabled })
      .eq("id", workflow.id)
      .eq("user_id", session.user.id);
    const nextWorkflows = workflows.map((item) =>
      item.id === workflow.id ? { ...item, enabled } : item
    );
    setWorkflows(nextWorkflows);
    queryClient.setQueryData(
      ["coach-automation-count", session.user.id],
      nextWorkflows.filter((item) => item.enabled === true).length
    );
    void queryClient.invalidateQueries({
      queryKey: ["coach-automation-count", session.user.id]
    });
  };

  const handleRunNow = async () => {
    if (!supabase) {
      setRunError("Client Supabase indisponible.");
      return;
    }
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setRunError("Session expirée. Reconnectez-vous.");
        return;
      }
      const response = await fetch("/api/reports/automations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible d’exécuter l’automatisation.");
      }
      const payload = (await response.json()) as {
        processed?: number;
        inserted?: number;
        skippedCooldown?: number;
        last_cursor?: string | null;
      };
      setRunResult(payload);
      setRunError(null);
    } catch (err) {
      setRunError(
        err instanceof Error
          ? err.message
          : "Impossible d’exécuter l’automatisation."
      );
    } finally {
      setRunning(false);
    }
  };

  const activeWorkflows = useMemo(
    () => workflows.filter((item) => item.enabled),
    [workflows]
  );

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden md:space-y-8">
      {/* Non-regression checklist:
         - Créer manuellement -> ouvre /automation/builder
         - Templates -> ouvrent /automation/builder?template=...
         - Configurer -> ouvre /automation/builder?id=...
         - Toggle ON/OFF -> persiste et se reflète
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
              Automatisations
            </h1>
            <Badge variant="neutral">Bêta privée</Badge>
          </div>
          <p className="hidden text-sm text-slate-500 sm:block">
            Configurez le pilote automatique pour votre e-réputation.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
          <Button
            variant="outline"
            onClick={handleRunNow}
            disabled={running}
            className="min-h-11"
          >
            {running ? "Exécution..." : "Lancer maintenant"}
          </Button>
          <Button
            onClick={() => navigate("/automation/builder")}
            className="min-h-11"
          >
            Créer un scénario
          </Button>
        </div>
      </div>
      {(runError || runResult) && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {runError ? (
            <p className="text-rose-600">{runError}</p>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold text-emerald-700">
                Automatisation exécutée.
              </p>
              <p className="text-xs text-slate-500">
                Avis traités : {runResult?.processed ?? 0} · Alertes :{" "}
                {runResult?.inserted ?? 0} · Mis en pause :{" "}
                {runResult?.skippedCooldown ?? 0}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navigate("/alerts")}
              >
                Voir les alertes
              </Button>
            </div>
          )}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">
          Modèles prêts à l’emploi
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {templateCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="min-h-[118px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md md:p-4"
              onClick={() => navigate(`/automation/builder?template=${card.id}`)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 md:h-10 md:w-10 md:rounded-2xl">
                ✦
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900 md:mt-4">
                {card.title}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-slate-500 md:mt-2">
                {card.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            Vos scénarios actifs
          </span>
          <Badge variant="neutral">{activeWorkflows.length}</Badge>
        </div>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">
              Aucune automatisation active
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Créez votre première règle pour déclencher des alertes utiles.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="border border-indigo-200">
                <CardHeader className="flex flex-row items-center justify-between p-4 md:p-6">
                  <div className="min-w-0 space-y-1">
                    <Badge variant="success">Pilote automatique</Badge>
                    <CardTitle className="text-base">
                      {workflow.name?.trim() || "Automatisation"}
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      {getLocationLabel(workflow.location_ids)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-emerald-600">
                      {workflow.enabled ? "ON" : "OFF"}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(workflow.enabled)}
                      onChange={(event) =>
                        handleToggle(workflow, event.target.checked)
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 px-4 pb-4 md:flex md:flex-wrap md:px-6 md:pb-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    disabled
                    title="Bientôt disponible"
                  >
                    Lancer maintenant
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    onClick={() =>
                      navigate(`/automation/builder?id=${workflow.id}`)
                    }
                  >
                    Configurer
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500">
        Certains scénarios avancés seront activables prochainement.
      </div>

      {/* How to test:
         1) Creer manuellement -> ouvre /automation/builder.
         2) Cliquer un template -> ouvre /automation/builder?template=....
         3) Configurer -> ouvre /automation/builder?id=....
         4) Toggle ON/OFF -> persiste et se reflète apres refresh.
         5) Enregistrer dans le builder -> revient sur /automation.
      */}
    </div>
  );
};

export { Automation };
