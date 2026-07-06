// Checklist non-regression (/automation):
// - "Créer manuellement" ouvre le builder
// - Templates ouvrent le builder avec preset
// - "Configurer" ouvre le builder pour l'ID
// - Toggle ON/OFF persiste
// - "Lancer maintenant" conserve l'appel global /api/reports/automations
// - Aucun mock/localStorage
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Clock3,
  PauseCircle,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Zap
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";

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
  location_id?: string | null;
  location_ids: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AutomationConditionRow = {
  id?: string;
  workflow_id: string;
  field: string | null;
  operator: string | null;
  value: string | null;
  label?: string | null;
  value_jsonb?: unknown;
};

type AutomationActionRow = {
  id?: string;
  workflow_id: string;
  type?: string | null;
  config?: unknown;
  action_type?: string | null;
  params?: unknown;
  label?: string | null;
};

type AutomationAlertRow = {
  id: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  alert_type?: string | null;
  rule_code?: string | null;
  rule_label?: string | null;
  severity?: "low" | "medium" | "high" | string | null;
  source?: string | null;
  triggered_at?: string | null;
  last_notified_at?: string | null;
  resolved_at?: string | null;
  payload?: Record<string, unknown> | null;
};

type AutomationRunResult = {
  processed?: number;
  inserted?: number;
  skippedCooldown?: number;
  skippedNoSentiment?: number;
  last_cursor?: string | null;
};

type AlertsQueryResult = {
  data: AutomationAlertRow[] | null;
  error: { message?: string } | null;
  count: number | null;
};

type UntypedAlertsClient = {
  from: (table: "alerts") => {
    select: (
      columns: string,
      options?: { count?: "exact" }
    ) => {
      eq: (column: string, value: string) => {
        or: (filters: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean; nullsFirst?: boolean }
          ) => {
            limit: (count: number) => Promise<AlertsQueryResult>;
          };
        };
      };
    };
  };
};

type WorkflowFilter =
  | "all"
  | "active"
  | "paused"
  | "low_rating"
  | "no_reply"
  | "sentiment";

type EnrichedWorkflow = {
  workflow: WorkflowRow;
  conditions: AutomationConditionRow[];
  actions: AutomationActionRow[];
  displayName: string;
  isDraftLike: boolean;
  locationLabel: string;
  triggerLabel: string;
  conditionSummary: string;
  actionSummary: string;
  priorityRank: number;
  latestActivity: AutomationAlertRow | null;
};

type TemplateCard = {
  id: string;
  title: string;
  description: string;
  label: string;
  category: string;
  impact: string;
  Icon: typeof Sparkles;
};

type AutomationKpiCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "dark" | "green" | "amber" | "blue";
  Icon: typeof Activity;
};

type WorkflowToggleProps = {
  workflow: WorkflowRow;
  onToggle: (workflow: WorkflowRow, enabled: boolean) => void;
};

const templateCards: TemplateCard[] = [
  {
    id: "vip",
    title: "Fidélisation VIP",
    description: "Repérer les avis 5 étoiles et créer un signal à valoriser.",
    label: "Avis 5★",
    category: "Fidélisation",
    impact: "Engagement client",
    Icon: Star
  },
  {
    id: "social",
    title: "Social Booster 5★",
    description: "Surveiller les meilleurs avis pour alimenter vos contenus.",
    label: "Alerte IA",
    category: "Réputation",
    impact: "Visibilité",
    Icon: Sparkles
  },
  {
    id: "recovery",
    title: "Récupération client",
    description: "Déclencher une alerte haute priorité sur les notes faibles.",
    label: "Note basse",
    category: "Priorité",
    impact: "Win-back",
    Icon: AlertTriangle
  },
  {
    id: "autopilot",
    title: "Pilote automatique",
    description: "Créer un signal lorsque les avis restent sans réponse.",
    label: "Sans réponse",
    category: "Opérations",
    impact: "Réactivité",
    Icon: Zap
  }
];

const filterLabels: Record<WorkflowFilter, string> = {
  all: "Tous",
  active: "Actifs",
  paused: "En pause",
  low_rating: "Note basse",
  no_reply: "Sans réponse",
  sentiment: "Sentiment"
};

const triggerLabels: Record<string, string> = {
  new_review: "Nouvel avis reçu"
};

const alertTypeLabels: Record<string, string> = {
  LOW_RATING: "Note basse",
  NO_REPLY: "Sans réponse",
  NEGATIVE_SENTIMENT: "Sentiment négatif",
  RATING_DROP: "Baisse réputation"
};

const severityLabels: Record<string, string> = {
  high: "Haute",
  medium: "Moyenne",
  low: "Faible"
};

const severityClasses: Record<string, string> = {
  high: "border-rose-200 bg-rose-50 text-rose-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600"
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const isWorkflowDraftLike = (name: string | null | undefined) => {
  const normalized = normalizeText(name ?? "");
  if (!normalized) return true;
  return (
    /^test\s*\d*$/.test(normalized) ||
    normalized === "workflow sans nom" ||
    normalized === "automatisation"
  );
};

const normalizeWorkflowName = (name: string | null | undefined) =>
  isWorkflowDraftLike(name) ? "Scénario personnalisé" : name?.trim() ?? "";

const getTriggerLabel = (trigger: string | null | undefined) =>
  trigger ? triggerLabels[trigger] ?? trigger : "Déclencheur non défini";

const getRecordValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return "";
};

const getConditionValue = (condition: AutomationConditionRow) =>
  getRecordValue(condition.value_jsonb ?? condition.value);

const formatOperator = (operator: string | null | undefined) => {
  if (operator === "gte") return "≥";
  if (operator === "lte") return "≤";
  if (operator === "eq") return "=";
  return operator ?? "";
};

const describeCondition = (condition: AutomationConditionRow) => {
  const field = condition.field ?? "";
  const value = getConditionValue(condition);
  const operator = formatOperator(condition.operator);

  if (field === "rating") {
    return value ? `Note ${operator} ${value}★` : "Note";
  }
  if (field === "no_reply_hours") {
    return value ? `Sans réponse depuis ${value} h` : "Sans réponse";
  }
  if (field === "sentiment") {
    return "Sentiment négatif";
  }
  return condition.label ?? (field || "Condition");
};

const getConditionSummary = (conditions: AutomationConditionRow[]) => {
  if (conditions.length === 0) return "Tous les nouveaux avis";
  const parts = conditions.map(describeCondition).filter(Boolean);
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts.slice(0, 2).join(" · ")} · +${parts.length - 2}`;
};

const readRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const getActionParams = (action: AutomationActionRow) => {
  const params = readRecord(action.params);
  if (Object.keys(params).length > 0) return params;
  return readRecord(action.config);
};

const getActionType = (action: AutomationActionRow) =>
  action.action_type ?? action.type ?? "";

const describeAction = (action: AutomationActionRow) => {
  const actionType = getActionType(action);
  const params = getActionParams(action);
  if (actionType !== "create_alert") {
    return action.label ?? (actionType || "Action");
  }
  const alertType = getRecordValue(params.alert_type) || "LOW_RATING";
  const severity = getRecordValue(params.severity) || "medium";
  const typeLabel = alertTypeLabels[alertType] ?? alertType;
  const severityLabel = severityLabels[severity] ?? severity;
  return `Alerte ${typeLabel.toLowerCase()} · ${severityLabel}`;
};

const getActionSummary = (actions: AutomationActionRow[]) => {
  if (actions.length === 0) return "Aucune action configurée";
  const parts = actions.map(describeAction).filter(Boolean);
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts.slice(0, 2).join(" · ")} · +${parts.length - 2}`;
};

const hasLowRatingSignal = (
  conditions: AutomationConditionRow[],
  actions: AutomationActionRow[]
) =>
  conditions.some((condition) => {
    if (condition.field !== "rating") return false;
    const target = Number(getConditionValue(condition));
    return (
      condition.operator === "lte" ||
      (!Number.isNaN(target) && target <= 3)
    );
  }) ||
  actions.some((action) => {
    const params = getActionParams(action);
    return getRecordValue(params.alert_type) === "LOW_RATING";
  });

const hasNoReplySignal = (
  conditions: AutomationConditionRow[],
  actions: AutomationActionRow[]
) =>
  conditions.some((condition) => condition.field === "no_reply_hours") ||
  actions.some((action) => {
    const params = getActionParams(action);
    return getRecordValue(params.alert_type) === "NO_REPLY";
  });

const hasSentimentSignal = (
  conditions: AutomationConditionRow[],
  actions: AutomationActionRow[]
) =>
  conditions.some((condition) => condition.field === "sentiment") ||
  actions.some((action) => {
    const params = getActionParams(action);
    return getRecordValue(params.alert_type) === "NEGATIVE_SENTIMENT";
  });

const getWorkflowPriorityRank = (
  workflow: WorkflowRow,
  conditions: AutomationConditionRow[],
  actions: AutomationActionRow[]
) => {
  let rank = workflow.enabled ? 100 : 0;
  if (hasLowRatingSignal(conditions, actions)) rank += 35;
  if (hasSentimentSignal(conditions, actions)) rank += 30;
  if (hasNoReplySignal(conditions, actions)) rank += 25;

  for (const action of actions) {
    const params = getActionParams(action);
    const severity = getRecordValue(params.severity);
    if (severity === "high") rank += 30;
    if (severity === "medium") rank += 15;
  }

  return rank;
};

const getWorkflowLocationLabel = (
  workflow: WorkflowRow,
  locations: AutomationProps["locations"],
  locationsLoading = false,
  locationsError: string | null = null
) => {
  if (locationsLoading) return "Établissements en cours";
  if (locationsError) return "Établissements indisponibles";

  const ids = workflow.location_ids?.filter(Boolean) ?? [];
  const fallbackId = workflow.location_id ?? null;
  const targetIds = ids.length > 0 ? ids : fallbackId ? [fallbackId] : [];
  if (targetIds.length === 0) return "Tous les établissements";

  const labels = targetIds
    .map((id) => {
      const match = locations.find(
        (loc) => loc.id === id || loc.location_resource_name === id
      );
      return match?.location_title ?? match?.location_resource_name ?? null;
    })
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) return "Établissement ciblé";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1}`;
};

const getTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatRelativeTime = (isoDate: string | null | undefined) => {
  if (!isoDate) return "Aucun";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Aucun";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "à l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays} j`;
  const diffMonths = Math.floor(diffDays / 30);
  return `il y a ${diffMonths} mois`;
};

const getAlertSignalLabel = (alert: AutomationAlertRow) => {
  const source = alert.alert_type ?? alert.rule_code ?? "";
  return alertTypeLabels[source] ?? alert.rule_label ?? (source || "Signal");
};

const getAlertDate = (alert: AutomationAlertRow) =>
  alert.last_notified_at ?? alert.triggered_at ?? null;

const fetchAutomationAlerts = async (userId: string) => {
  try {
    const alertsClient = supabase as unknown as UntypedAlertsClient;
    const { data, error, count } = await alertsClient
      .from("alerts")
      .select(
        "id,workflow_id,workflow_name,alert_type,rule_code,rule_label,severity,source,triggered_at,last_notified_at,resolved_at,payload",
        { count: "exact" }
      )
      .eq("user_id", userId)
      .or("source.eq.automations,workflow_id.not.is.null")
      .order("triggered_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      return { available: false, alerts: [] as AutomationAlertRow[], count: null };
    }

    return {
      available: true,
      alerts: data ?? [],
      count: typeof count === "number" ? count : data?.length ?? 0
    };
  } catch {
    return { available: false, alerts: [] as AutomationAlertRow[], count: null };
  }
};

const AutomationKpiCard = ({
  label,
  value,
  detail,
  tone = "dark",
  Icon
}: AutomationKpiCardProps) => {
  const toneClass = {
    dark: "bg-slate-950 text-white border-slate-950",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100"
  }[tone];

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-semibold leading-none text-slate-950 sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
            toneClass
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {detail && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">
          {detail}
        </p>
      )}
    </div>
  );
};

const WorkflowToggle = ({ workflow, onToggle }: WorkflowToggleProps) => {
  const enabled = Boolean(workflow.enabled);
  return (
    <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
      <span>{enabled ? "ON" : "OFF"}</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onToggle(workflow, event.target.checked)}
        className="sr-only"
        aria-label={enabled ? "Désactiver le scénario" : "Activer le scénario"}
      />
      <span
        className={cn(
          "relative h-6 w-11 rounded-full border transition",
          enabled
            ? "border-emerald-200 bg-emerald-500"
            : "border-slate-200 bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition",
            enabled ? "left-5" : "left-0.5"
          )}
        />
      </span>
    </label>
  );
};

const TemplateCardButton = ({
  template,
  onClick
}: {
  template: TemplateCard;
  onClick: () => void;
}) => {
  const Icon = template.Icon;
  return (
    <button
      type="button"
      className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-4"
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-900">
          <Icon className="h-4 w-4" />
        </span>
        <Badge className="min-w-0 max-w-full truncate px-2 py-0.5 text-[11px]">
          {template.label}
        </Badge>
      </div>
      <p className="mt-3 truncate text-sm font-semibold text-slate-950">
        {template.title}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
        {template.description}
      </p>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className="rounded-full bg-slate-50 px-2 py-1">
          {template.category}
        </span>
        <span className="rounded-full bg-slate-50 px-2 py-1">
          {template.impact}
        </span>
      </div>
    </button>
  );
};

const PriorityWorkflowCard = ({
  item,
  onConfigure,
  onToggle
}: {
  item: EnrichedWorkflow;
  onConfigure: () => void;
  onToggle: (workflow: WorkflowRow, enabled: boolean) => void;
}) => (
  <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge
            variant={item.workflow.enabled ? "success" : "neutral"}
            className="px-2 py-0.5 text-[11px]"
          >
            {item.workflow.enabled ? "Actif" : "En pause"}
          </Badge>
          {item.isDraftLike && (
            <Badge variant="warning" className="px-2 py-0.5 text-[11px]">
              À configurer
            </Badge>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">
            {item.displayName}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {item.conditionSummary} · {item.actionSummary}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] font-medium text-slate-500">
          <span className="min-w-0 max-w-full truncate rounded-full bg-slate-50 px-2 py-1">
            {item.locationLabel}
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-1">
            {item.triggerLabel}
          </span>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:shrink-0 sm:flex-col sm:items-end">
        <WorkflowToggle workflow={item.workflow} onToggle={onToggle} />
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-0 px-3 text-xs"
          onClick={onConfigure}
        >
          Configurer
        </Button>
      </div>
    </div>
  </div>
);

const WorkflowFilters = ({
  activeFilter,
  counts,
  onChange
}: {
  activeFilter: WorkflowFilter;
  counts: Record<WorkflowFilter, number>;
  onChange: (filter: WorkflowFilter) => void;
}) => (
  <div className="min-w-0 max-w-full overflow-x-auto pb-1">
    <div className="flex min-w-0 gap-1.5">
      {(Object.keys(filterLabels) as WorkflowFilter[]).map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:py-1.5 sm:text-xs",
            activeFilter === filter
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-950"
          )}
        >
          {filterLabels[filter]}{" "}
          <span className="opacity-70">{counts[filter]}</span>
        </button>
      ))}
    </div>
  </div>
);

const WorkflowListItem = ({
  item,
  onConfigure,
  onToggle
}: {
  item: EnrichedWorkflow;
  onConfigure: () => void;
  onToggle: (workflow: WorkflowRow, enabled: boolean) => void;
}) => (
  <div className="min-w-0 max-w-full border-t border-slate-100 px-3 py-3 first:border-t-0 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px_120px] md:items-center md:gap-4 md:px-5">
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-slate-950">
          {item.displayName}
        </p>
        {item.isDraftLike && (
          <Badge variant="warning" className="hidden px-2 py-0.5 text-[11px] sm:inline-flex">
            À configurer
          </Badge>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">
        {item.triggerLabel}
      </p>
    </div>

    <p className="mt-2 line-clamp-1 text-xs text-slate-600 md:mt-0">
      {item.conditionSummary}
    </p>
    <p className="mt-1 line-clamp-1 text-xs text-slate-600 md:mt-0">
      {item.actionSummary}
    </p>
    <p className="mt-1 truncate text-xs text-slate-500 md:mt-0">
      {item.locationLabel}
    </p>

    <div className="mt-2 md:mt-0">
      <Badge
        variant={item.workflow.enabled ? "success" : "neutral"}
        className="px-2 py-0.5 text-[11px]"
      >
        {item.workflow.enabled ? "Actif" : "En pause"}
      </Badge>
    </div>

    <div className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 md:mt-0 md:grid-cols-1 md:justify-items-end">
      <WorkflowToggle workflow={item.workflow} onToggle={onToggle} />
      <Button
        variant="outline"
        size="sm"
        className="h-8 min-w-0 px-3 text-xs"
        onClick={onConfigure}
      >
        Configurer
      </Button>
    </div>
  </div>
);

const AutomationActivityItem = ({
  alert,
  fallbackName
}: {
  alert: AutomationAlertRow;
  fallbackName: string;
}) => {
  const severity = alert.severity ?? "medium";
  const status = alert.resolved_at ? "Traité" : "Ouvert";
  const workflowName =
    normalizeWorkflowName(alert.workflow_name) ||
    normalizeWorkflowName(fallbackName) ||
    "Pilote automatique";

  return (
    <div className="min-w-0 border-t border-slate-100 px-3 py-3 first:border-t-0 sm:px-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">
            {workflowName}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {getAlertSignalLabel(alert)} · {formatRelativeTime(getAlertDate(alert))}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={cn("px-2 py-0.5 text-[11px]", severityClasses[severity] ?? severityClasses.medium)}>
            {severityLabels[severity] ?? severity}
          </Badge>
          <span className="text-[11px] font-medium text-slate-400">{status}</span>
        </div>
      </div>
    </div>
  );
};

const Automation = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: AutomationProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [conditionsByWorkflow, setConditionsByWorkflow] = useState<
    Record<string, AutomationConditionRow[]>
  >({});
  const [actionsByWorkflow, setActionsByWorkflow] = useState<
    Record<string, AutomationActionRow[]>
  >({});
  const [automationAlerts, setAutomationAlerts] = useState<AutomationAlertRow[]>([]);
  const [automationAlertCount, setAutomationAlertCount] = useState<number | null>(
    null
  );
  const [alertsAvailable, setAlertsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AutomationRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<WorkflowFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setToggleError(null);
      const { data, error: queryError } = await supabase
        .from("automation_workflows")
        .select("id,name,enabled,trigger,location_id,location_ids,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (queryError) {
        setError("Impossible de charger les automatisations.");
        setWorkflows([]);
        setConditionsByWorkflow({});
        setActionsByWorkflow({});
        setLoading(false);
        return;
      }

      const nextWorkflows = ((data ?? []) as unknown as WorkflowRow[]);
      setWorkflows(nextWorkflows);
      queryClient.setQueryData(
        ["coach-automation-count", session.user.id],
        nextWorkflows.filter((item) => item.enabled === true).length
      );

      const workflowIds = nextWorkflows.map((workflow) => workflow.id);
      if (workflowIds.length > 0) {
        const [conditionsRes, actionsRes] = await Promise.all([
          supabase
            .from("automation_conditions")
            .select("*")
            .in("workflow_id", workflowIds),
          supabase
            .from("automation_actions")
            .select("*")
            .in("workflow_id", workflowIds)
        ]);
        if (cancelled) return;

        if (conditionsRes.error || actionsRes.error) {
          setError("Impossible de charger les règles des automatisations.");
          setConditionsByWorkflow({});
          setActionsByWorkflow({});
          setLoading(false);
          return;
        }

        const nextConditions = ((conditionsRes.data ?? []) as unknown as AutomationConditionRow[]);
        const nextActions = ((actionsRes.data ?? []) as unknown as AutomationActionRow[]);
        setConditionsByWorkflow(
          nextConditions.reduce<Record<string, AutomationConditionRow[]>>(
            (acc, condition) => {
              const list = acc[condition.workflow_id] ?? [];
              list.push(condition);
              acc[condition.workflow_id] = list;
              return acc;
            },
            {}
          )
        );
        setActionsByWorkflow(
          nextActions.reduce<Record<string, AutomationActionRow[]>>(
            (acc, action) => {
              const list = acc[action.workflow_id] ?? [];
              list.push(action);
              acc[action.workflow_id] = list;
              return acc;
            },
            {}
          )
        );
      } else {
        setConditionsByWorkflow({});
        setActionsByWorkflow({});
      }

      const alertsResult = await fetchAutomationAlerts(session.user.id);
      if (cancelled) return;
      setAlertsAvailable(alertsResult.available);
      setAutomationAlerts(alertsResult.alerts);
      setAutomationAlertCount(alertsResult.count);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryClient, session]);

  const handleToggle = async (workflow: WorkflowRow, enabled: boolean) => {
    if (!session) return;
    setToggleError(null);
    const previousWorkflows = workflows;
    const nextWorkflows = workflows.map((item) =>
      item.id === workflow.id ? { ...item, enabled } : item
    );
    setWorkflows(nextWorkflows);
    queryClient.setQueryData(
      ["coach-automation-count", session.user.id],
      nextWorkflows.filter((item) => item.enabled === true).length
    );

    const { error: updateError } = await supabase
      .from("automation_workflows")
      .update({ enabled })
      .eq("id", workflow.id)
      .eq("user_id", session.user.id);

    if (updateError) {
      setWorkflows(previousWorkflows);
      setToggleError("Impossible de modifier ce scénario pour le moment.");
      queryClient.setQueryData(
        ["coach-automation-count", session.user.id],
        previousWorkflows.filter((item) => item.enabled === true).length
      );
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: ["coach-automation-count", session.user.id]
    });
  };

  const handleRunNow = async () => {
    if (!session) return;
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
      const payload = (await response.json()) as AutomationRunResult;
      setRunResult(payload);
      setRunError(null);

      const alertsResult = await fetchAutomationAlerts(session.user.id);
      setAlertsAvailable(alertsResult.available);
      setAutomationAlerts(alertsResult.alerts);
      setAutomationAlertCount(alertsResult.count);
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
    () => workflows.filter((item) => item.enabled === true),
    [workflows]
  );

  const pausedWorkflows = useMemo(
    () => workflows.filter((item) => item.enabled !== true),
    [workflows]
  );

  const latestAlertByWorkflow = useMemo(() => {
    return automationAlerts.reduce<Record<string, AutomationAlertRow>>(
      (acc, alert) => {
        if (!alert.workflow_id) return acc;
        const current = acc[alert.workflow_id];
        if (!current || getTimestamp(getAlertDate(alert)) > getTimestamp(getAlertDate(current))) {
          acc[alert.workflow_id] = alert;
        }
        return acc;
      },
      {}
    );
  }, [automationAlerts]);

  const enrichedWorkflows = useMemo<EnrichedWorkflow[]>(() => {
    return workflows.map((workflow) => {
      const conditions = conditionsByWorkflow[workflow.id] ?? [];
      const actions = actionsByWorkflow[workflow.id] ?? [];
      return {
        workflow,
        conditions,
        actions,
        displayName: normalizeWorkflowName(workflow.name),
        isDraftLike: isWorkflowDraftLike(workflow.name),
        locationLabel: getWorkflowLocationLabel(
          workflow,
          locations,
          locationsLoading,
          locationsError
        ),
        triggerLabel: getTriggerLabel(workflow.trigger),
        conditionSummary: getConditionSummary(conditions),
        actionSummary: getActionSummary(actions),
        priorityRank: getWorkflowPriorityRank(workflow, conditions, actions),
        latestActivity: latestAlertByWorkflow[workflow.id] ?? null
      };
    });
  }, [
    actionsByWorkflow,
    conditionsByWorkflow,
    latestAlertByWorkflow,
    locations,
    locationsError,
    locationsLoading,
    workflows
  ]);

  const filterCounts = useMemo<Record<WorkflowFilter, number>>(() => {
    const counts: Record<WorkflowFilter, number> = {
      all: enrichedWorkflows.length,
      active: 0,
      paused: 0,
      low_rating: 0,
      no_reply: 0,
      sentiment: 0
    };
    for (const item of enrichedWorkflows) {
      if (item.workflow.enabled === true) counts.active += 1;
      if (item.workflow.enabled !== true) counts.paused += 1;
      if (hasLowRatingSignal(item.conditions, item.actions)) counts.low_rating += 1;
      if (hasNoReplySignal(item.conditions, item.actions)) counts.no_reply += 1;
      if (hasSentimentSignal(item.conditions, item.actions)) counts.sentiment += 1;
    }
    return counts;
  }, [enrichedWorkflows]);

  const priorityWorkflows = useMemo(() => {
    return enrichedWorkflows
      .slice()
      .sort((a, b) => {
        const rankDiff = b.priorityRank - a.priorityRank;
        if (rankDiff !== 0) return rankDiff;
        return getTimestamp(b.workflow.updated_at) - getTimestamp(a.workflow.updated_at);
      })
      .slice(0, 3);
  }, [enrichedWorkflows]);

  const filteredWorkflows = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    return enrichedWorkflows.filter((item) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "active" && item.workflow.enabled === true) ||
        (activeFilter === "paused" && item.workflow.enabled !== true) ||
        (activeFilter === "low_rating" &&
          hasLowRatingSignal(item.conditions, item.actions)) ||
        (activeFilter === "no_reply" &&
          hasNoReplySignal(item.conditions, item.actions)) ||
        (activeFilter === "sentiment" &&
          hasSentimentSignal(item.conditions, item.actions));
      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;
      return normalizeText(
        [
          item.displayName,
          item.conditionSummary,
          item.actionSummary,
          item.locationLabel,
          item.triggerLabel
        ].join(" ")
      ).includes(normalizedSearch);
    });
  }, [activeFilter, enrichedWorkflows, searchTerm]);

  const sortedWorkflows = useMemo(() => {
    return filteredWorkflows.slice().sort((a, b) => {
      const enabledDiff =
        Number(b.workflow.enabled === true) - Number(a.workflow.enabled === true);
      if (enabledDiff !== 0) return enabledDiff;
      const rankDiff = b.priorityRank - a.priorityRank;
      if (rankDiff !== 0) return rankDiff;
      return getTimestamp(b.workflow.updated_at) - getTimestamp(a.workflow.updated_at);
    });
  }, [filteredWorkflows]);

  const latestSignal =
    automationAlerts
      .slice()
      .sort((a, b) => getTimestamp(getAlertDate(b)) - getTimestamp(getAlertDate(a)))[0] ??
    null;
  const latestSignalDate = getAlertDate(latestSignal ?? {});
  const latestSignalLabel =
    latestSignalDate ?? runResult?.last_cursor ?? null;

  const alertsReadable = alertsAvailable && automationAlertCount !== null;
  const headerAlertText =
    alertsReadable
      ? `${automationAlertCount} alertes générées`
      : "alertes non disponibles";

  return (
    <div className="automation-page min-w-0 max-w-full space-y-4 overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-6 lg:pb-4">
      {/* Non-regression checklist:
         - Créer manuellement -> ouvre /automation/builder
         - Templates -> ouvrent /automation/builder?template=...
         - Configurer -> ouvre /automation/builder?id=...
         - Toggle ON/OFF -> persiste et se reflète
         - Lancer maintenant -> conserve l'appel global /api/reports/automations
      */}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4 md:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                AUTOMATISATIONS
              </p>
              <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">
                Bêta privée
              </Badge>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Pilote automatique IA
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeWorkflows.length} actifs · {pausedWorkflows.length} en pause ·{" "}
              {headerAlertText}
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[390px]:grid-cols-2 lg:w-auto lg:min-w-[320px]">
            <Button
              variant="outline"
              onClick={handleRunNow}
              disabled={running}
              className="min-h-11 min-w-0 px-3 text-sm lg:min-h-0"
            >
              <Play className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {running ? "Exécution..." : "Lancer maintenant"}
              </span>
            </Button>
            <Button
              onClick={() => navigate("/automation/builder")}
              className="min-h-11 min-w-0 px-3 text-sm lg:min-h-0"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Créer un scénario</span>
            </Button>
          </div>
        </div>
      </section>

      {(runError || runResult || toggleError) && (
        <Card className="min-w-0 overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="p-3 sm:p-4">
            {runError || toggleError ? (
              <p className="text-sm font-medium text-rose-600">
                {runError ?? toggleError}
              </p>
            ) : (
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-700">
                    Automatisation exécutée.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Avis traités : {runResult?.processed ?? 0} · Alertes :{" "}
                    {runResult?.inserted ?? 0} · Cooldown :{" "}
                    {runResult?.skippedCooldown ?? 0}
                    {typeof runResult?.skippedNoSentiment === "number"
                      ? ` · Sentiment manquant : ${runResult.skippedNoSentiment}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-10 w-full sm:w-auto sm:min-h-0"
                  onClick={() => navigate("/alerts")}
                >
                  Voir les alertes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <AutomationKpiCard
            label="Scénarios actifs"
            value={activeWorkflows.length}
            detail="En surveillance"
            Icon={ShieldCheck}
            tone="green"
          />
          <AutomationKpiCard
            label="En pause"
            value={pausedWorkflows.length}
            detail="Désactivés"
            Icon={PauseCircle}
            tone="amber"
          />
          <AutomationKpiCard
            label="Alertes générées"
            value={alertsReadable ? automationAlertCount : "—"}
            detail={alertsReadable ? "Depuis les signaux disponibles" : "Lecture indisponible"}
            Icon={BellRing}
            tone="blue"
          />
          <AutomationKpiCard
            label="Dernier signal"
            value={formatRelativeTime(latestSignalLabel)}
            detail={latestSignal ? getAlertSignalLabel(latestSignal) : "Aucune activité récente"}
            Icon={Clock3}
            tone="dark"
          />
        </div>
      )}

      <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="p-3 pb-0 sm:p-5 sm:pb-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">À surveiller</CardTitle>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Les scénarios les plus sensibles, classés par signal métier.
              </p>
            </div>
            <Badge variant="neutral" className="shrink-0 px-2 py-0.5 text-[11px]">
              {priorityWorkflows.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-3 sm:p-5">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : priorityWorkflows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              <p className="font-semibold text-slate-800">Aucun scénario à surveiller</p>
              <p className="mt-1 text-xs">
                Créez un premier scénario pour activer le pilotage automatique.
              </p>
            </div>
          ) : (
            priorityWorkflows.map((item) => (
              <PriorityWorkflowCard
                key={item.workflow.id}
                item={item}
                onToggle={handleToggle}
                onConfigure={() => navigate(`/automation/builder?id=${item.workflow.id}`)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <section className="min-w-0 space-y-3">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">
              Modèles prêts à l'emploi
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Démarrer un scénario préconfiguré, puis valider ses règles.
            </p>
          </div>
        </div>
        {templateCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Aucun modèle disponible pour le moment.
          </div>
        ) : (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {templateCards.map((template) => (
              <TemplateCardButton
                key={template.id}
                template={template}
                onClick={() => navigate(`/automation/builder?template=${template.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="gap-3 p-3 pb-0 sm:p-5 sm:pb-0">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Tous les scénarios</CardTitle>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Pilotez les règles actives, en pause et les signaux sensibles.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_220px] xl:w-[620px]">
              <WorkflowFilters
                activeFilter={activeFilter}
                counts={filterCounts}
                onChange={setActiveFilter}
              />
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-9 w-full min-w-0 rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-500/10"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Rechercher"
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 px-0 pb-0 pt-3 sm:pt-4">
          {loading ? (
            <div className="space-y-2 px-3 pb-3 sm:px-5 sm:pb-5">
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <div className="mx-3 mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 sm:mx-5 sm:mb-5">
              {error}
            </div>
          ) : workflows.length === 0 ? (
            <div className="mx-3 mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 sm:mx-5 sm:mb-5">
              <p className="font-semibold text-slate-800">
                Aucun scénario configuré
              </p>
              <p className="mt-1 text-xs">
                Créez votre première règle pour déclencher des alertes utiles.
              </p>
              <Button
                size="sm"
                className="mt-4 min-h-10"
                onClick={() => navigate("/automation/builder")}
              >
                Créer un scénario
              </Button>
            </div>
          ) : sortedWorkflows.length === 0 ? (
            <div className="mx-3 mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 sm:mx-5 sm:mb-5">
              <p className="font-semibold text-slate-800">Aucun résultat</p>
              <p className="mt-1 text-xs">
                Aucun scénario ne correspond à ce filtre.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden border-t border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px_120px] md:gap-4">
                <span>Scénario</span>
                <span>Signal</span>
                <span>Action</span>
                <span>Portée</span>
                <span>Statut</span>
                <span className="text-right">Actions</span>
              </div>
              <div>
                {sortedWorkflows.map((item) => (
                  <WorkflowListItem
                    key={item.workflow.id}
                    item={item}
                    onToggle={handleToggle}
                    onConfigure={() =>
                      navigate(`/automation/builder?id=${item.workflow.id}`)
                    }
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="p-3 pb-0 sm:p-5 sm:pb-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Activité récente</CardTitle>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Alertes réellement générées par le pilote automatique.
              </p>
            </div>
            <Badge variant="neutral" className="shrink-0 px-2 py-0.5 text-[11px]">
              {alertsReadable ? automationAlerts.length : "—"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-3 sm:pt-4">
          {loading ? (
            <div className="space-y-2 px-3 pb-3 sm:px-5 sm:pb-5">
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
            </div>
          ) : alertsAvailable && automationAlerts.length > 0 ? (
            automationAlerts.slice(0, 5).map((alert) => (
              <AutomationActivityItem
                key={alert.id}
                alert={alert}
                fallbackName={
                  enrichedWorkflows.find(
                    (item) => item.workflow.id === alert.workflow_id
                  )?.displayName ?? "Pilote automatique"
                }
              />
            ))
          ) : !alertsAvailable && runResult ? (
            <div className="mx-3 mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 sm:mx-5 sm:mb-5">
              <p className="font-semibold">Dernière exécution manuelle</p>
              <p className="mt-1 text-xs">
                Avis traités : {runResult.processed ?? 0} · Alertes :{" "}
                {runResult.inserted ?? 0} · Cooldown :{" "}
                {runResult.skippedCooldown ?? 0}
              </p>
            </div>
          ) : (
            <div className="mx-3 mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 sm:mx-5 sm:mb-5">
              <p className="font-semibold text-slate-800">
                Aucune activité enregistrée pour le moment
              </p>
              <p className="mt-1 text-xs">
                Les prochaines alertes générées par le pilote automatique
                apparaîtront ici.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-xs text-slate-500">
        <Activity className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0">
          Les scénarios avancés restent configurables depuis le builder.
        </span>
      </div>

      {/* How to test:
         1) Creer manuellement -> ouvre /automation/builder.
         2) Cliquer un template -> ouvre /automation/builder?template=....
         3) Configurer -> ouvre /automation/builder?id=....
         4) Toggle ON/OFF -> persiste et se reflète apres refresh.
         5) Lancer maintenant -> appelle /api/reports/automations.
      */}
    </div>
  );
};

export { Automation };
