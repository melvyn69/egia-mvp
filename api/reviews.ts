import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from "../server/_shared_dist/_date.js";
import { parseFilters } from "../server/_shared_dist/_filters.js";
import { buildPromptContext } from "../server/_shared_dist/ai_reply.js";
import { requireUser } from "../server/_shared_dist/_auth.js";
import { createClient } from "@supabase/supabase-js";
import { getBearerToken } from "../server/_shared_dist/google/_utils.js";

type Cursor = { source_time: string; id: string };

type GoogleLocationRow = { id: string; location_resource_name: string };

type GoogleReviewRow = {
  id: string;
  review_id: string | null;
  location_id: string | null;
  author_name: string | null;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  created_at: string | null;
  status: string | null;
  owner_reply?: string | null;
  draft_status?: string | null;
  draft_preview?: string | null;
  draft_updated_at?: string | null;
  has_draft?: boolean;
  has_job_inflight?: boolean;
  is_eligible_to_generate?: boolean;
};

type ReviewInsightRow = { review_pk: string; sentiment: string | null };

type ReviewTagLinkRow = { review_pk: string; tag_id: string };

type AiTagRow = { id: string; tag: string };

type PrepareDraftResultItem = {
  review_id: string;
  queued: boolean;
  skipped: boolean;
  skipped_reason?:
    | "has_owner_reply"
    | "no_comment"
    | "already_has_draft"
    | "job_in_progress"
    | "job_in_flight"
    | "already_queued"
    | "limit_reached"
    | "outside_lookback"
    | "missing_review_id"
    | "enqueue_error";
};

type ReviewToReplyRpcRow = {
  review_pk: string;
  user_id: string;
  location_id: string;
  review_id: string | null;
  location_name: string | null;
  comment: string | null;
  rating: number | null;
  create_time: string | null;
  update_time: string | null;
};

type ReviewEligibilityProbe = {
  id: string;
  comment: string | null;
  owner_reply: string | null;
  create_time: string | null;
  update_time: string | null;
  inserted_at: string | null;
};

type InboxReviewRpcRow = {
  review_id: string;
  review_name: string | null;
  google_review_id: string | null;
  location_id: string | null;
  author_name: string | null;
  status: string | null;
  create_time: string | null;
  update_time: string | null;
  inserted_at: string | null;
  rating: number | null;
  comment: string | null;
  owner_reply: string | null;
  draft_status: string | null;
  draft_preview: string | null;
  draft_updated_at: string | null;
  has_draft: boolean | null;
  has_job_inflight: boolean | null;
  is_eligible_to_generate: boolean | null;
};

type CronStatus = {
  status: "idle" | "running" | "done" | "error";
  [key: string]: unknown;
};

const toStatus = (value: unknown): CronStatus => {
  if (value && typeof value === "object" && "status" in value) {
    return value as CronStatus;
  }
  return { status: "idle" };
};

const parseBody = (req: VercelRequest) =>
  typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

const parseCursor = (cursorParam: string | undefined): Cursor | null => {
  if (!cursorParam) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursorParam, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as Cursor;
    if (parsed?.source_time && parsed?.id) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error("[reviews] invalid cursor", err);
    return null;
  }
};

const buildCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64");

const fetchActiveLocationIds = async (
  supabaseAdmin: ReturnType<typeof requireUser> extends Promise<infer R>
    ? R extends { supabaseAdmin: infer C }
      ? C
      : never
    : never,
  userId: string
) => {
  const { data } = await supabaseAdmin
    .from("business_settings")
    .select("active_location_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const activeIds = Array.isArray(data?.active_location_ids)
    ? data?.active_location_ids.filter(Boolean)
    : null;
  return activeIds && activeIds.length > 0 ? new Set(activeIds) : null;
};

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

const isMissingEnvError = (err: unknown) =>
  err instanceof Error && err.message === "Missing SUPABASE env vars";

const createUserSupabase = (token: string | null) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !token) {
    return null;
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
};

const DRAFT_ACTIVE_STATUSES = ["draft", "queued", "processing", "generating"];
const AI_JOB_IN_FLIGHT_STATUSES = [
  "queued",
  "pending",
  "processing",
  "generating"
];

const isNonEmptyText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

const parseBooleanQuery = (value: unknown, defaultValue = false) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
};

const handler = async (req: VercelRequest, res: VercelResponse) => {
  const route = "/api/reviews";
  const requestId = getRequestId(req);
  let userId: string | null = null;
  let locationId: string | null = null;
  const actionParam = req.query.action;
  let action = Array.isArray(actionParam) ? actionParam[0] : actionParam;

  try {
    let auth;
    try {
      auth = await requireUser(req, res);
    } catch (err) {
      const missingEnv = isMissingEnvError(err);
      console.error("[reviews] auth error", {
        route,
        query: req.query,
        reason: missingEnv ? "missing_env" : undefined,
        error: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : null
        },
        requestId
      });
      return res.status(500).json({
        error: "Internal server error",
        requestId,
        reason: missingEnv ? "missing_env" : undefined
      });
    }
    if (!auth) {
      return;
    }
    userId = auth.userId;
    const { supabaseAdmin } = auth;
    const bearerToken = getBearerToken(req.headers);
    const supabaseUser = createUserSupabase(bearerToken) ?? supabaseAdmin;
    const identityHashCache = new Map<string, string>();
    const resolveIdentityHash = async (
      params: { locationId: string | null; reviewText?: string | null }
    ) => {
      const locationKey = params.locationId?.trim() || "__none__";
      const cached = identityHashCache.get(locationKey);
      if (cached) {
        return cached;
      }
      const context = await buildPromptContext({
        reviewText: params.reviewText?.trim() || "Avis sans commentaire.",
        rating: null,
        userId,
        locationId: params.locationId,
        supabaseAdmin,
        strictIdentity: false
      });
      const hash = context.meta.ai_identity_hash || "none";
      identityHashCache.set(locationKey, hash);
      return hash;
    };

    if (!action && req.method === "POST") {
      const payload = parseBody(req);
      if (typeof payload?.action === "string") {
        action = payload.action;
      }
    }

    if (action === "alerts_resolve") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      const payload = parseBody(req);
      const alertId = String(payload?.alert_id ?? "").trim();
      if (!alertId) {
        return res.status(400).json({ error: "Missing alert_id" });
      }
      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, string> = { resolved_at: nowIso };
      const { data: columns } = await supabaseAdmin
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", "alerts");
      const columnSet = new Set(
        (columns ?? []).map((col: { column_name: string }) => col.column_name)
      );
      if (columnSet.has("handled_at")) {
        updatePayload.handled_at = nowIso;
      }
      if (columnSet.has("handled_by")) {
        updatePayload.handled_by = userId;
      }
      const { data, error } = await supabaseAdmin
        .from("alerts")
        .update(updatePayload)
        .eq("id", alertId)
        .eq("user_id", userId)
        .is("resolved_at", null)
        .select(
          "id, rule_code, severity, review_id, payload, triggered_at, resolved_at, alert_type, rule_label"
        )
        .maybeSingle();
      if (error) {
        return res.status(500).json({ error: "Failed to resolve alert" });
      }
      if (!data) {
        return res.status(404).json({ error: "Alert not found" });
      }
      return res.status(200).json({ ok: true, alert: data });
    }

    if (action === "ensure_draft") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      const payload = parseBody(req);
      const reviewId = String(payload?.review_id ?? "").trim();
      const locationId = payload?.location_id
        ? String(payload.location_id).trim()
        : null;
      const lookbackDays = Math.min(
        3650,
        Math.max(0, Number.parseInt(String(payload?.lookback_days ?? 180), 10) || 180)
      );
      if (!reviewId) {
        return res.status(400).json({ error: "Missing review_id" });
      }
      const identityHash = await resolveIdentityHash({
        locationId,
        reviewText: typeof payload?.review_text === "string" ? payload.review_text : null
      });

      const { data: existingDraft } = await supabaseAdmin
        .from("review_ai_replies")
        .select("status, draft_text")
        .eq("review_id", reviewId)
        .eq("user_id", userId)
        .eq("mode", "draft")
        .maybeSingle();
      const existingText = existingDraft?.draft_text
        ? String(existingDraft.draft_text).trim()
        : "";
      if (
        existingText ||
        DRAFT_ACTIVE_STATUSES.includes(String(existingDraft?.status ?? ""))
      ) {
        return res.status(200).json({ ok: true, status: "exists" });
      }

      const jobsTable = supabaseAdmin as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            filter: (column: string, operator: string, value: string) => {
              in: (column: string, values: string[]) => {
                limit: (count: number) => Promise<{
                  data?:
                    | Array<{
                        id?: string | null;
                        payload?: Record<string, unknown> | null;
                      }>
                    | null;
                  error?: { message?: string | null } | null;
                }>;
              };
            };
          };
          insert: (values: Record<string, unknown>) => Promise<{
            error?: { message?: string | null; code?: string | null } | null;
          }>;
        };
      };

      const { data: existingJob } = await jobsTable
        .from("ai_jobs")
        .select("id, payload")
        .filter("payload->>review_id", "eq", reviewId)
        .in("status", AI_JOB_IN_FLIGHT_STATUSES)
        .limit(20);
      const hasInFlightJob = Array.isArray(existingJob) && existingJob.length > 0;
      if (hasInFlightJob) {
        return res
          .status(200)
          .json({ ok: true, status: "already_running" });
      }

      const rpcClient = supabaseAdmin as unknown as {
        rpc: (
          fn: string,
          params: Record<string, unknown>
        ) => Promise<{ data: ReviewToReplyRpcRow[] | null; error: { message?: string | null } | null }>;
      };
      const { data: reviewRows, error: reviewRowsError } = await rpcClient.rpc(
        "get_reviews_to_reply",
        {
          p_user_id: userId,
          p_location_id: locationId,
          p_limit: 1,
          p_lookback_days: lookbackDays,
          p_review_id: reviewId
        }
      );
      if (reviewRowsError) {
        return res.status(500).json({ error: "Failed to load review eligibility" });
      }
      if (!reviewRows || reviewRows.length === 0) {
        const { data: probe } = await supabaseAdmin
          .from("google_reviews")
          .select("id, comment, owner_reply, create_time, update_time, inserted_at")
          .eq("user_id", userId)
          .eq("id", reviewId)
          .maybeSingle();
        if (!probe) {
          return res.status(404).json({ error: "Review not found" });
        }
        const probeRow = probe as ReviewEligibilityProbe;
        let skippedReason: PrepareDraftResultItem["skipped_reason"] = "already_has_draft";
        if (isNonEmptyText(probeRow.owner_reply)) {
          skippedReason = "has_owner_reply";
        } else if (!isNonEmptyText(probeRow.comment)) {
          skippedReason = "no_comment";
        } else {
          const sourceTs = probeRow.create_time ?? probeRow.update_time ?? probeRow.inserted_at;
          if (sourceTs && lookbackDays > 0) {
            const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
            if (new Date(sourceTs).getTime() < cutoff) {
              skippedReason = "outside_lookback";
            }
          }
        }
        return res.status(200).json({
          ok: true,
          status: "skipped",
          skipped_reason: skippedReason
        });
      }

      let { error: draftUpsertError } = await supabaseAdmin
        .from("review_ai_replies")
        .upsert(
          {
            review_id: reviewId,
            user_id: userId,
            location_id: locationId,
            mode: "draft",
            identity_hash: identityHash,
            status: "queued",
            updated_at: new Date().toISOString()
          },
          { onConflict: "review_id,mode" }
        );
      if (
        draftUpsertError &&
        ["42P10", "23505"].includes(
          (draftUpsertError as { code?: string | null }).code ?? ""
        )
      ) {
        const fallback = await supabaseAdmin
          .from("review_ai_replies")
          .upsert(
            {
              review_id: reviewId,
              user_id: userId,
              location_id: locationId,
              mode: "draft",
              identity_hash: identityHash,
              status: "queued",
              updated_at: new Date().toISOString()
            },
            { onConflict: "review_id" }
          );
        draftUpsertError = fallback.error;
      }
      if (draftUpsertError) {
        return res.status(500).json({ error: "Failed to upsert draft row" });
      }

      const { error: enqueueError } = await jobsTable.from("ai_jobs").insert({
        type: "review_analyze",
        payload: {
          review_id: reviewId,
          location_id: locationId,
          user_id: userId,
          identity_hash: identityHash
        },
        status: "pending"
      });
      if (enqueueError) {
        if (enqueueError.code === "23505") {
          return res
            .status(200)
            .json({ ok: true, status: "already_running" });
        }
        await supabaseAdmin
          .from("review_ai_replies")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("review_id", reviewId)
          .eq("user_id", userId)
          .eq("mode", "draft");
        return res.status(500).json({ error: "Failed to enqueue draft" });
      }
      return res.status(200).json({ ok: true, status: "enqueued" });
    }

    if (action === "prepare_drafts") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      const payload = parseBody(req);
      const locationId = String(payload?.location_id ?? "").trim();
      const singleReviewId =
        typeof payload?.review_id === "string" ? payload.review_id.trim() : "";
      const singleReviewMode = singleReviewId.length > 0;
      if (!locationId) {
        return res.status(400).json({ error: "Missing location_id" });
      }
      const limitRaw = payload?.limit ?? 10;
      const cooldownRaw = payload?.cooldownMinutes ?? 15;
      const limit = singleReviewMode
        ? 1
        : Math.min(25, Math.max(1, Number.parseInt(String(limitRaw), 10) || 10));
      const cooldownMinutes = Math.min(
        120,
        Math.max(1, Number.parseInt(String(cooldownRaw), 10) || 15)
      );

      const activeIds = await fetchActiveLocationIds(supabaseAdmin, userId);
      if (activeIds && !activeIds.has(locationId)) {
        const { data: locationRow } = await supabaseAdmin
          .from("google_locations")
          .select("id, location_resource_name")
          .eq("user_id", userId)
          .or(`id.eq.${locationId},location_resource_name.eq.${locationId}`)
          .maybeSingle();
        if (!locationRow) {
          console.warn("[reviews] prepare_drafts location access not confirmed", {
            userId,
            locationId
          });
        }
      }

      const cooldownMs = cooldownMinutes * 60 * 1000;
      if (!singleReviewMode) {
        const { data: lastRun } = await supabaseAdmin
          .from("ai_draft_runs")
          .select("last_run_at")
          .eq("user_id", userId)
          .eq("location_id", locationId)
          .order("last_run_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const now = Date.now();
        const lastRunAt = lastRun?.last_run_at
          ? new Date(lastRun.last_run_at).getTime()
          : 0;
        if (lastRunAt && now - lastRunAt < cooldownMs) {
          await supabaseAdmin.from("ai_draft_runs").upsert(
            {
              user_id: userId,
              location_id: locationId,
              last_run_at: new Date().toISOString(),
              requested_limit: limit,
              generated_count: 0
            },
            { onConflict: "user_id,location_id" }
          );
          return res.status(200).json({
            ok: true,
            queued: 0,
            skipped: 0,
            cooldown: true,
            limit,
            results: [] as PrepareDraftResultItem[]
          });
        }
      }

      const lookbackDays = Math.min(
        3650,
        Math.max(0, Number.parseInt(String(payload?.lookback_days ?? 180), 10) || 180)
      );
      const locationIdentityHash = await resolveIdentityHash({ locationId });
      const rpcClient = supabaseAdmin as unknown as {
        rpc: (
          fn: string,
          params: Record<string, unknown>
        ) => Promise<{ data: ReviewToReplyRpcRow[] | null; error: { message?: string | null } | null }>;
      };
      const { data: candidateRows, error: candidateError } = await rpcClient.rpc(
        "get_reviews_to_reply",
        {
          p_user_id: userId,
          p_location_id: locationId,
          p_limit: limit,
          p_lookback_days: lookbackDays,
          p_review_id: singleReviewMode ? singleReviewId : null
        }
      );
      if (candidateError) {
        return res.status(500).json({ error: "Failed to load reviews to reply" });
      }
      if (!candidateRows || candidateRows.length === 0) {
        let singleResult: PrepareDraftResultItem[] = [];
        if (singleReviewMode) {
          const { data: probe } = await supabaseAdmin
            .from("google_reviews")
            .select("id, comment, owner_reply, create_time, update_time, inserted_at")
            .eq("user_id", userId)
            .eq("location_id", locationId)
            .eq("id", singleReviewId)
            .maybeSingle();
          if (!probe) {
            return res.status(404).json({ error: "Review not found" });
          }
          const probeRow = probe as ReviewEligibilityProbe;
          let skippedReason: PrepareDraftResultItem["skipped_reason"] = "already_has_draft";
          if (isNonEmptyText(probeRow.owner_reply)) {
            skippedReason = "has_owner_reply";
          } else if (!isNonEmptyText(probeRow.comment)) {
            skippedReason = "no_comment";
          } else {
            const sourceTs = probeRow.create_time ?? probeRow.update_time ?? probeRow.inserted_at;
            if (sourceTs && lookbackDays > 0) {
              const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
              if (new Date(sourceTs).getTime() < cutoff) {
                skippedReason = "outside_lookback";
              }
            }
            if (skippedReason === "already_has_draft") {
              const { data: activeDraft } = await supabaseAdmin
                .from("review_ai_replies")
                .select("status")
                .eq("review_id", singleReviewId)
                .eq("user_id", userId)
                .eq("mode", "draft")
                .maybeSingle();
              if (!activeDraft) {
                const { data: activeJobs } = await (
                  supabaseAdmin as unknown as {
                    from: (table: string) => {
                      select: (columns: string) => {
                        filter: (column: string, operator: string, value: string) => {
                          in: (column: string, values: string[]) => {
                            limit: (count: number) => Promise<{
                              data?:
                                | Array<{ id?: string | null; payload?: Record<string, unknown> | null }>
                                | null;
                              error?: { message?: string | null } | null;
                            }>;
                          };
                        };
                      };
                    };
                  }
                )
                  .from("ai_jobs")
                  .select("id,payload")
                  .filter("payload->>review_id", "eq", singleReviewId)
                  .filter("payload->>location_id", "eq", locationId)
                  .in("status", AI_JOB_IN_FLIGHT_STATUSES)
                  .limit(1);
                if (Array.isArray(activeJobs) && activeJobs.length > 0) {
                  skippedReason = "job_in_progress";
                }
              }
            }
          }
          singleResult = [
            {
              review_id: singleReviewId,
              queued: false,
              skipped: true,
              skipped_reason: skippedReason
            }
          ];
        }
        await supabaseAdmin.from("ai_draft_runs").upsert(
          {
            user_id: userId,
            location_id: locationId,
            last_run_at: new Date().toISOString(),
            requested_limit: limit,
            generated_count: 0
          },
          { onConflict: "user_id,location_id" }
        );
        return res.status(200).json({
          ok: true,
          queued: 0,
          skipped: singleResult.length,
          limit,
          results: singleResult
        });
      }

      let queued = 0;
      let skipped = 0;
      const results: PrepareDraftResultItem[] = [];
      const jobsTable = supabaseAdmin as unknown as {
        from: (table: string) => {
          insert: (values: Record<string, unknown>) => Promise<{
            error?: { message?: string | null; code?: string | null } | null;
          }>;
        };
      };

      for (const row of candidateRows) {
        const reviewId = row.review_pk ? String(row.review_pk) : "";
        if (!reviewId) {
          skipped += 1;
          results.push({
            review_id: "",
            queued: false,
            skipped: true,
            skipped_reason: "missing_review_id"
          });
          continue;
        }
        if (queued >= limit) {
          skipped += 1;
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "limit_reached"
          });
          continue;
        }
        const reviewComment =
          typeof row.comment === "string" ? row.comment.trim() : "";
        if (!reviewComment) {
          skipped += 1;
          console.info("[prepare_drafts] enqueue_decision", {
            userId,
            locationId,
            reviewId,
            identityHash: locationIdentityHash,
            decision: "skipped",
            reason: "no_comment"
          });
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "no_comment"
          });
          continue;
        }

        const draftPayload = {
          review_id: reviewId,
          user_id: userId,
          location_id: locationId,
          mode: "draft",
          identity_hash: locationIdentityHash,
          status: "queued",
          updated_at: new Date().toISOString()
        };
        let { error: draftUpsertError } = await supabaseAdmin
          .from("review_ai_replies")
          .upsert(draftPayload, { onConflict: "review_id,mode" });
        if (
          draftUpsertError &&
          ["42P10", "23505"].includes(
            (draftUpsertError as { code?: string | null }).code ?? ""
          )
        ) {
          const fallback = await supabaseAdmin
            .from("review_ai_replies")
            .upsert(draftPayload, { onConflict: "review_id" });
          draftUpsertError = fallback.error;
        }
        if (draftUpsertError) {
          skipped += 1;
          console.info("[prepare_drafts] enqueue_decision", {
            userId,
            locationId,
            reviewId,
            identityHash: locationIdentityHash,
            decision: "skipped",
            reason: "enqueue_error"
          });
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "enqueue_error"
          });
          continue;
        }

        const { error: enqueueError } = await jobsTable.from("ai_jobs").insert({
          type: "review_analyze",
          payload: {
            review_id: reviewId,
            location_id: locationId,
            user_id: userId,
            identity_hash: locationIdentityHash
          },
          status: "pending"
        });
        if (enqueueError) {
          if (enqueueError.code === "23505") {
            skipped += 1;
            console.info("[prepare_drafts] enqueue_decision", {
              userId,
              locationId,
              reviewId,
              identityHash: locationIdentityHash,
              decision: "skipped",
              reason: "job_in_progress"
            });
            results.push({
              review_id: reviewId,
              queued: false,
              skipped: true,
              skipped_reason: "job_in_progress"
            });
            continue;
          }
          skipped += 1;
          await supabaseAdmin
            .from("review_ai_replies")
            .update({ status: "error", updated_at: new Date().toISOString() })
            .eq("review_id", reviewId)
            .eq("user_id", userId)
            .eq("mode", "draft");
          console.info("[prepare_drafts] enqueue_decision", {
            userId,
            locationId,
            reviewId,
            identityHash: locationIdentityHash,
            decision: "skipped",
            reason: "enqueue_error"
          });
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "enqueue_error"
          });
          console.error("[reviews] prepare_drafts enqueue failed", {
            userId,
            locationId,
            reviewId,
            message: enqueueError.message ?? "unknown"
          });
          continue;
        }
        queued += 1;
        console.info("[prepare_drafts] enqueue_decision", {
          userId,
          locationId,
          reviewId,
          identityHash: locationIdentityHash,
          decision: "enqueued",
          reason: "ok"
        });
        results.push({
          review_id: reviewId,
          queued: true,
          skipped: false
        });
      }
      const noCommentSkipped = results.reduce(
        (count, item) => (item.skipped_reason === "no_comment" ? count + 1 : count),
        0
      );
      if (noCommentSkipped > 0) {
        console.info("[reviews] prepare_drafts no_comment skipped", {
          userId,
          locationId,
          count: noCommentSkipped
        });
      }

      await supabaseAdmin.from("ai_draft_runs").upsert(
        {
          user_id: userId,
          location_id: locationId,
          last_run_at: new Date().toISOString(),
          requested_limit: limit,
          generated_count: queued
        },
        { onConflict: "user_id,location_id" }
      );

      return res.status(200).json({
        ok: true,
        queued,
        skipped,
        cooldown: false,
        limit,
        results
      });
    }

    if (action === "draft_status") {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      const reviewIdParam = req.query.review_id;
      const reviewId = String(
        Array.isArray(reviewIdParam) ? (reviewIdParam[0] ?? "") : (reviewIdParam ?? "")
      ).trim();
      if (!reviewId) {
        return res.status(400).json({ error: "Missing review_id" });
      }
      const { data: draftRows, error: draftError } = await supabaseAdmin
        .from("review_ai_replies")
        .select("draft_text, status, created_at")
        .eq("user_id", userId)
        .eq("review_id", reviewId)
        .eq("mode", "draft")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (draftError) {
        return res.status(500).json({ error: "Failed to load draft status" });
      }
      const row = (draftRows ?? [])[0] ?? null;
      const draftText = row?.draft_text ? String(row.draft_text).trim() : "";
      return res.status(200).json({
        ok: true,
        review_id: reviewId,
        ready: draftText.length > 0,
        draft_text: draftText.length > 0 ? draftText : null,
        status: typeof row?.status === "string" ? row.status : null
      });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (action === "alerts_list") {
      const limitParam = req.query.limit;
      const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);
      const { data, error } = await supabaseAdmin
        .from("alerts")
        .select(
          "id, rule_code, severity, review_id, payload, triggered_at, resolved_at"
        )
        .eq("user_id", userId)
        .is("resolved_at", null)
        .order("triggered_at", { ascending: false })
        .limit(limit);
      if (error) {
        return res.status(500).json({ error: "Failed to load alerts" });
      }
      return res.status(200).json({ alerts: data ?? [] });
    }

    if (action === "status" || action === "health") {
      try {
        let statusLocationId = req.query.location_id;
        if (Array.isArray(statusLocationId)) {
          statusLocationId = statusLocationId[0];
        }
        if (!statusLocationId) {
          return res.status(400).json({ error: "Missing location_id" });
        }

        const { data: locationRow } = await supabaseAdmin
          .from("google_locations")
          .select("location_resource_name")
          .eq("user_id", userId)
          .eq("location_resource_name", statusLocationId)
          .maybeSingle();
        if (!locationRow) {
          return res.status(404).json({ error: "Location not found" });
        }

        const importKey = `import_status_v1:${userId}:${statusLocationId}`;
        const aiKey = `ai_status_v1:${userId}:${statusLocationId}`;

        const { data: importState } = await supabaseAdmin
          .from("cron_state")
          .select("value")
          .eq("key", importKey)
          .eq("user_id", userId)
          .maybeSingle();
        const { data: aiState } = await supabaseAdmin
          .from("cron_state")
          .select("value")
          .eq("key", aiKey)
          .eq("user_id", userId)
          .maybeSingle();

        const importStatus = toStatus(importState?.value ?? null);
        const aiStatus = toStatus(aiState?.value ?? null);

        return res.status(200).json({
          location_id: statusLocationId,
          import: importStatus,
          ai: aiStatus
        });
      } catch {
        return res.status(500).json({ error: "Failed to load status" });
      }
    }

    const filters = parseFilters(req.query);
    locationId = filters.location_id ?? null;
    if (filters.reject) {
      return res.status(200).json({ rows: [], nextCursor: null });
    }
    console.log("[reviews]", {
      route,
      query: req.query,
      userId,
      location_id: locationId ?? "all"
    });

    let locationIds: string[] = [];
    const activeLocationIds = await fetchActiveLocationIds(
      supabaseAdmin,
      userId
    );
    if (locationId) {
      const { data: locationRow } = (await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId)
        .eq("location_resource_name", locationId)
        .maybeSingle()) as { data: GoogleLocationRow | null; error: unknown };
      if (!locationRow) {
        return res.status(404).json({ error: "Location not found" });
      }
      if (activeLocationIds && !activeLocationIds.has(locationRow.id)) {
        return res.status(404).json({ error: "Location not found" });
      }
      locationIds = [locationId];
    } else {
      const { data: locations } = (await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId)) as { data: GoogleLocationRow[] | null; error: unknown };
      const filtered = activeLocationIds
        ? (locations ?? []).filter((location) =>
            activeLocationIds.has(location.id)
          )
        : locations ?? [];
      locationIds = filtered
        .map((location) => location.location_resource_name)
        .filter(Boolean);
    }

    if (!locationIds || locationIds.length === 0) {
      return res.status(200).json({
        rows: [],
        nextCursor: null,
        reason: "no_locations_or_no_reviews"
      });
    }

    const preset = filters.preset;
    const from = filters.from;
    const to = filters.to;
    const timeZone = filters.tz;
    const range = resolveDateRange(
      preset as Parameters<typeof resolveDateRange>[0],
      from,
      to,
      timeZone
    );
    const rangeFrom =
      typeof range.from === "string" ? range.from : range.from.toISOString();
    const rangeTo =
      typeof range.to === "string" ? range.to : range.to.toISOString();
    const rangeFromMs = new Date(rangeFrom).getTime();
    const rangeToMs = new Date(rangeTo).getTime();

    const ratingMin = filters.rating_min ?? null;
    const ratingMax = filters.rating_max ?? null;
    const sentiment = filters.sentiment;
    const status = filters.status;
    const tags = filters.tags;

    const limitParam = req.query.limit;
    const limit = Math.min(
      Math.max(Number(limitParam) || 50, 1),
      200
    );
    const includeNoComment = parseBooleanQuery(
      req.query.include_no_comment,
      false
    );
    const lookbackDays = Math.min(
      3650,
      Math.max(
        0,
        Number.parseInt(String(req.query.lookback_days ?? 180), 10) || 180
      )
    );
    const candidateLimit = Math.min(Math.max(limit * 6, limit), 500);
    const cursorParam = req.query.cursor;
    const cursor = parseCursor(
      Array.isArray(cursorParam) ? cursorParam[0] : cursorParam
    );

    const inboxRpcClient = supabaseUser as unknown as {
      rpc: (
        fn: string,
        params: Record<string, unknown>
      ) => Promise<{ data: InboxReviewRpcRow[] | null; error: { message?: string | null } | null }>;
    };
    const { data: inboxRowsRaw, error: inboxRowsError } = await inboxRpcClient.rpc(
      "get_inbox_reviews",
      {
        p_location_id: locationIds.length === 1 ? locationIds[0] : null,
        p_limit: candidateLimit,
        p_only_with_comment: !includeNoComment,
        p_lookback_days: lookbackDays,
        p_user_id: userId
      }
    );
    if (inboxRowsError) {
      throw new Error(inboxRowsError.message ?? "Failed to load inbox reviews");
    }
    const allowedLocationSet = new Set(locationIds);
    const baseRows = (inboxRowsRaw ?? [])
      .filter((row) => row.location_id && allowedLocationSet.has(row.location_id))
      .map(
        (row) =>
          ({
            id: row.review_id,
            review_id: row.google_review_id ?? row.review_name ?? null,
            location_id: row.location_id,
            author_name: row.author_name,
            rating: row.rating,
            comment: row.comment,
            create_time: row.create_time,
            update_time: row.update_time,
            created_at: row.inserted_at ?? row.create_time ?? row.update_time,
            status: row.status,
            owner_reply: row.owner_reply,
            draft_status: row.draft_status,
            draft_preview: row.draft_preview,
            draft_updated_at: row.draft_updated_at,
            has_draft: Boolean(row.has_draft),
            has_job_inflight: Boolean(row.has_job_inflight),
            is_eligible_to_generate: Boolean(row.is_eligible_to_generate)
          }) satisfies GoogleReviewRow
      );

    const countQuery = supabaseUser
      .from("google_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (locationIds.length === 1) {
      countQuery.eq("location_id", locationIds[0]);
    } else {
      countQuery.in("location_id", locationIds);
    }
    countQuery.or("owner_reply.is.null,owner_reply.eq.");
    if (!includeNoComment) {
      countQuery.not("comment", "is", null).neq("comment", "");
    }
    countQuery.or(
      `and(update_time.gte.${rangeFrom},update_time.lte.${rangeTo}),` +
        `and(update_time.is.null,create_time.gte.${rangeFrom},create_time.lte.${rangeTo}),` +
        `and(update_time.is.null,create_time.is.null,inserted_at.gte.${rangeFrom},inserted_at.lte.${rangeTo})`
    );
    if (ratingMin !== null && Number.isFinite(ratingMin)) {
      countQuery.gte("rating", ratingMin);
    }
    if (ratingMax !== null && Number.isFinite(ratingMax)) {
      countQuery.lte("rating", ratingMax);
    }
    if (status) {
      countQuery.eq("status", status);
    }
    const { count: total } = await countQuery;
    if (process.env.NODE_ENV !== "production") {
      console.info("[reviews] filter", {
        requestId,
        userId,
        preset,
        tz: timeZone,
        rangeFrom,
        rangeTo,
        lookbackDays,
        includeNoComment,
        total: total ?? 0
      });
      console.info("[reviews] rows", {
        requestId,
        count: baseRows?.length ?? 0
      });
    }

    const rows = (baseRows ?? []).filter((row) => {
      const sourceTime =
        row.update_time ?? row.create_time ?? row.created_at ?? null;
      if (!sourceTime) {
        return false;
      }
      const sourceTimeMs = new Date(sourceTime).getTime();
      if (Number.isFinite(rangeFromMs) && sourceTimeMs < rangeFromMs) {
        return false;
      }
      if (Number.isFinite(rangeToMs) && sourceTimeMs > rangeToMs) {
        return false;
      }
      if (
        ratingMin !== null &&
        Number.isFinite(ratingMin) &&
        (row.rating === null || row.rating < ratingMin)
      ) {
        return false;
      }
      if (
        ratingMax !== null &&
        Number.isFinite(ratingMax) &&
        (row.rating === null || row.rating > ratingMax)
      ) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      if (!cursor) {
        return true;
      }
      if (sourceTime < cursor.source_time) {
        return true;
      }
      if (sourceTime === cursor.source_time && row.id < cursor.id) {
        return true;
      }
      return false;
    });

    const reviewIds = rows.map((row) => row.id);
    const { data: insights } = (await supabaseAdmin
      .from("review_ai_insights")
      .select("review_pk, sentiment")
      .in("review_pk", reviewIds)) as { data: ReviewInsightRow[] | null; error: unknown };
    const sentimentMap = new Map(
      (insights ?? []).map((item) => [item.review_pk, item.sentiment])
    );

    const { data: tagLinks } = (await supabaseAdmin
      .from("review_ai_tags")
      .select("review_pk, tag_id")
      .in("review_pk", reviewIds)) as { data: ReviewTagLinkRow[] | null; error: unknown };
    const tagIds = Array.from(
      new Set((tagLinks ?? []).map((item) => item.tag_id))
    );
    const { data: tagsData } = (await supabaseAdmin
      .from("ai_tags")
      .select("id, tag")
      .in("id", tagIds)) as { data: AiTagRow[] | null; error: unknown };
    const tagLookup = new Map((tagsData ?? []).map((item) => [item.id, item.tag]));
    const tagsByReview = new Map<string, string[]>();
    for (const link of tagLinks ?? []) {
      const tag = tagLookup.get(link.tag_id);
      if (!tag) {
        continue;
      }
      const list = tagsByReview.get(link.review_pk) ?? [];
      list.push(tag);
      tagsByReview.set(link.review_pk, list);
    }

    const filtered = rows.filter((row) => {
      const rowSentiment = sentimentMap.get(row.id) ?? null;
      if (sentiment && rowSentiment !== sentiment) {
        return false;
      }
      if (tags && tags.length > 0) {
        const rowTags = (tagsByReview.get(row.id) ?? []).map((tag) =>
          tag.toLowerCase()
        );
        const matches = tags.some((tag) => rowTags.includes(tag));
        if (!matches) {
          return false;
        }
      }
      return true;
    });

    const limited = filtered.slice(0, limit);
    const last = limited[limited.length - 1];
    const nextCursor =
      last && limited.length === limit
        ? buildCursor({
            source_time:
              last.update_time ?? last.create_time ?? last.created_at ?? "",
            id: last.id
          })
        : null;

    return res.status(200).json({
      ok: true,
      items: limited.map((row) => ({
        ...row,
        sentiment: sentimentMap.get(row.id) ?? null,
        tags: tagsByReview.get(row.id) ?? []
      })),
      nextCursor,
      total: Number(total ?? 0)
    });
  } catch (err) {
    const missingEnv = isMissingEnvError(err);
    console.error("[reviews] error", {
      route,
      query: req.query,
      userId,
      location_id: locationId,
      reason: missingEnv ? "missing_env" : undefined,
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null
      },
      requestId
    });
    return res.status(500).json({
      error: "Internal server error",
      requestId,
      reason: missingEnv ? "missing_env" : undefined
    });
  }
};

export default handler;

// Manual test plan:
// 1) curl /api/reviews with Bearer token -> should return rows for user_id.
// 2) Verify /api/reviews without token -> 401.
