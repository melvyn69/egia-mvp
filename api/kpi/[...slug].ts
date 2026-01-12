import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from "../../server/_shared_dist/_date.js";
import { parseFilters } from "../../server/_shared_dist/_filters.js";
import { requireUser } from "../../server/_shared_dist/_auth.js";

type KpiSummary = {
  period: { preset: string; from: string | null; to: string | null; tz: string };
  scope: { locationId?: string | null; locationsCount: number };
  counts: {
    reviews_total: number;
    reviews_with_text: number;
    reviews_replied: number;
    reviews_replyable: number;
  };
  ratings: {
    avg_rating: number | null;
  };
  response: {
    response_rate_pct: number | null;
  };
  sentiment: {
    sentiment_positive_pct: number | null;
    sentiment_samples: number;
  };
  nps: {
    nps_score: number | null;
    nps_samples: number;
  };
  meta: {
    data_status: "ok" | "no_data" | "collecting";
    reasons: string[];
  };
  top_tags?: Array<{ tag: string; count: number }>;
};

const getRequestId = (req: VercelRequest) => {
  const header = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
  if (Array.isArray(header)) {
    return header[0] ?? randomUUID();
  }
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return randomUUID();
};

const isMissingEnvError = (err: unknown) =>
  err instanceof Error && err.message === "Missing SUPABASE env vars";

const fetchActiveLocationIds = async (
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never,
  userId: string
) => {
  const { data } = await supabaseAdmin
    .from("business_settings")
    .select("active_location_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const activeIds = Array.isArray(data?.active_location_ids)
    ? data?.active_location_ids.filter(Boolean)
    : null;
  return activeIds && activeIds.length > 0 ? new Set(activeIds) : null;
};

const handleKpiSummary = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const route = "/api/kpi/summary";
  const requestId = getRequestId(req);
  let userId: string | null = null;
  let locationId: string | null = null;

  try {
    let auth;
    try {
      auth = await requireUser(req, res);
    } catch (err) {
      const missingEnv = isMissingEnvError(err);
      console.error("[kpi-summary] auth error", {
        route,
        query: req.query,
        reason: missingEnv ? "missing_env" : undefined,
        error: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : null
        },
        requestId
      });
      return res.status(500).json({
        error: "Internal server error",
        requestId,
        reason: missingEnv ? "missing_env" : undefined
      });
    }
    if (!auth) {
      return;
    }
    userId = auth.userId;
    const { supabaseAdmin } = auth;

    const filters = parseFilters(req.query);
    if (filters.reject) {
      return res.status(200).json({
        period: { preset: filters.preset, from: null, to: null, tz: filters.tz },
        scope: { locationId: null, locationsCount: 0 },
        counts: {
          reviews_total: 0,
          reviews_with_text: 0,
          reviews_replied: 0,
          reviews_replyable: 0
        },
        ratings: { avg_rating: null },
        response: { response_rate_pct: null },
        sentiment: { sentiment_positive_pct: null, sentiment_samples: 0 },
        nps: { nps_score: null, nps_samples: 0 },
        meta: { data_status: "no_data", reasons: ["invalid_source"] },
        top_tags: []
      } satisfies KpiSummary);
    }

    const locationParam = req.query.location_id;
    locationId = Array.isArray(locationParam)
      ? locationParam[0]
      : locationParam ?? null;

    const preset = filters.preset;
    const from = filters.from;
    const to = filters.to;
    const timeZone = filters.tz;

    const range = resolveDateRange(
      preset as Parameters<typeof resolveDateRange>[0],
      from,
      to,
      timeZone
    );
    const periodFrom = preset === "all_time" ? null : range.from;
    const periodTo = range.to;
    let locationIds: string[] = [];
    const activeLocationIds = await fetchActiveLocationIds(
      supabaseAdmin,
      userId
    );
    if (locationId) {
      const { data: locationRow } = await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId)
        .eq("location_resource_name", locationId)
        .maybeSingle();
      if (!locationRow) {
        return res.status(404).json({ error: "Location not found" });
      }
      if (activeLocationIds && !activeLocationIds.has(locationRow.id)) {
        return res.status(404).json({ error: "Location not found" });
      }
      locationIds = [locationId];
    } else {
      const { data: locations } = await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId);
      const filtered = activeLocationIds
        ? (locations ?? []).filter((location) =>
            activeLocationIds.has(location.id)
          )
        : locations ?? [];
      locationIds = filtered
        .map((location) => location.location_resource_name)
        .filter(Boolean);
    }

    if (locationIds.length === 0) {
      const summary: KpiSummary = {
        period: { preset, from: periodFrom, to: periodTo, tz: timeZone },
        scope: { locationId, locationsCount: 0 },
        counts: {
          reviews_total: 0,
          reviews_with_text: 0,
          reviews_replied: 0,
          reviews_replyable: 0
        },
        ratings: { avg_rating: null },
        response: { response_rate_pct: null },
        sentiment: { sentiment_positive_pct: null, sentiment_samples: 0 },
        nps: { nps_score: null, nps_samples: 0 },
        meta: { data_status: "no_data", reasons: ["no_locations"] },
        top_tags: []
      };
      console.log("[kpi-summary]", {
        route,
        userId,
        location_id: locationId ?? "all",
        locationsCount: 0,
        preset
      });
      return res.status(200).json(summary);
    }

    const buildReviewQuery = () => {
      let query = supabaseAdmin
        .from("google_reviews")
        .select(
          "id, rating, comment, reply_text, replied_at, owner_reply, owner_reply_time, status"
        );
      query = query.eq("user_id", userId);
      if (locationIds.length === 1) {
        query = query.eq("location_id", locationIds[0]);
      } else {
        query = query.in("location_id", locationIds);
      }
      query = query.or(
        `and(update_time.gte.${range.from},update_time.lte.${range.to}),` +
          `and(update_time.is.null,create_time.gte.${range.from},create_time.lte.${range.to}),` +
          `and(update_time.is.null,create_time.is.null,created_at.gte.${range.from},created_at.lte.${range.to})`
      );
      if (filters.rating_min !== undefined) {
        query = query.gte("rating", filters.rating_min);
      }
      if (filters.rating_max !== undefined) {
        query = query.lte("rating", filters.rating_max);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      return query;
    };

    const { data: reviewRows, error: reviewsError } = await buildReviewQuery();
    if (reviewsError) {
      throw reviewsError;
    }

    const reviews = reviewRows ?? [];
    const reviews_total = reviews.length;
    const reviewsWithTextRows = reviews.filter(
      (row) => typeof row.comment === "string" && row.comment.trim().length > 0
    );
    const reviews_with_text = reviewsWithTextRows.length;

    const isReplied = (row: typeof reviews[number]) =>
      Boolean(
        row.reply_text ||
          row.replied_at ||
          row.owner_reply ||
          row.owner_reply_time ||
          row.status === "replied"
      );
    const reviews_replied = reviewsWithTextRows.filter(isReplied).length;

    // Replyable = avis avec texte non vide.
    const reviews_replyable = reviews_with_text;

    const ratings = reviews
      .map((row) => row.rating)
      .filter((value): value is number => typeof value === "number");
    const avg_rating =
      ratings.length > 0
        ? Number(
            (
              ratings.reduce((acc, value) => acc + value, 0) / ratings.length
            ).toFixed(1)
          )
        : null;

    const promoters = ratings.filter((value) => value >= 5).length;
    const detractors = ratings.filter((value) => value <= 3).length;
    const nps_samples = ratings.length;
    const nps_score =
      nps_samples > 0
        ? Math.round(((promoters - detractors) / nps_samples) * 100)
        : null;

    let response_rate: number | null =
      reviews_replyable > 0
        ? Math.round((reviews_replied / reviews_replyable) * 100)
        : null;
    if (response_rate !== null && (response_rate < 0 || response_rate > 100)) {
      response_rate = null;
    }

    const reviewIds = reviews.map((row) => row.id);
    let sentiment_samples = 0;
    let sentiment_positive_pct: number | null = null;
    if (reviewIds.length > 0) {
      const { data: sentiments, error: sentimentsError } = await supabaseAdmin
        .from("review_ai_insights")
        .select("sentiment, review_pk")
        .in("review_pk", reviewIds);
      if (sentimentsError) {
        throw sentimentsError;
      }
      sentiment_samples = (sentiments ?? []).filter(
        (row) => typeof row.sentiment === "string"
      ).length;
      const positives = (sentiments ?? []).filter(
        (row) => row.sentiment === "positive"
      ).length;
      sentiment_positive_pct =
        sentiment_samples > 0
          ? Math.round((positives / sentiment_samples) * 100)
          : null;
    }

    const reasons: string[] = [];
    let data_status: KpiSummary["meta"]["data_status"] = "ok";
    if (reviews_total === 0) {
      data_status = "no_data";
      reasons.push("no_reviews_in_range");
    }
    if (response_rate === null && reviews_replyable > 0) {
      reasons.push("invalid_response_rate");
    }
    if (reviews_replyable === 0) {
      reasons.push("no_replyable_reviews");
    }
    if (sentiment_samples === 0) {
      reasons.push("no_sentiment_yet");
      if (data_status === "ok") {
        data_status = "collecting";
      }
    }

    const summary: KpiSummary = {
      period: { preset, from: periodFrom, to: periodTo, tz: timeZone },
      scope: { locationId, locationsCount: locationIds.length },
      counts: {
        reviews_total,
        reviews_with_text,
        reviews_replied,
        reviews_replyable
      },
      ratings: { avg_rating },
      response: { response_rate_pct: response_rate },
      sentiment: { sentiment_positive_pct, sentiment_samples },
      nps: { nps_score, nps_samples },
      meta: { data_status, reasons },
      top_tags: []
    };

    console.log("[kpi-summary]", {
      route,
      userId,
      location_id: locationId ?? "all",
      locationsCount: locationIds.length,
      reviews_total,
      data_status
    });

    return res.status(200).json(summary);
  } catch (err) {
    const missingEnv = isMissingEnvError(err);
    console.error("[kpi-summary] error", {
      route,
      query: req.query,
      userId,
      location_id: locationId,
      reason: missingEnv ? "missing_env" : undefined,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null
      },
      requestId
    });
    return res.status(500).json({
      error: "Internal server error",
      requestId,
      reason: missingEnv ? "missing_env" : undefined
    });
  }
};

// Smoke test:
// curl -i "$BASE/api/kpi/summary?location_id=...&preset=this_week&tz=Europe/Paris&source=google" -H "Authorization: Bearer $JWT"

type Range = { from: string; to: string };
type KpiCompareSummary = {
  reviews_total: number | null;
  reviews_with_text: number | null;
  avg_rating: number | null;
  sentiment_positive?: number | null;
  sentiment_neutral?: number | null;
  sentiment_negative?: number | null;
  top_tags?: unknown;
};

const handleKpiCompare = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) {
      return;
    }
    const { userId, supabaseAdmin } = auth;

    const locationParam = req.query.location_id;
    const locationId = Array.isArray(locationParam)
      ? locationParam[0]
      : locationParam;
    if (!locationId) {
      return res.status(400).json({ error: "Missing location_id" });
    }

    const { data: locationRow } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId)
      .eq("location_resource_name", locationId)
      .maybeSingle();
    if (!locationRow) {
      return res.status(404).json({ error: "Location not found" });
    }

    const filters = parseFilters(req.query);
    if (filters.reject) {
      return res.status(200).json({ a: null, b: null, delta: null });
    }
    const timeZone = filters.tz;

    const splitParam = req.query.split_date;
    const splitDate = Array.isArray(splitParam) ? splitParam[0] : splitParam;

    const aFromParam = req.query.a_from;
    const aToParam = req.query.a_to;
    const bFromParam = req.query.b_from;
    const bToParam = req.query.b_to;

    let rangeA: Range;
    let rangeB: Range;

    if (aFromParam && aToParam && bFromParam && bToParam) {
      rangeA = {
        from: Array.isArray(aFromParam) ? aFromParam[0] : aFromParam,
        to: Array.isArray(aToParam) ? aToParam[0] : aToParam
      };
      rangeB = {
        from: Array.isArray(bFromParam) ? bFromParam[0] : bFromParam,
        to: Array.isArray(bToParam) ? bToParam[0] : bToParam
      };
    } else if (splitDate) {
      const preset = filters.preset;
      const fromParam = filters.from;
      const toParam = filters.to;
      const baseRange = resolveDateRange(
        preset as Parameters<typeof resolveDateRange>[0],
        fromParam,
        toParam,
        timeZone
      );
      rangeA = { from: baseRange.from, to: splitDate };
      rangeB = { from: splitDate, to: baseRange.to };
    } else {
      return res.status(400).json({ error: "Missing compare range" });
    }

    const [summaryA, summaryB] = await Promise.all([
      supabaseAdmin
        .rpc("kpi_summary", {
          p_location_id: locationId,
          p_from: rangeA.from,
          p_to: rangeA.to,
          p_rating_min: filters.rating_min ?? null,
          p_rating_max: filters.rating_max ?? null,
          p_sentiment: filters.sentiment ?? null,
          p_status: filters.status ?? null,
          p_tags: filters.tags ?? null
        })
        .maybeSingle(),
      supabaseAdmin
        .rpc("kpi_summary", {
          p_location_id: locationId,
          p_from: rangeB.from,
          p_to: rangeB.to,
          p_rating_min: filters.rating_min ?? null,
          p_rating_max: filters.rating_max ?? null,
          p_sentiment: filters.sentiment ?? null,
          p_status: filters.status ?? null,
          p_tags: filters.tags ?? null
        })
        .maybeSingle()
    ]);

    if (summaryA.error || summaryB.error) {
      return res.status(500).json({ error: "Failed to load KPI compare" });
    }

    const summaryAData = (summaryA.data ?? null) as KpiCompareSummary | null;
    const summaryBData = (summaryB.data ?? null) as KpiCompareSummary | null;

    const getDelta = (a: number | null | undefined, b: number | null | undefined) =>
      a === null || b === null || a === undefined || b === undefined ? null : b - a;

    return res.status(200).json({
      a: summaryAData,
      b: summaryBData,
      delta: summaryAData && summaryBData
        ? {
            reviews_total: getDelta(summaryAData.reviews_total, summaryBData.reviews_total),
            reviews_with_text: getDelta(
              summaryAData.reviews_with_text,
              summaryBData.reviews_with_text
            ),
            avg_rating: getDelta(summaryAData.avg_rating, summaryBData.avg_rating),
            sentiment_positive: getDelta(
              summaryAData.sentiment_positive,
              summaryBData.sentiment_positive
            )
          }
        : null
    });
  } catch (err) {
    console.error("[kpi-compare] failed", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getKpiRouteFromRequest = (req: VercelRequest): string => {
  // 1) Preferred: Vercel catch-all param (should be `slug` for `[...slug].ts`).
  const slugParam = (req.query as any)?.slug;
  const parts = Array.isArray(slugParam)
    ? slugParam
    : typeof slugParam === "string" && slugParam.length > 0
    ? [slugParam]
    : [];
  if (parts.length > 0) {
    return parts.join("/");
  }

  // 2) Fallback: parse from URL path (more robust when rewrites/proxies alter params).
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const pathname = url.pathname || "";
    // Expected: /api/kpi/<route>
    const prefix = "/api/kpi/";
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      return rest.replace(/^\/+/, "").replace(/\/+$/, "");
    }
    // Also support /api/kpi (no trailing slash)
    if (pathname === "/api/kpi" || pathname === "/api/kpi/") {
      return "";
    }
  } catch {
    // ignore
  }

  // 3) Optional: allow `?route=summary`
  const routeParam = (req.query as any)?.route;
  if (typeof routeParam === "string" && routeParam.length > 0) {
    return routeParam;
  }

  return "";
};

const routeKpi = (req: VercelRequest, res: VercelResponse) => {
  const route = getKpiRouteFromRequest(req);

  // Helpful debug (kept minimal)
  console.log("[kpi] route", {
    route,
    url: req.url,
    query: req.query
  });

  if (route === "summary") {
    return handleKpiSummary(req, res);
  }
  if (route === "compare") {
    return handleKpiCompare(req, res);
  }

  return res.status(404).json({ error: "Not found" });
};

export default routeKpi;
