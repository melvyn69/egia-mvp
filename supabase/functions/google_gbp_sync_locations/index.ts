import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonResponse = (
  status: number,
  payload: Record<string, string | number | boolean>,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAllPages = async <T>(
  baseUrl: string,
  accessToken: string,
  listKey: string
): Promise<T[]> => {
  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(baseUrl);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let res: Response | null = null;
    let lastBody = "";

    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      lastBody = await res.text();

      if (res.status !== 429) {
        break;
      }

      await sleep(500 * Math.pow(2, attempt));
    }

    if (!res || !res.ok) {
      throw new Error(`Google API error ${res?.status}: ${lastBody}`);
    }

    const json = JSON.parse(lastBody);
    const items = (json[listKey] ?? []) as T[];
    results.push(...items);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return results;
};

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !googleClientId ||
      !googleClientSecret
    ) {
      return jsonResponse(500, { error: "Server misconfigured" });
    }

    let payload: { jwt?: string } | null = null;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const authHeader = req.headers.get("authorization") ??
      req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const jwt = payload?.jwt ??
      bearerToken ??
      req.headers.get("x-user-jwt") ??
      req.headers.get("X-User-JWT");
    if (!jwt) {
      return jsonResponse(401, { error: "Missing Supabase JWT" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      jwt
    );
    if (userError || !user) {
      return jsonResponse(401, { error: "Invalid Supabase JWT" });
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .select("access_token, refresh_token, expires_at, scope, token_type")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    if (connectionError) {
      return jsonResponse(500, { error: "Failed to read google connection" });
    }

    if (!connection?.access_token) {
      return jsonResponse(401, { error: "Missing Google connection" });
    }

    let accessToken = connection.access_token;
    const expiresAt = connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : 0;
    const now = Date.now();

    if (expiresAt && expiresAt <= now + 60_000) {
      if (!connection.refresh_token) {
        return jsonResponse(401, { error: "Missing refresh token" });
      }

      const refreshResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: connection.refresh_token,
            grant_type: "refresh_token"
          })
        }
      );

      if (!refreshResponse.ok) {
        const body = await refreshResponse.text();
        console.error("Google refresh failed:", refreshResponse.status, body);
        return jsonResponse(401, { error: "Failed to refresh access token" });
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token ?? accessToken;
      const expiresIn = Number(refreshData.expires_in ?? 0);
      const newExpiresAt = new Date(now + expiresIn * 1000).toISOString();

      await supabaseAdmin
        .from("google_connections")
        .update({
          access_token: accessToken,
          token_type: refreshData.token_type ?? connection.token_type,
          scope: refreshData.scope ?? connection.scope,
          expires_at: newExpiresAt
        })
        .eq("user_id", user.id)
        .eq("provider", "google");
    }

    console.log("Syncing Google accounts for user", user.id);

    const accounts = await fetchAllPages<{
      name?: string;
      accountName?: string;
    }>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      accessToken,
      "accounts"
    );

    let accountsCount = 0;
    let locationsCount = 0;

    for (const account of accounts) {
      if (!account.name) {
        continue;
      }

      const accountName = account.accountName ?? null;
      await supabaseAdmin
        .from("google_accounts")
        .upsert(
          {
            user_id: user.id,
            provider: "google",
            account_name: accountName,
            account_resource_name: account.name,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id,account_resource_name" }
        );
      accountsCount += 1;

      const locations = await fetchAllPages<{
        name?: string;
        title?: string;
        storeCode?: string;
        storefrontAddress?: unknown;
        websiteUri?: string;
        phoneNumbers?: { primaryPhone?: string };
      }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode,storefrontAddress,websiteUri,phoneNumbers&pageSize=100`,
        accessToken,
        "locations"
      );

      for (const location of locations) {
        if (!location.name) {
          continue;
        }

        await supabaseAdmin
          .from("google_locations")
          .upsert(
            {
              user_id: user.id,
              provider: "google",
              account_resource_name: account.name,
              location_resource_name: location.name,
              location_title: location.title ?? null,
              store_code: location.storeCode ?? null,
              address_json: location.storefrontAddress ?? null,
              phone: location.phoneNumbers?.primaryPhone ?? null,
              website_uri: location.websiteUri ?? null,
              updated_at: new Date().toISOString()
            },
            { onConflict: "user_id,location_resource_name" }
          );
        locationsCount += 1;
      }
    }

    return jsonResponse(200, {
      ok: true,
      accountsCount,
      locationsCount
    });
  } catch (error) {
    console.error("google_gbp_sync_locations fatal:", error);
    return jsonResponse(500, { error: "Sync failed (see logs)" });
  }
});
