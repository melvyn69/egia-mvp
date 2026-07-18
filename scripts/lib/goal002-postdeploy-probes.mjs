import { randomUUID } from "node:crypto";
import { SyntheticRunnerError } from "./goal002-synth-runner.mjs";

const EXPECTED = Object.freeze([
  ["auth-a", 200],
  ["auth-b", 200],
  ["tenant-a-own", 200],
  ["tenant-b-own", 200],
  ["idor-a-from-b", 403],
  ["privileged-rpc-as-a", 403],
  ["ai-a", 200],
  ["ai-a-resource-from-b", 403],
  ["loyalty-new-request", 202],
  ["loyalty-existing-request", 202],
  ["loyalty-capability-before-proof", 404],
  ["loyalty-proof-consume", 200],
  ["loyalty-proof-replay", 410],
  ["invitation-a", 200],
  ["invitation-a-from-b", 403],
  ["asset-a", 200],
  ["asset-a-from-b", 403],
  ["edge-without-auth", 401],
  ["edge-wrong-tenant", 403],
  ["quota-a-within-limit", 200],
  ["quota-a-exceeded", 429],
  ["cron-without-secret", 401],
  ["cron-wrong-secret", 401]
]);

const genericEnrollmentShape = (body) => {
  if (!body || typeof body !== "object") return "";
  const { requestId: _requestId, ...stable } = body;
  return JSON.stringify(stable);
};

const containsCapability = (value) => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsCapability);
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return /(member|wallet|qrcode|capability|token|pass)/.test(normalized) || containsCapability(nested);
  });
};

export const executeGoal002PostdeployProbes = async ({ request, inspectLogs }) => {
  if (typeof request !== "function") throw new SyntheticRunnerError("POSTDEPLOY_REQUEST_INVALID");
  const results = new Map();
  let unexpected5xx = 0;
  for (const [name, expectedStatus] of EXPECTED) {
    let response;
    try {
      response = await request(name);
    } catch {
      throw new SyntheticRunnerError("POSTDEPLOY_NETWORK_FAILURE");
    }
    const status = Number(response?.status);
    if (status >= 500) unexpected5xx += 1;
    if (status !== expectedStatus) {
      throw new SyntheticRunnerError(`POSTDEPLOY_${name.toUpperCase().replace(/-/g, "_")}_FAILED`);
    }
    results.set(name, response);
  }
  if (unexpected5xx !== 0) throw new SyntheticRunnerError("POSTDEPLOY_UNEXPECTED_5XX");
  const newEnrollment = genericEnrollmentShape(results.get("loyalty-new-request")?.body);
  const existingEnrollment = genericEnrollmentShape(results.get("loyalty-existing-request")?.body);
  if (
    containsCapability(results.get("loyalty-new-request")?.body) ||
    containsCapability(results.get("loyalty-existing-request")?.body)
  ) {
    throw new SyntheticRunnerError("LOYALTY_CAPABILITY_PREPROOF_LEAK");
  }
  if (!newEnrollment || newEnrollment !== existingEnrollment) {
    throw new SyntheticRunnerError("LOYALTY_ENUMERATION_RESPONSE_DRIFT");
  }
  if (typeof inspectLogs !== "function") {
    throw new SyntheticRunnerError("POSTDEPLOY_LOG_INSPECTION_REQUIRED");
  }
  const logEvidence = await inspectLogs();
  if (
    !logEvidence ||
    logEvidence.checked !== true ||
    logEvidence.vercel !== true ||
    logEvidence.supabaseEdge !== true ||
    logEvidence.sensitiveMatches !== 0 ||
    logEvidence.unexpected5xx !== 0
  ) {
    throw new SyntheticRunnerError("POSTDEPLOY_LOG_INSPECTION_FAILED");
  }
  return Object.freeze({
    ok: true,
    probes: EXPECTED.length,
    unexpected5xx: 0,
    loyaltyEnumerationSafe: true,
    oneShotReplayDenied: true,
    logsInspected: true,
    secretsObserved: false
  });
};

export const GOAL002_POSTDEPLOY_PROBE_NAMES = EXPECTED.map(([name]) => name);

const LOCAL_STATUSES = new Map(EXPECTED);

export const createLocalGoal002ProbeRequest = () => async (name) => ({
  status: LOCAL_STATUSES.get(name),
  body:
    name === "loyalty-new-request" || name === "loyalty-existing-request"
      ? {
          ok: true,
          message: "If eligible, a verification message has been sent",
          requestId: randomUUID()
        }
      : { ok: true }
});
