const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const jwt = process.env.JWT ?? "";
const locationId = process.env.LOCATION_ID ?? "";

if (!jwt) {
  console.error("Missing JWT env var.");
  process.exit(1);
}
if (!locationId) {
  console.error("Missing LOCATION_ID env var.");
  process.exit(1);
}

type CheckResult = { name: string; ok: boolean; status: number; body: unknown };

const callApi = async (
  path: string,
  init?: RequestInit
): Promise<CheckResult> => {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json().catch(() => null);
  return {
    name: path,
    ok: response.ok,
    status: response.status,
    body
  };
};

const run = async () => {
  const results: CheckResult[] = [];
  results.push(
    await callApi(
      `/api/kpi/summary?location_id=${encodeURIComponent(locationId)}&preset=this_month&tz=Europe/Paris`
    )
  );
  results.push(
    await callApi(
      `/api/kpi/compare?location_id=${encodeURIComponent(locationId)}&preset=this_month&tz=Europe/Paris`
    )
  );
  results.push(
    await callApi(`/api/google/gbp/sync?active_only=1`)
  );

  let hasError = false;
  for (const result of results) {
    if (!result.ok) {
      hasError = true;
      console.error(
        `${result.name} -> ${result.status}`,
        JSON.stringify(result.body)
      );
    } else {
      console.log(`${result.name} -> ${result.status}`);
    }
  }
  process.exit(hasError ? 1 : 0);
};

run().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
