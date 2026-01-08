import type { IncomingMessage, ServerResponse } from "http";
import { createSupabaseAdmin, getRequiredEnv, getUserFromRequest } from "../../_shared/google/_utils";
import type { Json } from "../../_shared/database.types";

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

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined>, url: req.url },
      supabaseAdmin
    );

    if (!userId) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Unauthorized." }));
      return;
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("google_connections")
      .select("access_token,refresh_token,expires_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();

    if (connectionError || !connection) {
      console.error("google connection missing:", connectionError);
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Google not connected." }));
      return;
    }

    let accessToken = connection.access_token ?? "";
    const expiresAt = connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : 0;
    const shouldRefresh = !accessToken || expiresAt - Date.now() < 60_000;

    if (shouldRefresh) {
      if (!connection.refresh_token) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "Refresh token missing." }));
        return;
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
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ok: false,
              error: "reauth_required"
            })
          );
          return;
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

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, locationsCount }));
  } catch (error) {
    console.error("google gbp sync error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Sync failed." }));
  }
};

export default handler;
