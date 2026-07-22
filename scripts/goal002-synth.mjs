#!/usr/bin/env node

import {
  consumeFounderPrerequisiteEmails,
  modeRequiresRemoteMailbox,
  runGoal002Synthetic,
  SyntheticRunnerError
} from "./lib/goal002-synth-runner.mjs";
import { SupabaseLocalSyntheticAdapter } from "./lib/goal002-supabase-local-adapter.mjs";
import { HttpsOneShotMailboxProvider } from "./lib/goal002-mailbox-provider.mjs";
import { createProductionGoal002ProbeRequest } from "./lib/goal002-production-probe-request.mjs";
import { HttpsRedactedLogInspector } from "./lib/goal002-log-inspector-provider.mjs";

const args = process.argv.slice(2);
const modeIndex = args.indexOf("--mode");
const mode = modeIndex >= 0 ? args[modeIndex + 1] : "";
const marker = process.env.GOAL002_SYNTH_AUTHORIZED;
const localAuthorized = marker === "GOAL002_SYNTH_LOCAL_V1";
const productionAuthorized =
  (mode === "prerequisite" && marker === "GOAL002_SYNTH_PREREQUISITE_V1") ||
  (mode === "postdeploy" && marker === "GOAL002_SYNTH_POSTDEPLOY_V1");
if (
  !["prerequisite", "postdeploy"].includes(mode) ||
  (!localAuthorized && !productionAuthorized) ||
  process.env.SUPABASE_ACCESS_TOKEN
) {
  console.error(JSON.stringify({ ok: false, code: "SYNTHETIC_RUN_NOT_AUTHORIZED" }));
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let founderEmails;
try {
  founderEmails = productionAuthorized && mode === "prerequisite"
    ? consumeFounderPrerequisiteEmails(process.env)
    : undefined;
} catch (error) {
  const errorCode = error instanceof SyntheticRunnerError
    ? error.code
    : "FOUNDER_EMAILS_INVALID";
  console.log(JSON.stringify({ ok: false, mode, errorCode, teardown: false }));
  process.exit(5);
}
const remoteMailboxRequired = productionAuthorized && modeRequiresRemoteMailbox(mode);
const emailDomain = founderEmails
  ? undefined
  : (process.env.GOAL002_SYNTH_EMAIL_DOMAIN ?? "goal002.invalid");
const mailboxEndpoint = remoteMailboxRequired
  ? process.env.GOAL002_SYNTH_MAILBOX_ENDPOINT
  : undefined;
const mailboxAccessToken = remoteMailboxRequired
  ? process.env.GOAL002_SYNTH_MAILBOX_ACCESS_TOKEN
  : undefined;
const aiQuotaLimit = Number(process.env.GOAL002_SYNTH_AI_QUOTA_LIMIT);
const logInspectorEndpoint = process.env.GOAL002_SYNTH_LOG_INSPECTOR_ENDPOINT;
const logInspectorToken = process.env.GOAL002_SYNTH_LOG_INSPECTOR_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GOAL002_SYNTH_EMAIL_DOMAIN;
delete process.env.GOAL002_SYNTH_MAILBOX_ENDPOINT;
delete process.env.GOAL002_SYNTH_MAILBOX_ACCESS_TOKEN;
delete process.env.GOAL002_SYNTH_AI_QUOTA_LIMIT;
delete process.env.GOAL002_SYNTH_LOG_INSPECTOR_ENDPOINT;
delete process.env.GOAL002_SYNTH_LOG_INSPECTOR_TOKEN;

let result;
try {
  const adapter = new SupabaseLocalSyntheticAdapter({
    url,
    anonKey,
    serviceRoleKey,
    productionAuthorized,
    postdeployRequest:
      productionAuthorized && mode === "postdeploy"
        ? createProductionGoal002ProbeRequest({
            supabaseUrl: url,
            anonKey,
            aiQuotaLimit,
            logInspector: new HttpsRedactedLogInspector({
              endpoint: logInspectorEndpoint,
              accessToken: logInspectorToken
            })
          })
        : undefined
  });
  const mailbox = remoteMailboxRequired
    ? new HttpsOneShotMailboxProvider({
        endpoint: mailboxEndpoint,
        accessToken: mailboxAccessToken
      })
    : undefined;
  const run = runGoal002Synthetic({ mode, adapter, emailDomain, founderEmails, mailbox });
  if (founderEmails) {
    founderEmails.A = "";
    founderEmails.B = "";
    founderEmails = undefined;
  }
  result = await run;
} catch {
  result = { ok: false, mode, errorCode: "SYNTHETIC_RUN_FAILED", teardown: false };
} finally {
  if (founderEmails) {
    founderEmails.A = "";
    founderEmails.B = "";
    founderEmails = undefined;
  }
}
console.log(JSON.stringify(result));
process.exit(result.ok && result.teardown ? 0 : 5);
