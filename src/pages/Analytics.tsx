import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
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
type TimelineEvent = {
  id: string;
  label: string;
  detail: string;
  level: DecisionLevel;
};
type AiSkillCard = {
  id: string;
  title: string;
  badge: string;
  Icon: typeof Sparkles;
  tone: "dark" | "good" | "warn" | "neutral";
  items: Array<{ label: string; detail?: string }>;
  emptyLabel: string;
};

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
    className: "border-rose-200 bg-rose-50 text-rose-700"
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
      "overflow-hidden rounded-[1.35rem] border-slate-200/80 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.06)]",
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

const AiSkillCardView = ({ card }: { card: AiSkillCard }) => {
  const toneClass = {
    dark: "border-slate-200 bg-slate-950 text-white",
    good: "border-emerald-100 bg-emerald-50/70 text-slate-950",
    warn: "border-amber-100 bg-amber-50/70 text-slate-950",
    neutral: "border-slate-100 bg-white text-slate-950"
  }[card.tone];
  const iconClass = card.tone === "dark" ? "bg-white/10 text-white" : "bg-white text-slate-700";
  const badgeVariant =
    card.tone === "good" ? "success" : card.tone === "warn" ? "warning" : "neutral";
  const Icon = card.Icon;

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", toneClass)}>
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
              Skill IA
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
            "mt-4 flex min-h-[118px] items-center justify-center rounded-xl border border-dashed px-3 text-center text-sm",
            card.tone === "dark"
              ? "border-white/15 bg-white/5 text-slate-300"
              : "border-slate-200 bg-white/60 text-slate-500"
          )}
        >
          {card.emptyLabel}
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
  label,
  value,
  detail,
  trend,
  delta,
  Icon,
  sparklineMetric,
  points
}: {
  label: string;
  value: string;
  detail: string;
  trend: TrendState;
  delta: string;
  Icon: typeof BarChart3;
  sparklineMetric: MetricKey;
  points: AnalyticsPoint[];
}) => (
  <div className="group min-w-0 rounded-[1.15rem] border border-slate-200/80 bg-white px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
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
  </div>
);

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
        className="relative overflow-hidden rounded-[1.35rem] border border-slate-100 bg-gradient-to-b from-slate-50 via-white to-white px-2 py-3"
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
            className="pointer-events-none absolute z-10 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur"
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
    <div className="flex h-28 items-end gap-1.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-slate-100 bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{item.count} mentions</span>
            <span>{item.share_pct === null ? "Importance —" : formatShare(item.share_pct)}</span>
            <span>
              {item.net_sentiment === null ? "Sentiment —" : `Solde ${item.net_sentiment}`}
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
      <div className="mt-3 h-1.5 rounded-full bg-slate-100">
        <div
          className={cn("h-1.5 rounded-full", toneClass)}
          style={{ width: `${width}%` }}
        />
      </div>
    </button>
  );
};

const Analytics = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: AnalyticsProps) => {
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
        label: "Avis",
        value: formatCount(overview?.kpis.reviews_total),
        detail: "vs période précédente",
        trend: reviewTrend,
        delta: compare ? formatDeltaCount(compare.metrics.review_count.delta) : "—",
        Icon: BarChart3,
        sparklineMetric: "reviews" as MetricKey
      },
      {
        label: "Note moyenne",
        value: formatRating(overview?.kpis.avg_rating ?? null),
        detail: "qualité perçue",
        trend: ratingTrend,
        delta: compare ? formatDelta(compare.metrics.avg_rating.delta) : "—",
        Icon: Star,
        sparklineMetric: "avg_rating" as MetricKey
      },
      {
        label: "Taux réponse",
        value: formatPercent(overview?.kpis.response_rate_pct ?? null),
        detail: "avis avec texte",
        trend: replyTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.reply_rate.delta) : "—",
        Icon: MessageSquareReply,
        sparklineMetric: "reply_rate" as MetricKey
      },
      {
        label: "Avis négatifs",
        value: formatPercent(overview?.kpis.negative_share_pct ?? null),
        detail: "part du volume",
        trend: negativeTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.neg_share.delta) : "—",
        Icon: TrendingUp,
        sparklineMetric: "neg_share" as MetricKey
      },
      {
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
  }, [compare, overview]);

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
          evidence: `${compare.metrics.review_count.a} vs ${compare.metrics.review_count.b} avis`
        });
      } else if (reviewDelta < 0) {
        summary.push(`Volume en baisse (${formatDeltaCount(reviewDelta)})`);
        addItem({
          id: "reviews-down",
          level: Math.abs(reviewDelta) >= 3 ? "high" : "watch",
          title: "Les avis diminuent",
          action: "Relancer les demandes d'avis",
          evidence: `${compare.metrics.review_count.a} vs ${compare.metrics.review_count.b} avis`
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
            )}`
          });
        } else if (replyDelta < 0) {
          summary.push(`Réponse en léger recul (${formatDeltaPoints(replyDelta)})`);
          addItem({
            id: "reply-rate-watch",
            level: "watch",
            title: "Réponse à surveiller",
            action: "Traiter les avis sans réponse",
            evidence: `${formatRatio(compare.metrics.reply_rate.a)} actuellement`
          });
        } else if (replyDelta > 0) {
          summary.push(`Réponse en hausse (${formatDeltaPoints(replyDelta)})`);
          addItem({
            id: "reply-rate-up",
            level: "ok",
            title: "Réactivité en hausse",
            action: "Conserver le rythme de réponse",
            evidence: `${formatRatio(compare.metrics.reply_rate.a)} actuellement`
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
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`
          });
        } else if (ratingDelta < 0) {
          summary.push(`Note en léger recul (${formatDelta(ratingDelta)})`);
          addItem({
            id: "rating-watch",
            level: "watch",
            title: "Note à surveiller",
            action: "Identifier les irritants récurrents",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`
          });
        } else if (Math.abs(ratingDelta) <= 0.05) {
          summary.push("Note stable");
          addItem({
            id: "rating-stable",
            level: "ok",
            title: "Note stable",
            action: "Maintenir le niveau de service",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`
          });
        } else {
          summary.push(`Note en hausse (${formatDelta(ratingDelta)})`);
          addItem({
            id: "rating-up",
            level: "ok",
            title: "Note en progression",
            action: "Capitaliser sur les points forts",
            evidence: `${formatRating(compare.metrics.avg_rating.a)} actuellement`
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
          evidence: `${formatRatio(compare.metrics.neg_share.a)} actuellement`
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
          evidence: `${formatRatio(responseRate)} de taux de réponse`
        });
      } else if (responseRate < 0.8) {
        addItem({
          id: "reply-rate-medium",
          level: "watch",
          title: "Réponses à compléter",
          action: "Traiter les avis sans réponse",
          evidence: `${formatRatio(responseRate)} de taux de réponse`
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
          evidence: formatHours(replyDelay)
        });
      } else if (replyDelay > 24) {
        addItem({
          id: "reply-delay-watch",
          level: "watch",
          title: "Délai à réduire",
          action: "Répondre sous 24h",
          evidence: formatHours(replyDelay)
        });
      } else {
        addItem({
          id: "reply-delay-ok",
          level: "ok",
          title: "Délai maîtrisé",
          action: "Maintenir la cadence",
          evidence: formatHours(replyDelay)
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
          evidence: `${formatPercent(positivePct)} positif`
        });
      } else if (positivePct < 50) {
        summary.push(`Sentiment fragile (${formatPercent(positivePct)} positif)`);
        addItem({
          id: "sentiment-low",
          level: "high",
          title: "Sentiment fragile",
          action: "Analyser les avis négatifs",
          evidence: `${formatPercent(positivePct)} positif`
        });
      } else {
        summary.push(`Sentiment à consolider (${formatPercent(positivePct)} positif)`);
        addItem({
          id: "sentiment-watch",
          level: "watch",
          title: "Sentiment à consolider",
          action: "Renforcer les points forts",
          evidence: `${formatPercent(positivePct)} positif`
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
        evidence: `${topPositive.count} mentions`
      });
    }

    const topIrritant = drivers?.irritants[0] ?? null;
    if (topIrritant) {
      addItem({
        id: `irritant-${topIrritant.label}`,
        level: topIrritant.count >= 3 ? "high" : "watch",
        title: `${topIrritant.label} revient`,
        action: "Analyser les avis concernés",
        evidence: `${topIrritant.count} mentions`
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
        evidence: insight.detail
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
      positiveCount: all
        .filter((topic) => topic.tone === "positive")
        .reduce((sum, topic) => sum + topic.count, 0),
      negativeCount: all
        .filter((topic) => topic.tone === "negative")
        .reduce((sum, topic) => sum + topic.count, 0)
    };
  }, [drivers, overview]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    if (compare) {
      const reviewDelta = compare.metrics.review_count.delta;
      if (reviewDelta !== 0) {
        events.push({
          id: "volume",
          label: reviewDelta > 0 ? "Volume en hausse" : "Volume en baisse",
          detail: `${formatDeltaCount(reviewDelta)} avis vs période précédente`,
          level: reviewDelta > 0 ? "ok" : "watch"
        });
      }

      const replyDelta = compare.metrics.reply_rate.delta;
      if (replyDelta !== null && Math.abs(replyDelta) > 0.001) {
        events.push({
          id: "reply",
          label: replyDelta > 0 ? "Réponse en hausse" : "Réponse en baisse",
          detail: formatDeltaPoints(replyDelta),
          level: replyDelta > 0 ? "ok" : replyDelta <= -0.1 ? "high" : "watch"
        });
      }

      const ratingDelta = compare.metrics.avg_rating.delta;
      if (ratingDelta !== null && Math.abs(ratingDelta) > 0.05) {
        events.push({
          id: "rating",
          label: ratingDelta > 0 ? "Note en hausse" : "Note en baisse",
          detail: formatDelta(ratingDelta),
          level: ratingDelta > 0 ? "ok" : "watch"
        });
      }
    }

    const topDay = chartInsights.find((item) => item.label === "Meilleur jour");
    if (topDay && topDay.value !== "—") {
      events.push({
        id: "top-day",
        label: "Top journée",
        detail: `${topDay.value} · ${topDay.detail}`,
        level: "ok"
      });
    }

    const risingTopic = topicExplorer.rising[0];
    if (risingTopic) {
      events.push({
        id: "rising-topic",
        label: "Thème en progression",
        detail: `${risingTopic.label} · ${formatDeltaCount(risingTopic.delta)}`,
        level: risingTopic.tone === "negative" ? "watch" : "ok"
      });
    }

    const fallingTopic = topicExplorer.falling[0];
    if (fallingTopic) {
      events.push({
        id: "falling-topic",
        label: "Thème en baisse",
        detail: `${fallingTopic.label} · ${formatDeltaCount(fallingTopic.delta)}`,
        level: fallingTopic.tone === "positive" ? "watch" : "ok"
      });
    }

    if (quality?.avg_reply_delay_hours !== null && quality?.avg_reply_delay_hours !== undefined) {
      events.push({
        id: "reply-delay",
        label: "Temps moyen avant réponse",
        detail: formatHours(quality.avg_reply_delay_hours),
        level:
          quality.avg_reply_delay_hours > 72
            ? "high"
            : quality.avg_reply_delay_hours > 24
              ? "watch"
              : "ok"
      });
    }

    const levelOrder: Record<DecisionLevel, number> = { high: 0, watch: 1, ok: 2 };
    return events.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]).slice(0, 6);
  }, [chartInsights, compare, quality, topicExplorer]);

  const aiSkillCards = useMemo<AiSkillCard[]>(() => {
    const highItems = decisionEngine.groups.high;
    const watchItems = decisionEngine.groups.watch;
    const okItems = decisionEngine.groups.ok;
    const recommendedActions = [...highItems, ...watchItems, ...okItems]
      .map((item) => ({ label: item.action, detail: item.title }))
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.label === item.label) === index
      );

    const opportunities = [
      ...okItems.map((item) => ({ label: item.title, detail: item.evidence })),
      ...topicExplorer.rising
        .filter((topic) => topic.tone === "positive")
        .map((topic) => ({
          label: topic.label,
          detail: `${topic.count} mentions · ${formatDeltaCount(topic.delta)}`
        }))
    ];

    const risks = [
      ...highItems.map((item) => ({ label: item.title, detail: item.evidence })),
      ...watchItems.map((item) => ({ label: item.title, detail: item.evidence })),
      ...topicExplorer.rising
        .filter((topic) => topic.tone === "negative")
        .map((topic) => ({
          label: topic.label,
          detail: `${topic.count} mentions · ${formatDeltaCount(topic.delta)}`
        }))
    ];

    return [
      {
        id: "ai-health-score",
        title: "Score Santé IA",
        badge: healthScore ? `${healthScore.value}/100` : "en attente",
        Icon: Sparkles,
        tone: "dark",
        items: healthScore
          ? [
              {
                label: healthScore.status,
                detail: `${healthScore.availableSignals} signaux disponibles`
              }
            ]
          : [],
        emptyLabel: "Le score s'affichera dès que les KPI nécessaires seront disponibles."
      },
      {
        id: "ai-summary",
        title: "Résumé IA",
        badge: decisionEngine.summary.length > 0 ? "actif" : "vide",
        Icon: LineChart,
        tone: "neutral",
        items: decisionEngine.summary.map((line) => ({ label: line })),
        emptyLabel: "Pas encore assez de données pour générer un résumé."
      },
      {
        id: "ai-opportunities",
        title: "Opportunités",
        badge: String(opportunities.length),
        Icon: Lightbulb,
        tone: "good",
        items: opportunities,
        emptyLabel: "Aucune opportunité exploitable détectée sur la période."
      },
      {
        id: "ai-risks",
        title: "Risques",
        badge: String(risks.length),
        Icon: AlertTriangle,
        tone: risks.length > 0 ? "warn" : "neutral",
        items: risks,
        emptyLabel: "Aucun risque prioritaire détecté avec les données actuelles."
      },
      {
        id: "ai-winback",
        title: "Clients à reconquérir",
        badge: "prévu",
        Icon: UsersRound,
        tone: "neutral",
        items: [],
        emptyLabel: "Aucune donnée client exploitable n'est encore disponible pour cette Skill."
      },
      {
        id: "ai-reply-needed",
        title: "Avis nécessitant une réponse",
        badge: responseBreakdown ? String(responseBreakdown.pending) : "—",
        Icon: MessageSquareReply,
        tone: responseBreakdown && responseBreakdown.pending > 0 ? "warn" : "good",
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
        emptyLabel: "Aucun avis avec texte n'est disponible pour cette analyse."
      },
      {
        id: "ai-forecast",
        title: "Évolution prévisible",
        badge: "prévu",
        Icon: TrendingUp,
        tone: "neutral",
        items: [],
        emptyLabel: "Les prévisions seront disponibles quand la Skill dédiée sera connectée."
      },
      {
        id: "ai-actions",
        title: "Actions recommandées",
        badge: String(recommendedActions.length),
        Icon: ListChecks,
        tone: "neutral",
        items: recommendedActions,
        emptyLabel: "Aucune action recommandée avec les données actuelles."
      }
    ];
  }, [decisionEngine, healthScore, responseBreakdown, topicExplorer]);

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

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-slate-50 px-5 py-5 sm:px-6 lg:px-8">
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
                Vue décisionnelle
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Réputation, tendances et actions prioritaires.
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-[1.2fr_0.9fr_auto]">
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
                className="mt-6 h-10 rounded-xl"
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
                  <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                    {(["auto", "day", "week"] as const).map((value) => (
                      <Button
                        key={value}
                        variant={granularity === value ? "default" : "ghost"}
                        size="sm"
                        className="h-8 rounded-lg px-3"
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
            <span>Période: {getPresetLabel(preset)}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>
              {locationId === "all"
                ? "Toutes les fiches"
                : locationLabelById.get(locationId) ?? locationId}
            </span>
            {locationsError && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-amber-700">{locationsError}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {showSkeleton
            ? Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))
            : kpis.map((kpi) => (
                <KpiCard
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  detail={kpi.detail}
                  trend={kpi.trend}
                  delta={kpi.delta}
                  Icon={kpi.Icon}
                  sparklineMetric={kpi.sparklineMetric}
                  points={compactPoints}
                />
              ))}
        </div>
      </section>

      {error && (
        <DashboardCard>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-amber-700">{error}</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </CardContent>
        </DashboardCard>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.1fr_0.9fr]">
        {showSkeleton ? (
          <>
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </>
        ) : (
          <>
            {healthScore && (
              <DashboardCard>
                <CardHeader className="px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Santé globale</CardTitle>
                    <Badge
                      variant={
                        healthScore.value >= 80
                          ? "success"
                          : healthScore.value >= 60
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {healthScore.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-5xl font-semibold tracking-tight text-slate-950">
                        {healthScore.value}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        / 100
                      </p>
                    </div>
                    <div className="mb-2 h-24 w-24 rounded-full border border-slate-100 p-2">
                      <div
                        className="grid h-full w-full place-items-center rounded-full"
                        style={{
                          background: `conic-gradient(#0f172a 0 ${healthScore.value}%, #e2e8f0 ${healthScore.value}% 100%)`
                        }}
                      >
                        <div className="h-14 w-14 rounded-full bg-white" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>Signaux utilisés</span>
                      <span className="font-semibold text-slate-800">
                        {healthScore.availableSignals}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Temps moyen avant réponse</span>
                      <span className="font-semibold text-slate-800">
                        {formatHours(quality?.avg_reply_delay_hours ?? null)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </DashboardCard>
            )}

            {timelineEvents.length > 0 && (
              <DashboardCard>
                <CardHeader className="border-b border-slate-100 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Timeline</CardTitle>
                    <Badge variant="neutral">événements</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-5 pt-5">
                  {timelineEvents.map((event) => {
                    const meta = decisionLevelMeta[event.level];
                    return (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                          <span className="mt-2 h-full w-px bg-slate-100" />
                        </div>
                        <div className="min-w-0 pb-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {event.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{event.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </DashboardCard>
            )}

            {responseBreakdown && (
              <DashboardCard>
                <CardHeader className="px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Réponses</CardTitle>
                    <Badge variant="neutral">{responseBreakdown.total} avis</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-5">
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-slate-950"
                      style={{ width: `${responseBreakdown.repliedPct}%` }}
                    />
                    <div
                      className="bg-amber-400"
                      style={{ width: `${responseBreakdown.pendingPct}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Répondus</p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {responseBreakdown.replied}
                      </p>
                      <p className="text-xs text-slate-500">
                        {responseBreakdown.repliedPct}%
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">À répondre</p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {responseBreakdown.pending}
                      </p>
                      <p className="text-xs text-slate-500">
                        {responseBreakdown.pendingPct}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </DashboardCard>
            )}
          </>
        )}
      </section>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Skills IA</CardTitle>
                <Badge variant="neutral">architecture prête</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Cartes intelligentes prêtes à recevoir les futures capacités EGIA.
              </p>
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
        <CardContent className="grid gap-4 px-5 pt-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          {showSkeleton
            ? Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-52 rounded-2xl" />
              ))
            : aiSkillCards.map((card) => (
                <AiSkillCardView key={card.id} card={card} />
              ))}
        </CardContent>
      </DashboardCard>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Évolution de la réputation</CardTitle>
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
          <CardContent className="space-y-5 px-5 pt-5 sm:px-6">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {chartInsights.length > 0 ? (
                chartInsights.map((fact) => {
                  const FactIcon = fact.Icon;
                  return (
                  <div
                    key={fact.label}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
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

        <div className="grid gap-6">
          <DashboardCard>
            <CardHeader className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Sentiment global</CardTitle>
                <Badge variant="neutral">répartition</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5">
              {showSkeleton ? (
                <Skeleton className="h-44 rounded-2xl" />
              ) : (
                <SentimentDonut sentiment={overview?.sentiment} />
              )}
            </CardContent>
          </DashboardCard>

          <DashboardCard>
            <CardHeader className="px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Qualité de réponse</CardTitle>
                <Badge variant="neutral">SLA</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5">
              {showSkeleton ? (
                <Skeleton className="h-32 rounded-2xl" />
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
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Comparaison</CardTitle>
              <Badge variant="neutral">périodes</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pt-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : compare ? (
              <>
                <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs text-slate-500 sm:grid-cols-2">
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
                      className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center"
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
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Résumé IA</CardTitle>
              <Badge variant={insights?.used_ai ? "success" : "neutral"}>
                {insights?.used_ai ? "IA" : "auto"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pt-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : decisionEngine.summary.length > 0 ||
              decisionEngine.groups.high.length > 0 ||
              decisionEngine.groups.watch.length > 0 ||
              decisionEngine.groups.ok.length > 0 ? (
              <>
                <div className="rounded-2xl border border-slate-100 bg-slate-950 p-4 text-white shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    <Sparkles className="h-4 w-4 text-white" />
                    Lecture automatique
                  </div>
                  {decisionEngine.summary.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {decisionEngine.summary.map((line) => (
                        <span
                          key={line}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">{EMPTY_ANALYSIS}</p>
                  )}
                </div>

                <div className="grid gap-3">
                  {(["high", "watch", "ok"] as const).map((level) => {
                    const meta = decisionLevelMeta[level];
                    const items = decisionEngine.groups[level];
                    return (
                      <div
                        key={level}
                        className={cn(
                          "rounded-2xl border p-4",
                          items.length > 0 ? meta.cardClass : "border-slate-100 bg-white"
                        )}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClass)} />
                            <p className="text-sm font-semibold text-slate-900">
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
                          <div className="space-y-2">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {item.title}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                      {item.evidence}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white">
                                  <ArrowRight className="h-3 w-3" />
                                  {item.action}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            Aucun signal détecté sur ce niveau.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </DashboardCard>
      </section>

      <DashboardCard>
        <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Analyse par thèmes</CardTitle>
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
        <CardContent className="grid gap-5 px-5 pt-5 sm:px-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
          {showSkeleton ? (
            <>
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </>
          ) : topicExplorer.all.length > 0 ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Top thèmes</p>
                  <Badge variant="neutral">mentions</Badge>
                </div>
                {topicExplorer.top.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    item={topic}
                    onClick={() => openTopicPanel(topic)}
                  />
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">En progression</p>
                  <Badge variant="success">variation</Badge>
                </div>
                {topicExplorer.rising.length > 0 ? (
                  topicExplorer.rising.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      item={topic}
                      onClick={() => openTopicPanel(topic)}
                    />
                  ))
                ) : (
                  <EmptyState label="Pas encore assez de données pour mesurer une progression." />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">En baisse</p>
                  <Badge variant="warning">à lire</Badge>
                </div>
                {topicExplorer.falling.length > 0 ? (
                  topicExplorer.falling.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      item={topic}
                      onClick={() => openTopicPanel(topic)}
                    />
                  ))
                ) : (
                  <EmptyState label="Aucune baisse de thème détectée sur la période." />
                )}
              </div>
            </>
          ) : (
            <div className="xl:col-span-3">
              <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
            </div>
          )}
        </CardContent>
      </DashboardCard>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)]">
        <DashboardCard>
          <CardHeader className="px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Notes</CardTitle>
              <Badge variant="neutral">1 à 5</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-44 rounded-2xl" />
            ) : (
              <RatingDistribution ratings={overview?.ratings ?? null} total={ratingTotal} />
            )}
          </CardContent>
        </DashboardCard>
      </section>

      {selectedTopic && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
          <DashboardCard className="h-full w-full max-w-xl overflow-y-auto">
            <CardHeader className="border-b border-slate-100">
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
                  className="shrink-0 rounded-xl"
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
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-xs text-slate-500">Fréquence</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {selectedTopic.count}
                  </p>
                  <p className="text-xs text-slate-500">mentions</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-xs text-slate-500">Importance</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {formatShare(selectedTopic.share_pct)}
                  </p>
                  <p className="text-xs text-slate-500">répartition</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-xs text-slate-500">Sentiment</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {selectedTopic.net_sentiment === null
                      ? "—"
                      : selectedTopic.net_sentiment}
                  </p>
                  <p className="text-xs text-slate-500">solde</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
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

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Mots associés</p>
                  <Badge variant="neutral">si disponibles</Badge>
                </div>
                <EmptyState label="Aucun mot associé disponible pour ce thème." />
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
                      className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-700"
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
            </CardContent>
          </DashboardCard>
        </div>
      )}
    </div>
  );
};

export { Analytics };
