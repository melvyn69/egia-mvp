import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveDateRange } from "../_date.js";
import { createSupabaseAdmin, getUserFromRequest } from "../google/_utils.js";

const handler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

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

    const sourceParam = req.query.source;
    const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;
    if (source && source !== "google") {
      return res.status(200).json({
        reviews_total: 0,
        reviews_with_text: 0,
        avg_rating: null,
        sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
        top_tags: [],
        range: { from: null, to: null }
      });
    }

    const presetParam = req.query.preset;
    const preset = (Array.isArray(presetParam) ? presetParam[0] : presetParam) ??
      "this_month";
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const from = Array.isArray(fromParam) ? fromParam[0] : fromParam;
    const to = Array.isArray(toParam) ? toParam[0] : toParam;
    const tzParam = req.query.tz;
    const timeZone = Array.isArray(tzParam) ? tzParam[0] : tzParam ?? "UTC";

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
        p_to: range.to
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
