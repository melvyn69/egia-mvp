import { createPrivateKey, X509Certificate } from "node:crypto";

export const APPLE_WALLET_SECRET_KEYS = [
  "APPLE_PASS_PRIVATE_KEY",
  "APPLE_PASS_CERTIFICATE_PASSWORD",
  "APPLE_PASS_CERTIFICATE",
  "APPLE_WWDR_CERTIFICATE",
  "APPLE_PASS_TYPE_IDENTIFIER",
  "APPLE_TEAM_IDENTIFIER"
] as const;

export type AppleWalletSecretKey = (typeof APPLE_WALLET_SECRET_KEYS)[number];
export type EnvironmentReader = (name: string) => string | undefined;

export const readProcessEnvironment: EnvironmentReader = (name) =>
  process.env[name];

type DisabledAppleWalletConfig = {
  appleWalletEnabled: false;
};

export type EnabledAppleWalletConfig = {
  appleWalletEnabled: true;
  passTypeIdentifier: string;
  teamIdentifier: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase: string;
  wwdr: string;
  publicUrl: string;
};

export type AppleWalletRuntimeConfig =
  | DisabledAppleWalletConfig
  | EnabledAppleWalletConfig;

const normalizeCertificate = (value: string) => {
  const normalized = value.replace(/\\n/g, "\n").trim();
  if (normalized.includes("-----BEGIN")) return normalized;
  try {
    return Buffer.from(normalized, "base64").toString("utf8").trim();
  } catch {
    return normalized;
  }
};

const isEncryptedPrivateKey = (value: string) =>
  /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(value) ||
  (value.includes(["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ")) &&
    /Proc-Type:\s*4,ENCRYPTED/i.test(value));

const hasExactDnAttribute = (subject: string, key: string, expected: string) =>
  subject
    .split(/\n|,\s*(?=[A-Z][A-Z0-9.]*=)/)
    .some((entry) => entry.trim() === `${key}=${expected}`);

export const validateAppleWalletRuntimeMaterial = (input: {
  passTypeIdentifier: string;
  teamIdentifier: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase: string;
  wwdr: string;
}) => {
  if (!isEncryptedPrivateKey(input.signerKey) || !input.signerKeyPassphrase) {
    return false;
  }
  try {
    const signerCertificate = new X509Certificate(input.signerCert);
    const wwdrCertificate = new X509Certificate(input.wwdr);
    const privateKey = createPrivateKey({
      key: input.signerKey,
      passphrase: input.signerKeyPassphrase
    });
    if (
      privateKey.asymmetricKeyType !== "rsa" ||
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      return false;
    }
    if (!signerCertificate.checkPrivateKey(privateKey)) return false;
    if (
      !hasExactDnAttribute(
        signerCertificate.subject,
        "UID",
        input.passTypeIdentifier
      ) ||
      !hasExactDnAttribute(
        signerCertificate.subject,
        "OU",
        input.teamIdentifier
      )
    ) {
      return false;
    }
    const now = Date.now();
    if (
      now < new Date(signerCertificate.validFrom).valueOf() ||
      now >= new Date(signerCertificate.validTo).valueOf()
    ) {
      return false;
    }
    if (
      !signerCertificate.checkIssued(wwdrCertificate) ||
      !signerCertificate.verify(wwdrCertificate.publicKey)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const readTrimmed = (readEnvironment: EnvironmentReader, name: string) =>
  readEnvironment(name)?.trim() ?? "";

const readFirstNonEmpty = (
  readEnvironment: EnvironmentReader,
  names: string[]
) => {
  for (const name of names) {
    const value = readTrimmed(readEnvironment, name);
    if (value) return value;
  }
  return "";
};

export const getAppleWalletRuntimeConfig = (
  readEnvironment: EnvironmentReader = readProcessEnvironment
): AppleWalletRuntimeConfig => {
  const flag = readEnvironment("APPLE_WALLET_ENABLED");

  // Absent, explicit false, empty or malformed values all fail closed. Most
  // importantly, none of the six Apple inputs are touched on this path.
  if (flag !== "true") {
    return { appleWalletEnabled: false };
  }

  const signerKeyRaw = readTrimmed(
    readEnvironment,
    "APPLE_PASS_PRIVATE_KEY"
  );
  const signerKeyPassphrase = readTrimmed(
    readEnvironment,
    "APPLE_PASS_CERTIFICATE_PASSWORD"
  );
  const signerCertRaw = readTrimmed(
    readEnvironment,
    "APPLE_PASS_CERTIFICATE"
  );
  const wwdrRaw = readTrimmed(readEnvironment, "APPLE_WWDR_CERTIFICATE");
  const passTypeIdentifier = readTrimmed(
    readEnvironment,
    "APPLE_PASS_TYPE_IDENTIFIER"
  );
  const teamIdentifier = readTrimmed(
    readEnvironment,
    "APPLE_TEAM_IDENTIFIER"
  );
  const publicUrlRaw = readFirstNonEmpty(readEnvironment, [
    "APP_PUBLIC_URL",
    "APP_BASE_URL",
    "VITE_APP_BASE_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL"
  ]);

  if (
    !signerKeyRaw ||
    !signerKeyPassphrase ||
    !signerCertRaw ||
    !wwdrRaw ||
    !passTypeIdentifier ||
    !teamIdentifier ||
    !publicUrlRaw
  ) {
    return { appleWalletEnabled: false };
  }

  const signerKey = normalizeCertificate(signerKeyRaw);
  const signerCert = normalizeCertificate(signerCertRaw);
  const wwdr = normalizeCertificate(wwdrRaw);
  if (
    !validateAppleWalletRuntimeMaterial({
      passTypeIdentifier,
      teamIdentifier,
      signerCert,
      signerKey,
      signerKeyPassphrase,
      wwdr
    })
  ) {
    return { appleWalletEnabled: false };
  }

  return {
    appleWalletEnabled: true,
    passTypeIdentifier,
    teamIdentifier,
    signerCert,
    signerKey,
    signerKeyPassphrase,
    wwdr,
    publicUrl: publicUrlRaw.startsWith("http")
      ? publicUrlRaw
      : `https://${publicUrlRaw}`
  };
};
