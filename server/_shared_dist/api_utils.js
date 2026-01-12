"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRequest = exports.getParam = exports.parseQuery = exports.sendError = exports.getRequestId = void 0;
const crypto_1 = require("crypto");
const getRequestId = (req) => {
    const header = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
    if (Array.isArray(header)) {
        return header[0] ?? (0, crypto_1.randomUUID)();
    }
    if (typeof header === "string" && header.length > 0) {
        return header;
    }
    return (0, crypto_1.randomUUID)();
};
exports.getRequestId = getRequestId;
const sendError = (res, requestId, error, status = 500) => {
    return res.status(status).json({ ok: false, error, requestId });
};
exports.sendError = sendError;
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
exports.parseQuery = parseQuery;
const getParam = (params, key) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
};
exports.getParam = getParam;
const logRequest = (label, payload) => {
    console.log(label, payload);
};
exports.logRequest = logRequest;
