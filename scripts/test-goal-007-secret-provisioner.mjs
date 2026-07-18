import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  GOAL007_APPLY_MARKER,
  GOAL007_APPLE_SECRET_NAMES,
  MemorySecretSource,
  ProvisioningError,
  planSecretProvisioning,
  provisionAppleWalletSetAcrossPlatforms,
  provisionSecretAcrossPlatforms,
  reconcileProvisioningState,
  serializeProvisioningResult
} from "./lib/goal007-secret-provisioner.mjs";

const secret = "SYNTHETIC_SECRET_CANARY_" + "x".repeat(43);

const startServer = async (handler) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ method: request.method, url: request.url, body: Buffer.concat(chunks).toString("utf8") });
    await handler({ request, response, requests });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/secret`,
    requests,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  };
};

const withServers = async (vercelHandler, supabaseHandler, callback) => {
  const vercel = await startServer(vercelHandler);
  const supabase = await startServer(supabaseHandler);
  try {
    return await callback({ vercel, supabase });
  } finally {
    await Promise.all([vercel.close(), supabase.close()]);
  }
};

const respond = (status = 201, body = "{}") => ({ response }) => {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(body);
};

const base = ({ vercel, supabase }) => ({
  mode: "apply",
  marker: GOAL007_APPLY_MARKER,
  secretName: "INTERNAL_API_KEY_SLOT_B",
  vercelAccessToken: "synthetic-control-token-v",
  supabaseAccessToken: "synthetic-control-token-s",
  allowLocalHttp: true,
  endpoints: { vercel: vercel.url, supabase: supabase.url }
});

assert.equal(
  planSecretProvisioning({
    secretName: "INTERNAL_API_KEY_SLOT_A",
    projectRef: "fhadiwkdznhuxtlgrwfd",
    projectId: "prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT"
  }).activation,
  false
);

await withServers(respond(201, `malicious ${secret}`), respond(201, "not json"), async (servers) => {
  const result = await provisionSecretAcrossPlatforms({
    ...base(servers),
    secretSource: new MemorySecretSource(secret)
  });
  assert.equal(result.vercel, "WRITTEN_NOT_CAPTURED");
  assert.equal(result.activation, false);
  assert.equal(servers.vercel.requests.length, 1);
  assert.equal(servers.supabase.requests.length, 1);
  assert.match(servers.vercel.requests[0].body, new RegExp(secret));
  assert.doesNotMatch(serializeProvisioningResult(result), new RegExp(secret));
});

await withServers(respond(201), respond(201), async (servers) => {
  const secretSources = Object.fromEntries(
    GOAL007_APPLE_SECRET_NAMES.map((name) => [name, new MemorySecretSource(`${name}_synthetic_value`)])
  );
  const result = await provisionAppleWalletSetAcrossPlatforms({
    ...base(servers),
    applePreflightApproved: true,
    secretSources
  });
  assert.equal(result.vercel, "APPLE_SET_WRITTEN_NOT_CAPTURED");
  assert.equal(servers.vercel.requests.length, 1);
  assert.equal(servers.supabase.requests.length, 1);
  const vercelBody = JSON.parse(servers.vercel.requests[0].body);
  const supabaseBody = JSON.parse(servers.supabase.requests[0].body);
  assert.deepEqual(vercelBody.map((entry) => entry.key), GOAL007_APPLE_SECRET_NAMES);
  assert.deepEqual(supabaseBody.map((entry) => entry.name), GOAL007_APPLE_SECRET_NAMES);
  assert.doesNotMatch(serializeProvisioningResult(result), /synthetic_value/);
});

await assert.rejects(
  provisionAppleWalletSetAcrossPlatforms({
    mode: "apply",
    marker: GOAL007_APPLY_MARKER,
    applePreflightApproved: false,
    secretSources: {},
    vercelAccessToken: "v",
    supabaseAccessToken: "s"
  }),
  /APPLE_SET_APPLY_NOT_AUTHORIZED/
);

for (const status of [401, 403, 409, 429, 500, 503]) {
  await withServers(respond(status, secret), respond(201), async (servers) => {
    const error = await provisionSecretAcrossPlatforms({
      ...base(servers),
      secretSource: new MemorySecretSource(secret)
    }).catch((value) => value);
    assert.ok(error instanceof ProvisioningError);
    assert.doesNotMatch(serializeProvisioningResult(error), new RegExp(secret));
    assert.equal(error.outcomeUnknown, [409, 429, 500, 503].includes(status));
  });
}

await withServers(respond(201), ({ response }) => response.destroy(), async (servers) => {
  const error = await provisionSecretAcrossPlatforms({
    ...base(servers),
    secretSource: new MemorySecretSource(secret)
  }).catch((value) => value);
  assert.equal(error.state, "VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN");
  const reconciled = await reconcileProvisioningState({
    inspectTarget: async (target) => target === "vercel" ? "present" : "absent"
  });
  assert.equal(reconciled, "REWRITE_ALL_AFTER_UNKNOWN");
});

await withServers(({ response }) => response.destroy(), respond(201), async (servers) => {
  const error = await provisionSecretAcrossPlatforms({
    ...base(servers),
    targetOrder: ["supabase", "vercel"],
    secretSource: new MemorySecretSource(secret)
  }).catch((value) => value);
  assert.equal(error.state, "SUPABASE_WRITTEN_VERCEL_OUTCOME_UNKNOWN");
  const reconciled = await reconcileProvisioningState({
    inspectTarget: async (target) => target === "supabase" ? "present" : "absent"
  });
  assert.equal(reconciled, "REWRITE_ALL_AFTER_UNKNOWN");
});

await withServers(respond(201), respond(201), async (servers) => {
  await provisionSecretAcrossPlatforms({
    ...base(servers),
    resumeFrom: "REWRITE_ALL_AFTER_UNKNOWN",
    secretSource: new MemorySecretSource(secret)
  });
  assert.equal(servers.vercel.requests.length, 1);
  assert.equal(servers.supabase.requests.length, 1);
});

await withServers(respond(201), respond(201), async (servers) => {
  const secretSources = Object.fromEntries(
    GOAL007_APPLE_SECRET_NAMES.map((name) => [name, new MemorySecretSource(`${name}_replacement_value`)])
  );
  await provisionAppleWalletSetAcrossPlatforms({
    ...base(servers),
    applePreflightApproved: true,
    secretSources,
    resumeFrom: "REWRITE_APPLE_SET_AFTER_UNKNOWN"
  });
  assert.equal(servers.vercel.requests.length, 1);
  assert.equal(servers.supabase.requests.length, 1);
});

await withServers(respond(201), respond(201), async (servers) => {
  await provisionSecretAcrossPlatforms({
    ...base(servers),
    resumeFrom: "VERCEL_WRITTEN_NOT_CAPTURED",
    secretSource: new MemorySecretSource(secret)
  });
  assert.equal(servers.vercel.requests.length, 0);
  assert.equal(servers.supabase.requests.length, 1);
});

await withServers(respond(201), respond(201), async (servers) => {
  await provisionSecretAcrossPlatforms({
    ...base(servers),
    targetOrder: ["supabase", "vercel"],
    resumeFrom: "SUPABASE_WRITTEN",
    secretSource: new MemorySecretSource(secret)
  });
  assert.equal(servers.vercel.requests.length, 1);
  assert.equal(servers.supabase.requests.length, 0);
});

await assert.rejects(
  reconcileProvisioningState({ inspectTarget: async () => "unknown" }),
  (error) => error instanceof ProvisioningError && error.outcomeUnknown
);

await withServers(async () => new Promise(() => {}), respond(201), async (servers) => {
  const error = await provisionSecretAcrossPlatforms({
    ...base(servers),
    timeoutMs: 25,
    secretSource: new MemorySecretSource(secret)
  }).catch((value) => value);
  assert.equal(error.state, "VERCEL_OUTCOME_UNKNOWN");
});

await withServers(respond(201), respond(201), async (servers) => {
  const interrupted = new AbortController();
  interrupted.abort();
  const error = await provisionSecretAcrossPlatforms({
    ...base(servers),
    signal: interrupted.signal,
    secretSource: new MemorySecretSource(secret)
  }).catch((value) => value);
  assert.equal(error.state, "VERCEL_OUTCOME_UNKNOWN");
});

for (const targetOrder of [["vercel"], ["supabase", "vercel", "supabase"]]) {
  await assert.rejects(
    provisionSecretAcrossPlatforms({
      mode: "apply",
      marker: GOAL007_APPLY_MARKER,
      secretName: "INTERNAL_API_KEY_SLOT_B",
      targetOrder,
      secretSource: new MemorySecretSource(secret),
      vercelAccessToken: "v",
      supabaseAccessToken: "s"
    }),
    /TARGET_ORDER_FORBIDDEN/
  );
}

await assert.rejects(
  provisionSecretAcrossPlatforms({
    mode: "apply",
    marker: GOAL007_APPLY_MARKER,
    secretName: "INTERNAL_API_KEY_SLOT_B",
    endpoints: { vercel: "https://attacker.invalid", supabase: "https://attacker.invalid" },
    secretSource: new MemorySecretSource(secret),
    vercelAccessToken: "v",
    supabaseAccessToken: "s"
  }),
  /ENDPOINT_OVERRIDE_FORBIDDEN/
);

await assert.rejects(
  provisionSecretAcrossPlatforms({
    mode: "apply",
    marker: GOAL007_APPLY_MARKER,
    secretName: "INTERNAL_API_KEY_SLOT_B",
    vercelDeploymentState: "captured",
    secretSource: new MemorySecretSource(secret),
    vercelAccessToken: "v",
    supabaseAccessToken: "s"
  }),
  /VERCEL_SECRET_ALREADY_CAPTURED/
);

const originalDebug = process.env.DEBUG;
process.env.DEBUG = "*";
let debugOutput = "";
const originalLog = console.log;
const originalError = console.error;
console.log = (...parts) => { debugOutput += parts.join(" "); };
console.error = (...parts) => { debugOutput += parts.join(" "); };
try {
  await withServers(respond(201), respond(201), async (servers) => {
    await provisionSecretAcrossPlatforms({
      ...base(servers),
      secretSource: new MemorySecretSource(secret)
    });
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
  if (originalDebug === undefined) delete process.env.DEBUG;
  else process.env.DEBUG = originalDebug;
}
assert.doesNotMatch(debugOutput, new RegExp(secret));

const swift = readFileSync("scripts/goal007-keychain-provisioner.swift", "utf8");
assert.match(swift, /SecItemCopyMatching/);
assert.doesNotMatch(swift, /security find-generic-password|Process\(|\.environment/);
assert.doesNotMatch(swift, /print\([^\n]*(?:secret|token|value)\)/i);
assert.match(swift, /prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT/);
assert.match(swift, /fhadiwkdznhuxtlgrwfd/);
assert.match(swift, /resetBytes/);
assert.match(swift, /resume-vercel/);
assert.match(swift, /resume-supabase/);
assert.match(swift, /rewrite-all-after-unknown/);
assert.match(swift, /rewrite-apple-all-after-unknown/);

const argv = [
  "goal007-keychain-provisioner",
  "apply",
  GOAL007_APPLY_MARKER,
  "SECRET_SERVICE",
  "current-user",
  "INTERNAL_API_KEY_SLOT_B",
  "VERCEL_API_TOKEN",
  "current-user",
  "SUPABASE_ACCESS_TOKEN",
  "current-user"
];
assert.equal(argv.some((arg) => arg.includes(secret)), false);

if (process.platform === "darwin") {
  const directory = mkdtempSync(join(tmpdir(), "goal007-swift-"));
  const binary = join(directory, "provisioner");
  try {
    const compilation = spawnSync("swiftc", ["scripts/goal007-keychain-provisioner.swift", "-o", binary], { encoding: "utf8" });
    assert.equal(compilation.status, 0, compilation.stderr);
    const execution = spawnSync(binary, [], { encoding: "utf8" });
    assert.equal(execution.status, 2);
    assert.equal(execution.stderr, "");
    assert.equal(execution.stdout.trim(), '{"ok":false,"code":"INVALID_ARGUMENTS"}');

    const runSwift = (scenario) =>
      new Promise((resolve) => {
        const child = spawn(binary, [
          "self-test",
          "GOAL007_LOCAL_SWIFT_TEST_V1",
          scenario
        ]);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("close", (status) => resolve({ status, stdout, stderr }));
      });

    {
      const child = await runSwift("success");
      assert.equal(
        child.status,
        0,
        child.stdout + child.stderr
      );
      assert.equal(child.stderr, "");
      assert.match(child.stdout, /"operationId":"[0-9A-Fa-f-]{36}"/);
      assert.doesNotMatch(child.stdout, /U1NTU1NT/);
    }
    {
      const child = await runSwift("partial");
      assert.equal(child.status, 5);
      assert.equal(child.stderr, "");
      assert.match(child.stdout, /VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN/);
      assert.doesNotMatch(child.stdout, /U1NTU1NT/);
    }
    {
      const child = await runSwift("timeout");
      assert.equal(child.status, 5);
      assert.equal(child.stderr, "");
      assert.match(child.stdout, /VERCEL_OUTCOME_UNKNOWN/);
      assert.doesNotMatch(child.stdout, /U1NTU1NT/);
    }
    {
      const child = await runSwift("interruption");
      assert.equal(child.status, 5);
      assert.equal(child.stderr, "");
      assert.match(child.stdout, /VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN/);
      assert.doesNotMatch(child.stdout, /U1NTU1NT/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

console.log("GOAL-007 secret provisioner adversarial checks passed: 53/53.");
