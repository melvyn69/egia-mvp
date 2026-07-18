import assert from "node:assert/strict";
import {
  DbChannelError,
  consumeGoal007DbUrl,
  redactDbError,
  validateGoal007DbUrl,
  withGoal007DbWatchdog
} from "./lib/goal007-db-channel.mjs";

const direct =
  "postgresql://postgres:synthetic-password@db.fhadiwkdznhuxtlgrwfd.supabase.co:5432/postgres?sslmode=verify-full";
const session =
  "postgresql://postgres.fhadiwkdznhuxtlgrwfd:synthetic-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require";

assert.deepEqual(validateGoal007DbUrl(direct), {
  mode: "direct",
  port: 5432,
  database: "postgres",
  tlsMode: "verify-full"
});
assert.equal(validateGoal007DbUrl(session).mode, "supavisor-session");

for (const [value, code] of [
  [session.replace(":5432/", ":6543/"), "DB_TRANSACTION_POOLER_FORBIDDEN"],
  [direct.replace("sslmode=verify-full", "sslmode=disable"), "DB_TLS_REQUIRED"],
  [direct.replace("/postgres?", "/egia?"), "DB_NAME_INVALID"],
  [direct.replace("fhadiwkdznhuxtlgrwfd", "wrongproject"), "DB_PROJECT_INVALID"],
  [direct.replace("postgres:synthetic", "other:synthetic"), "DB_USER_INVALID"],
  ["not-a-url", "DB_URL_INVALID"]
]) {
  assert.throws(
    () => validateGoal007DbUrl(value),
    (error) => error instanceof DbChannelError && error.code === code
  );
}

const env = { SUPABASE_DB_URL: direct };
const consumed = consumeGoal007DbUrl(env);
assert.equal(consumed.classification.mode, "direct");
assert.equal("SUPABASE_DB_URL" in env, false);
const redacted = JSON.stringify(redactDbError(new Error(direct)));
assert.doesNotMatch(redacted, /synthetic-password|db\.fhadi/);

await assert.rejects(
  withGoal007DbWatchdog(new Promise(() => {}), 20),
  (error) => error instanceof DbChannelError && error.code === "DB_OPERATION_TIMEOUT"
);
assert.equal(await withGoal007DbWatchdog(Promise.resolve("ok"), 20), "ok");

console.log("GOAL-007 DB channel checks passed: 13/13.");
