import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../server/_shared/_auth.js";
import { resolveDateRange } from "../server/_shared/_date.js";
import { parseFilters } from "../server/_shared/_filters.js";

type AnalyticsOverview = {
  scope: {
    preset: string;
    from: string | null;
    to: string | null;
    location_id: string | null;
    location_ids_count: number;
  };
  data_status: "ok" | "empty" | "partial";
  reasons: string[];
  kpis: {
    reviews_total: number;
    reviews_with_text: number;
    avg_rating: number | null;
    negative_share_pct: number | null;
    response_rate_pct: number | null;
    replied_count: number;
    replyable_count: number;
  };
  ratings: { "1": number; "2": number; "3": number; "4": number; "5": number };
  sentiment: null | {
    positive: number;
    neutral: number;
    negative: number;
    positive_pct: number | null;
  };
  topics: {
    strengths: Array<{ label: string; count: number }>;
    irritants: Array<{ label: string; count: number }>;
  };
};

type AnalyticsTimeseries = {
  granularity: "day" | "week";
  points: Array<{
    date: string;
    review_count: number;
    avg_rating: number | null;
    neg_share: number | null;
    reply_rate: number | null;
  }>;
};

type AnalyticsDrivers = {
  period: {
    preset: string;
    from: string | null;
    to: string | null;
    location_id: string | null;
  };
  totals: {
    tagged_count: number;
  };
  positives: Array<{
    label: string;
    count: number;
    share_pct: number | null;
    net_sentiment: number;
    delta: number | null;
    delta_pct: number | null;
    source: "ai" | "manual";
    tag_ids?: string[];
  }>;
  irritants: Array<{
    label: string;
    count: number;
    share_pct: number | null;
    net_sentiment: number;
    delta: number | null;
    delta_pct: number | null;
    source: "ai" | "manual";
    tag_ids?: string[];
  }>;
};

type AnalyticsQuality = {
  reply_rate: number | null;
  avg_reply_delay_hours: number | null;
  sla_24h: number | null;
  replyable_count: number;
  replied_count: number;
  replied_with_time_count: number;
};

type AnalyticsDrilldown = {
  items: Array<{
    id: string;
    review_id: string | null;
    rating: number | null;
    comment: string | null;
    author_name: string | null;
    create_time: string | null;
    location_id: string | null;
  }>;
  offset: number;
  limit: number;
  has_more: boolean;
};

type AnalyticsCompare = {
  periodA: { start: string; end: string; label: string };
  periodB: { start: string; end: string; label: string };
  metrics: {
    review_count: {
      a: number;
      b: number;
      delta: number;
      delta_pct: number | null;
    };
    avg_rating: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: null;
    };
    neg_share: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: number | null;
    };
    reply_rate: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: number | null;
    };
  };
};

type AnalyticsInsight = {
  title: string;
  detail: string;
  severity: "good" | "warn" | "bad";
  metric_keys: string[];
};

type AnalyticsInsights = {
  mode: "ai" | "basic";
  used_ai: boolean;
  insights: AnalyticsInsight[];
};

const buildEmptyOverview = (
  scope: AnalyticsOverview["scope"],
  reasons: string[]
): AnalyticsOverview => ({
  scope,
  data_status: "empty",
  reasons,
  kpis: {
    reviews_total: 0,
    reviews_with_text: 0,
    avg_rating: null,
    negative_share_pct: null,
    response_rate_pct: null,
    replied_count: 0,
    replyable_count: 0
  },
  ratings: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  sentiment: null,
  topics: { strengths: [], irritants: [] }
});

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
const startOfDayUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDaysUtc = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeekStartUtc = (date: Date) => {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
};

const getQueryParam = (
  query: Record<string, string | string[] | undefined>,
  key: string
) => {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeAnalyticsQuery = (
  query: Record<string, string | string[] | undefined>
) => {
  const normalized = { ...query };
  const preset = getQueryParam(query, "preset") ?? getQueryParam(query, "period");
  const location =
    getQueryParam(query, "location_id") ?? getQueryParam(query, "location");
  if (preset) {
    normalized.preset = preset;
  }
  if (location) {
    normalized.location_id = location;
  }
  return normalized;
};

const isReplyable = (row: { comment?: string | null }) =>
  typeof row.comment === "string" && row.comment.trim().length > 0;

const isReplied = (row: {
  reply_text?: string | null;
  replied_at?: string | null;
  owner_reply?: string | null;
  owner_reply_time?: string | null;
  status?: string | null;
}) =>
  Boolean(
    row.reply_text ||
      row.replied_at ||
      row.owner_reply ||
      row.owner_reply_time ||
      row.status === "replied"
  );

type ReviewLite = {
  id: string;
  review_id: string | null;
  author_name: string | null;
  location_id: string | null;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  created_at: string | null;
  owner_reply?: string | null;
  owner_reply_time?: string | null;
  reply_text?: string | null;
  replied_at?: string | null;
  status?: string | null;
};

const buildReviewsQuery = (
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never,
  userId: string,
  locationIds: string[],
  range: { from: string; to: string }
) => {
  let query = supabaseAdmin
    .from("google_reviews")
    .select(
      "id, review_id, author_name, rating, comment, reply_text, replied_at, owner_reply, owner_reply_time, status, create_time, update_time, created_at, location_id"
    )
    .eq("user_id", userId);

  query =
    locationIds.length === 1
      ? query.eq("location_id", locationIds[0])
      : query.in("location_id", locationIds);

  return query.or(
    `and(create_time.gte.${range.from},create_time.lte.${range.to}),` +
      `and(create_time.is.null,update_time.gte.${range.from},update_time.lte.${range.to}),` +
      `and(create_time.is.null,update_time.is.null,created_at.gte.${range.from},created_at.lte.${range.to})`
  );
};

const fetchReviewsForRange = async (
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never,
  userId: string,
  locationIds: string[],
  range: { from: string; to: string }
) => {
  const rows: ReviewLite[] = [];
  const pageSize = 1000;
  const maxRows = 20000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data: pageData, error: pageError } = await buildReviewsQuery(
      supabaseAdmin,
      userId,
      locationIds,
      range
    ).range(offset, offset + pageSize - 1);
    if (pageError) {
      throw pageError;
    }
    const pageRows = pageData ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      break;
    }
  }
  return rows;
};

const resolveGranularity = (
  raw: string | undefined,
  range: { from: string; to: string }
) => {
  if (raw === "day" || raw === "week") {
    return raw;
  }
  const rangeStart = new Date(range.from);
  const rangeEnd = new Date(range.to);
  const rangeDays = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  return rangeDays <= 90 ? "day" : "week";
};

const buildTimeseriesPoints = (
  rows: ReviewLite[],
  range: { from: string; to: string },
  granularity: "day" | "week"
) => {
  const buckets = new Map<
    string,
    {
      review_count: number;
      rating_sum: number;
      rating_count: number;
      negative_count: number;
      replyable_count: number;
      replied_count: number;
    }
  >();

  rows.forEach((row) => {
    const time = row.create_time ?? row.update_time ?? row.created_at ?? null;
    if (!time) {
      return;
    }
    const date = new Date(time);
    const bucketDate = granularity === "week" ? getWeekStartUtc(date) : date;
    const key = toDateKey(bucketDate);
    const entry = buckets.get(key) ?? {
      review_count: 0,
      rating_sum: 0,
      rating_count: 0,
      negative_count: 0,
      replyable_count: 0,
      replied_count: 0
    };
    entry.review_count += 1;
    if (isReplyable(row)) {
      entry.replyable_count += 1;
      if (isReplied(row)) {
        entry.replied_count += 1;
      }
    }
    if (typeof row.rating === "number") {
      entry.rating_sum += row.rating;
      entry.rating_count += 1;
      if (row.rating <= 2) {
        entry.negative_count += 1;
      }
    }
    buckets.set(key, entry);
  });

  const rangeStart = new Date(range.from);
  const rangeEnd = new Date(range.to);
  const bucketStart =
    granularity === "week" ? getWeekStartUtc(rangeStart) : startOfDayUtc(rangeStart);
  const bucketEnd =
    granularity === "week" ? getWeekStartUtc(rangeEnd) : startOfDayUtc(rangeEnd);
  const stepDays = granularity === "week" ? 7 : 1;
  const points: AnalyticsTimeseries["points"] = [];
  for (
    let cursor = bucketStart;
    cursor <= bucketEnd;
    cursor = addDaysUtc(cursor, stepDays)
  ) {
    const key = toDateKey(cursor);
    const entry = buckets.get(key);
    const review_count = entry?.review_count ?? 0;
    const avg_rating =
      entry && entry.rating_count > 0
        ? Number((entry.rating_sum / entry.rating_count).toFixed(1))
        : null;
    const neg_share = review_count > 0 ? entry!.negative_count / review_count : null;
    const reply_rate =
      entry && entry.replyable_count > 0
        ? entry.replied_count / entry.replyable_count
        : null;
    points.push({
      date: key,
      review_count,
      avg_rating,
      neg_share,
      reply_rate
    });
  }
  return points;
};

const computeCompareMetrics = (rows: ReviewLite[]) => {
  const review_count = rows.length;
  const ratings = rows
    .map((row) => row.rating)
    .filter((value): value is number => typeof value === "number");
  const avg_rating =
    ratings.length > 0
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
      : null;
  const negative_count = rows.filter(
    (row) => typeof row.rating === "number" && row.rating <= 2
  ).length;
  const neg_share = review_count > 0 ? negative_count / review_count : null;
  const replyableRows = rows.filter(isReplyable);
  const replyable_count = replyableRows.length;
  const replied_count = replyableRows.filter(isReplied).length;
  const reply_rate =
    replyable_count > 0 ? replied_count / replyable_count : null;

  return {
    review_count,
    avg_rating,
    neg_share,
    reply_rate
  };
};

const buildCompareResponse = (
  preset: string,
  rangeA: { from: string; to: string },
  rangeB: { from: string; to: string },
  metricsA: ReturnType<typeof computeCompareMetrics>,
  metricsB: ReturnType<typeof computeCompareMetrics>
): AnalyticsCompare => {
  const reviewDelta = metricsA.review_count - metricsB.review_count;
  const reviewDeltaPct =
    metricsB.review_count > 0 ? reviewDelta / metricsB.review_count : null;
  const avgDelta =
    metricsA.avg_rating !== null && metricsB.avg_rating !== null
      ? Number((metricsA.avg_rating - metricsB.avg_rating).toFixed(2))
      : null;
  const negDelta =
    metricsA.neg_share !== null && metricsB.neg_share !== null
      ? metricsA.neg_share - metricsB.neg_share
      : null;
  const negDeltaPct =
    metricsB.neg_share !== null && metricsB.neg_share > 0 && negDelta !== null
      ? negDelta / metricsB.neg_share
      : null;
  const replyDelta =
    metricsA.reply_rate !== null && metricsB.reply_rate !== null
      ? metricsA.reply_rate - metricsB.reply_rate
      : null;
  const replyDeltaPct =
    metricsB.reply_rate !== null && metricsB.reply_rate > 0 && replyDelta !== null
      ? replyDelta / metricsB.reply_rate
      : null;

  return {
    periodA: { start: rangeA.from, end: rangeA.to, label: preset },
    periodB: { start: rangeB.from, end: rangeB.to, label: `previous_${preset}` },
    metrics: {
      review_count: {
        a: metricsA.review_count,
        b: metricsB.review_count,
        delta: reviewDelta,
        delta_pct: reviewDeltaPct
      },
      avg_rating: {
        a: metricsA.avg_rating,
        b: metricsB.avg_rating,
        delta: avgDelta,
        delta_pct: null
      },
      neg_share: {
        a: metricsA.neg_share,
        b: metricsB.neg_share,
        delta: negDelta,
        delta_pct: negDeltaPct
      },
      reply_rate: {
        a: metricsA.reply_rate,
        b: metricsB.reply_rate,
        delta: replyDelta,
        delta_pct: replyDeltaPct
      }
    }
  };
};

const buildPreviousRange = (rangeA: { from: string; to: string }) => {
  const rangeStart = new Date(rangeA.from);
  const rangeEnd = new Date(rangeA.to);
  const durationMs = rangeEnd.getTime() - rangeStart.getTime();
  return {
    from: new Date(rangeStart.getTime() - durationMs).toISOString(),
    to: new Date(rangeEnd.getTime() - durationMs).toISOString()
  };
};

const mapSentimentFromRating = (rating: number | null) => {
  if (typeof rating !== "number") {
    return "neutral";
  }
  if (rating <= 2) {
    return "negative";
  }
  if (rating >= 4) {
    return "positive";
  }
  return "neutral";
};

const computeTagStats = (params: {
  reviewRows: ReviewLite[];
  tagLinks: Array<{ review_id: string; tag_label: string; tag_id?: string }>;
  sentiments: Map<string, string | null>;
}) => {
  const { reviewRows, tagLinks, sentiments } = params;
  const ratingByReview = new Map(
    reviewRows.map((row) => [row.id, row.rating])
  );
  const tagStats = new Map<
    string,
    {
      label: string;
      count: number;
      positive: number;
      negative: number;
      neutral: number;
      tag_ids: Set<string>;
    }
  >();

  tagLinks.forEach((link) => {
    const normalized = normalizeTagLabel(link.tag_label);
    if (!normalized) {
      return;
    }
    const stats =
      tagStats.get(normalized) ?? {
        label: link.tag_label.trim(),
        count: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        tag_ids: new Set<string>()
      };
    stats.count += 1;
    if (link.tag_id) {
      stats.tag_ids.add(link.tag_id);
    }
    const sentiment =
      sentiments.get(link.review_id) ?? mapSentimentFromRating(ratingByReview.get(link.review_id) ?? null);
    if (sentiment === "positive") {
      stats.positive += 1;
    } else if (sentiment === "negative") {
      stats.negative += 1;
    } else {
      stats.neutral += 1;
    }
    tagStats.set(normalized, stats);
  });

  return tagStats;
};

const mapDrivers = (params: {
  tagStats: Map<
    string,
    {
      label: string;
      count: number;
      positive: number;
      negative: number;
      neutral: number;
      tag_ids: Set<string>;
    }
  >;
  totalCount: number;
  previousCounts: Map<string, number>;
  source: "ai" | "manual";
}) => {
  const { tagStats, totalCount, previousCounts, source } = params;
  const positives: AnalyticsDrivers["positives"] = [];
  const irritants: AnalyticsDrivers["irritants"] = [];

  for (const [labelKey, stats] of tagStats.entries()) {
    const positiveScore = stats.positive + stats.neutral;
    const net = stats.positive - stats.negative;
    const prevCount = previousCounts.get(labelKey) ?? 0;
    const delta = stats.count - prevCount;
    const deltaPct = prevCount > 0 ? delta / prevCount : null;
    const sharePct = totalCount > 0 ? (stats.count / totalCount) * 100 : null;
    const item = {
      label: stats.label || labelKey,
      count: stats.count,
      share_pct: sharePct !== null ? Number(sharePct.toFixed(1)) : null,
      net_sentiment: net,
      delta: prevCount > 0 ? delta : null,
      delta_pct: deltaPct !== null ? Number(deltaPct.toFixed(2)) : null,
      source,
      tag_ids: stats.tag_ids.size ? Array.from(stats.tag_ids) : undefined
    };
    if (stats.negative >= 2 && stats.negative > stats.positive) {
      irritants.push(item);
    } else if (positiveScore > 0) {
      positives.push(item);
    }
  }

  positives.sort((a, b) => b.count - a.count);
  irritants.sort((a, b) => b.count - a.count);
  return {
    positives: positives.slice(0, 5),
    irritants: irritants.slice(0, 5)
  };
};

const buildBasicInsights = (
  compare: AnalyticsCompare,
  timeseries: AnalyticsTimeseries["points"]
): AnalyticsInsight[] => {
  const insights: AnalyticsInsight[] = [];
  const addInsight = (insight: AnalyticsInsight) => {
    insights.push(insight);
  };
  const toPercent = (value: number | null) =>
    value === null ? null : Math.round(value * 100);

  const replyRate = compare.metrics.reply_rate.a;
  if (replyRate === null) {
    addInsight({
      title: "Réponses : données insuffisantes",
      detail:
        "Aucun avis avec commentaire exploitable sur la période. Encouragez les clients à laisser un avis détaillé.",
      severity: "warn",
      metric_keys: ["reply_rate"]
    });
  } else if (replyRate < 0.5) {
    addInsight({
      title: "Taux de réponse faible",
      detail:
        "Moins de 50% des avis reçoivent une réponse. Fixez un objectif interne de réponse sous 48h.",
      severity: "bad",
      metric_keys: ["reply_rate"]
    });
  } else if (replyRate < 0.7) {
    addInsight({
      title: "Taux de réponse perfectible",
      detail:
        "Le taux de réponse reste en dessous de 70%. Priorisez les avis récents pour remonter la réactivité.",
      severity: "warn",
      metric_keys: ["reply_rate"]
    });
  } else {
    addInsight({
      title: "Bonne réactivité",
      detail:
        "Vous répondez à la majorité des avis. Maintenez ce rythme avec un suivi hebdo.",
      severity: "good",
      metric_keys: ["reply_rate"]
    });
  }

  const negShare = compare.metrics.neg_share.a;
  if (negShare === null) {
    addInsight({
      title: "Avis négatifs : données insuffisantes",
      detail:
        "Pas assez d'avis notés pour mesurer les irritants. Continuez la collecte d'avis.",
      severity: "warn",
      metric_keys: ["neg_share"]
    });
  } else if (negShare >= 0.15) {
    addInsight({
      title: "Part d'avis négatifs élevée",
      detail:
        "La part d'avis <=2★ dépasse 15%. Analysez les irritants récurrents et corrigez un point prioritaire.",
      severity: "bad",
      metric_keys: ["neg_share"]
    });
  } else if (negShare >= 0.08) {
    addInsight({
      title: "Avis négatifs à surveiller",
      detail:
        "La part d'avis négatifs est autour de 8-15%. Travaillez sur un irritant clé pour repasser sous 8%.",
      severity: "warn",
      metric_keys: ["neg_share"]
    });
  } else {
    addInsight({
      title: "Faible part d'avis négatifs",
      detail:
        "Les avis négatifs restent sous 8%. Capitalisez sur ce niveau de qualité.",
      severity: "good",
      metric_keys: ["neg_share"]
    });
  }

  const avgDelta = compare.metrics.avg_rating.delta;
  if (avgDelta === null) {
    addInsight({
      title: "Note moyenne non mesurable",
      detail:
        "La note moyenne ne peut pas être comparée sur la période. Accumulez plus d'avis pour suivre la tendance.",
      severity: "warn",
      metric_keys: ["avg_rating"]
    });
  } else if (avgDelta <= -0.4) {
    addInsight({
      title: "Baisse marquée de la note",
      detail:
        "La note moyenne recule d'au moins 0.4★ vs période précédente. Identifiez les causes principales via les avis récents.",
      severity: "bad",
      metric_keys: ["avg_rating"]
    });
  } else if (avgDelta <= -0.2) {
    addInsight({
      title: "Note moyenne en baisse",
      detail:
        "La note moyenne baisse d'environ 0.2★. Lancez un plan d'amélioration rapide sur les points cités.",
      severity: "warn",
      metric_keys: ["avg_rating"]
    });
  } else if (avgDelta >= 0.2) {
    addInsight({
      title: "Note moyenne en hausse",
      detail:
        "La note moyenne progresse. Mettez en avant ce signal positif dans vos communications locales.",
      severity: "good",
      metric_keys: ["avg_rating"]
    });
  } else {
    addInsight({
      title: "Note moyenne stable",
      detail:
        "La note moyenne reste stable. Concentrez-vous sur la réduction des irritants pour créer une hausse.",
      severity: "warn",
      metric_keys: ["avg_rating"]
    });
  }

  const reviewDeltaPct = compare.metrics.review_count.delta_pct;
  if (reviewDeltaPct === null) {
    addInsight({
      title: "Volume d'avis difficile à comparer",
      detail:
        "La période précédente n'a pas assez de volume pour comparer. Continuez à solliciter des avis.",
      severity: "warn",
      metric_keys: ["review_count"]
    });
  } else if (reviewDeltaPct <= -0.3) {
    addInsight({
      title: "Baisse du volume d'avis",
      detail:
        "Le volume recule nettement vs période précédente. Relancez des demandes d'avis après chaque visite.",
      severity: "warn",
      metric_keys: ["review_count"]
    });
  } else if (reviewDeltaPct >= 0.3) {
    addInsight({
      title: "Hausse du volume d'avis",
      detail:
        "Le volume d'avis est en forte hausse. Assurez-vous de répondre rapidement pour capitaliser.",
      severity: "good",
      metric_keys: ["review_count"]
    });
  } else {
    addInsight({
      title: "Volume d'avis stable",
      detail:
        "Le volume d'avis est relativement stable. Testez une action simple pour stimuler la collecte.",
      severity: "warn",
      metric_keys: ["review_count"]
    });
  }

  const lastPoint = timeseries[timeseries.length - 1];
  const prevPoint = timeseries[timeseries.length - 2];
  if (lastPoint && prevPoint && lastPoint.review_count !== prevPoint.review_count) {
    const trend = lastPoint.review_count - prevPoint.review_count;
    addInsight({
      title: trend > 0 ? "Accélération récente" : "Ralentissement récent",
      detail:
        trend > 0
          ? "Le dernier bucket montre une hausse d'avis. Profitez-en pour répondre vite et ancrer la dynamique."
          : "Le dernier bucket montre un léger creux. Identifiez une action locale pour relancer la collecte.",
      severity: trend > 0 ? "good" : "warn",
      metric_keys: ["timeseries", "review_count"]
    });
  }

  const goodCount = insights.filter((item) => item.severity === "good").length;
  if (goodCount === 0) {
    const fallbackGood =
      (replyRate !== null && replyRate >= 0.7) ||
      (negShare !== null && negShare < 0.08) ||
      (compare.metrics.avg_rating.a !== null &&
        compare.metrics.avg_rating.a >= 4.2);
    if (fallbackGood) {
      addInsight({
        title: "Point fort à valoriser",
        detail:
          "Un indicateur qualité est positif. Mettez-le en avant sur votre fiche et vos supports locaux.",
        severity: "good",
        metric_keys: ["avg_rating", "neg_share", "reply_rate"]
      });
    }
  }

  return insights.slice(0, 7);
};

const extractOpenAiText = (payload: unknown) => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.output_text === "string" && record.output_text.trim()) {
      return record.output_text;
    }
    const outputItems = Array.isArray(record.output) ? record.output : [];
    const chunks: string[] = [];
    for (const item of outputItems) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const contentItems = Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as Array<Record<string, unknown>>)
        : [];
      for (const content of contentItems) {
        const text = typeof content?.text === "string" ? content.text : undefined;
        if (text) {
          chunks.push(text);
        }
      }
    }
    if (chunks.length) {
      return chunks.join("\n");
    }
  }
  return null;
};

const isValidInsightsPayload = (
  payload: unknown
): payload is { insights: AnalyticsInsight[] } => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const insights = (payload as { insights?: unknown }).insights;
  if (!Array.isArray(insights) || insights.length < 4 || insights.length > 7) {
    return false;
  }
  const allowed = new Set([
    "review_count",
    "avg_rating",
    "neg_share",
    "reply_rate",
    "timeseries"
  ]);
  return insights.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const insight = item as AnalyticsInsight;
    if (
      typeof insight.title !== "string" ||
      typeof insight.detail !== "string" ||
      (insight.severity !== "good" &&
        insight.severity !== "warn" &&
        insight.severity !== "bad")
    ) {
      return false;
    }
    if (!Array.isArray(insight.metric_keys)) {
      return false;
    }
    return insight.metric_keys.every((key) => allowed.has(key));
  });
};

const requestAiInsights = async (
  apiKey: string,
  context: Record<string, unknown>,
  mode: "auto" | "ai" | "basic"
) => {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const systemPrompt =
    "Tu es un analyste produit B2B spécialisé en e-réputation (avis Google).\n" +
    "Règles: ne jamais inventer des chiffres/causes, se baser uniquement sur le JSON fourni.\n" +
    "Retourner UNIQUEMENT un JSON valide, sans texte autour.\n" +
    'Format obligatoire:\n{"insights":[{"title":string,"detail":string,"severity":"good"|"warn"|"bad","metric_keys":string[]}]}\n' +
    'Contraintes: 4 à 7 insights max. metric_keys ∈ ["review_count","avg_rating","neg_share","reply_rate","timeseries"].\n' +
    "Ne pas mentionner OpenAI/prompt/JSON.";

  const userPrompt =
    "Génère 4 à 7 insights à partir du contexte ci-dessous. \n" +
    "Objectif: prioriser ce qui impacte le business. Proposer une action simple dans chaque detail.\n" +
    "Seuils guide:\n" +
    "- reply_rate <0.50 bad; 0.50-0.70 warn; >=0.70 good si stable/hausse\n" +
    "- neg_share >=0.15 bad; 0.08-0.15 warn; <0.08 good\n" +
    "- avg_rating baisse >=0.2 warn; >=0.4 bad\n" +
    "- review_count: hausse forte good si qualité stable; baisse forte warn\n" +
    "Anti-hallucination: n’invente aucune cause sans preuve chiffrée.\n" +
    "CONTEXTE (JSON):\n" +
    JSON.stringify(context);

  const buildBody = (prompt: string) =>
    JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    });

  const doRequest = async (prompt: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: buildBody(prompt)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI error: ${errorText.slice(0, 200)}`);
      }
      const payload = await response.json();
      const outputText = extractOpenAiText(payload);
      if (!outputText) {
        throw new Error("OpenAI response missing output_text");
      }
      return outputText;
    } finally {
      clearTimeout(timeout);
    }
  };

  if (mode === "basic") {
    return { insights: null, used_ai: false };
  }

  try {
    const outputText = await doRequest(userPrompt);
    let parsed: unknown = null;
    let parsedOk = false;
    try {
      parsed = JSON.parse(outputText);
      parsedOk = isValidInsightsPayload(parsed);
    } catch {
      parsedOk = false;
    }

    if (!parsedOk) {
      const repairText = await doRequest(
        "Corrige et retourne uniquement le JSON valide au format demandé.\n" +
          `Réponse précédente:\n${outputText}`
      );
      parsed = JSON.parse(repairText);
      if (!isValidInsightsPayload(parsed)) {
        throw new Error("OpenAI insights invalid");
      }
    }

    const validParsed = parsed as { insights: AnalyticsInsight[] };
    return { insights: validParsed.insights, used_ai: true };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error("[analytics/insights] OpenAI timeout");
    } else {
      console.error("[analytics/insights] OpenAI error", error);
    }
    return { insights: null, used_ai: false };
  }
};

const resolveLocationIds = async (
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never,
  userId: string,
  locationId: string | null
) => {
  let locationIds: string[] = [];
  if (locationId) {
    const { data: locationRow } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId)
      .eq("location_resource_name", locationId)
      .maybeSingle();
    if (!locationRow) {
      return { locationIds: [], missing: true };
    }
    locationIds = [locationId];
  } else {
    const { data: locations } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId);
    locationIds = (locations ?? [])
      .map((location) => location.location_resource_name)
      .filter(Boolean);
    if (locationIds.length === 0) {
      const { data: reviewLocations } = await supabaseAdmin
        .from("google_reviews")
        .select("location_id")
        .eq("user_id", userId);
      const deduped = new Set(
        (reviewLocations ?? [])
          .map((row) => row.location_id)
          .filter((value): value is string => Boolean(value))
      );
      locationIds = Array.from(deduped);
    }
  }
  return { locationIds, missing: false };
};

const normalizeTagLabel = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const handleOverview = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  if (filters.reject) {
    return res.status(200).json(
      buildEmptyOverview(
        {
          preset: filters.preset,
          from: null,
          to: null,
          location_id: null,
          location_ids_count: 0
        },
        ["invalid_source"]
      )
    );
  }

  const preset = filters.preset;
  const timeZone = filters.tz;
  const range = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );

  const locationId = filters.location_id ?? null;

  const scopeBase = {
    preset,
    from: preset === "all_time" ? null : range.from,
    to: range.to,
    location_id: locationId,
    location_ids_count: 0
  };

  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }
  scopeBase.location_ids_count = locationIds.length;

  if (locationIds.length === 0) {
    console.log("[analytics/overview]", {
      userId,
      preset,
      status: "empty",
      locationsCount: 0
    });
    return res
      .status(200)
      .json(buildEmptyOverview(scopeBase, ["no_locations"]));
  }

  let reviewsQuery = supabaseAdmin
    .from("google_reviews")
    .select(
      "id, rating, comment, reply_text, replied_at, owner_reply, owner_reply_time, status, create_time, update_time, created_at"
    )
    .eq("user_id", userId);

  reviewsQuery =
    locationIds.length === 1
      ? reviewsQuery.eq("location_id", locationIds[0])
      : reviewsQuery.in("location_id", locationIds);

  reviewsQuery = reviewsQuery.or(
    `and(create_time.gte.${range.from},create_time.lte.${range.to}),` +
      `and(create_time.is.null,update_time.gte.${range.from},update_time.lte.${range.to}),` +
      `and(create_time.is.null,update_time.is.null,created_at.gte.${range.from},created_at.lte.${range.to})`
  );

  const { data: reviewRows, error: reviewsError } = await reviewsQuery;
  if (reviewsError) {
    console.error("[analytics/overview] reviews error", reviewsError);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const reviews = reviewRows ?? [];
  if (reviews.length === 0) {
    const empty = buildEmptyOverview(scopeBase, ["no_reviews_in_range"]);
    console.log("[analytics/overview]", {
      userId,
      preset,
      status: "empty",
      locationsCount: locationIds.length
    });
    return res.status(200).json(empty);
  }

  const replyableRows = reviews.filter(isReplyable);
  const replyableCount = replyableRows.length;
  const repliedCount = replyableRows.filter(isReplied).length;

  const ratings = reviews
    .map((row) => row.rating)
    .filter((value): value is number => typeof value === "number");
  const avg_rating =
    ratings.length > 0
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
      : null;

  const ratingBuckets = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  ratings.forEach((value) => {
    const rounded = Math.round(value);
    if (rounded >= 1 && rounded <= 5) {
      ratingBuckets[String(rounded) as keyof typeof ratingBuckets] += 1;
    }
  });

  const negativeCount = ratings.filter((value) => value <= 2).length;
  const negative_share_pct =
    ratings.length > 0
      ? Math.round((negativeCount / ratings.length) * 100)
      : null;

  let response_rate_pct: number | null =
    replyableCount > 0
      ? Math.round((repliedCount / replyableCount) * 100)
      : null;
  if (
    response_rate_pct !== null &&
    (response_rate_pct < 0 || response_rate_pct > 100)
  ) {
    response_rate_pct = null;
  }

  const reviewIds = reviews.map((row) => row.id);
  const { data: sentiments, error: sentimentsError } = await supabaseAdmin
    .from("review_ai_insights")
    .select("review_pk, sentiment")
    .in("review_pk", reviewIds);
  if (sentimentsError) {
    console.error("[analytics/overview] sentiment error", sentimentsError);
  }

  const sentimentRows = sentiments ?? [];
  const sentiment_samples = sentimentRows.length;
  const sentimentCounts = {
    positive: sentimentRows.filter((row) => row.sentiment === "positive").length,
    neutral: sentimentRows.filter((row) => row.sentiment === "neutral").length,
    negative: sentimentRows.filter((row) => row.sentiment === "negative").length
  };
  const sentiment =
    sentiment_samples > 0
      ? {
          ...sentimentCounts,
          positive_pct: Math.round(
            (sentimentCounts.positive / sentiment_samples) * 100
          )
        }
      : null;

  const sentimentByReview = new Map(
    sentimentRows.map((row) => [row.review_pk, row.sentiment])
  );
  const { data: tagLinks } = await supabaseAdmin
    .from("review_ai_tags")
    .select("review_pk, tag_id")
    .in("review_pk", reviewIds);
  const tagIds = Array.from(
    new Set((tagLinks ?? []).map((link) => link.tag_id))
  );
  const { data: tagsData } = await supabaseAdmin
    .from("ai_tags")
    .select("id, tag")
    .in("id", tagIds);
  const tagLookup = new Map(
    (tagsData ?? []).map((tag) => [tag.id, tag.tag])
  );

  const tagSentimentCounts = new Map<
    string,
    { positive: number; negative: number; neutral: number; unknown: number }
  >();

  for (const link of tagLinks ?? []) {
    const rawLabel = tagLookup.get(link.tag_id);
    if (!rawLabel) {
      continue;
    }
    const tagLabel = normalizeTagLabel(rawLabel);
    if (!tagLabel) {
      continue;
    }
    const counts =
      tagSentimentCounts.get(tagLabel) ?? {
        positive: 0,
        negative: 0,
        neutral: 0,
        unknown: 0
      };
    const sentimentLabel = sentimentByReview.get(link.review_pk) ?? null;
    if (sentimentLabel === "negative") {
      counts.negative += 1;
    } else if (sentimentLabel === "positive") {
      counts.positive += 1;
    } else if (sentimentLabel === "neutral") {
      counts.neutral += 1;
    } else {
      counts.unknown += 1;
    }
    tagSentimentCounts.set(tagLabel, counts);
  }

  const strengthCounts = new Map<string, number>();
  const irritantCounts = new Map<string, number>();
  for (const [tagLabel, counts] of tagSentimentCounts.entries()) {
    const positiveScore = counts.positive + counts.neutral + counts.unknown;
    if (counts.negative >= 2 && counts.negative > counts.positive) {
      irritantCounts.set(tagLabel, counts.negative);
    } else if (positiveScore > 0) {
      strengthCounts.set(tagLabel, positiveScore);
    }
  }

  const toTopList = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));

  const strengths = toTopList(strengthCounts);
  const irritants = toTopList(irritantCounts);

  const reasons: string[] = [];
  let data_status: AnalyticsOverview["data_status"] = "ok";
  if (reviews.length === 0) {
    data_status = "empty";
    reasons.push("no_reviews_in_range");
  }
  if (!sentiment) {
    reasons.push("no_sentiment_data");
    if (data_status === "ok") {
      data_status = "partial";
    }
  }
  if (strengths.length === 0 && irritants.length === 0) {
    reasons.push("no_ai_topics");
    if (data_status === "ok") {
      data_status = "partial";
    }
  }
  if (replyableCount === 0) {
    reasons.push("no_replyable_reviews");
  }

  const overview: AnalyticsOverview = {
    scope: scopeBase,
    data_status,
    reasons,
    kpis: {
      reviews_total: reviews.length,
      reviews_with_text: replyableCount,
      avg_rating,
      negative_share_pct,
      response_rate_pct,
      replied_count: repliedCount,
      replyable_count: replyableCount
    },
    ratings: ratingBuckets,
    sentiment,
    topics: { strengths, irritants }
  };

  console.log("[analytics/overview]", {
    userId,
    preset,
    locationIdsCount: locationIds.length,
    status: data_status
  });

  return res.status(200).json(overview);
};

const handleTimeseries = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  if (filters.reject) {
    return res.status(200).json({ granularity: "day", points: [] });
  }

  const preset = filters.preset;
  const timeZone = filters.tz;
  const range = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );

  const locationId = filters.location_id ?? null;

  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  const rawGranularity = getQueryParam(req.query, "granularity") ?? "auto";
  const resolvedGranularity = resolveGranularity(rawGranularity, range);

  if (locationIds.length === 0) {
    const empty: AnalyticsTimeseries = { granularity: resolvedGranularity, points: [] };
    console.log("[analytics/timeseries]", {
      userId,
      preset,
      locationsCount: 0,
      status: "empty"
    });
    return res.status(200).json(empty);
  }

  let rows: ReviewLite[] = [];
  try {
    rows = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, range);
  } catch (error) {
    console.error("[analytics/timeseries] reviews error", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }
  if (rows.length >= 20000) {
    console.warn("[analytics/timeseries] max rows reached", {
      userId,
      preset,
      maxRows: 20000
    });
  }

  const points = buildTimeseriesPoints(rows, range, resolvedGranularity);

  const timeseries: AnalyticsTimeseries = {
    granularity: resolvedGranularity,
    points
  };

  console.log("[analytics/timeseries]", {
    userId,
    preset,
    locationIdsCount: locationIds.length,
    status: "ok",
    granularity: resolvedGranularity
  });

  return res.status(200).json(timeseries);
};

const handleDrivers = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  const preset = filters.preset;
  const timeZone = filters.tz;
  const rangeA = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );
  const rangeB = buildPreviousRange(rangeA);
  const locationId = filters.location_id ?? null;

  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  if (filters.reject || locationIds.length === 0) {
    const empty: AnalyticsDrivers = {
      period: {
        preset,
        from: preset === "all_time" ? null : rangeA.from,
        to: rangeA.to,
        location_id: locationId
      },
      totals: { tagged_count: 0 },
      positives: [],
      irritants: []
    };
    return res.status(200).json(empty);
  }

  let reviewsA: ReviewLite[] = [];
  let reviewsB: ReviewLite[] = [];
  try {
    reviewsA = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeA);
    reviewsB = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeB);
  } catch (error) {
    console.error("[analytics/drivers] reviews error", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const reviewIdsA = reviewsA.map((row) => row.id);
  const reviewIdsB = reviewsB.map((row) => row.id);
  if (reviewIdsA.length === 0) {
    const empty: AnalyticsDrivers = {
      period: {
        preset,
        from: preset === "all_time" ? null : rangeA.from,
        to: rangeA.to,
        location_id: locationId
      },
      totals: { tagged_count: 0 },
      positives: [],
      irritants: []
    };
    return res.status(200).json(empty);
  }

  const { data: sentimentRows } = await supabaseAdmin
    .from("review_ai_insights")
    .select("review_pk, sentiment")
    .in("review_pk", reviewIdsA);
  const sentiments = new Map(
    (sentimentRows ?? []).map((row) => [row.review_pk, row.sentiment])
  );

  const { data: aiTagLinksA } = await supabaseAdmin
    .from("review_ai_tags")
    .select("review_pk, tag_id")
    .in("review_pk", reviewIdsA);

  let source: "ai" | "manual" = "manual";
  let tagLinksA: Array<{ review_id: string; tag_label: string; tag_id?: string }> =
    [];
  let tagLinksB: Array<{ review_id: string; tag_label: string; tag_id?: string }> =
    [];

  if ((aiTagLinksA ?? []).length > 0) {
    source = "ai";
    const aiTagIds = Array.from(
      new Set((aiTagLinksA ?? []).map((row) => row.tag_id))
    );
    const { data: tagsData } = await supabaseAdmin
      .from("ai_tags")
      .select("id, tag")
      .in("id", aiTagIds);
    const tagLookup = new Map(
      (tagsData ?? []).map((tag) => [tag.id, tag.tag ?? ""])
    );
    tagLinksA = (aiTagLinksA ?? [])
      .map((row) => ({
        review_id: row.review_pk,
        tag_id: row.tag_id,
        tag_label: tagLookup.get(row.tag_id) ?? ""
      }))
      .filter((row) => row.tag_label);

    const { data: aiTagLinksB } = await supabaseAdmin
      .from("review_ai_tags")
      .select("review_pk, tag_id")
      .in("review_pk", reviewIdsB);
    tagLinksB = (aiTagLinksB ?? [])
      .map((row) => ({
        review_id: row.review_pk,
        tag_id: row.tag_id,
        tag_label: tagLookup.get(row.tag_id) ?? ""
      }))
      .filter((row) => row.tag_label);
  } else {
    const { data: reviewTagsA } = await supabaseAdmin
      .from("review_tags")
      .select("review_id, tag")
      .in("review_id", reviewIdsA);
    tagLinksA = (reviewTagsA ?? [])
      .map((row) => ({
        review_id: row.review_id,
        tag_label: row.tag
      }))
      .filter((row) => row.tag_label);

    const { data: reviewTagsB } = await supabaseAdmin
      .from("review_tags")
      .select("review_id, tag")
      .in("review_id", reviewIdsB);
    tagLinksB = (reviewTagsB ?? [])
      .map((row) => ({
        review_id: row.review_id,
        tag_label: row.tag
      }))
      .filter((row) => row.tag_label);
  }

  const tagStats = computeTagStats({
    reviewRows: reviewsA,
    tagLinks: tagLinksA,
    sentiments
  });
  const totalCount = Array.from(tagStats.values()).reduce(
    (sum, stat) => sum + stat.count,
    0
  );
  const previousCounts = new Map<string, number>();
  tagLinksB.forEach((link) => {
    const normalized = normalizeTagLabel(link.tag_label);
    if (!normalized) {
      return;
    }
    previousCounts.set(normalized, (previousCounts.get(normalized) ?? 0) + 1);
  });

  const mapped = mapDrivers({
    tagStats,
    totalCount,
    previousCounts,
    source
  });

  const response: AnalyticsDrivers = {
    period: {
      preset,
      from: preset === "all_time" ? null : rangeA.from,
      to: rangeA.to,
      location_id: locationId
    },
    totals: { tagged_count: totalCount },
    positives: mapped.positives,
    irritants: mapped.irritants
  };

  return res.status(200).json(response);
};

const handleQuality = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  const preset = filters.preset;
  const timeZone = filters.tz;
  const range = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );
  const locationId = filters.location_id ?? null;

  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  if (filters.reject || locationIds.length === 0) {
    const empty: AnalyticsQuality = {
      reply_rate: null,
      avg_reply_delay_hours: null,
      sla_24h: null,
      replyable_count: 0,
      replied_count: 0,
      replied_with_time_count: 0
    };
    return res.status(200).json(empty);
  }

  let reviews: ReviewLite[] = [];
  try {
    reviews = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, range);
  } catch (error) {
    console.error("[analytics/quality] reviews error", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const replyable = reviews.filter(isReplyable);
  const replyableCount = replyable.length;
  const replied = replyable.filter(isReplied);
  const repliedCount = replied.length;

  const delays: number[] = [];
  replied.forEach((row) => {
    const replyTime = row.replied_at ? new Date(row.replied_at) : null;
    const baseTime = row.create_time ?? row.update_time ?? row.created_at ?? null;
    if (!replyTime || !baseTime) {
      return;
    }
    const baseDate = new Date(baseTime);
    const diffMs = replyTime.getTime() - baseDate.getTime();
    if (Number.isFinite(diffMs) && diffMs >= 0) {
      delays.push(diffMs / (1000 * 60 * 60));
    }
  });

  const avgDelay =
    delays.length > 0
      ? Number((delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1))
      : null;
  const sla24 =
    delays.length > 0
      ? delays.filter((value) => value <= 24).length / delays.length
      : null;

  const response: AnalyticsQuality = {
    reply_rate: replyableCount > 0 ? repliedCount / replyableCount : null,
    avg_reply_delay_hours: avgDelay,
    sla_24h: sla24 !== null ? Number(sla24.toFixed(2)) : null,
    replyable_count: replyableCount,
    replied_count: repliedCount,
    replied_with_time_count: delays.length
  };

  return res.status(200).json(response);
};

const handleDrilldown = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  const preset = filters.preset;
  const timeZone = filters.tz;
  const range = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );
  const locationId = filters.location_id ?? null;
  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  const tagParam = getQueryParam(req.query, "tag") ?? "";
  const sourceParam = getQueryParam(req.query, "source") ?? "manual";
  const tagIdsParam = getQueryParam(req.query, "tag_ids") ?? "";
  const offsetParam = Number(getQueryParam(req.query, "offset") ?? 0);
  const limitParam = Number(getQueryParam(req.query, "limit") ?? 10);
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;
  const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, limitParam)) : 10;

  if (filters.reject || locationIds.length === 0 || !tagParam) {
    const empty: AnalyticsDrilldown = {
      items: [],
      offset,
      limit,
      has_more: false
    };
    return res.status(200).json(empty);
  }

  let reviews: ReviewLite[] = [];
  try {
    reviews = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, range);
  } catch (error) {
    console.error("[analytics/drilldown] reviews error", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const reviewIds = reviews.map((row) => row.id);
  const normalizedTag = normalizeTagLabel(tagParam);
  let matchingReviewIds = new Set<string>();
  if (reviewIds.length === 0) {
    const empty: AnalyticsDrilldown = {
      items: [],
      offset,
      limit,
      has_more: false
    };
    return res.status(200).json(empty);
  }

  if (sourceParam === "ai") {
    const tagIds = tagIdsParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const { data: aiTagLinks } = await supabaseAdmin
      .from("review_ai_tags")
      .select("review_pk, tag_id")
      .in("review_pk", reviewIds);
    const allowed = new Set(tagIds);
    (aiTagLinks ?? []).forEach((row) => {
      if (allowed.has(row.tag_id)) {
        matchingReviewIds.add(row.review_pk);
      }
    });
  } else {
    const { data: reviewTags } = await supabaseAdmin
      .from("review_tags")
      .select("review_id, tag")
      .in("review_id", reviewIds);
    (reviewTags ?? []).forEach((row) => {
      if (normalizeTagLabel(row.tag) === normalizedTag) {
        matchingReviewIds.add(row.review_id);
      }
    });
  }

  const matchingReviews = reviews.filter((row) => matchingReviewIds.has(row.id));
  matchingReviews.sort((a, b) =>
    (b.create_time ?? "").localeCompare(a.create_time ?? "")
  );

  const sliced = matchingReviews.slice(offset, offset + limit);
  const items = sliced.map((row) => ({
    id: row.id,
    review_id: row.review_id,
    rating: row.rating,
    comment: row.comment,
    author_name: row.author_name,
    create_time: row.create_time,
    location_id: row.location_id
  }));
  const hasMore = offset + limit < matchingReviews.length;

  const response: AnalyticsDrilldown = {
    items,
    offset,
    limit,
    has_more: hasMore
  };

  return res.status(200).json(response);
};

const handleCompare = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  const preset = filters.preset;
  const timeZone = filters.tz;
  const rangeA = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );
  const rangeB = buildPreviousRange(rangeA);

  const locationId = filters.location_id ?? null;
  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  if (filters.reject || locationIds.length === 0) {
    const emptyMetrics = computeCompareMetrics([]);
    const compare = buildCompareResponse(preset, rangeA, rangeB, emptyMetrics, emptyMetrics);
    return res.status(200).json(compare);
  }

  let rowsA: ReviewLite[] = [];
  let rowsB: ReviewLite[] = [];
  try {
    rowsA = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeA);
    rowsB = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeB);
  } catch (error) {
    console.error("[analytics/compare] reviews error", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const metricsA = computeCompareMetrics(rowsA);
  const metricsB = computeCompareMetrics(rowsB);
  const compare = buildCompareResponse(preset, rangeA, rangeB, metricsA, metricsB);

  console.log("[analytics/compare]", {
    userId,
    preset,
    locationIdsCount: locationIds.length
  });

  return res.status(200).json(compare);
};

const handleInsights = async (
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never
) => {
  const filters = parseFilters(normalizeAnalyticsQuery(req.query));
  const preset = filters.preset;
  const timeZone = filters.tz;
  const rangeA = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );
  const rangeStart = new Date(rangeA.from);
  const rangeEnd = new Date(rangeA.to);
  const rangeB = buildPreviousRange(rangeA);

  const modeParam = getQueryParam(req.query, "mode") ?? "auto";
  const mode =
    modeParam === "ai" || modeParam === "basic" || modeParam === "auto"
      ? modeParam
      : "auto";

  const locationId = filters.location_id ?? null;
  const { locationIds, missing } = await resolveLocationIds(
    supabaseAdmin,
    userId,
    locationId
  );
  if (missing) {
    return res.status(404).json({ error: "Location not found" });
  }

  const emptyMetrics = computeCompareMetrics([]);
  let metricsA = emptyMetrics;
  let metricsB = emptyMetrics;
  let rowsA: ReviewLite[] = [];
  let rowsB: ReviewLite[] = [];

  if (!filters.reject && locationIds.length > 0) {
    try {
      rowsA = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeA);
      rowsB = await fetchReviewsForRange(supabaseAdmin, userId, locationIds, rangeB);
      metricsA = computeCompareMetrics(rowsA);
      metricsB = computeCompareMetrics(rowsB);
    } catch (error) {
      console.error("[analytics/insights] reviews error", error);
      return res.status(500).json({ error: "Failed to load reviews" });
    }
  }

  const compare = buildCompareResponse(preset, rangeA, rangeB, metricsA, metricsB);
  const granularity = resolveGranularity("auto", rangeA);
  const rangeEndBucket =
    granularity === "week" ? getWeekStartUtc(rangeEnd) : startOfDayUtc(rangeEnd);
  const rawTailStart = addDaysUtc(
    rangeEndBucket,
    granularity === "week" ? -77 : -11
  );
  const clampedTailStart =
    rawTailStart < rangeStart ? rangeStart : rawTailStart;
  const tailRange = { from: clampedTailStart.toISOString(), to: rangeA.to };
  const timeseriesPoints = buildTimeseriesPoints(rowsA, tailRange, granularity);
  const basicInsights = buildBasicInsights(compare, timeseriesPoints);

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const shouldUseAi = mode !== "basic" && apiKey.length > 0;
  let used_ai = false;
  let insights = basicInsights;
  if (shouldUseAi) {
    const context = {
      periodA: compare.periodA,
      periodB: compare.periodB,
      location: locationId ?? "all",
      metrics: compare.metrics,
      granularity,
      timeseries_last_12: timeseriesPoints.slice(-12)
    };
    const aiResult = await requestAiInsights(apiKey, context, mode);
    if (aiResult.insights) {
      insights = aiResult.insights;
      used_ai = aiResult.used_ai;
    }
  }

  const response: AnalyticsInsights = {
    mode: shouldUseAi ? "ai" : "basic",
    used_ai,
    insights
  };

  console.log("[analytics/insights]", {
    userId,
    preset,
    locationIdsCount: locationIds.length,
    mode: response.mode,
    used_ai
  });

  return res.status(200).json(response);
};

const handler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId, supabaseAdmin } = auth;

  const viewParam =
    getQueryParam(req.query, "view") ?? getQueryParam(req.query, "op");
  if (viewParam === "drivers") {
    return handleDrivers(req, res, userId, supabaseAdmin);
  }
  if (viewParam === "drilldown") {
    return handleDrilldown(req, res, userId, supabaseAdmin);
  }
  if (viewParam === "quality") {
    return handleQuality(req, res, userId, supabaseAdmin);
  }
  if (viewParam === "compare") {
    return handleCompare(req, res, userId, supabaseAdmin);
  }
  if (viewParam === "insights") {
    return handleInsights(req, res, userId, supabaseAdmin);
  }
  if (viewParam === "timeseries") {
    return handleTimeseries(req, res, userId, supabaseAdmin);
  }
  return handleOverview(req, res, userId, supabaseAdmin);
};

export default handler;
