import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_shared/_auth.js";
import { resolveDateRange } from "../_shared/_date.js";
import { parseFilters } from "../_shared/_filters.js";

type AnalyticsTimeseries = {
  scope: {
    preset: string;
    from: string | null;
    to: string | null;
    location_id: string | null;
    location_ids_count: number;
    granularity: "day" | "week";
  };
  data_status: "ok" | "empty" | "partial";
  reasons: string[];
  points: Array<{
    bucket_start: string;
    reviews_total: number;
    avg_rating: number | null;
    negative_share_pct: number | null;
    reviews_with_text: number;
  }>;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const getWeekStartUtc = (date: Date) => {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
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

  const filters = parseFilters(req.query);
  if (filters.reject) {
    const empty: AnalyticsTimeseries = {
      scope: {
        preset: filters.preset,
        from: null,
        to: null,
        location_id: null,
        location_ids_count: 0,
        granularity: "day"
      },
      data_status: "empty",
      reasons: ["invalid_source"],
      points: []
    };
    return res.status(200).json(empty);
  }
  const preset = filters.preset;
  const timeZone = filters.tz;
  const range = resolveDateRange(
    preset as Parameters<typeof resolveDateRange>[0],
    filters.from,
    filters.to,
    timeZone
  );

  const locationParam = req.query.location_id;
  const locationId = Array.isArray(locationParam)
    ? locationParam[0]
    : locationParam ?? null;

  let locationIds: string[] = [];
  if (locationId) {
    const { data: locationRow } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId)
      .eq("location_resource_name", locationId)
      .maybeSingle();
    if (!locationRow) {
      return res.status(404).json({ error: "Location not found" });
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

  const rawGranularity = req.query.granularity;
  const granularityParam = Array.isArray(rawGranularity)
    ? rawGranularity[0]
    : rawGranularity;
  const rangeDays =
    (new Date(range.to).getTime() - new Date(range.from).getTime()) /
    (1000 * 60 * 60 * 24);
  const defaultGranularity = rangeDays > 45 ? "week" : "day";
  const granularity =
    granularityParam === "week" || granularityParam === "day"
      ? granularityParam
      : defaultGranularity;

  const scope = {
    preset,
    from: preset === "all_time" ? null : range.from,
    to: range.to,
    location_id: locationId,
    location_ids_count: locationIds.length,
    granularity
  };

  if (locationIds.length === 0) {
    const empty: AnalyticsTimeseries = {
      scope,
      data_status: "empty",
      reasons: ["no_locations"],
      points: []
    };
    console.log("[analytics/timeseries]", {
      userId,
      preset,
      locationsCount: 0,
      status: "empty"
    });
    return res.status(200).json(empty);
  }

  let reviewsQuery = supabaseAdmin
    .from("google_reviews")
    .select("rating, comment, create_time, update_time, created_at")
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

  const { data: reviewsData, error: reviewsError } = await reviewsQuery;
  if (reviewsError) {
    console.error("[analytics/timeseries] reviews error", reviewsError);
    return res.status(500).json({ error: "Failed to load reviews" });
  }

  const rows = reviewsData ?? [];
  if (rows.length === 0) {
    const empty: AnalyticsTimeseries = {
      scope,
      data_status: "empty",
      reasons: ["no_reviews_in_range"],
      points: []
    };
    console.log("[analytics/timeseries]", {
      userId,
      preset,
      locationsCount: locationIds.length,
      status: "empty"
    });
    return res.status(200).json(empty);
  }

  const buckets = new Map<
    string,
    {
      reviews_total: number;
      reviews_with_text: number;
      rating_sum: number;
      rating_count: number;
      negative_count: number;
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
      granularity === "week" ? getWeekStartUtc(date) : date;
    const key = toDateKey(bucketDate);
    const entry = buckets.get(key) ?? {
      reviews_total: 0,
      reviews_with_text: 0,
      rating_sum: 0,
      rating_count: 0,
      negative_count: 0
    };
    entry.reviews_total += 1;
    if (typeof row.comment === "string" && row.comment.trim().length > 0) {
      entry.reviews_with_text += 1;
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

  const points = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, entry]) => {
      const avg_rating =
        entry.rating_count > 0
          ? Number((entry.rating_sum / entry.rating_count).toFixed(1))
          : null;
      const negative_share_pct =
        entry.rating_count > 0
          ? Math.round((entry.negative_count / entry.rating_count) * 100)
          : null;
      return {
        bucket_start: new Date(`${key}T00:00:00.000Z`).toISOString(),
        reviews_total: entry.reviews_total,
        avg_rating,
        negative_share_pct,
        reviews_with_text: entry.reviews_with_text
      };
    });

  const timeseries: AnalyticsTimeseries = {
    scope,
    data_status: "ok",
    reasons: [],
    points
  };

  console.log("[analytics/timeseries]", {
    userId,
    preset,
    locationIdsCount: locationIds.length,
    status: "ok",
    granularity
  });

  return res.status(200).json(timeseries);
};

export default handler;
