type SafeLogLevel = "log" | "info" | "warn" | "error";

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getLastRecord = (args: unknown[]) => {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const record = toRecord(args[index]);
    if (record) return record;
  }
  return null;
};

const getString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const getCount = (record: Record<string, unknown> | null) => {
  if (!record) return 0;
  for (const key of [
    "count",
    "total",
    "processed",
    "created",
    "updated",
    "failed",
    "locationsCount",
    "reviewsCount"
  ]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
};

export const createProductionSafeConsole = (
  route: string
): Pick<Console, SafeLogLevel> => {
  const write = (level: SafeLogLevel, args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") {
      globalThis.console[level](...args);
      return;
    }

    const record = getLastRecord(args);
    const status =
      typeof record?.status === "number" || typeof record?.status === "string"
        ? record.status
        : level === "error"
          ? "error"
          : level === "warn"
            ? "warning"
            : "info";
    globalThis.console[level]("[app]", {
      requestId: getString(record?.requestId) ?? null,
      route,
      status,
      code: getString(record?.code) ?? "LOG_EVENT",
      count: getCount(record)
    });
  };

  return {
    log: (...args: unknown[]) => write("log", args),
    info: (...args: unknown[]) => write("info", args),
    warn: (...args: unknown[]) => write("warn", args),
    error: (...args: unknown[]) => write("error", args)
  };
};
