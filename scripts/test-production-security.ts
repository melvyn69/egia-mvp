import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readTree = (directory: string): string =>
  readdirSync(join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = join(directory, entry.name);
      if (entry.isDirectory()) return [readTree(relative)];
      return /\.(?:ts|tsx|js|jsx|mjs|css|html|sql|toml|json)$/.test(entry.name)
        ? [read(relative)]
        : [];
    })
    .join("\n");

const checks: Array<{ name: string; run: () => void | Promise<void> }> = [];
const check = (name: string, run: () => void | Promise<void>) => {
  checks.push({ name, run });
};

const edgeUserFunctions = [
  "generate-reply",
  "google_gbp_sync_all",
  "google_gbp_sync_locations",
  "google_oauth_exchange",
  "google_oauth_start",
  "post-reply-google"
];

check("all user Edge Functions require gateway JWT verification", () => {
  const rootConfig = read("supabase/config.toml");
  assert.match(rootConfig, /\[functions\.generate-reply\]\s*verify_jwt\s*=\s*true/s);
  for (const name of edgeUserFunctions.slice(1)) {
    assert.match(
      read(`supabase/functions/${name}/config.toml`),
      /verify_jwt\s*=\s*true/,
      name
    );
  }
});

check("generate-reply authenticates the JWT and denies a foreign business", () => {
  const source = read("supabase/functions/generate-reply/index.ts");
  assert.match(source, /auth\.getUser\(userToken\)/);
  assert.match(source, /payload\.businessId\s*!==\s*userId/);
  assert.match(source, /jsonWithCors\(403,\s*\{ error: "Forbidden"/);
  assert.match(source, /req\.method\s*!==\s*"POST"/);
  assert.doesNotMatch(source, /decodeJwtPayload|jwt_prefix|slice\(0,\s*20\)/);
});

check("the internal review worker fails closed before service-role use", () => {
  const source = read("supabase/functions/process-review-analyze/index.ts");
  const secretCheck = source.indexOf("if (!processSecret)");
  const adminClient = source.indexOf("const supabaseAdmin = getSupabaseAdmin()");
  const claim = source.indexOf('"claim_review_analyze_jobs"');
  assert.ok(secretCheck >= 0 && secretCheck < adminClient && adminClient < claim);
  assert.match(source, /if \(!providedSecret \|\| providedSecret !== processSecret\)/);
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /Invalid JSON body/);
  assert.doesNotMatch(source, /automation reply failed \([^)]*\):/);
});

check("Google reply checks review ownership before token refresh or posting", () => {
  const source = read("supabase/functions/post-reply-google/index.ts");
  const ownership = source.indexOf('.from("google_reviews")');
  const tokenCall = source.indexOf('fetch("https://oauth2.googleapis.com/token"');
  const replyCall = source.indexOf('fetch(replyUrl');
  assert.ok(ownership >= 0 && ownership < tokenCall && tokenCall < replyCall);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.eq\("review_name", payload\.reviewId\)/);
  assert.match(source, /code: "REVIEW_NOT_FOUND"/);
  assert.doesNotMatch(source, /userToken\??:/);
});

check("SQL hardening removes public privileged RPC access", () => {
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");
  const claimSql = read("supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql");
  assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public, anon, authenticated/i);
  assert.match(sql, /ensure_user_profile\(uuid, text\) from public, anon, authenticated/i);
  assert.match(sql, /is_admin\(\) from public, anon/i);
  assert.match(sql, /set search_path = pg_catalog, public, auth/i);
  assert.match(claimSql, /claim_review_analyze_jobs/i);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(claimSql, new RegExp(`from\\s+${role}\\s*;`, "i"));
  }
  assert.match(sql, /allowed_mime_types = array\['image\/png', 'image\/jpeg', 'image\/webp'\]/i);
  const publicGrants = (sql.match(/grant execute[\s\S]*?;/gi) ?? []).filter((statement) =>
    /\bto\s+(?:public|anon)\b/i.test(statement)
  );
  assert.equal(publicGrants.length, 1);
  assert.match(publicGrants[0], /join_loyalty_program/i);
});

check("upload policy enforces size, type, signature, and a private bucket", () => {
  const api = read("api/settings.ts");
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");
  assert.match(api, /MAX_LOGO_BYTES = 5 \* 1024 \* 1024/);
  assert.match(api, /hasExpectedImageSignature/);
  assert.match(api, /LOGO_TYPES/);
  assert.match(sql, /public = false/);
  assert.match(sql, /file_size_limit = 5242880/);
});

check("team invitations bind the authenticated email", () => {
  const source = read("api/team.ts");
  assert.match(source, /authUserEmail\s*!==\s*email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /Invitation belongs to another email/);
});

check("OpenAI and service-role credentials remain server-only", () => {
  const frontendFiles = readTree("src");
  assert.doesNotMatch(frontendFiles, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/);
  assert.doesNotMatch(read("src/lib/supabase.ts"), /console\.(?:log|error)\([^\n]*(?:supabaseUrl|supabaseAnonKey)/);
});

check("repository sources contain no credential-shaped literals", () => {
  const sources = ["api", "server", "src", "supabase/functions", "supabase/migrations"]
    .map(readTree)
    .join("\n");
  assert.doesNotMatch(sources, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sources, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(sources, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sources, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(sources, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
});

check("API responses are non-cacheable and baseline browser headers exist", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const apiHeaders = vercel.headers?.find((entry) => entry.source === "/api/(.*)")?.headers ?? [];
  const globalHeaders = vercel.headers?.find((entry) => entry.source === "/(.*)")?.headers ?? [];
  assert.equal(apiHeaders.find((h) => h.key === "Cache-Control")?.value, "no-store, max-age=0");
  assert.ok(globalHeaders.some((h) => h.key === "Strict-Transport-Security"));
  assert.ok(globalHeaders.some((h) => h.key === "X-Frame-Options" && h.value === "DENY"));
  assert.ok(globalHeaders.some((h) => h.key === "Permissions-Policy"));
  assert.ok(globalHeaders.some((h) => h.key === "Content-Security-Policy"));
});

check("hardened upstream paths do not expose provider response bodies", () => {
  const sources = [
    "server/_shared/ai_reply.ts",
    "server/_shared/handlers/google/reply.ts",
    "server/_shared/handlers/cron/google/sync-replies.ts",
    "supabase/functions/generate-reply/index.ts",
    "supabase/functions/google_oauth_exchange/index.ts",
    "supabase/functions/post-reply-google/index.ts"
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /Google (?:token refresh|reply) failed:\s*\$\{/);
  assert.doesNotMatch(sources, /OpenAI error:\s*\$\{/);
  assert.doesNotMatch(sources, /jwt_prefix|JWT preview/);
});

class MockResponse {
  statusCode = 200;
  body: unknown = null;
  headers = new Map<string, string>();

  setHeader(name: string, value: string | number | readonly string[]) {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    return this;
  }

  send(payload: unknown) {
    this.body = payload;
    return this;
  }

  end(payload?: unknown) {
    this.body = payload ?? null;
    return this;
  }
}

check("cron router denies anonymous and wrong-secret requests", async () => {
  const expectedSecret = "goal002-correct-cron-secret";
  const wrongSecret = "goal002-wrong-cron-secret";
  Object.assign(process.env, {
    SUPABASE_URL: "https://security-test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "security-test-service-role",
    CRON_SECRET: expectedSecret,
    GOOGLE_CLIENT_ID: "security-test-google-client",
    GOOGLE_CLIENT_SECRET: "security-test-google-secret",
    NODE_ENV: "test"
  });

  const captured: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => captured.push(JSON.stringify(args));
  console.error = (...args: unknown[]) => captured.push(JSON.stringify(args));
  try {
    const { default: handler } = await import("../api/cron/[...slug]");
    const invoke = async (route: string, method: string, secret?: string) => {
      const response = new MockResponse();
      const request = {
        method,
        url: `/api/cron/${route}`,
        query: { slug: route.split("/") },
        headers: {
          ...(secret ? { "x-cron-secret": secret } : {}),
          "x-request-id": "goal002-security-test"
        }
      } as unknown as VercelRequest;
      await handler(request, response as unknown as VercelResponse);
      return response;
    };

    for (const [route, status] of [
      ["ai/tag-reviews", 401],
      ["google/sync-replies", 403],
      ["monthly-reports", 403]
    ] as const) {
      assert.equal((await invoke(route, "POST")).statusCode, status, `${route} anonymous`);
      assert.equal((await invoke(route, "POST", wrongSecret)).statusCode, status, `${route} wrong secret`);
      assert.equal((await invoke(route, "PATCH", expectedSecret)).statusCode, 405, `${route} method`);
    }

    assert.equal((await invoke("not-a-route", "POST", expectedSecret)).statusCode, 404);
    const evidence = `${captured.join("\n")}\n${JSON.stringify(await invoke("monthly-reports", "POST", wrongSecret))}`;
    assert.doesNotMatch(evidence, new RegExp(expectedSecret));
    assert.doesNotMatch(evidence, /security-test-google-secret|security-test-service-role/);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

const main = async () => {
  let failed = 0;
  for (const item of checks) {
    try {
      await item.run();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${item.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log(`Production security tests passed: ${checks.length} checks.`);
  }
};

void main();
