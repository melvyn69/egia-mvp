const EXPECTED_PROJECT_REF = "fhadiwkdznhuxtlgrwfd";
const DIRECT_HOST = `db.${EXPECTED_PROJECT_REF}.supabase.co`;
const SESSION_POOLER_HOST = /^(?:[a-z0-9-]+\.)?pooler\.supabase\.com$/i;
const TLS_MODES = new Set(["require", "verify-ca", "verify-full"]);

export class DbChannelError extends Error {
  constructor(code) {
    super(code);
    this.name = "DbChannelError";
    this.code = code;
  }
}

const fail = (code) => {
  throw new DbChannelError(code);
};

export const validateGoal007DbUrl = (rawValue) => {
  if (typeof rawValue !== "string" || rawValue.length === 0) fail("DB_URL_MISSING");
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    fail("DB_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail("DB_PROTOCOL_INVALID");
  }
  if (!parsed.username || !parsed.password) fail("DB_CREDENTIALS_MISSING");
  if (parsed.pathname !== "/postgres") fail("DB_NAME_INVALID");
  const port = parsed.port || "5432";
  if (port === "6543") fail("DB_TRANSACTION_POOLER_FORBIDDEN");
  if (port !== "5432") fail("DB_PORT_INVALID");
  const tlsMode = parsed.searchParams.get("sslmode");
  if (!tlsMode || !TLS_MODES.has(tlsMode)) fail("DB_TLS_REQUIRED");

  const direct = parsed.hostname === DIRECT_HOST;
  const session =
    SESSION_POOLER_HOST.test(parsed.hostname) &&
    parsed.username === `postgres.${EXPECTED_PROJECT_REF}`;
  if (!direct && !session) fail("DB_PROJECT_INVALID");
  if (direct && parsed.username !== "postgres") fail("DB_USER_INVALID");

  return Object.freeze({
    mode: direct ? "direct" : "supavisor-session",
    port: 5432,
    database: "postgres",
    tlsMode
  });
};

export const consumeGoal007DbUrl = (env = process.env) => {
  const rawValue = env.SUPABASE_DB_URL;
  delete env.SUPABASE_DB_URL;
  const classification = validateGoal007DbUrl(rawValue);
  return { connectionString: rawValue, classification };
};

export const withGoal007DbWatchdog = async (operation, timeoutMs) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) {
    fail("DB_TIMEOUT_INVALID");
  }
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DbChannelError("DB_OPERATION_TIMEOUT")), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const redactDbError = (error) => ({
  ok: false,
  code:
    error instanceof DbChannelError
      ? error.code
      : error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? `DB_${error.code.replace(/[^A-Z0-9_]/gi, "_").toUpperCase()}`
        : "DB_OPERATION_FAILED"
});
