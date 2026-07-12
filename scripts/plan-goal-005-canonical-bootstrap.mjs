#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = rootFlag >= 0 ? resolve(args[rootFlag + 1]) : scriptRoot;
const validation = execFileSync(process.execPath, [join(scriptRoot, "scripts/validate-supabase-migration-history.mjs"), "--root", root], {
  cwd: root,
  encoding: "utf8"
});
process.stderr.write(validation);

const firstProspectiveVersion = "20260712120000";
const migrations = readdirSync(join(root, "supabase/migrations"))
  .map((file) => ({ file, match: file.match(/^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/) }))
  .filter(({ match }) => match)
  .map(({ file, match }) => ({ file, version: match[1] }))
  .sort((left, right) => left.version.localeCompare(right.version));
const baselineLedgerVersions = migrations
  .map(({ version }) => version)
  .filter((version) => version < firstProspectiveVersion)
  .sort();
const prospectiveMigrations = migrations
  .filter(({ version }) => version >= firstProspectiveVersion)
  .map(({ file }) => file);

if (prospectiveMigrations[0] !== "20260712120000_secure_claim_review_analyze_jobs.sql") {
  throw new Error("Canonical prospective chain must start with the immutable GOAL-003 migration");
}

const versionSetSha256 = createHash("sha256").update(`${baselineLedgerVersions.join("\n")}\n`).digest("hex");
console.log(JSON.stringify({
  mode: "plan-only",
  baseline: "supabase/baselines/20260712-production-public-schema.sql",
  ledgerRepairTarget: "isolated bootstrap database only",
  baselineLedgerVersions,
  baselineLedgerVersionCount: baselineLedgerVersions.length,
  baselineLedgerVersionSetSha256: versionSetSha256,
  prospectiveMigrations,
  prospectiveMigrationCount: prospectiveMigrations.length,
  productionWarning: "This plan must never be used with production migration repair."
}, null, 2));
