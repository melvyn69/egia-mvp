#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validatorRelativePath = "scripts/validate-supabase-migration-history.mjs";
const planRelativePath = "scripts/plan-goal-005-canonical-bootstrap.mjs";
const migrationsRelativePath = "supabase/migrations";
const manifestRelativePath = "supabase/migration-history/canonical-manifest.json";
const baselineRelativePath = "supabase/baselines/20260712-production-public-schema.sql";
const trustedGuardRelativePaths = [
  ".github/workflows/migration-history-guard.yml",
  "scripts/bootstrap-goal-005-canonical.sh",
  planRelativePath,
  "scripts/validate-goal-005-dry-run.mjs",
  validatorRelativePath,
  manifestRelativePath,
  "supabase/migration-history/guard-lock.json"
];
const goal003Migration = "20260712120000_secure_claim_review_analyze_jobs.sql";
const validFutureMigration = "20260713000000_future_valid.sql";
const frozenMigration = "20260219120000_ai_run_history_rls.sql";
const gitIdentity = {
  ...process.env,
  GIT_AUTHOR_NAME: "GOAL-005 adversarial test",
  GIT_AUTHOR_EMAIL: "goal-005-test@example.invalid",
  GIT_COMMITTER_NAME: "GOAL-005 adversarial test",
  GIT_COMMITTER_EMAIL: "goal-005-test@example.invalid"
};
const temporaryRoot = mkdtempSync(join(tmpdir(), "egia-goal-005-validator-"));
const seedRoot = join(temporaryRoot, "seed");
let checks = 0;

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitIdentity,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  }).trim();
}

function commitAll(cwd, message) {
  git(cwd, ["add", "--all"]);
  git(cwd, ["commit", "--quiet", "--message", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function migrationPath(cwd, filename) {
  return join(cwd, migrationsRelativePath, filename);
}

function writeMigration(cwd, filename, sql = "select 1;\n") {
  writeFileSync(migrationPath(cwd, filename), sql, "utf8");
}

function cloneCase(name) {
  const destination = join(temporaryRoot, name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase());
  execFileSync("git", ["clone", "--quiet", "--shared", seedRoot, destination], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return destination;
}

function runValidator(cwd, base) {
  const args = [join(cwd, validatorRelativePath), "--root", cwd];
  if (base) args.push("--base", base);
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: process.env
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function assertValidatorPass(label, cwd, base) {
  const result = runValidator(cwd, base);
  if (result.status !== 0) {
    throw new Error(`${label}: expected success, got ${result.status}\n${combinedOutput(result)}`);
  }
  checks += 1;
  console.log(`ok ${checks} - ${label}`);
}

function assertValidatorFails(label, cwd, base, evidence) {
  const result = runValidator(cwd, base);
  const output = combinedOutput(result);
  if (result.status === 0) {
    throw new Error(`${label}: validator unexpectedly accepted the adversarial state`);
  }
  if (evidence && !evidence.test(output)) {
    throw new Error(`${label}: failure did not identify the intended guard\n${output}`);
  }
  checks += 1;
  console.log(`ok ${checks} - ${label}`);
}

function prepareFutureInBase(name, filename = "20260714000000_base_future.sql") {
  const cwd = cloneCase(name);
  const originalBase = git(cwd, ["rev-parse", "HEAD"]);
  writeMigration(cwd, filename);
  const futureBase = commitAll(cwd, `test: add ${filename}`);
  assertValidatorPass(`${name} precondition`, cwd, originalBase);
  return { cwd, futureBase, filename };
}

function parsePlan(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label}: plan did not emit JSON (${error.message})\n${stdout}`);
  }
}

try {
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, seedRoot], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (const relativePath of trustedGuardRelativePaths) {
    const source = join(root, relativePath);
    if (!existsSync(source)) continue;
    const destination = join(seedRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  if (git(seedRoot, ["status", "--porcelain"])) {
    commitAll(seedRoot, "test: use current GOAL-005 validation scripts");
  }

  {
    const cwd = cloneCase("current-state");
    assertValidatorPass("current repository state", cwd);
  }

  {
    const cwd = cloneCase("valid-future");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    writeMigration(cwd, validFutureMigration);
    commitAll(cwd, "test: add valid future migration");
    assertValidatorPass("valid prospective migration", cwd, base);
  }

  {
    const cwd = cloneCase("valid-sql-comment-markers");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    writeMigration(
      cwd,
      "20260713001000_valid_comment_markers.sql",
      "select '-- string, not a comment', '/* string, not a comment */', $body$-- dollar-quoted text\n/* still text */$body$;\n"
    );
    commitAll(cwd, "test: add valid SQL with comment markers in literals");
    assertValidatorPass("valid SQL preserves string and dollar-quote content", cwd, base);
  }

  {
    const cwd = cloneCase("untracked-future");
    writeMigration(cwd, "20260713002000_untracked.sql");
    assertValidatorFails("untracked prospective migration", cwd, undefined, /Migration is not tracked by Git/);
  }

  {
    const cwd = cloneCase("duplicate-version");
    writeMigration(cwd, "20260713010000_first.sql");
    writeMigration(cwd, "20260713010000_second.sql");
    assertValidatorFails("duplicate migration version", cwd, undefined, /Duplicate migration version 20260713010000/);
  }

  {
    const cwd = cloneCase("reused-name");
    writeMigration(cwd, "20260713020000_secure_claim_review_analyze_jobs.sql");
    assertValidatorFails("unexpected reused migration name", cwd, undefined, /Unexpected reused migration name secure_claim_review_analyze_jobs/);
  }

  {
    const cwd = cloneCase("comment-only");
    writeMigration(cwd, "20260713030000_comment_only.sql", " \n-- no SQL here\n/* still no SQL */\n\t");
    assertValidatorFails("whitespace and comment-only migration", cwd, undefined, /comment-only|substantive SQL|executable SQL|Empty migration/i);
  }

  for (const [label, filename] of [
    ["uppercase SQL extension", "20260713040000_uppercase.SQL"],
    ["Unicode timestamp", `${"２".repeat(14)}_unicode.sql`],
    ["space instead of underscore", "20260713050000 invalid.sql"]
  ]) {
    const cwd = cloneCase(label);
    writeFileSync(join(cwd, migrationsRelativePath, filename), "select 1;\n", "utf8");
    assertValidatorFails(`invalid filename: ${label}`, cwd, undefined, /Invalid migration filename/);
  }

  {
    const cwd = cloneCase("symlink-entry");
    const target = join(cwd, "symlink-target.sql");
    writeFileSync(target, "select 1;\n", "utf8");
    symlinkSync(target, migrationPath(cwd, "20260713060000_symlink.sql"));
    assertValidatorFails("symbolic-link migration entry", cwd, undefined, /regular file|symbolic link|symlink/i);
  }

  {
    const cwd = cloneCase("directory-entry");
    mkdirSync(migrationPath(cwd, "20260713070000_directory.sql"));
    assertValidatorFails("directory masquerading as migration", cwd, undefined, /regular file|directory/i);
  }

  {
    const cwd = cloneCase("frozen-edit");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    writeFileSync(migrationPath(cwd, frozenMigration), "-- altered\n", "utf8");
    commitAll(cwd, "test: alter frozen migration");
    assertValidatorFails("frozen migration edit", cwd, base, /Frozen migration content changed|PR changes a frozen migration/);
  }

  {
    const cwd = cloneCase("frozen-delete");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    unlinkSync(migrationPath(cwd, frozenMigration));
    commitAll(cwd, "test: delete frozen migration");
    assertValidatorFails("frozen migration deletion", cwd, base, /Frozen migration removed|PR changes a frozen migration/);
  }

  {
    const cwd = cloneCase("frozen-rename");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    renameSync(
      migrationPath(cwd, frozenMigration),
      migrationPath(cwd, "20260219120000_ai_run_history_rls_renamed.sql")
    );
    commitAll(cwd, "test: rename frozen migration");
    assertValidatorFails("frozen migration rename", cwd, base, /Frozen migration removed|PR changes a frozen migration/);
  }

  {
    const { cwd, futureBase, filename } = prepareFutureInBase("future-base-edit");
    writeMigration(cwd, filename, "select 2;\n");
    commitAll(cwd, "test: alter migration present in base");
    assertValidatorFails("edit of future migration already in base", cwd, futureBase, new RegExp(filename));
  }

  {
    const { cwd, futureBase, filename } = prepareFutureInBase("future-base-delete");
    unlinkSync(migrationPath(cwd, filename));
    commitAll(cwd, "test: delete migration present in base");
    assertValidatorFails("deletion of future migration already in base", cwd, futureBase, new RegExp(filename));
  }

  {
    const { cwd, futureBase, filename } = prepareFutureInBase("future-base-rename");
    renameSync(migrationPath(cwd, filename), migrationPath(cwd, "20260714000001_base_future_renamed.sql"));
    commitAll(cwd, "test: rename migration present in base");
    assertValidatorFails("rename of future migration already in base", cwd, futureBase, new RegExp(filename));
  }

  {
    const { cwd, futureBase } = prepareFutureInBase("backdated-addition", "20260715000000_base_max.sql");
    writeMigration(cwd, "20260714000000_backdated.sql");
    commitAll(cwd, "test: add backdated migration");
    assertValidatorFails("backdated version below base maximum", cwd, futureBase, /backdated|not strictly newer|base maximum/i);
  }

  {
    const cwd = cloneCase("manifest-change");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    const manifestPath = join(cwd, manifestRelativePath);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.capturedAt = "2099-01-01";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    commitAll(cwd, "test: alter canonical manifest");
    assertValidatorFails("canonical manifest change", cwd, base, /trusted migration guard|immutable canonical migration manifest|immutable GOAL-005 truth set/i);
  }

  {
    const cwd = cloneCase("validator-change");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    const validatorPath = join(cwd, validatorRelativePath);
    writeFileSync(validatorPath, `${readFileSync(validatorPath, "utf8")}\n// adversarial change\n`, "utf8");
    commitAll(cwd, "test: alter trusted validator");
    assertValidatorFails("trusted validator self-change", cwd, base, /PR changes a trusted migration guard/);
  }

  {
    const cwd = cloneCase("guard-workflow-change");
    const base = git(cwd, ["rev-parse", "HEAD"]);
    const workflowPath = join(cwd, ".github/workflows/migration-history-guard.yml");
    if (!existsSync(workflowPath)) throw new Error("guard workflow fixture is missing from the seed clone");
    writeFileSync(workflowPath, `${readFileSync(workflowPath, "utf8")}\n# adversarial change\n`, "utf8");
    commitAll(cwd, "test: alter trusted guard workflow");
    assertValidatorFails("trusted guard workflow change", cwd, base, /PR changes a trusted migration guard/);
  }

  {
    const cwd = cloneCase("baseline-change");
    const baselinePath = join(cwd, baselineRelativePath);
    writeFileSync(baselinePath, `${readFileSync(baselinePath, "utf8")}\n-- altered\n`, "utf8");
    assertValidatorFails("baseline checksum change", cwd, undefined, /Baseline checksum mismatch/);
  }

  {
    const cwd = cloneCase("baseline-data");
    const baselinePath = join(cwd, baselineRelativePath);
    writeFileSync(baselinePath, `${readFileSync(baselinePath, "utf8")}\nCOPY public.users FROM stdin;\n`, "utf8");
    assertValidatorFails("baseline data export", cwd, undefined, /Baseline contains exported public-schema rows/);
  }

  {
    const cwd = cloneCase("prospective-plan");
    writeMigration(cwd, validFutureMigration);
    commitAll(cwd, "test: add future migration to prospective plan");
    const result = spawnSync(process.execPath, [join(root, planRelativePath), "--root", cwd], {
      cwd: root,
      encoding: "utf8",
      env: process.env
    });
    if (result.status !== 0) {
      throw new Error(`prospective plan: expected success, got ${result.status}\n${combinedOutput(result)}`);
    }
    const plan = parsePlan(result.stdout, "prospective plan");
    const expected = [goal003Migration, validFutureMigration];
    if (plan.baselineLedgerVersionCount !== 97 || JSON.stringify(plan.prospectiveMigrations) !== JSON.stringify(expected)) {
      throw new Error(`prospective plan: unexpected ledger/prospective set\n${result.stdout}`);
    }
    checks += 1;
    console.log(`ok ${checks} - prospective plan includes GOAL-003 then valid future migration`);
  }

  console.log(`GOAL-005 adversarial migration-history tests passed: ${checks}/${checks}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
