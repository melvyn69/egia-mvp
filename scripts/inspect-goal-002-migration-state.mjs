import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

export const classifyMigrationState = (evidence) => {
  if (evidence.active_sessions > 0) return "ACTIVE";
  if (
    evidence.ledger_count === 1 &&
    evidence.prospective_present === evidence.prospective_expected &&
    evidence.hardening_passed === evidence.hardening_expected
  ) {
    return "COMMITTED";
  }
  if (
    evidence.ledger_count === 0 &&
    evidence.prospective_present === 0 &&
    typeof evidence.baseline_hardening_vector === "string" &&
    evidence.hardening_vector === evidence.baseline_hardening_vector
  ) {
    return "ROLLED_BACK";
  }
  return "INCONSISTENT";
};

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--self-test") {
  const complete = {
    active_sessions: 0,
    ledger_count: 1,
    prospective_present: 10,
    prospective_expected: 10,
    hardening_passed: 8,
    hardening_expected: 8,
    hardening_vector: "11111111",
    baseline_hardening_vector: "01000000"
  };
  assert.equal(
    classifyMigrationState({ ...complete, active_sessions: 1 }),
    "ACTIVE"
  );
  assert.equal(classifyMigrationState(complete), "COMMITTED");
  assert.equal(
    classifyMigrationState({
      ...complete,
      ledger_count: 0,
      prospective_present: 0,
      hardening_passed: 1,
      hardening_vector: "01000000"
    }),
    "ROLLED_BACK"
  );
  assert.equal(
    classifyMigrationState({
      ...complete,
      ledger_count: 0,
      prospective_present: 0,
      hardening_passed: 2,
      hardening_vector: "01100000"
    }),
    "INCONSISTENT"
  );
  assert.equal(
    classifyMigrationState({
      ...complete,
      hardening_passed: 7,
      hardening_vector: "11111110"
    }),
    "INCONSISTENT"
  );
  console.log("GOAL-002 migration-state classification self-test passed.");
  process.exit(0);
}

const captureBaseline =
  args.length === 1 && args[0] === "--capture-baseline";
if (args.length !== 0 && !captureBaseline) {
  console.error(
    "Usage: inspect-goal-002-migration-state.mjs [--capture-baseline|--self-test]"
  );
  process.exit(2);
}

const authorization = "fhadiwkdznhuxtlgrwfd:20260713073853";
if (
  process.env.GOAL002_INSPECTION_AUTHORIZED !== authorization ||
  !process.env.SUPABASE_DB_URL
) {
  console.error(
    "Refusing inspection without the exact marker and SUPABASE_DB_URL."
  );
  process.exit(2);
}

const hardStop = setTimeout(() => {
  console.error("GOAL-002 passive migration inspection exceeded 45 seconds.");
  process.exit(5);
}, 45_000);

const sql = readFileSync(
  new URL("./inspect-goal-002-migration-state.sql", import.meta.url),
  "utf8"
);
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  application_name: "goal002_state_inspector",
  connectionTimeoutMillis: 10_000,
  query_timeout: 30_000,
  statement_timeout: 30_000
});

let evidence;
try {
  await client.connect();
  const result = await client.query(sql);
  const rawEvidence = result.rows[0].json_build_object;
  evidence =
    typeof rawEvidence === "string" ? JSON.parse(rawEvidence) : rawEvidence;
} catch (error) {
  console.error(`Passive migration inspection failed: ${error.message}`);
  process.exitCode = 5;
} finally {
  await client.end().catch(() => {});
  clearTimeout(hardStop);
}

if (!evidence) process.exit(5);

evidence.baseline_hardening_vector =
  process.env.GOAL002_BASELINE_HARDENING_VECTOR;
const classification = captureBaseline
  ? evidence.active_sessions === 0 &&
    evidence.ledger_count === 0 &&
    evidence.prospective_present === 0
    ? "BASELINE"
    : "INCONSISTENT"
  : classifyMigrationState(evidence);
console.log(JSON.stringify({ classification, ...evidence }));
process.exitCode =
  classification === "BASELINE" ||
  classification === "COMMITTED" ||
  classification === "ROLLED_BACK"
    ? 0
    : classification === "ACTIVE"
      ? 3
      : 4;
