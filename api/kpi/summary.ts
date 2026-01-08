import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from '../server/_date.ts';
import { parseFilters } from '../server/_filters.ts';
import { requireUser } from '../server/_auth.ts';

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

const handler = async (req: VercelRequest, res: VercelResponse) => {
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

    const locationParam = req.query.location_id;
    locationId = Array.isArray(locationParam)
      ? locationParam[0]
      : locationParam;
    if (!locationId) {
      return res.status(400).json({ error: "Missing location_id" });
    }
    console.log("[kpi-summary]", {
      route,
      query: req.query,
      userId,
      location_id: locationId
    });

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
      return res.status(200).json({
        reviews_total: 0,
        reviews_with_text: 0,
        avg_rating: null,
        sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
        top_tags: [],
        range: { from: null, to: null }
      });
    }

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
    console.log("[kpi-summary] range", {
      preset,
      from: range.from,
      to: range.to,
      tz: timeZone
    });

    const args = {
      p_location_id: locationId,
      p_from: range.from,
      p_to: range.to,
      p_rating_min: filters.rating_min ?? null,
      p_rating_max: filters.rating_max ?? null,
      p_sentiment:
        filters.sentiment && filters.sentiment !== "all"
          ? filters.sentiment
          : null,
      p_status:
        filters.status && filters.status !== "all" ? filters.status : null,
      p_tags: Array.isArray(filters.tags) && filters.tags.length ? filters.tags : null
    };

    const { data: summary, error: summaryError } = await supabaseAdmin
      .rpc("kpi_summary", args)
      .maybeSingle();

    if (summaryError) {
      console.error("[kpi-summary] rpc error", {
        route,
        query: req.query,
        userId,
        location_id: locationId,
        error: {
          message: summaryError.message,
          details: (summaryError as { details?: string }).details,
          hint: (summaryError as { hint?: string }).hint,
          code: (summaryError as { code?: string }).code
        },
        requestId
      });
      return res.status(500).json({ error: "Internal server error", requestId });
    }

    const summaryData = summary ?? null;
    return res.status(200).json({
      reviews_total: summaryData?.reviews_total ?? 0,
      reviews_with_text: summaryData?.reviews_with_text ?? 0,
      avg_rating: summaryData?.avg_rating ?? null,
      sentiment_breakdown: {
        positive: summaryData?.sentiment_positive ?? 0,
        neutral: summaryData?.sentiment_neutral ?? 0,
        negative: summaryData?.sentiment_negative ?? 0
      },
      top_tags: summaryData?.top_tags ?? [],
      range
    });
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

export default handler;
