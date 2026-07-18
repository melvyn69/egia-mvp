import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorizeInternalApiKey } from "../server/_shared/internal_api_key";
import { selectInternalApiKey } from "../supabase/functions/_shared/internal_api_key";

const A = "A".repeat(43);
const B = "B".repeat(43);
const LEGACY = "L".repeat(43);

const producer = (env: Record<string, string | undefined>) =>
  selectInternalApiKey((name) => env[name]);

assert.deepEqual(
  producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "A", INTERNAL_API_KEY_SLOT_A: A }),
  { slot: "A", value: A }
);
assert.deepEqual(
  producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "B", INTERNAL_API_KEY_SLOT_B: B }),
  { slot: "B", value: B }
);
assert.throws(() => producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "C" }), /configuration/);
assert.throws(
  () => producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "A", INTERNAL_API_KEY_SLOT_B: B }),
  /configuration/
);
assert.throws(
  () => producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "A", INTERNAL_API_KEY_SLOT_A: "short" }),
  /configuration/
);
assert.throws(
  () => producer({ INTERNAL_API_KEY_ACTIVE_SLOT: " A", INTERNAL_API_KEY_SLOT_A: A }),
  /configuration/
);
assert.throws(
  () => producer({ INTERNAL_API_KEY_ACTIVE_SLOT: "A", INTERNAL_API_KEY_SLOT_A: ` ${A}` }),
  /configuration/
);

const both = { INTERNAL_API_KEY_SLOT_A: A, INTERNAL_API_KEY_SLOT_B: B };
assert.equal(authorizeInternalApiKey(A, both), true);
assert.equal(authorizeInternalApiKey(B, both), true);
assert.equal(authorizeInternalApiKey(undefined, both), false);
assert.equal(authorizeInternalApiKey("", both), false);
assert.equal(authorizeInternalApiKey(LEGACY, both), false);
assert.equal(authorizeInternalApiKey(A, {}), false);
assert.equal(authorizeInternalApiKey("bad value", both), false);
assert.equal(authorizeInternalApiKey(` ${A}`, both), false);
assert.equal(authorizeInternalApiKey(`${A} `, both), false);
assert.equal(authorizeInternalApiKey(B, { INTERNAL_API_KEY_SLOT_A: "bad", INTERNAL_API_KEY_SLOT_B: B }), false);
const afterRotation = { INTERNAL_API_KEY_SLOT_B: B };
assert.equal(authorizeInternalApiKey(B, afterRotation), true);
assert.equal(authorizeInternalApiKey(A, afterRotation), false);
assert.equal(
  authorizeInternalApiKey(A, {
    ...both,
    INTERNAL_API_KEY_ACTIVE_SLOT: "B"
  }),
  true,
  "the consumer accepts both slots independently from producer activation"
);
assert.equal(
  authorizeInternalApiKey(LEGACY, {
    ...both,
    INTERNAL_API_KEY: LEGACY
  } as typeof both),
  false,
  "the legacy value is never a fallback"
);

const activeSources = [
  "supabase/functions/process-review-analyze/index.ts",
  "server/_shared/handlers/google/reply.ts"
];
for (const file of activeSources) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /(?:process\.env|Deno\.env\.get\()[^\n]*INTERNAL_API_KEY["'`)]/,
    `${file} must not read the legacy key`
  );
}

console.log("GOAL-007 internal API key A/B checks passed: 24/24.");
