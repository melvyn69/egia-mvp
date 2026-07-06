import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  CirclePlus,
  Info,
  MapPin,
  PauseCircle,
  Play,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";

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

type BuilderStepCardProps = {
  step: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
};

type SummaryMetricProps = {
  label: string;
  value: string | number;
  detail?: string;
};

type ConditionEditorCardProps = {
  condition: ConditionInput;
  index: number;
  onUpdate: (index: number, patch: Partial<ConditionInput>) => void;
  onRemove: (index: number) => void;
};

type ActionEditorCardProps = {
  action: ActionInput;
  index: number;
  onUpdate: (index: number, patch: Partial<ActionInput>) => void;
  onRemove: (index: number) => void;
};

const triggerOptions = [{ id: "new_review", label: "Nouvel avis reçu" }];

const conditionFieldOptions = [
  { id: "rating", label: "Note" },
  { id: "no_reply_hours", label: "Pas de réponse (heures)" },
  { id: "sentiment", label: "Sentiment négatif" }
] as const;

const operatorOptions = [
  { id: "eq", label: "Égal à" },
  { id: "gte", label: "Supérieur ou égal" },
  { id: "lte", label: "Inférieur ou égal" }
] as const;

const actionOptions = [
  { id: "create_alert", label: "Créer une alerte", disabled: false }
] as const;

const alertTypeOptions = [
  { id: "LOW_RATING", label: "Note basse" },
  { id: "NO_REPLY", label: "Sans réponse" },
  { id: "NEGATIVE_SENTIMENT", label: "Sentiment négatif" }
] as const;

const severityOptions = [
  { id: "high", label: "Élevée" },
  { id: "medium", label: "Moyenne" },
  { id: "low", label: "Faible" }
] as const;

const templateLabels: Record<string, string> = {
  vip: "Fidélisation VIP",
  social: "Social Booster 5★",
  recovery: "Récupération Client",
  autopilot: "Pilote Automatique"
};

const getTriggerLabel = (trigger: string) =>
  triggerOptions.find((option) => option.id === trigger)?.label ?? trigger;

const getConditionFieldLabel = (field: ConditionInput["field"]) =>
  conditionFieldOptions.find((option) => option.id === field)?.label ?? field;

const getOperatorSymbol = (operator: ConditionInput["operator"]) => {
  if (operator === "gte") return "≥";
  if (operator === "lte") return "≤";
  return "=";
};

const getOperatorLabel = (operator: ConditionInput["operator"]) =>
  operatorOptions.find((option) => option.id === operator)?.label ?? operator;

const getAlertTypeLabel = (alertType: ActionInput["params"]["alert_type"]) =>
  alertTypeOptions.find((option) => option.id === alertType)?.label ?? alertType;

const getSeverityLabel = (severity: ActionInput["params"]["severity"]) =>
  severityOptions.find((option) => option.id === severity)?.label ?? severity;

const getConditionSummary = (condition: ConditionInput) => {
  if (condition.field === "sentiment") {
    return condition.value === "very_negative"
      ? "Sentiment très négatif détecté"
      : "Sentiment négatif détecté";
  }
  if (condition.field === "no_reply_hours") {
    return `Avis sans réponse depuis ${condition.value || "0"} h`;
  }
  return `Note ${getOperatorSymbol(condition.operator)} ${condition.value || "0"}`;
};

const getActionSummary = (action: ActionInput) =>
  `Alerte ${getAlertTypeLabel(action.params.alert_type)} · priorité ${getSeverityLabel(
    action.params.severity
  ).toLowerCase()} · pause ${action.params.cooldown_hours || 0} h`;

const getScopeSummary = (
  locationScope: "all" | "selected",
  selectedLocationIds: string[]
) => {
  if (locationScope === "selected" && selectedLocationIds.length > 0) {
    return `${selectedLocationIds.length} établissement${
      selectedLocationIds.length > 1 ? "s" : ""
    }`;
  }
  return "Tous les établissements";
};

const getWorkflowStatusLabel = (enabled: boolean) =>
  enabled ? "Actif" : "En pause";

const getTemplateLabel = (templateId: string | null) =>
  templateId ? templateLabels[templateId] ?? "Modèle préconfiguré" : null;

const inputClassName =
  "mt-1 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-500/10";

const labelClassName =
  "text-xs font-semibold uppercase tracking-[0.12em] text-slate-500";

const AutomationBuilder = ({ session, locations }: AutomationBuilderProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("id");
  const templateId = searchParams.get("template");
  const isEditing = Boolean(workflowId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadIntegrityError, setLoadIntegrityError] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("new_review");
  const [locationScope, setLocationScope] = useState<"all" | "selected">("all");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionInput[]>([]);
  const [actions, setActions] = useState<ActionInput[]>([]);
  const [templateApplied, setTemplateApplied] = useState(false);
  const supabaseClient = supabase;
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowResult, setRunNowResult] = useState<{
    processed?: number;
    inserted?: number;
    skippedCooldown?: number;
    last_cursor?: string | null;
  } | null>(null);
  const [runNowError, setRunNowError] = useState<string | null>(null);

  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        id: location.id,
        label: location.location_title ?? location.location_resource_name
      })),
    [locations]
  );

  const validationIssues = useMemo(() => {
    const issues: string[] = [];

    if (actions.length === 0) {
      issues.push("Ajoutez au moins une action pour enregistrer ce scénario.");
    }

    conditions.forEach((condition, index) => {
      if (condition.field === "sentiment") return;
      const value = Number(condition.value);
      if (!condition.value.trim() || !Number.isFinite(value)) {
        issues.push(`Condition ${index + 1} : valeur numérique invalide.`);
        return;
      }
      if (condition.field === "rating" && (value < 0 || value > 5)) {
        issues.push(`Condition ${index + 1} : la note doit être comprise entre 0 et 5.`);
      }
      if (condition.field === "no_reply_hours" && value < 0) {
        issues.push(`Condition ${index + 1} : le délai doit être positif.`);
      }
    });

    actions.forEach((action, index) => {
      const cooldown = Number(action.params.cooldown_hours);
      if (!Number.isFinite(cooldown) || cooldown < 1) {
        issues.push(`Action ${index + 1} : la pause doit être d'au moins 1 h.`);
      }
    });

    return issues;
  }, [actions, conditions]);

  const guidanceMessages = useMemo(() => {
    const messages: string[] = [];
    if (!name.trim()) {
      messages.push("Nom manquant : le scénario sera enregistré comme Workflow sans nom.");
    }
    if (locationScope === "selected" && selectedLocationIds.length === 0) {
      messages.push("Aucun établissement sélectionné : la portée restera globale.");
    }
    return messages;
  }, [locationScope, name, selectedLocationIds.length]);

  const canSave =
    Boolean(session) &&
    !loading &&
    !saving &&
    !loadIntegrityError &&
    validationIssues.length === 0;

  const displayName = name.trim() || "Scénario sans nom";
  const templateLabel = getTemplateLabel(templateId);
  const scopeSummary = getScopeSummary(locationScope, selectedLocationIds);

  useEffect(() => {
    if (!workflowId) {
      setLoadIntegrityError(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (!supabaseClient || !session || !workflowId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setLoadIntegrityError(false);
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
        setLoadIntegrityError(true);
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
      if (conditionsRes.error || actionsRes.error) {
        setError(
          "Impossible de charger toutes les règles du workflow. Rechargez la page avant de sauvegarder."
        );
        setLoadIntegrityError(true);
        setConditions([]);
        setActions([]);
        setLoading(false);
        return;
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
        const baseParams =
          rawParams && typeof rawParams === "object"
            ? (rawParams as Partial<ActionInput["params"]>)
            : fallbackConfig && typeof fallbackConfig === "object"
              ? (fallbackConfig as Partial<ActionInput["params"]>)
              : {};
        const params: ActionInput["params"] = {
          alert_type:
            baseParams.alert_type === "LOW_RATING" ||
            baseParams.alert_type === "NO_REPLY" ||
            baseParams.alert_type === "NEGATIVE_SENTIMENT"
              ? baseParams.alert_type
              : "LOW_RATING",
          severity:
            baseParams.severity === "high" ||
            baseParams.severity === "medium" ||
            baseParams.severity === "low"
              ? baseParams.severity
              : "medium",
          cooldown_hours:
            typeof baseParams.cooldown_hours === "number"
              ? baseParams.cooldown_hours
              : 24
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
    if (validationIssues.length > 0) {
      setError(validationIssues[0]);
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
      setError("Le scénario a été créé, mais les anciennes conditions n'ont pas pu être remplacées.");
      setSaving(false);
      return;
    }

    const { error: deleteActionsError } = await supabaseClient
      .from("automation_actions")
      .delete()
      .eq("workflow_id", savedId);
    if (deleteActionsError) {
      console.error("automation_actions delete error:", deleteActionsError);
      setError("Le scénario a été créé, mais les anciennes actions n'ont pas pu être remplacées.");
      setSaving(false);
      return;
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
              ? "Pas de réponse"
              : "Sentiment négatif"
      }));
      const { error: insertConditionsError } = await supabaseClient
        .from("automation_conditions")
        .insert(conditionRows);
      if (insertConditionsError) {
        console.error("automation_conditions insert error:", insertConditionsError);
        setError("Le scénario a été créé, mais les conditions n'ont pas pu être sauvegardées.");
        setSaving(false);
        return;
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
        label: "Créer une alerte"
      }));
      const { error: insertActionsError } = await supabaseClient
        .from("automation_actions")
        .insert(actionRows);
      if (insertActionsError) {
        console.error("automation_actions insert error:", insertActionsError);
        setError("Le scénario a été créé, mais les actions n'ont pas pu être sauvegardées.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    queryClient.setQueryData(
      ["coach-automation-count", session.user.id],
      (current: number | null | undefined) =>
        enabled ? Math.max(1, current ?? 0) : current ?? 0
    );
    void queryClient.invalidateQueries({
      queryKey: ["coach-automation-count", session.user.id]
    });
    navigate("/automation");
  };

  const handleRunNow = async () => {
    if (!supabaseClient) return;
    setRunNowLoading(true);
    setRunNowError(null);
    setRunNowResult(null);
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setRunNowError("Session expirée. Reconnectez-vous.");
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
      setRunNowResult(payload);
    } catch (err) {
      setRunNowError(
        err instanceof Error
          ? err.message
          : "Impossible d’exécuter l’automatisation."
      );
    } finally {
      setRunNowLoading(false);
    }
  };

  if (!supabaseClient) {
    return (
      <div className="automation-builder-page min-w-0 max-w-full space-y-4 overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-6 lg:pb-4">
        <BuilderHeader
          isEditing={isEditing}
          saving={saving}
          canSave={false}
          onBack={() => navigate("/automation")}
          onSave={handleSave}
        />
        <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="p-4 text-sm text-slate-500 sm:p-5">
            Configuration Supabase manquante.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="automation-builder-page min-w-0 max-w-full space-y-4 overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-6 lg:pb-4">
      <BuilderHeader
        isEditing={isEditing}
        saving={saving}
        canSave={canSave}
        onBack={() => navigate("/automation")}
        onSave={handleSave}
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {templateLabel && !isEditing && (
            <section className="min-w-0 overflow-hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-3 shadow-sm sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Modèle préconfiguré
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-slate-950 sm:text-base">
                    {templateLabel}
                  </h2>
                  <p className="mt-1 text-sm text-emerald-800/80">
                    Ajustez les règles et les actions avant d'enregistrer. Rien
                    n'est créé en base sans validation.
                  </p>
                </div>
              </div>
            </section>
          )}

          <WorkflowSummaryCard
            displayName={displayName}
            triggerLabel={getTriggerLabel(trigger)}
            conditionCount={conditions.length}
            actionCount={actions.length}
            scopeSummary={scopeSummary}
            enabled={enabled}
          />

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <aside className="order-1 min-w-0 lg:order-2">
              <HelpPanel />
            </aside>

            <main className="order-2 min-w-0 space-y-4 lg:order-1">
              <BuilderStepCard
                step="01"
                title="Paramètres"
                description="Définissez le nom, le signal qui déclenche l'analyse et la portée."
                Icon={Settings2}
              >
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <div className="min-w-0 md:col-span-2">
                    <label className={labelClassName}>Nom</label>
                    <input
                      className={inputClassName}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ex : Gestion des avis négatifs"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className={labelClassName}>Déclencheur</label>
                    <select
                      className={inputClassName}
                      value={trigger}
                      onChange={(event) => handleTriggerChange(event.target.value)}
                    >
                      {triggerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      Ce signal lance l'analyse automatique des avis entrants.
                    </p>
                  </div>

                  <div className="min-w-0">
                    <label className={labelClassName}>Statut</label>
                    <label className="mt-1 flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">
                          {getWorkflowStatusLabel(enabled)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {enabled ? "Surveillance active" : "Scénario en pause"}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-slate-950"
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 sm:p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        Portée établissements
                      </p>
                      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                        <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="location_scope"
                            className="mt-0.5 shrink-0"
                            checked={locationScope === "all"}
                            onChange={() => setLocationScope("all")}
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900">
                              Tous
                            </span>
                            <span className="block text-xs text-slate-500">
                              Tous les établissements disponibles.
                            </span>
                          </span>
                        </label>
                        <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="location_scope"
                            className="mt-0.5 shrink-0"
                            checked={locationScope === "selected"}
                            onChange={() => setLocationScope("selected")}
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900">
                              Sélection
                            </span>
                            <span className="block text-xs text-slate-500">
                              Limiter à certains établissements.
                            </span>
                          </span>
                        </label>
                      </div>

                      {locationScope === "selected" && (
                        <div className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                          {locationOptions.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              Aucun établissement disponible.
                            </p>
                          ) : (
                            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                              {locationOptions.map((option) => (
                                <label
                                  key={option.id}
                                  className="flex min-w-0 cursor-pointer items-start gap-2 text-sm text-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={selectedLocationIds.includes(option.id)}
                                    onChange={(event) => {
                                      const checked = event.target.checked;
                                      setSelectedLocationIds((prev) =>
                                        checked
                                          ? Array.from(new Set([...prev, option.id]))
                                          : prev.filter((id) => id !== option.id)
                                      );
                                    }}
                                  />
                                  <span className="min-w-0 break-words">
                                    {option.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </BuilderStepCard>

              <BuilderStepCard
                step="02"
                title="Conditions"
                description="Filtrez les avis à traiter. Sans condition, tout avis du déclencheur passe."
                Icon={ShieldCheck}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-w-0 sm:w-auto"
                    onClick={addCondition}
                  >
                    <CirclePlus className="h-4 w-4 shrink-0" />
                    <span>Ajouter</span>
                  </Button>
                }
              >
                {conditions.length === 0 ? (
                  <EmptyBuilderState
                    title="Aucune condition"
                    description="Le scénario s'appliquera à tous les avis correspondant au déclencheur."
                  />
                ) : (
                  <div className="space-y-3">
                    {conditions.map((condition, index) => (
                      <ConditionEditorCard
                        key={`cond-${index}`}
                        condition={condition}
                        index={index}
                        onUpdate={updateCondition}
                        onRemove={removeCondition}
                      />
                    ))}
                  </div>
                )}
              </BuilderStepCard>

              <BuilderStepCard
                step="03"
                title="Actions"
                description="Définissez ce qu'EGIA déclenche quand les règles correspondent."
                Icon={BellRing}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-w-0 sm:w-auto"
                    onClick={addAction}
                  >
                    <CirclePlus className="h-4 w-4 shrink-0" />
                    <span>Ajouter</span>
                  </Button>
                }
              >
                {actions.length === 0 ? (
                  <EmptyBuilderState
                    tone="warning"
                    title="Aucune action configurée"
                    description="Ajoutez au moins une action pour pouvoir enregistrer le scénario."
                  />
                ) : (
                  <div className="space-y-3">
                    {actions.map((action, index) => (
                      <ActionEditorCard
                        key={`action-${index}`}
                        action={action}
                        index={index}
                        onUpdate={updateAction}
                        onRemove={removeAction}
                      />
                    ))}
                  </div>
                )}
              </BuilderStepCard>

              {(validationIssues.length > 0 || guidanceMessages.length > 0 || error) && (
                <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
                  <CardContent className="space-y-2 p-3 text-sm sm:p-4">
                    {error && (
                      <p className="font-medium text-rose-600">{error}</p>
                    )}
                    {validationIssues.map((issue) => (
                      <p key={issue} className="text-amber-700">
                        {issue}
                      </p>
                    ))}
                    {guidanceMessages.map((message) => (
                      <p key={message} className="text-slate-500">
                        {message}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(runNowError || runNowResult) && (
                <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
                  <CardContent className="p-3 text-sm text-slate-700 sm:p-4">
                    {runNowError ? (
                      <p className="font-medium text-rose-600">{runNowError}</p>
                    ) : (
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-emerald-700">
                            Moteur global exécuté.
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Avis traités : {runNowResult?.processed ?? 0} · Alertes :{" "}
                            {runNowResult?.inserted ?? 0} · Cooldown :{" "}
                            {runNowResult?.skippedCooldown ?? 0}
                          </p>
                        </div>
                        {runNowResult?.inserted && runNowResult.inserted > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10 w-full sm:w-auto sm:min-h-0"
                            onClick={() => navigate("/alerts")}
                          >
                            Ouvrir les alertes
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <p className="min-w-0 text-xs text-slate-500">
                      Tester maintenant lance le moteur global d'automatisation
                      existant, pas uniquement ce scénario.
                    </p>
                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[390px]:grid-cols-3 lg:w-auto lg:min-w-[430px]">
                      <Button
                        variant="outline"
                        className="min-h-11 min-w-0 px-3 lg:min-h-0"
                        onClick={() => navigate("/automation")}
                      >
                        <span className="truncate">Annuler</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11 min-w-0 px-3 lg:min-h-0"
                        onClick={handleRunNow}
                        disabled={runNowLoading}
                      >
                        <Play className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {runNowLoading ? "Test..." : "Tester maintenant"}
                        </span>
                      </Button>
                      <Button
                        className="min-h-11 min-w-0 px-3 lg:min-h-0"
                        onClick={handleSave}
                        disabled={!canSave}
                      >
                        <Save className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {saving ? "Sauvegarde..." : "Enregistrer"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </main>
          </div>
        </>
      )}
    </div>
  );
};

const BuilderHeader = ({
  isEditing,
  saving,
  canSave,
  onBack,
  onSave
}: {
  isEditing: boolean;
  saving: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
}) => (
  <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4 md:p-5">
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
            AUTOMATISATION IA
          </p>
          <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">
            Builder
          </Badge>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {isEditing ? "Modifier le scénario" : "Nouveau scénario"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {isEditing
            ? "Ajuste le déclencheur, les conditions et les actions du workflow."
            : "Crée une règle qui détecte un signal client et déclenche la bonne action."}
        </p>
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[390px]:grid-cols-2 lg:w-auto lg:min-w-[360px]">
        <Button
          variant="outline"
          className="min-h-11 min-w-0 px-3 lg:min-h-0"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="sm:hidden">Retour</span>
          <span className="hidden sm:inline">Retour aux automatisations</span>
        </Button>
        <Button
          className="min-h-11 min-w-0 px-3 lg:min-h-0"
          onClick={onSave}
          disabled={!canSave}
        >
          <Save className="h-4 w-4 shrink-0" />
          <span className="truncate">{saving ? "Sauvegarde..." : "Enregistrer"}</span>
        </Button>
      </div>
    </div>
  </section>
);

const WorkflowSummaryCard = ({
  displayName,
  triggerLabel,
  conditionCount,
  actionCount,
  scopeSummary,
  enabled
}: {
  displayName: string;
  triggerLabel: string;
  conditionCount: number;
  actionCount: number;
  scopeSummary: string;
  enabled: boolean;
}) => (
  <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
    <CardContent className="p-3 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Résumé du scénario
          </p>
          <h2 className="mt-1 break-words text-xl font-semibold text-slate-950">
            {displayName}
          </h2>
        </div>
        <Badge
          variant={enabled ? "success" : "warning"}
          className="w-fit shrink-0 px-2.5 py-1"
        >
          {enabled ? (
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          ) : (
            <PauseCircle className="mr-1 h-3.5 w-3.5" />
          )}
          {getWorkflowStatusLabel(enabled)}
        </Badge>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryMetric label="Déclencheur" value={triggerLabel} />
        <SummaryMetric label="Conditions" value={conditionCount} />
        <SummaryMetric label="Actions" value={actionCount} />
        <SummaryMetric label="Portée" value={scopeSummary} />
        <SummaryMetric label="Statut" value={getWorkflowStatusLabel(enabled)} />
      </div>
    </CardContent>
  </Card>
);

const SummaryMetric = ({ label, value, detail }: SummaryMetricProps) => (
  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
      {label}
    </p>
    <p className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-950">
      {value}
    </p>
    {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
  </div>
);

const HelpPanel = () => (
  <Card className="min-w-0 overflow-hidden border-slate-200/80 bg-white shadow-sm">
    <CardHeader className="p-3 pb-0 sm:p-4 sm:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
          <Info className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base">Comment ça marche</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Trois éléments suffisent pour créer un scénario exploitable.
          </p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 p-3 text-sm sm:p-4">
      <HelpRow
        Icon={Zap}
        title="Déclencheur"
        description="Ce qui lance le workflow, par exemple un nouvel avis reçu."
      />
      <HelpRow
        Icon={ShieldCheck}
        title="Conditions"
        description="Les règles qui filtrent les avis réellement concernés."
      />
      <HelpRow
        Icon={BellRing}
        title="Actions"
        description="Ce qu'EGIA prépare ou déclenche quand le signal est confirmé."
      />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Conseil : garde une validation humaine pour les réponses sensibles.
      </div>
    </CardContent>
  </Card>
);

const HelpRow = ({
  Icon,
  title,
  description
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <div className="flex min-w-0 gap-3">
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  </div>
);

const BuilderStepCard = ({
  step,
  title,
  description,
  Icon,
  children,
  action
}: BuilderStepCardProps) => (
  <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
    <CardHeader className="gap-3 p-3 pb-0 sm:p-5 sm:pb-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Étape {step}
            </p>
            <CardTitle className="mt-1 text-base sm:text-lg">{title}</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          </div>
        </div>
        {action && <div className="min-w-0 shrink-0">{action}</div>}
      </div>
    </CardHeader>
    <CardContent className="min-w-0 p-3 sm:p-5">{children}</CardContent>
  </Card>
);

const EmptyBuilderState = ({
  title,
  description,
  tone = "neutral"
}: {
  title: string;
  description: string;
  tone?: "neutral" | "warning";
}) => (
  <div
    className={cn(
      "min-w-0 rounded-2xl border border-dashed p-4 text-sm",
      tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-500"
    )}
  >
    <p className={cn("font-semibold", tone === "warning" ? "text-amber-900" : "text-slate-900")}>
      {title}
    </p>
    <p className="mt-1 text-xs leading-relaxed">{description}</p>
  </div>
);

const ConditionEditorCard = ({
  condition,
  index,
  onUpdate,
  onRemove
}: ConditionEditorCardProps) => (
  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">
          {getConditionSummary(condition)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {getConditionFieldLabel(condition.field)} · {getOperatorLabel(condition.operator)}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="w-full min-w-0 justify-center text-rose-600 hover:bg-rose-50 sm:w-auto"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        <span>Supprimer</span>
      </Button>
    </div>

    <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-3">
      <label className="min-w-0">
        <span className={labelClassName}>Champ</span>
        <select
          className={inputClassName}
          value={condition.field}
          onChange={(event) =>
            onUpdate(index, {
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
      </label>

      <label className="min-w-0">
        <span className={labelClassName}>Opérateur</span>
        <select
          className={inputClassName}
          value={condition.operator}
          onChange={(event) =>
            onUpdate(index, {
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
      </label>

      <label className="min-w-0">
        <span className={labelClassName}>Valeur</span>
        {condition.field === "sentiment" ? (
          <select
            className={inputClassName}
            value={condition.value || "negative"}
            onChange={(event) => onUpdate(index, { value: event.target.value })}
          >
            <option value="negative">Négatif</option>
            <option value="very_negative">Très négatif</option>
          </select>
        ) : (
          <input
            className={inputClassName}
            type="number"
            value={condition.value}
            onChange={(event) => onUpdate(index, { value: event.target.value })}
            placeholder="Valeur"
          />
        )}
      </label>
    </div>
  </div>
);

const ActionEditorCard = ({
  action,
  index,
  onUpdate,
  onRemove
}: ActionEditorCardProps) => (
  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">
          {getActionSummary(action)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Création d'une alerte exploitable dans le centre d'alertes.
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="w-full min-w-0 justify-center text-rose-600 hover:bg-rose-50 sm:w-auto"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        <span>Supprimer</span>
      </Button>
    </div>

    <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-4">
      <label className="min-w-0">
        <span className={labelClassName}>Action</span>
        <select
          className={inputClassName}
          value={action.action_type}
          onChange={(event) =>
            onUpdate(index, {
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
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className={labelClassName}>Type</span>
        <select
          className={inputClassName}
          value={action.params.alert_type}
          onChange={(event) =>
            onUpdate(index, {
              params: {
                ...action.params,
                alert_type: event.target.value as ActionInput["params"]["alert_type"]
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
      </label>

      <label className="min-w-0">
        <span className={labelClassName}>Priorité</span>
        <select
          className={inputClassName}
          value={action.params.severity}
          onChange={(event) =>
            onUpdate(index, {
              params: {
                ...action.params,
                severity: event.target.value as ActionInput["params"]["severity"]
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
      </label>

      <label className="min-w-0">
        <span className={labelClassName}>Pause entre alertes</span>
        <input
          className={inputClassName}
          type="number"
          min={1}
          value={action.params.cooldown_hours}
          onChange={(event) =>
            onUpdate(index, {
              params: {
                ...action.params,
                cooldown_hours: Number(event.target.value || 0)
              }
            })
          }
        />
      </label>
    </div>
  </div>
);

export { AutomationBuilder };
