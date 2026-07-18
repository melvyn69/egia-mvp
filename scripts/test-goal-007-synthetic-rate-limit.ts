import assert from "node:assert/strict";
import {
  consumeRateLimit,
  getSyntheticRateLimitPrefix
} from "../server/_shared/handlers/loyalty/enrollment_common";

const executionId = "00000000-0000-4000-8000-000000000007";
const prefix = `GOAL002_SYNTH_POSTDEPLOY_${executionId}`;
const request = {
  headers: {
    "x-goal002-synth-execution-id": executionId,
    authorization: "Bearer synthetic-ordinary-jwt"
  }
};
const admin = {
  auth: {
    getUser: async () => ({
      data: {
        user: {
          app_metadata: {
            goal002_synthetic: true,
            goal002_mode: "postdeploy",
            goal002_prefix: prefix
          }
        }
      },
      error: null
    })
  },
  rpc: async (_name: string, args: Record<string, unknown>) => ({ data: args, error: null })
};

const main = async () => {
assert.equal(
  await getSyntheticRateLimitPrefix({
    req: request as never,
    supabaseAdmin: admin as never,
    expectedEmail: `${prefix.toLowerCase()}.a.new-member@synthetic.invalid`
  }),
  prefix
);
assert.equal(
  await getSyntheticRateLimitPrefix({
    req: { headers: {} } as never,
    supabaseAdmin: admin as never
  }),
  null
);
await assert.rejects(
  getSyntheticRateLimitPrefix({
    req: request as never,
    supabaseAdmin: admin as never,
    expectedEmail: "client@example.com"
  }),
  /synthetic_auth_invalid/
);

let observedBucket = "";
const rateAdmin = {
  rpc: async (_name: string, args: Record<string, unknown>) => {
    observedBucket = String(args.p_bucket_key);
    return { data: true, error: null };
  }
};
assert.equal(
  await consumeRateLimit({
    supabaseAdmin: rateAdmin as never,
    serviceRoleKey: "synthetic-service-key-not-used",
    syntheticBucketKey: `${prefix}:loyalty:ip`,
    limit: 20,
    windowSeconds: 3600
  }),
  true
);
assert.equal(observedBucket, `${prefix}:loyalty:ip`);
await assert.rejects(
  consumeRateLimit({
    supabaseAdmin: rateAdmin as never,
    serviceRoleKey: "synthetic-service-key-not-used",
    syntheticBucketKey: "attacker-controlled",
    limit: 20,
    windowSeconds: 3600
  }),
  /rate_limit_bucket_invalid/
);

console.log("GOAL-007 synthetic rate-limit correlation checks passed: 5/5.");
};

void main();
