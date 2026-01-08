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

  const normalizeTagLabel = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

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
  const rangeStart = new Date(range.from);
  const rangeEnd = new Date(range.to);
  const rangeDays = Math.max(
    1,
    Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const resolvedGranularity: "day" | "week" =
    rawGranularity === "day" || rawGranularity === "week"
      ? rawGranularity
      : rangeDays <= 90
        ? "day"
        : "week";

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

  const buildReviewsQuery = () => {
    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "rating, comment, reply_text, replied_at, owner_reply, owner_reply_time, status, create_time, update_time, created_at, location_id"
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

  const rows: Array<{
    rating: number | null;
    comment: string | null;
    reply_text: string | null;
    replied_at: string | null;
    owner_reply: string | null;
    owner_reply_time: string | null;
    status: string | null;
    create_time: string | null;
    update_time: string | null;
    created_at: string | null;
    location_id: string | null;
  }> = [];
  const pageSize = 1000;
  const maxRows = 20000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data: pageData, error: pageError } = await buildReviewsQuery().range(
      offset,
      offset + pageSize - 1
    );
    if (pageError) {
      console.error("[analytics/timeseries] reviews error", pageError);
      return res.status(500).json({ error: "Failed to load reviews" });
    }
    const pageRows = pageData ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      break;
    }
  }
  if (rows.length >= maxRows) {
    console.warn("[analytics/timeseries] max rows reached", {
      userId,
      preset,
      maxRows
    });
  }

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
    const time =
      row.create_time ?? row.update_time ?? row.created_at ?? null;
    if (!time) {
      return;
    }
    const date = new Date(time);
    const bucketDate =
      resolvedGranularity === "week" ? getWeekStartUtc(date) : date;
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

  const bucketStart =
    resolvedGranularity === "week"
      ? getWeekStartUtc(rangeStart)
      : startOfDayUtc(rangeStart);
  const bucketEnd =
    resolvedGranularity === "week"
      ? getWeekStartUtc(rangeEnd)
      : startOfDayUtc(rangeEnd);
  const stepDays = resolvedGranularity === "week" ? 7 : 1;
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
    const neg_share =
      review_count > 0 ? entry!.negative_count / review_count : null;
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
  if (viewParam === "timeseries") {
    return handleTimeseries(req, res, userId, supabaseAdmin);
  }
  return handleOverview(req, res, userId, supabaseAdmin);
};

export default handler;
