"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromRequest = exports.getRequiredEnv = exports.getOauthStateExpiry = exports.getGoogleRedirectUri = exports.getBearerToken = exports.createSupabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const getRequiredEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing ${key} environment variable.`);
    }
    return value;
};
exports.getRequiredEnv = getRequiredEnv;
const createSupabaseAdmin = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing SUPABASE env vars");
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });
};
exports.createSupabaseAdmin = createSupabaseAdmin;
const getBearerToken = (headers) => {
    const header = headers.authorization ?? headers.Authorization;
    if (header && header.startsWith("Bearer ")) {
        return header.slice(7);
    }
    return null;
};
exports.getBearerToken = getBearerToken;
const getUserFromRequest = async (req, supabaseAdmin) => {
    const token = getBearerToken(req.headers);
    if (!token) {
        return { userId: null, error: new Error("Missing bearer token.") };
    }
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
        return { userId: null, error };
    }
    if (!data.user?.id) {
        return { userId: null, error: new Error("User not found.") };
    }
    return { userId: data.user.id, error: null };
};
exports.getUserFromRequest = getUserFromRequest;
const getGoogleRedirectUri = () => {
    const appBaseUrl = getRequiredEnv("APP_BASE_URL");
    return new URL("/api/google/oauth/callback", appBaseUrl).toString();
};
exports.getGoogleRedirectUri = getGoogleRedirectUri;
const getOauthStateExpiry = () => new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
exports.getOauthStateExpiry = getOauthStateExpiry;
