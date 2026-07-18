import { randomBytes, randomUUID } from "node:crypto";

const APPLY_MARKER = "GOAL007_PREREQUISITE_SECRET_APPLY_V1";
const DEFAULT_TIMEOUT_MS = 10_000;
const PROJECT_REF = "fhadiwkdznhuxtlgrwfd";
const PROJECT_ID = "prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT";
const TEAM_ID = "team_zfHqQFVkGjeOVDHZTYvfkMmW";
const ALLOWED_SECRET_NAMES = new Set([
  "INTERNAL_API_KEY_SLOT_A",
  "INTERNAL_API_KEY_SLOT_B",
  "APPLE_PASS_PRIVATE_KEY",
  "APPLE_PASS_CERTIFICATE_PASSWORD",
  "APPLE_PASS_CERTIFICATE",
  "APPLE_WWDR_CERTIFICATE",
  "APPLE_PASS_TYPE_IDENTIFIER",
  "APPLE_TEAM_IDENTIFIER"
]);
const APPLE_SECRET_NAMES = Object.freeze([
  "APPLE_PASS_TYPE_IDENTIFIER",
  "APPLE_TEAM_IDENTIFIER",
  "APPLE_PASS_CERTIFICATE",
  "APPLE_PASS_PRIVATE_KEY",
  "APPLE_PASS_CERTIFICATE_PASSWORD",
  "APPLE_WWDR_CERTIFICATE"
]);

export class ProvisioningError extends Error {
  constructor(code, state = "NO_WRITES", outcomeUnknown = false) {
    super(code);
    this.name = "ProvisioningError";
    this.code = code;
    this.state = state;
    this.outcomeUnknown = outcomeUnknown;
  }
}

export class MemorySecretSource {
  #value;

  constructor(value) {
    this.#value = Buffer.from(value);
  }

  static generatedInternalKey() {
    return new MemorySecretSource(randomBytes(32).toString("base64url"));
  }

  async use(callback) {
    if (!this.#value) throw new ProvisioningError("SECRET_SOURCE_CONSUMED");
    const value = this.#value.toString("utf8");
    try {
      return await callback(value);
    } finally {
      this.#value.fill(0);
      this.#value = null;
    }
  }
}

const officialEndpoints = () => ({
  vercel: `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&upsert=true`,
  supabase: `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`
});

const resolveEndpoints = ({ endpoints, allowLocalHttp }) => {
  if (!endpoints) return officialEndpoints();
  if (!allowLocalHttp) throw new ProvisioningError("ENDPOINT_OVERRIDE_FORBIDDEN");
  const resolved = {};
  for (const target of ["vercel", "supabase"]) {
    const parsed = new URL(endpoints[target]);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
      throw new ProvisioningError("TEST_ENDPOINT_FORBIDDEN");
    }
    resolved[target] = parsed.toString();
  }
  return resolved;
};

const safeRequest = async ({ fetchImpl, url, headers, body, signal, timeoutMs }) => {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
  } catch {
    throw new ProvisioningError("REMOTE_OUTCOME_UNKNOWN", "UNCLASSIFIED", true);
  }
  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    const status = [401, 403, 409, 429].includes(response.status)
      ? response.status
      : response.status >= 500
        ? 500
        : 400;
    const outcomeUnknown = ![400, 401, 403].includes(status);
    throw new ProvisioningError(`HTTP_${status}`, "UNCLASSIFIED", outcomeUnknown);
  }
};

const assertIdentity = ({ secretName, projectRef, projectId }) => {
  if (!ALLOWED_SECRET_NAMES.has(secretName)) throw new ProvisioningError("SECRET_NAME_FORBIDDEN");
  if (projectRef !== PROJECT_REF) throw new ProvisioningError("SUPABASE_PROJECT_FORBIDDEN");
  if (projectId !== PROJECT_ID) throw new ProvisioningError("VERCEL_PROJECT_FORBIDDEN");
};

export const planSecretProvisioning = ({ secretName, projectRef, projectId }) => {
  assertIdentity({ secretName, projectRef, projectId });
  return {
    ok: true,
    mode: "plan",
    secretName,
    targets: ["vercel-production-next-deployment", "supabase-edge-immediate"],
    activation: false,
    capturedByDeployment: false,
    recovery: "UNKNOWN_OUTCOME_REWRITE_ALL_FROM_SAME_SOURCE"
  };
};

const validateTargetOrder = (targetOrder) => {
  const joined = targetOrder.join(",");
  if (joined !== "vercel,supabase" && joined !== "supabase,vercel") {
    throw new ProvisioningError("TARGET_ORDER_FORBIDDEN");
  }
};

const targetsForResume = (resumeFrom, targetOrder) => {
  if (resumeFrom === "NO_WRITES") return targetOrder;
  if (resumeFrom === "VERCEL_WRITTEN_NOT_CAPTURED") return ["supabase"];
  if (resumeFrom === "SUPABASE_WRITTEN") return ["vercel"];
  if (resumeFrom === "BOTH_WRITTEN_INACTIVE") return [];
  if (resumeFrom === "REWRITE_ALL_AFTER_UNKNOWN") return targetOrder;
  throw new ProvisioningError("RECONCILIATION_REQUIRED", resumeFrom, true);
};

const unknownState = ({ target, vercelWritten, supabaseWritten }) => {
  if (target === "vercel") {
    return supabaseWritten
      ? "SUPABASE_WRITTEN_VERCEL_OUTCOME_UNKNOWN"
      : "VERCEL_OUTCOME_UNKNOWN";
  }
  return vercelWritten
    ? "VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN"
    : "SUPABASE_OUTCOME_UNKNOWN";
};

export const reconcileProvisioningState = async ({ inspectTarget }) => {
  if (typeof inspectTarget !== "function") throw new ProvisioningError("INSPECTOR_REQUIRED");
  const observed = {};
  for (const target of ["vercel", "supabase"]) {
    const status = await inspectTarget(target).catch(() => "unknown");
    if (status !== "present" && status !== "absent") {
      throw new ProvisioningError("RECONCILIATION_INCONCLUSIVE", `${target.toUpperCase()}_OUTCOME_UNKNOWN`, true);
    }
    observed[target] = status;
  }
  return "REWRITE_ALL_AFTER_UNKNOWN";
};

export const provisionSecretAcrossPlatforms = async ({
  mode,
  marker,
  secretName,
  secretSource,
  vercelAccessToken,
  supabaseAccessToken,
  projectRef = PROJECT_REF,
  projectId = PROJECT_ID,
  fetchImpl = fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  targetOrder = ["vercel", "supabase"],
  resumeFrom = "NO_WRITES",
  vercelDeploymentState = "not-captured",
  allowLocalHttp = false,
  endpoints
}) => {
  const plan = planSecretProvisioning({ secretName, projectRef, projectId });
  if (mode === "plan") return plan;
  if (mode !== "apply" || marker !== APPLY_MARKER) {
    throw new ProvisioningError("APPLY_NOT_AUTHORIZED");
  }
  validateTargetOrder(targetOrder);
  if (vercelDeploymentState === "captured") {
    throw new ProvisioningError("VERCEL_SECRET_ALREADY_CAPTURED");
  }
  if (vercelDeploymentState !== "not-captured") {
    throw new ProvisioningError("VERCEL_DEPLOYMENT_STATE_INVALID");
  }
  if (!secretSource || typeof secretSource.use !== "function") {
    throw new ProvisioningError("SECRET_SOURCE_INVALID");
  }
  if (!vercelAccessToken || !supabaseAccessToken) {
    throw new ProvisioningError("CONTROL_TOKEN_MISSING");
  }

  const targets = targetsForResume(resumeFrom, targetOrder);
  if (targets.length === 0) {
    return {
      ok: true,
      mode: "apply",
      operationId: randomUUID(),
      vercel: "WRITTEN_NOT_CAPTURED",
      supabase: "WRITTEN_IMMEDIATE",
      activation: false,
      recovery: "NONE"
    };
  }
  const resolved = resolveEndpoints({ endpoints, allowLocalHttp });
  const operationId = randomUUID();

  return secretSource.use(async (secretValue) => {
    let vercelWritten = resumeFrom === "VERCEL_WRITTEN_NOT_CAPTURED";
    let supabaseWritten = resumeFrom === "SUPABASE_WRITTEN";
    let currentTarget = null;
    const writeTarget = async (target) => {
      currentTarget = target;
      if (target === "vercel") {
        await safeRequest({
          fetchImpl,
          url: resolved.vercel,
          headers: {
            authorization: `Bearer ${vercelAccessToken}`,
            "content-type": "application/json"
          },
          body: { key: secretName, value: secretValue, type: "sensitive", target: ["production"] },
          signal,
          timeoutMs
        });
        vercelWritten = true;
        return;
      }
      await safeRequest({
        fetchImpl,
        url: resolved.supabase,
        headers: {
          authorization: `Bearer ${supabaseAccessToken}`,
          "content-type": "application/json"
        },
        body: [{ name: secretName, value: secretValue }],
        signal,
        timeoutMs
      });
      supabaseWritten = true;
    };

    try {
      for (const target of targets) await writeTarget(target);
    } catch (error) {
      if (error instanceof ProvisioningError && error.outcomeUnknown) {
        throw new ProvisioningError(
          error.code,
          unknownState({ target: currentTarget, vercelWritten, supabaseWritten }),
          true
        );
      }
      const state = vercelWritten
        ? "VERCEL_WRITTEN_NOT_CAPTURED"
        : supabaseWritten
          ? "SUPABASE_WRITTEN"
          : "NO_WRITES";
      throw new ProvisioningError(
        error instanceof ProvisioningError ? error.code : "PROVISIONING_FAILED",
        state
      );
    }
    return {
      ok: true,
      mode: "apply",
      operationId,
      vercel: "WRITTEN_NOT_CAPTURED",
      supabase: "WRITTEN_IMMEDIATE",
      activation: false,
      recovery: "NONE"
    };
  });
};

const useSecretSet = async (sources, index, values, callback) => {
  if (index === APPLE_SECRET_NAMES.length) return callback(values);
  const name = APPLE_SECRET_NAMES[index];
  const source = sources[name];
  if (!source || typeof source.use !== "function") {
    throw new ProvisioningError("APPLE_SECRET_SET_INCOMPLETE");
  }
  return source.use(async (value) => {
    if (!value) throw new ProvisioningError("APPLE_SECRET_SET_INCOMPLETE");
    values[name] = value;
    try {
      return await useSecretSet(sources, index + 1, values, callback);
    } finally {
      values[name] = "";
    }
  });
};

export const provisionAppleWalletSetAcrossPlatforms = async ({
  mode,
  marker,
  applePreflightApproved,
  secretSources,
  vercelAccessToken,
  supabaseAccessToken,
  projectRef = PROJECT_REF,
  projectId = PROJECT_ID,
  fetchImpl = fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  resumeFrom = "NO_WRITES",
  allowLocalHttp = false,
  endpoints
}) => {
  for (const name of APPLE_SECRET_NAMES) assertIdentity({ secretName: name, projectRef, projectId });
  if (mode === "plan") {
    return {
      ok: true,
      mode: "plan",
      secretNames: APPLE_SECRET_NAMES,
      targets: ["vercel-production-next-deployment", "supabase-edge-immediate"],
      activation: false,
      recovery: "UNKNOWN_OUTCOME_REWRITE_COMPLETE_SET_FROM_SAME_SOURCES"
    };
  }
  if (
    mode !== "apply" ||
    marker !== APPLY_MARKER ||
    applePreflightApproved !== true
  ) {
    throw new ProvisioningError("APPLE_SET_APPLY_NOT_AUTHORIZED");
  }
  if (!vercelAccessToken || !supabaseAccessToken) {
    throw new ProvisioningError("CONTROL_TOKEN_MISSING");
  }
  if (!secretSources || Object.keys(secretSources).some((name) => !APPLE_SECRET_NAMES.includes(name))) {
    throw new ProvisioningError("APPLE_SECRET_SET_INVALID");
  }
  const resolved = resolveEndpoints({ endpoints, allowLocalHttp });
  const operationId = randomUUID();
  const targets =
    resumeFrom === "NO_WRITES"
      ? ["vercel", "supabase"]
      : resumeFrom === "REWRITE_APPLE_SET_AFTER_UNKNOWN"
        ? ["vercel", "supabase"]
      : resumeFrom === "VERCEL_APPLE_SET_WRITTEN_NOT_CAPTURED"
        ? ["supabase"]
        : resumeFrom === "SUPABASE_APPLE_SET_WRITTEN"
          ? ["vercel"]
          : null;
  if (!targets) throw new ProvisioningError("APPLE_SET_RECONCILIATION_REQUIRED", resumeFrom, true);
  return useSecretSet(secretSources, 0, {}, async (values) => {
    let vercelWritten = resumeFrom === "VERCEL_APPLE_SET_WRITTEN_NOT_CAPTURED";
    let supabaseWritten = resumeFrom === "SUPABASE_APPLE_SET_WRITTEN";
    let currentTarget = null;
    try {
      for (const target of targets) {
        currentTarget = target;
        if (target === "vercel") {
          await safeRequest({
            fetchImpl,
            url: resolved.vercel,
            headers: {
              authorization: `Bearer ${vercelAccessToken}`,
              "content-type": "application/json"
            },
            body: APPLE_SECRET_NAMES.map((name) => ({
              key: name,
              value: values[name],
              type: "sensitive",
              target: ["production"]
            })),
            signal,
            timeoutMs
          });
          vercelWritten = true;
        } else {
          await safeRequest({
            fetchImpl,
            url: resolved.supabase,
            headers: {
              authorization: `Bearer ${supabaseAccessToken}`,
              "content-type": "application/json"
            },
            body: APPLE_SECRET_NAMES.map((name) => ({ name, value: values[name] })),
            signal,
            timeoutMs
          });
          supabaseWritten = true;
        }
      }
    } catch (error) {
      if (error instanceof ProvisioningError && error.outcomeUnknown) {
        throw new ProvisioningError(
          error.code,
          currentTarget === "supabase"
            ? (vercelWritten
                ? "VERCEL_APPLE_SET_WRITTEN_SUPABASE_OUTCOME_UNKNOWN"
                : "SUPABASE_APPLE_SET_OUTCOME_UNKNOWN")
            : (supabaseWritten
                ? "SUPABASE_APPLE_SET_WRITTEN_VERCEL_OUTCOME_UNKNOWN"
                : "VERCEL_APPLE_SET_OUTCOME_UNKNOWN"),
          true
        );
      }
      throw new ProvisioningError(
        error instanceof ProvisioningError ? error.code : "APPLE_SET_PROVISIONING_FAILED",
        vercelWritten ? "VERCEL_APPLE_SET_WRITTEN_NOT_CAPTURED" : "NO_WRITES"
      );
    }
    return {
      ok: true,
      mode: "apply",
      operationId,
      vercel: "APPLE_SET_WRITTEN_NOT_CAPTURED",
      supabase: "APPLE_SET_WRITTEN_IMMEDIATE",
      activation: false,
      recovery: "NONE"
    };
  });
};

export const serializeProvisioningResult = (value) => {
  if (value instanceof ProvisioningError) {
    return JSON.stringify({ ok: false, code: value.code, state: value.state });
  }
  return JSON.stringify({
    ok: value?.ok === true,
    mode: value?.mode,
    operationId: value?.operationId,
    vercel: value?.vercel,
    supabase: value?.supabase,
    activation: value?.activation,
    recovery: value?.recovery
  });
};

export const GOAL007_APPLY_MARKER = APPLY_MARKER;
export const GOAL007_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const GOAL007_APPLE_SECRET_NAMES = APPLE_SECRET_NAMES;
