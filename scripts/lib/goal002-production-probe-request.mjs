import { createHash } from "node:crypto";
import { SyntheticRunnerError } from "./goal002-synth-runner.mjs";

const PRODUCTION_SUPABASE_ORIGIN = "https://fhadiwkdznhuxtlgrwfd.supabase.co";
const PRODUCTION_APP_ORIGIN = "https://egia-six.vercel.app";

const assertProductionInputs = ({ supabaseUrl, appUrl, anonKey, aiQuotaLimit }) => {
  if (new URL(supabaseUrl).origin !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new SyntheticRunnerError("POSTDEPLOY_SUPABASE_TARGET_FORBIDDEN");
  }
  if (new URL(appUrl).origin !== PRODUCTION_APP_ORIGIN) {
    throw new SyntheticRunnerError("POSTDEPLOY_APP_TARGET_FORBIDDEN");
  }
  if (!anonKey) throw new SyntheticRunnerError("POSTDEPLOY_ANON_KEY_MISSING");
  if (!Number.isInteger(aiQuotaLimit) || aiQuotaLimit < 3 || aiQuotaLimit > 1000) {
    throw new SyntheticRunnerError("POSTDEPLOY_AI_QUOTA_LIMIT_INVALID");
  }
};

const quotaBucketKey = (userId) =>
  createHash("sha256").update(`ai:user:${userId}`).digest("hex");

export const createProductionGoal002ProbeRequest = ({
  supabaseUrl,
  appUrl = PRODUCTION_APP_ORIGIN,
  anonKey,
  aiQuotaLimit,
  logInspector,
  fetchImpl = fetch
}) => {
  assertProductionInputs({ supabaseUrl, appUrl, anonKey, aiQuotaLimit });
  const edgeUrl = `${PRODUCTION_SUPABASE_ORIGIN}/functions/v1/generate-reply`;
  let loyaltyToken = null;
  let programActivated = false;
  if (!logInspector || typeof logInspector.inspect !== "function") {
    throw new SyntheticRunnerError("POSTDEPLOY_LOG_INSPECTOR_MISSING");
  }

  const expectedRpcDenial = (error) => {
    const status = Number(error?.status ?? error?.statusCode);
    return error?.code === "42501" || ([401, 403].includes(status) && /permission|forbidden|unauthorized/i.test(String(error?.message ?? "")));
  };
  const expectedStorageDenial = (error) => {
    const status = Number(error?.status ?? error?.statusCode);
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "");
    return (
      [400, 401, 403, 404].includes(status) &&
      (/^(401|403|404|NoSuchKey|not_found)$/i.test(code) || /not found|unauthorized|forbidden|row.level security|permission/i.test(message))
    );
  };

  const fetchStatus = async (url, init, { json = false } = {}) => {
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(30_000)
      });
    } catch {
      throw new SyntheticRunnerError("POSTDEPLOY_NETWORK_FAILURE");
    }
    let body = null;
    if (json) {
      try {
        body = await response.json();
      } catch {
        throw new SyntheticRunnerError("POSTDEPLOY_RESPONSE_INVALID");
      }
    } else {
      await response.body?.cancel().catch(() => {});
    }
    return { status: response.status, body };
  };

  const edgeProbe = async ({ user, businessId, withAuth = true }) => {
    const session = withAuth ? await user.client.auth.getSession() : null;
    const token = session?.data?.session?.access_token ?? "";
    return fetchStatus(edgeUrl, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        businessId,
        reviewText: "Avis synthétique GOAL002_SYNTH",
        reviewId: "GOAL002_SYNTH",
        rating: 5,
        authorName: "GOAL002_SYNTH",
        businessName: "GOAL002_SYNTH",
        source: "synthetic"
      })
    });
  };

  const enrollment = async ({ context, email, firstName }) => {
    const user = context.users.A;
    if (!programActivated) {
      const activation = await user.client
        .from("loyalty_programs")
        .update({ is_enabled: true })
        .eq("id", user.programId)
        .select("id");
      if (activation.error || activation.data?.length !== 1) {
        throw new SyntheticRunnerError("POSTDEPLOY_SYNTHETIC_PROGRAM_ACTIVATION_FAILED");
      }
      programActivated = true;
    }
    const session = await user.client.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) throw new SyntheticRunnerError("POSTDEPLOY_ORDINARY_SESSION_MISSING");
    return fetchStatus(`${PRODUCTION_APP_ORIGIN}/api/loyalty/join`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-goal002-synth-execution-id": context.executionId
      },
      body: JSON.stringify({
        public_token: user.programPublicToken,
        first_name: firstName,
        email,
        company: ""
      })
    }, { json: true });
  };

  const request = async (name, { identitySet, context, mailbox }) => {
    const [a, b] = [context.users.A, context.users.B];
    switch (name) {
      case "auth-a":
      case "auth-b": {
        const user = name === "auth-a" ? a : b;
        const { data, error } = await user.client.auth.getUser();
        return { status: !error && data.user?.id === user.id ? 200 : 401, body: null };
      }
      case "tenant-a-own":
      case "tenant-b-own": {
        const user = name === "tenant-a-own" ? a : b;
        const result = await user.client.from("google_locations").select("id").eq("id", user.locationId);
        return { status: !result.error && result.data?.length === 1 ? 200 : 403, body: null };
      }
      case "idor-a-from-b": {
        const result = await b.client.from("google_locations").select("id").eq("id", a.locationId);
        return { status: !result.error && result.data?.length === 0 ? 403 : 200, body: null };
      }
      case "privileged-rpc-as-a": {
        const result = await a.client.rpc("claim_ai_tag_candidates", {
          p_limit: 1,
          p_version: "GOAL002_SYNTH",
          p_location_id: a.locationId
        });
        if (!result.error) return { status: 200, body: null };
        if (!expectedRpcDenial(result.error)) {
          throw new SyntheticRunnerError("POSTDEPLOY_PRIVILEGED_RPC_UNCLASSIFIED");
        }
        return { status: 403, body: null };
      }
      case "ai-a":
      case "quota-a-within-limit":
        return edgeProbe({ user: a, businessId: a.id });
      case "ai-a-resource-from-b":
      case "edge-wrong-tenant":
        return edgeProbe({ user: b, businessId: a.id });
      case "edge-without-auth":
        return edgeProbe({ user: a, businessId: a.id, withAuth: false });
      case "quota-a-exceeded":
        return edgeProbe({ user: a, businessId: a.id });
      case "loyalty-new-request":
        return enrollment({ context, email: a.newMemberEmail, firstName: `${identitySet.prefix}_NEW` });
      case "loyalty-existing-request":
        return enrollment({
          context,
          email: a.existingMemberEmail,
          firstName: `${identitySet.prefix}_EXISTING`
        });
      case "loyalty-capability-before-proof": {
        const members = await a.client
          .from("loyalty_members")
          .select("id")
          .eq("program_id", a.programId)
          .eq("email", a.newMemberEmail);
        if (members.error) {
          throw new SyntheticRunnerError("POSTDEPLOY_CAPABILITY_INVENTORY_FAILED");
        }
        return { status: members.data?.length === 0 ? 404 : 200, body: null };
      }
      case "loyalty-proof-consume": {
        loyaltyToken = await mailbox.consume(a.newMemberEmail);
        const session = await a.client.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (!token) throw new SyntheticRunnerError("POSTDEPLOY_ORDINARY_SESSION_MISSING");
        return fetchStatus(`${PRODUCTION_APP_ORIGIN}/api/loyalty/verify`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "x-goal002-synth-execution-id": context.executionId
          },
          body: JSON.stringify({ token: loyaltyToken })
        });
      }
      case "loyalty-proof-replay":
        if (!loyaltyToken) throw new SyntheticRunnerError("POSTDEPLOY_LOYALTY_TOKEN_MISSING");
        {
        const session = await a.client.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (!token) throw new SyntheticRunnerError("POSTDEPLOY_ORDINARY_SESSION_MISSING");
        return fetchStatus(`${PRODUCTION_APP_ORIGIN}/api/loyalty/verify`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "x-goal002-synth-execution-id": context.executionId
          },
          body: JSON.stringify({ token: loyaltyToken })
        });
        }
      case "invitation-a": {
        const result = await a.client.from("team_invitations").select("id").eq("owner_user_id", a.id);
        return { status: !result.error && result.data?.length === 1 ? 200 : 403, body: null };
      }
      case "invitation-a-from-b": {
        const result = await b.client.from("team_invitations").select("id").eq("owner_user_id", a.id);
        return { status: !result.error && result.data?.length === 0 ? 403 : 200, body: null };
      }
      case "asset-a": {
        const result = await a.client.storage.from("brand-assets").download(context.objects[0]);
        if (result.error || !result.data) {
          throw new SyntheticRunnerError("POSTDEPLOY_OWN_ASSET_UNAVAILABLE");
        }
        return { status: 200, body: null };
      }
      case "asset-a-from-b": {
        const result = await b.client.storage.from("brand-assets").download(context.objects[0]);
        if (!result.error) return { status: 200, body: null };
        if (!expectedStorageDenial(result.error)) {
          throw new SyntheticRunnerError("POSTDEPLOY_STORAGE_DENIAL_UNCLASSIFIED");
        }
        return { status: 403, body: null };
      }
      case "cron-without-secret":
        return fetchStatus(`${PRODUCTION_APP_ORIGIN}/api/cron/ai/tag-reviews`, { method: "POST" });
      case "cron-wrong-secret":
        return fetchStatus(`${PRODUCTION_APP_ORIGIN}/api/cron/ai/tag-reviews`, {
          method: "POST",
          headers: { "x-cron-secret": `wrong-${identitySet.executionId}` }
        });
      default:
        throw new SyntheticRunnerError("POSTDEPLOY_PROBE_UNKNOWN");
    }
  };

  request.plannedRateLimitBucketKeys = async ({ context }) => [quotaBucketKey(context.users.A.id)];
  request.prepareRateLimitFixtures = async ({ admin, context }) => {
    const { data, error } = await admin.rpc("consume_security_rate_limit", {
      p_bucket_key: quotaBucketKey(context.users.A.id),
      p_limit: aiQuotaLimit,
      p_window_seconds: 3600,
      p_cost: aiQuotaLimit - 2
    });
    if (error || data !== true) {
      throw new SyntheticRunnerError("POSTDEPLOY_RATE_LIMIT_FIXTURE_FAILED");
    }
  };
  request.inspectLogs = async ({ identitySet }) => logInspector.inspect({ identitySet });
  return request;
};

export const GOAL002_PRODUCTION_APP_ORIGIN = PRODUCTION_APP_ORIGIN;
export const GOAL002_PRODUCTION_SUPABASE_ORIGIN = PRODUCTION_SUPABASE_ORIGIN;
