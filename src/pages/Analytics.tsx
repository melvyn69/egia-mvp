import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Filter,
  LineChart,
  MapPin,
  MessageSquareReply,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp
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

const getSeverityVariant = (
  severity: "good" | "warn" | "bad"
): "success" | "warning" | "neutral" => {
  if (severity === "good") {
    return "success";
  }
  if (severity === "bad") {
    return "warning";
  }
  return "neutral";
};

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

const KpiCard = ({
  label,
  value,
  detail,
  trend,
  delta,
  Icon
}: {
  label: string;
  value: string;
  detail: string;
  trend: TrendState;
  delta: string;
  Icon: typeof BarChart3;
}) => (
  <div className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <TrendPill state={trend} label={delta} />
      <span className="text-xs text-slate-500">{detail}</span>
    </div>
  </div>
);

const AreaChart = ({
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
  const width = 640;
  const height = 260;
  const values = points.map((point) => getMetricValue(metric, point));
  const domain = getMetricDomain(metric, values);
  const linePath = buildLinePath(values, domain.min, domain.max, width, height);
  const areaPath = buildAreaPath(linePath, values, width, height);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (points.length === 0 || !linePath) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-2 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${getMetricLabel(metric)} sur la période`}
          className="h-[260px] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="analyticsArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((line) => {
            const y = 18 + line * 56;
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
          <path d={areaPath} fill="url(#analyticsArea)" />
          <path
            d={linePath}
            fill="none"
            stroke="#0f172a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {values.map((value, index) => {
            if (value === null) {
              return null;
            }
            const padding = 18;
            const drawableWidth = width - padding * 2;
            const drawableHeight = height - padding * 2;
            const x =
              padding +
              (values.length <= 1
                ? drawableWidth / 2
                : (index / (values.length - 1)) * drawableWidth);
            const ratio =
              domain.max === domain.min ? 0 : (value - domain.min) / (domain.max - domain.min);
            const y = padding + (1 - Math.max(0, Math.min(1, ratio))) * drawableHeight;
            return (
              <circle
                key={`${points[index].date}-${index}`}
                cx={x}
                cy={y}
                r="3.5"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2"
              />
            );
          })}
        </svg>
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
  tone,
  onClick
}: {
  item: {
    label: string;
    count: number;
    share_pct: number | null;
    net_sentiment: number;
    delta: number | null;
    delta_pct: number | null;
    source: "ai" | "manual";
    tag_ids?: string[];
  };
  tone: "positive" | "negative";
  onClick: () => void;
}) => {
  const trend = getTrendState(item.delta, tone === "positive");
  const width = Math.max(4, Math.min(100, item.share_pct ?? item.count * 8));

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{item.count} mentions</span>
            <span>{formatShare(item.share_pct)}</span>
            <span>Solde {item.net_sentiment}</span>
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
          className={cn(
            "h-1.5 rounded-full",
            tone === "positive" ? "bg-slate-900" : "bg-red-500"
          )}
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
        Icon: BarChart3
      },
      {
        label: "Note moyenne",
        value: formatRating(overview?.kpis.avg_rating ?? null),
        detail: "qualité perçue",
        trend: ratingTrend,
        delta: compare ? formatDelta(compare.metrics.avg_rating.delta) : "—",
        Icon: Star
      },
      {
        label: "Taux réponse",
        value: formatPercent(overview?.kpis.response_rate_pct ?? null),
        detail: "avis avec texte",
        trend: replyTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.reply_rate.delta) : "—",
        Icon: MessageSquareReply
      },
      {
        label: "Délai moyen",
        value: formatHours(quality?.avg_reply_delay_hours ?? null),
        detail:
          quality && quality.replied_with_time_count > 0
            ? `${quality.replied_with_time_count} réponses mesurées`
            : EMPTY_ANALYSIS,
        trend: "none" as TrendState,
        delta: "mesuré",
        Icon: Clock3
      },
      {
        label: "Avis négatifs",
        value: formatPercent(overview?.kpis.negative_share_pct ?? null),
        detail: "part du volume",
        trend: negativeTrend,
        delta: compare ? formatDeltaPoints(compare.metrics.neg_share.delta) : "—",
        Icon: TrendingUp
      },
      {
        label: "Sentiment",
        value: overview?.sentiment
          ? `${formatPercent(overview.sentiment.positive_pct)} positif`
          : "—",
        detail: overview?.sentiment ? "période actuelle" : EMPTY_ANALYSIS,
        trend: "none" as TrendState,
        delta: "actuel",
        Icon: Sparkles
      }
    ];
  }, [compare, overview, quality]);

  const activityFacts = useMemo(() => {
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
    return [
      {
        label: "Pic d'avis",
        value: busiest.date,
        detail: `${busiest.review_count} avis`
      },
      {
        label: "Jour le plus calme",
        value: quietest.date,
        detail: `${quietest.review_count} avis`
      },
      {
        label: "Réponses envoyées",
        value: `${formatCount(overview?.kpis.replied_count)} / ${formatCount(
          overview?.kpis.replyable_count
        )}`,
        detail: "avis avec texte"
      }
    ];
  }, [overview, timeseries]);

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
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Comprendre l'évolution de votre réputation, les signaux forts et les
                actions prioritaires à partir des données disponibles.
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

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, index) => (
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Évolution de la réputation</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Graphique principal basé sur la série disponible.
                </p>
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
              <Skeleton className="h-[320px] rounded-2xl" />
            ) : (
              <AreaChart points={chartPoints} metric={metric} />
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {activityFacts.length > 0 ? (
                activityFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {fact.label}
                    </p>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                      {fact.value}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{fact.detail}</p>
                  </div>
                ))
              ) : (
                <div className="sm:col-span-3">
                  <EmptyState />
                </div>
              )}
            </div>
          </CardContent>
        </DashboardCard>

        <div className="grid gap-6">
          <DashboardCard>
            <CardHeader className="px-5 py-5">
              <CardTitle>Sentiment global</CardTitle>
              <p className="text-sm text-slate-500">
                Répartition positive, neutre et négative.
              </p>
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
              <CardTitle>Qualité de réponse</CardTitle>
              <p className="text-sm text-slate-500">
                Vitesse et couverture des réponses.
              </p>
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
            <CardTitle>Comparaison de périodes</CardTitle>
            <p className="text-sm text-slate-500">
              Période actuelle vs période précédente.
            </p>
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
            <CardTitle>Priorités actionnables</CardTitle>
            <p className="text-sm text-slate-500">
              Synthèse IA ou règles de lecture calculées par l'analytics.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pt-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-56 rounded-2xl" />
            ) : insights && insights.insights.length > 0 ? (
              insights.insights.map((insight, index) => (
                <div
                  key={`${insight.title}-${index}`}
                  className="rounded-2xl border border-slate-100 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800">{insight.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {insight.detail}
                      </p>
                    </div>
                    <Badge variant={getSeverityVariant(insight.severity)}>
                      {insight.severity === "good"
                        ? "OK"
                        : insight.severity === "bad"
                          ? "Prioritaire"
                          : "À suivre"}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </DashboardCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <CardTitle>Thèmes qui progressent</CardTitle>
            <p className="text-sm text-slate-500">
              Sujets positifs détectés, avec mentions et variation.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pt-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-60 rounded-2xl" />
            ) : drivers && drivers.positives.length > 0 ? (
              drivers.positives.map((item) => (
                <TopicRow
                  key={`pos-${item.label}`}
                  item={item}
                  tone="positive"
                  onClick={() =>
                    loadDrilldown(
                      { label: item.label, source: item.source, tag_ids: item.tag_ids },
                      0
                    )
                  }
                />
              ))
            ) : (
              <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
            )}
          </CardContent>
        </DashboardCard>

        <DashboardCard>
          <CardHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <CardTitle>Irritants à surveiller</CardTitle>
            <p className="text-sm text-slate-500">
              Sujets négatifs ou en dégradation quand ils sont détectés.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pt-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-60 rounded-2xl" />
            ) : drivers && drivers.irritants.length > 0 ? (
              drivers.irritants.map((item) => (
                <TopicRow
                  key={`neg-${item.label}`}
                  item={item}
                  tone="negative"
                  onClick={() =>
                    loadDrilldown(
                      { label: item.label, source: item.source, tag_ids: item.tag_ids },
                      0
                    )
                  }
                />
              ))
            ) : (
              <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
            )}
          </CardContent>
        </DashboardCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <DashboardCard>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle>Répartition des notes</CardTitle>
            <p className="text-sm text-slate-500">
              Distribution des notes 1 à 5.
            </p>
          </CardHeader>
          <CardContent className="px-5 sm:px-6">
            {showSkeleton ? (
              <Skeleton className="h-44 rounded-2xl" />
            ) : (
              <RatingDistribution ratings={overview?.ratings ?? null} total={ratingTotal} />
            )}
          </CardContent>
        </DashboardCard>

        <DashboardCard>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle>Lecture par thèmes</CardTitle>
            <p className="text-sm text-slate-500">
              Forces et irritants les plus mentionnés dans les données disponibles.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 sm:grid-cols-2 sm:px-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Points forts</p>
                <Badge variant="success">positif</Badge>
              </div>
              {showSkeleton ? (
                <Skeleton className="h-36 rounded-2xl" />
              ) : overview && overview.topics.strengths.length > 0 ? (
                <div className="space-y-2">
                  {overview.topics.strengths.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">{item.label}</span>
                      <span className="ml-3 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Irritants</p>
                <Badge variant="warning">à traiter</Badge>
              </div>
              {showSkeleton ? (
                <Skeleton className="h-36 rounded-2xl" />
              ) : overview && overview.topics.irritants.length > 0 ? (
                <div className="space-y-2">
                  {overview.topics.irritants.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">{item.label}</span>
                      <span className="ml-3 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState label={overview ? reasonLabel : EMPTY_ANALYSIS} />
              )}
            </div>
          </CardContent>
        </DashboardCard>
      </section>

      {drilldownDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <DashboardCard className="max-h-[88vh] w-full max-w-3xl overflow-y-auto">
            <CardHeader className="border-b border-slate-100">
              <CardTitle>Exemples d'avis</CardTitle>
              <p className="text-sm text-slate-500">{drilldownDriver.label}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
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
                  {drilldown.has_more && (
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
              ) : null}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDrilldownDriver(null);
                    setDrilldown(null);
                    setDrilldownError(null);
                  }}
                >
                  Fermer
                </Button>
              </div>
            </CardContent>
          </DashboardCard>
        </div>
      )}
    </div>
  );
};

export { Analytics };
