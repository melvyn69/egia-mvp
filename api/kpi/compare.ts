import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveDateRange } from '../server/_date.ts';
import { parseFilters } from '../server/_filters.ts';
import { requireUser } from '../server/_auth.ts';

type Range = { from: string; to: string };

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

    const summaryAData = summaryA.data ?? null;
    const summaryBData = summaryB.data ?? null;
    return res.status(200).json({
      before: summaryAData,
      after: summaryBData,
      a: summaryAData,
      b: summaryBData,
      delta: {
        reviews_total:
          (summaryBData?.reviews_total ?? 0) -
          (summaryAData?.reviews_total ?? 0),
        reviews_with_text:
          (summaryBData?.reviews_with_text ?? 0) -
          (summaryAData?.reviews_with_text ?? 0),
        avg_rating:
          (summaryBData?.avg_rating ?? 0) -
          (summaryAData?.avg_rating ?? 0)
      },
      ranges: { a: rangeA, b: rangeB }
    });
  } catch (err) {
    console.error("[kpi-compare] error", err);
    return res.status(500).json({ error: "Failed to load KPI compare" });
  }
};

export default handler;
