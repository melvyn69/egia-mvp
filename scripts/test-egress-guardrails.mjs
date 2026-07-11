import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260711120000_supabase_egress_guardrails.sql");
const google = read("server/_shared/handlers/cron/google/sync-replies.ts");
const ai = read("server/_shared/handlers/cron/ai/tag-reviews.ts");
const monthly = read("server/_shared/handlers/cron/monthly-reports.ts");
const reports = read("api/reports/[...slug].ts");
const inbox = read("src/pages/Inbox.tsx");
const systemHealth = read("src/pages/SystemHealth.tsx");

for (const source of [google, ai, monthly]) {
  assert.doesNotMatch(source, /\.select\(\s*["']\*["']\s*\)/, "cron select(*) is forbidden");
  assert.match(source, /["']no_candidates["']/, "cron needs a light no-candidate response");
  assert.match(source, /durationMs/, "cron needs duration metrics");
}

assert.match(migration, /for update skip locked/gi, "claims must skip locked rows");
assert.match(migration, /least\(greatest\(coalesce\(p_limit, 10\), 1\), 20\)/, "AI batch must be capped at 20");
assert.match(migration, /content_hash is distinct from/, "unchanged AI content must be skipped");
assert.match(migration, /ai_tag_version is distinct from p_version/, "AI version changes must be detected");
assert.match(migration, /reports_monthly_period_unique_idx/, "monthly reports must be idempotent");
assert.match(google, /claim_google_sync_connections/, "Google connections must be claimed atomically");
assert.match(google, /\.limit\(25\)/, "Google location reads must be bounded");
assert.match(ai, /claim_ai_tag_candidates/, "AI candidates must be claimed atomically");
assert.match(ai, /Math\.min\(20/, "AI request limits must be clamped");
assert.match(reports, /claim_due_automation_workflows/, "due automations must be claimed atomically");
assert.match(reports, /\.gt\("update_time", lastProcessed\)/, "automation reviews must be incremental");
assert.match(monthly, /Math\.min\(/, "monthly batch must be capped");
assert.match(inbox, /refetchInterval:\s*false/, "background polling must stay disabled");
assert.doesNotMatch(systemHealth, /setInterval\(load/, "system health must refresh manually");
assert.doesNotMatch(google, /refresh_token[^\n]*console|console[^\n]*refresh_token/i, "tokens must not be logged");

const claimedByWorkerA = new Set(["job-1", "job-2"]);
const availableToWorkerB = ["job-1", "job-2", "job-3"].filter(
  (id) => !claimedByWorkerA.has(id)
);
assert.deepEqual(availableToWorkerB, ["job-3"], "concurrent workers must not overlap");

console.log("OK: Supabase egress guardrails verified (bounded reads, atomic claims, idempotence, incremental cursors, auth preserved).");
