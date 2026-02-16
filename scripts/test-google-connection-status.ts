import * as assert from "node:assert/strict";
import { mapGoogleConnectionStatus } from "../src/hooks/useGoogleConnectionStatus";

type TestCase = {
  name: string;
  httpStatus: number;
  payload: unknown;
  expected: {
    status: "disconnected" | "connected" | "reauth_required" | "unknown";
    reason: "ok" | "token_revoked" | "missing_refresh_token" | "expired" | "unknown" | "no_connection";
  };
};

const cases: TestCase[] = [
  {
    name: "404 => disconnected",
    httpStatus: 404,
    payload: null,
    expected: { status: "disconnected", reason: "no_connection" }
  },
  {
    name: "200 connected + ok",
    httpStatus: 200,
    payload: { connection: { status: "connected", reason: "ok" } },
    expected: { status: "connected", reason: "ok" }
  },
  {
    name: "200 connected + expired",
    httpStatus: 200,
    payload: { connection: { status: "connected", reason: "expired" } },
    expected: { status: "connected", reason: "expired" }
  },
  {
    name: "200 reauth + token_revoked",
    httpStatus: 200,
    payload: {
      connection: {
        status: "reauth_required",
        reason: "token_revoked",
        lastError: "reconnexion_google_requise"
      }
    },
    expected: { status: "reauth_required", reason: "token_revoked" }
  },
  {
    name: "401 => unknown",
    httpStatus: 401,
    payload: { error: "Unauthorized" },
    expected: { status: "unknown", reason: "unknown" }
  }
];

for (const testCase of cases) {
  const actual = mapGoogleConnectionStatus(testCase.httpStatus, testCase.payload);
  assert.equal(actual.status, testCase.expected.status, `${testCase.name} status`);
  assert.equal(actual.reason, testCase.expected.reason, `${testCase.name} reason`);
}

console.log(`OK: ${cases.length} Google connection status mapping tests passed.`);
