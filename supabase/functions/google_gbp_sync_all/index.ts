import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const baseAllowedOrigins = [
  "http://localhost:5173",
  "https://egia-six.vercel.app",
];

const buildAllowedOrigins = () => {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const extra = fromEnv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set([...baseAllowedOrigins, ...extra]);
};

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = buildAllowedOrigins();
  const allowedOrigin =
    origin && allowedOrigins.has(origin) ? origin : "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-google-token, x-requested-with, accept, origin, referer, user-agent, cache-control, pragma",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  origin: string | null
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin),
    },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class GoogleApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Google API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

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
          Authorization: `Bearer ${accessToken}`,
        },
      });
      lastBody = await res.text();

      if (res.status !== 429) {
        break;
      }

      await sleep(500 * Math.pow(2, attempt));
    }

    if (!res || !res.ok) {
      if (res?.status === 401 || res?.status === 403) {
        throw new GoogleApiError(res.status, lastBody);
      }
      throw new Error(`Google API error ${res?.status}: ${lastBody}`);
    }

    const json = JSON.parse(lastBody);
    const items = (json[listKey] ?? []) as T[];
    results.push(...items);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return results;
};

const starRatingToInt = (starRating: string | undefined) => {
  switch (starRating) {
    case "FIVE":
      return 5;
    case "FOUR":
      return 4;
    case "THREE":
      return 3;
    case "TWO":
      return 2;
    case "ONE":
      return 1;
    default:
      return null;
  }
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey");
  const hasAuth = Boolean(authHeader);
  const hasApiKey = Boolean(apiKeyHeader);

  if (req.method === "OPTIONS") {
    console.log("gbp_sync_all options:", {
      origin,
      hasAuth,
      hasApiKey
    });
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  console.log("gbp_sync_all post:", {
    origin,
    hasAuth,
    hasApiKey
  });

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !supabaseAnonKey ||
    !googleClientId ||
    !googleClientSecret
  ) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!jwt) {
    return jsonResponse(401, { code: 401, message: "Missing JWT" }, origin);
  }
  console.log("has_jwt", !!jwt, "jwt_prefix", jwt?.slice(0, 20));

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);
  const user = userData?.user;

  if (userError || !user) {
    console.error("JWT invalid:", userError);
    return jsonResponse(
      401,
      { code: 401, message: "Invalid JWT", details: userError?.message ?? null },
      origin
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("google_connections")
    .select("access_token, refresh_token, expires_at, scope, token_type")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (connectionError) {
    console.error("google_connections read failed:", connectionError);
    return jsonResponse(500, { error: "Failed to read google connection" }, origin);
  }

  if (!connection?.refresh_token) {
    return jsonResponse(401, { error: "Missing Google refresh token" }, origin);
  }

  let accessToken = connection.access_token ?? null;
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const now = Date.now();
  const needsRefresh = !accessToken || !expiresAt || expiresAt <= now + 60_000;

  if (needsRefresh) {
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const refreshBody = await refreshResponse.text();
    if (!refreshResponse.ok) {
      console.error("Google refresh failed:", refreshResponse.status, refreshBody);
      return jsonResponse(
        401,
        { error: "Failed to refresh Google access token", status: refreshResponse.status },
        origin
      );
    }

    const refreshData = JSON.parse(refreshBody) as Record<string, unknown>;
    accessToken = (refreshData.access_token as string | undefined) ?? accessToken;
    const refreshExpiresIn = Number(refreshData.expires_in ?? 0);
    const newExpiresAt = new Date(now + refreshExpiresIn * 1000).toISOString();

    await supabaseAdmin
      .from("google_connections")
      .update({
        access_token: accessToken,
        token_type: (refreshData.token_type as string | undefined) ??
          connection.token_type,
        scope: (refreshData.scope as string | undefined) ?? connection.scope,
        expires_at: newExpiresAt,
      })
      .eq("user_id", user.id)
      .eq("provider", "google");
  }

  try {
    if (!accessToken) {
      return jsonResponse(401, { error: "Missing Google access token" }, origin);
    }
    const accounts = await fetchAllPages<Record<string, unknown>>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      accessToken,
      "accounts"
    );

    let accountsCount = 0;
    let locationsCount = 0;
    let reviewsCount = 0;

    for (const account of accounts) {
      const accountName = (account.accountName ??
        account.name) as string | undefined;
      const accountResourceName = account.name as string | undefined;
      if (!accountResourceName) {
        continue;
      }

      const { error: accountError } = await supabaseAdmin
        .from("google_accounts")
        .upsert(
          {
            user_id: user.id,
            provider: "google",
            account_name: accountName ?? null,
            account_resource_name: accountResourceName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,account_resource_name" }
        );

      if (accountError) {
        throw accountError;
      }

      accountsCount += 1;

      const locations = await fetchAllPages<Record<string, unknown>>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations?readMask=name,title,storeCode,storefrontAddress,websiteUri,phoneNumbers&pageSize=100`,
        accessToken,
        "locations"
      );

      for (const location of locations) {
        const locationResourceName = location.name as string | undefined;
        if (!locationResourceName) {
          continue;
        }

        const { error: locationError } = await supabaseAdmin
          .from("google_locations")
          .upsert(
            {
              user_id: user.id,
              provider: "google",
              account_resource_name: accountResourceName,
              location_resource_name: locationResourceName,
              location_title: (location.title ?? null) as string | null,
              store_code: (location.storeCode ?? null) as string | null,
              address_json: (location.storefrontAddress ?? null) as
                | Record<string, unknown>
                | null,
              phone: (location.phoneNumbers?.primaryPhone ?? null) as
                | string
                | null,
              website_uri: (location.websiteUri ?? null) as string | null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,location_resource_name" }
          );

        if (locationError) {
          throw locationError;
        }

        locationsCount += 1;

        const reviews = await fetchAllPages<Record<string, unknown>>(
          `https://mybusiness.googleapis.com/v4/${locationResourceName}/reviews?pageSize=200`,
          accessToken,
          "reviews"
        );

        for (const review of reviews) {
          const reviewId = (review.reviewId ??
            review.name) as string | undefined;
          if (!reviewId) {
            continue;
          }

          const rating = starRatingToInt(review.starRating as string | undefined);

          const { error: reviewError } = await supabaseAdmin
            .from("google_reviews")
            .upsert(
              {
                user_id: user.id,
                location_id: locationResourceName,
                review_id: reviewId,
                author_name: (review.reviewer?.displayName ?? null) as
                  | string
                  | null,
                rating,
                comment: (review.comment ?? null) as string | null,
                create_time: (review.createTime ?? null) as string | null,
                update_time: (review.updateTime ?? null) as string | null,
                raw: review,
              },
              { onConflict: "user_id,location_id,review_id" }
            );

          if (reviewError) {
            throw reviewError;
          }

          reviewsCount += 1;
        }
      }
    }

    return jsonResponse(
      200,
      { accounts: accountsCount, locations: locationsCount, reviews: reviewsCount },
      origin
    );
  } catch (error) {
    if (error instanceof GoogleApiError) {
      console.error("google_gbp_sync_all google error:", error.status, error.body);
      return jsonResponse(
        error.status,
        {
          error: "Google permission error",
          status: error.status,
          body: error.body,
        },
        origin
      );
    }
    console.error("google_gbp_sync_all failed:", error);
    return jsonResponse(500, { error: "Sync failed (see logs)" }, origin);
  }
});
