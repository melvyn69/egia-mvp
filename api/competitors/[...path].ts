import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../server/_shared_dist/_auth.js";
import { getRequestId, sendError, parseQuery, getParam } from "../../server/_shared_dist/api_utils.js";

type LocationCenter = {
  lat: number;
  lng: number;
  addressLabel: string | null;
};

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

const getParts = (value: string | string[] | undefined) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(r * c);
};

const extractAddress = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const formatted =
    (record.formatted_address as string | undefined) ??
    (record.formattedAddress as string | undefined);
  if (formatted) return formatted;
  const line1 =
    (record.address_line_1 as string | undefined) ??
    (record.line1 as string | undefined) ??
    (record.street_address as string | undefined);
  const line2 =
    (record.address_line_2 as string | undefined) ??
    (record.line2 as string | undefined);
  const city = (record.city as string | undefined) ?? null;
  const postal =
    (record.postal_code as string | undefined) ??
    (record.zip as string | undefined);
  const region =
    (record.region as string | undefined) ??
    (record.state as string | undefined);
  const parts = [line1, line2, postal, city, region]
    .filter(Boolean)
    .join(" ");
  return parts || null;
};

const extractLatLng = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lat =
    (record.lat as number | undefined) ??
    (record.latitude as number | undefined);
  const lng =
    (record.lng as number | undefined) ??
    (record.longitude as number | undefined);
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }
  return null;
};

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Places API error (${response.status})`);
  }
  return payload as any;
};

const getLocationCenter = async (
  supabaseAdmin: any,
  userId: string,
  locationId: string,
  apiKey: string
): Promise<LocationCenter | null> => {
  const { data, error } = await supabaseAdmin
    .from("google_locations")
    .select("address_json, location_title, location_resource_name")
    .eq("user_id", userId)
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const addressJson = data.address_json;
  const latLng = extractLatLng(addressJson);
  const addressLabel = extractAddress(addressJson);
  if (latLng) {
    return { lat: latLng.lat, lng: latLng.lng, addressLabel };
  }
  if (!addressLabel) {
    return null;
  }
  const encoded = encodeURIComponent(addressLabel);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
  const payload = await fetchJson(url);
  const result = payload?.results?.[0];
  const location = result?.geometry?.location;
  if (!location?.lat || !location?.lng) {
    return null;
  }
  return {
    lat: Number(location.lat),
    lng: Number(location.lng),
    addressLabel
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  const parts = getParts(req.query.path);
  const action = parts.join("/");

  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId, supabaseAdmin } = auth;

  if (action === "scan") {
    if (req.method !== "POST") {
      return sendError(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    const payload = parseBody(req);
    const locationId = String(payload?.location_id ?? "").trim();
    const keyword = String(payload?.keyword ?? "").trim();
    const radiusKm = Number(payload?.radius_km ?? 0);
    if (!locationId || !keyword || !radiusKm) {
      return sendError(res, requestId, { code: "BAD_REQUEST", message: "Missing parameters" }, 400);
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? "";
    if (!apiKey) {
      return sendError(res, requestId, { code: "INTERNAL", message: "Missing GOOGLE_PLACES_API_KEY" }, 500);
    }

    const { data: lastRow } = await supabaseAdmin
      .from("competitors")
      .select("last_fetched_at")
      .eq("user_id", userId)
      .eq("location_id", locationId)
      .order("last_fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRow?.last_fetched_at) {
      const last = new Date(lastRow.last_fetched_at).getTime();
      if (Date.now() - last < 30_000) {
        return sendError(
          res,
          requestId,
          { code: "BAD_REQUEST", message: "Scan too frequent" },
          429
        );
      }
    }

    let center: LocationCenter | null = null;
    try {
      center = await getLocationCenter(
        supabaseAdmin,
        userId,
        locationId,
        apiKey
      );
    } catch (error) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to resolve location" },
        500
      );
    }
    if (!center) {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Missing location coordinates" },
        400
      );
    }

    const radiusMeters = Math.round(radiusKm * 1000);
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${center.lat},${center.lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(
      keyword
    )}&key=${apiKey}`;

    let places: any[] = [];
    try {
      const payload = await fetchJson(nearbyUrl);
      places = Array.isArray(payload?.results) ? payload.results : [];
    } catch (error) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to fetch competitors" },
        500
      );
    }

    const nowIso = new Date().toISOString();
    const items = places
      .filter((place) => Boolean(place?.place_id))
      .map((place) => {
        const lat = Number(place?.geometry?.location?.lat ?? 0);
        const lng = Number(place?.geometry?.location?.lng ?? 0);
        const distance = lat && lng ? haversine(center!.lat, center!.lng, lat, lng) : null;
        const types = Array.isArray(place?.types) ? place.types : [];
        return {
          user_id: userId,
          location_id: locationId,
          place_id: place.place_id,
          name: place.name ?? "",
          address: place.vicinity ?? place.formatted_address ?? null,
          lat: lat || null,
          lng: lng || null,
          distance_m: distance,
          rating: typeof place.rating === "number" ? place.rating : null,
          user_ratings_total:
            typeof place.user_ratings_total === "number"
              ? place.user_ratings_total
              : null,
          category: typeof types[0] === "string" ? types[0] : null,
          last_fetched_at: nowIso,
          updated_at: nowIso
        };
      });

    if (items.length > 0) {
      await supabaseAdmin
        .from("competitors")
        .upsert(items, { onConflict: "user_id,location_id,place_id" });
    }

    const sorted = items
      .slice()
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

    return res.status(200).json({
      ok: true,
      scanned: places.length,
      insertedOrUpdated: items.length,
      items: sorted,
      requestId
    });
  }

  if (action === "list") {
    if (req.method !== "GET") {
      return sendError(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    const { params } = parseQuery(req);
    const locationId = getParam(params, "location_id");
    const mode = (getParam(params, "mode") ?? "radar") as string;

    let query = supabaseAdmin.from("competitors").select("*").eq("user_id", userId);
    if (locationId) {
      query = query.eq("location_id", locationId);
    }
    if (mode === "followed") {
      query = query.eq("is_followed", true);
    }
    const { data, error } = await query.order("distance_m", { ascending: true });
    if (error) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load competitors" },
        500
      );
    }
    return res.status(200).json({ ok: true, items: data ?? [], requestId });
  }

  if (action === "follow") {
    if (req.method !== "POST") {
      return sendError(res, requestId, { code: "BAD_REQUEST", message: "Method not allowed" }, 405);
    }
    const payload = parseBody(req);
    const locationId = String(payload?.location_id ?? "").trim();
    const placeId = String(payload?.place_id ?? "").trim();
    const isFollowed = Boolean(payload?.is_followed);
    if (!locationId || !placeId) {
      return sendError(res, requestId, { code: "BAD_REQUEST", message: "Missing parameters" }, 400);
    }
    const { data, error } = await supabaseAdmin
      .from("competitors")
      .update({ is_followed: isFollowed, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("location_id", locationId)
      .eq("place_id", placeId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return sendError(res, requestId, { code: "NOT_FOUND", message: "Competitor not found" }, 404);
    }
    return res.status(200).json({ ok: true, requestId });
  }

  return sendError(res, requestId, { code: "NOT_FOUND", message: "Not found" }, 404);
}
