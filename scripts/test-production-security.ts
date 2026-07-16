import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  for (const name of edgeUserFunctions) {
    assert.match(
      rootConfig,
      new RegExp(
        `\\[functions\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*verify_jwt\\s*=\\s*true`,
        "s"
      ),
      name
    );
  }
  assert.match(rootConfig, /\[functions\.process-review-analyze\]\s*verify_jwt\s*=\s*false/s);
  assert.match(rootConfig, /\[functions\.google_oauth_callback\]\s*verify_jwt\s*=\s*false/s);
});

check("generate-reply authenticates the JWT and denies a foreign business", () => {
  const source = read("supabase/functions/generate-reply/index.ts");
  assert.match(source, /auth\.getUser\(userToken\)/);
  assert.match(source, /businessId\s*!==\s*userId/);
  assert.match(source, /jsonWithCors\(403,\s*\{ error: "Forbidden"/);
  assert.match(source, /req\.method\s*!==\s*"POST"/);
  assert.match(source, /MAX_REQUEST_BYTES = 32 \* 1024/);
  assert.match(source, /Invalid payload fields/);
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
  const adminClient = source.indexOf("const supabaseAdmin = createClient", ownership);
  const connection = source.indexOf('.from("google_connections")', adminClient);
  const tokenCall = source.indexOf('fetch("https://oauth2.googleapis.com/token"');
  const replyCall = source.indexOf('fetch(replyUrl');
  assert.ok(
    ownership >= 0 &&
      ownership < adminClient &&
      adminClient < connection &&
      connection < tokenCall &&
      tokenCall < replyCall
  );
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.eq\("review_name", payload\.reviewId\)/);
  assert.match(source, /code: "REVIEW_NOT_FOUND"/);
  assert.match(source, /MAX_REPLY_TEXT_LENGTH = 4096/);
  assert.match(source, /code: "INVALID_JSON"/);
  assert.doesNotMatch(source, /userToken\??:/);
});

check("OAuth state is atomically consumed before the Edge token exchange", () => {
  const source = read("supabase/functions/google_oauth_exchange/index.ts");
  const consume = source.indexOf("const consumedAt");
  const stateTable = source.indexOf('.from("google_oauth_states")', consume);
  const deleteState = source.indexOf(".delete()", stateTable);
  const matchState = source.indexOf('.eq("state", state)', deleteState);
  const tokenExchange = source.indexOf('fetch("https://oauth2.googleapis.com/token"');
  assert.ok(
    consume >= 0 &&
      consume < stateTable &&
      stateTable < deleteState &&
      deleteState < matchState &&
      matchState < tokenExchange
  );
  assert.match(source, /\.gte\("expires_at", consumedAt\)/);
  const startSource = read("supabase/functions/google_oauth_start/index.ts");
  assert.match(startSource, /\.from\("google_oauth_states"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(startSource, /\.from\("google_connections"\)[\s\S]*oauth_state/);
});

check("Vercel OAuth callback rejects absent, invalid, and expired state", () => {
  const source = read("server/_shared/handlers/google/oauth/callback.ts");
  assert.match(source, /const stateExpiresAt = new Date\(oauthState\.expires_at\)\.getTime\(\)/);
  assert.match(
    source,
    /!Number\.isFinite\(stateExpiresAt\) \|\| stateExpiresAt <= Date\.now\(\)/
  );
  assert.match(source, /if \(!resolvedRefreshToken\)/);
});

check("Google reply cannot update a foreign draft through service-role", () => {
  const source = read("server/_shared/handlers/google/reply.ts");
  const branchStart = source.indexOf("if (draftReplyId)");
  const branchEnd = source.indexOf("} else {", branchStart);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  const draftUpdate = source.slice(branchStart, branchEnd);
  assert.match(draftUpdate, /\.eq\("id", draftReplyId\)/);
  assert.match(draftUpdate, /\.eq\("user_id", userId\)/);
  assert.match(source, /MAX_REPLY_REQUEST_BYTES = 32 \* 1024/);
});

check("review draft service-role paths stay bound to the authenticated tenant", () => {
  const source = read("api/reviews.ts");
  const jobStart = source.indexOf("const getInFlightReviewJob");
  const jobEnd = source.indexOf("const getExistingSentReplyForReview", jobStart);
  assert.ok(jobStart >= 0 && jobEnd > jobStart);
  const jobLookup = source.slice(jobStart, jobEnd);
  assert.match(jobLookup, /\.filter\("payload->>user_id", "eq", userId\)/);
  assert.match(jobLookup, /\.filter\("payload->>review_id", "eq", reviewId\)/);

  const locationStart = source.indexOf("const resolveDraftLocation");
  const locationEnd = source.indexOf("const getExistingDraftForReview", locationStart);
  assert.ok(locationStart >= 0 && locationEnd > locationStart);
  const locationResolution = source.slice(locationStart, locationEnd);
  assert.match(locationResolution, /\.eq\("user_id", params\.userId\)/);
  assert.match(locationResolution, /accessConfirmed: Boolean\(resolvedLocationRow && locationsMatch\)/);
  assert.doesNotMatch(locationResolution, /locationRow\?\.id \?\? requestedLocationId/);
  assert.equal((source.match(/!locationContext\.accessConfirmed/g) ?? []).length, 3);
});

check("private brand assets accept only canonical tenant-owned paths", () => {
  for (const path of [
    "src/lib/businessBranding.ts",
    "api/reports/[...slug].ts",
    "server/_shared/handlers/reports/generate_html.ts",
    "server/_shared/handlers/reports/generate.ts",
    "server/_shared/handlers/cron/monthly-reports-api.ts"
  ]) {
    const source = read(path);
    assert.match(
      source,
      /business\/\$\{businessId\}\/legal_entities\/\$\{entityId\}\/logo\./,
      path
    );
    assert.match(source, /\["png", "jpg", "webp"\]\.includes/, path);
    assert.doesNotMatch(source, /entity\??\.logo_url/, path);
  }
  const settings = read("api/settings.ts");
  const upsertStart = settings.indexOf('action === "legal_entities_upsert"');
  const setDefaultStart = settings.indexOf('action === "legal_entities_set_default"', upsertStart);
  const upsert = settings.slice(upsertStart, setDefaultStart);
  assert.doesNotMatch(upsert, /logo_path|logo_url/);
});

check("Edge dependencies are exactly pinned and lockfile-enforced", () => {
  const edgeSources = [
    "generate-reply",
    "google_gbp_sync_all",
    "google_gbp_sync_locations",
    "google_oauth_exchange",
    "google_oauth_start",
    "post-reply-google",
    "process-review-analyze"
  ].map((name) => read(`supabase/functions/${name}/index.ts`));
  for (const source of edgeSources) {
    assert.match(source, /https:\/\/esm\.sh\/@supabase\/supabase-js@2\.110\.2/);
    assert.doesNotMatch(source, /@supabase\/supabase-js@2["']/);
  }
  const runtimeImports = edgeSources.filter((source) =>
    source.includes("jsr:@supabase/functions-js")
  );
  assert.equal(runtimeImports.length, 3);
  for (const source of runtimeImports) {
    assert.match(source, /jsr:@supabase\/functions-js@2\.110\.2\/edge-runtime\.d\.ts/);
  }
  const packageJson = read("package.json");
  assert.match(packageJson, /--config=supabase\/functions\/deno\.json --frozen/);
  assert.match(read("supabase/functions/deno.json"), /"lock": "\.\/deno\.lock"/);
  assert.match(read("supabase/functions/deno.lock"), /"version": "5"/);
});

check("SQL hardening removes public privileged RPC access", () => {
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");
  const claimSql = read("supabase/migrations/20260712120000_secure_claim_review_analyze_jobs.sql");
  assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public, anon, authenticated/i);
  assert.match(sql, /ensure_user_profile\(uuid, text\) from public, anon, authenticated/i);
  assert.match(sql, /is_admin\(\) from public, anon/i);
  assert.match(sql, /set search_path = pg_catalog, public, auth/i);
  assert.match(sql, /drop policy if exists "cron_state_select_auth"/i);
  assert.match(sql, /create policy "cron_state_select_own"[\s\S]*using \(user_id = auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on table public\.google_connections from anon, authenticated/i);
  assert.match(
    sql,
    /grant select \([\s\S]*sync_status[\s\S]*\) on table public\.google_connections to authenticated/i
  );
  assert.match(sql, /revoke all on table public\.legal_entities from anon, authenticated/i);
  assert.match(
    sql,
    /grant select \([\s\S]*logo_path[\s\S]*\) on table public\.legal_entities to authenticated/i
  );
  const statements = sql.split(";");
  const googleSelectGrant = statements.find(
    (statement) =>
      /grant select/i.test(statement) &&
      /on table public\.google_connections to authenticated/i.test(statement)
  ) ?? "";
  const legalEntitySelectGrant = statements.find(
    (statement) =>
      /grant select/i.test(statement) &&
      /on table public\.legal_entities to authenticated/i.test(statement)
  ) ?? "";
  assert.doesNotMatch(googleSelectGrant, /refresh_token|access_token|oauth_state/i);
  assert.doesNotMatch(legalEntitySelectGrant, /logo_url/i);
  assert.match(
    sql,
    /revoke truncate, references, trigger on all tables in schema public[\s\S]*from anon, authenticated/i
  );
  assert.match(claimSql, /claim_review_analyze_jobs/i);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(claimSql, new RegExp(`from\\s+${role}\\s*;`, "i"));
  }
  assert.match(sql, /array\['image\/png', 'image\/jpeg', 'image\/webp'\]::text\[\]/i);
  const publicGrants = (sql.match(/grant execute[\s\S]*?;/gi) ?? []).filter((statement) =>
    /\bto\s+(?:public|anon)\b/i.test(statement)
  );
  assert.equal(publicGrants.length, 0);
  assert.match(
    sql,
    /revoke all on function public\.join_loyalty_program\(uuid, text, text\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.finalize_loyalty_enrollment\(text\)[\s\S]*to service_role/i
  );
  assert.match(
    sql,
    /revoke all on table public\.loyalty_enrollment_requests[\s\S]*from public, anon, authenticated/i
  );
});

check("loyalty capabilities are released only after one-time e-mail proof", () => {
  const service = read("src/services/loyalty.ts");
  const joinPage = read("src/pages/LoyaltyJoin.tsx");
  const verifyPage = read("src/pages/LoyaltyVerify.tsx");
  const joinHandler = read("server/_shared/handlers/loyalty/join.ts");
  const verifyHandler = read("server/_shared/handlers/loyalty/verify.ts");
  const common = read("server/_shared/handlers/loyalty/enrollment_common.ts");
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");

  assert.doesNotMatch(service, /\.rpc\("join_loyalty_program"/);
  assert.match(service, /fetch\("\/api\/loyalty\/join"/);
  assert.match(service, /fetch\("\/api\/loyalty\/verify"/);
  assert.doesNotMatch(joinPage, /LoyaltyQrCode|member_code|wallet_public_token/);
  assert.match(joinPage, /Aucune carte, aucun QR code et aucune capacité fidélité/);
  assert.match(joinHandler, /\.from\("loyalty_enrollment_requests"\)[\s\S]*token_hash:/);
  assert.doesNotMatch(joinHandler, /\.from\("loyalty_members"\)/);
  assert.match(joinHandler, /return acceptedResponse\(res, requestId\)/);
  assert.match(
    joinHandler,
    /verificationUrl: `\$\{baseUrl\}\/loyalty\/verify#token=\$\{encodeURIComponent\(rawToken\)\}`/
  );
  assert.doesNotMatch(joinHandler, /token:\s*rawToken|token_hash:\s*rawToken/);
  assert.match(common, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(verifyPage, /window\.location\.hash/);
  assert.match(verifyPage, /window\.history\.replaceState/);
  assert.match(verifyHandler, /"finalize_loyalty_enrollment"/);
  assert.doesNotMatch(verifyHandler, /console\.[^(]+\([^)]*rawToken/);
  assert.match(
    sql,
    /delete from public\.loyalty_enrollment_requests[\s\S]*returning \* into v_request;[\s\S]*public\.join_loyalty_program/
  );
});

check("OpenAI usage shares a durable per-user quota across runtimes", () => {
  const helper = read("server/_shared/ai_quota.ts");
  const reply = read("server/_shared/ai_reply.ts");
  const kpi = read("api/kpi/[...slug].ts");
  const tagReviews = read("server/_shared/handlers/cron/ai/tag-reviews.ts");
  const edge = read("supabase/functions/generate-reply/index.ts");
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");

  assert.match(helper, /createHash\("sha256"\)\.update\(`ai:user:\$\{userId\}`\)/);
  assert.match(helper, /"consume_security_rate_limit"/);
  assert.match(reply, /consumeAiUserQuota\(resolvedSupabaseAdmin, userId\)/);
  assert.match(kpi, /consumeAiUserQuota\(supabaseAdmin, userId\)/);
  const kpiRequest = kpi.slice(
    kpi.indexOf("const doRequest"),
    kpi.indexOf('if (mode === "basic")')
  );
  assert.ok(
    kpiRequest.indexOf("await consumeQuota()") >= 0 &&
      kpiRequest.indexOf('fetch("https://api.openai.com/v1/responses"') >
        kpiRequest.indexOf("await consumeQuota()")
  );
  const analyzeReview = tagReviews.slice(
    tagReviews.indexOf("const analyzeReview"),
    tagReviews.indexOf("const analyzeWithRetry")
  );
  const quota = analyzeReview.indexOf(
    "consumeAiUserQuota(supabaseAdmin, userId)"
  );
  const openAiCall = analyzeReview.indexOf(
    'fetch("https://api.openai.com/v1/responses"'
  );
  assert.ok(quota >= 0 && openAiCall > quota);
  assert.match(tagReviews, /analyzeWithRetry\([\s\S]*reviewUserId,[\s\S]*requestId/);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(edge, /"consume_security_rate_limit"/);
  assert.equal(
    edge.match(/await consumeOpenAiQuota\(\)/g)?.length,
    2
  );
  assert.match(
    edge,
    /initialQuotaFailure[\s\S]*fetch\("https:\/\/api\.openai\.com\/v1\/responses"[\s\S]*response\.status === 404[\s\S]*fallbackQuotaFailure[\s\S]*fetch\("https:\/\/api\.openai\.com\/v1\/responses"/
  );
  assert.doesNotMatch(edge, /rateLimitMap|new Map<string, \{ count:/);
  assert.match(
    sql,
    /create table if not exists public\.security_rate_limits[\s\S]*primary key \(bucket_key, window_start\)/
  );
  assert.match(
    sql,
    /revoke all on function public\.consume_security_rate_limit\(text, integer, integer, integer\)[\s\S]*from public, anon, authenticated/
  );
});

check("upload policy enforces size, type, signature, and a private bucket", () => {
  const api = read("api/settings.ts");
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");
  assert.match(api, /MAX_LOGO_BYTES = 3 \* 1024 \* 1024/);
  assert.match(api, /hasExpectedImageSignature/);
  assert.match(api, /LOGO_TYPES/);
  assert.match(
    sql,
    /values \(\s*'brand-assets',\s*'brand-assets',\s*false,\s*3145728,/i
  );
  assert.match(sql, /file_size_limit = excluded\.file_size_limit/);
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /on conflict \(id\) do update set/i);
});

check("team invitations bind the authenticated email", () => {
  const source = read("api/team.ts");
  assert.match(source, /authUserEmail\s*!==\s*email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /Invitation belongs to another email/);
  assert.match(source, /const escapeHtml =/);
  assert.match(source, /safeInviteUrl = escapeHtml\(inviteUrl\)/);
  assert.match(source, /process\.env\.APP_URL[\s\S]*process\.env\.APP_BASE_URL/);
  assert.doesNotMatch(source, /x-forwarded-proto|req\.headers\.host/);
  assert.match(source, /createHmac\("sha256", serviceRoleKey\)/);
  assert.match(source, /"consume_security_rate_limit"/);
  const quota = source.indexOf("consumeInvitationRateLimit");
  const invitationLookup = source.indexOf('.from("team_invitations")', quota);
  assert.ok(quota >= 0 && invitationLookup > quota);
});

check("loyalty child rows and Wallet lookups preserve one tenant scope", () => {
  const sql = read("supabase/migrations/20260713073853_production_security_hardening.sql");
  const wallet = read("server/_shared/handlers/loyalty/apple-pass.ts");
  for (const constraint of [
    "loyalty_programs_scope_unique",
    "loyalty_members_scope_unique",
    "loyalty_members_program_scope_fk",
    "loyalty_visits_member_scope_fk",
    "loyalty_rewards_member_scope_fk",
    "wallet_passes_member_scope_fk"
  ]) {
    assert.match(sql, new RegExp(constraint));
  }
  assert.match(
    sql,
    /revoke insert on table public\.loyalty_visits from authenticated/
  );
  assert.match(
    sql,
    /revoke insert, update, delete on table public\.loyalty_rewards from authenticated/
  );
  assert.match(
    sql,
    /revoke all on table public\.wallet_passes from authenticated/
  );
  const memberLookup = wallet.slice(
    wallet.indexOf('.from<LoyaltyMemberRow>("loyalty_members")'),
    wallet.indexOf('.from<LoyaltyProgramRow>("loyalty_programs")')
  );
  for (const column of ["program_id", "user_id", "location_id"]) {
    assert.match(memberLookup, new RegExp(`\\.eq\\("${column}", walletPass\\.`));
  }
  const rewardLookup = wallet.slice(
    wallet.indexOf('.from<LoyaltyRewardRow>("loyalty_rewards")'),
    wallet.indexOf('.from<WalletPassRow>("wallet_passes")', wallet.indexOf('.from<LoyaltyRewardRow>("loyalty_rewards")'))
  );
  for (const column of ["member_id", "program_id", "user_id", "location_id"]) {
    assert.match(rewardLookup, new RegExp(`\\.eq\\("${column}", walletPass\\.`));
  }
});

check("invitation account mismatch stays generic and preserves the invite token", () => {
  const invite = read("src/pages/Invite.tsx");
  const forbiddenBranch = invite.indexOf("response.status === 403");
  const responseBodyRead = invite.indexOf("await response.text()", forbiddenBranch);
  assert.ok(forbiddenBranch >= 0 && responseBodyRead > forbiddenBranch);
  assert.match(
    invite,
    /Cette invitation ne peut pas être acceptée avec le compte actuellement connecté\./
  );
  assert.doesNotMatch(invite, /Invitation belongs to another email/);
  assert.match(invite, /Se connecter avec un autre compte/);
  assert.match(invite, /signOut\(\{\s*scope: "local"\s*\}\)/s);
  assert.match(invite, /navigate\(invitePath,\s*\{ replace: true \}\)/);

  const app = read("src/App.tsx");
  assert.match(app, /const isPublicInvitePath = location\.pathname === "\/invite"/);
  assert.match(
    app,
    /!session[\s\S]*!isCallbackPath[\s\S]*!isPublicLoyaltyPath[\s\S]*!isPublicInvitePath/
  );
});

check("company logo selection is validated before FileReader allocation", () => {
  const source = read("src/pages/SettingsEntreprise.tsx");
  assert.match(source, /MAX_LOGO_BYTES = 3 \* 1024 \* 1024/);
  assert.match(
    source,
    /ALLOWED_LOGO_TYPES = new Set\(\[\s*"image\/png",\s*"image\/jpeg",\s*"image\/webp"\s*\]\)/s
  );
  const handlerStart = source.indexOf("const handleLogoUpload");
  const handlerEnd = source.indexOf("const handleLogoRemove", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const typeCheck = handler.indexOf("ALLOWED_LOGO_TYPES.has(file.type)");
  const sizeCheck = handler.indexOf("file.size > MAX_LOGO_BYTES");
  const reader = handler.indexOf("new FileReader()");
  assert.ok(
    typeCheck >= 0 &&
      sizeCheck > typeCheck &&
      reader > sizeCheck,
    "type and size must be rejected before FileReader"
  );
  assert.match(source, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(source, /PNG, JPEG ou WebP · 3 Mio maximum\./);
});

check("monthly report emails embed the private logo with CID and keep the PDF", () => {
  const source = read("server/_shared/handlers/cron/monthly-reports-api.ts");
  const logoLoaderStart = source.indexOf("const getBrandLogoAttachment");
  const brandingResolverStart = source.indexOf(
    "const resolveEmailBranding",
    logoLoaderStart
  );
  assert.ok(logoLoaderStart >= 0 && brandingResolverStart > logoLoaderStart);
  const logoLoader = source.slice(logoLoaderStart, brandingResolverStart);
  assert.match(logoLoader, /\.from\("brand-assets"\)[\s\S]*\.download\(logoPath\)/);
  assert.doesNotMatch(logoLoader, /createSignedUrl/);
  assert.match(logoLoader, /contentId: "brand-logo"/);
  assert.match(source, /logoSrc: logoAttachment \? "cid:brand-logo" : null/);
  assert.match(source, /\{ content_id: attachment\.contentId \}/);
  assert.match(
    source,
    /filename: `rapport-mensuel-\$\{periodKey\}\.pdf`,\s*content: attachmentContent/
  );
  assert.match(source, /\.\.\.\(logoAttachment \? \[logoAttachment\] : \[\]\)/);
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
    "server/_shared/handlers/cron/ai/tag-reviews.ts",
    "server/_shared/handlers/google/gbp/reviews/sync.ts",
    "supabase/functions/generate-reply/index.ts",
    "supabase/functions/google_gbp_sync_all/index.ts",
    "supabase/functions/google_oauth_exchange/index.ts",
    "supabase/functions/post-reply-google/index.ts"
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /Google (?:token refresh|reply) failed:\s*\$\{/);
  assert.doesNotMatch(sources, /OpenAI error:\s*\$\{/);
  assert.doesNotMatch(sources, /outputTextPreview|resendResponse\.text\(\)/);
  assert.doesNotMatch(sources, /jwt_prefix|JWT preview/);
  assert.doesNotMatch(sources, /googleResponse\s*:/);
});

check("Google GBP sync persists only controlled error codes, not provider bodies", () => {
  const locations = read("server/_shared/handlers/google/gbp/sync.ts");
  const reviews = read("server/_shared/handlers/google/gbp/reviews/sync.ts");
  const cronReviews = read(
    "server/_shared/handlers/cron/google/sync-replies.ts"
  );
  const edgeAll = read("supabase/functions/google_gbp_sync_all/index.ts");
  const sources = `${locations}\n${reviews}\n${cronReviews}\n${edgeAll}`;
  assert.match(locations, /type SyncFailure = \{[\s\S]*code: string;/);
  assert.doesNotMatch(locations, /type SyncFailure = \{[\s\S]*message: string;/);
  assert.doesNotMatch(sources, /error_description/);
  assert.doesNotMatch(sources, /raw:\s*review\b/);
  assert.match(reviews, /raw:\s*null/);
  assert.match(cronReviews, /raw:\s*null/);
  assert.match(edgeAll, /raw:\s*null/);
  assert.match(sources, /classifyGoogleError/);
  assert.doesNotMatch(sources, /extractGoogleErrorMessage|parseGoogleErrorMessage/);
});

check("Google reply public errors are generic, correlated, and identifier-free", () => {
  const source = read("server/_shared/handlers/google/reply.ts");
  assert.match(source, /const sendPublicError =/);
  assert.match(source, /error: "Request failed"/);
  assert.match(source, /requestId,/);
  assert.doesNotMatch(source, /json\(\{\s*error:\s*`Missing env:/);
  assert.doesNotMatch(source, /return res\.status\(status\)\.json\(\{ error: msg \}\)/);
  assert.doesNotMatch(source, /error: "Review not found",[\s\S]*user_id:/);
  assert.doesNotMatch(source, /lookup:\s*\{\s*id:/);
});

check("production API logging is allowlisted to correlation and aggregate fields", () => {
  const helper = read("server/_shared/safe_console.ts");
  const apiUtils = read("server/_shared/api_utils.ts");
  const auth = read("server/_shared/_auth.ts");
  for (const path of [
    "api/reviews.ts",
    "api/kpi/[...slug].ts",
    "api/cron/[...slug].ts",
    "api/google/[...slug].ts",
    "api/reports/[...slug].ts",
    "server/_shared/ai_reply.ts",
    "server/_shared/handlers/google/reply.ts",
    "server/_shared/handlers/cron/ai/tag-reviews.ts",
    "server/_shared/handlers/cron/google/sync-replies.ts",
    "server/_shared/handlers/google/gbp/sync.ts",
    "server/_shared/handlers/google/gbp/reviews/sync.ts",
    "server/_shared/handlers/cron/monthly-reports-api.ts",
    "server/_shared/utils/googleAuthState.ts",
    "server/_shared/utils/withRetry.ts"
  ]) {
    assert.match(read(path), /createProductionSafeConsole/, path);
  }
  for (const allowed of ["requestId", "route", "status", "code", "count"]) {
    assert.match(helper, new RegExp(`${allowed}[,:]`));
  }
  assert.doesNotMatch(
    helper,
    /\b(?:url|query|stack|userId|locationId|businessId|reportId)\s*:/
  );
  assert.match(apiUtils, /createProductionSafeConsole\(label\)\.log/);
  assert.doesNotMatch(
    read("server/_shared/handlers/cron/ai/tag-reviews.ts"),
    /`user=\$\{userId\}`/
  );
  const authLog = auth.slice(
    auth.indexOf('logRequest("[auth]"'),
    auth.indexOf("return {", auth.indexOf('logRequest("[auth]"'))
  );
  assert.doesNotMatch(authLog, /req\.url|userId/);
});

check("production log sanitizer drops URLs, queries, stacks, and business IDs", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const captured: string[] = [];
  let retryErrorMessage = "";
  process.env.NODE_ENV = "production";
  console.log = (...args: unknown[]) => captured.push(JSON.stringify(args));
  console.warn = (...args: unknown[]) => captured.push(JSON.stringify(args));
  console.error = (...args: unknown[]) => captured.push(JSON.stringify(args));
  try {
    const { createProductionSafeConsole } = await import(
      "../server/_shared/safe_console"
    );
    const { logRequest } = await import("../server/_shared/api_utils");
    const logger = createProductionSafeConsole("/api/security-test");
    logger.error("provider exception", {
      requestId: "goal002-log-test",
      route: "https://example.invalid/private?code=secret",
      status: 502,
      code: "UPSTREAM_FAILED",
      count: 3,
      query: { state: "secret" },
      stack: "sensitive stack",
      userId: "tenant-a",
      locationId: "accounts/1/locations/2"
    });
    logRequest("[auth]", {
      requestId: "goal002-auth-log-test",
      route: "/api/kpi/analytics?location_id=accounts/1/locations/2",
      userId: "tenant-secret"
    });
    const { withRetry } = await import("../server/_shared/utils/withRetry");
    try {
      await withRetry(
        () => {
          const error = new Error("tenant-secret provider-body");
          Object.assign(error, { status: 500 });
          throw error;
        },
        {
          tries: 1,
          requestId: "goal002-retry-log-test",
          path: "/api/google/gbp/sync?token=secret"
        }
      );
    } catch (error) {
      retryErrorMessage = error instanceof Error ? error.message : String(error);
    }
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
  const evidence = captured.join("\n");
  assert.match(evidence, /goal002-log-test/);
  assert.match(evidence, /goal002-auth-log-test/);
  assert.match(evidence, /goal002-retry-log-test/);
  assert.match(evidence, /UPSTREAM_FAILED/);
  assert.doesNotMatch(
    evidence,
    /example\.invalid|secret|provider-body|sensitive stack|tenant-a|accounts\/1|tenant-secret/
  );
  assert.doesNotMatch(retryErrorMessage, /secret|provider-body|tenant-secret/);
});

check("all scheduled jobs use POST and one shared cron secret contract", () => {
  const ai = read("server/_shared/handlers/cron/ai/tag-reviews.ts");
  const google = read("server/_shared/handlers/cron/google/sync-replies.ts");
  const monthly = read("server/_shared/handlers/cron/monthly-reports-api.ts");
  const legacyMonthly = read(
    "server/_shared/handlers/cron/monthly-reports.ts"
  );
  const automations = read("api/reports/[...slug].ts");
  for (const source of [ai, google, monthly, legacyMonthly]) {
    assert.match(source, /method !== "POST"|req\.method !== "POST"/);
    assert.match(source, /x-cron-secret/);
    assert.match(source, /authorization/);
    assert.match(source, /startsWith\("bearer "\)/);
    assert.match(source, /headerSecret === expected \|\| bearer === expected/);
  }
  assert.match(automations, /req\.method !== "POST"/);
  assert.match(automations, /x-cron-secret/);
  assert.match(automations, /bearerSecret === expectedCronSecret/);
  assert.match(
    automations,
    /cronSecret === expectedCronSecret \|\| bearerSecret === expectedCronSecret/
  );
  assert.doesNotMatch(ai, /getBearerToken|Admin only|rpc\("is_admin"\)/);
  assert.doesNotMatch(
    `${ai}\n${google}\n${legacyMonthly}`,
    /method !== "POST" && method !== "GET"/
  );
  const docs = `${read("docs/SUPABASE_EGRESS_AUDIT.md")}\n${read(
    "docs/PRODUCTION_SECURITY_VALIDATION.md"
  )}`;
  assert.match(docs, /cron-job\.org/);
  assert.match(docs, /Authorization: Bearer/);
});

check("manual AI analysis is authenticated and tenant-scoped without cron access", () => {
  const reviewsApi = read("api/reviews.ts");
  const inbox = read("src/pages/Inbox.tsx");
  const systemHealth = read("src/pages/SystemHealth.tsx");
  for (const source of [inbox, systemHealth]) {
    assert.match(source, /\/api\/reviews\?action=queue_analysis/);
    assert.doesNotMatch(source, /fetch\(\s*[`"]\/api\/cron\/ai\/tag-reviews/);
  }
  const actionStart = reviewsApi.indexOf('action === "queue_analysis"');
  const nextAction = reviewsApi.indexOf(
    'action === "ensure_draft"',
    actionStart
  );
  assert.ok(actionStart > 0 && nextAction > actionStart);
  const action = reviewsApi.slice(actionStart, nextAction);
  assert.match(action, /resolveDraftLocation/);
  assert.match(action, /\.eq\("user_id", userId\)/);
  assert.match(action, /\.eq\("location_id", locationContext\.googleLocationResource\)/);
  assert.match(action, /payload\?\.mode === "recent"/);
  assert.match(action, /: "backlog"/);
  assert.match(action, /ai_tag_status\.in\.\(pending,error\)/);
  assert.match(action, /ai_tag_version\.is\.null/);
  assert.match(action, /type: "review_analyze"/);
  assert.match(action, /user_id: userId/);
  assert.match(action, /location_id: locationContext\.googleLocationResource/);
  assert.match(action, /status: "pending"/);
  assert.doesNotMatch(action, /CRON_SECRET|getBearerToken|is_admin/);
});

check("production recovery artifacts fail closed without vulnerable rollback", () => {
  const maintenance = read(
    "recovery/goal-002/vercel-maintenance/api/maintenance.ts"
  );
  const maintenanceConfig = JSON.parse(
    read("recovery/goal-002/vercel-maintenance/vercel.json")
  ) as {
    routes?: Array<{ src?: string; dest?: string; handle?: string }>;
  };
  assert.match(maintenance, /status\(503\)/);
  assert.match(maintenance, /Retry-After/);
  assert.match(maintenance, /Cache-Control/);
  assert.doesNotMatch(
    maintenance,
    /SUPABASE|OPENAI|GOOGLE|fetch\(|createClient|process\.env/
  );
  assert.deepEqual(maintenanceConfig.routes?.at(-1), {
    src: "/(.*)",
    dest: "/api/maintenance"
  });

  const safeDenyRoot =
    "recovery/goal-002/edge-safe-deny/supabase/functions";
  const helper = read(`${safeDenyRoot}/_shared/safe_deny.ts`);
  assert.match(helper, /status: 503/);
  assert.match(helper, /GOAL002_SAFE_DENY/);
  assert.doesNotMatch(helper, /createClient|\.rpc\(|fetch\(/);
  for (const name of [
    "generate-reply",
    "google_oauth_start",
    "google_oauth_exchange",
    "google_gbp_sync_all",
    "google_gbp_sync_locations",
    "post-reply-google",
    "process-review-analyze"
  ]) {
    assert.match(
      read(`${safeDenyRoot}/${name}/index.ts`),
      new RegExp(`createSafeDenyHandler\\("${name}"\\)`)
    );
  }

  const migrationWatchdog = read("scripts/run-goal-002-db-push.mjs");
  assert.match(migrationWatchdog, /125_000/);
  assert.match(migrationWatchdog, /130_000/);
  assert.match(
    migrationWatchdog,
    /goal002_migrations_20260713073853_20260716142352/
  );
  assert.match(
    migrationWatchdog,
    /fhadiwkdznhuxtlgrwfd:20260713073853,20260716142352/
  );
  assert.match(migrationWatchdog, /assertExactMigrationPlan/);
  assert.match(
    migrationWatchdog,
    /20260713073853_production_security_hardening\.sql[\s\S]*20260716142352_fix_claim_ai_tag_candidates_digest\.sql/
  );
  assert.match(migrationWatchdog, /\["db", "push", "--linked", "--dry-run"\]/);
  assert.match(migrationWatchdog, /\["db", "push", "--linked"\]/);
  assert.match(migrationWatchdog, /child\.kill\("SIGTERM"\)/);
  assert.match(migrationWatchdog, /child\.kill\("SIGKILL"\)/);

  const planResult = spawnSync(
    process.execPath,
    ["scripts/run-goal-002-db-push.mjs", "--self-test"],
    { cwd: root, encoding: "utf8", timeout: 2_000 }
  );
  assert.equal(planResult.status, 0);
  assert.match(planResult.stdout, /exact migration-plan self-test passed/);

  const timeoutResult = spawnSync(
    process.execPath,
    ["scripts/run-goal-002-db-push.mjs", "--self-test-timeout"],
    { cwd: root, encoding: "utf8", timeout: 2_000 }
  );
  assert.equal(timeoutResult.status, 124);
  assert.match(timeoutResult.stderr, /terminating the client/);
  assert.match(timeoutResult.stderr, /hard 350ms ceiling/);

  const markerResult = spawnSync(
    process.execPath,
    ["scripts/run-goal-002-db-push.mjs"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GOAL002_PRODUCTION_AUTHORIZED: "" }
    }
  );
  assert.equal(markerResult.status, 2);

  const classificationResult = spawnSync(
    process.execPath,
    ["scripts/inspect-goal-002-migration-state.mjs", "--self-test"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(classificationResult.status, 0);
  assert.match(
    classificationResult.stdout,
    /migration-state classification self-test passed/
  );

  const migrationInspection = read(
    "scripts/inspect-goal-002-migration-state.sql"
  );
  assert.match(
    migrationInspection,
    /goal002_migrations_20260713073853_20260716142352/
  );
  assert.match(migrationInspection, /where version = '20260713073853'/);
  assert.match(migrationInspection, /where version = '20260716142352'/);
  assert.match(migrationInspection, /extensions\[.\]digest/);
  assert.match(migrationInspection, /search_path=pg_catalog/);
  assert.match(migrationInspection, /claim_ai_tag_candidates/);
  assert.match(migrationInspection, /prospective_expected/);
  assert.match(migrationInspection, /hardening_expected/);
  assert.match(migrationInspection, /hardening_vector/);
  assert.match(migrationInspection, /digest_fix_expected/);
  assert.match(migrationInspection, /digest_fix_vector/);

  const inspector = read("scripts/inspect-goal-002-migration-state.mjs");
  assert.match(inspector, /connectionTimeoutMillis: 10_000/);
  assert.match(inspector, /query_timeout: 30_000/);
  assert.match(inspector, /statement_timeout: 30_000/);
  assert.match(inspector, /45_000/);
  assert.match(inspector, /GOAL002_BASELINE_HARDENING_VECTOR/);
  assert.match(inspector, /GOAL002_BASELINE_DIGEST_FIX_VECTOR/);
  assert.match(inspector, /HARDENING_ONLY/);

  const runbook = read("docs/runbooks/GOAL-002-production-deployment-gate.md");
  assert.match(runbook, /première\s+mutation\s+matérielle/);
  assert.match(runbook, /recovery\/goal-002\/vercel-maintenance/);
  assert.match(runbook, /recovery\/goal-002\/edge-safe-deny/);
  assert.match(runbook, /exactement \*\*trois\*\* déploiements Vercel/);
  assert.match(runbook, /"enabled":false/);
  assert.match(runbook, /"enabled":true/);
  assert.match(runbook, /CRON_JOB_ORG_API_KEY/);
  assert.match(runbook, /requestMethod = 1/);
  assert.match(runbook, /timezone `Europe\/Paris`/);
  for (const [path, cadence] of [
    ["/api/cron/google/sync-replies", "0 \\* \\* \\* \\*"],
    ["/api/cron/ai/tag-reviews", "0 \\*/2 \\* \\* \\*"],
    ["/api/reports/automations", "0,30 \\* \\* \\* \\*"],
    ["/api/cron/monthly-reports", "0 8 1 \\* \\*"]
  ]) {
    assert.match(runbook, new RegExp(`${path}[\\s\\S]*${cadence}`));
  }
  assert.match(
    runbook,
    /process-review-analyze[\s\S]*generate-reply[\s\S]*post-reply-google[\s\S]*google_oauth_start[\s\S]*google_oauth_exchange/
  );
  assert.match(
    runbook,
    /Safe-deny Edge après les deux migrations[\s\S]*google_gbp_sync_locations[\s\S]*google_gbp_sync_all/
  );
  assert.match(
    runbook,
    /20260713073853_production_security_hardening\.sql[\s\S]*20260716142352_fix_claim_ai_tag_candidates_digest\.sql/
  );
  assert.match(runbook, /HARDENING_ONLY/);
  assert.match(runbook, /goal002_claim_ai_tag_candidates_postdeploy\.sql/);
  assert.match(runbook, /manage-goal-002-cron-jobs\.mjs snapshot/);
  assert.match(runbook, /probe-goal-002-safe-deny\.mjs/);

  const cronHelper = read("scripts/manage-goal-002-cron-jobs.mjs");
  assert.match(cronHelper, /payload\.jobDetails \?\? payload\.job/);
  assert.match(cronHelper, /someFailed/);
  assert.match(cronHelper, /immutableConfigSha256/);
  assert.match(cronHelper, /"<redacted>"/);
  assert.match(cronHelper, /predictions/);
  assert.doesNotMatch(cronHelper, /console\.log\([^)]*key/);

  const safeDenyProbe = read("scripts/probe-goal-002-safe-deny.mjs");
  assert.match(safeDenyProbe, /GOAL002_SAFE_DENY/);
  assert.match(safeDenyProbe, /SUPABASE_ANON_KEY/);
  assert.match(safeDenyProbe, /verifyJwt/);

  const postdeployProbe = read(
    "supabase/tests/goal002_claim_ai_tag_candidates_postdeploy.sql"
  );
  assert.match(postdeployProbe, /GOAL002_SYNTH/);
  assert.match(postdeployProbe, /goal002_synth_attacker\.digest/);
  assert.match(postdeployProbe, /set local role anon/);
  assert.match(postdeployProbe, /set local role authenticated/);
  assert.match(postdeployProbe, /set local role service_role/);
  assert.match(postdeployProbe, /generate_series\(1, 21\)/);
  assert.match(postdeployProbe, /rollback;/);
  assert.doesNotMatch(postdeployProbe, /on conflict/i);
  assert.doesNotMatch(runbook, /rollback Vercel vers le dernier|retour à l'ancienne fonction/);
  assert.match(runbook, /restauration de `dpl_5xpfD2E6wbsmAZgkmnkKaVvux5Sd`/);
});

check("Edge logs exclude tenant identifiers and raw provider errors", () => {
  const locations = read(
    "supabase/functions/google_gbp_sync_locations/index.ts"
  );
  const all = read("supabase/functions/google_gbp_sync_all/index.ts");
  const reply = read("supabase/functions/post-reply-google/index.ts");
  assert.doesNotMatch(locations, /Syncing Google accounts for user/);
  assert.doesNotMatch(all, /console\.error\([^)]*connectionError/s);
  assert.match(reply, /requestId: payload\.requestId/);
  assert.match(reply, /step: payload\.step/);
  assert.doesNotMatch(
    reply,
    /logEvent\(\{[\s\S]{0,240}\b(?:userId|reviewId):/
  );
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
    const invoke = async (
      route: string,
      method: string,
      secret?: string,
      credential: "header" | "bearer" = "header"
    ) => {
      const response = new MockResponse();
      const request = {
        method,
        url: `/api/cron/${route}`,
        query: { slug: route.split("/") },
        headers: {
          ...(secret && credential === "header"
            ? { "x-cron-secret": secret }
            : {}),
          ...(secret && credential === "bearer"
            ? { authorization: `Bearer ${secret}` }
            : {}),
          "x-request-id": "goal002-security-test"
        }
      } as unknown as VercelRequest;
      await handler(request, response as unknown as VercelResponse);
      return response;
    };

    for (const [route, status] of [
      ["ai/tag-reviews", 403],
      ["google/sync-replies", 403],
      ["monthly-reports", 403]
    ] as const) {
      assert.equal((await invoke(route, "POST")).statusCode, status, `${route} anonymous`);
      assert.equal((await invoke(route, "POST", wrongSecret)).statusCode, status, `${route} wrong secret`);
      assert.equal((await invoke(route, "PATCH", expectedSecret)).statusCode, 405, `${route} method`);
      assert.equal(
        (await invoke(route, "GET", expectedSecret, "bearer")).statusCode,
        405,
        `${route} bearer method`
      );
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
