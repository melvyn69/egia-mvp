import { SyntheticRunnerError } from "./goal002-synth-runner.mjs";

const assertHttps = (value) => {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new SyntheticRunnerError("MAILBOX_TLS_REQUIRED");
  return url;
};

export class HttpsOneShotMailboxProvider {
  #endpoint;
  #accessToken;
  #fetch;
  #timeoutMs;

  constructor({ endpoint, accessToken, fetchImpl = fetch, timeoutMs = 30_000 }) {
    this.#endpoint = assertHttps(endpoint);
    if (!accessToken) throw new SyntheticRunnerError("MAILBOX_CONTROL_TOKEN_MISSING");
    this.#accessToken = accessToken;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async consume(address) {
    if (!address || !address.includes("@")) throw new SyntheticRunnerError("MAILBOX_ADDRESS_INVALID");
    const url = new URL("messages/consume", this.#endpoint);
    url.searchParams.set("recipient", address);
    let response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#accessToken}` },
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
    } catch {
      throw new SyntheticRunnerError("MAILBOX_NETWORK_FAILURE");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new SyntheticRunnerError("MAILBOX_CONSUME_FAILED");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new SyntheticRunnerError("MAILBOX_RESPONSE_INVALID");
    }
    const token = payload?.token;
    if (typeof token !== "string" || token.length < 16) {
      throw new SyntheticRunnerError("MAILBOX_TOKEN_UNAVAILABLE");
    }
    return token;
  }

  async residueCount(identitySet) {
    if (!identitySet?.prefix) throw new SyntheticRunnerError("MAILBOX_PREFIX_REQUIRED");
    const url = new URL("messages/count", this.#endpoint);
    url.searchParams.set("prefix", identitySet.prefix);
    let response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: { authorization: `Bearer ${this.#accessToken}` },
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
    } catch {
      throw new SyntheticRunnerError("MAILBOX_NETWORK_FAILURE");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new SyntheticRunnerError("MAILBOX_INVENTORY_FAILED");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new SyntheticRunnerError("MAILBOX_RESPONSE_INVALID");
    }
    if (!Number.isInteger(payload?.count) || payload.count < 0) {
      throw new SyntheticRunnerError("MAILBOX_INVENTORY_INVALID");
    }
    return payload.count;
  }

  async clear(identitySet) {
    if (!identitySet?.prefix) throw new SyntheticRunnerError("MAILBOX_PREFIX_REQUIRED");
    const clearUrl = new URL("messages/clear", this.#endpoint);
    clearUrl.searchParams.set("prefix", identitySet.prefix);
    const countUrl = new URL("messages/count", this.#endpoint);
    countUrl.searchParams.set("prefix", identitySet.prefix);
    try {
      const cleared = await this.#fetch(clearUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#accessToken}` },
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
      if (!cleared.ok) {
        await cleared.body?.cancel().catch(() => {});
        throw new SyntheticRunnerError("MAILBOX_TEARDOWN_FAILED");
      }
      await cleared.body?.cancel().catch(() => {});
      const counted = await this.#fetch(countUrl, {
        method: "GET",
        headers: { authorization: `Bearer ${this.#accessToken}` },
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
      if (!counted.ok) {
        await counted.body?.cancel().catch(() => {});
        throw new SyntheticRunnerError("MAILBOX_TEARDOWN_FAILED");
      }
      const payload = await counted.json();
      if (!Number.isInteger(payload?.count) || payload.count !== 0) {
        throw new SyntheticRunnerError("MAILBOX_TEARDOWN_INCOMPLETE");
      }
      return 0;
    } catch (error) {
      if (error instanceof SyntheticRunnerError) throw error;
      throw new SyntheticRunnerError("MAILBOX_NETWORK_FAILURE");
    } finally {
      this.#accessToken = "";
    }
  }
}
