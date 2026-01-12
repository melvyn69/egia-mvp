import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INTERNAL";

type ErrorPayload = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

type QueryParams = Record<string, string | string[]>;

const getRequestId = (req: VercelRequest) => {
  const header = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
  if (Array.isArray(header)) {
    return header[0] ?? randomUUID();
  }
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return randomUUID();
};

const sendError = (
  res: VercelResponse,
  requestId: string,
  error: ErrorPayload,
  status = 500
) => {
  return res.status(status).json({ ok: false, error, requestId });
};

const parseQuery = (req: VercelRequest) => {
  const host = req.headers.host ?? "localhost";
  const base = `https://${host}`;
  const url = new URL(req.url ?? "/", base);
  const params: QueryParams = {};
  url.searchParams.forEach((value, key) => {
    const existing = params[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        params[key] = [existing, value];
      }
    } else {
      params[key] = value;
    }
  });
  return { url, params };
};

const getParam = (params: QueryParams, key: string) => {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
};

const logRequest = (label: string, payload: Record<string, unknown>) => {
  console.log(label, payload);
};

export { getRequestId, sendError, parseQuery, getParam, logRequest };
export type { ErrorCode, QueryParams };
