import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type JsonRecord = Record<string, unknown>;

type RpcCall = {
  body: JsonRecord;
  functionName: string;
};

type RouteResult = {
  body: JsonRecord;
  status: number;
};

const originalFetch = globalThis.fetch;
const rpcCalls: RpcCall[] = [];
let claimResponse: { body: unknown; status: number } = {
  body: [],
  status: 200
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input));
  const rawBody = init?.body ?? request?.body;
  const body =
    typeof rawBody === "string" ? (JSON.parse(rawBody) as JsonRecord) : {};
  const functionName = url.pathname.split("/").pop() ?? "";

  if (functionName === "job_queue_claim") {
    return jsonResponse([]);
  }
  if (functionName === "claim_google_sync_connections") {
    rpcCalls.push({ body, functionName });
    return jsonResponse(claimResponse.body, claimResponse.status);
  }
  throw new Error(`Unexpected fetch in Google cron test: ${url.pathname}`);
};

const makeRequest = (secret?: string) =>
  ({
    headers: secret ? { "x-cron-secret": secret } : {},
    method: "POST",
    url: "/api/cron/google/sync-replies"
  }) as unknown as VercelRequest;

const runRoute = async (
  handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>,
  secret?: string
): Promise<RouteResult> => {
  let status = 200;
  let body: JsonRecord = {};
  const response = {
    setHeader: () => response,
    status: (nextStatus: number) => {
      status = nextStatus;
      return response;
    },
    json: (payload: JsonRecord) => {
      body = payload;
      return response;
    }
  } as unknown as VercelResponse;

  await handler(makeRequest(secret), response);
  return { body, status };
};

const main = async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-client-secret";
  process.env.CRON_SECRET = "test-cron-secret";

  const source = readFileSync(
    "server/_shared/handlers/cron/google/sync-replies.ts",
    "utf8"
  );
  assert.match(
    source,
    /supabaseAdmin\.rpc\("claim_google_sync_connections",\s*\{\s*p_limit:\s*connectionBatch\s*\}\)/,
    "the connection claim must be invoked directly through the Supabase client"
  );
  assert.doesNotMatch(
    source,
    /(?:const|let|var)\s+\w+\s*=\s*supabaseAdmin\.rpc\b/,
    "supabaseAdmin.rpc must never be detached from its client"
  );

  const { default: handler } = await import(
    "../server/_shared/handlers/cron/google/sync-replies"
  );

  const unauthorized = await runRoute(handler);
  assert.equal(unauthorized.status, 403, "CRON_SECRET must be required");
  assert.equal(
    (unauthorized.body.error as JsonRecord).code,
    "FORBIDDEN",
    "missing CRON_SECRET must be rejected"
  );
  assert.equal(rpcCalls.length, 0, "unauthorized requests must not reach Supabase");

  claimResponse = { body: [], status: 200 };
  const noCandidates = await runRoute(handler, "test-cron-secret");
  assert.equal(noCandidates.status, 200);
  assert.equal(noCandidates.body.ok, true);
  assert.equal(noCandidates.body.reason, "no_candidates");
  assert.equal(rpcCalls.length, 1, "the claim RPC must reach the Supabase transport");
  assert.equal(rpcCalls[0]?.functionName, "claim_google_sync_connections");
  assert.deepEqual(rpcCalls[0]?.body, { p_limit: 5 });
  assert.doesNotMatch(
    JSON.stringify(noCandidates.body),
    /reading ['"]rest['"]/,
    "the route must not fail because the Supabase client context was lost"
  );

  claimResponse = {
    body: {
      code: "XX000",
      details: null,
      hint: null,
      message: "claim failed"
    },
    status: 400
  };
  const rpcFailure = await runRoute(handler, "test-cron-secret");
  assert.equal(rpcFailure.status, 500, "RPC errors must be handled by the route");
  assert.equal(rpcFailure.body.ok, false);
  assert.equal(
    (rpcFailure.body.error as JsonRecord).message,
    "Failed to load connections"
  );
  assert.equal(rpcCalls.length, 2, "the failing claim must still use the client RPC");

  console.log(
    "OK: Google cron RPC binding, no-candidate, RPC error, and CRON_SECRET checks passed."
  );
};

main().then(
  () => {
    globalThis.fetch = originalFetch;
  },
  (error: unknown) => {
    globalThis.fetch = originalFetch;
    console.error(error);
    process.exitCode = 1;
  }
);
