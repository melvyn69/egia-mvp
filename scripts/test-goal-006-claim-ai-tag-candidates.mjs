#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath =
  "supabase/migrations/20260716142352_fix_claim_ai_tag_candidates_digest.sql";
const migration = readFileSync(resolve(migrationPath), "utf8");
const functionDefinition = migration.slice(
  migration.search(/create or replace function public\.claim_ai_tag_candidates/i),
  migration.search(
    /revoke all on function public\.claim_ai_tag_candidates\(int, text, text\)/i
  )
);

assert.match(
  migration,
  /create or replace function public\.claim_ai_tag_candidates\s*\(/i,
  "GOAL-006 must replace only the intended RPC"
);
assert.match(
  migration,
  /security definer\s+set search_path = pg_catalog/i,
  "the privileged RPC must use a trusted-only search_path"
);
assert.equal(
  [...functionDefinition.matchAll(/\bextensions\.digest\s*\(/gi)].length,
  2,
  "both digest calls must be schema-qualified"
);
assert.equal(
  [
    ...functionDefinition
      .replaceAll(/extensions\.digest/gi, "")
      .matchAll(/\bdigest\s*\(/gi)
  ].length,
  0,
  "no unqualified digest call may remain"
);
assert.equal(
  [...migration.matchAll(/'sha256'::pg_catalog\.text/gi)].length,
  2,
  "both digest algorithm arguments must be explicitly typed"
);
assert.match(
  migration,
  /revoke all on function public\.claim_ai_tag_candidates\(int, text, text\)\s+from public, anon, authenticated/i,
  "PUBLIC and browser roles must remain revoked"
);
assert.match(
  migration,
  /grant execute on function public\.claim_ai_tag_candidates\(int, text, text\)\s+to service_role/i,
  "only service_role may execute the claim RPC"
);
assert.doesNotMatch(
  migration,
  /\b(?:create|alter)\s+extension\b/i,
  "GOAL-006 must not install, move, or alter pgcrypto"
);
assert.match(
  migration,
  /limit least\(greatest\(coalesce\(p_limit, 10\), 1\), 20\)/i,
  "the existing batch bound must remain unchanged"
);
assert.match(
  migration,
  /for update skip locked/i,
  "the atomic claim behavior must remain unchanged"
);

console.log("GOAL-006 static SQL checks passed: 10/10.");
