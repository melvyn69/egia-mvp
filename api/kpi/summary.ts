import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveDateRange } from "../_date.js";
import { parseFilters } from "../_filters.js";
import { requireUser } from "../_auth.js";

const handler = async (req: VercelRequest, res: VercelResponse) => {
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

    const { data: summary, error: summaryError } = await supabaseAdmin
      .rpc("kpi_summary", {
        p_location_id: locationId,
        p_from: range.from,
        p_to: range.to,
        p_rating_min: filters.rating_min ?? null,
        p_rating_max: filters.rating_max ?? null,
        p_sentiment: filters.sentiment ?? null,
        p_status: filters.status ?? null,
        p_tags: filters.tags ?? null
      })
      .maybeSingle();

    if (summaryError) {
      return res.status(500).json({ error: "Failed to load KPI summary" });
    }

    return res.status(200).json({
      reviews_total: summary?.reviews_total ?? 0,
      reviews_with_text: summary?.reviews_with_text ?? 0,
      avg_rating: summary?.avg_rating ?? null,
      sentiment_breakdown: {
        positive: summary?.sentiment_positive ?? 0,
        neutral: summary?.sentiment_neutral ?? 0,
        negative: summary?.sentiment_negative ?? 0
      },
      top_tags: summary?.top_tags ?? [],
      range
    });
  } catch {
    return res.status(500).json({ error: "Failed to load KPI summary" });
  }
};

export default handler;
