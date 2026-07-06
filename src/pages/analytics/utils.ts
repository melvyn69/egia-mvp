import type { AnalyticsPoint, AnalyticsTopic, MetricKey, TrendState } from "./types";

export const EMPTY_ANALYSIS = "Pas encore assez de données pour cette analyse.";

export const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

export const formatRating = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}/5`;

export const formatRatio = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

export const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

export const formatDelta = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

export const formatDeltaCount = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value)}`;

export const formatDeltaPct = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;

export const formatDeltaPoints = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)} pts`;

export const formatHours = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)} h`;

export const formatShare = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}%`;

export const formatDateKey = (date: Date, timeZone: string): string => {
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

export const shiftDateKey = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getTopicToneLabel = (tone: AnalyticsTopic["tone"]) => {
  switch (tone) {
    case "positive":
      return "Positif";
    case "negative":
      return "Négatif";
    default:
      return "Neutre";
  }
};

export const getTopicImpactLabel = (topic: AnalyticsTopic) => {
  if (topic.tone === "negative") {
    return "Risque";
  }
  if (topic.tone === "positive") {
    return "Levier";
  }
  return "À qualifier";
};

export const getTopicSummary = (topic: AnalyticsTopic) => {
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

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getReasonLabel = (reasons: string[] | null | undefined): string => {
  const safeReasons = Array.isArray(reasons) ? reasons : [];
  if (safeReasons.includes("no_locations")) {
    return "Aucune fiche connectée";
  }
  if (safeReasons.includes("no_reviews_in_range")) {
    return "Aucun avis sur la période";
  }
  if (safeReasons.includes("no_sentiment_data")) {
    return "Analyse en cours";
  }
  if (safeReasons.includes("no_ai_topics")) {
    return "Pas de thèmes détectés";
  }
  if (safeReasons.includes("no_replyable_reviews")) {
    return "Aucun avis avec texte";
  }
  return "Pas assez de données";
};

export const getPresetLabel = (preset: string): string => {
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

export const getTrendState = (
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

export const getMetricLabel = (metric: MetricKey) => {
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

export const formatMetricValue = (metric: MetricKey, value: number | null) => {
  if (metric === "reviews") {
    return formatCount(value);
  }
  if (metric === "avg_rating") {
    return formatRating(value);
  }
  return formatRatio(value);
};

export const getMetricValue = (
  metric: MetricKey,
  point: Pick<AnalyticsPoint, "review_count" | "avg_rating" | "neg_share" | "reply_rate">
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

export const getMetricDomain = (
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

export const buildLinePath = (
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

export const buildAreaPath = (
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

export const getPointCoordinates = (
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
