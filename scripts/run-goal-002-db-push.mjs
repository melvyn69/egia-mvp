import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const selfTest = args.length === 1 && args[0] === "--self-test";
const timeoutSelfTest =
  args.length === 1 && args[0] === "--self-test-timeout";
const dryRun = args.length === 1 && args[0] === "--dry-run";
const productionRun = args.length === 0;

if (!selfTest && !timeoutSelfTest && !dryRun && !productionRun) {
  console.error(
    "Usage: run-goal-002-db-push.mjs [--dry-run|--self-test|--self-test-timeout]"
  );
  process.exit(2);
}

const expectedMigrations = [
  "20260713073853_production_security_hardening.sql",
  "20260716142352_fix_claim_ai_tag_candidates_digest.sql"
];
const migrationMode =
  process.env.GOAL002_MIGRATION_MODE ?? "BASELINE_CHAIN";
const expectedPlan =
  migrationMode === "BASELINE_CHAIN"
    ? expectedMigrations
    : migrationMode === "HARDENING_ONLY_ROLL_FORWARD"
      ? expectedMigrations.slice(1)
      : null;
const authorization =
  "fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352";
const applicationName =
  "goal002_migrations_20260713073853_20260716142352";
if (
  productionRun &&
  (process.env.GOAL002_PRODUCTION_AUTHORIZED !== authorization ||
    expectedPlan === null)
) {
  console.error(
    "Refusing production db push without the exact GOAL-002 authorization marker."
  );
  process.exit(2);
}

export const extractMigrationFilenames = (output) => [
  ...new Set(
    output.match(/\b\d{14}_[a-z0-9_]+\.sql\b/gi) ?? []
  )
];

export const assertExactMigrationPlan = (output, plan = expectedPlan) => {
  assert.ok(plan, `Unsupported GOAL002_MIGRATION_MODE: ${migrationMode}`);
  assert.deepEqual(
    extractMigrationFilenames(output),
    plan,
    `Expected exactly these migrations in order: ${plan.join(", ")}`
  );
};

if (selfTest) {
  assertExactMigrationPlan(`
    Would push these migrations:
    ${expectedMigrations[0]}
    ${expectedMigrations[1]}
  `, expectedMigrations);
  assertExactMigrationPlan(
    `Would push this migration: ${expectedMigrations[1]}`,
    expectedMigrations.slice(1)
  );
  assert.throws(
    () =>
      assertExactMigrationPlan(`
        ${expectedMigrations[1]}
        ${expectedMigrations[0]}
      `, expectedMigrations),
    /Expected exactly these migrations in order/
  );
  assert.throws(
    () =>
      assertExactMigrationPlan(`
        ${expectedMigrations[0]}
        20260717000000_unexpected.sql
        ${expectedMigrations[1]}
      `, expectedMigrations),
    /Expected exactly these migrations in order/
  );
  console.log("GOAL-002 exact migration-plan self-test passed.");
  process.exit(0);
}

const runCommand = ({
  command,
  commandArgs,
  softTimeoutMs,
  hardTimeoutMs,
  captureOutput
}) =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      env: {
        ...process.env,
        PGAPPNAME: applicationName
      }
    });

    let output = "";
    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
    }

    let timedOut = false;
    const softTimeout = setTimeout(() => {
      timedOut = true;
      console.error(
        `GOAL-002 database push exceeded ${softTimeoutMs}ms; terminating the client.`
      );
      child.kill("SIGTERM");
    }, softTimeoutMs);
    const hardTimeout = setTimeout(() => {
      timedOut = true;
      console.error(
        `GOAL-002 database push reached the hard ${hardTimeoutMs}ms ceiling.`
      );
      child.kill("SIGKILL");
    }, hardTimeoutMs);

    child.on("error", (error) => {
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      console.error(`Unable to start database push: ${error.message}`);
      resolve({ code: 1, output, timedOut: false });
    });

    child.on("exit", (code, signal) => {
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      if (timedOut) {
        resolve({ code: 124, output, timedOut: true });
        return;
      }
      if (signal) {
        console.error(`Database push terminated by signal ${signal}.`);
        resolve({ code: 1, output, timedOut: false });
        return;
      }
      resolve({ code: code ?? 1, output, timedOut: false });
    });
  });

if (timeoutSelfTest) {
  const result = await runCommand({
    command: process.execPath,
    commandArgs: [
      "-e",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
    ],
    softTimeoutMs: 250,
    hardTimeoutMs: 350,
    captureOutput: false
  });
  process.exit(result.code);
}

const dryRunResult = await runCommand({
  command: "supabase",
  commandArgs: ["db", "push", "--linked", "--dry-run"],
  softTimeoutMs: 55_000,
  hardTimeoutMs: 60_000,
  captureOutput: true
});
if (dryRunResult.code !== 0) {
  console.error("GOAL-002 migration dry-run failed.");
  process.exit(dryRunResult.code);
}
try {
  assertExactMigrationPlan(dryRunResult.output);
} catch (error) {
  console.error(error.message);
  process.exit(3);
}
console.log(
  `GOAL-002 migration plan verified: ${expectedPlan.join(" -> ")}`
);

if (dryRun) {
  process.exit(0);
}

const pushResult = await runCommand({
  command: "supabase",
  commandArgs: ["db", "push", "--linked"],
  softTimeoutMs: 125_000,
  hardTimeoutMs: 130_000,
  captureOutput: false
});
process.exit(pushResult.code);
