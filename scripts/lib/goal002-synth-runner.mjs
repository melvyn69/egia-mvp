import { randomBytes, randomUUID } from "node:crypto";

export const SYNTHETIC_PREFIX = "GOAL002_SYNTH";
export const SYNTHETIC_TTL_MS = 24 * 60 * 60 * 1000;

export class SyntheticRunnerError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyntheticRunnerError";
    this.code = code;
  }
}

export class LocalSyntheticMailbox {
  #messages = new Map();

  deliver(address, token) {
    if (!address.includes("@goal002.invalid") || typeof token !== "string" || token.length < 16) {
      throw new SyntheticRunnerError("MAILBOX_INPUT_INVALID");
    }
    this.#messages.set(address, token);
  }

  consume(address) {
    const token = this.#messages.get(address);
    if (!token) throw new SyntheticRunnerError("MAILBOX_TOKEN_UNAVAILABLE");
    this.#messages.delete(address);
    return token;
  }

  residueCount() {
    return this.#messages.size;
  }

  clear() {
    this.#messages.clear();
  }
}

export const createSyntheticIdentitySet = (mode, { emailDomain = "goal002.invalid" } = {}) => {
  if (mode !== "prerequisite" && mode !== "postdeploy") {
    throw new SyntheticRunnerError("MODE_INVALID");
  }
  if (!/^[a-z0-9.-]+$/i.test(emailDomain)) {
    throw new SyntheticRunnerError("MAILBOX_DOMAIN_INVALID");
  }
  const executionId = randomUUID();
  const prefix = `${SYNTHETIC_PREFIX}_${mode.toUpperCase()}_${executionId}`;
  const mailboxPrefix = prefix.toLowerCase();
  const password = () => `${randomBytes(24).toString("base64url")}Aa1!`;
  return {
    executionId,
    prefix,
    mode,
    createdAt: new Date().toISOString(),
    users: {
      A: { email: `${mailboxPrefix}.a@${emailDomain}`, password: password() },
      B: { email: `${mailboxPrefix}.b@${emailDomain}`, password: password() }
    }
  };
};

const safeErrorCode = (error) =>
  error instanceof SyntheticRunnerError ? error.code : "SYNTHETIC_RUN_FAILED";

export const runGoal002Synthetic = async ({
  mode,
  adapter,
  mailbox = new LocalSyntheticMailbox(),
  emailDomain = "goal002.invalid"
}) => {
  if (!adapter || (adapter.isProduction === true && adapter.productionAuthorized !== true)) {
    throw new SyntheticRunnerError("PRODUCTION_ADAPTER_FORBIDDEN");
  }
  const identitySet = createSyntheticIdentitySet(mode, { emailDomain });
  const evidence = {
    ok: false,
    mode,
    executionId: identitySet.executionId,
    setup: false,
    ownership: false,
    assertions: false,
    teardown: false,
    residueCount: null,
    errorCode: null
  };
  try {
    await adapter.cleanupExpired({ prefix: SYNTHETIC_PREFIX, ttlMs: SYNTHETIC_TTL_MS });
    const initial = await adapter.inventory({ prefix: identitySet.prefix });
    if (initial.total !== 0) throw new SyntheticRunnerError("INITIAL_RESIDUE");
    await adapter.setup({ identitySet, mailbox });
    evidence.setup = true;
    await adapter.verifyOwnership({ identitySet });
    evidence.ownership = true;
    if (mode === "prerequisite") {
      await adapter.assertPrerequisite({ identitySet, mailbox });
    } else {
      await adapter.assertPostdeploy({ identitySet, mailbox });
    }
    evidence.assertions = true;
    evidence.ok = true;
  } catch (error) {
    evidence.errorCode = safeErrorCode(error);
  } finally {
    let teardownStepFailed = false;
    let authDeletionAllowed = true;
    for (const step of ["revokeSessions", "deleteStorage", "deleteDatabase"]) {
      try {
        await adapter[step]({ identitySet });
      } catch {
        teardownStepFailed = true;
        authDeletionAllowed = false;
      }
    }
    if (authDeletionAllowed) {
      try {
        await adapter.deleteAuth({ identitySet });
      } catch {
        teardownStepFailed = true;
      }
    } else {
      teardownStepFailed = true;
    }
    let mailboxResidue = -1;
    try {
      const clearedResidue = await mailbox.clear(identitySet);
      mailboxResidue = Number.isInteger(clearedResidue)
        ? clearedResidue
        : await Promise.resolve(mailbox.residueCount(identitySet));
    } catch {
      teardownStepFailed = true;
    }
    const finalInventory = await adapter.inventory({ prefix: identitySet.prefix }).catch(() => ({ total: -1 }));
    evidence.residueCount = finalInventory.total;
    evidence.teardown = !teardownStepFailed && finalInventory.total === 0 && mailboxResidue === 0;
    try {
      await adapter.finalizeTeardown?.({ identitySet });
    } catch {
      evidence.teardown = false;
    }
    if (!evidence.teardown) {
      evidence.ok = false;
      evidence.errorCode = evidence.errorCode ?? "TEARDOWN_INCOMPLETE";
    }
    identitySet.users.A.password = "";
    identitySet.users.B.password = "";
  }
  return Object.freeze(evidence);
};

export class InMemorySyntheticAdapter {
  isProduction = false;
  #records = new Map();
  #failAt;

  constructor({ failAt = null } = {}) {
    this.#failAt = failAt;
  }

  async cleanupExpired() {}

  async inventory({ prefix }) {
    return { total: [...this.#records.keys()].filter((key) => key.startsWith(prefix)).length };
  }

  #maybeFail(step) {
    if (this.#failAt === step) throw new SyntheticRunnerError(`INTERRUPTED_${step.toUpperCase()}`);
  }

  async setup({ identitySet, mailbox }) {
    for (const side of ["A", "B"]) {
      for (const kind of ["auth", "tenant", "company", "location", "review", "ai", "loyalty", "invitation", "legal", "asset"]) {
        this.#records.set(`${identitySet.prefix}:${side}:${kind}`, { side, kind });
      }
    }
    if (identitySet.mode === "postdeploy") {
      mailbox.deliver(identitySet.users.A.email, randomBytes(24).toString("base64url"));
    }
    this.#maybeFail("setup");
  }

  async verifyOwnership({ identitySet }) {
    const a = this.#records.get(`${identitySet.prefix}:A:tenant`);
    const b = this.#records.get(`${identitySet.prefix}:B:tenant`);
    if (a?.side !== "A" || b?.side !== "B") throw new SyntheticRunnerError("OWNERSHIP_INVALID");
    this.#maybeFail("ownership");
  }

  async assertPrerequisite({ identitySet }) {
    if ([...this.#records.keys()].some((key) => key.startsWith(identitySet.prefix) && key.endsWith(":capability"))) {
      throw new SyntheticRunnerError("CAPABILITY_PREACTIVATED");
    }
    this.#maybeFail("prerequisite");
  }

  async assertPostdeploy({ identitySet, mailbox }) {
    const token = mailbox.consume(identitySet.users.A.email);
    if (!token || mailbox.residueCount() !== 0) throw new SyntheticRunnerError("MAILBOX_ONE_SHOT_FAILED");
    assertTenantSeparation(this.#records, identitySet.prefix);
    this.#maybeFail("postdeploy");
  }

  async revokeSessions() {}
  async deleteStorage({ identitySet }) {
    for (const key of [...this.#records.keys()]) if (key.startsWith(identitySet.prefix) && key.endsWith(":asset")) this.#records.delete(key);
  }
  async deleteDatabase({ identitySet }) {
    for (const key of [...this.#records.keys()]) if (key.startsWith(identitySet.prefix) && !key.endsWith(":auth")) this.#records.delete(key);
  }
  async deleteAuth({ identitySet }) {
    for (const key of [...this.#records.keys()]) if (key.startsWith(identitySet.prefix)) this.#records.delete(key);
  }
}

const assertTenantSeparation = (records, prefix) => {
  const a = records.get(`${prefix}:A:tenant`);
  const b = records.get(`${prefix}:B:tenant`);
  if (!a || !b || a.side === b.side) throw new SyntheticRunnerError("TENANT_ISOLATION_FAILED");
};
