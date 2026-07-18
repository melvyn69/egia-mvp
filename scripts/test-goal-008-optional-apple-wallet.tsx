import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  APPLE_WALLET_SECRET_KEYS,
  getAppleWalletRuntimeConfig,
  type EnvironmentReader
} from "../server/_shared/apple_wallet_config";
import { createCapabilitiesHandler } from "../server/_shared/handlers/capabilities";
import { createApplePassHandler } from "../server/_shared/handlers/loyalty/apple-pass";
import { AppleWalletCta } from "../src/components/loyalty/AppleWalletCta";

type ResponseBody = Record<string, unknown> | null;

const createResponse = () => {
  let statusCode = 200;
  let body: ResponseBody = null;
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: ResponseBody) {
      body = value;
      return response;
    },
    send(value: unknown) {
      body = { value };
      return response;
    }
  } as unknown as VercelResponse;
  return {
    response,
    result: () => ({ statusCode, body, headers })
  };
};

const createReader = (
  values: Record<string, string | undefined>,
  reads: string[]
): EnvironmentReader => (name) => {
  reads.push(name);
  return values[name];
};

const assertNoAppleInputsRead = (reads: string[]) => {
  for (const key of APPLE_WALLET_SECRET_KEYS) {
    assert.equal(reads.includes(key), false, `${key} must not be read`);
  }
};

const createSyntheticMaterials = () => {
  const directory = mkdtempSync(join(tmpdir(), "goal008-wallet-synth-"));
  const run = (...args: string[]) =>
    execFileSync("openssl", args, {
      cwd: directory,
      stdio: "ignore"
    });

  run(
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "3650",
    "-subj",
    "/CN=GOAL008 Synthetic Root CA/O=EGIA Tests",
    "-keyout",
    "root.key",
    "-out",
    "root.crt"
  );
  writeFileSync(
    join(directory, "wwdr.ext"),
    "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n"
  );
  run(
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    "/CN=GOAL008 Synthetic WWDR/O=EGIA Tests",
    "-keyout",
    "wwdr.key",
    "-out",
    "wwdr.csr"
  );
  run(
    "x509",
    "-req",
    "-in",
    "wwdr.csr",
    "-CA",
    "root.crt",
    "-CAkey",
    "root.key",
    "-CAcreateserial",
    "-days",
    "365",
    "-extfile",
    "wwdr.ext",
    "-out",
    "wwdr.crt"
  );
  writeFileSync(
    join(directory, "leaf.ext"),
    "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n1.2.840.113635.100.6.1.4=critical,DER:05:00\n"
  );
  run(
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    "/CN=Pass Type ID: pass.com.egia.goal008/OU=TEAMGOAL008/UID=pass.com.egia.goal008/O=EGIA Tests",
    "-keyout",
    "leaf-plain.key",
    "-out",
    "leaf.csr"
  );
  run(
    "x509",
    "-req",
    "-in",
    "leaf.csr",
    "-CA",
    "wwdr.crt",
    "-CAkey",
    "wwdr.key",
    "-CAcreateserial",
    "-days",
    "365",
    "-extfile",
    "leaf.ext",
    "-out",
    "leaf.crt"
  );
  run(
    "pkcs8",
    "-topk8",
    "-in",
    "leaf-plain.key",
    "-out",
    "leaf.key",
    "-v2",
    "aes-256-cbc",
    "-passout",
    "pass:goal008-synthetic-passphrase"
  );

  return {
    directory,
    values: {
      APPLE_WALLET_ENABLED: "true",
      APPLE_PASS_PRIVATE_KEY: readFileSync(join(directory, "leaf.key"), "utf8"),
      APPLE_PASS_CERTIFICATE_PASSWORD: "goal008-synthetic-passphrase",
      APPLE_PASS_CERTIFICATE: readFileSync(join(directory, "leaf.crt"), "utf8"),
      APPLE_WWDR_CERTIFICATE: readFileSync(join(directory, "wwdr.crt"), "utf8"),
      APPLE_PASS_TYPE_IDENTIFIER: "pass.com.egia.goal008",
      APPLE_TEAM_IDENTIFIER: "TEAMGOAL008",
      APP_PUBLIC_URL: "https://synthetic.invalid"
    }
  };
};

const request = {
  method: "GET",
  query: { token: "synthetic-wallet-token" },
  headers: {}
} as unknown as VercelRequest;

const main = async () => {
const absentReads: string[] = [];
assert.deepEqual(
  getAppleWalletRuntimeConfig(createReader({}, absentReads)),
  { appleWalletEnabled: false }
);
assert.deepEqual(absentReads, ["APPLE_WALLET_ENABLED"]);
assertNoAppleInputsRead(absentReads);

for (const flag of ["false", "TRUE", "", "1"]) {
  const reads: string[] = [];
  assert.deepEqual(
    getAppleWalletRuntimeConfig(
      createReader({ APPLE_WALLET_ENABLED: flag }, reads)
    ),
    { appleWalletEnabled: false }
  );
  assertNoAppleInputsRead(reads);
}

const partialReads: string[] = [];
assert.deepEqual(
  getAppleWalletRuntimeConfig(
    createReader(
      {
        APPLE_WALLET_ENABLED: "true",
        APPLE_PASS_TYPE_IDENTIFIER: "pass.com.egia.partial"
      },
      partialReads
    )
  ),
  { appleWalletEnabled: false }
);
for (const key of APPLE_WALLET_SECRET_KEYS) {
  assert.equal(partialReads.includes(key), true, `${key} must be checked when enabled`);
}

const disabledRouteReads: string[] = [];
const disabledRouteResponse = createResponse();
await createApplePassHandler(createReader({}, disabledRouteReads))(
  request,
  disabledRouteResponse.response
);
const disabledRouteResult = disabledRouteResponse.result();
assert.equal(disabledRouteResult.statusCode, 404);
assert.deepEqual(
  (disabledRouteResult.body as { error?: unknown })?.error,
  {
    code: "APPLE_WALLET_DISABLED",
    message: "Capability not available"
  }
);
assertNoAppleInputsRead(disabledRouteReads);
assert.doesNotMatch(JSON.stringify(disabledRouteResult.body), /APPLE_PASS_|APPLE_TEAM_/);

const disabledCapabilitiesReads: string[] = [];
const disabledCapabilitiesResponse = createResponse();
createCapabilitiesHandler(createReader({}, disabledCapabilitiesReads))(
  { ...request, query: {} } as VercelRequest,
  disabledCapabilitiesResponse.response
);
const disabledCapabilitiesResult = disabledCapabilitiesResponse.result();
assert.equal(disabledCapabilitiesResult.statusCode, 200);
assert.deepEqual(
  (disabledCapabilitiesResult.body as { data?: unknown })?.data,
  { appleWalletEnabled: false }
);
assertNoAppleInputsRead(disabledCapabilitiesReads);
assert.doesNotMatch(
  JSON.stringify(disabledCapabilitiesResult.body),
  /APPLE_PASS_|APPLE_TEAM_|certificate|private.?key|wwdr/i
);

const disabledMarkup = renderToStaticMarkup(
  createElement(AppleWalletCta, { enabled: false, onAdd: () => undefined })
);
assert.equal(disabledMarkup, "");
const enabledMarkup = renderToStaticMarkup(
  createElement(AppleWalletCta, { enabled: true, onAdd: () => undefined })
);
assert.match(enabledMarkup, /Ajouter à Apple Wallet/);
assert.match(enabledMarkup, /apple-wallet-capability/);

const synthetic = createSyntheticMaterials();
try {
  const validReads: string[] = [];
  const validConfig = getAppleWalletRuntimeConfig(
    createReader(synthetic.values, validReads)
  );
  assert.equal(validConfig.appleWalletEnabled, true);
  for (const key of APPLE_WALLET_SECRET_KEYS) {
    assert.equal(validReads.includes(key), true);
  }

  const enabledCapabilitiesResponse = createResponse();
  createCapabilitiesHandler(createReader(synthetic.values, []))(
    { ...request, query: {} } as VercelRequest,
    enabledCapabilitiesResponse.response
  );
  assert.deepEqual(
    (enabledCapabilitiesResponse.result().body as { data?: unknown })?.data,
    { appleWalletEnabled: true }
  );

  const invalidMaterial = {
    ...synthetic.values,
    APPLE_TEAM_IDENTIFIER: "WRONGTEAM"
  };
  assert.deepEqual(
    getAppleWalletRuntimeConfig(createReader(invalidMaterial, [])),
    { appleWalletEnabled: false }
  );
} finally {
  rmSync(synthetic.directory, { recursive: true, force: true });
}

const runtimeSource = readFileSync(
  "server/_shared/handlers/loyalty/apple-pass.ts",
  "utf8"
);
const configSource = readFileSync(
  "server/_shared/apple_wallet_config.ts",
  "utf8"
);
const capabilitiesSource = readFileSync(
  "server/_shared/handlers/capabilities.ts",
  "utf8"
);
const verifySource = readFileSync("src/pages/LoyaltyVerify.tsx", "utf8");
const helpSource = readFileSync("src/pages/Help.tsx", "utf8");
const loyaltyServiceSource = readFileSync("src/services/loyalty.ts", "utf8");
assert.match(runtimeSource, /sharingProhibited:\s*true/);
assert.doesNotMatch(runtimeSource, /sharingProhibited:\s*false/);
assert.ok(
  runtimeSource.indexOf("getAppleWalletRuntimeConfig") <
    runtimeSource.indexOf("createSupabaseAdmin(readEnvironment)")
);
assert.match(configSource, /flag !== "true"[\s\S]*appleWalletEnabled: false/);
assert.doesNotMatch(capabilitiesSource, /APPLE_PASS_|APPLE_TEAM_|WWDR/);
assert.doesNotMatch(loyaltyServiceSource, /APPLE_PASS_|APPLE_TEAM_|WWDR/);
assert.match(verifySource, /<LoyaltyQrCode/);
assert.match(verifySource, /<AppleWalletCta/);
assert.doesNotMatch(verifySource, /sera bientôt disponible|Non configuré/);
assert.doesNotMatch(helpSource, /Vérifier Wallet|id:\s*"wallet"/);

console.log("GOAL-008 optional Apple Wallet checks passed.");
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
