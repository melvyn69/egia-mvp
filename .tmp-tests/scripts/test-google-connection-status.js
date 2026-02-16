"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert/strict");
const useGoogleConnectionStatus_1 = require("../src/hooks/useGoogleConnectionStatus");
const cases = [
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
    const actual = (0, useGoogleConnectionStatus_1.mapGoogleConnectionStatus)(testCase.httpStatus, testCase.payload);
    assert.equal(actual.status, testCase.expected.status, `${testCase.name} status`);
    assert.equal(actual.reason, testCase.expected.reason, `${testCase.name} reason`);
}
console.log(`OK: ${cases.length} Google connection status mapping tests passed.`);
