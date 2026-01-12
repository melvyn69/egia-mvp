import { randomUUID } from "crypto";
const getRequestId = (req) => {
    const header = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
    if (Array.isArray(header)) {
        return header[0] ?? randomUUID();
    }
    if (typeof header === "string" && header.length > 0) {
        return header;
    }
    return randomUUID();
};
const sendError = (res, requestId, error, status = 500) => {
    return res.status(status).json({ ok: false, error, requestId });
};
const parseQuery = (req) => {
    const host = req.headers.host ?? "localhost";
    const base = `https://${host}`;
    const url = new URL(req.url ?? "/", base);
    const params = {};
    url.searchParams.forEach((value, key) => {
        const existing = params[key];
        if (existing) {
            if (Array.isArray(existing)) {
                existing.push(value);
            }
            else {
                params[key] = [existing, value];
            }
        }
        else {
            params[key] = value;
        }
    });
    return { url, params };
};
const getParam = (params, key) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
};
const logRequest = (label, payload) => {
    console.log(label, payload);
};
export { getRequestId, sendError, parseQuery, getParam, logRequest };
