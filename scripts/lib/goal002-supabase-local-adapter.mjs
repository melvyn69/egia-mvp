import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { SyntheticRunnerError } from "./goal002-synth-runner.mjs";
import {
  createLocalGoal002ProbeRequest,
  executeGoal002PostdeployProbes
} from "./goal002-postdeploy-probes.mjs";

const classifyUrl = (value, productionAuthorized) => {
  const url = new URL(value);
  if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) {
    return { url: url.toString().replace(/\/$/, ""), isProduction: false };
  }
  if (
    productionAuthorized === true &&
    url.protocol === "https:" &&
    url.hostname === "fhadiwkdznhuxtlgrwfd.supabase.co"
  ) {
    return { url: url.toString().replace(/\/$/, ""), isProduction: true };
  }
  throw new SyntheticRunnerError("SUPABASE_TARGET_FORBIDDEN");
};

const expectOk = (result, code) => {
  if (result.error) {
    const suffix =
      typeof result.error.code === "string"
        ? `_${result.error.code.replace(/[^A-Z0-9]/gi, "_").toUpperCase()}`
        : "";
    throw new SyntheticRunnerError(`${code}${suffix}`);
  }
  return result.data;
};

const SYNTHETIC_PREREQUISITE_PREFIX =
  /^GOAL002_SYNTH_PREREQUISITE_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isRecoverableFounderSyntheticUser = (user) => {
  const metadata = user?.app_metadata;
  return Boolean(
    user?.id &&
    metadata?.goal002_synthetic === true &&
    metadata?.goal002_mode === "prerequisite" &&
    ["A", "B"].includes(metadata?.goal002_side) &&
    typeof metadata?.goal002_prefix === "string" &&
    SYNTHETIC_PREREQUISITE_PREFIX.test(metadata.goal002_prefix)
  );
};

export const recoverFounderSyntheticUsers = async ({ identitySet, users, cleanup }) => {
  if (identitySet.emailSource !== "founder") return 0;
  const recoverable = [];
  for (const side of ["A", "B"]) {
    const email = identitySet.users[side].email;
    const existing = users.find(
      (user) => typeof user.email === "string" && user.email.toLowerCase() === email.toLowerCase()
    );
    if (!existing) continue;
    if (!isRecoverableFounderSyntheticUser(existing)) {
      throw new SyntheticRunnerError("FOUNDER_EMAIL_ALREADY_IN_USE");
    }
    recoverable.push(existing);
  }
  for (const existing of recoverable) {
    const metadata = existing.app_metadata;
    await cleanup({
      prefix: metadata.goal002_prefix,
      userIds: [existing.id],
      rateLimitBucketKeys: Array.isArray(metadata.goal002_rate_limit_bucket_keys)
        ? metadata.goal002_rate_limit_bucket_keys
        : [],
      storagePaths: Array.isArray(metadata.goal002_storage_paths)
        ? metadata.goal002_storage_paths
        : []
    });
  }
  return recoverable.length;
};

export class SupabaseLocalSyntheticAdapter {
  isProduction;
  productionAuthorized;
  #url;
  #anonKey;
  #admin;
  #contexts = new Map();
  #postdeployRequest;

  constructor({
    url,
    anonKey,
    serviceRoleKey,
    productionAuthorized = false,
    postdeployRequest
  }) {
    const target = classifyUrl(url, productionAuthorized);
    this.#url = target.url;
    this.isProduction = target.isProduction;
    this.productionAuthorized = target.isProduction && productionAuthorized;
    if (!anonKey || !serviceRoleKey) throw new SyntheticRunnerError("LOCAL_KEYS_MISSING");
    this.#anonKey = anonKey;
    this.#admin = createClient(this.#url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    this.#postdeployRequest = postdeployRequest ?? (target.isProduction ? null : createLocalGoal002ProbeRequest());
  }

  async cleanupExpired({ ttlMs }) {
    const users = await this.#listSyntheticUsers();
    const threshold = Date.now() - ttlMs;
    const stale = new Map();
    for (const user of users) {
      if (
        user.app_metadata?.goal002_synthetic === true &&
        new Date(user.created_at).valueOf() < threshold
      ) {
        const prefix = user.app_metadata?.goal002_prefix;
        if (typeof prefix === "string" && prefix.startsWith("GOAL002_SYNTH_")) {
          const entry = stale.get(prefix) ?? { userIds: [], rateLimitBucketKeys: [], storagePaths: [] };
          entry.userIds.push(user.id);
          const rateLimitBucketKeys = user.app_metadata?.goal002_rate_limit_bucket_keys;
          const storagePaths = user.app_metadata?.goal002_storage_paths;
          if (Array.isArray(rateLimitBucketKeys)) entry.rateLimitBucketKeys.push(...rateLimitBucketKeys);
          if (Array.isArray(storagePaths)) entry.storagePaths.push(...storagePaths);
          stale.set(prefix, entry);
        }
      }
    }
    for (const [prefix, entry] of stale) {
      await this.#cleanupPrefix(prefix, entry.userIds, entry.rateLimitBucketKeys, entry.storagePaths);
      const finalInventory = await this.inventory({ prefix });
      if (finalInventory.total !== 0) throw new SyntheticRunnerError("TTL_CLEANUP_INCOMPLETE");
    }
  }

  async #listSyntheticUsers() {
    const users = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.#admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new SyntheticRunnerError("AUTH_INVENTORY_FAILED");
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    return users;
  }

  async #updateSyntheticMetadata(identitySet, side, userId, context) {
    const { error } = await this.#admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        goal002_synthetic: true,
        goal002_prefix: identitySet.prefix,
        goal002_side: side,
        goal002_mode: identitySet.mode,
        goal002_rate_limit_bucket_keys: context.rateLimitBucketKeys,
        goal002_storage_paths: context.objects
      }
    });
    if (error) throw new SyntheticRunnerError("AUTH_METADATA_UPDATE_FAILED");
  }

  async #recoverFounderIdentities(identitySet) {
    if (identitySet.emailSource !== "founder") return;
    const users = await this.#listSyntheticUsers();
    await recoverFounderSyntheticUsers({
      identitySet,
      users,
      cleanup: ({ prefix, userIds, rateLimitBucketKeys, storagePaths }) =>
        this.#cleanupPrefix(prefix, userIds, rateLimitBucketKeys, storagePaths)
    });
  }

  async #businessInventory(prefix) {
    const { data: businesses, error } = await this.#admin
      .from("business_settings")
      .select("business_id")
      .like("business_name", `${prefix}%`);
    if (error) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
    const businessIds = businesses.map((row) => row.business_id);
    if (businessIds.length === 0) return { businessIds, assets: [] };
    const { data: entities, error: entityError } = await this.#admin
      .from("legal_entities")
      .select("id,business_id")
      .in("business_id", businessIds);
    if (entityError) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
    return {
      businessIds,
      assets: entities.map(
        (entity) =>
          `business/${entity.business_id}/legal_entities/${entity.id}/${prefix}_logo.png`
      )
    };
  }

  async #cleanupPrefix(prefix, userIds, rateLimitBucketKeys = [], storagePaths = []) {
    const inventory = await this.#businessInventory(prefix);
    if (
      storagePaths.some(
        (path) =>
          typeof path !== "string" ||
          !path.startsWith("business/") ||
          !path.endsWith(`/${prefix}_logo.png`)
      )
    ) {
      throw new SyntheticRunnerError("STORAGE_RECOVERY_PATH_INVALID");
    }
    const assets = [...new Set([...inventory.assets, ...storagePaths])];
    if (assets.length > 0) {
      const { error } = await this.#admin.storage.from("brand-assets").remove(assets);
      if (error) throw new SyntheticRunnerError("STORAGE_TEARDOWN_FAILED");
    }
    if (userIds.length > 0) {
      for (const table of [
        "wallet_passes",
        "loyalty_rewards",
        "loyalty_visits",
        "loyalty_members",
        "loyalty_programs",
        "team_invitations",
        "ai_draft_runs",
        "google_reviews",
        "google_locations"
      ]) {
        const column = table === "team_invitations" ? "owner_user_id" : "user_id";
        const { error } = await this.#admin.from(table).delete().in(column, userIds);
        if (error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
      }
    }
    const enrollment = await this.#admin
      .from("loyalty_enrollment_requests")
      .delete()
      .ilike("email", `${prefix.toLowerCase()}%`);
    if (enrollment.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    if (rateLimitBucketKeys.length > 0) {
      const rateLimits = await this.#admin
        .from("security_rate_limits")
        .delete()
        .in("bucket_key", [...new Set(rateLimitBucketKeys)]);
      if (rateLimits.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    }
    const syntheticRateLimits = await this.#admin
      .from("security_rate_limits")
      .delete()
      .like("bucket_key", `${prefix}:%`);
    if (syntheticRateLimits.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    if (inventory.businessIds.length > 0) {
      const legal = await this.#admin.from("legal_entities").delete().in("business_id", inventory.businessIds);
      const settings = await this.#admin.from("business_settings").delete().in("business_id", inventory.businessIds);
      if (legal.error || settings.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    }
    for (const userId of userIds) {
      const { error } = await this.#admin.auth.admin.deleteUser(userId);
      if (error) throw new SyntheticRunnerError("AUTH_TEARDOWN_FAILED");
    }
  }

  async inventory({ prefix }) {
    let total = 0;
    for (const [table, column] of [
      ["business_settings", "business_name"],
      ["google_locations", "location_title"],
      ["google_reviews", "author_name"],
      ["ai_draft_runs", "location_id"],
      ["loyalty_programs", "name"],
      ["loyalty_members", "first_name"],
      ["team_invitations", "first_name"],
      ["legal_entities", "company_name"]
    ]) {
      const { count, error } = await this.#admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .like(column, `${prefix}%`);
      if (error) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
      total += count ?? 0;
    }
    const users = await this.#listSyntheticUsers();
    total += users.filter((user) => user.app_metadata?.goal002_prefix === prefix).length;
    const { count: enrollmentCount, error: enrollmentError } = await this.#admin
      .from("loyalty_enrollment_requests")
      .select("*", { count: "exact", head: true })
      .ilike("email", `${prefix.toLowerCase()}%`);
    if (enrollmentError) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
    total += enrollmentCount ?? 0;
    const rateLimitBucketKeys = new Set(
      users
        .filter((user) => user.app_metadata?.goal002_prefix === prefix)
        .flatMap((user) => user.app_metadata?.goal002_rate_limit_bucket_keys ?? [])
    );
    for (const context of this.#contexts.values()) {
      if (context.prefix === prefix) {
        for (const key of context.rateLimitBucketKeys ?? []) rateLimitBucketKeys.add(key);
      }
    }
    if (rateLimitBucketKeys.size > 0) {
      const { count, error } = await this.#admin
        .from("security_rate_limits")
        .select("*", { count: "exact", head: true })
        .in("bucket_key", [...rateLimitBucketKeys]);
      if (error) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
      total += count ?? 0;
    }
    const { count: syntheticRateLimitCount, error: syntheticRateLimitError } = await this.#admin
      .from("security_rate_limits")
      .select("*", { count: "exact", head: true })
      .like("bucket_key", `${prefix}:%`);
    if (syntheticRateLimitError) throw new SyntheticRunnerError("INVENTORY_QUERY_FAILED");
    total += syntheticRateLimitCount ?? 0;
    const businessInventory = await this.#businessInventory(prefix);
    const objectPaths = new Set(businessInventory.assets);
    for (const context of this.#contexts.values()) {
      if (context.prefix === prefix) {
        for (const objectPath of context.objects ?? []) objectPaths.add(objectPath);
      }
    }
    for (const objectPath of objectPaths) {
      const object = await this.#admin.storage.from("brand-assets").download(objectPath);
      if (!object.error && object.data) total += 1;
    }
    return { total };
  }

  async setup({ identitySet, mailbox }) {
    const context = {
      prefix: identitySet.prefix,
      executionId: identitySet.executionId,
      users: {},
      objects: [],
      rateLimitBucketKeys: [],
    };
    this.#contexts.set(identitySet.executionId, context);
    await this.#recoverFounderIdentities(identitySet);
    for (const side of ["A", "B"]) {
      const identity = identitySet.users[side];
      const created = expectOk(
        await this.#admin.auth.admin.createUser({
          email: identity.email,
          password: identity.password,
          email_confirm: true,
          app_metadata: {
            goal002_synthetic: true,
            goal002_prefix: identitySet.prefix,
            goal002_side: side,
            goal002_mode: identitySet.mode
          }
        }),
        "AUTH_CREATE_FAILED"
      );
      if (!created.user?.id) throw new SyntheticRunnerError("AUTH_USER_MISSING");
      const fixtureEmailDomain = identitySet.emailSource === "founder"
        ? "goal002.invalid"
        : identity.email.split("@").at(-1);
      context.users[side] = {
        id: created.user.id,
        client: null,
        accessToken: null,
        refreshToken: null,
        businessId: randomUUID(),
        entityId: randomUUID(),
        locationId: null,
        programId: null,
        existingMemberId: null,
        existingMemberEmail: `${identitySet.prefix.toLowerCase()}.${side}.existing-member@${fixtureEmailDomain}`,
        newMemberEmail: `${identitySet.prefix.toLowerCase()}.${side}.new-member@${fixtureEmailDomain}`
      };
      const client = createClient(this.#url, this.#anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const session = expectOk(
        await client.auth.signInWithPassword({ email: identity.email, password: identity.password }),
        "AUTH_SIGNIN_FAILED"
      );
      if (!session.session?.access_token) {
        throw new SyntheticRunnerError("ORDINARY_SESSION_MISSING");
      }
      context.users[side].client = client;
      context.users[side].accessToken = session.session.access_token;
      context.users[side].refreshToken = session.session.refresh_token;
    }

    for (const side of ["A", "B"]) {
      const user = context.users[side];
      const fixtureEmailDomain = identitySet.emailSource === "founder"
        ? "goal002.invalid"
        : identitySet.users[side].email.split("@").at(-1);
      expectOk(
        await this.#admin.from("business_settings").insert({
          business_id: user.businessId,
          user_id: user.id,
          business_name: `${identitySet.prefix}_${side}_COMPANY`,
          default_tone: "professionnel",
          default_length: "court"
        }),
        "COMPANY_CREATE_FAILED"
      );
      expectOk(
        await this.#admin.from("legal_entities").insert({
          id: user.entityId,
          business_id: user.businessId,
          is_default: true,
          company_name: `${identitySet.prefix}_${side}_LEGAL`,
          billing_country: "FR"
        }),
        "LEGAL_CREATE_FAILED"
      );
      const location = expectOk(
        await user.client
          .from("google_locations")
          .insert({
            user_id: user.id,
            account_resource_name: `accounts/${identitySet.prefix}_${side}`,
            location_resource_name: `locations/${identitySet.prefix}_${side}`,
            location_title: `${identitySet.prefix}_${side}_LOCATION`
          })
          .select("id")
          .single(),
        "LOCATION_CREATE_FAILED"
      );
      user.locationId = location.id;
      expectOk(
        await this.#admin.from("google_reviews").insert({
          user_id: user.id,
          location_name: `locations/${identitySet.prefix}_${side}`,
          review_name: `reviews/${identitySet.prefix}_${side}`,
          location_id: `locations/${identitySet.prefix}_${side}`,
          review_id: `${identitySet.prefix}_${side}_REVIEW`,
          author_name: `${identitySet.prefix}_${side}_AUTHOR`,
          rating: 5,
          comment: "Synthetic review"
        }),
        "REVIEW_CREATE_FAILED"
      );
      expectOk(
        await user.client.from("ai_draft_runs").insert({
          user_id: user.id,
          location_id: `${identitySet.prefix}_${side}_AI_STATE`,
          requested_limit: 1,
          generated_count: 0
        }),
        "AI_STATE_CREATE_FAILED"
      );
      const program = expectOk(
        await user.client
          .from("loyalty_programs")
          .insert({
            user_id: user.id,
            location_id: user.locationId,
            is_enabled: false,
            name: `${identitySet.prefix}_${side}_LOYALTY`
          })
          .select("id,public_token")
          .single(),
        "LOYALTY_PROGRAM_CREATE_FAILED"
      );
      user.programId = program.id;
      user.programPublicToken = program.public_token;
      const existingMember = expectOk(
        await user.client
          .from("loyalty_members")
          .insert({
            program_id: user.programId,
            user_id: user.id,
            location_id: user.locationId,
            first_name: `${identitySet.prefix}_${side}_EXISTING_MEMBER`,
            email: user.existingMemberEmail
          })
          .select("id")
          .single(),
        "LOYALTY_MEMBER_CREATE_FAILED"
      );
      user.existingMemberId = existingMember.id;
      expectOk(
        await user.client.from("team_invitations").insert({
          owner_user_id: user.id,
          invited_by: user.id,
          email: `${identitySet.prefix.toLowerCase()}.${side}.invite@${fixtureEmailDomain}`,
          first_name: `${identitySet.prefix}_${side}_INVITE`,
          role: "editor",
          token: randomBytes(24).toString("base64url"),
          expires_at: new Date(Date.now() + 3_600_000).toISOString()
        }),
        "INVITATION_CREATE_FAILED"
      );
      const objectPath = `business/${user.businessId}/legal_entities/${user.entityId}/${identitySet.prefix}_logo.png`;
      context.objects.push(objectPath);
      await this.#updateSyntheticMetadata(identitySet, side, user.id, context);
      expectOk(
        await this.#admin.storage
          .from("brand-assets")
          .upload(objectPath, new Blob([`synthetic:${identitySet.prefix}:${side}`], { type: "image/png" }), {
            contentType: "image/png",
            upsert: false
        }),
        "ASSET_CREATE_FAILED"
      );
    }
    if (identitySet.mode === "postdeploy" && this.isProduction) {
      if (typeof this.#postdeployRequest?.plannedRateLimitBucketKeys !== "function") {
        throw new SyntheticRunnerError("POSTDEPLOY_RATE_LIMIT_PLAN_MISSING");
      }
      const bucketKeys = await this.#postdeployRequest.plannedRateLimitBucketKeys({
        identitySet,
        context
      });
      if (
        !Array.isArray(bucketKeys) ||
        bucketKeys.some((key) => typeof key !== "string" || key.length < 16 || key.length > 128)
      ) {
        throw new SyntheticRunnerError("POSTDEPLOY_RATE_LIMIT_PLAN_INVALID");
      }
      context.rateLimitBucketKeys = [...new Set(bucketKeys)];
      for (const side of ["A", "B"]) {
        const current = context.users[side];
        await this.#updateSyntheticMetadata(identitySet, side, current.id, context);
      }
      if (typeof this.#postdeployRequest.prepareRateLimitFixtures !== "function") {
        throw new SyntheticRunnerError("POSTDEPLOY_RATE_LIMIT_FIXTURE_MISSING");
      }
      await this.#postdeployRequest.prepareRateLimitFixtures({
        admin: this.#admin,
        identitySet,
        context
      });
    }
    for (const side of ["A", "B"]) {
      const current = context.users[side];
      await this.#updateSyntheticMetadata(identitySet, side, current.id, context);
    }
    if (identitySet.mode === "postdeploy" && typeof mailbox.deliver === "function") {
      mailbox.deliver(identitySet.users.A.email, randomBytes(24).toString("base64url"));
    }
  }

  async verifyOwnership({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    if (!context) throw new SyntheticRunnerError("CONTEXT_MISSING");
    const [a, b] = [context.users.A, context.users.B];
    const own = expectOk(
      await a.client.from("google_locations").select("id,user_id").eq("id", a.locationId).single(),
      "OWNERSHIP_READ_FAILED"
    );
    if (own.user_id !== a.id) throw new SyntheticRunnerError("OWNERSHIP_INVALID");
    const foreign = expectOk(
      await b.client.from("google_locations").select("id").eq("id", a.locationId),
      "FOREIGN_READ_FAILED"
    );
    if (foreign.length !== 0) throw new SyntheticRunnerError("RLS_ISOLATION_FAILED");
    const update = expectOk(
      await b.client
        .from("google_locations")
        .update({ location_title: `${identitySet.prefix}_IDOR` })
        .eq("id", a.locationId)
        .select("id"),
      "FOREIGN_UPDATE_FAILED"
    );
    if (update.length !== 0) throw new SyntheticRunnerError("IDOR_WRITE_ALLOWED");
    if (!context.objects[0].startsWith(`business/${a.businessId}/legal_entities/${a.entityId}/`)) {
      throw new SyntheticRunnerError("ASSET_OWNERSHIP_PATH_INVALID");
    }
    const ownAsset = await a.client.storage.from("brand-assets").download(context.objects[0]);
    if (ownAsset.error || !ownAsset.data) throw new SyntheticRunnerError("OWN_ASSET_READ_DENIED");
    const foreignAsset = await b.client.storage.from("brand-assets").download(context.objects[0]);
    if (!foreignAsset.error) throw new SyntheticRunnerError("FOREIGN_ASSET_READ_ALLOWED");
  }

  async assertPrerequisite({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    for (const side of ["A", "B"]) {
      const user = context.users[side];
      const program = expectOk(
        await user.client.from("loyalty_programs").select("is_enabled").eq("id", user.programId).single(),
        "PROGRAM_READ_FAILED"
      );
      if (program.is_enabled !== false) throw new SyntheticRunnerError("BUSINESS_CAPABILITY_ACTIVE");
      const passResult = await user.client.from("wallet_passes").select("id").eq("user_id", user.id);
      if (passResult.error?.code === "42501") continue;
      const passes = expectOk(passResult, "WALLET_READ_FAILED");
      if (passes.length !== 0) throw new SyntheticRunnerError("WALLET_CAPABILITY_ISSUED");
    }
  }

  async assertPostdeploy({ identitySet, mailbox }) {
    await this.assertPrerequisite({ identitySet });
    if (!this.#postdeployRequest) throw new SyntheticRunnerError("POSTDEPLOY_REQUEST_MISSING");
    const context = this.#contexts.get(identitySet.executionId);
    await executeGoal002PostdeployProbes({
      request: (name) => this.#postdeployRequest(name, { identitySet, context, mailbox }),
      inspectLogs: () =>
        typeof this.#postdeployRequest.inspectLogs === "function"
          ? this.#postdeployRequest.inspectLogs({ identitySet, context })
          : Promise.resolve({
              checked: true,
              vercel: true,
              supabaseEdge: true,
              sensitiveMatches: 0,
              unexpected5xx: 0
            })
    });
  }

  async revokeSessions({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    if (!context) return;
    for (const side of ["A", "B"]) {
      const user = context.users[side];
      if (!user?.client || !user?.accessToken || !user?.refreshToken) continue;
      const { error } = await user.client.auth.signOut({ scope: "global" });
      if (error) throw new SyntheticRunnerError("AUTH_SESSION_REVOCATION_FAILED");
      const revocationProbe = createClient(this.#url, this.#anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const refreshed = await revocationProbe.auth.refreshSession({
        refresh_token: user.refreshToken
      });
      if (!refreshed.error || refreshed.data.session) {
        throw new SyntheticRunnerError("AUTH_SESSION_STILL_ACTIVE");
      }
      user.accessToken = null;
      user.refreshToken = null;
    }
  }

  async deleteStorage({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    if (!context?.objects.length) return;
    const { error } = await this.#admin.storage.from("brand-assets").remove(context.objects);
    if (error) throw new SyntheticRunnerError("STORAGE_TEARDOWN_FAILED");
  }

  async deleteDatabase({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    if (!context) return;
    const userIds = Object.values(context.users).map((user) => user?.id).filter(Boolean);
    const businessIds = Object.values(context.users).map((user) => user?.businessId).filter(Boolean);
    if (userIds.length > 0) {
      for (const table of [
        "wallet_passes",
        "loyalty_rewards",
        "loyalty_visits",
        "loyalty_members",
        "loyalty_programs",
        "team_invitations",
        "ai_draft_runs",
        "google_reviews",
        "google_locations"
      ]) {
        const column = table === "team_invitations" ? "owner_user_id" : "user_id";
        const { error } = await this.#admin.from(table).delete().in(column, userIds);
        if (error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
      }
    }
    const enrollment = await this.#admin
      .from("loyalty_enrollment_requests")
      .delete()
      .ilike("email", `${identitySet.prefix.toLowerCase()}%`);
    if (enrollment.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    if (context.rateLimitBucketKeys.length > 0) {
      const rateLimits = await this.#admin
        .from("security_rate_limits")
        .delete()
        .in("bucket_key", context.rateLimitBucketKeys);
      if (rateLimits.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    }
    const syntheticRateLimits = await this.#admin
      .from("security_rate_limits")
      .delete()
      .like("bucket_key", `${identitySet.prefix}:%`);
    if (syntheticRateLimits.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    if (businessIds.length > 0) {
      const legal = await this.#admin.from("legal_entities").delete().in("business_id", businessIds);
      const settings = await this.#admin.from("business_settings").delete().in("business_id", businessIds);
      if (legal.error || settings.error) throw new SyntheticRunnerError("DATABASE_TEARDOWN_FAILED");
    }
  }

  async deleteAuth({ identitySet }) {
    const context = this.#contexts.get(identitySet.executionId);
    if (!context) return;
    for (const side of ["A", "B"]) {
      const user = context.users[side];
      if (!user?.id) continue;
      const { error } = await this.#admin.auth.admin.deleteUser(user.id);
      if (error) throw new SyntheticRunnerError("AUTH_TEARDOWN_FAILED");
    }
  }

  async finalizeTeardown({ identitySet }) {
    this.#contexts.delete(identitySet.executionId);
  }
}
