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
  field: "rating" | "no_reply_hours" | "sentiment";
  operator: "eq" | "gte" | "lte";
  value: string;
};

type ActionInput = {
  id?: string;
  action_type: "create_alert";
  params: {
    alert_type: "LOW_RATING" | "NO_REPLY" | "NEGATIVE_SENTIMENT";
    severity: "high" | "medium" | "low";
    cooldown_hours: number;
  };
};

const triggerOptions = [{ id: "new_review", label: "Nouvel avis recu" }];

const conditionFieldOptions = [
  { id: "rating", label: "Note" },
  { id: "no_reply_hours", label: "Pas de reponse (heures)" },
  { id: "sentiment", label: "Sentiment negatif" }
] as const;

const operatorOptions = [
  { id: "eq", label: "Egal a" },
  { id: "gte", label: "Superieur ou egal" },
  { id: "lte", label: "Inferieur ou egal" }
] as const;

const actionOptions = [
  { id: "create_alert", label: "Creer une alerte", disabled: false }
] as const;

const alertTypeOptions = [
  { id: "LOW_RATING", label: "Note basse" },
  { id: "NO_REPLY", label: "Sans reponse" },
  { id: "NEGATIVE_SENTIMENT", label: "Sentiment negatif" }
] as const;

const severityOptions = [
  { id: "high", label: "Elevee" },
  { id: "medium", label: "Moyenne" },
  { id: "low", label: "Faible" }
] as const;

const AutomationBuilder = ({ session, locations }: AutomationBuilderProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("id");
  const templateId = searchParams.get("template");
  const isEditing = Boolean(workflowId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("new_review");
  const [locationScope, setLocationScope] = useState<"all" | "selected">("all");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionInput[]>([]);
  const [actions, setActions] = useState<ActionInput[]>([]);
  const [templateApplied, setTemplateApplied] = useState(false);
  const supabaseClient = supabase;

  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        id: location.id,
        label: location.location_title ?? location.location_resource_name
      })),
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
      const storedIds = Array.isArray(workflow.location_ids)
        ? workflow.location_ids.filter(Boolean)
        : [];
      const fallbackId = workflow.location_id
        ? locations.find(
            (location) =>
              location.location_resource_name === workflow.location_id
          )?.id
        : null;
      const nextIds =
        storedIds.length > 0
          ? storedIds
          : fallbackId
            ? [fallbackId]
            : [];
      setLocationScope(nextIds.length > 0 ? "selected" : "all");
      setSelectedLocationIds(nextIds);

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
      const loadedConditions = (conditionsRes.data ?? []).map((item) => {
        const rawValue = (item as { value_jsonb?: unknown; value?: unknown })
          .value_jsonb;
        const fallbackValue = (item as { value?: unknown }).value;
        const value =
          rawValue !== undefined && rawValue !== null
            ? String(rawValue)
            : fallbackValue !== undefined && fallbackValue !== null
              ? String(fallbackValue)
              : "";
        return {
          id: item.id,
          field: (item.field ?? "rating") as ConditionInput["field"],
          operator: (item.operator ?? "eq") as ConditionInput["operator"],
          value
        };
      });
      const loadedActions = (actionsRes.data ?? []).map((item) => {
        const rawParams = (item as { params?: unknown }).params;
        const fallbackConfig = (item as { config?: unknown }).config;
        const params =
          rawParams && typeof rawParams === "object"
            ? (rawParams as ActionInput["params"])
            : fallbackConfig && typeof fallbackConfig === "object"
              ? (fallbackConfig as ActionInput["params"])
              : {
                  alert_type: "LOW_RATING",
                  severity: "medium",
                  cooldown_hours: 24
                };
        return {
          id: item.id,
          action_type: ((item as { action_type?: string }).action_type ??
            (item as { type?: string }).type ??
            "create_alert") as ActionInput["action_type"],
          params
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
  }, [session, workflowId, locations, supabaseClient]);

  useEffect(() => {
    if (workflowId || !templateId || templateApplied) return;
    const presets: Record<
      string,
      { name: string; conditions: ConditionInput[]; actions: ActionInput[] }
    > = {
      vip: {
        name: "Fidélisation VIP",
        conditions: [{ field: "rating", operator: "eq", value: "5" }],
        actions: [
          {
            action_type: "create_alert",
            params: {
              alert_type: "LOW_RATING",
              severity: "medium",
              cooldown_hours: 24
            }
          }
        ]
      },
      social: {
        name: "Social Booster 5★",
        conditions: [{ field: "rating", operator: "gte", value: "4.8" }],
        actions: [
          {
            action_type: "create_alert",
            params: {
              alert_type: "LOW_RATING",
              severity: "low",
              cooldown_hours: 24
            }
          }
        ]
      },
      recovery: {
        name: "Récupération Client",
        conditions: [{ field: "rating", operator: "lte", value: "2" }],
        actions: [
          {
            action_type: "create_alert",
            params: {
              alert_type: "LOW_RATING",
              severity: "high",
              cooldown_hours: 12
            }
          }
        ]
      },
      autopilot: {
        name: "Pilote Automatique",
        conditions: [{ field: "rating", operator: "gte", value: "4" }],
        actions: [
          {
            action_type: "create_alert",
            params: {
              alert_type: "NO_REPLY",
              severity: "medium",
              cooldown_hours: 24
            }
          }
        ]
      }
    };
    const preset = presets[templateId];
    if (!preset) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!name.trim()) setName(preset.name);
    setConditions(preset.conditions);
    setActions(preset.actions);
    setTemplateApplied(true);
  }, [workflowId, templateId, templateApplied, name]);

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: "rating", operator: "lte", value: "3" }
    ]);
  };

  const addAction = () => {
    setActions((prev) => [
      ...prev,
      {
        action_type: "create_alert",
        params: {
          alert_type: "LOW_RATING",
          severity: "high",
          cooldown_hours: 24
        }
      }
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

  const handleTriggerChange = (nextTrigger: string) => {
    setTrigger(nextTrigger);
    if (!name.trim()) {
      const label =
        triggerOptions.find((option) => option.id === nextTrigger)?.label ??
        "Workflow sans nom";
      setName(label);
    }
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
      location_ids:
        locationScope === "all" || selectedLocationIds.length === 0
          ? null
          : selectedLocationIds
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
        value: condition.value,
        value_jsonb:
          condition.field === "sentiment"
            ? condition.value
            : Number.isFinite(Number(condition.value))
              ? Number(condition.value)
              : condition.value,
        label:
          condition.field === "rating"
            ? "Note"
            : condition.field === "no_reply_hours"
              ? "Pas de reponse"
              : "Sentiment negatif"
      }));
      const { error: insertConditionsError } = await supabaseClient
        .from("automation_conditions")
        .insert(conditionRows);
      if (insertConditionsError) {
        console.error("automation_conditions insert error:", insertConditionsError);
      }
    }

    if (actions.length > 0) {
      const actionRows = actions.map((action) => ({
        workflow_id: savedId,
        user_id: session.user.id,
        type: action.action_type,
        config: action.params,
        action_type: action.action_type,
        params: action.params,
        label: "Creer une alerte"
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
                    onChange={(event) => handleTriggerChange(event.target.value)}
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
                    Appliquer a
                  </label>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="location_scope"
                        checked={locationScope === "all"}
                        onChange={() => setLocationScope("all")}
                      />
                      Tous les etablissements
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="location_scope"
                        checked={locationScope === "selected"}
                        onChange={() => setLocationScope("selected")}
                      />
                      Salons selectionnes
                    </label>
                  </div>
                </div>
              </div>
              {locationScope === "selected" && (
                <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-600">
                  <div className="grid gap-2 md:grid-cols-2">
                    {locationOptions.map((option) => (
                      <label key={option.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedLocationIds.includes(option.id)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedLocationIds((prev) =>
                              checked
                                ? [...prev, option.id]
                                : prev.filter((id) => id !== option.id)
                            );
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
                        field: event.target.value as ConditionInput["field"],
                        operator:
                          event.target.value === "sentiment"
                            ? "eq"
                            : event.target.value === "no_reply_hours"
                              ? "gte"
                              : condition.operator,
                        value:
                          event.target.value === "sentiment"
                            ? "negative"
                            : event.target.value === "no_reply_hours"
                              ? "24"
                              : condition.value
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
                  {condition.field === "sentiment" ? (
                    <select
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      value={condition.value || "negative"}
                      onChange={(event) =>
                        updateCondition(index, { value: event.target.value })
                      }
                    >
                      <option value="negative">Negatif</option>
                      <option value="very_negative">Tres negatif</option>
                    </select>
                  ) : (
                    <input
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      type="number"
                      value={condition.value}
                      onChange={(event) =>
                        updateCondition(index, { value: event.target.value })
                      }
                      placeholder="Valeur"
                    />
                  )}
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
                    value={action.action_type}
                    onChange={(event) =>
                      updateAction(index, {
                        action_type: event.target.value as ActionInput["action_type"],
                        params: {
                          alert_type: "LOW_RATING",
                          severity: "medium",
                          cooldown_hours: 24
                        }
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
                  {action.action_type === "create_alert" && (
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-500">
                          Type
                        </label>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                          value={action.params.alert_type}
                          onChange={(event) =>
                            updateAction(index, {
                              params: {
                                ...action.params,
                                alert_type: event.target
                                  .value as ActionInput["params"]["alert_type"]
                              }
                            })
                          }
                        >
                          {alertTypeOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-500">
                          Priorite
                        </label>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                          value={action.params.severity}
                          onChange={(event) =>
                            updateAction(index, {
                              params: {
                                ...action.params,
                                severity: event.target
                                  .value as ActionInput["params"]["severity"]
                              }
                            })
                          }
                        >
                          {severityOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-500">
                          Cooldown (h)
                        </label>
                        <input
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                          type="number"
                          min={1}
                          value={action.params.cooldown_hours}
                          onChange={(event) =>
                            updateAction(index, {
                              params: {
                                ...action.params,
                                cooldown_hours: Number(event.target.value || 0)
                              }
                            })
                          }
                        />
                      </div>
                    </div>
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

// Manual test plan:
// 1) Ouvrir /automation?template=vip -> conditions/actions pre-remplies, nom auto si vide.
// 2) Ajouter condition "Pas de reponse" + heures -> sauvegarder -> reload -> valeurs conservees.
// 3) Ajouter action "Creer une alerte" + type/severite/cooldown -> sauvegarder -> reload -> valeurs conservees.
// 4) Verifier que user_id est bien rempli (RLS OK) lors des inserts.
