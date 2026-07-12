#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validation = execFileSync(process.execPath, [join(root, "scripts/validate-supabase-migration-history.mjs")], {
  cwd: root,
  encoding: "utf8"
});
process.stderr.write(validation);

const localOnlyVersion = "20260712120000";
const versions = readdirSync(join(root, "supabase/migrations"))
  .map((file) => file.match(/^(\d{14})_.+\.sql$/))
  .filter(Boolean)
  .map((match) => match[1])
  .filter((version) => version !== localOnlyVersion)
  .sort();

const versionSetSha256 = createHash("sha256").update(`${versions.join("\n")}\n`).digest("hex");
console.log(JSON.stringify({
  mode: "plan-only",
  baseline: "supabase/baselines/20260712-production-public-schema.sql",
  ledgerRepairTarget: "isolated bootstrap database only",
  historyVersions: versions,
  historyVersionCount: versions.length,
  historyVersionSetSha256: versionSetSha256,
  onlyPostBootstrapMigration: "20260712120000_secure_claim_review_analyze_jobs.sql",
  productionWarning: "This plan must never be used with production migration repair."
}, null, 2));
