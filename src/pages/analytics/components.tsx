import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  MoreHorizontal,
  Star
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import type {
  AiSkillCard,
  AnalyticsPoint,
  AnalyticsSentiment,
  AnalyticsTopic,
  KpiPanelKey,
  MetricKey,
  MultiLocationInsightCard,
  TodayBriefMetric,
  TodayTask,
  TrendState
} from "./types";
import {
  EMPTY_ANALYSIS,
  buildAreaPath,
  buildLinePath,
  formatDeltaCount,
  formatDeltaPct,
  formatMetricValue,
  formatPercent,
  formatRating,
  formatRatio,
  formatShare,
  getMetricDomain,
  getMetricLabel,
  getMetricValue,
  getPointCoordinates,
  getTopicImpactLabel,
  getTopicToneLabel,
  getTrendState
} from "./utils";

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

export const DashboardCard = ({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
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

export const EmptyState = ({ label = EMPTY_ANALYSIS }: { label?: string }) => (
  <div className="flex min-h-[136px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-sm text-slate-500">
    {label}
  </div>
);

export const AnalyticsDisclosure = ({
  title,
  badge,
  defaultOpen = false,
  children
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
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

export const AiSkillCardView = ({ card }: { card: AiSkillCard }) => {
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

export const TrendPill = ({
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

export const Sparkline = ({
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

export const AnalyticsKpiCard = ({
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
  Icon: LucideIcon;
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

export const TodayMetricTile = ({ metric }: { metric: TodayBriefMetric }) => {
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

export const TodayTaskCard = ({
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

export const AnalyticsMainChart = ({
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

export const CompactBars = ({
  points,
  metric
}: {
  points: AnalyticsPoint[];
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

export const SentimentDonut = ({
  sentiment
}: {
  sentiment: AnalyticsSentiment | null | undefined;
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

export const RatingDistribution = ({
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

export const TopicRow = ({
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

export const TopicColumn = ({
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

export const KpiDetailSection = ({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-100/70 bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {badge && <Badge variant="neutral">{badge}</Badge>}
    </div>
    {children}
  </div>
);

export const KpiDetailMetric = ({
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

export const ProblemActionButtons = ({
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

export const MultiLocationInsightCardView = ({
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

export const AnalyticsAssistant = ({
  usedAi,
  recommendationCount,
  showSkeleton,
  children
}: {
  usedAi: boolean;
  recommendationCount: number;
  showSkeleton: boolean;
  children: ReactNode;
}) => (
  <DashboardCard>
    <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Recommandation IA</CardTitle>
            <Badge variant={usedAi ? "success" : "neutral"}>
              {usedAi ? "IA" : "analyse automatique"}
            </Badge>
            <Badge variant="neutral">priorisé</Badge>
          </div>
        </div>
        <Badge variant="neutral">{recommendationCount} recommandation(s)</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-7 px-5 pt-6 sm:px-6">
      {showSkeleton ? <Skeleton className="h-[560px] rounded-2xl" /> : children}
    </CardContent>
  </DashboardCard>
);

export const AnalyticsThemeAnalysis = ({
  showSkeleton,
  topicExplorer,
  emptyLabel,
  onOpenTopic
}: {
  showSkeleton: boolean;
  topicExplorer: {
    all: AnalyticsTopic[];
    top: AnalyticsTopic[];
    rising: AnalyticsTopic[];
    falling: AnalyticsTopic[];
    newTopics: AnalyticsTopic[];
    disappeared: AnalyticsTopic[];
    positiveCount: number;
    negativeCount: number;
  };
  emptyLabel: string;
  onOpenTopic: (topic: AnalyticsTopic) => void;
}) => (
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
              onOpen={onOpenTopic}
            />
            <TopicColumn
              title="Thèmes en progression"
              badge="hausse"
              badgeVariant="success"
              topics={topicExplorer.rising}
              emptyLabel="Pas encore assez de données pour mesurer une progression."
              onOpen={onOpenTopic}
            />
            <TopicColumn
              title="Thèmes en baisse"
              badge="baisse"
              badgeVariant="warning"
              topics={topicExplorer.falling}
              emptyLabel="Aucune baisse de thème détectée sur la période."
              onOpen={onOpenTopic}
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
                onOpen={onOpenTopic}
              />
              <TopicColumn
                title="Thèmes disparus"
                badge="disparu"
                topics={topicExplorer.disappeared}
                emptyLabel="Aucun thème disparu n'est pas disponible dans les données actuelles."
                onOpen={onOpenTopic}
              />
            </div>
          </AnalyticsDisclosure>
        </>
      ) : (
        <EmptyState label={emptyLabel} />
      )}
    </CardContent>
  </DashboardCard>
);

export const AnalyticsSkillsSection = ({
  showSkeleton,
  cards
}: {
  showSkeleton: boolean;
  cards: AiSkillCard[];
}) => (
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
        : cards.map((card) => (
            <AiSkillCardView key={card.id} card={card} />
          ))}
    </CardContent>
  </DashboardCard>
);

export const AnalyticsKpiPanel = ({
  selectedKpiDefinition,
  onClose,
  children
}: {
  selectedKpiDefinition: {
    label: string;
    value: string;
    detail: string;
    trend: TrendState;
    delta: string;
  };
  onClose: () => void;
  children: ReactNode;
}) => (
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
            onClick={onClose}
          >
            Fermer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">{children}</CardContent>
    </DashboardCard>
  </div>
);
