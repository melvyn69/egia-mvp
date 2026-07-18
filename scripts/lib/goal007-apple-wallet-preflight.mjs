import {
  createHash,
  createPrivateKey,
  createSign,
  createVerify,
  X509Certificate
} from "node:crypto";
import { spawn } from "node:child_process";
import yauzl from "yauzl";

const REQUIRED_EXTENSION_HEX = {
  keyUsage: "551d0f",
  extendedKeyUsage: "551d25",
  authorityKeyIdentifier: "551d23",
  subjectKeyIdentifier: "551d0e",
  applePassType: "2a864886f76364060104"
};
const CODE_SIGNING_OID_HEX = "2b06010505070303";
const APPROVED_APPLE_ROOT_FINGERPRINTS = new Set([
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79",
  "B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24",
  "C2:B9:B0:42:DD:57:83:0E:7D:11:7D:AC:55:AC:8A:E1:94:07:D3:8E:41:D8:8F:32:15:BC:3A:89:04:44:A0:50"
]);

export class AppleWalletPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = "AppleWalletPreflightError";
    this.code = code;
  }
}

const fail = (code) => {
  throw new AppleWalletPreflightError(code);
};

const readDerLength = (buffer, offset) => {
  const first = buffer[offset];
  if (first < 0x80) return { length: first, bytes: 1 };
  const count = first & 0x7f;
  if (count < 1 || count > 4 || offset + count >= buffer.length) fail("APPLE_DER_INVALID");
  let length = 0;
  for (let index = 1; index <= count; index += 1) length = (length << 8) | buffer[offset + index];
  return { length, bytes: count + 1 };
};

const readDerElement = (buffer, offset) => {
  if (offset + 2 > buffer.length) fail("APPLE_DER_INVALID");
  const tag = buffer[offset];
  const size = readDerLength(buffer, offset + 1);
  const start = offset + 1 + size.bytes;
  const end = start + size.length;
  if (end > buffer.length) fail("APPLE_DER_INVALID");
  return { tag, start, end, next: end, value: buffer.subarray(start, end) };
};

const extensionDetails = (certificate, oidHex) => {
  const oid = Buffer.from(oidHex, "hex");
  const marker = Buffer.concat([Buffer.from([0x06, oid.length]), oid]);
  const index = certificate.raw.indexOf(marker);
  if (index < 0) return null;
  let cursor = index + marker.length;
  let element = readDerElement(certificate.raw, cursor);
  let critical = false;
  if (element.tag === 0x01) {
    critical = element.value.length === 1 && element.value[0] !== 0;
    cursor = element.next;
    element = readDerElement(certificate.raw, cursor);
  }
  if (element.tag !== 0x04) fail("APPLE_EXTENSION_INVALID");
  return { payload: element.value, critical };
};

const extensionPayload = (certificate, oidHex) =>
  extensionDetails(certificate, oidHex)?.payload ?? null;

const exactDnAttribute = (subject, key, expected) =>
  subject
    .split(/\n|,\s*(?=[A-Z][A-Z0-9.]*=)/)
    .some((entry) => entry.trim() === `${key}=${expected}`);

const parseInnerOctetString = (payload) => {
  const inner = readDerElement(payload, 0);
  if (inner.tag !== 0x04 || inner.next !== payload.length) fail("APPLE_EXTENSION_INVALID");
  return inner.value;
};

const parseAuthorityKeyIdentifier = (payload) => {
  const sequence = readDerElement(payload, 0);
  if (sequence.tag !== 0x30) fail("APPLE_AKI_INVALID");
  let cursor = sequence.start;
  while (cursor < sequence.end) {
    const element = readDerElement(payload, cursor);
    if (element.tag === 0x80) return element.value;
    cursor = element.next;
  }
  fail("APPLE_AKI_INVALID");
};

const readZipEntries = (buffer) =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, archive) => {
      if (error || !archive) return reject(error ?? new Error("zip_open_failed"));
      const entries = new Map();
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return archive.readEntry();
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error("zip_stream_failed"));
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            archive.readEntry();
          });
        });
      });
      archive.on("end", () => resolve(entries));
      archive.readEntry();
    });
  });

const verifyDetachedCms = ({ signature, manifest }) =>
  new Promise((resolve, reject) => {
    const child = spawn("openssl", [
      "cms",
      "-verify",
      "-inform",
      "DER",
      "-binary",
      "-in",
      "/dev/stdin",
      "-content",
      "/dev/fd/3",
      "-noverify",
      "-out",
      "/dev/null"
    ], { stdio: ["pipe", "ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", () => { stderr = "verification_failed"; });
    // OpenSSL can close either input early for an intentionally invalid CMS.
    // The child exit status is the authoritative, redacted verification result.
    child.stdin.on("error", () => {});
    child.stdio[3].on("error", () => {});
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve(true) : reject(new Error(stderr)));
    child.stdin.end(signature);
    child.stdio[3].end(manifest);
  });

const encryptedPrivateKey = (value) =>
  /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(value) ||
  (value.includes(["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ")) &&
    /Proc-Type:\s*4,ENCRYPTED/i.test(value));

export const validateAppleWalletPreflight = async ({
  passTypeIdentifier,
  teamIdentifier,
  certificatePem,
  encryptedPrivateKeyPem,
  passphrase,
  wwdrCertificatePem,
  trustedRootCertificatePem,
  now = new Date(),
  minimumRemainingDays = 30,
  allowSyntheticRoot = false,
  archiveMutationForTest = null
}) => {
  if (
    !passTypeIdentifier ||
    !teamIdentifier ||
    !certificatePem ||
    !encryptedPrivateKeyPem ||
    !passphrase ||
    !wwdrCertificatePem ||
    !trustedRootCertificatePem
  ) {
    fail("APPLE_SET_INCOMPLETE");
  }
  if (!encryptedPrivateKey(encryptedPrivateKeyPem)) fail("APPLE_KEY_NOT_ENCRYPTED");

  let leaf;
  let wwdr;
  let root;
  let privateKey;
  try {
    leaf = new X509Certificate(certificatePem);
    wwdr = new X509Certificate(wwdrCertificatePem);
    root = new X509Certificate(trustedRootCertificatePem);
    privateKey = createPrivateKey({ key: encryptedPrivateKeyPem, passphrase });
  } catch {
    fail("APPLE_MATERIAL_PARSE_FAILED");
  }
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  ) {
    fail("APPLE_RSA_STRENGTH_INVALID");
  }
  if (!leaf.checkPrivateKey(privateKey)) fail("APPLE_KEY_CERT_MISMATCH");
  if (!exactDnAttribute(leaf.subject, "UID", passTypeIdentifier)) fail("APPLE_PASS_ID_MISMATCH");
  if (!exactDnAttribute(leaf.subject, "OU", teamIdentifier)) fail("APPLE_TEAM_ID_MISMATCH");

  const notBefore = new Date(leaf.validFromDate ?? leaf.validFrom);
  const notAfter = new Date(leaf.validToDate ?? leaf.validTo);
  if (Number.isNaN(notBefore.valueOf()) || Number.isNaN(notAfter.valueOf())) {
    fail("APPLE_CERT_DATES_INVALID");
  }
  if (now < notBefore || now >= notAfter) fail("APPLE_CERT_NOT_CURRENT");
  if (notAfter.valueOf() - now.valueOf() < minimumRemainingDays * 86_400_000) {
    fail("APPLE_CERT_RENEWAL_REQUIRED");
  }

  const keyUsageExtension = extensionDetails(leaf, REQUIRED_EXTENSION_HEX.keyUsage);
  const keyUsage = keyUsageExtension?.payload;
  const keyUsageBits = keyUsage ? readDerElement(keyUsage, 0) : null;
  if (
    !keyUsageBits ||
    keyUsageBits.tag !== 0x03 ||
    keyUsageBits.value.length < 2 ||
    (keyUsageBits.value[1] & 0x80) === 0 ||
    keyUsageExtension?.critical !== true
  ) fail("APPLE_LEAF_KEY_USAGE_INVALID");
  const extendedKeyUsage = extensionPayload(leaf, REQUIRED_EXTENSION_HEX.extendedKeyUsage);
  if (!extendedKeyUsage?.includes(Buffer.from(CODE_SIGNING_OID_HEX, "hex"))) {
    fail("APPLE_LEAF_EXTENDED_KEY_USAGE_INVALID");
  }
  const applePassType = extensionDetails(leaf, REQUIRED_EXTENSION_HEX.applePassType);
  if (!applePassType || applePassType.payload.length === 0 || applePassType.critical !== true) {
    fail("APPLE_PASS_TYPE_EXTENSION_INVALID");
  }
  const leafAkiPayload = extensionPayload(leaf, REQUIRED_EXTENSION_HEX.authorityKeyIdentifier);
  const wwdrSkiPayload = extensionPayload(wwdr, REQUIRED_EXTENSION_HEX.subjectKeyIdentifier);
  if (!leafAkiPayload || !wwdrSkiPayload) fail("APPLE_KEY_IDENTIFIER_MISSING");
  const leafAki = parseAuthorityKeyIdentifier(leafAkiPayload);
  const wwdrSki = parseInnerOctetString(wwdrSkiPayload);
  if (!leafAki.equals(wwdrSki)) fail("APPLE_KEY_IDENTIFIER_MISMATCH");
  if (!leaf.checkIssued(wwdr) || !leaf.verify(wwdr.publicKey)) {
    fail("APPLE_WWDR_MISMATCH");
  }
  const wwdrNotBefore = new Date(wwdr.validFromDate ?? wwdr.validFrom);
  const wwdrNotAfter = new Date(wwdr.validToDate ?? wwdr.validTo);
  if (Number.isNaN(wwdrNotBefore.valueOf()) || Number.isNaN(wwdrNotAfter.valueOf())) {
    fail("APPLE_WWDR_DATES_INVALID");
  }
  if (now < wwdrNotBefore || now >= wwdrNotAfter) fail("APPLE_WWDR_NOT_CURRENT");
  if (!wwdr.checkIssued(root) || !wwdr.verify(root.publicKey)) {
    fail("APPLE_ROOT_CHAIN_INVALID");
  }
  if (!root.ca) fail("APPLE_ROOT_NOT_CA");
  if (!root.checkIssued(root) || !root.verify(root.publicKey)) fail("APPLE_ROOT_SELF_SIGNATURE_INVALID");
  const rootNotBefore = new Date(root.validFromDate ?? root.validFrom);
  const rootNotAfter = new Date(root.validToDate ?? root.validTo);
  if (now < rootNotBefore || now >= rootNotAfter) fail("APPLE_ROOT_NOT_CURRENT");
  if (!allowSyntheticRoot && !APPROVED_APPLE_ROOT_FINGERPRINTS.has(root.fingerprint256)) {
    fail("APPLE_ROOT_NOT_APPROVED");
  }

  const probe = Buffer.from("GOAL-007 synthetic Apple Wallet signing probe", "utf8");
  const signer = createSign("sha256");
  signer.update(probe);
  signer.end();
  const signature = signer.sign(privateKey);
  const verifier = createVerify("sha256");
  verifier.update(probe);
  verifier.end();
  if (!verifier.verify(leaf.publicKey, signature)) fail("APPLE_SIGNATURE_PROBE_FAILED");

  const { PKPass } = await import("passkit-generator");
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  let passBuffer;
  try {
    const pass = new PKPass(
      {
        "icon.png": pixel,
        "icon@2x.png": pixel,
        "pass.json": Buffer.from(
          JSON.stringify({
            formatVersion: 1,
            passTypeIdentifier,
            teamIdentifier,
            organizationName: "EGIA synthetic preflight",
            description: "GOAL-007 synthetic pass",
            serialNumber: "GOAL007_SYNTH",
            sharingProhibited: true,
            storeCard: {
              primaryFields: [{ key: "synthetic", label: "Synthetic", value: "GOAL-007" }]
            }
          })
        )
      },
      {
        wwdr: wwdrCertificatePem,
        signerCert: certificatePem,
        signerKey: encryptedPrivateKeyPem,
        signerKeyPassphrase: passphrase
      }
    );
    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: "GOAL007_SYNTH",
      messageEncoding: "iso-8859-1"
    });
    passBuffer = pass.getAsBuffer();
  } catch {
    fail("APPLE_PKCS7_PROBE_FAILED");
  }
  let entries;
  try {
    entries = await readZipEntries(passBuffer);
  } catch {
    fail("APPLE_PASS_ARCHIVE_INVALID");
  }
  if (archiveMutationForTest !== null) {
    if (!allowSyntheticRoot) fail("APPLE_TEST_MUTATION_FORBIDDEN");
    if (archiveMutationForTest === "manifest") {
      entries.set("manifest.json", Buffer.from("{invalid", "utf8"));
    } else if (archiveMutationForTest === "signature") {
      const signature = Buffer.from(entries.get("signature"));
      signature[0] ^= 0xff;
      entries.set("signature", signature);
    } else if (archiveMutationForTest === "pass-json" || archiveMutationForTest === "qr") {
      const mutated = JSON.parse(entries.get("pass.json").toString("utf8"));
      if (archiveMutationForTest === "pass-json") mutated.sharingProhibited = false;
      else mutated.barcodes = [];
      const mutatedBuffer = Buffer.from(JSON.stringify(mutated));
      entries.set("pass.json", mutatedBuffer);
      const mutatedManifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
      mutatedManifest["pass.json"] = createHash("sha1").update(mutatedBuffer).digest("hex");
      entries.set("manifest.json", Buffer.from(JSON.stringify(mutatedManifest)));
    } else {
      fail("APPLE_TEST_MUTATION_INVALID");
    }
  }
  for (const entry of ["pass.json", "manifest.json", "signature", "icon.png"]) {
    if (!entries.has(entry)) fail("APPLE_PASS_ARCHIVE_INVALID");
  }
  let manifest;
  let passJson;
  try {
    manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
    passJson = JSON.parse(entries.get("pass.json").toString("utf8"));
  } catch {
    fail("APPLE_PASS_JSON_INVALID");
  }
  for (const [name, content] of entries) {
    if (name === "manifest.json" || name === "signature") continue;
    const digest = createHash("sha1").update(content).digest("hex");
    if (manifest[name] !== digest) fail("APPLE_MANIFEST_HASH_INVALID");
  }
  if (
    Object.keys(manifest).some((name) => !entries.has(name)) ||
    Object.keys(manifest).length !== entries.size - 2
  ) {
    fail("APPLE_MANIFEST_CONTENT_INVALID");
  }
  if (
    passJson.passTypeIdentifier !== passTypeIdentifier ||
    passJson.teamIdentifier !== teamIdentifier ||
    passJson.sharingProhibited !== true ||
    !Array.isArray(passJson.barcodes) ||
    !passJson.barcodes.some(
      (barcode) => barcode.format === "PKBarcodeFormatQR" && barcode.message === "GOAL007_SYNTH"
    )
  ) {
    fail("APPLE_PASS_JSON_CONTRACT_INVALID");
  }
  try {
    await verifyDetachedCms({
      signature: entries.get("signature"),
      manifest: entries.get("manifest.json"),
      rootPem: trustedRootCertificatePem,
      wwdrPem: wwdrCertificatePem
    });
  } catch {
    fail("APPLE_PKCS7_SIGNATURE_INVALID");
  }

  return Object.freeze({
    ok: true,
    contentType: "application/vnd.apple.pkpass",
    sharingProhibited: true,
    qr: true,
    manifestVerified: true,
    pkcs7Verified: true,
    certificateValidUntil: notAfter.toISOString(),
    passArchiveSha256: createHash("sha256").update(passBuffer).digest("hex"),
    persistedMaterials: false
  });
};

export const redactAppleWalletPreflightError = (error) => ({
  ok: false,
  code:
    error instanceof AppleWalletPreflightError
      ? error.code
      : "APPLE_PREFLIGHT_FAILED"
});
