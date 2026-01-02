import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-google-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

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

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
    return jsonResponse(500, { error: "Server misconfigured" }, origin);
  }

  const authHeader = req.headers.get("authorization") ??
    req.headers.get("Authorization");
  const jwt = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!jwt) {
    return jsonResponse(401, { error: "Missing Supabase JWT" }, origin);
  }

  const googleToken = req.headers.get("x-google-token") ??
    req.headers.get("X-Google-Token");
  if (!googleToken) {
    return jsonResponse(400, { error: "Missing Google token" }, origin);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
    jwt
  );
  const user = userData?.user;
  if (userError || !user) {
    return jsonResponse(401, { error: "Invalid Supabase JWT" }, origin);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const accounts = await fetchAllPages<Record<string, unknown>>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      googleToken,
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
        googleToken,
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
          googleToken,
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
    console.error("google_gbp_sync_all failed:", error);
    return jsonResponse(500, { error: "Sync failed (see logs)" }, origin);
  }
});
