import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AppleWalletPreflightError,
  redactAppleWalletPreflightError,
  validateAppleWalletPreflight
} from "./lib/goal007-apple-wallet-preflight.mjs";

const dir = mkdtempSync(join(tmpdir(), "goal007-wallet-synth-"));
const run = (...args) => execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });

try {
  run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650", "-subj", "/CN=GOAL007 Synthetic Root CA/O=EGIA Tests", "-keyout", "root.key", "-out", "root.crt");
  writeFileSync(join(dir, "wwdr.ext"), "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n");
  run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=GOAL007 Synthetic WWDR/O=EGIA Tests", "-keyout", "wwdr.key", "-out", "wwdr.csr");
  run("x509", "-req", "-in", "wwdr.csr", "-CA", "root.crt", "-CAkey", "root.key", "-CAcreateserial", "-days", "100", "-extfile", "wwdr.ext", "-out", "wwdr.crt");
  writeFileSync(join(dir, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n1.2.840.113635.100.6.1.4=critical,DER:05:00\n");
  run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=Pass Type ID: pass.com.egia.synthetic/OU=TEAMGOAL007/UID=pass.com.egia.synthetic/O=EGIA Tests", "-keyout", "leaf-plain.key", "-out", "leaf.csr");
  run("x509", "-req", "-in", "leaf.csr", "-CA", "wwdr.crt", "-CAkey", "wwdr.key", "-CAcreateserial", "-days", "365", "-extfile", "leaf.ext", "-out", "leaf.crt");
  run("pkcs8", "-topk8", "-in", "leaf-plain.key", "-out", "leaf.key", "-v2", "aes-256-cbc", "-passout", "pass:synthetic-passphrase");
  run("genrsa", "-aes256", "-passout", "pass:synthetic-passphrase", "-out", "other.key", "2048");
  run("req", "-newkey", "rsa:1024", "-nodes", "-subj", "/CN=Weak/OU=TEAMGOAL007/UID=pass.com.egia.synthetic", "-keyout", "weak-plain.key", "-out", "weak.csr");
  run("x509", "-req", "-in", "weak.csr", "-CA", "wwdr.crt", "-CAkey", "wwdr.key", "-CAcreateserial", "-days", "365", "-extfile", "leaf.ext", "-out", "weak.crt");
  run("pkcs8", "-topk8", "-in", "weak-plain.key", "-out", "weak.key", "-v2", "aes-256-cbc", "-passout", "pass:synthetic-passphrase");
  writeFileSync(join(dir, "bad-ku.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,keyEncipherment\nextendedKeyUsage=codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n1.2.840.113635.100.6.1.4=critical,DER:05:00\n");
  writeFileSync(join(dir, "bad-eku.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n1.2.840.113635.100.6.1.4=critical,DER:05:00\n");
  for (const variant of ["bad-ku", "bad-eku"]) {
    run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=Variant/OU=TEAMGOAL007/UID=pass.com.egia.synthetic", "-keyout", `${variant}-plain.key`, "-out", `${variant}.csr`);
    run("x509", "-req", "-in", `${variant}.csr`, "-CA", "wwdr.crt", "-CAkey", "wwdr.key", "-CAcreateserial", "-days", "365", "-extfile", `${variant}.ext`, "-out", `${variant}.crt`);
    run("pkcs8", "-topk8", "-in", `${variant}-plain.key`, "-out", `${variant}.key`, "-v2", "aes-256-cbc", "-passout", "pass:synthetic-passphrase");
  }

  const input = {
    passTypeIdentifier: "pass.com.egia.synthetic",
    teamIdentifier: "TEAMGOAL007",
    certificatePem: readFileSync(join(dir, "leaf.crt"), "utf8"),
    encryptedPrivateKeyPem: readFileSync(join(dir, "leaf.key"), "utf8"),
    passphrase: "synthetic-passphrase",
    wwdrCertificatePem: readFileSync(join(dir, "wwdr.crt"), "utf8"),
    trustedRootCertificatePem: readFileSync(join(dir, "root.crt"), "utf8"),
    allowSyntheticRoot: true
  };

  const result = await validateAppleWalletPreflight(input);
  assert.equal(result.ok, true);
  assert.equal(result.sharingProhibited, true);
  assert.equal(result.qr, true);
  assert.equal(result.contentType, "application/vnd.apple.pkpass");
  assert.equal(result.persistedMaterials, false);
  assert.equal(result.manifestVerified, true);
  assert.equal(result.pkcs7Verified, true);
  assert.match(result.passArchiveSha256, /^[a-f0-9]{64}$/);

  await assert.rejects(
    validateAppleWalletPreflight({ ...input, teamIdentifier: "WRONGTEAM" }),
    (error) => error instanceof AppleWalletPreflightError && error.code === "APPLE_TEAM_ID_MISMATCH"
  );
  await assert.rejects(
    validateAppleWalletPreflight({ ...input, passTypeIdentifier: "pass.com.egia" }),
    /APPLE_PASS_ID_MISMATCH/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      encryptedPrivateKeyPem: readFileSync(join(dir, "leaf-plain.key"), "utf8")
    }),
    /APPLE_KEY_NOT_ENCRYPTED/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      encryptedPrivateKeyPem: readFileSync(join(dir, "other.key"), "utf8")
    }),
    /APPLE_KEY_CERT_MISMATCH/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      certificatePem: readFileSync(join(dir, "weak.crt"), "utf8"),
      encryptedPrivateKeyPem: readFileSync(join(dir, "weak.key"), "utf8")
    }),
    /APPLE_RSA_STRENGTH_INVALID/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      certificatePem: readFileSync(join(dir, "bad-ku.crt"), "utf8"),
      encryptedPrivateKeyPem: readFileSync(join(dir, "bad-ku.key"), "utf8")
    }),
    /APPLE_LEAF_KEY_USAGE_INVALID/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      certificatePem: readFileSync(join(dir, "bad-eku.crt"), "utf8"),
      encryptedPrivateKeyPem: readFileSync(join(dir, "bad-eku.key"), "utf8")
    }),
    /APPLE_LEAF_EXTENDED_KEY_USAGE_INVALID/
  );
  const leaf = new X509Certificate(input.certificatePem);
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      now: new Date(new Date(leaf.validTo).valueOf() - 29 * 86_400_000)
    }),
    /APPLE_CERT_RENEWAL_REQUIRED/
  );
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      wwdrCertificatePem: input.trustedRootCertificatePem
    }),
    /APPLE_(KEY_IDENTIFIER_MISMATCH|WWDR_MISMATCH)/
  );
  await assert.rejects(
    validateAppleWalletPreflight({ ...input, allowSyntheticRoot: false }),
    /APPLE_ROOT_NOT_APPROVED/
  );
  const wwdr = new X509Certificate(input.wwdrCertificatePem);
  await assert.rejects(
    validateAppleWalletPreflight({
      ...input,
      now: new Date(new Date(wwdr.validTo).valueOf() + 1)
    }),
    /APPLE_WWDR_NOT_CURRENT/
  );
  for (const [mutation, code] of [
    ["manifest", "APPLE_PASS_JSON_INVALID"],
    ["signature", "APPLE_PKCS7_SIGNATURE_INVALID"],
    ["pass-json", "APPLE_PASS_JSON_CONTRACT_INVALID"],
    ["qr", "APPLE_PASS_JSON_CONTRACT_INVALID"]
  ]) {
    await assert.rejects(
      validateAppleWalletPreflight({ ...input, archiveMutationForTest: mutation }),
      new RegExp(code)
    );
  }
  await assert.rejects(
    validateAppleWalletPreflight({ ...input, passphrase: "wrong" }),
    /APPLE_MATERIAL_PARSE_FAILED/
  );
  await assert.rejects(
    validateAppleWalletPreflight({ ...input, trustedRootCertificatePem: "" }),
    /APPLE_SET_INCOMPLETE/
  );
  const redacted = JSON.stringify(redactAppleWalletPreflightError(new Error(input.encryptedPrivateKeyPem)));
  assert.doesNotMatch(redacted, /PRIVATE KEY|synthetic-passphrase/);

  const runtime = readFileSync("server/_shared/handlers/loyalty/apple-pass.ts", "utf8");
  const runtimeConfig = readFileSync("server/_shared/apple_wallet_config.ts", "utf8");
  assert.match(runtime, /sharingProhibited:\s*true/);
  assert.match(runtimeConfig, /APPLE_PASS_CERTIFICATE_PASSWORD/);
  assert.doesNotMatch(runtime, /sharingProhibited:\s*false/);
  console.log("GOAL-007 Apple Wallet synthetic checks passed: 33/33.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
