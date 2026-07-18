import { SyntheticRunnerError } from "./goal002-synth-runner.mjs";

export class HttpsRedactedLogInspector {
  #endpoint;
  #accessToken;
  #fetch;
  #timeoutMs;

  constructor({ endpoint, accessToken, fetchImpl = fetch, timeoutMs = 30_000 }) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:") throw new SyntheticRunnerError("LOG_INSPECTOR_TLS_REQUIRED");
    if (!accessToken) throw new SyntheticRunnerError("LOG_INSPECTOR_TOKEN_MISSING");
    this.#endpoint = parsed;
    this.#accessToken = accessToken;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async inspect({ identitySet }) {
    if (!identitySet?.executionId || !identitySet?.createdAt) {
      throw new SyntheticRunnerError("LOG_INSPECTION_SCOPE_INVALID");
    }
    const url = new URL("inspection/goal002-synth", this.#endpoint);
    try {
      const response = await this.#fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          executionId: identitySet.executionId,
          startedAt: identitySet.createdAt,
          sources: ["vercel", "supabase-edge"]
        }),
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new SyntheticRunnerError("LOG_INSPECTION_FAILED");
      }
      const result = await response.json().catch(() => null);
      if (
        !result ||
        result.checked !== true ||
        result.vercel !== true ||
        result.supabaseEdge !== true ||
        !Number.isInteger(result.sensitiveMatches) ||
        !Number.isInteger(result.unexpected5xx)
      ) {
        throw new SyntheticRunnerError("LOG_INSPECTION_RESPONSE_INVALID");
      }
      return Object.freeze({
        checked: true,
        vercel: true,
        supabaseEdge: true,
        sensitiveMatches: result.sensitiveMatches,
        unexpected5xx: result.unexpected5xx
      });
    } catch (error) {
      if (error instanceof SyntheticRunnerError) throw error;
      throw new SyntheticRunnerError("LOG_INSPECTION_NETWORK_FAILURE");
    } finally {
      this.#accessToken = "";
    }
  }
}
