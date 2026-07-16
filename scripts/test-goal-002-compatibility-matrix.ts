import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const state = process.argv[2];
assert.ok(
  state === "baseline" || state === "hardened",
  "usage: tsx scripts/test-goal-002-compatibility-matrix.ts baseline|hardened"
);

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(supabaseUrl && anonKey && serviceRoleKey, "missing local Supabase env");
assert.match(supabaseUrl, /^http:\/\/127\.0\.0\.1:/, "local Supabase only");

Object.assign(process.env, {
  APP_BASE_URL: "http://127.0.0.1:4173",
  EMAIL_FROM: "EGIA Local <goal002@invalid.example>",
  RESEND_API_KEY: "goal002-local-only",
  CRON_SECRET: "goal002-local-cron-secret",
  NODE_ENV: "test"
});

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const PASSWORD = "Goal002-local-only-42!";
const TENANT_A_EMAIL = "tenant-a@goal002.invalid";
const TENANT_B_EMAIL = "tenant-b@goal002.invalid";
const LEGACY_MEMBER_EMAIL = "legacy.member@goal002.invalid";
const NEW_MEMBER_EMAIL = "new.member@goal002.invalid";
const LOCATION_A_ID = "10000000-0000-4000-8000-000000000001";
const LOCATION_B_ID = "10000000-0000-4000-8000-000000000002";
const REVIEW_A_ID = "20000000-0000-4000-8000-000000000001";
const REVIEW_B_ID = "20000000-0000-4000-8000-000000000002";
const PROGRAM_A_TOKEN = "30000000-0000-4000-8000-000000000001";
const PROGRAM_B_TOKEN = "30000000-0000-4000-8000-000000000002";
const RESOURCE_A = "locations/goal002-synthetic-a";
const RESOURCE_B = "locations/goal002-synthetic-b";

class MockResponse {
  statusCode = 200;
  body: unknown = null;
  headers = new Map<string, string>();

  setHeader(name: string, value: string | number | readonly string[]) {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    return this;
  }

  send(payload: unknown) {
    this.body = payload;
    return this;
  }

  end(payload?: unknown) {
    this.body = payload ?? null;
    return this;
  }
}

const invoke = async (
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  params: {
    method?: string;
    url: string;
    body?: Record<string, unknown>;
    token?: string;
    query?: Record<string, string | string[]>;
    headers?: Record<string, string>;
  }
) => {
  const response = new MockResponse();
  const request = {
    method: params.method ?? "POST",
    url: params.url,
    body: params.body,
    query: params.query ?? {},
    headers: {
      "x-forwarded-for": "127.0.0.42",
      "x-request-id": `goal002-${state}`,
      ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
      ...(params.headers ?? {})
    }
  } as unknown as VercelRequest;
  await handler(request, response as unknown as VercelResponse);
  return response;
};

const deleteSyntheticUsers = async () => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  assert.ifError(error);
  for (const user of data.users) {
    if ([TENANT_A_EMAIL, TENANT_B_EMAIL].includes(user.email ?? "")) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      assert.ifError(deleteError);
    }
  }
};

const createSyntheticUser = async (email: string) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true
  });
  assert.ifError(error);
  assert.ok(data.user);
  return data.user.id;
};

const signIn = async (email: string) => {
  const { data, error } = await anonymous.auth.signInWithPassword({
    email,
    password: PASSWORD
  });
  assert.ifError(error);
  assert.ok(data.session?.access_token);
  return data.session.access_token;
};

const seedBaselineFixtures = async () => {
  await deleteSyntheticUsers();
  const userA = await createSyntheticUser(TENANT_A_EMAIL);
  const userB = await createSyntheticUser(TENANT_B_EMAIL);

  const { error: locationsError } = await admin.from("google_locations").insert([
    {
      id: LOCATION_A_ID,
      user_id: userA,
      account_resource_name: "accounts/goal002-a",
      location_resource_name: RESOURCE_A,
      location_title: "GOAL-002 Synthetic A"
    },
    {
      id: LOCATION_B_ID,
      user_id: userB,
      account_resource_name: "accounts/goal002-b",
      location_resource_name: RESOURCE_B,
      location_title: "GOAL-002 Synthetic B"
    }
  ]);
  assert.ifError(locationsError);

  const { error: programsError } = await admin.from("loyalty_programs").insert([
    {
      user_id: userA,
      location_id: LOCATION_A_ID,
      is_enabled: true,
      name: "GOAL-002 Synthetic Loyalty A",
      public_token: PROGRAM_A_TOKEN
    },
    {
      user_id: userB,
      location_id: LOCATION_B_ID,
      is_enabled: true,
      name: "GOAL-002 Synthetic Loyalty B",
      public_token: PROGRAM_B_TOKEN
    }
  ]);
  assert.ifError(programsError);

  const { error: reviewsError } = await admin.from("google_reviews").insert([
    {
      id: REVIEW_A_ID,
      user_id: userA,
      location_id: RESOURCE_A,
      review_id: "goal002-review-a",
      review_name: "accounts/goal002-a/locations/a/reviews/goal002-review-a",
      author_name: "Synthetic A",
      rating: 5,
      comment: "Synthetic review A",
      update_time: new Date().toISOString()
    },
    {
      id: REVIEW_B_ID,
      user_id: userB,
      location_id: RESOURCE_B,
      review_id: "goal002-review-b",
      review_name: "accounts/goal002-b/locations/b/reviews/goal002-review-b",
      author_name: "Synthetic B",
      rating: 4,
      comment: "Synthetic review B",
      update_time: new Date().toISOString()
    }
  ]);
  assert.ifError(reviewsError);
};

const getUserId = async (email: string) => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  assert.ifError(error);
  const user = data.users.find((item) => item.email === email);
  assert.ok(user, `missing synthetic user ${email}`);
  return user.id;
};

const memberCount = async (email: string) => {
  const { count, error } = await admin
    .from("loyalty_members")
    .select("id", { count: "exact", head: true })
    .eq("email", email);
  assert.ifError(error);
  return count ?? 0;
};

const walletCountForEmail = async (email: string) => {
  const { data: members, error: membersError } = await admin
    .from("loyalty_members")
    .select("id")
    .eq("email", email);
  assert.ifError(membersError);
  const ids = (members ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;
  const { count, error } = await admin
    .from("wallet_passes")
    .select("id", { count: "exact", head: true })
    .in("member_id", ids);
  assert.ifError(error);
  return count ?? 0;
};

const testManualAnalysisIsolation = async () => {
  const tokenA = await signIn(TENANT_A_EMAIL);
  const { default: reviewsHandler } = await import("../api/reviews");
  const deduplicated = await invoke(reviewsHandler, {
    url: "/api/reviews?action=queue_analysis",
    token: tokenA,
    body: { location_id: LOCATION_A_ID, mode: "backlog", limit: 20 }
  });
  assert.equal(deduplicated.statusCode, 200);
  assert.equal((deduplicated.body as { queued?: number }).queued, 0);
  assert.equal((deduplicated.body as { skipped?: number }).skipped, 1);

  const { data: triggerJobs, error: triggerJobsError } = await admin
    .from("ai_jobs")
    .select("payload")
    .in("payload->>review_id", [REVIEW_A_ID, REVIEW_B_ID]);
  assert.ifError(triggerJobsError);
  assert.equal(
    (triggerJobs ?? []).filter(
      (row) => row.payload?.review_id === REVIEW_A_ID
    ).length,
    1
  );

  const { error: jobsCleanupError } = await admin
    .from("ai_jobs")
    .delete()
    .in("payload->>review_id", [REVIEW_A_ID, REVIEW_B_ID]);
  assert.ifError(jobsCleanupError);
  const allowed = await invoke(reviewsHandler, {
    url: "/api/reviews?action=queue_analysis",
    token: tokenA,
    body: { location_id: LOCATION_A_ID, mode: "backlog", limit: 20 }
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal((allowed.body as { queued?: number }).queued, 1);

  const denied = await invoke(reviewsHandler, {
    url: "/api/reviews?action=queue_analysis",
    token: tokenA,
    body: { location_id: LOCATION_B_ID, mode: "recent", limit: 20 }
  });
  assert.equal(denied.statusCode, 404);

  const { data: jobs, error } = await admin
    .from("ai_jobs")
    .select("payload")
    .in("payload->>review_id", [REVIEW_A_ID, REVIEW_B_ID]);
  assert.ifError(error);
  assert.deepEqual(
    (jobs ?? []).map((row) => row.payload?.review_id),
    [REVIEW_A_ID]
  );
};

const testCronShield = async () => {
  const { default: cronHandler } = await import("../api/cron/[...slug]");
  const anonymousResult = await invoke(cronHandler, {
    url: "/api/cron/ai/tag-reviews",
    query: { slug: ["ai", "tag-reviews"] }
  });
  assert.equal(anonymousResult.statusCode, 403);
  const userResult = await invoke(cronHandler, {
    url: "/api/cron/ai/tag-reviews",
    query: { slug: ["ai", "tag-reviews"] },
    token: await signIn(TENANT_A_EMAIL)
  });
  assert.equal(userResult.statusCode, 403);
};

const testRecoveryArtifacts = async () => {
  const { default: maintenance } = await import(
    "../recovery/goal-002/vercel-maintenance/api/maintenance"
  );
  const apiResponse = await invoke(maintenance, {
    url: "/api/cron/ai/tag-reviews"
  });
  assert.equal(apiResponse.statusCode, 503);
  assert.equal(apiResponse.headers.get("retry-after"), "120");

  const { createSafeDenyHandler } = await import(
    "../recovery/goal-002/edge-safe-deny/supabase/functions/_shared/safe_deny"
  );
  const safeDeny = createSafeDenyHandler("generate-reply");
  const denied = safeDeny(new Request("http://127.0.0.1/functions/v1/generate-reply", {
    method: "POST"
  }));
  assert.equal(denied.status, 503);

  const expectedFunctions = [
    "generate-reply",
    "google_oauth_start",
    "google_oauth_exchange",
    "google_gbp_sync_all",
    "google_gbp_sync_locations",
    "post-reply-google",
    "process-review-analyze"
  ];
  for (const name of expectedFunctions) {
    const source = readFileSync(
      join(
        process.cwd(),
        "recovery/goal-002/edge-safe-deny/supabase/functions",
        name,
        "index.ts"
      ),
      "utf8"
    );
    assert.match(source, new RegExp(`createSafeDenyHandler\\("${name}"\\)`));
  }
};

const testBaseline = async () => {
  await seedBaselineFixtures();
  const { data: legacyData, error: legacyError } = await anonymous.rpc(
    "join_loyalty_program",
    {
      p_public_token: PROGRAM_A_TOKEN,
      p_first_name: "Legacy",
      p_email: LEGACY_MEMBER_EMAIL
    }
  );
  assert.ifError(legacyError);
  const legacyRow = Array.isArray(legacyData) ? legacyData[0] : legacyData;
  assert.ok(legacyRow?.member_id && legacyRow?.qr_token && legacyRow?.wallet_public_token);

  const originalFetch = globalThis.fetch;
  let emailAttempted = false;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.resend.com/emails") {
      emailAttempted = true;
      return new Response(null, { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const { default: joinHandler } = await import(
      "../server/_shared/handlers/loyalty/join"
    );
    const result = await invoke(joinHandler, {
      url: "/api/loyalty/join",
      body: {
        public_token: PROGRAM_A_TOKEN,
        first_name: "New",
        email: NEW_MEMBER_EMAIL
      }
    });
    assert.equal(result.statusCode, 503);
    assert.equal(emailAttempted, false);
    assert.equal(await memberCount(NEW_MEMBER_EMAIL), 0);
    assert.equal(await walletCountForEmail(NEW_MEMBER_EMAIL), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await testManualAnalysisIsolation();
  await testCronShield();
  await testRecoveryArtifacts();
  console.log(JSON.stringify({
    state,
    old_app_current_db: "compatible_but_insecure_immediate_capability",
    new_app_current_db: "fail_closed_503_missing_security_primitives",
    manual_ai: "tenant_scoped_queue",
    cron: "secret_only",
    recovery_artifacts: "503_fail_closed"
  }));
};

const extractToken = (emailBody: string) => {
  const parsed = JSON.parse(emailBody) as { html?: string };
  const match = parsed.html?.match(/#token=([A-Za-z0-9_-]{40,64})/);
  assert.ok(match?.[1], "verification token missing from synthetic email");
  return match[1];
};

const testHardened = async () => {
  assert.ok(await getUserId(TENANT_A_EMAIL));
  const { error: requestsCleanupError } = await admin
    .from("loyalty_enrollment_requests")
    .delete()
    .in("email", [NEW_MEMBER_EMAIL, LEGACY_MEMBER_EMAIL]);
  assert.ifError(requestsCleanupError);
  const { error: newMemberCleanupError } = await admin
    .from("loyalty_members")
    .delete()
    .eq("email", NEW_MEMBER_EMAIL);
  assert.ifError(newMemberCleanupError);
  const { error: rateLimitCleanupError } = await admin
    .from("security_rate_limits")
    .delete()
    .like("bucket_key", "%");
  assert.ifError(rateLimitCleanupError);
  const { data: legacyData, error: legacyError } = await anonymous.rpc(
    "join_loyalty_program",
    {
      p_public_token: PROGRAM_A_TOKEN,
      p_first_name: "Blocked",
      p_email: "blocked.old-app@goal002.invalid"
    }
  );
  assert.equal(legacyData, null);
  assert.ok(legacyError);

  const originalFetch = globalThis.fetch;
  const sentEmails: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.resend.com/emails") {
      sentEmails.push(String(init?.body ?? ""));
      return Response.json({ id: `local-${sentEmails.length}` }, { status: 200 });
    }
    return originalFetch(input, init);
  };
  try {
    const [{ default: joinHandler }, { default: verifyHandler }] =
      await Promise.all([
        import("../server/_shared/handlers/loyalty/join"),
        import("../server/_shared/handlers/loyalty/verify")
      ]);

    const newJoin = await invoke(joinHandler, {
      url: "/api/loyalty/join",
      body: {
        public_token: PROGRAM_A_TOKEN,
        first_name: "New",
        email: NEW_MEMBER_EMAIL
      }
    });
    assert.equal(newJoin.statusCode, 202);
    assert.equal(await memberCount(NEW_MEMBER_EMAIL), 0);
    assert.equal(await walletCountForEmail(NEW_MEMBER_EMAIL), 0);
    const newToken = extractToken(sentEmails.at(-1) ?? "");
    const newVerify = await invoke(verifyHandler, {
      url: "/api/loyalty/verify",
      body: { token: newToken }
    });
    assert.equal(newVerify.statusCode, 200);
    const newCapability = (newVerify.body as { data?: Record<string, string> }).data;
    assert.ok(
      newCapability?.member_id &&
        newCapability?.qr_token &&
        newCapability?.wallet_public_token
    );
    assert.equal(await memberCount(NEW_MEMBER_EMAIL), 1);
    assert.equal(await walletCountForEmail(NEW_MEMBER_EMAIL), 1);
    const replay = await invoke(verifyHandler, {
      url: "/api/loyalty/verify",
      body: { token: newToken }
    });
    assert.equal(replay.statusCode, 400);

    const { data: legacyMember, error: legacyMemberError } = await admin
      .from("loyalty_members")
      .select("id")
      .eq("email", LEGACY_MEMBER_EMAIL)
      .single();
    assert.ifError(legacyMemberError);
    const existingJoin = await invoke(joinHandler, {
      url: "/api/loyalty/join",
      body: {
        public_token: PROGRAM_A_TOKEN,
        first_name: "Legacy",
        email: LEGACY_MEMBER_EMAIL
      }
    });
    assert.equal(existingJoin.statusCode, 202);
    assert.deepEqual(
      {
        ...(newJoin.body as Record<string, unknown>),
        requestId: null
      },
      {
        ...(existingJoin.body as Record<string, unknown>),
        requestId: null
      }
    );
    assert.equal("data" in (existingJoin.body as Record<string, unknown>), false);
    const existingToken = extractToken(sentEmails.at(-1) ?? "");
    const existingVerify = await invoke(verifyHandler, {
      url: "/api/loyalty/verify",
      body: { token: existingToken }
    });
    assert.equal(existingVerify.statusCode, 200);
    assert.equal(
      (existingVerify.body as { data?: { member_id?: string } }).data?.member_id,
      legacyMember.id
    );
    assert.equal(await memberCount(LEGACY_MEMBER_EMAIL), 1);
    assert.equal(await walletCountForEmail(LEGACY_MEMBER_EMAIL), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const tokenA = await signIn(TENANT_A_EMAIL);
  const authenticated = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error: brandingError } = await authenticated
    .from("legal_entities")
    .select("logo_url")
    .limit(1);
  assert.ok(brandingError, "old branding projection must fail closed");

  await testManualAnalysisIsolation();
  await testCronShield();
  await testRecoveryArtifacts();
  console.log(JSON.stringify({
    state,
    old_app_hardened_db: "functionally_incompatible_fail_closed",
    new_app_hardened_db: "compatible_verified_email_before_capability",
    existing_member_disclosure: "indistinguishable_before_email_proof",
    manual_ai: "tenant_scoped_queue",
    cron: "secret_only",
    recovery_artifacts: "503_fail_closed"
  }));
};

const main = async () => {
  await (state === "baseline" ? testBaseline() : testHardened());
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
