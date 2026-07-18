import assert from "node:assert/strict";
import {
  executeGoal002PostdeployProbes,
  GOAL002_POSTDEPLOY_PROBE_NAMES
} from "./lib/goal002-postdeploy-probes.mjs";
import { createProductionGoal002ProbeRequest } from "./lib/goal002-production-probe-request.mjs";

const statuses = new Map([
  ["auth-a", 200], ["auth-b", 200], ["tenant-a-own", 200], ["tenant-b-own", 200],
  ["idor-a-from-b", 403], ["privileged-rpc-as-a", 403], ["ai-a", 200],
  ["ai-a-resource-from-b", 403], ["loyalty-new-request", 202],
  ["loyalty-existing-request", 202], ["loyalty-capability-before-proof", 404],
  ["loyalty-proof-consume", 200], ["loyalty-proof-replay", 410],
  ["invitation-a", 200], ["invitation-a-from-b", 403], ["asset-a", 200],
  ["asset-a-from-b", 403], ["edge-without-auth", 401], ["edge-wrong-tenant", 403],
  ["quota-a-within-limit", 200], ["quota-a-exceeded", 429],
  ["cron-without-secret", 401], ["cron-wrong-secret", 401]
]);

const request = async (name) => ({
  status: statuses.get(name),
  body: name.startsWith("loyalty-") && name.endsWith("request")
    ? { ok: true, message: "If eligible, a verification message has been sent", requestId: crypto.randomUUID() }
    : { ok: true }
});

const cleanLogs = async () => ({
  checked: true,
  vercel: true,
  supabaseEdge: true,
  sensitiveMatches: 0,
  unexpected5xx: 0
});
const result = await executeGoal002PostdeployProbes({ request, inspectLogs: cleanLogs });
assert.equal(result.ok, true);
assert.equal(result.probes, 23);
assert.equal(result.unexpected5xx, 0);
assert.equal(result.loyaltyEnumerationSafe, true);
assert.equal(result.oneShotReplayDenied, true);
assert.equal(result.secretsObserved, false);
assert.equal(new Set(GOAL002_POSTDEPLOY_PROBE_NAMES).size, 23);

await assert.rejects(
  executeGoal002PostdeployProbes({ request: async (name) => ({ status: name === "ai-a" ? 500 : statuses.get(name), body: { ok: true } }), inspectLogs: cleanLogs }),
  /POSTDEPLOY_AI_A_FAILED/
);
await assert.rejects(
  executeGoal002PostdeployProbes({ request: async (name) => ({
    status: statuses.get(name),
    body: name === "loyalty-existing-request" ? { ok: false } : name === "loyalty-new-request" ? { ok: true } : { ok: true }
  }), inspectLogs: cleanLogs }),
  /LOYALTY_ENUMERATION_RESPONSE_DRIFT/
);
await assert.rejects(
  executeGoal002PostdeployProbes({
    request: async (name) => ({
      status: statuses.get(name),
      body: name.includes("loyalty-") && name.endsWith("request")
        ? { ok: true, member_id: "forbidden" }
        : { ok: true }
    }),
    inspectLogs: cleanLogs
  }),
  /LOYALTY_CAPABILITY_PREPROOF_LEAK/
);
await assert.rejects(
  executeGoal002PostdeployProbes({ request, inspectLogs: async () => ({ ...await cleanLogs(), sensitiveMatches: 1 }) }),
  /POSTDEPLOY_LOG_INSPECTION_FAILED/
);

assert.throws(
  () => createProductionGoal002ProbeRequest({
    supabaseUrl: "https://attacker.invalid",
    anonKey: "synthetic-anon",
    aiQuotaLimit: 60,
    logInspector: { inspect: cleanLogs }
  }),
  /POSTDEPLOY_SUPABASE_TARGET_FORBIDDEN/
);

const query = ({ data = [{ id: "synthetic" }], error = null } = {}) => {
  const builder = {
    select: () => builder,
    eq: (column, value) => {
      if (column === "owner_user_id" && value === "user-a" && builder.side === "B") builder.data = [];
      if (column === "id" && value === "location-a" && builder.side === "B") builder.data = [];
      return builder;
    },
    update: () => builder,
    then: (resolve) => resolve({ data: builder.data, error })
  };
  builder.data = data;
  return builder;
};
const client = (side) => ({
  auth: {
    getUser: async () => ({ data: { user: { id: `user-${side.toLowerCase()}` } }, error: null }),
    getSession: async () => ({ data: { session: { access_token: `token-${side.toLowerCase()}` } }, error: null })
  },
  from: (table) => Object.assign(query({ data: ["loyalty_members", "wallet_passes"].includes(table) ? [] : [{ id: "synthetic" }] }), { side }),
  rpc: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
  storage: {
    from: () => ({ download: async () => side === "A" ? { data: new Blob(["ok"]), error: null } : { data: null, error: { code: "403", statusCode: 403, message: "Forbidden" } } })
  }
});
let edgeAuthorizedCalls = 0;
let verifyCalls = 0;
const productionRequest = createProductionGoal002ProbeRequest({
  supabaseUrl: "https://fhadiwkdznhuxtlgrwfd.supabase.co",
  anonKey: "synthetic-anon",
  aiQuotaLimit: 60,
  logInspector: { inspect: cleanLogs },
  fetchImpl: async (url, init) => {
    const target = String(url);
    if (target.includes("/functions/v1/generate-reply")) {
      const auth = init.headers.authorization;
      if (!auth) return new Response("{}", { status: 401 });
      const body = JSON.parse(init.body);
      if (auth === "Bearer token-b" && body.businessId === "user-a") return new Response("{}", { status: 403 });
      edgeAuthorizedCalls += 1;
      return new Response("{}", { status: edgeAuthorizedCalls <= 2 ? 200 : 429 });
    }
    if (target.includes("/api/loyalty/join")) {
      return Response.json({ ok: true, accepted: true, message: "generic", requestId: crypto.randomUUID() }, { status: 202 });
    }
    if (target.includes("/api/loyalty/apple-pass")) return new Response("{}", { status: 404 });
    if (target.includes("/api/loyalty/verify")) {
      verifyCalls += 1;
      return new Response("{}", { status: verifyCalls === 1 ? 200 : 410 });
    }
    if (target.includes("/api/cron/")) return new Response("{}", { status: 401 });
    throw new Error("unexpected synthetic URL");
  }
});
const context = {
  executionId: "00000000-0000-4000-8000-000000000007",
  objects: ["business/a/legal_entities/a/GOAL002_SYNTH_asset.png"],
  users: {
    A: {
      id: "user-a",
      client: client("A"),
      locationId: "location-a",
      programId: "program-a",
      programPublicToken: "00000000-0000-4000-8000-000000000001",
      newMemberEmail: "goal002_synth.new@example.invalid",
      existingMemberEmail: "goal002_synth.existing@example.invalid"
    },
    B: { id: "user-b", client: client("B"), locationId: "location-b" }
  }
};
const identitySet = {
  executionId: "00000000-0000-4000-8000-000000000007",
  prefix: "GOAL002_SYNTH_POSTDEPLOY_TEST",
  users: { A: { email: "a@example.invalid" }, B: { email: "b@example.invalid" } }
};
const mailbox = { consume: async () => "A".repeat(43) };
const liveContract = await executeGoal002PostdeployProbes({
  request: (name) => productionRequest(name, { identitySet, context, mailbox }),
  inspectLogs: () => productionRequest.inspectLogs({ identitySet, context })
});
assert.equal(liveContract.ok, true);
assert.equal((await productionRequest.plannedRateLimitBucketKeys({ context })).length, 1);
await productionRequest.prepareRateLimitFixtures({
  admin: { rpc: async () => ({ data: true, error: null }) },
  context
});
await assert.rejects(
  productionRequest("privileged-rpc-as-a", {
    identitySet,
    context: {
      ...context,
      users: {
        ...context.users,
        A: { ...context.users.A, client: { ...context.users.A.client, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function missing" } }) } }
      }
    },
    mailbox
  }),
  /POSTDEPLOY_PRIVILEGED_RPC_UNCLASSIFIED/
);
await assert.rejects(
  productionRequest("asset-a-from-b", {
    identitySet,
    context: {
      ...context,
      users: {
        ...context.users,
        B: {
          ...context.users.B,
          client: {
            ...context.users.B.client,
            storage: { from: () => ({ download: async () => ({ data: null, error: { statusCode: 500, message: "unavailable" } }) }) }
          }
        }
      }
    },
    mailbox
  }),
  /POSTDEPLOY_STORAGE_DENIAL_UNCLASSIFIED/
);

console.log("GOAL002_SYNTH postdeploy probe contract passed: 23/23.");
