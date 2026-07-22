import assert from "node:assert/strict";
import {
  consumeFounderPrerequisiteEmails,
  createSyntheticIdentitySet,
  InMemorySyntheticAdapter,
  LocalSyntheticMailbox,
  modeRequiresRemoteMailbox,
  runGoal002Synthetic,
  SyntheticRunnerError,
  SYNTHETIC_TTL_MS
} from "./lib/goal002-synth-runner.mjs";
import {
  isRecoverableFounderSyntheticUser,
  recoverFounderSyntheticUsers
} from "./lib/goal002-supabase-local-adapter.mjs";
import { HttpsOneShotMailboxProvider } from "./lib/goal002-mailbox-provider.mjs";
import { HttpsRedactedLogInspector } from "./lib/goal002-log-inspector-provider.mjs";
import { readFileSync } from "node:fs";

const launcherSource = readFileSync("scripts/goal002-synth.mjs", "utf8");
const supabaseAdapterSource = readFileSync(
  "scripts/lib/goal002-supabase-local-adapter.mjs",
  "utf8"
);
const founderA = "goal010-founder-a@example.invalid";
const founderB = "goal010-founder-b@example.invalid";
let goal010ScenarioCount = 0;
const scenario = async (_name, operation) => {
  await operation();
  goal010ScenarioCount += 1;
};

class FounderCaptureAdapter extends InMemorySyntheticAdapter {
  captured;
  identityReference;

  async setup(options) {
    this.captured = {
      A: options.identitySet.users.A.email,
      B: options.identitySet.users.B.email,
      source: options.identitySet.emailSource
    };
    this.identityReference = options.identitySet;
    await super.setup(options);
  }
}

const founderAdapter = new FounderCaptureAdapter();
founderAdapter.isProduction = true;
founderAdapter.productionAuthorized = true;
const founderPrerequisite = await runGoal002Synthetic({
  mode: "prerequisite",
  adapter: founderAdapter,
  founderEmails: { A: founderA, B: founderB }
});

await scenario("production prerequisite accepts explicit founder identities", () => {
  assert.equal(founderPrerequisite.ok, true);
});
await scenario("founder A is used for identity A", () => {
  assert.equal(founderAdapter.captured.A, founderA);
});
await scenario("founder B is used for identity B", () => {
  assert.equal(founderAdapter.captured.B, founderB);
});
await scenario("founder environment variables are consumed and deleted", () => {
  const env = { SUPABASE_TEST_EMAIL_A: founderA, SUPABASE_TEST_EMAIL_B: founderB };
  assert.deepEqual(consumeFounderPrerequisiteEmails(env), { A: founderA, B: founderB });
  assert.equal("SUPABASE_TEST_EMAIL_A" in env, false);
  assert.equal("SUPABASE_TEST_EMAIL_B" in env, false);
});
await scenario("founder identities never appear in evidence or errors", () => {
  const output = JSON.stringify(founderPrerequisite);
  assert.doesNotMatch(output, /goal010-founder|example\.invalid/i);
  assert.throws(
    () => consumeFounderPrerequisiteEmails({ SUPABASE_TEST_EMAIL_A: "invalid", SUPABASE_TEST_EMAIL_B: founderB }),
    (error) => error instanceof SyntheticRunnerError &&
      error.code === "FOUNDER_EMAILS_INVALID" &&
      !error.message.includes("invalid@") &&
      !error.message.includes("example.invalid")
  );
});
await scenario("missing founder A fails closed", () => {
  const env = { SUPABASE_TEST_EMAIL_B: founderB };
  assert.throws(() => consumeFounderPrerequisiteEmails(env), /FOUNDER_EMAILS_REQUIRED/);
  assert.equal("SUPABASE_TEST_EMAIL_A" in env, false);
  assert.equal("SUPABASE_TEST_EMAIL_B" in env, false);
});
await scenario("missing founder B fails closed", () => {
  const env = { SUPABASE_TEST_EMAIL_A: founderA };
  assert.throws(() => consumeFounderPrerequisiteEmails(env), /FOUNDER_EMAILS_REQUIRED/);
  assert.equal("SUPABASE_TEST_EMAIL_A" in env, false);
  assert.equal("SUPABASE_TEST_EMAIL_B" in env, false);
});
await scenario("partial founder value fails closed", () => {
  assert.throws(
    () => consumeFounderPrerequisiteEmails({ SUPABASE_TEST_EMAIL_A: "partial", SUPABASE_TEST_EMAIL_B: founderB }),
    /FOUNDER_EMAILS_INVALID/
  );
});
await scenario("identical founder identities fail closed", () => {
  assert.throws(
    () => consumeFounderPrerequisiteEmails({ SUPABASE_TEST_EMAIL_A: founderA, SUPABASE_TEST_EMAIL_B: founderA.toUpperCase() }),
    /FOUNDER_EMAILS_NOT_DISTINCT/
  );
});
await scenario("invalid founder format fails closed", () => {
  assert.throws(
    () => consumeFounderPrerequisiteEmails({ SUPABASE_TEST_EMAIL_A: "not an email", SUPABASE_TEST_EMAIL_B: founderB }),
    /FOUNDER_EMAILS_INVALID/
  );
});
await scenario("prerequisite does not instantiate or invoke a remote mailbox", async () => {
  const trapMailbox = {
    clear() { throw new Error("mailbox must remain unused"); },
    residueCount() { throw new Error("mailbox must remain unused"); },
    consume() { throw new Error("mailbox must remain unused"); },
    deliver() { throw new Error("mailbox must remain unused"); }
  };
  const result = await runGoal002Synthetic({
    mode: "prerequisite",
    adapter: new InMemorySyntheticAdapter(),
    founderEmails: { A: founderA, B: founderB },
    mailbox: trapMailbox
  });
  assert.equal(result.ok, true);
});
await scenario("prerequisite requires no mailbox endpoint or token", () => {
  assert.equal(modeRequiresRemoteMailbox("prerequisite"), false);
  assert.match(launcherSource, /const remoteMailboxRequired = productionAuthorized && modeRequiresRemoteMailbox\(mode\)/);
  assert.match(launcherSource, /const mailbox = remoteMailboxRequired/);
});
await scenario("prerequisite produces no mailbox side effect", async () => {
  let mailboxCalls = 0;
  const mailbox = new Proxy({}, { get: () => () => { mailboxCalls += 1; } });
  const result = await runGoal002Synthetic({
    mode: "prerequisite",
    adapter: new InMemorySyntheticAdapter(),
    founderEmails: { A: founderA, B: founderB },
    mailbox
  });
  assert.equal(result.ok, true);
  assert.equal(mailboxCalls, 0);
});
await scenario("prerequisite teardown remains complete", () => {
  assert.equal(founderPrerequisite.teardown, true);
  assert.equal(founderPrerequisite.residueCount, 0);
});
await scenario("interrupted prerequisite remains recoverable", async () => {
  class FounderRecoveryAdapter {
    isProduction = true;
    productionAuthorized = true;
    users = [];
    failDeleteAuthOnce = true;
    recoveredPrefixes = [];

    async cleanupExpired() {}
    async inventory({ prefix }) {
      return { total: this.users.filter((user) => user.app_metadata?.goal002_prefix === prefix).length };
    }
    async setup({ identitySet }) {
      await recoverFounderSyntheticUsers({
        identitySet,
        users: this.users,
        cleanup: async ({ prefix, userIds }) => {
          this.recoveredPrefixes.push(prefix);
          this.users = this.users.filter((user) => !userIds.includes(user.id));
        }
      });
      for (const side of ["A", "B"]) {
        this.users.push({
          id: `${identitySet.executionId}-${side}`,
          email: identitySet.users[side].email,
          app_metadata: {
            goal002_synthetic: true,
            goal002_mode: "prerequisite",
            goal002_side: side,
            goal002_prefix: identitySet.prefix
          }
        });
      }
    }
    async verifyOwnership() {}
    async assertPrerequisite() {}
    async revokeSessions() {}
    async deleteStorage() {}
    async deleteDatabase() {}
    async deleteAuth({ identitySet }) {
      if (this.failDeleteAuthOnce) {
        this.failDeleteAuthOnce = false;
        throw new SyntheticRunnerError("INTERRUPTED_AUTH_TEARDOWN");
      }
      this.users = this.users.filter(
        (user) => user.app_metadata?.goal002_prefix !== identitySet.prefix
      );
    }
  }
  const adapter = new FounderRecoveryAdapter();
  const first = await runGoal002Synthetic({ mode: "prerequisite", adapter, founderEmails: { A: founderA, B: founderB } });
  const second = await runGoal002Synthetic({ mode: "prerequisite", adapter, founderEmails: { A: founderA, B: founderB } });
  assert.equal(first.ok, false);
  assert.equal(first.teardown, false);
  assert.equal(first.residueCount, 2);
  assert.equal(second.ok, true);
  assert.equal(second.teardown, true);
  assert.equal(second.residueCount, 0);
  assert.equal(adapter.recoveredPrefixes.length, 2);
  assert.equal(adapter.users.length, 0);
});
await scenario("non-synthetic existing user is never recoverable", async () => {
  const existing = {
    id: "existing-user",
    email: founderA,
    app_metadata: { goal002_synthetic: false }
  };
  const cleanupCalls = [];
  assert.equal(isRecoverableFounderSyntheticUser(existing), false);
  await assert.rejects(
    recoverFounderSyntheticUsers({
      identitySet: createSyntheticIdentitySet("prerequisite", {
        founderEmails: { A: founderA, B: founderB }
      }),
      users: [existing],
      cleanup: async (entry) => cleanupCalls.push(entry)
    }),
    (error) => error instanceof SyntheticRunnerError && error.code === "FOUNDER_EMAIL_ALREADY_IN_USE"
  );
  assert.equal(cleanupCalls.length, 0);
  assert.equal(existing.email, founderA);
  assert.match(supabaseAdapterSource, /await recoverFounderSyntheticUsers\(\{/);
});
await scenario("postdeploy retains mandatory remote mailbox selection", () => {
  assert.equal(modeRequiresRemoteMailbox("postdeploy"), true);
  assert.match(launcherSource, /new HttpsOneShotMailboxProvider/);
});
await scenario("postdeploy retains integrated HTTPS one-shot consumption and cleanup", async () => {
  const sequence = [];
  let available = true;
  const mailbox = new HttpsOneShotMailboxProvider({
    endpoint: "https://mail.synthetic.invalid/",
    accessToken: "synthetic-control-token",
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      sequence.push(`${options.method}:${path}`);
      if (path.endsWith("/messages/consume")) {
        const token = available ? "synthetic-one-shot-token" : null;
        available = false;
        return Response.json({ token });
      }
      if (path.endsWith("/messages/clear")) {
        available = false;
        return Response.json({ ok: true });
      }
      return Response.json({ count: available ? 1 : 0 });
    }
  });
  class HttpsMailboxIntegrationAdapter extends InMemorySyntheticAdapter {
    async setup({ identitySet }) {
      await super.setup({ identitySet, mailbox: new LocalSyntheticMailbox() });
    }
    async assertPostdeploy({ identitySet, mailbox: activeMailbox }) {
      assert.equal(await activeMailbox.consume(identitySet.users.A.email), "synthetic-one-shot-token");
      assert.equal(await activeMailbox.residueCount(identitySet), 0);
    }
  }
  const result = await runGoal002Synthetic({
    mode: "postdeploy",
    adapter: new HttpsMailboxIntegrationAdapter(),
    mailbox
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.teardown, true);
  assert.equal(result.residueCount, 0);
  assert.deepEqual(sequence, [
    "POST:/messages/consume",
    "GET:/messages/count",
    "POST:/messages/clear",
    "GET:/messages/count"
  ]);
});
await scenario("historical generated postdeploy identities remain compatible", () => {
  const identity = createSyntheticIdentitySet("postdeploy", { emailDomain: "goal002.invalid" });
  assert.match(identity.users.A.email, /^goal002_synth_postdeploy_.*\.a@goal002\.invalid$/);
  assert.match(identity.users.B.email, /^goal002_synth_postdeploy_.*\.b@goal002\.invalid$/);
  assert.equal(identity.emailSource, "generated");
});
await scenario("founder values are cleared after execution and never persisted locally", () => {
  assert.equal(founderAdapter.identityReference.users.A.email, "");
  assert.equal(founderAdapter.identityReference.users.B.email, "");
  assert.equal(founderAdapter.identityReference.users.A.password, "");
  assert.equal(founderAdapter.identityReference.users.B.password, "");
  assert.doesNotMatch(JSON.stringify(founderPrerequisite), /goal010-founder|example\.invalid/i);
});

assert.equal(goal010ScenarioCount, 20);
console.log("GOAL-010 founder prerequisite scenarios passed: 20/20.");

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

const adapterSource = supabaseAdapterSource;
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
