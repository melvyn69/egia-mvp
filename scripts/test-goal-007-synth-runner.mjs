import assert from "node:assert/strict";
import {
  createSyntheticIdentitySet,
  InMemorySyntheticAdapter,
  LocalSyntheticMailbox,
  runGoal002Synthetic,
  SYNTHETIC_TTL_MS
} from "./lib/goal002-synth-runner.mjs";
import { HttpsOneShotMailboxProvider } from "./lib/goal002-mailbox-provider.mjs";
import { HttpsRedactedLogInspector } from "./lib/goal002-log-inspector-provider.mjs";
import { readFileSync } from "node:fs";

const prereq = await runGoal002Synthetic({
  mode: "prerequisite",
  adapter: new InMemorySyntheticAdapter()
});
assert.deepEqual(
  { ok: prereq.ok, setup: prereq.setup, ownership: prereq.ownership, assertions: prereq.assertions, teardown: prereq.teardown, residue: prereq.residueCount },
  { ok: true, setup: true, ownership: true, assertions: true, teardown: true, residue: 0 }
);

const postdeploy = await runGoal002Synthetic({
  mode: "postdeploy",
  adapter: new InMemorySyntheticAdapter()
});
assert.equal(postdeploy.ok, true);
assert.equal(postdeploy.teardown, true);
assert.notEqual(prereq.executionId, postdeploy.executionId);

for (const failAt of ["setup", "ownership", "prerequisite", "postdeploy"]) {
  const mode = failAt === "postdeploy" ? "postdeploy" : "prerequisite";
  const result = await runGoal002Synthetic({ mode, adapter: new InMemorySyntheticAdapter({ failAt }) });
  assert.equal(result.ok, false);
  assert.equal(result.teardown, true);
  assert.equal(result.residueCount, 0);
}

class FalseZeroTeardownAdapter extends InMemorySyntheticAdapter {
  async deleteStorage(options) {
    await super.deleteStorage(options);
    throw new Error("synthetic deletion acknowledgement lost");
  }
}
const falseZero = await runGoal002Synthetic({
  mode: "prerequisite",
  adapter: new FalseZeroTeardownAdapter()
});
assert.equal(falseZero.residueCount, 2);
assert.equal(falseZero.teardown, false);
assert.equal(falseZero.ok, false);
assert.equal(falseZero.errorCode, "TEARDOWN_INCOMPLETE");

class RecoverableInterruptedAdapter {
  isProduction = false;
  records = new Map();
  failStorageOnce = true;
  recoveredPrefixes = 0;
  async cleanupExpired() {
    if (this.records.size > 0) {
      this.records.clear();
      this.recoveredPrefixes += 1;
    }
  }
  async inventory({ prefix }) {
    const record = this.records.get(prefix);
    return { total: record ? record.auth + record.storage + record.database : 0 };
  }
  async setup({ identitySet }) {
    this.records.set(identitySet.prefix, { auth: 2, storage: 1, database: 1 });
  }
  async verifyOwnership() {}
  async assertPrerequisite() {}
  async revokeSessions() {}
  async deleteStorage({ identitySet }) {
    if (this.failStorageOnce) {
      this.failStorageOnce = false;
      throw new Error("synthetic storage interruption");
    }
    this.records.get(identitySet.prefix).storage = 0;
  }
  async deleteDatabase({ identitySet }) {
    this.records.get(identitySet.prefix).database = 0;
  }
  async deleteAuth({ identitySet }) {
    this.records.get(identitySet.prefix).auth = 0;
  }
}
const recoveryAdapter = new RecoverableInterruptedAdapter();
const interrupted = await runGoal002Synthetic({ mode: "prerequisite", adapter: recoveryAdapter });
assert.equal(interrupted.ok, false);
assert.equal(interrupted.teardown, false);
assert.equal(interrupted.residueCount, 3);
const recovered = await runGoal002Synthetic({ mode: "prerequisite", adapter: recoveryAdapter });
assert.equal(recovered.ok, true);
assert.equal(recovered.teardown, true);
assert.equal(recovered.residueCount, 0);
assert.equal(recoveryAdapter.recoveredPrefixes, 1);

class RecoverableRateLimitInterruptionAdapter extends InMemorySyntheticAdapter {
  indexedBucketKeys = new Map();
  buckets = new Set();
  failAfterBucketCreation = true;
  async cleanupExpired() {
    for (const keys of this.indexedBucketKeys.values()) {
      for (const key of keys) this.buckets.delete(key);
    }
    this.indexedBucketKeys.clear();
  }
  async setup(options) {
    const { identitySet } = options;
    await super.setup(options);
    const plannedKey = `ai-hash-${identitySet.executionId}`;
    this.indexedBucketKeys.set(identitySet.prefix, [plannedKey]);
    this.buckets.add(plannedKey);
    if (this.failAfterBucketCreation) {
      this.failAfterBucketCreation = false;
      throw new Error("synthetic interruption after rate-limit creation");
    }
  }
  async inventory(options) {
    const base = await super.inventory(options);
    return { total: base.total + this.buckets.size };
  }
  async deleteDatabase(options) {
    await super.deleteDatabase(options);
    for (const key of this.indexedBucketKeys.get(options.identitySet.prefix) ?? []) {
      this.buckets.delete(key);
    }
    this.indexedBucketKeys.delete(options.identitySet.prefix);
  }
}
const rateLimitRecoveryAdapter = new RecoverableRateLimitInterruptionAdapter();
const rateLimitInterrupted = await runGoal002Synthetic({ mode: "postdeploy", adapter: rateLimitRecoveryAdapter });
assert.equal(rateLimitInterrupted.ok, false);
assert.equal(rateLimitInterrupted.teardown, true);
assert.equal(rateLimitInterrupted.residueCount, 0);
assert.equal(rateLimitRecoveryAdapter.buckets.size, 0);
const rateLimitRecovered = await runGoal002Synthetic({ mode: "postdeploy", adapter: rateLimitRecoveryAdapter });
assert.equal(rateLimitRecovered.ok, true, JSON.stringify(rateLimitRecovered));
assert.equal(rateLimitRecovered.residueCount, 0);

const one = createSyntheticIdentitySet("prerequisite");
const two = createSyntheticIdentitySet("postdeploy");
assert.notEqual(one.executionId, two.executionId);
assert.notEqual(one.users.A.email, two.users.A.email);
assert.notEqual(one.users.A.password, two.users.A.password);
assert.match(one.prefix, /^GOAL002_SYNTH_PREREQUISITE_/);
assert.equal(SYNTHETIC_TTL_MS, 86_400_000);

const mailbox = new LocalSyntheticMailbox();
mailbox.deliver("one@goal002.invalid", "one-shot-token-value");
assert.equal(mailbox.consume("one@goal002.invalid"), "one-shot-token-value");
assert.throws(() => mailbox.consume("one@goal002.invalid"), /MAILBOX_TOKEN_UNAVAILABLE/);

await assert.rejects(
  runGoal002Synthetic({ mode: "prerequisite", adapter: { isProduction: true } }),
  /PRODUCTION_ADAPTER_FORBIDDEN/
);

const authorizedProductionAdapter = new InMemorySyntheticAdapter();
authorizedProductionAdapter.isProduction = true;
authorizedProductionAdapter.productionAuthorized = true;
const authorized = await runGoal002Synthetic({
  mode: "prerequisite",
  adapter: authorizedProductionAdapter
});
assert.equal(authorized.ok, true);

assert.throws(
  () => new HttpsOneShotMailboxProvider({ endpoint: "http://mail.invalid", accessToken: "synthetic" }),
  /MAILBOX_TLS_REQUIRED/
);
const provider = new HttpsOneShotMailboxProvider({
  endpoint: "https://mail.synthetic.invalid/",
  accessToken: "synthetic-control-token",
  fetchImpl: async (url) => new Response(JSON.stringify(
    String(url).includes("messages/count") ? { count: 0 } : String(url).includes("messages/consume") ? { token: "synthetic-one-shot-token" } : { ok: true }
  ), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
});
assert.equal(await provider.consume("a@synthetic.example"), "synthetic-one-shot-token");
assert.equal(await provider.residueCount({ prefix: "GOAL002_SYNTH_TEST" }), 0);
assert.equal(await provider.clear({ prefix: "GOAL002_SYNTH_TEST" }), 0);

const logInspector = new HttpsRedactedLogInspector({
  endpoint: "https://logs.synthetic.invalid/",
  accessToken: "synthetic-log-control-token",
  fetchImpl: async () => Response.json({
    checked: true,
    vercel: true,
    supabaseEdge: true,
    sensitiveMatches: 0,
    unexpected5xx: 0
  })
});
assert.deepEqual(
  await logInspector.inspect({ identitySet: { executionId: crypto.randomUUID(), createdAt: new Date().toISOString() } }),
  { checked: true, vercel: true, supabaseEdge: true, sensitiveMatches: 0, unexpected5xx: 0 }
);

const adapterSource = readFileSync("scripts/lib/goal002-supabase-local-adapter.mjs", "utf8");
const walletSchema = readFileSync("supabase/migrations/20260618181806_loyalty_wallet.sql", "utf8");
assert.match(adapterSource, /ai_draft_runs/);
assert.match(adapterSource, /EXISTING_MEMBER/);
assert.match(adapterSource, /executeGoal002PostdeployProbes/);
assert.match(adapterSource, /identitySet\.prefix}_logo\.png/);
assert.match(adapterSource, /goal002_storage_paths/);
const assertionSource = adapterSource.slice(
  adapterSource.indexOf("async verifyOwnership"),
  adapterSource.indexOf("async revokeSessions")
);
const postdeploySetupSource = adapterSource.slice(
  adapterSource.indexOf('if (identitySet.mode === "postdeploy" && this.isProduction)'),
  adapterSource.indexOf('if (identitySet.mode === "postdeploy" && typeof mailbox.deliver')
);
assert.ok(
  postdeploySetupSource.indexOf("#updateSyntheticMetadata") <
    postdeploySetupSource.indexOf("prepareRateLimitFixtures"),
  "planned rate-limit keys must be recoverably indexed before fixture mutation"
);
assert.doesNotMatch(assertionSource, /this\.#admin/);
assert.match(walletSchema, /create table if not exists public\.wallet_passes[\s\S]*member_id uuid not null references public\.loyalty_members\(id\) on delete cascade/);

console.log("GOAL002_SYNTH lifecycle checks passed: 41/41.");
