#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bootstrap = join(root, "scripts/bootstrap-goal-005-canonical.sh");
const dryRunValidator = join(root, "scripts/validate-goal-005-dry-run.mjs");
const temporaryRoot = mkdtempSync(join(tmpdir(), "goal-005-bootstrap-guards-"));
const bin = join(temporaryRoot, "bin");
const logPath = join(temporaryRoot, "commands.log");
let passed = 0;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function writeExecutable(path, content) {
  writeFileSync(path, content, "utf8");
  chmodSync(path, 0o755);
}

function resetLog() {
  writeFileSync(logPath, "", "utf8");
}

function logLines() {
  return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
}

function runBootstrap({ target = "isolated", url, psqlPublic = "0", psqlLedgerTable = "0", psqlLedgerEntries = "0" } = {}) {
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    STUB_LOG: logPath,
    GOAL5_BOOTSTRAP_DATABASE_URL_ENV: "GOAL5_TEST_DATABASE_URL",
    PSQL_PUBLIC_COUNT: psqlPublic,
    PSQL_LEDGER_TABLE_COUNT: psqlLedgerTable,
    PSQL_LEDGER_ENTRY_COUNT: psqlLedgerEntries
  };
  if (target !== null) env.GOAL5_BOOTSTRAP_TARGET = target;
  else delete env.GOAL5_BOOTSTRAP_TARGET;
  if (url !== undefined) env.GOAL5_TEST_DATABASE_URL = url;
  else delete env.GOAL5_TEST_DATABASE_URL;
  return spawnSync("bash", [bootstrap], { cwd: root, env, encoding: "utf8" });
}

function runDryRunValidator(plan, output) {
  const planPath = join(temporaryRoot, `plan-${Math.random().toString(16).slice(2)}.json`);
  const outputPath = join(temporaryRoot, `dry-run-${Math.random().toString(16).slice(2)}.txt`);
  writeFileSync(planPath, JSON.stringify(plan), "utf8");
  writeFileSync(outputPath, output, "utf8");
  return spawnSync(process.execPath, [dryRunValidator, planPath, outputPath], {
    cwd: root,
    encoding: "utf8"
  });
}

function check(name, test) {
  try {
    test();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`not ok ${passed + 1} - ${name}`);
    throw error;
  }
}

try {
  mkdirSync(bin);
  writeExecutable(
    join(bin, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "scripts/plan-goal-005-canonical-bootstrap.mjs" ]]; then
  printf '%s\\n' '{"baselineLedgerVersions":["20260201000000"],"prospectiveMigrations":["20260712120000_secure_claim_review_analyze_jobs.sql"]}'
  exit 0
fi
exec ${shellQuote(process.execPath)} "$@"
`
  );
  writeExecutable(
    join(bin, "psql"),
    `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"schemaname = 'public'"*)
    printf '%s\\n' psql-public >>"$STUB_LOG"
    printf '%s\\n' "$PSQL_PUBLIC_COUNT"
    ;;
  *"tablename = 'schema_migrations'"*)
    printf '%s\\n' psql-ledger-table >>"$STUB_LOG"
    printf '%s\\n' "$PSQL_LEDGER_TABLE_COUNT"
    ;;
  *"select count(*) from supabase_migrations.schema_migrations"*)
    printf '%s\\n' psql-ledger-entries >>"$STUB_LOG"
    printf '%s\\n' "$PSQL_LEDGER_ENTRY_COUNT"
    ;;
  *" -f "*)
    printf '%s\\n' psql-baseline-write >>"$STUB_LOG"
    ;;
  *)
    printf '%s\\n' psql-other >>"$STUB_LOG"
    ;;
esac
`
  );
  writeExecutable(
    join(bin, "supabase"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' supabase-invoked >>"$STUB_LOG"
exit 99
`
  );

  check("missing isolated target marker fails before any database command", () => {
    resetLog();
    const result = runBootstrap({ target: null, url: "postgresql://localhost/test" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /set GOAL5_BOOTSTRAP_TARGET=isolated/);
    assert.deepEqual(logLines(), []);
  });

  check("production project reference fails before psql", () => {
    resetLog();
    const result = runBootstrap({ url: "postgresql://localhost/fhadiwkdznhuxtlgrwfd" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /production project reference detected/);
    assert.deepEqual(logLines(), []);
  });

  check("non-loopback database URL fails before psql", () => {
    resetLog();
    const result = runBootstrap({ url: "postgresql://db.example.invalid/bootstrap" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /restricted to a loopback database/);
    assert.deepEqual(logLines(), []);
  });

  check("nonempty public schema fails before baseline or Supabase CLI", () => {
    resetLog();
    const result = runBootstrap({ url: "postgresql://127.0.0.1/bootstrap", psqlPublic: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /target has public tables/);
    assert.deepEqual(logLines(), ["psql-public"]);
  });

  check("nonempty migration ledger fails before baseline or repair", () => {
    resetLog();
    const result = runBootstrap({
      url: "postgresql://localhost/bootstrap",
      psqlLedgerTable: "1",
      psqlLedgerEntries: "1"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migration ledger is not empty/);
    assert.deepEqual(logLines(), ["psql-public", "psql-ledger-table", "psql-ledger-entries"]);
  });

  const prospective = [
    "20260712120000_secure_claim_review_analyze_jobs.sql",
    "20260713120000_followup_guard.sql"
  ];
  const plan = { prospectiveMigrations: prospective };

  check("dry-run validator accepts the exact prospective chain", () => {
    const result = runDryRunValidator(plan, `Would push:\n${prospective.join("\n")}\n`);
    assert.equal(result.status, 0, result.stderr);
  });

  check("dry-run validator rejects an extra migration", () => {
    const result = runDryRunValidator(plan, `Would push:\n${prospective.join("\n")}\n20260714120000_unexpected.sql\n`);
    assert.notEqual(result.status, 0);
  });

  check("dry-run validator rejects a missing migration", () => {
    const result = runDryRunValidator(plan, `Would push:\n${prospective[0]}\n`);
    assert.notEqual(result.status, 0);
  });

  check("dry-run validator rejects migrations in a different order", () => {
    const result = runDryRunValidator(plan, `Would push:\n${prospective.toReversed().join("\n")}\n`);
    assert.notEqual(result.status, 0);
  });

  check("bootstrap is portable Bash syntax without mapfile", () => {
    const source = readFileSync(bootstrap, "utf8");
    assert.doesNotMatch(source, /\bmapfile\b/);
    const result = spawnSync("bash", ["-n", bootstrap], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  });

  console.log(`GOAL-005 bootstrap guardrails: ${passed}/${passed} checks passed.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
