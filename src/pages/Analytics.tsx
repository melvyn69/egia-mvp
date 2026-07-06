import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
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
import { CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";
import type { AnalyticsDrilldown } from "../types/analytics";
import { analyticsQueryKey, fetchAnalyticsBundle } from "../queries/analytics";
import {
  AiSkillCardView,
  AnalyticsDisclosure,
  AnalyticsAssistant,
  AnalyticsKpiCard,
  AnalyticsKpiPanel,
  AnalyticsMainChart,
  AnalyticsSkillsSection,
  AnalyticsThemeAnalysis,
  CompactBars,
  DashboardCard,
  EmptyState,
  KpiDetailMetric,
  KpiDetailSection,
  MultiLocationInsightCardView,
  ProblemActionButtons,
  RatingDistribution,
  SentimentDonut,
  TodayMetricTile,
  TodayTaskCard,
  TopicRow,
  TrendPill
} from "./analytics/components";
import type {
  AiSkillCard,
  AnalyticsPoint,
  AnalyticsTopic,
  AssistantListItem,
  DecisionItem,
  KpiPanelKey,
  MetricKey,
  MultiLocationInsightCard,
  TodayBriefMetric,
  TodayTask,
  TrendState
} from "./analytics/types";
import {
  EMPTY_ANALYSIS,
  clamp,
  formatCount,
  formatDateKey,
  formatDelta,
  formatDeltaCount,
  formatDeltaPct,
  formatDeltaPoints,
  formatHours,
  formatPercent,
  formatRating,
  formatRatio,
  formatShare,
  getMetricValue,
  getMetricLabel,
  getPresetLabel,
  getReasonLabel,
  getTopicImpactLabel,
  getTopicSummary,
  getTopicToneLabel,
  getTrendState,
  shiftDateKey
} from "./analytics/utils";

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

const defineAiSkill = (skill: AiSkillCard): AiSkillCard => skill;

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
};

const getDecisionRisk = (item: DecisionItem): string => {
  if (item.level === "ok") {
    return "Niveau à maintenir.";
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
    return "Réactivité plus visible.";
  }
  if (item.id.includes("reviews")) {
    return "Fiche plus active.";
  }
  if (item.id.includes("rating") || item.id.includes("negative")) {
    return "Note mieux protégée.";
  }
  if (item.id.includes("sentiment") || item.id.includes("irritant")) {
    return "Irritants mieux suivis.";
  }
  if (item.id.includes("positive")) {
    return "Point fort plus visible.";
  }
  return item.level === "ok"
    ? "Qualité perçue maintenue."
    : "Risque réputation réduit.";
};

const getAssistantListImpact = (
  item: AssistantListItem,
  type: "opportunity" | "risk" | "action"
): string => {
  if (type === "opportunity") {
    return "À valoriser dans vos réponses.";
  }
  if (type === "risk") {
    return "À traiter avant impact réputation.";
  }
  return item.detail;
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
        detail: "Reçus aujourd'hui.",
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
            ? "À traiter."
            : "Rien en attente.",
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
        detail: `${todayPoint.review_count} aujourd'hui · ${yesterdayPoint.review_count} hier.`,
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
        detail: "Avis sans réponse.",
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
        detail: `${overview.kpis.reviews_total} avis sur la période.`,
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
        detail: `${topPositive.label} · ${topPositive.count} avis.`,
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
        detail: `${topIrritant.label} · ${topIrritant.count} avis.`,
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
        title: "Assistant IA",
        badge: healthScore ? healthScore.status : "en attente",
        Icon: Sparkles,
        tone: "dark",
        status: healthScore ? "active" : "empty",
        items: healthScore
          ? [
              {
                label: healthScore.status,
                detail: "Les analyses essentielles sont disponibles."
              }
            ]
          : [],
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-summary",
        title: "Résumé IA",
        badge: automaticSummary.length > 0 ? "actif" : "vide",
        Icon: LineChart,
        tone: "neutral",
        status: automaticSummary.length > 0 ? "active" : "empty",
        items: automaticSummary.map((line) => ({ label: line })),
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-opportunities",
        title: "Opportunités",
        badge: opportunities.length > 0 ? String(opportunities.length) : "vide",
        Icon: Lightbulb,
        tone: "good",
        status: opportunities.length > 0 ? "active" : "empty",
        items: opportunities,
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-risks",
        title: "Risques",
        badge: risks.length > 0 ? String(risks.length) : "vide",
        Icon: AlertTriangle,
        tone: risks.length > 0 ? "warn" : "neutral",
        status: risks.length > 0 ? "active" : "empty",
        items: risks,
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-winback",
        title: "Clients à reconquérir",
        badge: "prévu",
        Icon: UsersRound,
        tone: "neutral",
        status: "soon",
        items: [],
        emptyLabel: "Activée avec plus de données."
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
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-forecast",
        title: "Prévision",
        badge: "prévu",
        Icon: TrendingUp,
        tone: "neutral",
        status: "soon",
        items: [],
        emptyLabel: "Activée avec plus de données."
      }),
      defineAiSkill({
        id: "ai-actions",
        title: "Actions recommandées",
        badge: recommendedActions.length > 0 ? String(recommendedActions.length) : "vide",
        Icon: ListChecks,
        tone: "neutral",
        status: recommendedActions.length > 0 ? "active" : "empty",
        items: recommendedActions,
        emptyLabel: "Activée avec plus de données."
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
  const aiActionsCard =
    aiSkillCards.find(
      (card) =>
        card.id === "ai-actions" &&
        card.status === "active" &&
        card.items.length > 0
    ) ?? null;

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
        detail: "Métriques par établissement requises.",
        Icon: BarChart3
      },
      {
        id: "location-best-progress",
        title: "Meilleure progression",
        detail: "Comparaison dès que les données existent.",
        Icon: TrendingUp
      },
      {
        id: "location-watch",
        title: "Établissement à surveiller",
        detail: "Signal basé sur avis, note et réponses.",
        Icon: AlertTriangle
      },
      {
        id: "location-review-volume",
        title: "Contribution au volume d'avis",
        detail: "Part du volume total.",
        Icon: MessageSquareReply
      },
      {
        id: "location-rating-contribution",
        title: "Contribution à la note globale",
        detail: "Impact sur la note globale.",
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
    <div className="analytics-page min-w-0 space-y-4 overflow-x-hidden pb-4 md:space-y-8 lg:space-y-12">
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
        <div className="border-b border-slate-100/70 bg-gradient-to-br from-white via-white to-slate-50/80 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {overview && overview.data_status !== "ok" && (
                  <Badge variant="warning">{reasonLabel || "Données partielles"}</Badge>
                )}
                {isFetching && !loading && (
                  <span className="text-xs font-medium text-slate-400">
                    Actualisation...
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:mt-3 sm:text-4xl">
                Cockpit réputation
              </h2>
            </div>

            <div className="grid gap-2 rounded-2xl border border-slate-200/70 bg-white/80 p-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:grid-cols-2 sm:p-3 xl:min-w-[560px] xl:grid-cols-[1.2fr_0.9fr_auto]">
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
                className="h-10 min-h-11 rounded-full sm:mt-6 sm:min-h-0"
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

        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 lg:grid-cols-3 xl:grid-cols-6">
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))
            : kpis.map((kpi) => (
                <AnalyticsKpiCard
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
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Aujourd'hui</CardTitle>
                <Badge variant="neutral">{todayBrief.dateLabel}</Badge>
              </div>
            </div>
            {todayBrief.metrics.length > 0 && (
              <Badge variant="neutral">{todayBrief.metrics.length} signal(s)</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 pt-4 sm:px-6 sm:pt-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
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

          <section className="rounded-2xl bg-slate-50/70 p-3 sm:p-4">
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
              <EmptyState label="Aucune tâche prioritaire." />
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

      <AnalyticsAssistant
        usedAi={Boolean(insights?.used_ai)}
        recommendationCount={priorityActions.length}
        showSkeleton={showSkeleton}
      >
              <section className="rounded-2xl bg-slate-950 p-4 text-white shadow-[0_16px_44px_rgba(15,23,42,0.12)] sm:p-5">
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
                              className="rounded-2xl bg-white/80 p-3 sm:p-4"
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
                      <EmptyState label="Aucune opportunité détectée." />
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
                      <EmptyState label="Aucun risque détecté." />
                    )}
                  </div>
                </div>
              </AnalyticsDisclosure>

              <AnalyticsDisclosure title="Plan d'action" badge="impact attendu">
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
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
      </AnalyticsAssistant>

      {aiActionsCard && (
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <AiSkillCardView card={aiActionsCard} />
        </section>
      )}

      <DashboardCard>
        <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Réputation</CardTitle>
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
        <CardContent className="space-y-4 px-4 pt-4 sm:px-6 sm:pt-6">
          {showSkeleton ? (
            <Skeleton className="h-[400px] rounded-2xl" />
          ) : (
            <AnalyticsMainChart
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-7">
        <DashboardCard>
          <CardHeader className="border-b border-slate-100/60 bg-slate-50/30 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Périodes</CardTitle>
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

      <AnalyticsThemeAnalysis
        showSkeleton={showSkeleton}
        topicExplorer={topicExplorer}
        emptyLabel={overview ? reasonLabel : EMPTY_ANALYSIS}
        onOpenTopic={openTopicPanel}
      />

      <AnalyticsSkillsSection showSkeleton={showSkeleton} cards={aiSkillCards} />

      {selectedKpi && selectedKpiDefinition && (
        <AnalyticsKpiPanel
          selectedKpiDefinition={selectedKpiDefinition}
          onClose={() => setSelectedKpi(null)}
        >
              <KpiDetailSection title="Actions rapides">
                <ProblemActionButtons onNavigate={navigate} />
              </KpiDetailSection>

              {selectedKpi === "reviews" && (
                <>
                  <KpiDetailSection title="Évolution" badge={getPresetLabel(preset)}>
                    {chartPoints.length > 0 ? (
                      <AnalyticsMainChart points={chartPoints} metric="reviews" sentimentLabel={null} />
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
                    <EmptyState label="Détail des avis indisponible." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "avg_rating" && (
                <>
                  <KpiDetailSection title="Évolution" badge={getPresetLabel(preset)}>
                    {chartPoints.some((point) => point.avg_rating !== null) ? (
                      <AnalyticsMainChart points={chartPoints} metric="avg_rating" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Répartition des notes">
                    <RatingDistribution ratings={overview?.ratings ?? null} total={ratingTotal} />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis ayant fait monter la note">
                    <EmptyState label="Détail indisponible." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis ayant fait baisser la note">
                    <EmptyState label="Détail indisponible." />
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
                      <AnalyticsMainChart points={chartPoints} metric="reply_rate" sentimentLabel={null} />
                    ) : (
                      <EmptyState />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis répondus">
                    <EmptyState label="Liste indisponible." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis non répondus">
                    <EmptyState label="Liste indisponible." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Réponses > 7 jours">
                    <EmptyState label="Détail indisponible." />
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
                    <EmptyState label="Histogramme indisponible." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Évolution">
                    <EmptyState label="Évolution indisponible." />
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis les plus lents">
                    <EmptyState label="Liste indisponible." />
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
                      <EmptyState label="Aucun thème positif." />
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
                      <EmptyState label="Aucun thème négatif." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis concernés">
                    <EmptyState label="Liste indisponible." />
                  </KpiDetailSection>
                </>
              )}

              {selectedKpi === "neg_share" && (
                <>
                  <KpiDetailSection title="Évolution des avis négatifs">
                    {chartPoints.some((point) => point.neg_share !== null) ? (
                      <AnalyticsMainChart points={chartPoints} metric="neg_share" sentimentLabel={null} />
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
                      <EmptyState label="Aucun irritant." />
                    )}
                  </KpiDetailSection>

                  <KpiDetailSection title="Avis concernés">
                    <EmptyState label="Liste indisponible." />
                  </KpiDetailSection>
                </>
              )}
        </AnalyticsKpiPanel>
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
                    <EmptyState label="Évolution non mesurable." />
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
                </div>
                <EmptyState label="Répartition indisponible." />
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
                <EmptyState label="Aucun avis disponible." />
              ) : null}
              </div>

              <div className="rounded-2xl border border-slate-100/70 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Réponses associées</p>
                </div>
                <EmptyState label="Aucune réponse disponible." />
              </div>
            </CardContent>
          </DashboardCard>
        </div>
      )}
    </div>
  );
};

export { Analytics };
