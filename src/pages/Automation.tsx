import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
    title: "Récupération Client",
    description: "Alerte immédiate pour avis négatif (win-back)."
  },
  {
    id: "autopilot",
    title: "Pilote Automatique",
    description: "Répondre automatiquement aux avis positifs."
  }
];

const Automation = ({ session, locations }: AutomationProps) => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setWorkflows((data as WorkflowRow[]) ?? []);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

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
    setWorkflows((prev) =>
      prev.map((item) =>
        item.id === workflow.id ? { ...item, enabled } : item
      )
    );
  };

  const activeWorkflows = useMemo(
    () => workflows.filter((item) => item.enabled),
    [workflows]
  );

  return (
    <div className="space-y-8">
      {/* Non-regression checklist:
         - Créer manuellement -> ouvre /automation/builder
         - Templates -> ouvrent /automation/builder?template=...
         - Configurer -> ouvre /automation/builder?id=...
         - Toggle ON/OFF -> persiste et se reflète
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              Automatisation
            </h1>
            <Badge variant="neutral">PRO</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Configurez le pilote automatique pour votre e-réputation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled title="Bientôt disponible">
            Actionner l’auto maintenant
          </Button>
          <Button onClick={() => navigate("/automation/builder")}>
            Créer manuellement
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">
          Modèles prêts à l’emploi
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {templateCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
              onClick={() => navigate(`/automation/builder?template=${card.id}`)}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                ✦
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">
                {card.title}
              </p>
              <p className="mt-2 text-xs text-slate-500">{card.description}</p>
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
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="space-y-1">
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
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Bientôt disponible"
                  >
                    Actionner l’auto maintenant
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
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
