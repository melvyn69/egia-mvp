import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const jobs = {
  google: {
    jobId: 7132230,
    title: "Google — synchronisation des réponses",
    url: "https://egia-six.vercel.app/api/cron/google/sync-replies",
    schedule: {
      timezone: "Europe/Paris",
      expiresAt: 0,
      hours: [-1],
      minutes: [0],
      mdays: [-1],
      months: [-1],
      wdays: [-1]
    }
  },
  ai: {
    jobId: 7133264,
    title: "IA — étiquetage des avis",
    url: "https://egia-six.vercel.app/api/cron/ai/tag-reviews",
    schedule: {
      timezone: "Europe/Paris",
      expiresAt: 0,
      hours: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
      minutes: [0],
      mdays: [-1],
      months: [-1],
      wdays: [-1]
    }
  },
  automations: {
    jobId: 7201111,
    title: "Automatisations de réponses",
    url: "https://egia-six.vercel.app/api/reports/automations",
    schedule: {
      timezone: "Europe/Paris",
      expiresAt: 0,
      hours: [-1],
      minutes: [0, 30],
      mdays: [-1],
      months: [-1],
      wdays: [-1]
    }
  },
  monthly: {
    jobId: 7155832,
    title: "Rapports mensuels",
    url: "https://egia-six.vercel.app/api/cron/monthly-reports",
    schedule: {
      timezone: "Europe/Paris",
      expiresAt: 0,
      hours: [8],
      minutes: [0],
      mdays: [1],
      months: [-1],
      wdays: [-1]
    }
  }
};

const orders = {
  snapshot: ["google", "ai", "automations", "monthly"],
  suspend: ["google", "ai", "automations", "monthly"],
  restore: ["monthly", "automations", "ai", "google"],
  resume: ["monthly", "automations", "ai", "google"]
};
const volatileFields = new Set([
  "enabled",
  "lastStatus",
  "lastDuration",
  "lastExecution",
  "nextExecution",
  "sslCertExpiry"
]);

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !volatileFields.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)])
    );
  }
  return value;
};

const canonicalJson = (value) => JSON.stringify(stable(value));
const fingerprint = (job) =>
  createHash("sha256").update(canonicalJson(job)).digest("hex");

const redactHeaders = (headers) => {
  if (Array.isArray(headers)) {
    return headers.map((header) => ({
      ...header,
      value: "<redacted>"
    }));
  }
  if (headers && typeof headers === "object") {
    return Object.fromEntries(
      Object.keys(headers)
        .sort()
        .map((name) => [name, "<redacted>"])
    );
  }
  return headers;
};

const evidenceFor = (expected, job) => ({
  jobId: expected.jobId,
  title: job.title ?? expected.title,
  url: job.url ?? job.extendedData?.url,
  enabled: job.enabled,
  requestMethod: job.requestMethod ?? job.extendedData?.requestMethod,
  schedule: job.schedule,
  requestTimeout: job.requestTimeout ?? job.extendedData?.requestTimeout,
  redirectSuccess: job.redirectSuccess ?? job.extendedData?.redirectSuccess,
  folderId: job.folderId,
  notification: job.notification,
  saveResponses: job.saveResponses,
  auth: job.auth ? { enable: Boolean(job.auth.enable) } : job.auth,
  headers: redactHeaders(job.headers ?? job.extendedData?.headers),
  immutableConfigSha256: fingerprint(job)
});

const validateJob = (expected, job) => {
  assert.equal(job.jobId ?? job.id, expected.jobId, "unexpected cron jobId");
  assert.equal(
    job.url ?? job.extendedData?.url,
    expected.url,
    `unexpected URL for ${expected.jobId}`
  );
  assert.ok(
    [1, "POST"].includes(
      job.requestMethod ?? job.extendedData?.requestMethod
    ),
    `unexpected method for ${expected.jobId}`
  );
  assert.deepEqual(
    job.schedule,
    expected.schedule,
    `unexpected schedule for ${expected.jobId}`
  );
};

const validatePredictions = (expected, predictions) => {
  assert.equal(
    predictions.length,
    3,
    `expected three predictions for ${expected.jobId}`
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: expected.schedule.timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric"
  });
  const weekdayNumbers = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const allowed = (configured, value) =>
    configured.includes(-1) || configured.includes(value);
  for (const prediction of predictions) {
    assert.ok(
      Number.isInteger(prediction) && prediction > Date.now() / 1000 - 60,
      `invalid prediction for ${expected.jobId}`
    );
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(prediction * 1000))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    assert.ok(
      allowed(expected.schedule.months, Number(parts.month)) &&
        allowed(expected.schedule.mdays, Number(parts.day)) &&
        allowed(expected.schedule.wdays, weekdayNumbers[parts.weekday]) &&
        allowed(expected.schedule.hours, Number(parts.hour)) &&
        allowed(expected.schedule.minutes, Number(parts.minute)),
      `prediction does not match Europe/Paris schedule for ${expected.jobId}`
    );
  }
};

const readKey = () =>
  execFileSync(
    "security",
    [
      "find-generic-password",
      "-s",
      "CRON_JOB_ORG_API_KEY",
      "-a",
      process.env.USER,
      "-w"
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }
  ).trim();

const unwrapPayload = (payload) =>
  payload.jobDetails ?? payload.job ?? payload;

let lastRequestAt = 0;
const request = async (key, path, init = {}) => {
  const waitMs = Math.max(0, 220 - (Date.now() - lastRequestAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const response = await fetch(`https://api.cron-job.org/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/json" } : {})
    },
    signal: AbortSignal.timeout(15_000)
  });
  lastRequestAt = Date.now();
  if (!response.ok) {
    throw new Error(`cron-job.org request failed with status ${response.status}`);
  }
  const payload = await response.json();
  return unwrapPayload(payload);
};

const setEnabled = async (key, expected, enabled, beforeHash) => {
  await request(key, `jobs/${expected.jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ job: { enabled } })
  });
  const after = await request(key, `jobs/${expected.jobId}`);
  validateJob(expected, after);
  assert.equal(after.enabled, enabled, `enabled mismatch for ${expected.jobId}`);
  assert.equal(
    fingerprint(after),
    beforeHash,
    `immutable cron configuration drift for ${expected.jobId}`
  );
  if (!enabled) return { job: after, predictions: undefined };
  const history = await request(key, `jobs/${expected.jobId}/history`);
  const predictions = history.predictions ?? [];
  validatePredictions(expected, predictions);
  return { job: after, predictions };
};

const selfTest = () => {
  const sample = {
    jobId: jobs.google.jobId,
    title: jobs.google.title,
    url: jobs.google.url,
    enabled: true,
    requestMethod: 1,
    schedule: jobs.google.schedule,
    auth: { enable: true, user: "never-print-user", password: "never-print" },
    extendedData: {
      headers: [{ name: "x-cron-secret", value: "never-print-this" }]
    }
  };
  validateJob(jobs.google, sample);
  const hash = fingerprint(sample);
  assert.equal(
    hash,
    fingerprint({ ...sample, enabled: false, lastExecution: 123 })
  );
  const evidence = evidenceFor(jobs.google, sample);
  assert.equal(evidence.headers[0].value, "<redacted>");
  assert.deepEqual(evidence.auth, { enable: true });
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /never-print-this|never-print-user|never-print/
  );
  assert.deepEqual(
    unwrapPayload({ jobDetails: sample }),
    sample,
    "official jobDetails response wrapper must be supported"
  );
  assert.deepEqual(JSON.parse(JSON.stringify({ job: { enabled: false } })), {
    job: { enabled: false }
  });
  const future = Math.floor(Date.now() / 1000) + 3600;
  const nextHour = future - (future % 3600);
  validatePredictions(jobs.google, [nextHour, nextHour + 3600, nextHour + 7200]);
  console.log("GOAL-002 cron redaction and drift self-test passed.");
};

const command = process.argv[2];
if (command === "--self-test") {
  selfTest();
  process.exit(0);
}
const option = process.argv[3];
const optionPath = process.argv[4];
const validArguments =
  command === "snapshot"
    ? option === "--output" && Boolean(optionPath) && process.argv.length === 5
    : (command === "suspend" ||
        command === "restore" ||
        command === "resume") &&
      option === "--baseline" &&
      Boolean(optionPath) &&
      process.argv.length === 5;
if (!orders[command] || !validArguments) {
  console.error(
    "Usage: manage-goal-002-cron-jobs.mjs snapshot --output <file> | suspend|restore|resume --baseline <file> | --self-test"
  );
  process.exit(2);
}

let key;
try {
  key = readKey();
  assert.ok(key, "CRON_JOB_ORG_API_KEY is absent from the macOS keychain");
} catch {
  console.error("CRON_JOB_ORG_API_KEY is unavailable in the macOS keychain.");
  process.exit(2);
}

const result = [];
let baselineById = new Map();
if (command === "snapshot") {
  const listing = await request(key, "jobs");
  assert.equal(listing.someFailed, false, "cron-job.org listing is incomplete");
  const listedJobs = listing.jobs ?? [];
  for (const expected of Object.values(jobs)) {
    const matches = listedJobs.filter(
      (job) => (job.url ?? job.extendedData?.url) === expected.url
    );
    assert.equal(
      matches.length,
      1,
      `expected exactly one cron job for ${expected.url}`
    );
    assert.equal(
      matches[0].jobId ?? matches[0].id,
      expected.jobId,
      `unexpected listed jobId for ${expected.url}`
    );
  }
} else {
  const baseline = JSON.parse(readFileSync(optionPath, "utf8"));
  assert.equal(baseline.command, "snapshot", "invalid cron baseline Evidence");
  baselineById = new Map(
    baseline.jobs.map((job) => [
      job.jobId,
      {
        enabled: job.enabled,
        immutableConfigSha256: job.immutableConfigSha256
      }
    ])
  );
}

for (const name of orders[command]) {
  const expected = jobs[name];
  const before = await request(key, `jobs/${expected.jobId}`);
  validateJob(expected, before);
  const beforeHash = fingerprint(before);
  if (command !== "snapshot") {
    assert.equal(
      beforeHash,
      baselineById.get(expected.jobId)?.immutableConfigSha256,
      `cron drift before ${command} for ${expected.jobId}`
    );
  }
  const targetEnabled =
    command === "resume"
      ? true
      : command === "restore"
        ? baselineById.get(expected.jobId)?.enabled
        : false;
  const mutation =
    command === "snapshot"
      ? { job: before, predictions: undefined }
      : await setEnabled(key, expected, targetEnabled, beforeHash);
  result.push({
    ...evidenceFor(expected, mutation.job),
    ...(mutation.predictions
      ? { predictedExecutions: mutation.predictions }
      : {})
  });
}
key = "";
const evidence = JSON.stringify({ command, jobs: result }, null, 2);
if (command === "snapshot") {
  mkdirSync(dirname(optionPath), { recursive: true });
  writeFileSync(optionPath, `${evidence}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ command, evidenceFile: optionPath }));
} else {
  console.log(evidence);
}
