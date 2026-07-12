#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [planPath, dryRunPath] = process.argv.slice(2);
if (!planPath || !dryRunPath) {
  console.error("Usage: validate-goal-005-dry-run.mjs <plan.json> <dry-run-output.txt>");
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const output = readFileSync(dryRunPath, "utf8");
const migrationPattern = /\b(\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql)\b/g;
const proposed = [...new Set([...output.matchAll(migrationPattern)].map((match) => match[1]))];
const expected = plan.prospectiveMigrations;

if (!Array.isArray(expected) || expected.length === 0) {
  console.error("Refusing bootstrap: canonical plan has no prospective migrations.");
  process.exit(1);
}
if (JSON.stringify(proposed) !== JSON.stringify(expected)) {
  console.error("Refusing bootstrap: dry-run migrations differ from the canonical prospective chain.");
  console.error(`Expected: ${expected.join(", ")}`);
  console.error(`Proposed: ${proposed.join(", ") || "none"}`);
  process.exit(1);
}

console.log(`Dry-run matches canonical prospective chain (${expected.length} migration(s)).`);
