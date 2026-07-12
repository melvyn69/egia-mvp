#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = rootFlag >= 0 ? resolve(args[rootFlag + 1]) : scriptRoot;
const manifestPath = join(root, "supabase/migration-history/canonical-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const IMMUTABLE = {
  legacyDirectory: "supabase/migrations",
  anchorCommit: "6f05626c7edb77b375281f0e316659478a790dec",
  frozenThroughVersion: "20260712120000",
  baseline: {
    path: "supabase/baselines/20260712-production-public-schema.sql",
    sha256: "d2fb33345efcb5ed28e999c93fcf99a19cbd0a313d33be56e76ac11d7a1592d0"
  },
  allowedEmptyVersions: ["20260106115555", "20260106120512", "20260116113628"],
  allowedReusedNames: {
    google_reviews_add_raw_jsonb: ["20260106114914", "20260106115555"],
    business_settings_monthly_report_enabled: ["20260214100000", "20260219141000"],
    remote_schema: ["20260215220147", "20260215223247"],
    review_replies_unified: ["20260216093653", "20260220155000"]
  },
  admittedFrozenFiles: [
    ["supabase/migrations/20260215220147_remote_schema.sql", "2799491d63aa560c6c181950b3731913b97e085036c97705d8bbfc243faa7e4e"],
    ["supabase/migrations/20260215223247_remote_schema.sql", "2799491d63aa560c6c181950b3731913b97e085036c97705d8bbfc243faa7e4e"]
  ],
  collisions: [
    ["20260219120000", "ai_run_history_rls", "automation_rules_schema", "supabase/migrations/20260219120000_ai_run_history_rls.sql", "db558bb724c54d7e4b648fee00df61b2f0d23ae8ba1d8ec83af9b7bf1f27eb72", "non determinable"],
    ["20260219123000", "automation_rules_schema", "fix_cron_state_rls", "supabase/migrations/20260219123000_automation_rules_schema.sql", "c15a92f7d667f6bf8e93995b27f9e6b000d5c6e58eacaef9476c07d0aff526d4", "non determinable"],
    ["20260219130000", "ai_jobs_queue", "drop_alerts_unique_rule_per_review", "supabase/migrations/20260219130000_ai_jobs_queue.sql", "50733ccc4603c21f0378305f9d30b3f54f787f3e663e2a1b78af2aee3679f42e", "ambiguë"],
    ["20260219133000", "drop_alerts_unique_rule_per_review", "user_roles_is_admin", "supabase/migrations/20260219133000_drop_alerts_unique_rule_per_review.sql", "f94a5f52e6fdee93579e4834db8456060166766f73695f7e665fa1f6c0affab2", "ambiguë"],
    ["20260221193000", "remote_history_placeholder", "fix_rpc_ai_jobs_user_filter", "supabase/migrations/20260221193000_remote_history_placeholder.sql", "3d96840638c706033e4c6e4a6e0b1bfd44843fe6b9b3a1e5db959487dc0b4e0c", "non determinable"]
  ],
  localOnly: ["20260712120000", "secure_claim_review_analyze_jobs", "supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql", "a0cefdffdd4283d92f7a0e5b331f10c8474807a29824c5e0a77869e4ef55b491"]
};
const EXPECTED_BOOTSTRAP_LEDGER_COUNT = 97;
const EXPECTED_BOOTSTRAP_LEDGER_SHA256 = "621e061b770369d578344a2d7e9bbd1825ee275bd2065a87834cc94ffde27d39";
const migrationDir = join(root, IMMUTABLE.legacyDirectory);
const migrationPattern = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const errors = [];
const TRUSTED_GUARD_LOCK_PATH = "supabase/migration-history/guard-lock.json";
const TRUSTED_GUARD_PATHS = [
  ".github/CODEOWNERS",
  ".github/workflows/migration-history-guard.yml",
  "scripts/bootstrap-goal-005-canonical.sh",
  "scripts/plan-goal-005-canonical-bootstrap.mjs",
  "scripts/validate-goal-005-dry-run.mjs",
  "scripts/validate-supabase-migration-history.mjs",
  TRUSTED_GUARD_LOCK_PATH,
  "supabase/migration-history/canonical-manifest.json"
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function containsSqlToken(value) {
  const text = value.replace(/^\uFEFF/, "");
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (/\s/.test(char) || char === ";") {
      index += 1;
      continue;
    }
    if (char === "-" && next === "-") {
      index += 2;
      while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < text.length && depth > 0) {
        if (text[index] === "/" && text[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (text[index] === "*" && text[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      continue;
    }
    return true;
  }
  return false;
}

const manifestCollisions = manifest.versionCollisions.map(({ version, localName, remoteName, localPath, localSha256, attribution }) =>
  [version, localName, remoteName, localPath, localSha256, attribution]
);
const manifestLocalOnly = [manifest.localOnly.version, manifest.localOnly.name, manifest.localOnly.path, manifest.localOnly.sha256];
const manifestAdmitted = (manifest.admittedFrozenFiles ?? []).map(({ path, sha256 }) => [path, sha256]);
if (manifest.legacyLedger.directory !== IMMUTABLE.legacyDirectory ||
    manifest.legacyLedger.anchorCommit !== IMMUTABLE.anchorCommit ||
    manifest.legacyLedger.frozenThroughVersion !== IMMUTABLE.frozenThroughVersion ||
    manifest.baseline.path !== IMMUTABLE.baseline.path ||
    manifest.baseline.sha256 !== IMMUTABLE.baseline.sha256 ||
    !sameJson(manifest.allowedEmptyVersions, IMMUTABLE.allowedEmptyVersions) ||
    !sameJson(manifest.allowedReusedNames, IMMUTABLE.allowedReusedNames) ||
    !sameJson(manifestAdmitted, IMMUTABLE.admittedFrozenFiles) ||
    !sameJson(manifestCollisions, IMMUTABLE.collisions) ||
    !sameJson(manifestLocalOnly, IMMUTABLE.localOnly)) {
  errors.push("Canonical manifest conflicts with the immutable GOAL-005 truth set");
}

function gitBuffer(argsForGit) {
  try {
    return execFileSync("git", argsForGit, { cwd: root, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    errors.push(`Git Evidence unavailable: ${message}`);
    return null;
  }
}

function gitFileExists(ref, path) {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const entries = readdirSync(migrationDir, { withFileTypes: true })
  .filter(({ name }) => name.toLowerCase().endsWith(".sql"))
  .sort((left, right) => left.name.localeCompare(right.name));
const migrations = [];

for (const entry of entries) {
  const file = entry.name;
  const match = file.match(migrationPattern);
  if (!match) {
    errors.push(`Invalid migration filename: ${file}`);
    continue;
  }
  const path = join(migrationDir, file);
  const metadata = lstatSync(path);
  if (!entry.isFile() || !metadata.isFile() || metadata.isSymbolicLink()) {
    errors.push(`Migration path is not a regular file: ${file}`);
    continue;
  }
  migrations.push({
    file,
    path,
    relativePath: relative(root, path).replaceAll("\\", "/"),
    version: match[1],
    name: match[2],
    bytes: metadata.size,
    sha256: sha256(readFileSync(path))
  });
}

const trackedBuffer = gitBuffer(["ls-files", "--", IMMUTABLE.legacyDirectory]);
if (trackedBuffer) {
  const tracked = new Set(trackedBuffer.toString().trim().split("\n").filter((path) => path.endsWith(".sql")));
  for (const migration of migrations) {
    if (!tracked.has(migration.relativePath)) errors.push(`Migration is not tracked by Git: ${migration.relativePath}`);
  }
  for (const trackedPath of tracked) {
    if (!existsSync(join(root, trackedPath))) errors.push(`Tracked migration is missing from the working tree: ${trackedPath}`);
  }
}

const byVersion = new Map();
const byName = new Map();
for (const migration of migrations) {
  byVersion.set(migration.version, [...(byVersion.get(migration.version) ?? []), migration]);
  byName.set(migration.name, [...(byName.get(migration.name) ?? []), migration]);
}

for (const [version, entries] of byVersion) {
  if (entries.length > 1) errors.push(`Duplicate migration version ${version}: ${entries.map(({ file }) => file).join(", ")}`);
}

const allowedReusedNames = new Map(
  Object.entries(IMMUTABLE.allowedReusedNames).map(([name, versions]) => [name, [...versions].sort().join(",")])
);
const admittedFrozenFiles = new Map(
  IMMUTABLE.admittedFrozenFiles
);
for (const [name, entries] of byName) {
  if (entries.length < 2) continue;
  const actual = entries.map(({ version }) => version).sort().join(",");
  if (allowedReusedNames.get(name) !== actual) {
    errors.push(`Unexpected reused migration name ${name}: ${actual}`);
  }
}

for (const version of IMMUTABLE.allowedEmptyVersions) {
  const entry = byVersion.get(version)?.[0];
  if (!entry || entry.bytes !== 0) errors.push(`Declared empty migration ${version} is missing or non-empty`);
}
for (const migration of migrations) {
  if (migration.bytes === 0 && !IMMUTABLE.allowedEmptyVersions.includes(migration.version)) {
    errors.push(`Empty migration is not allowlisted: ${migration.file}`);
  }
  if (migration.version > IMMUTABLE.frozenThroughVersion && !containsSqlToken(readFileSync(migration.path, "utf8"))) {
    errors.push(`Prospective migration has no executable SQL: ${migration.file}`);
  }
}

const anchorPathsBuffer = gitBuffer([
  "ls-tree", "-r", "--name-only", `${IMMUTABLE.anchorCommit}:supabase/migrations`
]);
if (anchorPathsBuffer) {
  const anchorPaths = anchorPathsBuffer
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((file) => `${IMMUTABLE.legacyDirectory}/${file}`);
  const anchorSet = new Set(anchorPaths);
  for (const anchorPath of anchorPaths) {
    const currentPath = join(root, anchorPath);
    if (!existsSync(currentPath)) {
      errors.push(`Frozen migration removed: ${anchorPath}`);
      continue;
    }
    const expected = gitBuffer(["show", `${IMMUTABLE.anchorCommit}:${anchorPath}`]);
    if (expected && sha256(expected) !== sha256(readFileSync(currentPath))) {
      errors.push(`Frozen migration content changed: ${anchorPath}`);
    }
  }
  for (const migration of migrations) {
    if (migration.version <= IMMUTABLE.frozenThroughVersion && !anchorSet.has(migration.relativePath)) {
      const expectedHash = admittedFrozenFiles.get(migration.relativePath);
      if (!expectedHash) {
        errors.push(`New or moved migration uses frozen version: ${migration.relativePath}`);
      } else if (expectedHash !== migration.sha256) {
        errors.push(`Admitted frozen placeholder changed: ${migration.relativePath}`);
      }
    }
  }
}

for (const [, , , localPath, localSha256] of IMMUTABLE.collisions) {
  const entry = migrations.find(({ relativePath }) => relativePath === localPath);
  if (!entry) {
    errors.push(`Collision Evidence missing local path: ${localPath}`);
  } else if (entry.sha256 !== localSha256) {
    errors.push(`Collision Evidence hash mismatch: ${localPath}`);
  }
}

const [, , localOnlyPath, localOnlyHash] = IMMUTABLE.localOnly;
const localOnly = migrations.find(({ relativePath }) => relativePath === localOnlyPath);
if (!localOnly || localOnly.sha256 !== localOnlyHash) {
  errors.push(`GOAL-003 local-only migration is missing or changed: ${localOnlyPath}`);
}
const bootstrapLedger = migrations
  .map(({ version }) => version)
  .filter((version) => version < IMMUTABLE.localOnly[0])
  .sort();
const bootstrapLedgerHash = sha256(`${bootstrapLedger.join("\n")}\n`);
if (bootstrapLedger.length !== EXPECTED_BOOTSTRAP_LEDGER_COUNT || bootstrapLedgerHash !== EXPECTED_BOOTSTRAP_LEDGER_SHA256) {
  errors.push("Bootstrap ledger does not match the immutable 97-version remote history set");
}

const baselinePath = join(root, IMMUTABLE.baseline.path);
if (!existsSync(baselinePath)) {
  errors.push(`Baseline missing: ${IMMUTABLE.baseline.path}`);
} else {
  const baseline = readFileSync(baselinePath);
  if (sha256(baseline) !== IMMUTABLE.baseline.sha256) errors.push(`Baseline checksum mismatch: ${IMMUTABLE.baseline.path}`);
  const text = baseline.toString("utf8");
  if (/^-- Data for Name:|^(?:COPY|\\copy)\s+"?public"?\.|^INSERT INTO\s+"?public"?\.|^SELECT pg_catalog\.setval\b/m.test(text)) {
    errors.push(`Baseline contains exported public-schema rows: ${IMMUTABLE.baseline.path}`);
  }
}

const baseFlag = args.indexOf("--base");
if (baseFlag >= 0) {
  const base = args[baseFlag + 1];
  const changed = gitBuffer(["diff", "--name-only", `${base}...HEAD`]);
  const baseMigrationPathsBuffer = gitBuffer(["ls-tree", "-r", "--name-only", `${base}:${IMMUTABLE.legacyDirectory}`]);
  if (baseMigrationPathsBuffer) {
    const baseMigrationPaths = baseMigrationPathsBuffer.toString().trim().split("\n").filter((path) => path.endsWith(".sql"));
    const basePaths = new Set(baseMigrationPaths.map((path) => `${IMMUTABLE.legacyDirectory}/${path}`));
    const baseVersions = baseMigrationPaths
      .map((path) => path.match(migrationPattern)?.[1])
      .filter(Boolean)
      .sort();
    const baseMaxVersion = baseVersions.at(-1);

    for (const basePath of basePaths) {
      const currentPath = join(root, basePath);
      if (!existsSync(currentPath)) {
        errors.push(`Previously committed migration removed or renamed: ${basePath}`);
        continue;
      }
      const metadata = lstatSync(currentPath);
      const expected = gitBuffer(["show", `${base}:${basePath}`]);
      if (!metadata.isFile() || metadata.isSymbolicLink() || (expected && sha256(expected) !== sha256(readFileSync(currentPath)))) {
        errors.push(`Previously committed migration changed: ${basePath}`);
      }
    }

    for (const migration of migrations) {
      if (!basePaths.has(migration.relativePath) && baseMaxVersion && migration.version <= baseMaxVersion) {
        errors.push(`New migration is not newer than base maximum ${baseMaxVersion}: ${migration.file}`);
      }
    }
  }
  if (changed) {
    for (const file of changed.toString().trim().split("\n").filter(Boolean)) {
      const match = file.match(/^supabase\/migrations\/(\d{14})_.+\.sql$/);
      if (match && match[1] <= IMMUTABLE.frozenThroughVersion) {
        const expectedHash = admittedFrozenFiles.get(file);
        const currentPath = join(root, file);
        if (!expectedHash || !existsSync(currentPath) || sha256(readFileSync(currentPath)) !== expectedHash) {
          errors.push(`PR changes a frozen migration: ${file}`);
        }
      }
    }
    if (gitFileExists(base, TRUSTED_GUARD_LOCK_PATH)) {
      for (const trustedPath of TRUSTED_GUARD_PATHS) {
        if (gitFileExists(base, trustedPath) && changed.toString().split("\n").includes(trustedPath)) {
          errors.push(`PR changes a trusted migration guard: ${trustedPath}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`Migration-history validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Migration-history validation passed: ${migrations.length} migrations, ${IMMUTABLE.collisions.length} documented collisions, baseline checksum verified.`);
}
