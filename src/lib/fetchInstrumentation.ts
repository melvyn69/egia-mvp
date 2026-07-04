import type { QueryKey } from "@tanstack/react-query";

type InstrumentQueryFetchOptions<T> = {
  page: string;
  queryKey: QueryKey;
  queryFn: () => Promise<T> | T;
  getRowCount?: (data: T) => number | null | undefined;
};

const queryRuns = new Map<string, number>();

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const getQueryKeyId = (queryKey: QueryKey) => {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey[0] ?? "unknown-query");
  }
};

const inferRowCount = (data: unknown): number | undefined => {
  if (Array.isArray(data)) {
    return data.length;
  }
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  for (const field of ["items", "rows", "data"]) {
    const value = record[field];
    if (Array.isArray(value)) {
      return value.length;
    }
  }
  return undefined;
};

export const instrumentQueryFetch = async <T,>({
  page,
  queryKey,
  queryFn,
  getRowCount
}: InstrumentQueryFetchOptions<T>): Promise<T> => {
  if (!import.meta.env.DEV) {
    return queryFn();
  }

  const startedAt = now();
  const queryKeyId = getQueryKeyId(queryKey);
  const runCount = (queryRuns.get(queryKeyId) ?? 0) + 1;
  queryRuns.set(queryKeyId, runCount);

  try {
    const data = await queryFn();
    const rowCount = getRowCount?.(data) ?? inferRowCount(data);
    const payload = {
      page,
      queryKey,
      durationMs: Math.round(now() - startedAt),
      runCount,
      ...(typeof rowCount === "number" ? { rowCount } : {})
    };
    console.debug("[query-fetch]", payload);
    return data;
  } catch (error) {
    console.debug("[query-fetch]", {
      page,
      queryKey,
      durationMs: Math.round(now() - startedAt),
      runCount,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};
