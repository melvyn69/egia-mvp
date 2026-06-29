import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Filter,
  LineChart,
  Lightbulb,
  ListChecks,
  MapPin,
  MessageSquareReply,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";
import type { AnalyticsDrilldown } from "../types/analytics";
import { analyticsQueryKey, fetchAnalyticsBundle } from "../queries/analytics";

type AnalyticsProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

type TrendState = "up" | "down" | "stable" | "none";
type MetricKey = "reviews" | "avg_rating" | "neg_share" | "reply_rate";
type KpiPanelKey = "reviews" | "avg_rating" | "reply_rate" | "reply_delay" | "neg_share" | "sentiment";
type DecisionLevel = "high" | "watch" | "ok";
type AnalyticsPoint = {
  date: string;
  review_count: number;
  avg_rating: number | null;
  neg_share: number | null;
  reply_rate: number | null;
};
type DecisionItem = {
  id: string;
  level: DecisionLevel;
  title: string;
  action: string;
  evidence: string;
  reason: string;
  consequence: string;
};
type AssistantListItem = {
  id: string;
  title: string;
  detail: string;
  action?: string;
};
type TodayBriefMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  Icon: typeof BarChart3;
  tone: "neutral" | "good" | "warn";
};
type TodayTask = {
  id: string;
  title: string;
  detail: string;
  action?: string;
  path?: string;
  tone: "neutral" | "good" | "warn";
};
type MultiLocationInsightCard = {
  id: string;
  title: string;
  detail: string;
  Icon: typeof BarChart3;
};
type AnalyticsTopic = {
  id: string;
  label: string;
  count: number;
  share_pct: number | null;
  net_sentiment: number | null;
  delta: number | null;
  delta_pct: number | null;
  source?: "ai" | "manual";
  tag_ids?: string[];
  tone: "positive" | "negative" | "neutral";
};
type AiSkillCard = {
  id: string;
  title: string;
  badge: string;
  Icon: typeof Sparkles;
  tone: "dark" | "good" | "warn" | "neutral";
  status: "active" | "empty" | "soon";
  items: Array<{ label: string; detail?: string }>;
  emptyLabel: string;
};

const defineAiSkill = (skill: AiSkillCard): AiSkillCard => skill;

const EMPTY_ANALYSIS = "Pas encore assez de données pour cette analyse.";

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatRating = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}/5`;

const formatRatio = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

const formatDelta = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

const formatDeltaCount = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value)}`;

const formatDeltaPct = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;

const formatDeltaPoints = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)} pts`;

const formatHours = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)} h`;

const formatShare = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}%`;

const formatDateKey = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
};

const shiftDateKey = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getTopicToneLabel = (tone: AnalyticsTopic["tone"]) => {
  switch (tone) {
    case "positive":
      return "Positif";
    case "negative":
      return "Négatif";
    default:
      return "Neutre";
  }
};

const getTopicImpactLabel = (topic: AnalyticsTopic) => {
  if (topic.tone === "negative") {
    return "Risque";
  }
  if (topic.tone === "positive") {
    return "Levier";
  }
  return "À qualifier";
};

const getTopicSummary = (topic: AnalyticsTopic) => {
  const parts = [`${topic.label} apparaît dans ${topic.count} avis.`];
  if (topic.share_pct !== null) {
    parts.push(`Ce thème représente ${formatShare(topic.share_pct)} des mentions qualifiées.`);
  }
  if (topic.delta !== null) {
    if (topic.delta > 0) {
      parts.push("Il progresse sur la période.");
    } else if (topic.delta < 0) {
      parts.push("Il recule sur la période.");
    } else {
      parts.push("Il reste stable sur la période.");
    }
  }
  if (topic.net_sentiment !== null) {
    parts.push(`Son solde de sentiment est de ${topic.net_sentiment}.`);
  }
  return parts.join(" ");
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getReasonLabel = (reasons: string[]): string => {
  if (reasons.includes("no_locations")) {
    return "Aucune fiche connectée";
  }
  if (reasons.includes("no_reviews_in_range")) {
    return "Aucun avis sur la période";
  }
  if (reasons.includes("no_sentiment_data")) {
    return "Analyse en cours";
  }
  if (reasons.includes("no_ai_topics")) {
    return "Pas de thèmes détectés";
  }
  if (reasons.includes("no_replyable_reviews")) {
    return "Aucun avis avec texte";
  }
  return "Pas assez de données";
};

const getPresetLabel = (preset: string): string => {
  switch (preset) {
    case "this_week":
      return "Cette semaine";
    case "this_month":
      return "Ce mois";
    case "this_quarter":
      return "Ce trimestre";
    case "last_quarter":
      return "Trimestre précédent";
    case "this_year":
      return "Cette année";
    case "last_year":
      return "Année dernière";
    case "all_time":
      return "Depuis toujours";
    case "custom":
      return "Personnalisé";
    default:
      return "—";
  }
};

const getTrendState = (
  delta: number | null,
  positiveIsGood = true,
  threshold = 0.001
): TrendState => {
  if (delta === null) {
    return "none";
  }
  if (Math.abs(delta) <= threshold) {
    return "stable";
  }
  const improving = positiveIsGood ? delta > 0 : delta < 0;
  return improving ? "up" : "down";
};

const trendConfig = {
  up: {
    label: "amélioration",
    Icon: ArrowUpRight,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  down: {
    label: "baisse",
    Icon: ArrowDownRight,
    className: "border-red-200 bg-red-50 text-red-700"
  },
  stable: {
    label: "stable",
    Icon: ArrowRight,
    className: "border-slate-200 bg-slate-100 text-slate-600"
  },
  none: {
    label: "non comparé",
    Icon: ArrowRight,
    className: "border-slate-200 bg-white text-slate-500"
  }
} satisfies Record<
  TrendState,
  { label: string; Icon: typeof ArrowRight; className: string }
>;

const decisionLevelMeta = {
  high: {
    label: "Priorité élevée",
    dotClass: "bg-red-500",
    cardClass: "border-red-100 bg-red-50/60",
    badgeClass: "border-red-200 bg-red-50 text-red-700"
  },
  watch: {
    label: "À surveiller",
    dotClass: "bg-amber-400",
    cardClass: "border-amber-100 bg-amber-50/60",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700"
  },
  ok: {
    label: "Conforme",
    dotClass: "bg-emerald-500",
    cardClass: "border-emerald-100 bg-emerald-50/60",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
} satisfies Record<
  DecisionLevel,
  { label: string; dotClass: string; cardClass: string; badgeClass: string }
>;

const getMetricLabel = (metric: MetricKey) => {
  switch (metric) {
    case "avg_rating":
      return "Note moyenne";
    case "neg_share":
      return "Avis négatifs";
    case "reply_rate":
      return "Taux de réponse";
    default:
      return "Volume d'avis";
  }
};

const formatMetricValue = (metric: MetricKey, value: number | null) => {
  if (metric === "reviews") {
    return formatCount(value);
  }
  if (metric === "avg_rating") {
    return formatRating(value);
  }
  return formatRatio(value);
};

const getMetricValue = (
  metric: MetricKey,
  point: {
    review_count: number;
    avg_rating: number | null;
    neg_share: number | null;
    reply_rate: number | null;
  }
) => {
  if (metric === "reviews") {
    return point.review_count;
  }
  if (metric === "avg_rating") {
    return point.avg_rating;
  }
  if (metric === "neg_share") {
    return point.neg_share;
  }
  return point.reply_rate;
};

const getMetricDomain = (
  metric: MetricKey,
  values: Array<number | null>
): { min: number; max: number } => {
  if (metric === "avg_rating") {
    return { min: 0, max: 5 };
  }
  if (metric === "neg_share" || metric === "reply_rate") {
    return { min: 0, max: 1 };
  }
  return { min: 0, max: Math.max(1, ...values.map((value) => value ?? 0)) };
};

const buildLinePath = (
  values: Array<number | null>,
  min: number,
  max: number,
  width: number,
  height: number,
  padding = 18
) => {
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  const points = values
    .map((value, index) => {
      if (value === null) {
        return null;
      }
      const x =
        padding +
        (values.length <= 1 ? drawableWidth / 2 : (index / (values.length - 1)) * drawableWidth);
      const ratio = max === min ? 0 : (value - min) / (max - min);
      const y = padding + (1 - Math.max(0, Math.min(1, ratio))) * drawableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);

  if (points.length === 0) {
    return "";
  }
  return `M ${points.join(" L ")}`;
};

const buildAreaPath = (
  linePath: string,
  values: Array<number | null>,
  width: number,
  height: number,
  padding = 18
) => {
  const nonNullIndexes = values
    .map((value, index) => (value === null ? null : index))
    .filter((index): index is number => index !== null);

  if (!linePath || nonNullIndexes.length === 0) {
    return "";
  }

  const drawableWidth = width - padding * 2;
  const startIndex = nonNullIndexes[0];
  const endIndex = nonNullIndexes[nonNullIndexes.length - 1];
  const startX =
    padding +
    (values.length <= 1 ? drawableWidth / 2 : (startIndex / (values.length - 1)) * drawableWidth);
  const endX =
    padding +
    (values.length <= 1 ? drawableWidth / 2 : (endIndex / (values.length - 1)) * drawableWidth);

  return `${linePath} L ${endX.toFixed(1)},${height - padding} L ${startX.toFixed(
    1
  )},${height - padding} Z`;
};

const getPointCoordinates = (
  values: Array<number | null>,
  min: number,
  max: number,
  width: number,
  height: number,
  padding = 18
) => {
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  return values.map((value, index) => {
    if (value === null) {
      return null;
    }
    const x =
      padding +
      (values.length <= 1
        ? drawableWidth / 2
        : (index / (values.length - 1)) * drawableWidth);
    const ratio = max === min ? 0 : (value - min) / (max - min);
    const y = padding + (1 - Math.max(0, Math.min(1, ratio))) * drawableHeight;
    return { x, y };
  });
};

const DashboardCard = ({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <Card
    className={cn(
      "analytics-section overflow-hidden rounded-2xl border-slate-200/55 bg-white/95 shadow-[0_16px_44px_rgba(15,23,42,0.045)]",
      className
    )}
  >
    {children}
  </Card>
);

const EmptyState = ({ label = EMPTY_ANALYSIS }: { label?: string }) => (
  <div className="flex min-h-[136px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500">
    {label}
  </div>
);

const AnalyticsDisclosure = ({
  title,
  badge,
  defaultOpen = false,
  children
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <details
    {...(defaultOpen ? { open: true } : {})}
    className="group rounded-2xl border border-slate-100/80 bg-slate-50/70 p-4 transition hover:border-slate-200 hover:bg-slate-50"
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 [&::-webkit-details-marker]:hidden">
      <span className="text-sm font-semibold text-slate-950">{title}</span>
      <span className="flex items-center gap-2">
        {badge && <Badge variant="neutral">{badge}</Badge>}
        <span className="text-xs font-semibold text-slate-400 transition group-open:rotate-90">
          &gt;
        </span>
      </span>
    </summary>
    <div className="mt-4">{children}</div>
  </details>
);

const AiSkillCardView = ({ card }: { card: AiSkillCard }) => {
  const toneClass = {
    dark: "border-slate-200 bg-slate-950 text-white",
    good: "border-emerald-100 bg-emerald-50/70 text-slate-950",
    warn: "border-amber-100 bg-amber-50/70 text-slate-950",
    neutral: "border-slate-100/70 bg-white text-slate-950"
  }[card.tone];
  const iconClass = card.tone === "dark" ? "bg-white/10 text-white" : "bg-white text-slate-700";
  const badgeVariant =
    card.tone === "good" ? "success" : card.tone === "warn" ? "warning" : "neutral";
  const Icon = card.Icon;
  const emptyTitle = card.status === "soon" ? "Bientôt disponible" : "Données insuffisantes";

  return (
    <div className={cn("analytics-card-motion h-full rounded-2xl border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={cn("truncate text-sm font-semibold", card.tone === "dark" ? "text-white" : "text-slate-950")}>
              {card.title}
            </p>
            <p className={cn("mt-0.5 text-xs", card.tone === "dark" ? "text-slate-400" : "text-slate-500")}>
              Capacité IA
            </p>
          </div>
        </div>
        <Badge variant={badgeVariant} className={card.tone === "dark" ? "border-white/10 bg-white/10 text-white" : undefined}>
          {card.badge}
        </Badge>
      </div>

      {card.items.length > 0 ? (
        <div className="mt-4 space-y-2">
          {card.items.slice(0, 3).map((item) => (
            <div
              key={`${card.id}-${item.label}`}
              className={cn(
                "rounded-xl border px-3 py-2",
                card.tone === "dark"
                  ? "border-white/10 bg-white/10"
                  : "border-white/80 bg-white/80"
              )}
            >
              <p className={cn("text-sm font-semibold", card.tone === "dark" ? "text-white" : "text-slate-900")}>
                {item.label}
              </p>
              {item.detail && (
                <p className={cn("mt-1 text-xs", card.tone === "dark" ? "text-slate-300" : "text-slate-500")}>
                  {item.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "mt-4 flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center",
            card.tone === "dark"
              ? "border-white/15 bg-white/5 text-slate-300"
              : "border-slate-200 bg-white/60 text-slate-500"
          )}
        >
          <p
            className={cn(
              "text-sm font-semibold",
              card.tone === "dark" ? "text-white" : "text-slate-800"
            )}
          >
            {emptyTitle}
          </p>
          <p className="mt-2 text-xs leading-5">{card.emptyLabel}</p>
        </div>
      )}
    </div>
  );
};

const TrendPill = ({
  state,
  label
}: {
  state: TrendState;
  label?: string;
}) => {
  const config = trendConfig[state];
  const Icon = config.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        config.className
      )}
    >
      <Icon className="h-3 w-3" />
      {label ?? config.label}
    </span>
  );
};

const Sparkline = ({
  points,
  metric,
  trend,
  compact = false
}: {
  points: AnalyticsPoint[];
  metric: MetricKey;
  trend: TrendState;
  compact?: boolean;
}) => {
  const width = 150;
  const height = compact ? 38 : 48;
  const values = points.map((point) => getMetricValue(metric, point));
  const domain = getMetricDomain(metric, values);
  const path = buildLinePath(values, domain.min, domain.max, width, height, 5);
  const area = buildAreaPath(path, values, width, height, 5);
  const stroke =
    trend === "down" ? "#e11d48" : trend === "up" ? "#059669" : "#0f172a";

  if (points.length < 2 || !path) {
    return (
      <div className={cn("flex items-center", compact ? "h-9" : "h-12")}>
        <div className="h-px w-full bg-slate-200" />
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Mini tendance ${getMetricLabel(metric)}`}
      className={cn("w-full", compact ? "h-9" : "h-12")}
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity="0.08" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
};

const KpiCard = ({
  id,
  label,
  value,
  detail,
  trend,
  delta,
  Icon,
  sparklineMetric,
  points,
  onOpen
}: {
  id: KpiPanelKey;
  label: string;
  value: string;
  detail: string;
  trend: TrendState;
  delta: string;
  Icon: typeof BarChart3;
  sparklineMetric: MetricKey;
  points: AnalyticsPoint[];
  onOpen: (id: KpiPanelKey) => void;
}) => (
  <button
    type="button"
    onClick={() => onOpen(id)}
    className="analytics-kpi-motion group h-full min-w-0 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.07)] focus:outline-none focus:ring-2 focus:ring-slate-900/10"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <div className="mt-3">
      <Sparkline points={points} metric={sparklineMetric} trend={trend} compact />
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <TrendPill state={trend} label={delta} />
      <span className="text-xs text-slate-500">{detail}</span>
    </div>
  </button>
);

const TodayMetricTile = ({ metric }: { metric: TodayBriefMetric }) => {
  const Icon = metric.Icon;
  const toneClass = {
    neutral: "border-slate-100 bg-white",
    good: "border-emerald-100/80 bg-emerald-50/50",
    warn: "border-amber-100/80 bg-amber-50/60"
  }[metric.tone];
  const iconClass = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    good: "border-emerald-200 bg-white text-emerald-700",
    warn: "border-amber-200 bg-white text-amber-700"
  }[metric.tone];

  return (
    <div className={cn("analytics-card-motion h-full rounded-2xl border p-4", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {metric.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {metric.value}
          </p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{metric.detail}</p>
    </div>
  );
};

const TodayTaskCard = ({
  task,
  onNavigate
}: {
  task: TodayTask;
  onNavigate: (path: string) => void;
}) => {
  const toneClass = {
    neutral: "border-slate-100 bg-white",
    good: "border-emerald-100/80 bg-emerald-50/50",
    warn: "border-amber-100/80 bg-amber-50/60"
  }[task.tone];
  const dotClass = {
    neutral: "bg-slate-400",
    good: "bg-emerald-500",
    warn: "bg-amber-400"
  }[task.tone];

  return (
    <article className={cn("analytics-card-motion h-full rounded-2xl border p-4", toneClass)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">{task.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{task.detail}</p>
          {task.action && (
            <Button
              type="button"
              variant={task.path ? "outline" : "ghost"}
              size="sm"
              className="mt-3 h-9 rounded-full text-xs"
              onClick={() => task.path && onNavigate(task.path)}
              disabled={!task.path}
            >
              {task.action}
              {!task.path && (
                <span className="ml-1 text-[10px] uppercase tracking-[0.12em]">
                  Bientôt
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
};

const AreaChart = ({
  points,
  metric,
  sentimentLabel
}: {
  points: AnalyticsPoint[];
  metric: MetricKey;
  sentimentLabel: string | null;
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 760;
  const height = 340;
  const values = points.map((point) => getMetricValue(metric, point));
  const domain = getMetricDomain(metric, values);
  const linePath = buildLinePath(values, domain.min, domain.max, width, height);
  const areaPath = buildAreaPath(linePath, values, width, height);
  const coordinates = getPointCoordinates(values, domain.min, domain.max, width, height);
  const activeIndex = hoverIndex ?? Math.max(0, points.length - 1);
  const activePoint = points[activeIndex] ?? null;
  const activeCoordinate = coordinates[activeIndex] ?? null;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (points.length === 0 || !linePath) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 via-white to-white px-2 py-3"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <style>
          {`@keyframes analyticsLineDraw { from { stroke-dashoffset: 1; opacity: .25; } to { stroke-dashoffset: 0; opacity: 1; } }`}
        </style>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${getMetricLabel(metric)} sur la période`}
          className="h-[340px] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="analyticsAreaPremium" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((line) => {
            const y = 18 + line * 76;
            return (
              <line
                key={line}
                x1="18"
                x2={width - 18}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="5 7"
                strokeWidth="1"
              />
            );
          })}
          <path d={areaPath} fill="url(#analyticsAreaPremium)" />
          <path
            d={linePath}
            fill="none"
            stroke="#0f172a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.4"
            pathLength="1"
            style={{
              animation: "analyticsLineDraw 700ms ease-out",
              strokeDasharray: 1
            }}
          />
          {values.map((value, index) => {
            if (value === null) {
              return null;
            }
            const coordinate = coordinates[index];
            if (!coordinate) {
              return null;
            }
            return (
              <circle
                key={`${points[index].date}-${index}`}
                cx={coordinate.x}
                cy={coordinate.y}
                r={hoverIndex === index ? "5.5" : "3.6"}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2"
                className="transition-all duration-150"
                onMouseEnter={() => setHoverIndex(index)}
              />
            );
          })}
          {points.map((point, index) => {
            const coordinate = coordinates[index];
            if (!coordinate) {
              return null;
            }
            const x =
              18 +
              (points.length <= 1
                ? (width - 36) / 2
                : (index / (points.length - 1)) * (width - 36));
            const nextX =
              18 +
              (points.length <= 1
                ? (width - 36) / 2
                : ((index + 1) / (points.length - 1)) * (width - 36));
            const prevX =
              18 +
              (points.length <= 1
                ? (width - 36) / 2
                : ((index - 1) / (points.length - 1)) * (width - 36));
            const hitWidth =
              points.length <= 1 ? width - 36 : Math.max(12, (nextX - prevX) / 2);
            return (
              <rect
                key={`hit-${point.date}-${index}`}
                x={Math.max(18, x - hitWidth / 2)}
                y="0"
                width={hitWidth}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
              />
            );
          })}
        </svg>
        {activePoint && activeCoordinate && hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur"
            style={{
              left: `${Math.min(78, Math.max(4, (activeCoordinate.x / width) * 100))}%`,
              top: `${Math.min(70, Math.max(6, (activeCoordinate.y / height) * 100))}%`
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-900">{activePoint.date}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                {getMetricLabel(metric)}
              </span>
            </div>
            <div className="grid gap-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Avis</span>
                <span className="font-semibold text-slate-900">
                  {activePoint.review_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Note</span>
                <span className="font-semibold text-slate-900">
                  {formatRating(activePoint.avg_rating)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Réponse</span>
                <span className="font-semibold text-slate-900">
                  {formatRatio(activePoint.reply_rate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Négatifs</span>
                <span className="font-semibold text-slate-900">
                  {formatRatio(activePoint.neg_share)}
                </span>
              </div>
              {sentimentLabel && (
                <div className="flex justify-between border-t border-slate-100 pt-1.5">
                  <span>Sentiment</span>
                  <span className="font-semibold text-slate-900">{sentimentLabel}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{firstPoint?.date ?? "—"}</span>
        <span className="font-medium text-slate-600">
          {getMetricLabel(metric)} · {formatMetricValue(metric, values[values.length - 1] ?? null)}
        </span>
        <span>{lastPoint?.date ?? "—"}</span>
      </div>
    </div>
  );
};

const CompactBars = ({
  points,
  metric
}: {
  points: Array<{
    date: string;
    review_count: number;
    avg_rating: number | null;
    neg_share: number | null;
    reply_rate: number | null;
  }>;
  metric: MetricKey;
}) => {
  const values = points.map((point) => getMetricValue(metric, point));
  const domain = getMetricDomain(metric, values);

  if (points.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex h-28 items-end gap-1.5 rounded-2xl bg-slate-50/70 p-3">
      {points.map((point, index) => {
        const value = values[index];
        const ratio =
          value === null || domain.max === domain.min
            ? 0
            : (value - domain.min) / (domain.max - domain.min);
        return (
          <div
            key={`${point.date}-${index}`}
            className="flex h-full min-w-0 flex-1 items-end"
            title={`${point.date}: ${formatMetricValue(metric, value)}`}
          >
            <div
              className="w-full rounded-t bg-slate-900/80"
              style={{ height: `${Math.max(4, Math.round(ratio * 100))}%` }}
            />
          </div>
        );
      })}
    </div>
  );
};

const SentimentDonut = ({
  sentiment
}: {
  sentiment:
    | {
        positive: number;
        neutral: number;
        negative: number;
        positive_pct: number | null;
      }
    | null
    | undefined;
}) => {
  if (!sentiment) {
    return <EmptyState />;
  }

  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  if (total === 0 || sentiment.positive_pct === null) {
    return <EmptyState />;
  }

  const positive = Math.round((sentiment.positive / total) * 100);
  const neutral = Math.round((sentiment.neutral / total) * 100);
  const negative = Math.max(0, 100 - positive - neutral);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div
        className="grid h-40 w-40 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#111827 0 ${positive}%, #94a3b8 ${positive}% ${
            positive + neutral
          }%, #ef4444 ${positive + neutral}% 100%)`
        }}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p className="text-3xl font-semibold text-slate-950">
              {formatPercent(sentiment.positive_pct)}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              positif
            </p>
          </div>
        </div>
      </div>
      <div className="grid w-full gap-2 text-sm">
        {[
          { label: "Positif", count: sentiment.positive, pct: positive, color: "bg-slate-950" },
          { label: "Neutre", count: sentiment.neutral, pct: neutral, color: "bg-slate-400" },
          { label: "Négatif", count: sentiment.negative, pct: negative, color: "bg-red-500" }
        ].map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", row.color)} />
                {row.label}
              </span>
              <span>
                {row.count} · {row.pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div className={cn("h-1.5 rounded-full", row.color)} style={{ width: `${row.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RatingDistribution = ({
  ratings,
  total
}: {
  ratings: { "1": number; "2": number; "3": number; "4": number; "5": number } | null;
  total: number;
}) => {
  if (!ratings || total === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      {(["5", "4", "3", "2", "1"] as const).map((rating) => {
        const count = ratings[rating];
        const percent = Math.round((count / total) * 100);
        return (
          <div key={rating} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1 font-medium text-slate-700">
                {rating}
                <Star className="h-3 w-3 fill-slate-500 text-slate-500" />
              </span>
              <span>
                {count} · {percent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-slate-900"
                style={{ width: `${Math.max(percent, count > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TopicRow = ({
  item,
  onClick
}: {
  item: AnalyticsTopic;
  onClick: () => void;
}) => {
  const trend = getTrendState(item.delta, item.tone !== "negative");
  const width = Math.max(4, Math.min(100, item.share_pct ?? item.count * 8));
  const toneClass =
    item.tone === "negative"
      ? "bg-red-500"
      : item.tone === "positive"
        ? "bg-slate-950"
        : "bg-slate-400";
  const toneVariant =
    item.tone === "positive" ? "success" : item.tone === "negative" ? "warning" : "neutral";
  const impact = getTopicImpactLabel(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className="analytics-card-motion group w-full rounded-2xl border border-transparent bg-slate-50/70 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
            <Badge variant={toneVariant}>{getTopicToneLabel(item.tone)}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
            <span className="rounded-xl bg-slate-50 px-2.5 py-1">
              Mentions: <strong className="text-slate-800">{item.count}</strong>
            </span>
            <span className="rounded-xl bg-slate-50 px-2.5 py-1">
              Importance: <strong className="text-slate-800">{formatShare(item.share_pct)}</strong>
            </span>
            <span className="rounded-xl bg-slate-50 px-2.5 py-1">
              Sentiment:{" "}
              <strong className="text-slate-800">
                {item.net_sentiment === null ? "—" : item.net_sentiment}
              </strong>
            </span>
            <span className="rounded-xl bg-slate-50 px-2.5 py-1">
              Impact: <strong className="text-slate-800">{impact}</strong>
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <TrendPill
            state={trend}
            label={`${formatDeltaCount(item.delta)} · ${formatDeltaPct(item.delta_pct)}`}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-slate-400">
        <span>Poids</span>
        <span>{formatShare(item.share_pct)}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
        <div
          className={cn("h-1.5 rounded-full", toneClass)}
          style={{ width: `${width}%` }}
        />
      </div>
    </button>
  );
};

const TopicColumn = ({
  title,
  badge,
  badgeVariant = "neutral",
  topics,
  emptyLabel,
  onOpen
}: {
  title: string;
  badge: string;
  badgeVariant?: "success" | "warning" | "neutral";
  topics: AnalyticsTopic[];
  emptyLabel: string;
  onOpen: (topic: AnalyticsTopic) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <Badge variant={badgeVariant}>{badge}</Badge>
    </div>
    {topics.length > 0 ? (
      topics.map((topic) => (
        <TopicRow key={topic.id} item={topic} onClick={() => onOpen(topic)} />
      ))
    ) : (
      <EmptyState label={emptyLabel} />
    )}
  </div>
);

const KpiDetailSection = ({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-100/70 bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {badge && <Badge variant="neutral">{badge}</Badge>}
    </div>
    {children}
  </div>
);

const KpiDetailMetric = ({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string;
}) => (
  <div className="rounded-2xl border border-transparent bg-slate-50/80 p-3">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    {detail && <p className="text-xs text-slate-500">{detail}</p>}
  </div>
);

const ProblemActionButtons = ({
  onNavigate,
  compact = false
}: {
  onNavigate: (path: string) => void;
  compact?: boolean;
}) => {
  const actions = [
    { label: "Répondre aux avis", path: "/inbox" },
    { label: "Voir les avis concernés", path: "/inbox" },
    { label: "Créer une alerte", path: "/alerts" },
    { label: "Programmer un rappel", path: "/automation/builder" },
    { label: "Analyser avec l'IA", path: "/coach" },
    { label: "Voir uniquement les avis concernés", soon: true }
  ];
  const primaryAction = actions[0];
  const secondaryAction = actions[1];
  const moreActions = actions.slice(2);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact ? "mt-3" : "mt-4")}>
      <Button
        type="button"
        variant="default"
        size="sm"
        className="h-9 rounded-full text-xs"
        onClick={() => primaryAction.path && onNavigate(primaryAction.path)}
      >
        {primaryAction.label}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-full text-xs"
        onClick={() => secondaryAction.path && onNavigate(secondaryAction.path)}
      >
        {secondaryAction.label}
      </Button>
      <details className="group">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 [&::-webkit-details-marker]:hidden">
          <MoreHorizontal className="h-3.5 w-3.5" />
          Plus d'actions
        </summary>
        <div className="analytics-actions-menu mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_44px_rgba(15,23,42,0.12)]">
          {moreActions.map((action) =>
            action.soon ? (
              <button
                key={action.label}
                type="button"
                className="flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-400"
                disabled
              >
                <span>{action.label}</span>
                <span className="text-[10px] uppercase tracking-[0.12em]">
                  Bientôt disponible
                </span>
              </button>
            ) : (
              <button
                key={action.label}
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => action.path && onNavigate(action.path)}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      </details>
    </div>
  );
};

const getDecisionRisk = (item: DecisionItem): string => {
  if (item.level === "ok") {
    return "Aucun risque immédiat détecté sur ce point, mais le niveau doit être maintenu.";
  }
  return item.consequence;
};

const getDecisionAction = (
  item: DecisionItem,
  pendingReplies: number | null
): string => {
  const needsReplyAction =
    item.id.includes("reply") || item.action.toLowerCase().includes("répond");

  if (needsReplyAction && pendingReplies !== null && pendingReplies > 0) {
    return pendingReplies === 1
      ? "Répondre aujourd'hui à 1 avis en attente."
      : `Répondre aujourd'hui aux ${pendingReplies} avis en attente.`;
  }

  return item.action;
};

const getDecisionImpact = (item: DecisionItem): string => {
  if (item.id.includes("reply") || item.id.includes("delay")) {
    return "Améliorer la perception de réactivité et renforcer la confiance client.";
  }
  if (item.id.includes("reviews")) {
    return "Renforcer l'activité visible de la fiche et soutenir la visibilité Google.";
  }
  if (item.id.includes("rating") || item.id.includes("negative")) {
    return "Limiter la baisse de confiance et protéger la note moyenne.";
  }
  if (item.id.includes("sentiment") || item.id.includes("irritant")) {
    return "Réduire les irritants récurrents et stabiliser la satisfaction client.";
  }
  if (item.id.includes("positive")) {
    return "Transformer un point fort client en argument commercial visible.";
  }
  return item.level === "ok"
    ? "Maintenir la qualité perçue et consolider les signaux positifs."
    : "Réduire le risque sur la réputation et rendre l'action plus lisible.";
};

const getAssistantListImpact = (
  item: AssistantListItem,
  type: "opportunity" | "risk" | "action"
): string => {
  if (type === "opportunity") {
    return "Rendre ce point fort plus visible dans les réponses et la communication.";
  }
  if (type === "risk") {
    return "Réduire le risque avant qu'il n'affecte davantage la réputation.";
  }
  return item.detail;
};

const MultiLocationInsightCardView = ({
  card
}: {
  card: MultiLocationInsightCard;
}) => {
  const Icon = card.Icon;
  return (
    <div className="analytics-card-motion h-full rounded-2xl border border-slate-100/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{card.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{card.detail}</p>
        </div>
      </div>
      <div className="mt-4 flex min-h-[118px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/60 px-4 text-center">
        <p className="text-sm font-semibold text-slate-800">Données insuffisantes</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Cette analyse sera activée automatiquement lorsque les métriques par établissement seront disponibles.
        </p>
      </div>
    </div>
  );
};

const Analytics = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: AnalyticsProps) => {
  const navigate = useNavigate();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [preset, setPreset] = useState<
    | "this_week"
    | "this_month"
    | "this_quarter"
    | "last_quarter"
    | "this_year"
    | "last_year"
    | "all_time"
    | "custom"
  >("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationId, setLocationId] = useState("all");
  const [granularity, setGranularity] = useState<"auto" | "day" | "week">(
    "auto"
  );
  const [drilldown, setDrilldown] = useState<AnalyticsDrilldown | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [drilldownDriver, setDrilldownDriver] = useState<{
    label: string;
    source: "ai" | "manual";
    tag_ids?: string[];
  } | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<AnalyticsTopic | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<KpiPanelKey | null>(null);
  const [metric, setMetric] = useState<MetricKey>("reviews");
  const presetKey = useMemo(() => {
    const base = preset === "custom" ? `${from || "?"}_${to || "?"}` : preset;
    return `${base}_${granularity}`;
  }, [preset, from, to, granularity]);

  useEffect(() => {
    if (!locationId) {
      setLocationId("all");
    }
  }, [locationId]);

  const rangeDays = useMemo(() => {
    if (preset === "custom" && from && to) {
      const diff = new Date(to).getTime() - new Date(from).getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    if (preset === "all_time") {
      return 365;
    }
    return 0;
  }, [preset, from, to]);

  const analyticsQuery = useQuery({
    queryKey: analyticsQueryKey({
      userId: session?.user?.id ?? null,
      locationId,
      presetKey,
      tz: timeZone
    }),
    queryFn: () => {
      if (!session?.access_token) {
        throw new Error("Missing session");
      }
      return fetchAnalyticsBundle({
        accessToken: session.access_token,
        locationId,
        preset,
        from,
        to,
        tz: timeZone,
        granularity
      });
    },
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev
  });

  const overview = analyticsQuery.data?.overview ?? null;
  const timeseries = analyticsQuery.data?.timeseries ?? null;
  const compare = analyticsQuery.data?.compare ?? null;
  const insights = analyticsQuery.data?.insights ?? null;
  const drivers = analyticsQuery.data?.drivers ?? null;
  const quality = analyticsQuery.data?.quality ?? null;
  const loading = analyticsQuery.isLoading;
  const isFetching = analyticsQuery.isFetching;
  const showSkeleton = loading && !analyticsQuery.data;
  const error = analyticsQuery.isError
    ? "Impossible de charger les analytics."
    : analyticsQuery.data?.error ?? null;

  const ratingTotal = useMemo(() => {
    if (!overview) {
      return 0;
    }
    return (
      overview.ratings["1"] +
      overview.ratings["2"] +
      overview.ratings["3"] +
      overview.ratings["4"] +
      overview.ratings["5"]
    );
  }, [overview]);

  const chartPoints = useMemo(() => {
    const points = timeseries?.points ?? [];
    return points.length > 60 ? points.slice(-60) : points;
  }, [timeseries]);

  const compactPoints = useMemo(() => chartPoints.slice(-18), [chartPoints]);

  const compareRows = useMemo(() => {
    if (!compare) {
      return [];
    }
    return [
      {
        key: "review_count",
        label: "Avis",
        a: formatCount(compare.metrics.review_count.a),
        b: formatCount(compare.metrics.review_count.b),
        delta: formatDeltaCount(compare.metrics.review_count.delta),
        deltaPct: formatDeltaPct(compare.metrics.review_count.delta_pct),
        trend: getTrendState(compare.metrics.review_count.delta)
      },
      {
        key: "avg_rating",
        label: "Note",
        a: formatRating(compare.metrics.avg_rating.a),
        b: formatRating(compare.metrics.avg_rating.b),
        delta: formatDelta(compare.metrics.avg_rating.delta),
        deltaPct: "—",
        trend: getTrendState(compare.metrics.avg_rating.delta)
      },
      {
        key: "neg_share",
        label: "Avis négatifs",
        a: formatRatio(compare.metrics.neg_share.a),
        b: formatRatio(compare.metrics.neg_share.b),
        delta: formatDeltaPoints(compare.metrics.neg_share.delta),
        deltaPct: formatDeltaPct(compare.metrics.neg_share.delta_pct),
        trend: getTrendState(compare.metrics.neg_share.delta, false)
      },
      {
        key: "reply_rate",
        label: "Réponse",
        a: formatRatio(compare.metrics.reply_rate.a),
        b: formatRatio(compare.metrics.reply_rate.b),
        delta: formatDeltaPoints(compare.metrics.reply_rate.delta),
        deltaPct: formatDeltaPct(compare.metrics.reply_rate.delta_pct),
        trend: getTrendState(compare.metrics.reply_rate.delta)
      }
    ];
  }, [compare]);

  const kpis = useMemo(() => {
    const reviewTrend = compare
      ? getTrendState(compare.metrics.review_count.delta)
      : "none";
    const ratingTrend = compare
      ? getTrendState(compare.metrics.avg_rating.delta)
      : "none";
    const replyTrend = compare
      ? getTrendState(compare.metrics.reply_rate.delta)
      : "none";
    const negativeTrend = compare
      ? getTrendState(compare.metrics.neg_share.delta, false)
      : "none";

    return [
      {
        id: "reviews" as KpiPanelKey,
        label: "Avis",
        value: formatCount(overview?.kpis.reviews_total),
        detail: "vs période précédente",
        trend: reviewTrend,
        delta: compare ? formatDeltaCount(compare.metrics.review_count.delta) : "—",
        Icon: BarChart3,
        sparklineMetric: "reviews" as MetricKey
      },
      {
        id: "avg_rating" as KpiPanelKey,
        label: "Note moyenne",
        value: formatRating(overview?.kpis.avg_rating ?? null),
        detail: "qualité perçue",
        trend: ratingTrend,
        delta: compare ? formatDelta(compare.metrics.avg_rating.delta) : "—",
        Icon: Star,
        sparklineMetric: "avg_rating" as MetricKey
      },
      {
        id: "reply_rate" as KpiPanelKey,
        label: "Taux réponse",
        value: formatPercent(overview?.kpis.response_rate_pct ?? null),
        detail: "avis avec texte",
        trend: replyTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.reply_rate.delta) : "—",
        Icon: MessageSquareReply,
        sparklineMetric: "reply_rate" as MetricKey
      },
      {
        id: "reply_delay" as KpiPanelKey,
        label: "Délai moyen",
        value: formatHours(quality?.avg_reply_delay_hours ?? null),
        detail:
          quality && quality.replied_with_time_count > 0
            ? `${quality.replied_with_time_count} réponses`
            : EMPTY_ANALYSIS,
        trend: "none" as TrendState,
        delta:
          quality?.avg_reply_delay_hours === null ||
          quality?.avg_reply_delay_hours === undefined
            ? "—"
            : "mesuré",
        Icon: Clock3,
        sparklineMetric: "reply_rate" as MetricKey
      },
      {
        id: "neg_share" as KpiPanelKey,
        label: "Avis négatifs",
        value: formatPercent(overview?.kpis.negative_share_pct ?? null),
        detail: "part du volume",
        trend: negativeTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.neg_share.delta) : "—",
        Icon: TrendingUp,
        sparklineMetric: "neg_share" as MetricKey
      },
      {
        id: "sentiment" as KpiPanelKey,
        label: "Sentiment",
        value: overview?.sentiment
          ? `${formatPercent(overview.sentiment.positive_pct)} positif`
          : "—",
        detail: overview?.sentiment ? "signal négatif" : EMPTY_ANALYSIS,
        trend: negativeTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.neg_share.delta) : "—",
        Icon: Sparkles,
        sparklineMetric: "neg_share" as MetricKey
      }
    ];
  }, [compare, overview, quality]);

  const chartInsights = useMemo(() => {
    const points = timeseries?.points ?? [];
    if (points.length === 0) {
      return [];
    }
    const busiest = points.reduce((best, point) =>
      point.review_count > best.review_count ? point : best
    );
    const quietest = points.reduce((best, point) =>
      point.review_count < best.review_count ? point : best
    );
    const ratedPoints = points.filter((point) => point.avg_rating !== null);
    const bestRated =
      ratedPoints.length > 0
        ? ratedPoints.reduce((best, point) =>
            (point.avg_rating ?? 0) > (best.avg_rating ?? 0) ? point : best
          )
        : null;
    const lowestRated =
      ratedPoints.length > 0
        ? ratedPoints.reduce((lowest, point) =>
            (point.avg_rating ?? 0) < (lowest.avg_rating ?? 0) ? point : lowest
          )
        : null;
    const dailyAverage =
      points.reduce((sum, point) => sum + point.review_count, 0) / points.length;
    const midpoint = Math.max(1, Math.floor(points.length / 2));
    const firstHalf = points.slice(0, midpoint);
    const secondHalf = points.slice(midpoint);
    const averageMetric = (list: AnalyticsPoint[]) => {
      const values = list
        .map((point) => getMetricValue(metric, point))
        .filter((value): value is number => value !== null);
      if (values.length === 0) {
        return null;
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const firstAverage = averageMetric(firstHalf);
    const secondAverage = averageMetric(secondHalf.length > 0 ? secondHalf : firstHalf);
    const averageDelta =
      firstAverage === null || secondAverage === null ? null : secondAverage - firstAverage;

    return [
      {
        label: "Meilleur jour",
        value: busiest.date,
        detail: `${busiest.review_count} avis`,
        Icon: BarChart3
      },
      {
        label: "Plus calme",
        value: quietest.date,
        detail: `${quietest.review_count} avis`,
        Icon: Clock3
      },
      {
        label: "Moy. jour",
        value: dailyAverage.toFixed(1),
        detail: "avis / point",
        Icon: LineChart
      },
      {
        label: "Meilleure note",
        value: bestRated?.date ?? "—",
        detail: formatRating(bestRated?.avg_rating ?? null),
        Icon: Star
      },
      {
        label: "Note basse",
        value: lowestRated?.date ?? "—",
        detail: formatRating(lowestRated?.avg_rating ?? null),
        Icon: TrendingUp
      },
      {
        label: "Évolution moy.",
        value:
          metric === "reviews"
            ? formatDeltaCount(averageDelta)
            : metric === "avg_rating"
              ? formatDelta(averageDelta)
              : formatDeltaPoints(averageDelta),
        detail: getMetricLabel(metric),
        Icon: Sparkles
      }
    ];
  }, [metric, timeseries]);

  const responseBreakdown = useMemo(() => {
    if (!overview || overview.kpis.replyable_count === 0) {
      return null;
    }
    const replied = overview.kpis.replied_count;
    const pending = Math.max(0, overview.kpis.replyable_count - replied);
    const repliedPct = Math.round((replied / overview.kpis.replyable_count) * 100);
    return {
      replied,
      pending,
      total: overview.kpis.replyable_count,
      repliedPct,
      pendingPct: Math.max(0, 100 - repliedPct)
    };
  }, [overview]);

  const healthScore = useMemo(() => {
    if (!overview) {
      return null;
    }

    const ratingScore =
      overview.kpis.avg_rating === null ? null : (overview.kpis.avg_rating / 5) * 100;
    const responseScore = overview.kpis.response_rate_pct;
    const negativeScore =
      overview.kpis.negative_share_pct === null
        ? null
        : 100 - overview.kpis.negative_share_pct;
    const sentimentScore = overview.sentiment?.positive_pct ?? null;
    const volumeScore =
      overview.kpis.reviews_total > 0
        ? clamp((overview.kpis.reviews_total / 20) * 100, 15, 100)
        : null;

    const weighted = [
      { value: ratingScore, weight: 0.3 },
      { value: responseScore, weight: 0.25 },
      { value: negativeScore, weight: 0.2 },
      { value: sentimentScore, weight: 0.15 },
      { value: volumeScore, weight: 0.1 }
    ].filter((item): item is { value: number; weight: number } => item.value !== null);

    if (weighted.length === 0) {
      return null;
    }

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const score = Math.round(
      weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    );

    return {
      value: clamp(score, 0, 100),
      status: score >= 80 ? "Solide" : score >= 60 ? "À surveiller" : "Prioritaire",
      availableSignals: weighted.length
    };
  }, [overview]);

  const decisionEngine = useMemo(() => {
    const summary: string[] = [];
    const items: DecisionItem[] = [];
    const addItem = (item: DecisionItem) => {
      if (!items.some((existing) => existing.id === item.id)) {
        items.push(item);
      }
    };

    if (compare) {
      const reviewDelta = compare.metrics.review_count.delta;
      if (reviewDelta > 0) {
        summary.push(`Volume en hausse (${formatDeltaCount(reviewDelta)})`);
        addItem({
          id: "reviews-up",
          level: "ok",
          title: "Volume en hausse",
          action: "Maintenir les demandes d'avis",
          evidence: `${compare.metrics.review_count.a} vs ${compare.metrics.review_count.b} avis`,
          reason: "Vous recevez plus d'avis que sur la période précédente.",
          consequence: "Votre fiche paraît plus active et plus rassurante."
        });
      } else if (reviewDelta < 0) {
        summary.push(`Volume en baisse (${formatDeltaCount(reviewDelta)})`);
        addItem({
          id: "reviews-down",
          level: Math.abs(reviewDelta) >= 3 ? "high" : "watch",
          title: "Les avis diminuent",
          action: "Relancer les demandes d'avis",
          evidence: `${compare.metrics.review_count.a} vs ${compare.metrics.review_count.b} avis`,
          reason: "Vous recevez moins d'avis que sur la période précédente.",
          consequence: "La fiche peut sembler moins active aux nouveaux clients."
        });
      } else {
        summary.push("Volume stable");
      }

      const replyDelta = compare.metrics.reply_rate.delta;
      if (replyDelta !== null) {
        if (replyDelta <= -0.1) {
          summary.push(`Taux de réponse en baisse (${formatDeltaPoints(replyDelta)})`);
          addItem({
            id: "reply-rate-down",
            level: "high",
            title: "Baisse des réponses",
            action: "Répondre aux avis récents",
            evidence: `${formatRatio(compare.metrics.reply_rate.a)} vs ${formatRatio(
              compare.metrics.reply_rate.b
            )}`,
            reason: "La part d'avis répondus recule.",
            consequence: "Des clients peuvent penser que leurs retours sont moins suivis."
          });
        } else if (replyDelta < 0) {
          summary.push(`Réponse en léger recul (${formatDeltaPoints(replyDelta)})`);
          addItem({
            id: "reply-rate-watch",
            level: "watch",
            title: "Réponse à surveiller",
            action: "Traiter les avis sans réponse",
            evidence: `${formatRatio(compare.metrics.reply_rate.a)} actuellement`,
            reason: "Le taux de réponse baisse légèrement.",
            consequence: "Le retard peut s'accumuler si rien n'est traité cette semaine."
          });
        } else if (replyDelta > 0) {
          summary.push(`Réponse en hausse (${formatDeltaPoints(replyDelta)})`);
          addItem({
            id: "reply-rate-up",
            level: "ok",
            title: "Réactivité en hausse",
            action: "Conserver le rythme de réponse",
            evidence: `${formatRatio(compare.metrics.reply_rate.a)} actuellement`,
            reason: "Vous répondez à une plus grande part des avis.",
            consequence: "Les clients voient une entreprise attentive."
          });
        }
      }

      const ratingDelta = compare.metrics.avg_rating.delta;
      if (ratingDelta !== null) {
        if (ratingDelta <= -0.2) {
          summary.push(`Note en baisse (${formatDelta(ratingDelta)})`);
          addItem({
            id: "rating-down",
            level: "high",
            title: "Note moyenne en baisse",
            action: "Analyser les avis négatifs",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`,
            reason: "La note moyenne recule sur la période.",
            consequence: "La confiance peut baisser si la tendance continue."
          });
        } else if (ratingDelta < 0) {
          summary.push(`Note en léger recul (${formatDelta(ratingDelta)})`);
          addItem({
            id: "rating-watch",
            level: "watch",
            title: "Note à surveiller",
            action: "Identifier les irritants récurrents",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`,
            reason: "La note baisse légèrement.",
            consequence: "Un petit recul peut devenir visible si les irritants reviennent."
          });
        } else if (Math.abs(ratingDelta) <= 0.05) {
          summary.push("Note stable");
          addItem({
            id: "rating-stable",
            level: "ok",
            title: "Note stable",
            action: "Maintenir le niveau de service",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`,
            reason: "La note moyenne reste quasiment inchangée.",
            consequence: "Votre niveau de satisfaction reste lisible et constant."
          });
        } else {
          summary.push(`Note en hausse (${formatDelta(ratingDelta)})`);
          addItem({
            id: "rating-up",
            level: "ok",
            title: "Note en progression",
            action: "Capitaliser sur les points forts",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`,
            reason: "La note moyenne progresse.",
            consequence: "Vos points forts peuvent être davantage mis en avant."
          });
        }
      }

      const negativeDelta = compare.metrics.neg_share.delta;
      if (negativeDelta !== null && negativeDelta > 0.05) {
        summary.push(`Avis négatifs en hausse (${formatDeltaPoints(negativeDelta)})`);
        addItem({
          id: "negative-share-up",
          level: "high",
          title: "Irritants en hausse",
          action: "Analyser les avis négatifs",
          evidence: `${formatRatio(compare.metrics.neg_share.a)} actuellement`,
          reason: "La part d'avis négatifs augmente.",
          consequence: "Un problème récurrent peut commencer à peser sur l'image."
        });
      }
    }

    const responseRate = quality?.reply_rate ?? null;
    if (responseRate !== null) {
      if (responseRate < 0.6) {
        addItem({
          id: "reply-rate-low",
          level: "high",
          title: "Réponses insuffisantes",
          action: "Répondre aux avis récents",
          evidence: `${formatRatio(responseRate)} de taux de réponse`,
          reason: "Trop d'avis avec texte restent sans réponse.",
          consequence: "Les clients peuvent avoir l'impression de ne pas être écoutés."
        });
      } else if (responseRate < 0.8) {
        addItem({
          id: "reply-rate-medium",
          level: "watch",
          title: "Réponses à compléter",
          action: "Traiter les avis sans réponse",
          evidence: `${formatRatio(responseRate)} de taux de réponse`,
          reason: "Le taux de réponse est correct mais peut progresser.",
          consequence: "Quelques avis non traités peuvent réduire l'effet premium."
        });
      }
    }

    const replyDelay = quality?.avg_reply_delay_hours ?? null;
    if (replyDelay !== null) {
      if (replyDelay > 72) {
        addItem({
          id: "reply-delay-high",
          level: "high",
          title: "Délai de réponse élevé",
          action: "Prioriser les réponses en attente",
          evidence: formatHours(replyDelay),
          reason: "Le délai moyen de réponse est long.",
          consequence: "Les clients peuvent sentir un manque de réactivité."
        });
      } else if (replyDelay > 24) {
        addItem({
          id: "reply-delay-watch",
          level: "watch",
          title: "Délai à réduire",
          action: "Répondre sous 24h",
          evidence: formatHours(replyDelay),
          reason: "Le délai dépasse une journée.",
          consequence: "Une réponse plus rapide renforcerait la confiance."
        });
      } else {
        addItem({
          id: "reply-delay-ok",
          level: "ok",
          title: "Délai maîtrisé",
          action: "Maintenir la cadence",
          evidence: formatHours(replyDelay),
          reason: "Les réponses arrivent rapidement.",
          consequence: "La relation client reste suivie et professionnelle."
        });
      }
    }

    const positivePct = overview?.sentiment?.positive_pct ?? null;
    if (positivePct !== null) {
      if (positivePct >= 70) {
        summary.push(`Sentiment positif (${formatPercent(positivePct)})`);
        addItem({
          id: "sentiment-positive",
          level: "ok",
          title: "Sentiment positif",
          action: "Mettre en avant les points forts",
          evidence: `${formatPercent(positivePct)} positif`,
          reason: "La majorité des avis exprime une expérience positive.",
          consequence: "Vous pouvez utiliser ces signaux dans votre communication."
        });
      } else if (positivePct < 50) {
        summary.push(`Sentiment fragile (${formatPercent(positivePct)} positif)`);
        addItem({
          id: "sentiment-low",
          level: "high",
          title: "Sentiment fragile",
          action: "Analyser les avis négatifs",
          evidence: `${formatPercent(positivePct)} positif`,
          reason: "Moins de la moitié du sentiment détecté est positif.",
          consequence: "La perception client peut se dégrader rapidement."
        });
      } else {
        summary.push(`Sentiment à consolider (${formatPercent(positivePct)} positif)`);
        addItem({
          id: "sentiment-watch",
          level: "watch",
          title: "Sentiment à consolider",
          action: "Renforcer les points forts",
          evidence: `${formatPercent(positivePct)} positif`,
          reason: "Le sentiment positif existe mais n'est pas dominant.",
          consequence: "Une expérience plus régulière peut améliorer la perception."
        });
      }
    }

    const topPositive = drivers?.positives[0] ?? null;
    if (topPositive) {
      summary.push(`${topPositive.label} progresse`);
      addItem({
        id: `positive-${topPositive.label}`,
        level: "ok",
        title: `${topPositive.label} ressort`,
        action: "Capitaliser sur ce thème",
        evidence: `${topPositive.count} mentions`,
        reason: "Ce point fort revient dans les avis clients.",
        consequence: "Il peut devenir un argument commercial simple et crédible."
      });
    }

    const topIrritant = drivers?.irritants[0] ?? null;
    if (topIrritant) {
      addItem({
        id: `irritant-${topIrritant.label}`,
        level: topIrritant.count >= 3 ? "high" : "watch",
        title: `${topIrritant.label} revient`,
        action: "Analyser les avis concernés",
        evidence: `${topIrritant.count} mentions`,
        reason: "Ce sujet apparaît dans les irritants clients.",
        consequence: "Il peut freiner la satisfaction s'il revient régulièrement."
      });
    }

    insights?.insights.slice(0, 3).forEach((insight, index) => {
      addItem({
        id: `insight-${index}-${insight.title}`,
        level:
          insight.severity === "bad"
            ? "high"
            : insight.severity === "warn"
              ? "watch"
              : "ok",
        title: insight.title,
        action:
          insight.severity === "bad"
            ? "Traiter en priorité"
            : insight.severity === "warn"
              ? "Suivre cette semaine"
              : "Maintenir l'effort",
        evidence: insight.detail,
        reason: insight.detail,
        consequence:
          insight.severity === "bad"
            ? "Ce signal peut avoir un impact direct sur la réputation."
            : insight.severity === "warn"
              ? "Ce signal peut devenir prioritaire s'il progresse."
              : "Ce point contribue à maintenir une bonne image."
      });
    });

    return {
      summary: summary.slice(0, 5),
      groups: {
        high: items.filter((item) => item.level === "high").slice(0, 3),
        watch: items.filter((item) => item.level === "watch").slice(0, 3),
        ok: items.filter((item) => item.level === "ok").slice(0, 3)
      }
    };
  }, [compare, drivers, insights, overview, quality]);

  const topicExplorer = useMemo(() => {
    const byLabel = new Map<string, AnalyticsTopic>();
    const addTopic = (topic: AnalyticsTopic) => {
      const key = topic.label.toLocaleLowerCase();
      const existing = byLabel.get(key);
      if (!existing || topic.count > existing.count || existing.source === undefined) {
        byLabel.set(key, topic);
      }
    };

    drivers?.positives.forEach((item) => {
      addTopic({
        id: `positive-${item.label}`,
        label: item.label,
        count: item.count,
        share_pct: item.share_pct,
        net_sentiment: item.net_sentiment,
        delta: item.delta,
        delta_pct: item.delta_pct,
        source: item.source,
        tag_ids: item.tag_ids,
        tone: "positive"
      });
    });

    drivers?.irritants.forEach((item) => {
      addTopic({
        id: `negative-${item.label}`,
        label: item.label,
        count: item.count,
        share_pct: item.share_pct,
        net_sentiment: item.net_sentiment,
        delta: item.delta,
        delta_pct: item.delta_pct,
        source: item.source,
        tag_ids: item.tag_ids,
        tone: "negative"
      });
    });

    overview?.topics.strengths.forEach((item) => {
      addTopic({
        id: `strength-${item.label}`,
        label: item.label,
        count: item.count,
        share_pct:
          drivers?.totals.tagged_count && drivers.totals.tagged_count > 0
            ? (item.count / drivers.totals.tagged_count) * 100
            : null,
        net_sentiment: null,
        delta: null,
        delta_pct: null,
        tone: "positive"
      });
    });

    overview?.topics.irritants.forEach((item) => {
      addTopic({
        id: `irritant-${item.label}`,
        label: item.label,
        count: item.count,
        share_pct:
          drivers?.totals.tagged_count && drivers.totals.tagged_count > 0
            ? (item.count / drivers.totals.tagged_count) * 100
            : null,
        net_sentiment: null,
        delta: null,
        delta_pct: null,
        tone: "negative"
      });
    });

    const all = Array.from(byLabel.values()).sort((a, b) => b.count - a.count);
    return {
      all,
      top: all.slice(0, 6),
      rising: all
        .filter((topic) => topic.delta !== null && topic.delta > 0)
        .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
        .slice(0, 4),
      falling: all
        .filter((topic) => topic.delta !== null && topic.delta < 0)
        .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
        .slice(0, 4),
      newTopics: all
        .filter(
          (topic) =>
            topic.delta !== null &&
            topic.delta > 0 &&
            Math.round(topic.delta) >= topic.count
        )
        .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
        .slice(0, 4),
      disappeared: all
        .filter((topic) => topic.delta !== null && topic.delta < 0 && topic.count === 0)
        .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
        .slice(0, 4),
      positiveCount: all
        .filter((topic) => topic.tone === "positive")
        .reduce((sum, topic) => sum + topic.count, 0),
      negativeCount: all
        .filter((topic) => topic.tone === "negative")
        .reduce((sum, topic) => sum + topic.count, 0)
    };
  }, [drivers, overview]);

  const automaticSummary = useMemo(() => {
    const sentences: string[] = [];
    const addSentence = (sentence: string) => {
      if (!sentences.includes(sentence)) {
        sentences.push(sentence);
      }
    };

    const rating = overview?.kpis.avg_rating ?? null;
    if (rating !== null) {
      if (rating >= 4.5) {
        addSentence("La réputation reste excellente.");
      } else if (rating >= 4) {
        addSentence("La réputation est solide.");
      } else if ((overview?.kpis.reviews_total ?? 0) > 0) {
        addSentence("La réputation demande de l'attention.");
      }
    }

    if (compare) {
      const reviewDelta = compare.metrics.review_count.delta;
      if (reviewDelta > 0) {
        addSentence("Le volume d'avis progresse.");
      } else if (reviewDelta < 0) {
        addSentence("Le volume d'avis recule.");
      }

      const replyDelta = compare.metrics.reply_rate.delta;
      if (replyDelta !== null) {
        if (replyDelta < 0) {
          addSentence("Le taux de réponse baisse.");
        } else if (replyDelta > 0) {
          addSentence("Le taux de réponse progresse.");
        }
      }

      const ratingDelta = compare.metrics.avg_rating.delta;
      if (ratingDelta !== null && Math.abs(ratingDelta) <= 0.05) {
        addSentence("La note reste stable.");
      } else if (ratingDelta !== null && ratingDelta < 0) {
        addSentence("La note baisse légèrement.");
      } else if (ratingDelta !== null && ratingDelta > 0) {
        addSentence("La note progresse.");
      }
    }

    const replyDelay = quality?.avg_reply_delay_hours ?? null;
    if (replyDelay !== null) {
      if (replyDelay > 24) {
        addSentence("Le délai de réponse augmente le risque d'attente client.");
      } else {
        addSentence("Le délai de réponse reste maîtrisé.");
      }
    }

    const positivePct = overview?.sentiment?.positive_pct ?? null;
    if (positivePct !== null) {
      if (positivePct >= 70) {
        addSentence("Le sentiment client est majoritairement positif.");
      } else if (positivePct < 50) {
        addSentence("Le sentiment client est fragile.");
      }
    }

    const mainWatch =
      decisionEngine.groups.high[0] ?? decisionEngine.groups.watch[0] ?? null;
    if (mainWatch) {
      addSentence(`Le principal point de vigilance reste : ${mainWatch.title.toLowerCase()}.`);
    }

    const insight = insights?.insights[0] ?? null;
    if (sentences.length === 0 && insight) {
      addSentence(insight.detail);
    }

    return sentences.slice(0, 5);
  }, [compare, decisionEngine, insights, overview, quality]);

  const opportunitiesDetected = useMemo<AssistantListItem[]>(() => {
    const items: AssistantListItem[] = [];
    const addItem = (item: AssistantListItem) => {
      if (!items.some((existing) => existing.id === item.id)) {
        items.push(item);
      }
    };

    drivers?.positives.slice(0, 3).forEach((driver) => {
      addItem({
        id: `positive-${driver.label}`,
        title: `${driver.label} est cité ${driver.count} fois.`,
        detail: "Ce point fort peut être mis en avant auprès des clients.",
        action: "L'utiliser dans vos messages et réponses"
      });
    });

    topicExplorer.rising
      .filter((topic) => topic.tone === "positive")
      .slice(0, 2)
      .forEach((topic) => {
        addItem({
          id: `rising-${topic.label}`,
          title: `${topic.label} progresse.`,
          detail: `${formatDeltaCount(topic.delta)} mentions sur la période.`,
          action: "Renforcer ce point fort"
        });
      });

    if (compare && compare.metrics.review_count.delta > 0) {
      addItem({
        id: "reviews-growth",
        title: "Le volume d'avis augmente.",
        detail: `${formatDeltaCount(compare.metrics.review_count.delta)} avis par rapport à la période précédente.`,
        action: "Continuer à demander des avis"
      });
    }

    const rating = overview?.kpis.avg_rating ?? null;
    if (rating !== null && rating >= 4.5) {
      addItem({
        id: "rating-strong",
        title: "La note moyenne est très forte.",
        detail: `${formatRating(rating)} sur la période.`,
        action: "Mettre cette preuve en avant"
      });
    }

    return items.slice(0, 5);
  }, [compare, drivers, overview, topicExplorer]);

  const risksDetected = useMemo<AssistantListItem[]>(() => {
    const items: AssistantListItem[] = [];
    const addItem = (item: AssistantListItem) => {
      if (!items.some((existing) => existing.id === item.id)) {
        items.push(item);
      }
    };

    const replyDelay = quality?.avg_reply_delay_hours ?? null;
    if (replyDelay !== null && replyDelay > 24) {
      addItem({
        id: "reply-delay",
        title: "Délai moyen élevé.",
        detail: `${formatHours(replyDelay)} avant réponse en moyenne.`,
        action: "Réduire le temps de réponse"
      });
    }

    const replyRateDelta = compare?.metrics.reply_rate.delta ?? null;
    if (replyRateDelta !== null && replyRateDelta < 0) {
      addItem({
        id: "reply-rate-down",
        title: "Taux de réponse en baisse.",
        detail: formatDeltaPoints(replyRateDelta),
        action: "Répondre aux avis en attente"
      });
    }

    if (compare && compare.metrics.review_count.delta < 0) {
      addItem({
        id: "reviews-down",
        title: "Volume d'avis en baisse.",
        detail: `${formatDeltaCount(compare.metrics.review_count.delta)} avis par rapport à la période précédente.`,
        action: "Relancer les demandes d'avis"
      });
    }

    const totalReviews = overview?.kpis.reviews_total ?? null;
    if (totalReviews !== null && totalReviews > 0 && totalReviews <= 3) {
      addItem({
        id: "low-volume",
        title: "Volume faible.",
        detail: `${totalReviews} avis sur la période.`,
        action: "Demander plus d'avis clients"
      });
    }

    drivers?.irritants.slice(0, 3).forEach((driver) => {
      addItem({
        id: `irritant-${driver.label}`,
        title: `${driver.label} revient dans les irritants.`,
        detail: `${driver.count} mentions détectées.`,
        action: "Lire les avis concernés"
      });
    });

    insights?.insights
      .filter((insight) => insight.severity !== "good")
      .slice(0, 2)
      .forEach((insight, index) => {
        addItem({
          id: `insight-risk-${index}-${insight.title}`,
          title: insight.title,
          detail: insight.detail,
          action: insight.severity === "bad" ? "Traiter rapidement" : "Suivre cette semaine"
        });
      });

    return items.slice(0, 5);
  }, [compare, drivers, insights, overview, quality]);

  const monthlyActions = useMemo(() => {
    const toItems = (items: DecisionItem[]): AssistantListItem[] =>
      items
        .map((item) => ({
          id: item.id,
          title: item.action,
          detail: item.title
        }))
        .filter(
          (item, index, list) =>
            list.findIndex((candidate) => candidate.title === item.title) === index
        )
        .slice(0, 3);

    return {
      high: toItems(decisionEngine.groups.high),
      medium: toItems(decisionEngine.groups.watch),
      low: toItems(decisionEngine.groups.ok)
    };
  }, [decisionEngine]);

  const todayBrief = useMemo(() => {
    const todayKey = formatDateKey(new Date(), timeZone);
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const points = timeseries?.points ?? [];
    const todayPoint =
      points.find((point) => point.date.slice(0, 10) === todayKey) ?? null;
    const yesterdayPoint =
      points.find((point) => point.date.slice(0, 10) === yesterdayKey) ?? null;
    const metrics: TodayBriefMetric[] = [];

    if (todayPoint) {
      metrics.push({
        id: "today-reviews",
        label: "Nouveaux avis",
        value: String(todayPoint.review_count),
        detail: "Avis reçus aujourd'hui dans les données chargées.",
        Icon: MessageSquareReply,
        tone: todayPoint.review_count > 0 ? "good" : "neutral"
      });
    }

    if (responseBreakdown) {
      metrics.push({
        id: "pending-replies",
        label: "Avis sans réponse",
        value: String(responseBreakdown.pending),
        detail:
          responseBreakdown.pending > 0
            ? "Backlog de réponses à traiter."
            : "Aucun avis mesuré en attente.",
        Icon: ListChecks,
        tone: responseBreakdown.pending > 0 ? "warn" : "good"
      });
    }

    if (todayPoint && yesterdayPoint) {
      const delta = todayPoint.review_count - yesterdayPoint.review_count;
      metrics.push({
        id: "yesterday-evolution",
        label: "Depuis hier",
        value: formatDeltaCount(delta),
        detail: `${todayPoint.review_count} avis aujourd'hui vs ${yesterdayPoint.review_count} hier.`,
        Icon: TrendingUp,
        tone: delta > 0 ? "good" : delta < 0 ? "warn" : "neutral"
      });
    }

    const positivePoint =
      opportunitiesDetected[0]?.title ?? drivers?.positives[0]?.label ?? null;
    if (positivePoint) {
      metrics.push({
        id: "positive-focus",
        label: "Point positif",
        value: "Signal fort",
        detail: positivePoint,
        Icon: CheckCircle2,
        tone: "good"
      });
    }

    const vigilancePoint =
      decisionEngine.groups.high[0]?.title ??
      decisionEngine.groups.watch[0]?.title ??
      risksDetected[0]?.title ??
      null;
    if (vigilancePoint) {
      metrics.push({
        id: "watch-focus",
        label: "Vigilance",
        value: "À traiter",
        detail: vigilancePoint,
        Icon: AlertTriangle,
        tone: "warn"
      });
    }

    return {
      dateLabel: todayKey,
      metrics
    };
  }, [
    decisionEngine,
    drivers,
    opportunitiesDetected,
    responseBreakdown,
    risksDetected,
    timeZone,
    timeseries
  ]);

  const todayTasks = useMemo<TodayTask[]>(() => {
    const tasks: TodayTask[] = [];
    const addTask = (task: TodayTask) => {
      if (!tasks.some((existing) => existing.id === task.id)) {
        tasks.push(task);
      }
    };

    if (responseBreakdown && responseBreakdown.pending > 0) {
      addTask({
        id: "reply-pending",
        title:
          responseBreakdown.pending === 1
            ? "Répondre à 1 avis restant."
            : `Répondre aux ${responseBreakdown.pending} avis restants.`,
        detail: "Traiter les avis sans réponse visibles dans la période sélectionnée.",
        action: "Ouvrir la boîte",
        path: "/inbox",
        tone: "warn"
      });
    }

    const replyDelay = quality?.avg_reply_delay_hours ?? null;
    if (replyDelay !== null && replyDelay > 24) {
      addTask({
        id: "reduce-reply-delay",
        title: "Réduire le délai de réponse.",
        detail: `Le délai moyen est de ${formatHours(replyDelay)}.`,
        action: "Voir les avis",
        path: "/inbox",
        tone: "warn"
      });
    }

    if (compare && compare.metrics.review_count.delta < 0) {
      addTask({
        id: "collect-reviews-down",
        title: "Continuer la collecte d'avis.",
        detail: `${formatDeltaCount(compare.metrics.review_count.delta)} avis vs période précédente.`,
        action: "Voir Fidélité",
        path: "/loyalty",
        tone: "warn"
      });
    } else if (
      overview &&
      overview.kpis.reviews_total > 0 &&
      overview.kpis.reviews_total <= 3
    ) {
      addTask({
        id: "collect-reviews-low",
        title: "Continuer la collecte d'avis.",
        detail: `${overview.kpis.reviews_total} avis sur la période sélectionnée.`,
        action: "Voir Fidélité",
        path: "/loyalty",
        tone: "neutral"
      });
    }

    const topPositive = drivers?.positives[0] ?? null;
    if (topPositive) {
      addTask({
        id: `capitalize-${topPositive.label}`,
        title: "Capitaliser sur la satisfaction client.",
        detail: `${topPositive.label} revient dans ${topPositive.count} avis.`,
        action: "Analyser",
        path: "/coach",
        tone: "good"
      });
    }

    const topIrritant = drivers?.irritants[0] ?? null;
    if (topIrritant) {
      addTask({
        id: `review-irritant-${topIrritant.label}`,
        title: "Lire les avis liés au point de vigilance.",
        detail: `${topIrritant.label} revient dans ${topIrritant.count} avis.`,
        action: "Voir les avis",
        path: "/inbox",
        tone: "warn"
      });
    }

    return tasks.slice(0, 5);
  }, [compare, drivers, overview, quality, responseBreakdown]);

  const aiSkillCards = useMemo<AiSkillCard[]>(() => {
    const recommendedActions = [
      ...monthlyActions.high,
      ...monthlyActions.medium,
      ...monthlyActions.low
    ]
      .map((item) => ({ label: item.title, detail: item.detail }))
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.label === item.label) === index
      );

    const opportunities = opportunitiesDetected.map((item) => ({
      label: item.title,
      detail: item.action ?? item.detail
    }));

    const risks = risksDetected.map((item) => ({
      label: item.title,
      detail: item.action ?? item.detail
    }));

    return [
      defineAiSkill({
        id: "ai-health-score",
        title: "Score Santé IA",
        badge: healthScore ? `${healthScore.value}/100` : "en attente",
        Icon: Sparkles,
        tone: "dark",
        status: healthScore ? "active" : "empty",
        items: healthScore
          ? [
              {
                label: healthScore.status,
                detail: `${healthScore.availableSignals} signaux disponibles`
              }
            ]
          : [],
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-summary",
        title: "Résumé IA",
        badge: automaticSummary.length > 0 ? "actif" : "vide",
        Icon: LineChart,
        tone: "neutral",
        status: automaticSummary.length > 0 ? "active" : "empty",
        items: automaticSummary.map((line) => ({ label: line })),
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-opportunities",
        title: "Opportunités",
        badge: opportunities.length > 0 ? String(opportunities.length) : "vide",
        Icon: Lightbulb,
        tone: "good",
        status: opportunities.length > 0 ? "active" : "empty",
        items: opportunities,
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-risks",
        title: "Risques",
        badge: risks.length > 0 ? String(risks.length) : "vide",
        Icon: AlertTriangle,
        tone: risks.length > 0 ? "warn" : "neutral",
        status: risks.length > 0 ? "active" : "empty",
        items: risks,
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-winback",
        title: "Clients à reconquérir",
        badge: "prévu",
        Icon: UsersRound,
        tone: "neutral",
        status: "soon",
        items: [],
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-reply-needed",
        title: "Avis sans réponse",
        badge: responseBreakdown ? String(responseBreakdown.pending) : "—",
        Icon: MessageSquareReply,
        tone: responseBreakdown && responseBreakdown.pending > 0 ? "warn" : "good",
        status: responseBreakdown ? "active" : "empty",
        items:
          responseBreakdown && responseBreakdown.pending > 0
            ? [
                {
                  label: `${responseBreakdown.pending} avis à répondre`,
                  detail: `${responseBreakdown.pendingPct}% des avis avec texte`
                }
              ]
            : responseBreakdown
              ? [{ label: "Aucun avis en attente", detail: "Tous les avis mesurés sont traités" }]
              : [],
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-forecast",
        title: "Prévision",
        badge: "prévu",
        Icon: TrendingUp,
        tone: "neutral",
        status: "soon",
        items: [],
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      }),
      defineAiSkill({
        id: "ai-actions",
        title: "Actions recommandées",
        badge: recommendedActions.length > 0 ? String(recommendedActions.length) : "vide",
        Icon: ListChecks,
        tone: "neutral",
        status: recommendedActions.length > 0 ? "active" : "empty",
        items: recommendedActions,
        emptyLabel:
          "Cette Skill sera activée automatiquement lorsque suffisamment de données seront disponibles."
      })
    ];
  }, [
    automaticSummary,
    healthScore,
    monthlyActions,
    opportunitiesDetected,
    responseBreakdown,
    risksDetected
  ]);

  const priorityActions = [
    ...decisionEngine.groups.high,
    ...decisionEngine.groups.watch,
    ...decisionEngine.groups.ok
  ].slice(0, 4);
  const assistantMainRecommendation = priorityActions[0] ?? null;
  const assistantPendingReplies = responseBreakdown?.pending ?? null;

  const locationLabelById = useMemo(() => {
    return new Map(
      locations.map((location) => [
        location.location_resource_name,
        location.location_title ?? location.location_resource_name
      ])
    );
  }, [locations]);

  const loadDrilldown = async (
    driver: { label: string; source: "ai" | "manual"; tag_ids?: string[] },
    offset: number,
    append = false
  ) => {
    if (!session?.access_token) {
      return;
    }
    setDrilldownLoading(true);
    setDrilldownError(null);
    if (!append) {
      setDrilldown(null);
    }
    setDrilldownDriver(driver);
    const params = new URLSearchParams();
    if (locationId !== "all") {
      params.set("location", locationId);
    }
    params.set("period", preset);
    params.set("tz", timeZone);
    if (preset === "custom") {
      if (from) {
        params.set("from", from);
      }
      if (to) {
        params.set("to", to);
      }
    }
    params.set("tag", driver.label);
    params.set("source", driver.source);
    if (driver.tag_ids && driver.tag_ids.length > 0) {
      params.set("tag_ids", driver.tag_ids.join(","));
    }
    params.set("offset", String(offset));
    params.set("limit", "10");
    try {
      const response = await fetch(
        `/api/kpi/analytics?view=drilldown&${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setDrilldownError("Impossible de charger les avis.");
        setDrilldownLoading(false);
        return;
      }
      setDrilldown((prev) => {
        if (append && prev) {
          return {
            ...payload,
            items: [...prev.items, ...payload.items]
          } as AnalyticsDrilldown;
        }
        return payload as AnalyticsDrilldown;
      });
    } catch {
      setDrilldownError("Impossible de charger les avis.");
    } finally {
      setDrilldownLoading(false);
    }
  };

  const openTopicPanel = (topic: AnalyticsTopic) => {
    setSelectedTopic(topic);
    if (topic.source) {
      void loadDrilldown(
        {
          label: topic.label,
          source: topic.source,
          tag_ids: topic.tag_ids
        },
        0
      );
      return;
    }
    setDrilldownDriver(null);
    setDrilldown(null);
    setDrilldownError(null);
  };

  const reasonLabel = overview ? getReasonLabel(overview.reasons) : "";
  const showGranularityToggle = rangeDays > 30 || preset === "all_time";
  const selectedKpiDefinition = selectedKpi
    ? kpis.find((kpi) => kpi.id === selectedKpi) ?? null
    : null;
  const selectedLocations =
    locationId === "all"
      ? locations
      : locations.filter((location) => location.location_resource_name === locationId);
  const hasMultipleLocations = locations.length > 1;
  const multiLocationCards = useMemo<MultiLocationInsightCard[]>(
    () => [
      {
        id: "location-ranking",
        title: "Classement des établissements",
        detail: "Classement disponible dès que les métriques par établissement seront chargées.",
        Icon: BarChart3
      },
      {
        id: "location-best-progress",
        title: "Meilleure progression",
        detail: "Progression comparée entre établissements, sans classement tant que les données locales manquent.",
        Icon: TrendingUp
      },
      {
        id: "location-watch",
        title: "Établissement à surveiller",
        detail: "Signal d'attention basé sur les avis, la note, les réponses et les irritants par établissement.",
        Icon: AlertTriangle
      },
      {
        id: "location-review-volume",
        title: "Contribution au volume d'avis",
        detail: "Part de chaque établissement dans le volume total d'avis.",
        Icon: MessageSquareReply
      },
      {
        id: "location-rating-contribution",
        title: "Contribution à la note globale",
        detail: "Impact de chaque établissement sur la note moyenne globale.",
        Icon: Star
      }
    ],
    []
  );
  const replyableCount = overview?.kpis.replyable_count ?? quality?.replyable_count ?? null;
  const repliedCount = overview?.kpis.replied_count ?? quality?.replied_count ?? null;
  const unrepliedCount =
    replyableCount !== null && repliedCount !== null
      ? Math.max(0, replyableCount - repliedCount)
      : null;

  return (
    <div className="analytics-page space-y-10 pb-12 lg:space-y-12">
      <style>
        {`
          @keyframes analyticsFadeUp {
            from { opacity: 0; transform: translate3d(0, 10px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
          }

          @keyframes analyticsPanelBackdrop {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes analyticsPanelIn {
            from { opacity: 0; transform: translate3d(18px, 0, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
          }

          @keyframes analyticsKpiGlow {
            0% { box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04); }
            100% { box-shadow: 0 16px 38px rgba(15, 23, 42, 0.065); }
          }

          .analytics-page > .analytics-section,
          .analytics-page > section.analytics-section {
            animation: analyticsFadeUp 520ms cubic-bezier(.22, 1, .36, 1) both;
          }

          .analytics-page > .analytics-section:nth-child(3) { animation-delay: 45ms; }
          .analytics-page > .analytics-section:nth-child(4) { animation-delay: 90ms; }
          .analytics-page > .analytics-section:nth-child(5) { animation-delay: 135ms; }
          .analytics-page > .analytics-section:nth-child(6) { animation-delay: 180ms; }

          .analytics-card-motion {
            animation: analyticsFadeUp 420ms cubic-bezier(.22, 1, .36, 1) both;
            transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background-color 180ms ease;
          }

          .analytics-card-motion:hover {
            transform: translate3d(0, -2px, 0);
            box-shadow: 0 16px 38px rgba(15, 23, 42, 0.065);
          }

          .analytics-kpi-motion {
            animation: analyticsFadeUp 480ms cubic-bezier(.22, 1, .36, 1) both, analyticsKpiGlow 900ms ease-out 180ms both;
            will-change: transform;
          }

          .analytics-panel-backdrop {
            animation: analyticsPanelBackdrop 180ms ease-out both;
          }

          .analytics-panel,
          .analytics-actions-menu {
            animation: analyticsPanelIn 260ms cubic-bezier(.22, 1, .36, 1) both;
          }

          @media (prefers-reduced-motion: reduce) {
            .analytics-page > .analytics-section,
            .analytics-page > section.analytics-section,
            .analytics-card-motion,
            .analytics-kpi-motion,
            .analytics-panel-backdrop,
            .analytics-panel,
            .analytics-actions-menu {
              animation: none !important;
              transition: none !important;
            }

            .analytics-card-motion:hover {
              transform: none;
            }
          }
        `}
      </style>
      <section className="analytics-section overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.055)]">
        <div className="border-b border-slate-100/70 bg-gradient-to-br from-white via-white to-slate-50/80 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral" className="bg-white">
                  <LineChart className="mr-1 h-3 w-3" />
                  Analytics
                </Badge>
                {overview && overview.data_status !== "ok" && (
                  <Badge variant="warning">{reasonLabel || "Données partielles"}</Badge>
                )}
                {isFetching && !loading && (
                  <span className="text-xs font-medium text-slate-400">
                    Actualisation...
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Cockpit réputation
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="neutral">Tendances</Badge>
                <Badge variant="neutral">Actions</Badge>
                <Badge variant="neutral">Thèmes</Badge>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-[1.2fr_0.9fr_auto]">
              <label className="min-w-0 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Lieu
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  disabled={locationsLoading}
                >
                  <option value="all">Toutes les fiches</option>
                  {locations.map((location) => (
                    <option
                      key={location.location_resource_name}
                      value={location.location_resource_name}
                    >
                      {location.location_title ?? location.location_resource_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Période
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={preset}
                  onChange={(event) => setPreset(event.target.value as typeof preset)}
                >
                  <option value="this_week">Cette semaine</option>
                  <option value="this_month">Ce mois</option>
                  <option value="this_quarter">Ce trimestre</option>
                  <option value="last_quarter">Trimestre précédent</option>
                  <option value="this_year">Cette année</option>
                  <option value="last_year">Année dernière</option>
                  <option value="all_time">Depuis toujours</option>
                  <option value="custom">Personnalisé</option>
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="mt-6 h-10 rounded-full"
                onClick={() => analyticsQuery.refetch()}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4" />
                Rafraîchir
              </Button>
              {preset === "custom" && (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:col-span-3">
                  <input
                    type="date"
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                  <input
                    type="date"
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </div>
              )}
              {showGranularityToggle && (
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-3">
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Filter className="h-3.5 w-3.5" />
                    Granularité
                  </span>
                  <div className="flex rounded-full border border-slate-200 bg-white p-1">
                    {(["auto", "day", "week"] as const).map((value) => (
                      <Button
                        key={value}
                        variant={granularity === value ? "default" : "ghost"}
                        size="sm"
                        className="h-8 rounded-full px-3"
                        onClick={() => setGranularity(value)}
                      >
                        {value === "auto" ? "Auto" : value === "day" ? "Jour" : "Semaine"}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge variant="neutral">{getPresetLabel(preset)}</Badge>
            <Badge variant="neutral">
              {locationId === "all"
                ? "Toutes les fiches"
                : locationLabelById.get(locationId) ?? locationId}
            </Badge>
            {locationsError && (
              <Badge variant="warning">{locationsError}</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))
            : kpis.map((kpi) => (
                <KpiCard
                  key={kpi.label}
                  id={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  detail={kpi.detail}
                  trend={kpi.trend}
                  delta={kpi.delta}
                  Icon={kpi.Icon}
                  sparklineMetric={kpi.sparklineMetric}
                  points={compactPoints}
                  onOpen={setSelectedKpi}
                />
              ))}
        </div>
      </section>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Aujourd'hui</CardTitle>
                <Badge variant="neutral">{todayBrief.dateLabel}</Badge>
                <Badge variant="neutral">pilotage</Badge>
              </div>
            </div>
            {todayBrief.metrics.length > 0 && (
              <Badge variant="neutral">{todayBrief.metrics.length} signal(s)</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 px-5 pt-6 sm:px-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {showSkeleton ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))
            ) : todayBrief.metrics.length > 0 ? (
              todayBrief.metrics.map((metric) => (
                <TodayMetricTile key={metric.id} metric={metric} />
              ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyState label={EMPTY_ANALYSIS} />
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-semibold text-slate-950">
                  À faire aujourd'hui
                </p>
              </div>
              <Badge variant="neutral">{todayTasks.length}</Badge>
            </div>
            {showSkeleton ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : todayTasks.length > 0 ? (
              <div className="space-y-3">
                {todayTasks.map((task) => (
                  <TodayTaskCard key={task.id} task={task} onNavigate={navigate} />
                ))}
              </div>
            ) : (
              <EmptyState label="Aucune tâche prioritaire avec les données actuelles." />
            )}
          </section>
        </CardContent>
      </DashboardCard>

      {error && (
        <DashboardCard>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-amber-700">{error}</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </CardContent>
        </DashboardCard>
      )}

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Recommandation IA</CardTitle>
                <Badge variant={insights?.used_ai ? "success" : "neutral"}>
                  {insights?.used_ai ? "IA" : "analyse automatique"}
                </Badge>
                <Badge variant="neutral">priorisé</Badge>
              </div>
            </div>
            <Badge variant="neutral">{priorityActions.length} recommandation(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-7 px-5 pt-6 sm:px-6">
          {showSkeleton ? (
            <Skeleton className="h-[560px] rounded-2xl" />
          ) : (
            <>
              <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-[0_16px_44px_rgba(15,23,42,0.12)]">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <Sparkles className="h-4 w-4 text-white" />
                  Recommandation principale
                </div>
                {assistantMainRecommendation ? (
                  <div className="grid gap-4 lg:grid-cols-4">
                    <div>
                      <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        Constat
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">
                        {assistantMainRecommendation.reason}{" "}
                        <span className="text-slate-400">
                          ({assistantMainRecommendation.evidence})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        Risque
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">
                        {getDecisionRisk(assistantMainRecommendation)}
                      </p>
                    </div>
                    <div>
                      <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        Action
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">
                        {getDecisionAction(
                          assistantMainRecommendation,
                          assistantPendingReplies
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        Impact attendu
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">
                        {getDecisionImpact(assistantMainRecommendation)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">{EMPTY_ANALYSIS}</p>
                )}
              </section>

              <section className="grid gap-5 xl:grid-cols-3">
                {(["high", "watch", "ok"] as const).map((level) => {
                  const meta = decisionLevelMeta[level];
                  const items = decisionEngine.groups[level];
                  return (
                    <div
                      key={level}
                      className={cn("rounded-2xl border p-4", meta.cardClass)}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                          <p className="text-sm font-semibold text-slate-950">
                            {meta.label}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            meta.badgeClass
                          )}
                        >
                          {items.length}
                        </span>
                      </div>

                      {items.length > 0 ? (
                        <div className="space-y-3">
                          {items.map((item) => (
                            <article
                              key={item.id}
                              className="rounded-2xl bg-white/80 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-950">
                                    {item.title}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-slate-500">
                                    {item.evidence}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid gap-2 text-xs text-slate-600">
                                {[
                                  { label: "Constat", value: item.reason },
                                  { label: "Risque", value: getDecisionRisk(item) },
                                  {
                                    label: "Action",
                                    value: getDecisionAction(item, assistantPendingReplies)
                                  },
                                  { label: "Impact", value: getDecisionImpact(item) }
                                ].map((row) => (
                                  <div
                                    key={row.label}
                                    className="grid gap-2 rounded-xl bg-slate-50 px-3 py-2 sm:grid-cols-[82px_1fr]"
                                  >
                                    <span className="inline-flex h-6 w-fit items-center rounded-full bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                      {row.label}
                                    </span>
                                    <span className="leading-5">{row.value}</span>
                                  </div>
                                ))}
                              </div>
                              <ProblemActionButtons onNavigate={navigate} compact />
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState label="Aucun signal sur ce niveau." />
                      )}
                    </div>
                  );
                })}
              </section>

              <AnalyticsDisclosure
                title="Signaux secondaires"
                badge={`${opportunitiesDetected.length + risksDetected.length} signal${
                  opportunitiesDetected.length + risksDetected.length > 1 ? "s" : ""
                }`}
              >
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50/60 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">
                        À valoriser
                      </p>
                      <Badge variant="success">{opportunitiesDetected.length}</Badge>
                    </div>
                    {opportunitiesDetected.length > 0 ? (
                      <div className="space-y-3">
                        {opportunitiesDetected.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl bg-white/85 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="success">Constat</Badge>
                              <p className="text-sm font-semibold text-slate-950">
                                {item.title}
                              </p>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">{item.detail}</p>
                            {item.action && (
                              <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {item.action}
                              </p>
                            )}
                            <p className="mt-3 text-xs text-slate-600">
                              <span className="font-semibold text-slate-900">Impact : </span>
                              {getAssistantListImpact(item, "opportunity")}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucune opportunité détectée avec les données actuelles." />
                    )}
                  </div>

                  <div className="rounded-2xl bg-red-50/50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">
                        À prévenir
                      </p>
                      <Badge variant="warning">{risksDetected.length}</Badge>
                    </div>
                    {risksDetected.length > 0 ? (
                      <div className="space-y-3">
                        {risksDetected.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl bg-white/85 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="warning">Risque</Badge>
                              <p className="text-sm font-semibold text-slate-950">
                                {item.title}
                              </p>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">{item.detail}</p>
                            {item.action && (
                              <p className="mt-3 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                                {item.action}
                              </p>
                            )}
                            <p className="mt-3 text-xs text-slate-600">
                              <span className="font-semibold text-slate-900">Impact : </span>
                              {getAssistantListImpact(item, "risk")}
                            </p>
                            <ProblemActionButtons onNavigate={navigate} compact />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucun risque détecté avec les données actuelles." />
                    )}
                  </div>
                </div>
              </AnalyticsDisclosure>

              <AnalyticsDisclosure title="Plan d'action" badge="impact attendu">
                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    {
                      label: "Impact élevé",
                      items: monthlyActions.high,
                      className: "border-red-100 bg-white"
                    },
                    {
                      label: "Impact moyen",
                      items: monthlyActions.medium,
                      className: "border-amber-100 bg-white"
                    },
                    {
                      label: "Impact faible",
                      items: monthlyActions.low,
                      className: "border-slate-100 bg-white"
                    }
                  ].map((group) => (
                    <div key={group.label} className={cn("rounded-2xl border p-4", group.className)}>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {group.label}
                      </p>
                      {group.items.length > 0 ? (
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                              <ProblemActionButtons onNavigate={navigate} compact />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Aucune action pour ce niveau.</p>
                      )}
                    </div>
                  ))}
                </div>
              </AnalyticsDisclosure>
            </>
          )}
        </CardContent>
      </DashboardCard>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Réputation</CardTitle>
              <Badge variant="neutral">tendance</Badge>
            </div>
            <select
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              value={metric}
              onChange={(event) => setMetric(event.target.value as MetricKey)}
            >
              <option value="reviews">Avis</option>
              <option value="avg_rating">Note moyenne</option>
              <option value="reply_rate">Taux de réponse</option>
              <option value="neg_share">Avis négatifs</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-5 pt-6 sm:px-6">
          {showSkeleton ? (
            <Skeleton className="h-[400px] rounded-2xl" />
          ) : (
            <AreaChart
              points={chartPoints}
              metric={metric}
              sentimentLabel={
                overview?.sentiment?.positive_pct === null ||
                overview?.sentiment?.positive_pct === undefined
                  ? null
                  : `${formatPercent(overview.sentiment.positive_pct)} positif`
              }
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {chartInsights.length > 0 ? (
              chartInsights.map((fact) => {
                const FactIcon = fact.Icon;
                return (
                  <div
                    key={fact.label}
                    className="rounded-2xl bg-slate-50/80 p-3"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      <FactIcon className="h-3.5 w-3.5" />
                      {fact.label}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                      {fact.value}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{fact.detail}</p>
                  </div>
                );
              })
            ) : (
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
                <EmptyState />
              </div>
            )}
          </div>
        </CardContent>
      </DashboardCard>

      <section className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Périodes</CardTitle>
              <Badge variant="neutral">périodes</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pt-6 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : compare ? (
              <>
                <div className="grid gap-3 rounded-2xl bg-slate-50/70 p-4 text-xs text-slate-500 sm:grid-cols-2">
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Période actuelle
                    </p>
                    <p className="mt-1 text-slate-700">
                      {compare.periodA.start.slice(0, 10)} -{" "}
                      {compare.periodA.end.slice(0, 10)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Période précédente
                    </p>
                    <p className="mt-1 text-slate-700">
                      {compare.periodB.start.slice(0, 10)} -{" "}
                      {compare.periodB.end.slice(0, 10)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {compareRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid gap-3 rounded-2xl bg-slate-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800">{row.label}</p>
                          <TrendPill state={row.trend} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>Actuelle: {row.a}</span>
                          <span>Précédente: {row.b}</span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-semibold text-slate-950">{row.delta}</p>
                        <p className="text-xs text-slate-500">{row.deltaPct}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </DashboardCard>

        <DashboardCard>
          <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Réponses</CardTitle>
              <Badge variant="neutral">qualité</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pt-6 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-48 rounded-2xl" />
            ) : quality ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Taux</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatRatio(quality.reply_rate)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Délai</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatHours(quality.avg_reply_delay_hours)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">&lt; 24h</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatRatio(quality.sla_24h)}
                    </p>
                  </div>
                </div>
                <CompactBars points={compactPoints} metric="reply_rate" />
                <p className="text-xs text-slate-500">
                  {quality.replied_with_time_count} réponses avec délai mesuré.
                </p>
              </>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </DashboardCard>

        <DashboardCard>
          <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Sentiment</CardTitle>
              <Badge variant="neutral">répartition</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 pt-6 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-52 rounded-2xl" />
            ) : (
              <SentimentDonut sentiment={overview?.sentiment} />
            )}
          </CardContent>
        </DashboardCard>

        <DashboardCard>
          <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Notes</CardTitle>
              <Badge variant="neutral">1 à 5</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 pt-6 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-44 rounded-2xl" />
            ) : (
              <RatingDistribution ratings={overview?.ratings ?? null} total={ratingTotal} />
            )}
          </CardContent>
        </DashboardCard>
      </section>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Établissements</CardTitle>
                <Badge variant={hasMultipleLocations ? "success" : "neutral"}>
                  {locations.length} établissement{locations.length > 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="neutral">Multi-sites</Badge>
                <Badge variant="neutral">Sans classement fictif</Badge>
              </div>
            </div>
            <Badge variant="neutral">
              {locationId === "all" ? "Toutes les fiches" : "Filtre actif"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-5 pt-6 sm:px-6">
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedLocations.slice(0, 6).map((location) => (
                <Badge key={location.location_resource_name} variant="neutral">
                  {location.location_title ?? location.location_resource_name}
                </Badge>
              ))}
              {selectedLocations.length > 6 && (
                <Badge variant="neutral">+{selectedLocations.length - 6}</Badge>
              )}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {multiLocationCards.map((card) => (
              <MultiLocationInsightCardView key={card.id} card={card} />
            ))}
          </div>
        </CardContent>
      </DashboardCard>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Thèmes</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="neutral">{topicExplorer.all.length} thèmes</Badge>
                <Badge variant="success">{topicExplorer.positiveCount} mentions positives</Badge>
                <Badge variant="warning">{topicExplorer.negativeCount} mentions irritantes</Badge>
              </div>
            </div>
            <div className="grid min-w-[220px] gap-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Répartition</span>
                <span>
                  {topicExplorer.positiveCount + topicExplorer.negativeCount > 0
                    ? `${Math.round(
                        (topicExplorer.positiveCount /
                          (topicExplorer.positiveCount + topicExplorer.negativeCount)) *
                          100
                      )}% positif`
                    : "—"}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-slate-950"
                  style={{
                    width:
                      topicExplorer.positiveCount + topicExplorer.negativeCount > 0
                        ? `${Math.round(
                            (topicExplorer.positiveCount /
                              (topicExplorer.positiveCount + topicExplorer.negativeCount)) *
                              100
                          )}%`
                        : "0%"
                  }}
                />
                <div
                  className="bg-red-500"
                  style={{
                    width:
                      topicExplorer.positiveCount + topicExplorer.negativeCount > 0
                        ? `${Math.round(
                            (topicExplorer.negativeCount /
                              (topicExplorer.positiveCount + topicExplorer.negativeCount)) *
                              100
                          )}%`
                        : "0%"
                  }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-5 pt-6 sm:px-6">
          {showSkeleton ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          ) : topicExplorer.all.length > 0 ? (
            <>
              <div className="grid gap-6 xl:grid-cols-3">
                <TopicColumn
                  title="Top thèmes"
                  badge="mentions"
                  topics={topicExplorer.top}
                  emptyLabel={EMPTY_ANALYSIS}
                  onOpen={openTopicPanel}
                />
                <TopicColumn
                  title="Thèmes en progression"
                  badge="hausse"
                  badgeVariant="success"
                  topics={topicExplorer.rising}
                  emptyLabel="Pas encore assez de données pour mesurer une progression."
                  onOpen={openTopicPanel}
                />
                <TopicColumn
                  title="Thèmes en baisse"
                  badge="baisse"
                  badgeVariant="warning"
                  topics={topicExplorer.falling}
                  emptyLabel="Aucune baisse de thème détectée sur la période."
                  onOpen={openTopicPanel}
                />
              </div>
              <AnalyticsDisclosure
                title="Autres signaux thèmes"
                badge={`${topicExplorer.newTopics.length + topicExplorer.disappeared.length} signal${
                  topicExplorer.newTopics.length + topicExplorer.disappeared.length > 1 ? "s" : ""
                }`}
              >
                <div className="grid gap-6 xl:grid-cols-2">
                  <TopicColumn
                    title="Nouveaux thèmes"
                    badge="nouveau"
                    badgeVariant="success"
                    topics={topicExplorer.newTopics}
                    emptyLabel="Aucun nouveau thème détecté avec les données disponibles."
                    onOpen={openTopicPanel}
                  />
                  <TopicColumn
                    title="Thèmes disparus"
                    badge="disparu"
                    topics={topicExplorer.disappeared}
                    emptyLabel="Aucun thème disparu n'est disponible dans les données actuelles."
                    onOpen={openTopicPanel}
                  />
                </div>
              </AnalyticsDisclosure>
            </>
          ) : (
            <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
          )}
        </CardContent>
      </DashboardCard>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Skills IA</CardTitle>
                <Badge variant="neutral">avancé</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="neutral">Futur</Badge>
                <Badge variant="neutral">Activation auto</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Sans nouvelle API
              </Badge>
              <Badge variant="neutral">États vides</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 pt-6 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          {showSkeleton
            ? Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-52 rounded-2xl" />
              ))
            : aiSkillCards.map((card) => (
                <AiSkillCardView key={card.id} card={card} />
              ))}
        </CardContent>
      </DashboardCard>

      {selectedKpi && selectedKpiDefinition && (
        <div className="analytics-panel-backdrop fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
          <DashboardCard className="analytics-panel h-full w-full max-w-2xl overflow-y-auto">
            <CardHeader className="border-b border-slate-100/60 bg-slate-50/30">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="neutral">Indicateur</Badge>
                    <TrendPill
                      state={selectedKpiDefinition.trend}
                      label={selectedKpiDefinition.delta}
                    />
                  </div>
                  <CardTitle className="truncate">{selectedKpiDefinition.label}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedKpiDefinition.value} · {selectedKpiDefinition.detail}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full"
                  onClick={() => setSelectedKpi(null)}
                >
                  Fermer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <KpiDetailSection title="Actions rapides">
                <ProblemActionButtons onNavigate={navigate} />
              </KpiDetailSection>

              {selectedKpi === "reviews" && (
                <>
                  <KpiDetailSection title="Évolution" badge={getPresetLabel(preset)}>
                    {chartPoints.length > 0 ? (
                      <AreaChart points={chartPoints} metric="reviews" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Répartition dans le temps">
                    {compactPoints.length > 0 ? (
                      <CompactBars points={compactPoints} metric="reviews" />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Établissements concernés" badge={String(selectedLocations.length)}>
                    {selectedLocations.length > 0 ? (
                      <div className="space-y-2">
                        {selectedLocations.map((location) => (
                          <div
                            key={location.location_resource_name}
                            className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          >
                            {location.location_title ?? location.location_resource_name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucun établissement chargé pour ce filtre." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis concernés">
                    <EmptyState label="La liste détaillée des avis n'est pas disponible dans les données déjà chargées pour cet indicateur." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "avg_rating" && (
                <>
                  <KpiDetailSection title="Évolution" badge={getPresetLabel(preset)}>
                    {chartPoints.some((point) => point.avg_rating !== null) ? (
                      <AreaChart points={chartPoints} metric="avg_rating" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Répartition des notes">
                    <RatingDistribution ratings={overview?.ratings ?? null} total={ratingTotal} />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis ayant fait monter la note">
                    <EmptyState label="Les avis individuels qui font monter la note ne sont pas disponibles dans les données déjà chargées." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis ayant fait baisser la note">
                    <EmptyState label="Les avis individuels qui font baisser la note ne sont pas disponibles dans les données déjà chargées." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "reply_rate" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <KpiDetailMetric
                      label="Avis répondus"
                      value={repliedCount === null ? "—" : String(repliedCount)}
                      detail="avis avec texte"
                    />
                    <KpiDetailMetric
                      label="Avis non répondus"
                      value={unrepliedCount === null ? "—" : String(unrepliedCount)}
                      detail="à traiter"
                    />
                    <KpiDetailMetric
                      label="Délai moyen"
                      value={formatHours(quality?.avg_reply_delay_hours ?? null)}
                      detail="avant réponse"
                    />
                    <KpiDetailMetric
                      label="Réponses < 24h"
                      value={formatRatio(quality?.sla_24h ?? null)}
                      detail="part des réponses mesurées"
                    />
                  </div>

                  <KpiDetailSection title="Évolution">
                    {chartPoints.some((point) => point.reply_rate !== null) ? (
                      <AreaChart points={chartPoints} metric="reply_rate" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis répondus">
                    <EmptyState label="La liste des avis répondus n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis non répondus">
                    <EmptyState label="La liste des avis non répondus n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Réponses > 7 jours">
                    <EmptyState label="Le détail des réponses de plus de 7 jours n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "reply_delay" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <KpiDetailMetric
                      label="Délai moyen"
                      value={formatHours(quality?.avg_reply_delay_hours ?? null)}
                    />
                    <KpiDetailMetric
                      label="Réponses mesurées"
                      value={
                        quality?.replied_with_time_count === undefined
                          ? "—"
                          : String(quality.replied_with_time_count)
                      }
                    />
                    <KpiDetailMetric
                      label="Réponses < 24h"
                      value={formatRatio(quality?.sla_24h ?? null)}
                    />
                  </div>

                  <KpiDetailSection title="Histogramme">
                    <EmptyState label="L'histogramme des délais n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Évolution">
                    <EmptyState label="L'évolution du délai moyen n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis les plus lents">
                    <EmptyState label="La liste des avis les plus lents n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "sentiment" && (
                <>
                  <KpiDetailSection title="Répartition">
                    <SentimentDonut sentiment={overview?.sentiment ?? null} />
                  </KpiDetailSection>

                  <KpiDetailSection title="Thèmes positifs" badge={String(topicExplorer.positiveCount)}>
                    {topicExplorer.top.filter((topic) => topic.tone === "positive").length > 0 ? (
                      <div className="space-y-2">
                        {topicExplorer.top
                          .filter((topic) => topic.tone === "positive")
                          .map((topic) => (
                            <TopicRow
                              key={topic.id}
                              item={topic}
                              onClick={() => {
                                setSelectedKpi(null);
                                openTopicPanel(topic);
                              }}
                            />
                          ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucun thème positif disponible dans les données chargées." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Thèmes négatifs" badge={String(topicExplorer.negativeCount)}>
                    {topicExplorer.top.filter((topic) => topic.tone === "negative").length > 0 ? (
                      <div className="space-y-2">
                        {topicExplorer.top
                          .filter((topic) => topic.tone === "negative")
                          .map((topic) => (
                            <TopicRow
                              key={topic.id}
                              item={topic}
                              onClick={() => {
                                setSelectedKpi(null);
                                openTopicPanel(topic);
                              }}
                            />
                          ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucun thème négatif disponible dans les données chargées." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis concernés">
                    <EmptyState label="La liste des avis par sentiment n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "neg_share" && (
                <>
                  <KpiDetailSection title="Évolution des avis négatifs">
                    {chartPoints.some((point) => point.neg_share !== null) ? (
                      <AreaChart points={chartPoints} metric="neg_share" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Thèmes irritants" badge={String(topicExplorer.negativeCount)}>
                    {topicExplorer.top.filter((topic) => topic.tone === "negative").length > 0 ? (
                      <div className="space-y-2">
                        {topicExplorer.top
                          .filter((topic) => topic.tone === "negative")
                          .map((topic) => (
                            <TopicRow
                              key={topic.id}
                              item={topic}
                              onClick={() => {
                                setSelectedKpi(null);
                                openTopicPanel(topic);
                              }}
                            />
                          ))}
                      </div>
                    ) : (
                      <EmptyState label="Aucun irritant disponible dans les données chargées." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis concernés">
                    <EmptyState label="La liste des avis négatifs n'est pas disponible dans les données déjà chargées." />
                  </KpiDetailSection>
                </>
              )}
            </CardContent>
          </DashboardCard>
        </div>
      )}

      {selectedTopic && (
        <div className="analytics-panel-backdrop fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
          <DashboardCard className="analytics-panel h-full w-full max-w-xl overflow-y-auto">
            <CardHeader className="border-b border-slate-100/60 bg-slate-50/30">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge
                      variant={
                        selectedTopic.tone === "positive"
                          ? "success"
                          : selectedTopic.tone === "negative"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {selectedTopic.tone === "positive"
                        ? "Point fort"
                        : selectedTopic.tone === "negative"
                          ? "Irritant"
                          : "Thème"}
                    </Badge>
                    <Badge variant="neutral">{selectedTopic.count} mentions</Badge>
                  </div>
                  <CardTitle className="truncate">{selectedTopic.label}</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full"
                  onClick={() => {
                    setSelectedTopic(null);
                    setDrilldownDriver(null);
                    setDrilldown(null);
                    setDrilldownError(null);
                  }}
                >
                  Fermer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="rounded-2xl bg-slate-950 p-4 text-white shadow-[0_16px_44px_rgba(15,23,42,0.12)]">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <Sparkles className="h-4 w-4 text-white" />
                  Résumé automatique
                </div>
                <p className="text-sm leading-6 text-slate-100">
                  {getTopicSummary(selectedTopic)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Mentions</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {selectedTopic.count}
                  </p>
                  <p className="text-xs text-slate-500">avis concernés</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Importance</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {formatShare(selectedTopic.share_pct)}
                  </p>
                  <p className="text-xs text-slate-500">répartition</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Sentiment</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {selectedTopic.net_sentiment === null
                      ? "—"
                      : selectedTopic.net_sentiment}
                  </p>
                  <p className="text-xs text-slate-500">solde</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Poids</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {formatShare(selectedTopic.share_pct)}
                  </p>
                  <p className="text-xs text-slate-500">dans les thèmes</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Impact</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {getTopicImpactLabel(selectedTopic)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {getTopicToneLabel(selectedTopic.tone).toLowerCase()}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">Évolution</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {formatDeltaCount(selectedTopic.delta)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDeltaPct(selectedTopic.delta_pct)}
                  </p>
                </div>
              </div>

    <div className="analytics-card-motion rounded-2xl border border-slate-100/70 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Évolution</p>
                  <TrendPill
                    state={getTrendState(
                      selectedTopic.delta,
                      selectedTopic.tone !== "negative"
                    )}
                    label={`${formatDeltaCount(selectedTopic.delta)} · ${formatDeltaPct(
                      selectedTopic.delta_pct
                    )}`}
                  />
                </div>
                {selectedTopic.delta === null ? (
                  <div className="mt-4">
                    <EmptyState label="Pas encore assez de données pour mesurer l'évolution de ce thème." />
                  </div>
                ) : (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-2 rounded-full",
                        selectedTopic.delta > 0 ? "bg-slate-950" : "bg-red-500"
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(8, Math.abs(selectedTopic.delta_pct ?? selectedTopic.delta) * 100)
                        )}%`
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100/70 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Répartition positive / négative
                  </p>
                  <Badge variant="neutral">si disponible</Badge>
                </div>
                <EmptyState label="La répartition positive / négative détaillée n'est pas disponible pour ce thème." />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Avis concernés</p>
                  <Badge variant="neutral">
                    {drilldown?.items.length ?? 0}
                  </Badge>
                </div>
              {drilldownLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
              {drilldownError && (
                <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                  {drilldownError}
                </p>
              )}
              {!drilldownLoading && !drilldownError && drilldown ? (
                <div className="space-y-3">
                  {drilldown.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-slate-50/70 p-4 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {item.rating ?? "—"}★ ·{" "}
                          {item.create_time ? item.create_time.slice(0, 10) : "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {item.location_id
                            ? locationLabelById.get(item.location_id) ?? item.location_id
                            : "—"}
                        </span>
                      </div>
                      <p className="mt-3 leading-6 text-slate-700">
                        {item.comment ?? "Avis sans commentaire."}
                      </p>
                    </div>
                  ))}
                  {drilldown.has_more && drilldownDriver && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        loadDrilldown(drilldownDriver, drilldown.items.length, true)
                      }
                      disabled={drilldownLoading}
                    >
                      Voir plus
                    </Button>
                  )}
                </div>
              ) : !drilldownLoading && !drilldownError ? (
                <EmptyState label="Aucun avis concerné n'est disponible côté client pour ce thème." />
              ) : null}
              </div>

              <div className="rounded-2xl border border-slate-100/70 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Réponses associées</p>
                  <Badge variant="neutral">si disponibles</Badge>
                </div>
                <EmptyState label="Aucune réponse associée n'est disponible dans les données chargées pour ce thème." />
              </div>
            </CardContent>
          </DashboardCard>
        </div>
      )}
    </div>
  );
};

export { Analytics };
