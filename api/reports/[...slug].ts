import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../server/_shared_dist/database.types.js";
import handleGenerateClassic from "../../server/_shared_dist/handlers/reports/generate.js";
import handleGeneratePremium from "../../server/_shared_dist/handlers/reports/generate_html.js";
import { requireUser } from "../../server/_shared_dist/_auth.js";
import {
  getRequestId,
  sendError,
  parseQuery,
  getParam
} from "../../server/_shared_dist/api_utils.js";
import { renderPdfFromHtml } from "../../server/_shared_dist/pdf_html.js";

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

const createSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role env");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
};

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

type CompetitorRow = {
  name: string;
  rating: number | null;
  user_ratings_total: number | null;
  distance_m: number | null;
  place_id: string;
  is_followed: boolean | null;
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const scoreCompetitor = (row: CompetitorRow) => {
  const rating = typeof row.rating === "number" ? row.rating : 0;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : 0;
  return rating * Math.log10(1 + reviews);
};

const buildCompetitorsBenchmark = (
  competitors: CompetitorRow[],
  radiusKm: number | null
) => {
  const ratings = competitors
    .map((item) => item.rating)
    .filter((value): value is number => typeof value === "number");
  const reviews = competitors
    .map((item) => item.user_ratings_total)
    .filter((value): value is number => typeof value === "number");
  const distances = competitors
    .map((item) => item.distance_m)
    .filter((value): value is number => typeof value === "number");

  const medianRating = ratings.length > 0 ? median(ratings) : null;
  const medianReviews = reviews.length > 0 ? median(reviews) : null;
  const medianDistance = distances.length > 0 ? median(distances) : null;
  const bestRating = ratings.length > 0 ? Math.max(...ratings) : null;
  const closest = distances.length > 0 ? Math.min(...distances) : null;

  const riskyCount = competitors.filter((row) => {
    if (typeof row.rating !== "number" || typeof row.distance_m !== "number") {
      return false;
    }
    const dangerRadius =
      typeof radiusKm === "number" ? radiusKm * 1000 * 0.5 : 1000;
    return row.rating >= 4.8 && row.distance_m <= dangerRadius;
  }).length;

  const ranked = competitors
    .slice()
    .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a))
    .slice(0, 5)
    .map((item) => ({
      name: item.name,
      rating: item.rating,
      reviews: item.user_ratings_total,
      distance_m: item.distance_m,
      place_id: item.place_id
    }));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  if (medianRating !== null) {
    if (medianRating >= 4.3) {
      strengths.push(
        `Marché bien noté (médiane ${medianRating.toFixed(1)}/5).`
      );
    } else {
      weaknesses.push(
        `Note moyenne en retrait (médiane ${medianRating.toFixed(1)}/5).`
      );
    }
  }
  if (medianReviews !== null) {
    if (medianReviews >= 60) {
      strengths.push(`Volume d'avis solide (médiane ${Math.round(medianReviews)}).`);
    } else {
      weaknesses.push(
        `Volume d'avis limité (médiane ${Math.round(medianReviews)}).`
      );
    }
  }
  if (bestRating !== null && bestRating >= 4.7) {
    threats.push(`Un leader local dépasse ${bestRating.toFixed(1)}/5.`);
  }
  if (closest !== null && closest <= 800) {
    threats.push("Concurrence très proche sur le terrain.");
  }
  if (riskyCount > 0) {
    threats.push(`${riskyCount} concurrent(s) à fort impact local.`);
  }
  if (ratings.filter((value) => value <= 3.8).length >= 3) {
    opportunities.push("Plusieurs concurrents sous 3.8 : différenciation possible.");
  }
  if (closest !== null && closest > 2000) {
    opportunities.push("Faible densité concurrentielle à proximité immédiate.");
  }

  const plan14Days: string[] = [
    "Semaine 1 : sécuriser 5 nouveaux avis pour dépasser la médiane locale.",
    "Semaine 1 : répondre aux avis récents pour renforcer la confiance.",
    "Semaine 2 : mettre en avant un avantage clair face aux concurrents proches.",
    "Semaine 2 : suivre de près les 2 leaders les mieux notés."
  ];

  const summaryParts = [
    `Total: ${competitors.length}`,
    medianRating !== null ? `Médiane note: ${medianRating.toFixed(1)}` : null,
    medianReviews !== null ? `Médiane avis: ${Math.round(medianReviews)}` : null,
    bestRating !== null ? `Meilleure note: ${bestRating.toFixed(1)}` : null
  ].filter(Boolean);

  return {
    stats: {
      total: competitors.length,
      median_rating: medianRating,
      median_reviews: medianReviews,
      median_distance_m: medianDistance,
      best_rating: bestRating,
      closest_m: closest,
      high_risk_count: riskyCount
    },
    top_competitors: ranked,
    swot: {
      forces: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 3),
      opportunities: opportunities.slice(0, 3),
      threats: threats.slice(0, 3)
    },
    plan_14_days: plan14Days,
    summary: summaryParts.join(" · ")
  };
};

const formatPdfDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
};

const buildBenchmarkHtml = (input: {
  title: string;
  locationLabel: string;
  zoneLabel: string;
  radiusLabel: string;
  createdAt: string | null;
  stats: Record<string, number | null>;
  swot: Record<string, string[]>;
  topCompetitors: Array<{
    name?: string;
    rating?: number | null;
    reviews?: number | null;
    distance_m?: number | null;
  }>;
  actions: string[];
  summary: string | null;
}) => {
  const risks = input.swot.threats?.slice(0, 3) ?? [];
  const opportunities = input.swot.opportunities?.slice(0, 3) ?? [];
  const force =
    input.swot.forces?.[0] ?? "Données insuffisantes pour qualifier une force.";
  const weakness =
    input.swot.weaknesses?.[0] ??
    "Données insuffisantes pour qualifier une faiblesse.";
  const opportunity =
    input.swot.opportunities?.[0] ??
    "Données insuffisantes pour qualifier une opportunité.";
  const threat =
    input.swot.threats?.[0] ??
    "Données insuffisantes pour qualifier une menace.";
  const bestRating =
    typeof input.stats.best_rating === "number"
      ? input.stats.best_rating.toFixed(1)
      : "—";
  const closest =
    typeof input.stats.closest_m === "number"
      ? input.stats.closest_m < 1000
        ? `${input.stats.closest_m} m`
        : `${(input.stats.closest_m / 1000).toFixed(1)} km`
      : "—";
  const total = typeof input.stats.total === "number" ? input.stats.total : null;
  const riskCount =
    typeof input.stats.high_risk_count === "number"
      ? input.stats.high_risk_count
      : null;
  const actions = input.actions.slice(0, 3);

  return `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: "Inter", Arial, sans-serif; color: #111827; margin: 0; background: #f8fafc; }
        .page { background: #ffffff; border-radius: 18px; padding: 32px; margin: 24px auto; width: 100%; }
        .cover { background: #0f172a; color: #ffffff; border-radius: 20px; padding: 36px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 12px; background: rgba(255,255,255,0.15); }
        .muted { color: #64748b; font-size: 13px; }
        h1 { margin: 12px 0 4px; font-size: 28px; }
        h2 { margin: 0; font-size: 18px; }
        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .card { border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; background: #ffffff; }
        .section-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
        ul { margin: 8px 0 0 18px; padding: 0; }
        li { font-size: 13px; margin-bottom: 6px; color: #334155; }
        .metric { font-size: 13px; color: #475569; }
        .kpi { font-size: 14px; font-weight: 600; }
        .soft { background: #f1f5f9; }
        .success { background: #ecfdf3; border-color: #bbf7d0; }
        .warn { background: #fef3c7; border-color: #fde68a; }
        .info { background: #eff6ff; border-color: #bfdbfe; }
        .danger { background: #fef2f2; border-color: #fecaca; }
      </style>
    </head>
    <body>
      <div class="page cover">
        <div class="badge">Veille concurrentielle – EGIA</div>
        <h1>${input.locationLabel}</h1>
        <div class="muted" style="color:#e2e8f0;">
          Zone analysée : ${input.zoneLabel} · Rayon : ${input.radiusLabel}
        </div>
        <div class="muted" style="color:#e2e8f0; margin-top: 8px;">
          Généré le ${formatPdfDate(input.createdAt)}
        </div>
      </div>

      <div class="page">
        <div class="section-title">Résumé exécutif</div>
        <div class="grid-2">
          <div class="card soft">
            <div class="kpi">Positionnement global</div>
            <p class="metric">${input.summary ?? "Positionnement en cours d'analyse."}</p>
          </div>
          <div class="card soft">
            <div class="kpi">Marché observé</div>
            <p class="metric">${total ?? "—"} concurrents · ${riskCount ?? "—"} à risque élevé</p>
          </div>
        </div>
        <div class="grid-2" style="margin-top: 12px;">
          <div class="card">
            <div class="section-title">Top 3 risques</div>
            <ul>${(risks.length ? risks : ["Aucun risque majeur détecté."])
              .slice(0, 3)
              .map((item) => `<li>${item}</li>`)
              .join("")}</ul>
          </div>
          <div class="card">
            <div class="section-title">Top 3 opportunités</div>
            <ul>${(opportunities.length ? opportunities : ["Opportunités à préciser."])
              .slice(0, 3)
              .map((item) => `<li>${item}</li>`)
              .join("")}</ul>
          </div>
        </div>
      </div>

      <div class="page">
        <div class="section-title">Podium concurrentiel</div>
        <div class="grid-3">
          <div class="card">
            <div class="kpi">Vous</div>
            <div class="metric">Note: n.c. · Avis: n.c.</div>
            <div class="metric">Distance: —</div>
          </div>
          ${input.topCompetitors.slice(0, 2).map((item) => `
            <div class="card">
              <div class="kpi">${item.name ?? "Concurrent"}</div>
              <div class="metric">Note: ${item.rating ?? "n.c."} · Avis: ${item.reviews ?? "n.c."}</div>
              <div class="metric">Distance: ${typeof item.distance_m === "number" ? (item.distance_m < 1000 ? `${item.distance_m} m` : `${(item.distance_m / 1000).toFixed(1)} km`) : "—"}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="page">
        <div class="section-title">Analyse radar</div>
        <div class="grid-2">
          <div class="card soft">
            <div class="kpi">Statistiques clés</div>
            <ul>
              <li>Concurrent le plus proche : ${closest}</li>
              <li>Meilleure note du marché : ${bestRating}</li>
              <li>Concurrents observés : ${total ?? "—"}</li>
            </ul>
          </div>
          <div class="card">
            <div class="kpi">Interprétation</div>
            <p class="metric">
              Le marché local montre une concurrence ${bestRating !== "—" ? `jusqu’à ${bestRating}/5` : "en cours d’analyse"} avec un acteur très proche à ${closest}.
            </p>
          </div>
        </div>
      </div>

      <div class="page">
        <div class="section-title">Analyse SWOT</div>
        <div class="grid-2">
          <div class="card success">
            <div class="kpi">Force</div>
            <p class="metric">${force}</p>
          </div>
          <div class="card danger">
            <div class="kpi">Faiblesse</div>
            <p class="metric">${weakness}</p>
          </div>
          <div class="card info">
            <div class="kpi">Opportunité</div>
            <p class="metric">${opportunity}</p>
          </div>
          <div class="card soft">
            <div class="kpi">Menace</div>
            <p class="metric">${threat}</p>
          </div>
        </div>
      </div>

      <div class="page">
        <div class="section-title">Actions recommandées</div>
        <div class="grid-2">
          ${(actions.length ? actions : ["Définir une action prioritaire cette semaine."])
            .slice(0, 3)
            .map((action) => `
              <div class="card">
                <div class="kpi">Action</div>
                <p class="metric">${action}</p>
                <p class="metric"><strong>Pourquoi :</strong> renforcer votre position locale.</p>
                <p class="metric"><strong>Impact attendu :</strong> amélioration de la préférence client.</p>
              </div>
            `)
            .join("")}
        </div>
      </div>
    </body>
  </html>`;
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

const formatScanCacheKey = (keyword: string, radiusKm: number) =>
  `${keyword.toLowerCase()}|${radiusKm}`;

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

    const cacheKey = formatScanCacheKey(keyword, radiusKm);
    const cacheWindowMs = 10 * 60 * 1000;
    const { data: cachedRow } = await supabaseAdmin
      .from("competitors")
      .select("last_scanned_at, last_scan_keyword, last_scan_radius_km")
      .eq("user_id", userId)
      .eq("location_id", locationId)
      .order("last_scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      cachedRow?.last_scanned_at &&
      cachedRow.last_scan_keyword &&
      cachedRow.last_scan_radius_km !== null
    ) {
      const last = new Date(cachedRow.last_scanned_at).getTime();
      if (Date.now() - last < cacheWindowMs) {
        const cachedKey = formatScanCacheKey(
          String(cachedRow.last_scan_keyword),
          Number(cachedRow.last_scan_radius_km)
        );
        if (cachedKey === cacheKey) {
          const { data: cachedItems } = await supabaseAdmin
            .from("competitors")
            .select(
              "name,address,rating,user_ratings_total,distance_m,place_id,lat,lng,is_followed"
            )
            .eq("user_id", userId)
            .eq("location_id", locationId)
            .order("distance_m", { ascending: true })
            .limit(20);
          return res.status(200).json({
            ok: true,
            scanned: cachedItems?.length ?? 0,
            insertedOrUpdated: cachedItems?.length ?? 0,
            items: cachedItems ?? [],
            cached: true,
            keyword,
            radius_km: radiusKm,
            duration_ms: 0,
            requestId
          });
        }
      }
    }

    let center: LocationCenter | null = null;
    let centerError: string | undefined;
    let centerHint: string | undefined;
    const scanStart = Date.now();
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
    } catch {
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
    let nextPageToken: string | null = null;
    try {
      const payload = await fetchJson(nearbyUrl);
      places = Array.isArray(payload?.results) ? payload.results : [];
      nextPageToken = typeof payload?.next_page_token === "string" ? payload.next_page_token : null;
    } catch {
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
          last_scanned_at: nowIso,
          last_scan_keyword: keyword,
          last_scan_radius_km: radiusKm,
          updated_at: nowIso
        };
      });

    const limitedItems = items.slice(0, 20);
    if (limitedItems.length > 0) {
      await supabaseAdmin
        .from("competitors")
        .upsert(limitedItems, { onConflict: "user_id,location_id,place_id" });
    }

    const sorted = limitedItems
      .slice()
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

    return res.status(200).json({
      ok: true,
      scanned: places.length,
      insertedOrUpdated: limitedItems.length,
      items: sorted,
      cached: false,
      keyword,
      radius_km: radiusKm,
      duration_ms: Date.now() - scanStart,
      next_page_token: nextPageToken,
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

  if (normalizedAction === "self") {
    const payload = req.method === "GET" ? null : parseBody(req);
    const { params } = parseQuery(req);
    const locationId =
      String(payload?.location_id ?? getParam(params, "location_id") ?? "").trim() ||
      null;
    if (!locationId) {
      return sendError(
        res,
        requestId,
        { code: "BAD_REQUEST", message: "Missing location_id" },
        400
      );
    }

    const { data: locationRow, error: locationError } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name, location_title, last_synced_at")
      .eq("id", locationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (locationError) {
      console.error("[competitors] self_location_error", {
        requestId,
        code: locationError.code,
        message: locationError.message
      });
    }

    const runMetrics = async (filter: { field: "location_id" | "location_name"; value: string }) => {
      let query = supabaseAdmin
        .from("google_reviews")
        .select("rating, star_rating", { count: "exact" })
        .eq("user_id", userId);
      if (filter.field === "location_name") {
        query = query.ilike("location_name", filter.value);
      } else {
        query = query.eq(filter.field, filter.value);
      }
      const { data, error, count } = await query.limit(200);
      if (error) {
        console.error("[competitors] self_metrics_error", {
          requestId,
          field: filter.field,
          code: error.code,
          message: error.message
        });
        return { rows: [], count: null };
      }
      return {
        rows: (data ?? []) as Array<{ rating: number | null; star_rating: string | null }>,
        count
      };
    };

    const mapStarRating = (value: string | null) => {
      switch (value) {
        case "ONE":
          return 1;
        case "TWO":
          return 2;
        case "THREE":
          return 3;
        case "FOUR":
          return 4;
        case "FIVE":
          return 5;
        default:
          return null;
      }
    };

    const buildStats = (
      rows: Array<{ rating: number | null; star_rating: string | null }>,
      count: number | null
    ) => {
      const ratings = rows
        .map((row) => {
          if (typeof row.rating === "number") return row.rating;
          if (typeof row.star_rating === "string") return mapStarRating(row.star_rating);
          return null;
        })
        .filter((value): value is number => typeof value === "number");
      const hasAny = (count ?? 0) > 0 || rows.length > 0;
      const avgRaw =
        ratings.length > 0
          ? ratings.reduce((acc, value) => acc + value, 0) / ratings.length
          : null;
      const avg =
        avgRaw !== null ? Math.round(avgRaw * 10) / 10 : null;
      const reviewCount = hasAny ? count ?? rows.length : null;
      return { rating: avg, review_count: reviewCount };
    };

    let source = "location_id";
    let result = await runMetrics({ field: "location_id", value: locationId });
    let stats = buildStats(result.rows, result.count ?? null);

    if (
      stats.review_count === null &&
      locationRow?.location_resource_name
    ) {
      source = "location_name_resource";
      result = await runMetrics({
        field: "location_name",
        value: locationRow.location_resource_name
      });
      stats = buildStats(result.rows, result.count ?? null);
    }

    if (stats.review_count === null && locationRow?.location_title) {
      source = "location_name_title";
      result = await runMetrics({
        field: "location_name",
        value: locationRow.location_title
      });
      stats = buildStats(result.rows, result.count ?? null);
    }

    console.info("[competitors] self_metrics", {
      requestId,
      locationId,
      source,
      review_count: stats.review_count,
      rating: stats.rating
    });

    return res.status(200).json({
      ok: true,
      self: {
        rating: stats.rating,
        review_count: stats.review_count,
        last_synced_at: locationRow?.last_synced_at ?? null,
        latest_reviews: []
      },
      requestId
    });
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

const handleCompetitorsBenchmark = async (
  req: VercelRequest,
  res: VercelResponse
) => {
  const requestId = getRequestId(req);
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { userId, supabaseAdmin } = auth;

  if (req.method !== "POST") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }
  const payload = parseBody(req);
  const action = String(payload?.action ?? "").trim().toLowerCase();
  if (action !== "generate") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Unknown action" },
      400
    );
  }

  const locationId = String(payload?.location_id ?? "").trim();
  if (!locationId) {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Missing location_id" },
      400
    );
  }

  const { data: settingsRow } = await supabaseAdmin
    .from("business_settings")
    .select(
      "competitive_monitoring_keyword, competitive_monitoring_radius_km"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const keyword = String(
    payload?.keyword ?? settingsRow?.competitive_monitoring_keyword ?? ""
  ).trim();
  const radiusKmRaw =
    payload?.radius_km ?? settingsRow?.competitive_monitoring_radius_km ?? null;
  const radiusKm =
    typeof radiusKmRaw === "number"
      ? radiusKmRaw
      : radiusKmRaw
        ? Number(radiusKmRaw)
        : null;

  const { data: followed } = await supabaseAdmin
    .from("competitors")
    .select(
      "name,rating,user_ratings_total,distance_m,place_id,is_followed"
    )
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .eq("is_followed", true);

  let source = followed ?? [];
  if (source.length === 0) {
    const { data: radar } = await supabaseAdmin
      .from("competitors")
      .select(
        "name,rating,user_ratings_total,distance_m,place_id,is_followed"
      )
      .eq("user_id", userId)
      .eq("location_id", locationId);
    source = radar ?? [];
  }

  const benchmark = buildCompetitorsBenchmark(
    (source ?? []) as CompetitorRow[],
    typeof radiusKm === "number" ? radiusKm : null
  );

  const today = new Date().toISOString().slice(0, 10);
  const title = `Benchmark concurrents — ${today}`;
  const reportPayload = {
    location_id: locationId,
    keyword: keyword || null,
    radius_km: radiusKm,
    ...benchmark
  };

  const { data: report, error } = await supabaseAdmin
    .from("generated_reports")
    .insert({
      user_id: userId,
      report_type: "competitors_benchmark",
      location_id: locationId,
      title,
      summary: benchmark.summary || null,
      payload: reportPayload
    })
    .select("*")
    .maybeSingle();

  if (error || !report) {
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Failed to store report" },
      500
    );
  }

  return res.status(200).json({ ok: true, report, requestId });
};

const handleCompetitorsBenchmarkPdf = async (
  req: VercelRequest,
  res: VercelResponse
) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(
      res,
      getRequestId(req),
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { supabaseAdmin, userId } = auth;
  const requestId = getRequestId(req);
  const queryParams = parseQuery(req).params;
  const payload = parseBody(req);
  const reportId =
    getParam(queryParams, "report_id") ??
    String(payload?.report_id ?? "").trim();

  if (!reportId) {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Missing report_id" },
      400
    );
  }

  const { data: report, error } = await supabaseAdmin
    .from("generated_reports")
    .select("*")
    .eq("id", reportId)
    .eq("user_id", userId)
    .eq("report_type", "competitors_benchmark")
    .maybeSingle();

  if (error || !report) {
    return sendError(
      res,
      requestId,
      { code: "NOT_FOUND", message: "Report not found" },
      404
    );
  }

  const payloadData = report.payload as
    | {
        stats?: Record<string, number | null>;
        swot?: Record<string, string[]>;
        plan_14_days?: string[];
        top_competitors?: Array<{
          name?: string;
          rating?: number | null;
          reviews?: number | null;
          distance_m?: number | null;
        }>;
        radius_km?: number | null;
        keyword?: string | null;
      }
    | null;

  const { data: location } = await supabaseAdmin
    .from("google_locations")
    .select("location_title, location_resource_name")
    .eq("id", report.location_id)
    .eq("user_id", userId)
    .maybeSingle();

  const locationLabel =
    location?.location_title ?? location?.location_resource_name ?? "Établissement";
  const zoneLabel = payloadData?.keyword ?? report.title ?? "Zone non précisée";
  const radiusLabel =
    typeof payloadData?.radius_km === "number"
      ? `${payloadData.radius_km} km`
      : "—";

  const html = buildBenchmarkHtml({
    title: report.title ?? "Benchmark concurrents",
    locationLabel,
    zoneLabel,
    radiusLabel,
    createdAt: report.created_at ?? null,
    stats: payloadData?.stats ?? {},
    swot: payloadData?.swot ?? {},
    topCompetitors: payloadData?.top_competitors ?? [],
    actions: payloadData?.plan_14_days ?? [],
    summary: report.summary ?? null
  });

  try {
    const pdfBytes = await renderPdfFromHtml(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="benchmark-${reportId}.pdf"`
    );
    return res.status(200).send(pdfBytes);
  } catch (pdfError) {
    console.error("[reports] pdf export failed", pdfError);
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Failed to generate PDF" },
      500
    );
  }
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
  if (route === "competitors-benchmark") {
    return handleCompetitorsBenchmark(req, res);
  }
  if (route === "competitors-benchmark/pdf") {
    return handleCompetitorsBenchmarkPdf(req, res);
  }
  return res.status(404).json({ error: "Not found" });
}
