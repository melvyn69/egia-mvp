import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createSupabaseAdmin,
  getRequiredEnv,
  getUserFromRequest
} from "../../../server/_shared_dist/google/_utils.js";
import type { Json } from "../../../server/_shared_dist/database.types.js";
import { requireUser } from "../../../server/_shared_dist/_auth.js";

type GoogleAccount = {
  name: string;
};

type GoogleLocation = {
  name: string;
  title?: string;
  storeCode?: string;
  storefrontAddress?: unknown;
  primaryPhone?: string;
  websiteUri?: string;
};

const refreshAccessToken = async (refreshToken: string) => {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || tokenData.error) {
    const refreshError = new Error(
      tokenData.error_description ?? "Token refresh failed."
    ) as Error & { code?: string };
    refreshError.code = tokenData.error;
    throw refreshError;
  }

  return tokenData as {
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
};

const listAccounts = async (accessToken: string) => {
  const response = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Failed to list accounts.");
  }
  return (data.accounts ?? []) as GoogleAccount[];
};

const listLocationsForAccount = async (
  accessToken: string,
  accountName: string
) => {
  const locations: GoogleLocation[] = [];
  let pageToken: string | undefined;
  const normalizedAccountName = accountName.startsWith("accounts/")
    ? accountName
    : `accounts/${accountName}`;

  do {
    const baseUrl =
      `https://mybusinessbusinessinformation.googleapis.com/v1/${normalizedAccountName}/locations` +
      `?readMask=name,title,storefrontAddress,metadata,phoneNumbers,websiteUri` +
      `&pageSize=100`;
    const url = pageToken
      ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;

    console.log("[GBP] account.name =", accountName);
    console.log("[GBP] list locations url =", url);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message ?? "Failed to list locations.");
    }

    locations.push(...((data.locations ?? []) as GoogleLocation[]));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return locations;
};

export const syncGoogleLocationsForUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
) => {
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("google_connections")
    .select("access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (connectionError || !connection) {
    throw new Error("google_not_connected");
  }

  let accessToken = connection.access_token ?? "";
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const shouldRefresh = !accessToken || expiresAt - Date.now() < 60_000;

  if (shouldRefresh) {
    if (!connection.refresh_token) {
      throw new Error("reauth_required");
    }
    let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      refreshed = await refreshAccessToken(connection.refresh_token);
    } catch (error) {
      const refreshError = error as Error & { code?: string };
      const reauthRequired =
        refreshError.code === "invalid_grant" ||
        /expired or revoked/i.test(refreshError.message);
      if (reauthRequired) {
        await supabaseAdmin
          .from("google_connections")
          .delete()
          .eq("user_id", userId)
          .eq("provider", "google");
        throw new Error("reauth_required");
      }
      throw error;
    }
    accessToken = refreshed.access_token;
    const newExpiresAt =
      refreshed.expires_in && refreshed.expires_in > 0
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;

    const { error: refreshError } = await supabaseAdmin
      .from("google_connections")
      .update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        scope: refreshed.scope ?? null,
        token_type: refreshed.token_type ?? null
      })
      .eq("user_id", userId)
      .eq("provider", "google");

    if (refreshError) {
      console.error("google token refresh update failed:", refreshError);
    }
  }

  const accounts = await listAccounts(accessToken);
  let locationsCount = 0;

  for (const account of accounts) {
    if (!account.name) {
      continue;
    }
    const locations = await listLocationsForAccount(accessToken, account.name);
    locationsCount += locations.length;

    if (locations.length === 0) {
      continue;
    }

    const rows = locations.map((location) => ({
      user_id: userId,
      provider: "google",
      account_resource_name: account.name,
      location_resource_name: location.name,
      location_title: location.title ?? null,
      store_code: location.storeCode ?? null,
      address_json: (location.storefrontAddress ?? null) as Json | null,
      phone: location.primaryPhone ?? null,
      website_uri: location.websiteUri ?? null,
      updated_at: new Date().toISOString()
    }));

    const { error: upsertError } = await supabaseAdmin
      .from("google_locations")
      .upsert(rows, { onConflict: "user_id,location_resource_name" });

    if (upsertError) {
      console.error("google locations upsert failed:", upsertError);
    }
  }

  return { locationsCount };
};

type LocationRow = {
  id: string;
  location_resource_name: string;
  location_title?: string | null;
};

const fetchActiveLocationIds = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
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

const handler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "GET") {
    try {
      const auth = await requireUser(req, res);
      if (!auth) {
        return;
      }
      const { userId, supabaseAdmin } = auth;
      const activeOnly =
        req.query?.active_only === "1" ||
        (Array.isArray(req.query?.active_only) &&
          req.query.active_only[0] === "1");

      let query = supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name, location_title")
        .eq("user_id", userId);

      if (activeOnly) {
        const activeIds = await fetchActiveLocationIds(supabaseAdmin, userId);
        if (activeIds && activeIds.size > 0) {
          query = query.in("id", Array.from(activeIds));
        } else {
          return res.status(200).json({ ok: true, locations: [] });
        }
      }

      const { data, error } = await query.order("location_title", {
        ascending: true
      });
      if (error) {
        console.error("google locations list failed:", error);
        return res.status(500).json({ ok: false, error: "Failed to load." });
      }

      const locations = (data ?? []).map((row: LocationRow) => ({
        id: row.id,
        location_resource_name: row.location_resource_name,
        label: row.location_title ?? null
      }));

      return res.status(200).json({ ok: true, locations });
    } catch (error) {
      console.error("google gbp get locations error:", error);
      return res.status(500).json({ ok: false, error: "Failed to load." });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined>, url: req.url },
      supabaseAdmin
    );

    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .select("refresh_token")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    if (connectionError || !connection) {
      return res.status(404).json({ ok: false, error: "Google not connected." });
    }
    if (!connection.refresh_token) {
      return res.status(401).json({ ok: false, error: "reauth_required" });
    }

    const { data: existingJob } = await supabaseAdmin
      .from("job_queue")
      .select("id, status")
      .eq("user_id", userId)
      .eq("type", "google_gbp_sync")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (existingJob) {
      return res.status(200).json({
        ok: true,
        queued: true,
        job_id: existingJob.id,
        status: existingJob.status
      });
    }

    const nowIso = new Date().toISOString();
    const { data: job, error: jobError } = await supabaseAdmin
      .from("job_queue")
      .insert({
        user_id: userId,
        type: "google_gbp_sync",
        payload: { include_reviews: true } as Json,
        status: "queued",
        run_at: nowIso,
        updated_at: nowIso
      })
      .select("id, status")
      .single();

    if (jobError || !job) {
      console.error("job_queue insert failed:", jobError);
      return res.status(500).json({ ok: false, error: "Queue failed." });
    }

    return res.status(200).json({
      ok: true,
      queued: true,
      job_id: job.id,
      status: job.status
    });
  } catch (error) {
    console.error("google gbp sync error:", error);
    return res.status(500).json({ ok: false, error: "Sync failed." });
  }
};

export default handler;

// Smoke test:
// curl -i "https://<app>/api/google/gbp/sync?active_only=1" -H "Authorization: Bearer $JWT"
// curl -i -X POST "https://<app>/api/google/gbp/sync" -H "Authorization: Bearer $JWT"
