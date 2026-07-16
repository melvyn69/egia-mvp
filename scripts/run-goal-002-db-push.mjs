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

const authorization =
  "fhadiwkdznhuxtlgrwfd:20260713073853";
if (
  productionRun &&
  process.env.GOAL002_PRODUCTION_AUTHORIZED !== authorization
) {
  console.error(
    "Refusing production db push without the exact GOAL-002 authorization marker."
  );
  process.exit(2);
}

const softTimeoutMs = timeoutSelfTest ? 250 : selfTest ? 2_000 : 125_000;
const hardTimeoutMs = timeoutSelfTest ? 350 : selfTest ? 7_000 : 130_000;
const command = selfTest || timeoutSelfTest ? process.execPath : "supabase";
const commandArgs = selfTest
  ? ["-e", "process.exit(0)"]
  : timeoutSelfTest
    ? [
        "-e",
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
      ]
  : ["db", "push", "--linked", ...(dryRun ? ["--dry-run"] : [])];

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    PGAPPNAME: "goal002_migration_20260713073853"
  }
});

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
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  clearTimeout(softTimeout);
  clearTimeout(hardTimeout);
  if (timedOut) {
    process.exitCode = 124;
    return;
  }
  if (signal) {
    console.error(`Database push terminated by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
