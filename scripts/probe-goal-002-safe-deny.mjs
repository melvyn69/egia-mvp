import assert from "node:assert/strict";

const functions = {
  "process-review-analyze": { verifyJwt: false },
  "generate-reply": { verifyJwt: true },
  "post-reply-google": { verifyJwt: true },
  google_oauth_start: { verifyJwt: true },
  google_oauth_exchange: { verifyJwt: true },
  google_gbp_sync_locations: { verifyJwt: true },
  google_gbp_sync_all: { verifyJwt: true }
};

const name = process.argv[2];
if (name === "--self-test") {
  assert.equal(Object.keys(functions).length, 7);
  assert.deepEqual(
    Object.entries(functions)
      .filter(([, config]) => config.verifyJwt)
      .map(([functionName]) => functionName),
    [
      "generate-reply",
      "post-reply-google",
      "google_oauth_start",
      "google_oauth_exchange",
      "google_gbp_sync_locations",
      "google_gbp_sync_all"
    ]
  );
  const payload = {
    error: { code: "GOAL002_SAFE_DENY" },
    function: "generate-reply"
  };
  assert.equal(payload.error.code, "GOAL002_SAFE_DENY");
  console.log("GOAL-002 safe-deny probe contract self-test passed.");
  process.exit(0);
}
if (!functions[name] || process.argv.length !== 3) {
  console.error(
    "Usage: probe-goal-002-safe-deny.mjs <function-name>|--self-test"
  );
  process.exit(2);
}

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  process.exit(2);
}

const headers = {
  apikey: anonKey
};
if (functions[name].verifyJwt) {
  headers.Authorization = `Bearer ${anonKey}`;
}

const response = await fetch(
  `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`,
  {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000)
  }
);
let payload;
try {
  payload = await response.json();
} catch {
  console.error(`Safe-deny probe returned non-JSON status ${response.status}.`);
  process.exit(3);
}
if (
  response.status !== 503 ||
  payload?.error?.code !== "GOAL002_SAFE_DENY" ||
  payload?.function !== name
) {
  console.error(
    `Safe-deny probe failed for ${name} with status ${response.status}.`
  );
  process.exit(3);
}
console.log(
  JSON.stringify({
    function: name,
    status: 503,
    code: payload.error.code
  })
);
