const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const jwt = process.env.JWT ?? "";
const forcedLocationId = process.env.LOCATION_ID ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

if (!jwt) {
  console.error("Missing JWT env var.");
  process.exit(1);
}

type ApiResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

const callApi = async (
  path: string,
  init?: RequestInit
): Promise<ApiResult> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const body = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    body
  };
};

const run = async () => {
  console.log("[1/3] List locations");
  const listResult = await callApi("/api/google/gbp/sync?active_only=1", {
    method: "GET"
  });
  if (!listResult.ok) {
    console.error("Locations list failed:", listResult.status, listResult.body);
    process.exit(1);
  }

  const locations = Array.isArray((listResult.body as { locations?: unknown[] })?.locations)
    ? ((listResult.body as { locations: Array<{ location_resource_name: string; location_title?: string | null }> }).locations)
    : [];

  console.log(`Locations found: ${locations.length}`);
  if (locations.length === 0 && !forcedLocationId) {
    console.log("No location available. Stop smoke test.");
    return;
  }

  const selectedLocationId =
    forcedLocationId || locations[0]?.location_resource_name || "";
  console.log(`[2/3] Sync reviews for: ${selectedLocationId}`);

  const syncResult = await callApi("/api/google/gbp/reviews/sync", {
    method: "POST",
    body: JSON.stringify({ location_id: selectedLocationId })
  });

  if (!syncResult.ok) {
    console.error("Reviews sync failed:", syncResult.status, syncResult.body);
    process.exit(1);
  }

  const syncBody = syncResult.body as {
    locationsCount?: number;
    reviewsCount?: number;
    locationsFailed?: number;
    inserted?: number;
    updated?: number;
    skipped?: number;
    locationResults?: Array<{
      location_id: string;
      status: string;
      inserted: number;
      updated: number;
      skipped: number;
      error: string | null;
    }>;
  };

  console.log("Sync summary:", {
    locationsCount: syncBody.locationsCount ?? 0,
    reviewsCount: syncBody.reviewsCount ?? 0,
    locationsFailed: syncBody.locationsFailed ?? 0,
    inserted: syncBody.inserted ?? 0,
    updated: syncBody.updated ?? 0,
    skipped: syncBody.skipped ?? 0
  });
  if (Array.isArray(syncBody.locationResults) && syncBody.locationResults.length > 0) {
    console.log("Location run:", syncBody.locationResults[0]);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log(
      "[3/3] Skip google_sync_runs read (missing SUPABASE_URL/SUPABASE_ANON_KEY)."
    );
    return;
  }

  console.log("[3/3] Read last sync runs");
  const runsUrl = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/google_sync_runs`);
  runsUrl.searchParams.set(
    "select",
    "id,run_type,status,location_id,started_at,finished_at,error,meta"
  );
  runsUrl.searchParams.set("order", "started_at.desc");
  runsUrl.searchParams.set("limit", "5");

  const runsResponse = await fetch(runsUrl.toString(), {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${jwt}`
    }
  });
  const runsBody = await runsResponse.json().catch(() => null);

  if (!runsResponse.ok) {
    console.error("Failed to load google_sync_runs:", runsResponse.status, runsBody);
    process.exit(1);
  }

  console.log("Last google_sync_runs:", runsBody);
};

run().catch((error) => {
  console.error("Smoke failed:", error);
  process.exit(1);
});
