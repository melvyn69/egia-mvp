import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type AutomationBuilderProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
};

type ConditionInput = {
  id?: string;
  field: "rating" | "source" | "comment";
  operator: "eq" | "gte" | "lte" | "contains" | "not_contains";
  value: string;
};

type ActionInput = {
  id?: string;
  type: "ai_draft" | "add_tag" | "autopilot" | "email_alert";
  config: { tone?: string; tag?: string };
};

const triggerOptions = [{ id: "new_review", label: "Nouvel avis recu" }];

const conditionFieldOptions = [
  { id: "rating", label: "Note" },
  { id: "source", label: "Source" },
  { id: "comment", label: "Commentaire" }
] as const;

const operatorOptions = [
  { id: "eq", label: "Egal a" },
  { id: "gte", label: "Superieur ou egal" },
  { id: "lte", label: "Inferieur ou egal" },
  { id: "contains", label: "Contient" },
  { id: "not_contains", label: "Ne contient pas" }
] as const;

const actionOptions = [
  { id: "ai_draft", label: "Brouillon IA", disabled: false },
  { id: "add_tag", label: "Ajouter un tag", disabled: false },
  { id: "autopilot", label: "Autopilot (bientot)", disabled: true },
  { id: "email_alert", label: "Email alert (bientot)", disabled: true }
] as const;

const toneOptions = [
  { id: "professional", label: "Professionnel" },
  { id: "enthusiastic", label: "Enthousiaste" },
  { id: "empathic", label: "Empathique" },
  { id: "apology", label: "Excusant" }
] as const;

const AutomationBuilder = ({ session, locations }: AutomationBuilderProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("id");
  const isEditing = Boolean(workflowId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("new_review");
  const [locationId, setLocationId] = useState<string>("all");
  const [enabled, setEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionInput[]>([]);
  const [actions, setActions] = useState<ActionInput[]>([]);
  const supabaseClient = supabase;

  const locationOptions = useMemo(
    () => [
      { id: "all", label: "Toutes les fiches" },
      ...locations.map((location) => ({
        id: location.location_resource_name,
        label: location.location_title ?? location.location_resource_name
      }))
    ],
    [locations]
  );

  useEffect(() => {
    if (!supabaseClient || !session || !workflowId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data: workflow, error: workflowError } = await supabaseClient
        .from("automation_workflows")
        .select("*")
        .eq("id", workflowId)
        .maybeSingle();
      if (cancelled) {
        return;
      }
      if (workflowError || !workflow) {
        console.error("automation_workflows load error:", workflowError);
        setError("Impossible de charger le workflow.");
        setLoading(false);
        return;
      }
      setName(workflow.name ?? "");
      setTrigger(workflow.trigger ?? "new_review");
      setEnabled(Boolean(workflow.enabled));
      setLocationId(workflow.location_id ?? "all");

      const [conditionsRes, actionsRes] = await Promise.all([
        supabaseClient
          .from("automation_conditions")
          .select("*")
          .eq("workflow_id", workflowId),
        supabaseClient
          .from("automation_actions")
          .select("*")
          .eq("workflow_id", workflowId)
      ]);
      if (cancelled) {
        return;
      }
      if (conditionsRes.error) {
        console.error("automation_conditions load error:", conditionsRes.error);
      }
      if (actionsRes.error) {
        console.error("automation_actions load error:", actionsRes.error);
      }
      const loadedConditions = (conditionsRes.data ?? []).map((item) => ({
        id: item.id,
        field: (item.field ?? "rating") as ConditionInput["field"],
        operator: (item.operator ?? "eq") as ConditionInput["operator"],
        value: (item.value ?? "").toString()
      }));
      const loadedActions = (actionsRes.data ?? []).map((item) => {
        let config: ActionInput["config"] = {};
        if (typeof item.config === "string") {
          try {
            config = JSON.parse(item.config) as ActionInput["config"];
          } catch {
            config = {};
          }
        } else if (item.config && typeof item.config === "object") {
          config = item.config as ActionInput["config"];
        }
        return {
          id: item.id,
          type: (item.type ?? "ai_draft") as ActionInput["type"],
          config
        };
      });
      setConditions(loadedConditions);
      setActions(loadedActions);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, workflowId]);

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: "rating", operator: "gte", value: "4" }
    ]);
  };

  const addAction = () => {
    setActions((prev) => [
      ...prev,
      { type: "ai_draft", config: { tone: "professional" } }
    ]);
  };

  const updateCondition = (index: number, patch: Partial<ConditionInput>) => {
    setConditions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const updateAction = (index: number, patch: Partial<ActionInput>) => {
    setActions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!supabaseClient || !session) {
      return;
    }
    setSaving(true);
    setError(null);
    const workflowPayload = {
      id: workflowId ?? undefined,
      user_id: session.user.id,
      name: name.trim() || "Workflow sans nom",
      trigger,
      enabled,
      location_id: locationId === "all" ? null : locationId
    };
    const { data: savedWorkflow, error: workflowError } = await supabaseClient
      .from("automation_workflows")
      .upsert(workflowPayload)
      .select("*")
      .maybeSingle();
    if (workflowError || !savedWorkflow) {
      console.error("automation_workflows save error:", workflowError);
      setError("Impossible de sauvegarder le workflow.");
      setSaving(false);
      return;
    }
    const savedId = savedWorkflow.id as string;

    const { error: deleteConditionsError } = await supabaseClient
      .from("automation_conditions")
      .delete()
      .eq("workflow_id", savedId);
    if (deleteConditionsError) {
      console.error("automation_conditions delete error:", deleteConditionsError);
    }

    const { error: deleteActionsError } = await supabaseClient
      .from("automation_actions")
      .delete()
      .eq("workflow_id", savedId);
    if (deleteActionsError) {
      console.error("automation_actions delete error:", deleteActionsError);
    }

    if (conditions.length > 0) {
      const conditionRows = conditions.map((condition) => ({
        workflow_id: savedId,
        user_id: session.user.id,
        field: condition.field,
        operator: condition.operator,
        value: condition.value
      }));
      const { error: insertConditionsError } = await supabaseClient
        .from("automation_conditions")
        .insert(conditionRows);
      if (insertConditionsError) {
        console.error("automation_conditions insert error:", insertConditionsError);
      }
    }

    if (actions.length > 0) {
      const actionRows = actions
        .filter((action) => action.type === "ai_draft" || action.type === "add_tag")
        .map((action) => ({
          workflow_id: savedId,
          user_id: session.user.id,
          type: action.type,
          config: action.config
        }));
      const { error: insertActionsError } = await supabaseClient
        .from("automation_actions")
        .insert(actionRows);
      if (insertActionsError) {
        console.error("automation_actions insert error:", insertActionsError);
      }
    }

    setSaving(false);
    navigate("/automation");
  };

  if (!supabaseClient) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Automatisations
          </h2>
          <p className="text-sm text-slate-500">
            Definissez le declencheur, les conditions et les actions.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Configuration Supabase manquante.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          {isEditing ? "Edition du workflow" : "Nouveau workflow"}
        </h2>
        <p className="text-sm text-slate-500">
          Definissez le declencheur, les conditions et les actions.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Parametres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500">Nom</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex: Gestion des avis negatifs"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500">
                    Declencheur
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    value={trigger}
                    onChange={(event) => setTrigger(event.target.value)}
                  >
                    {triggerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">
                    Lieu
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    {locationOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                Activer le workflow
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.length === 0 && (
                <p className="text-sm text-slate-500">
                  Aucune condition. Le workflow s'applique a tous les avis.
                </p>
              )}
              {conditions.map((condition, index) => (
                <div
                  key={`cond-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2"
                >
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={condition.field}
                    onChange={(event) =>
                      updateCondition(index, {
                        field: event.target.value as ConditionInput["field"]
                      })
                    }
                  >
                    {conditionFieldOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={condition.operator}
                    onChange={(event) =>
                      updateCondition(index, {
                        operator: event.target.value as ConditionInput["operator"]
                      })
                    }
                  >
                    {operatorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={condition.value}
                    onChange={(event) =>
                      updateCondition(index, { value: event.target.value })
                    }
                    placeholder="Valeur"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeCondition(index)}
                  >
                    Supprimer
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCondition}>
                Ajouter condition
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actions.length === 0 && (
                <p className="text-sm text-slate-500">
                  Ajoutez au moins une action.
                </p>
              )}
              {actions.map((action, index) => (
                <div
                  key={`action-${index}`}
                  className="space-y-2 rounded-xl border border-slate-100 bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      value={action.type}
                      onChange={(event) =>
                        updateAction(index, {
                          type: event.target.value as ActionInput["type"],
                          config:
                            event.target.value === "ai_draft"
                              ? { tone: "professional" }
                              : event.target.value === "add_tag"
                                ? { tag: "" }
                                : {}
                        })
                      }
                    >
                      {actionOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={option.disabled}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeAction(index)}
                    >
                      Supprimer
                    </Button>
                  </div>
                  {action.type === "ai_draft" && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">
                        Ton
                      </label>
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        value={action.config.tone ?? "professional"}
                        onChange={(event) =>
                          updateAction(index, {
                            config: { tone: event.target.value }
                          })
                        }
                      >
                        {toneOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {action.type === "add_tag" && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">
                        Tag
                      </label>
                      <input
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        value={action.config.tag ?? ""}
                        onChange={(event) =>
                          updateAction(index, {
                            config: { tag: event.target.value }
                          })
                        }
                        placeholder="Ex: service"
                      />
                    </div>
                  )}
                  {(action.type === "autopilot" ||
                    action.type === "email_alert") && (
                    <p className="text-xs text-slate-400">
                      Action indisponible dans le MVP.
                    </p>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addAction}>
                Ajouter action
              </Button>
            </CardContent>
          </Card>

          {error && (
            <Card>
              <CardContent className="pt-6 text-sm text-amber-700">
                {error}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Sauvegarde..." : "Enregistrer"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/automation")}>
              Annuler
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export { AutomationBuilder };
