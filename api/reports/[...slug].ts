import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleGenerateClassic from "../../server/_shared_dist/handlers/reports/generate.js";
import handleGeneratePremium from "../../server/_shared_dist/handlers/reports/generate_html.js";
import { requireUser } from "../../server/_shared_dist/_auth.js";
import {
  getRequestId,
  sendError,
  parseQuery,
  getParam
} from "../../server/_shared_dist/api_utils.js";

type LocationCenter = {
  lat: number;
  lng: number;
  addressLabel: string | null;
};

type CenterResult = {
  center: LocationCenter | null;
  errorMessage?: string;
  errorHint?: string;
};

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

const getRouteParts = (req: VercelRequest) => {
  const raw =
    (req.query as Record<string, unknown>)?.["...slug"] ??
    (req.query as Record<string, unknown>)?.slug ??
    (req.query as Record<string, unknown>)?.["slug[]"];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map(String);
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
  const addressLines = Array.isArray(record.addressLines)
    ? (record.addressLines as string[]).filter(Boolean)
    : [];
  const lineFromAddressLines = addressLines.join(" ");
  const line1 =
    (record.address_line_1 as string | undefined) ??
    (record.line1 as string | undefined) ??
    (record.street_address as string | undefined);
  const line2 =
    (record.address_line_2 as string | undefined) ??
    (record.line2 as string | undefined);
  const city =
    (record.locality as string | undefined) ??
    (record.city as string | undefined) ??
    null;
  const postal =
    (record.postal_code as string | undefined) ??
    (record.postalCode as string | undefined) ??
    (record.zip as string | undefined);
  const region =
    (record.administrativeArea as string | undefined) ??
    (record.region as string | undefined) ??
    (record.state as string | undefined);
  const country =
    (record.regionCode as string | undefined) ??
    (record.country as string | undefined);
  const parts = [line1, line2, postal, city, region]
    .filter(Boolean)
    .join(" ");
  const composed = parts || lineFromAddressLines || null;
  if (composed && country) {
    return `${composed} ${country}`;
  }
  return composed || (country ? country : null);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Places API error (${response.status})`);
  }
  return payload as any;
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error_description ?? "Token refresh failed.");
  }
  return payload as {
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
};

const getGoogleAccessToken = async (
  supabaseAdmin: any,
  userId: string
): Promise<string | null> => {
  const { data: connection } = await supabaseAdmin
    .from("google_connections")
    .select("access_token, refresh_token, expires_at, token_expiry")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!connection?.access_token) {
    return null;
  }
  const now = Date.now();
  const expiryRaw = connection.expires_at ?? connection.token_expiry ?? null;
  const expiryMs = expiryRaw ? new Date(expiryRaw).getTime() : null;
  if (!expiryMs || expiryMs - now > 60_000) {
    return connection.access_token as string;
  }
  if (!connection.refresh_token) {
    return null;
  }
  const refreshed = await refreshGoogleAccessToken(connection.refresh_token);
  const newExpiry = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await supabaseAdmin
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiry,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("provider", "google");
  return refreshed.access_token;
};

const getLocationCenter = async (
  supabaseAdmin: any,
  userId: string,
  locationId: string,
  apiKey: string,
  requestId: string
): Promise<CenterResult> => {
  const { data, error } = await supabaseAdmin
    .from("google_locations")
    .select(
      "address_json, location_title, location_resource_name, latitude, longitude"
    )
    .eq("user_id", userId)
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data) {
    return {
      center: null,
      errorMessage: "Adresse absente en base pour cet etablissement."
    };
  }
  const storedLat = typeof data.latitude === "number" ? data.latitude : null;
  const storedLng = typeof data.longitude === "number" ? data.longitude : null;
  if (storedLat !== null && storedLng !== null) {
    return {
      center: {
        lat: storedLat,
        lng: storedLng,
        addressLabel: extractAddress(data.address_json)
      }
    };
  }
  const addressJson = data.address_json;
  const latLng = extractLatLng(addressJson);
  let addressLabel = extractAddress(addressJson);
  if (!addressLabel && data.location_title) {
    addressLabel = data.location_title;
  }
  console.info("[competitors] resolve_center", {
    requestId,
    locationId,
    addressLabel,
    hasLatLngInJson: Boolean(latLng)
  });
  if (latLng) {
    await supabaseAdmin
      .from("google_locations")
      .update({
        latitude: latLng.lat,
        longitude: latLng.lng,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("id", locationId);
    return {
      center: { lat: latLng.lat, lng: latLng.lng, addressLabel }
    };
  }
  if (!addressLabel) {
    return {
      center: null,
      errorMessage: "Adresse absente en base.",
      errorHint: "Mapper Google ou completer l'adresse."
    };
  }

  const geocode = async (label: string) => {
    const encoded = encodeURIComponent(label);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
    console.info("[competitors] geocode_request", {
      requestId,
      locationId,
      address: label
    });
    const payload = await fetchJson(url);
    const status = payload?.status ?? "UNKNOWN";
    const errorMessage = payload?.error_message ?? null;
    const result = payload?.results?.[0];
    const location = result?.geometry?.location;
    console.info("[competitors] geocode_response", {
      requestId,
      locationId,
      status,
      top_address: result?.formatted_address ?? null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      error_message: errorMessage
    });
    return { status, location, errorMessage };
  };

  let geocodeResult = await geocode(addressLabel);
  if (geocodeResult.status === "ZERO_RESULTS") {
    const accessToken = await getGoogleAccessToken(supabaseAdmin, userId);
    if (accessToken && data.location_resource_name) {
      const locationName = data.location_resource_name as string;
      const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=storefrontAddress,title`;
      console.info("[competitors] gbp_location_fetch", {
        requestId,
        locationId,
        locationName
      });
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.storefrontAddress) {
        addressLabel = extractAddress(payload.storefrontAddress);
        await supabaseAdmin
          .from("google_locations")
          .update({
            address_json: payload.storefrontAddress,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId)
          .eq("id", locationId);
        if (addressLabel) {
          geocodeResult = await geocode(addressLabel);
        }
      }
    }
  }

  if (geocodeResult.status === "ZERO_RESULTS") {
    return {
      center: null,
      errorMessage: "Geocoding ZERO_RESULTS.",
      errorHint: `Verifier l'adresse: ${addressLabel}`
    };
  }
  if (geocodeResult.status !== "OK") {
    return {
      center: null,
      errorMessage: `Geocoding error: ${geocodeResult.status}`,
      errorHint: geocodeResult.errorMessage ?? undefined
    };
  }
  const location = geocodeResult.location;
  if (!location?.lat || !location?.lng) {
    return {
      center: null,
      errorMessage: "Adresse/coordonnees introuvables pour cet etablissement."
    };
  }
  await supabaseAdmin
    .from("google_locations")
    .update({
      latitude: Number(location.lat),
      longitude: Number(location.lng),
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("id", locationId);
  return {
    center: {
      lat: Number(location.lat),
      lng: Number(location.lng),
      addressLabel
    }
  };
};

const handleCompetitors = async (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  const auth = await requireUser(req, res);
  if (!auth) {
    return;
  }
  const { userId, supabaseAdmin } = auth;
  const actionParam = req.query.action;
  let action = Array.isArray(actionParam) ? actionParam[0] : actionParam;
  if (!action && req.method !== "GET") {
    const payload = parseBody(req);
    if (typeof payload?.action === "string") {
      action = payload.action;
    }
  }
  const normalizedAction = String(action ?? "").trim().toLowerCase();

  if (normalizedAction === "scan") {
    if (req.method !== "POST") {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Method not allowed" },
        405
      );
    }
    const payload = parseBody(req);
    const locationId = String(payload?.location_id ?? "").trim();
    const keyword = String(payload?.keyword ?? "").trim();
    const radiusKm = Number(payload?.radius_km ?? 0);
    if (!locationId || !keyword || !radiusKm) {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Missing parameters" },
        400
      );
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? "";
    if (!apiKey) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Missing GOOGLE_PLACES_API_KEY" },
        500
      );
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
    let centerError: string | undefined;
    let centerHint: string | undefined;
    try {
      const result = await getLocationCenter(
        supabaseAdmin,
        userId,
        locationId,
        apiKey,
        requestId
      );
      center = result.center;
      centerError = result.errorMessage;
      centerHint = result.errorHint;
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
        {
          code: "BAD_REQUEST",
          message:
            centerError ??
            "Adresse/coordonnees introuvables pour cet etablissement. Synchronisez vos etablissements ou completez l'adresse.",
          details: centerHint ? { hint: centerHint } : undefined
        },
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
        const distance =
          lat && lng ? haversine(center!.lat, center!.lng, lat, lng) : null;
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

  if (normalizedAction === "list") {
    const payload = req.method === "GET" ? null : parseBody(req);
    const { params } = parseQuery(req);
    const locationId =
      String(payload?.location_id ?? getParam(params, "location_id") ?? "").trim() ||
      null;
    const mode = String(payload?.mode ?? getParam(params, "mode") ?? "radar");

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

  if (normalizedAction === "follow" || normalizedAction === "unfollow") {
    if (req.method !== "POST") {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Method not allowed" },
        405
      );
    }
    const payload = parseBody(req);
    const locationId = String(payload?.location_id ?? "").trim();
    const placeId = String(payload?.place_id ?? "").trim();
    const isFollowed =
      normalizedAction === "follow" ? true : Boolean(payload?.is_followed);
    if (!locationId || !placeId) {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Missing parameters" },
        400
      );
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
      return sendError(
        res,
        requestId,
        { code: "NOT_FOUND", message: "Competitor not found" },
        404
      );
    }
    return res.status(200).json({ ok: true, requestId });
  }

  return sendError(
    res,
    requestId,
    { code: "NOT_FOUND", message: "Not found" },
    404
  );
};

// Manual test plan:
// 1) /competitors -> select location -> scan 1km -> list returns items.
// 2) If coords missing, error message is actionable and no 500.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRouteParts(req).join("/");
  if (route === "generate") {
    return handleGenerateClassic(req, res);
  }
  if (route === "generate_html") {
    return handleGeneratePremium(req, res);
  }
  if (route === "competitors") {
    return handleCompetitors(req, res);
  }
  return res.status(404).json({ error: "Not found" });
}
