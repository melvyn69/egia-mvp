import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from "../server/_shared_dist/_date.js";
import { buildPromptContext } from "../server/_shared_dist/ai_reply.js";
import { requireUser } from "../server/_shared_dist/_auth.js";

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
  created_at: string | null;
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

const AI_JOB_IN_FLIGHT_STATUSES = [
  "queued",
  "pending",
  "processing",
  "generating"
];

const isNonEmptyText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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

const parseRequestUrl = (req: VercelRequest) => {
  try {
    return new URL(req.url ?? "/api/reviews", "http://localhost");
  } catch {
    return new URL("/api/reviews", "http://localhost");
  }
};

const getQueryValue = (
  parsedUrl: URL,
  req: VercelRequest,
  key: string
): string | null => {
  const fromUrl = parsedUrl.searchParams.get(key);
  if (typeof fromUrl === "string") {
    const trimmed = fromUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const fromReqQuery = (req.query as Record<string, unknown>)[key];
  const raw = Array.isArray(fromReqQuery) ? fromReqQuery[0] : fromReqQuery;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNumberQuery = (
  parsedUrl: URL,
  req: VercelRequest,
  key: string
): number | null => {
  const raw = getQueryValue(parsedUrl, req, key);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseIntegerQuery = (
  parsedUrl: URL,
  req: VercelRequest,
  key: string,
  options: { defaultValue: number; min: number; max: number }
) => {
  const raw = getQueryValue(parsedUrl, req, key);
  const parsed = raw ? Number.parseInt(raw, 10) : options.defaultValue;
  if (!Number.isFinite(parsed)) {
    return options.defaultValue;
  }
  return Math.min(options.max, Math.max(options.min, parsed));
};

const parseTagsQuery = (
  parsedUrl: URL,
  req: VercelRequest
): string[] | null => {
  const raw = getQueryValue(parsedUrl, req, "tags");
  if (!raw || raw === "all") {
    return null;
  }
  const tags = raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return tags.length > 0 ? tags : null;
};

const getParsedQuerySnapshot = (parsedUrl: URL) =>
  Object.fromEntries(parsedUrl.searchParams.entries());

type InboxStatusFilter = "new" | "reading" | "replied" | "archived";

const normalizeInboxStatus = (value: unknown): InboxStatusFilter | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  if (!normalized || normalized === "all" || normalized === "tout") {
    return null;
  }
  if (normalized === "new" || normalized === "nouveau") {
    return "new";
  }
  if (
    normalized === "reading" ||
    normalized === "draft" ||
    normalized === "a_traiter" ||
    normalized === "a-traiter" ||
    normalized === "to_treat" ||
    normalized === "todo"
  ) {
    return "reading";
  }
  if (normalized === "replied" || normalized === "repondu") {
    return "replied";
  }
  if (
    normalized === "archived" ||
    normalized === "ignored" ||
    normalized === "ignore"
  ) {
    return "archived";
  }
  return null;
};

const toInboxRowStatus = (row: Pick<GoogleReviewRow, "status" | "owner_reply" | "has_draft">): InboxStatusFilter => {
  const rawStatus = String(row.status ?? "").toLowerCase();
  if (rawStatus === "ignored" || rawStatus === "archived") {
    return "archived";
  }
  if (rawStatus === "reading" || rawStatus === "draft") {
    return "reading";
  }
  if (isNonEmptyText(row.owner_reply)) {
    return "replied";
  }
  if (row.has_draft) {
    return "reading";
  }
  return "new";
};

const handler = async (req: VercelRequest, res: VercelResponse) => {
  const route = "/api/reviews";
  const requestId = getRequestId(req);
  const parsedUrl = parseRequestUrl(req);
  const parsedQuery = getParsedQuerySnapshot(parsedUrl);
  let userId: string | null = null;
  let locationId: string | null = null;
  let action = getQueryValue(parsedUrl, req, "action") ?? undefined;

  try {
    let auth;
    try {
      auth = await requireUser(req, res);
    } catch (err) {
      const missingEnv = isMissingEnvError(err);
      console.error("[reviews] auth error", {
        route,
        req_url: req.url ?? null,
        query: parsedQuery,
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
      const existingStatus = String(existingDraft?.status ?? "").trim().toLowerCase();
      if (existingText) {
        if (existingStatus !== "draft") {
          await supabaseAdmin
            .from("review_ai_replies")
            .update({ status: "draft", updated_at: new Date().toISOString() })
            .eq("review_id", reviewId)
            .eq("user_id", userId)
            .eq("mode", "draft");
        }
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
          .select("id, comment, owner_reply, create_time, update_time, created_at")
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
          const sourceTs = probeRow.create_time ?? probeRow.update_time ?? probeRow.created_at;
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
      const { data: draftAfterUpsert } = await supabaseAdmin
        .from("review_ai_replies")
        .select("status, draft_text")
        .eq("review_id", reviewId)
        .eq("user_id", userId)
        .eq("mode", "draft")
        .maybeSingle();
      const draftAfterUpsertText = draftAfterUpsert?.draft_text
        ? String(draftAfterUpsert.draft_text).trim()
        : "";
      if (draftAfterUpsertText) {
        if (String(draftAfterUpsert?.status ?? "").toLowerCase() !== "draft") {
          await supabaseAdmin
            .from("review_ai_replies")
            .update({ status: "draft", updated_at: new Date().toISOString() })
            .eq("review_id", reviewId)
            .eq("user_id", userId)
            .eq("mode", "draft");
        }
        return res.status(200).json({ ok: true, status: "exists" });
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
            .select("id, comment, owner_reply, create_time, update_time, created_at")
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
            const sourceTs = probeRow.create_time ?? probeRow.update_time ?? probeRow.created_at;
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
                  .in("status", AI_JOB_IN_FLIGHT_STATUSES)
                  .limit(20);
                const hasLocationJobInProgress =
                  Array.isArray(activeJobs) &&
                  activeJobs.some((job) => {
                    const payload = job?.payload;
                    if (!payload || typeof payload !== "object") {
                      return false;
                    }
                    return (payload as Record<string, unknown>).location_id === locationId;
                  });
                if (hasLocationJobInProgress) {
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

        const { data: existingDraftRow } = await supabaseAdmin
          .from("review_ai_replies")
          .select("status, draft_text")
          .eq("review_id", reviewId)
          .eq("user_id", userId)
          .eq("mode", "draft")
          .maybeSingle();
        const existingDraftText = existingDraftRow?.draft_text
          ? String(existingDraftRow.draft_text).trim()
          : "";
        if (existingDraftText) {
          if (String(existingDraftRow?.status ?? "").toLowerCase() !== "draft") {
            await supabaseAdmin
              .from("review_ai_replies")
              .update({ status: "draft", updated_at: new Date().toISOString() })
              .eq("review_id", reviewId)
              .eq("user_id", userId)
              .eq("mode", "draft");
          }
          skipped += 1;
          console.info("[prepare_drafts] enqueue_decision", {
            userId,
            locationId,
            reviewId,
            identityHash: locationIdentityHash,
            decision: "skipped",
            reason: "already_has_draft"
          });
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "already_has_draft"
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
        const { data: draftAfterUpsertRow } = await supabaseAdmin
          .from("review_ai_replies")
          .select("status, draft_text")
          .eq("review_id", reviewId)
          .eq("user_id", userId)
          .eq("mode", "draft")
          .maybeSingle();
        const draftAfterUpsertValue = draftAfterUpsertRow?.draft_text
          ? String(draftAfterUpsertRow.draft_text).trim()
          : "";
        if (draftAfterUpsertValue) {
          if (String(draftAfterUpsertRow?.status ?? "").toLowerCase() !== "draft") {
            await supabaseAdmin
              .from("review_ai_replies")
              .update({ status: "draft", updated_at: new Date().toISOString() })
              .eq("review_id", reviewId)
              .eq("user_id", userId)
              .eq("mode", "draft");
          }
          skipped += 1;
          console.info("[prepare_drafts] enqueue_decision", {
            userId,
            locationId,
            reviewId,
            identityHash: locationIdentityHash,
            decision: "skipped",
            reason: "already_has_draft"
          });
          results.push({
            review_id: reviewId,
            queued: false,
            skipped: true,
            skipped_reason: "already_has_draft"
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

    locationId = getQueryValue(parsedUrl, req, "location_id");
    const source = getQueryValue(parsedUrl, req, "source");
    if (source && source !== "google") {
      console.log("[reviews]", {
        event: "list_rejected_source",
        req_url: req.url ?? null,
        query: parsedQuery,
        user_id: userId,
        source,
        requestId
      });
      return res.status(200).json({ ok: true, items: [], nextCursor: null, total: 0 });
    }

    const rawStatus = getQueryValue(parsedUrl, req, "status");
    const statusNormalized = normalizeInboxStatus(rawStatus);
    const preset = getQueryValue(parsedUrl, req, "preset") ?? "this_month";
    const from = getQueryValue(parsedUrl, req, "from") ?? undefined;
    const to = getQueryValue(parsedUrl, req, "to") ?? undefined;
    const timeZone = getQueryValue(parsedUrl, req, "tz") ?? "Europe/Paris";
    const ratingMin = parseNumberQuery(parsedUrl, req, "rating_min");
    const ratingMax = parseNumberQuery(parsedUrl, req, "rating_max");
    const sentimentRaw = getQueryValue(parsedUrl, req, "sentiment");
    const sentiment =
      sentimentRaw && sentimentRaw !== "all" ? sentimentRaw : null;
    const tags = parseTagsQuery(parsedUrl, req);
    const limit = parseIntegerQuery(parsedUrl, req, "limit", {
      defaultValue: 50,
      min: 1,
      max: 200
    });
    const offset = parseIntegerQuery(parsedUrl, req, "offset", {
      defaultValue: 0,
      min: 0,
      max: 10_000
    });
    const includeNoComment = parseBooleanQuery(
      getQueryValue(parsedUrl, req, "include_no_comment"),
      false
    );
    const cursor = parseCursor(getQueryValue(parsedUrl, req, "cursor") ?? undefined);

    const activeLocationIds = await fetchActiveLocationIds(
      supabaseAdmin,
      userId
    );
    let locationIds: string[] = [];
    if (locationId) {
      const { data: locationRow, error: locationError } = (await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId)
        .eq("location_resource_name", locationId)
        .maybeSingle()) as { data: GoogleLocationRow | null; error: { message?: string | null } | null };
      if (locationError) {
        console.error("[reviews]", {
          event: "location_lookup_failed",
          req_url: req.url ?? null,
          query: parsedQuery,
          location_id: locationId,
          user_id: userId,
          message: locationError.message ?? null,
          requestId
        });
        return res.status(500).json({ error: "Failed to load location", requestId });
      }
      if (!locationRow) {
        return res.status(404).json({ error: "Location not found", requestId });
      }
      if (activeLocationIds && !activeLocationIds.has(locationRow.id)) {
        return res.status(404).json({ error: "Location not active", requestId });
      }
      locationIds = [locationRow.location_resource_name].filter(Boolean);
    } else {
      const { data: locations, error: locationsError } = (await supabaseAdmin
        .from("google_locations")
        .select("id, location_resource_name")
        .eq("user_id", userId)) as { data: GoogleLocationRow[] | null; error: { message?: string | null } | null };
      if (locationsError) {
        console.error("[reviews]", {
          event: "locations_load_failed",
          req_url: req.url ?? null,
          query: parsedQuery,
          user_id: userId,
          message: locationsError.message ?? null,
          requestId
        });
        return res.status(500).json({ error: "Failed to load locations", requestId });
      }
      const filtered = activeLocationIds
        ? (locations ?? []).filter((location) =>
            activeLocationIds.has(location.id)
          )
        : locations ?? [];
      locationIds = filtered
        .map((location) => location.location_resource_name)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    }

    if (locationIds.length === 0) {
      console.log("[reviews]", {
        event: "list_no_locations",
        req_url: req.url ?? null,
        query: parsedQuery,
        location_id: locationId,
        status: rawStatus,
        limit,
        offset,
        user_id: userId,
        requestId
      });
      return res.status(200).json({ ok: true, items: [], nextCursor: null, total: 0 });
    }
    const selectedLocationId = locationIds[0] ?? null;

    let range: ReturnType<typeof resolveDateRange>;
    try {
      range = resolveDateRange(
        preset as Parameters<typeof resolveDateRange>[0],
        from,
        to,
        timeZone
      );
    } catch (error) {
      console.error("[reviews]", {
        event: "invalid_date_filters",
        req_url: req.url ?? null,
        query: parsedQuery,
        location_id: locationId,
        status: rawStatus,
        limit,
        offset,
        user_id: userId,
        message: error instanceof Error ? error.message : String(error),
        requestId
      });
      return res.status(400).json({
        error: "Invalid date filters",
        requestId
      });
    }
    const rangeFrom =
      typeof range.from === "string" ? range.from : range.from.toISOString();
    const rangeTo =
      typeof range.to === "string" ? range.to : range.to.toISOString();
    const rangeFromMs = new Date(rangeFrom).getTime();
    const rangeToMs = new Date(rangeTo).getTime();

    const candidateLimit = Math.min(Math.max(limit * 6, limit), 500);
    const safeUserId = isUuid(userId) ? userId : null;
    if (!safeUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const computedLookbackDays = Number.isFinite(rangeFromMs)
      ? Math.min(
          3650,
          Math.max(
            0,
            Math.ceil((Date.now() - rangeFromMs) / (24 * 60 * 60 * 1000)) + 7
          )
        )
      : 180;
    const getSourceTime = (row: Pick<GoogleReviewRow, "update_time" | "create_time" | "created_at">) =>
      row.update_time ?? row.create_time ?? row.created_at ?? null;

    let baseRows: GoogleReviewRow[] = [];
    let total = 0;

    let tableQuery = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, review_id, location_id, author_name, rating, comment, create_time, update_time, created_at, status, owner_reply"
      )
      .eq("user_id", safeUserId);
    if (locationIds.length === 1) {
      tableQuery = tableQuery.eq("location_id", locationIds[0]);
    } else {
      tableQuery = tableQuery.in("location_id", locationIds);
    }
    tableQuery = tableQuery.or(
      `and(update_time.gte.${rangeFrom},update_time.lte.${rangeTo}),` +
        `and(update_time.is.null,create_time.gte.${rangeFrom},create_time.lte.${rangeTo}),` +
        `and(update_time.is.null,create_time.is.null,created_at.gte.${rangeFrom},created_at.lte.${rangeTo})`
    );
    if (statusNormalized === "replied") {
      tableQuery = tableQuery
        .not("owner_reply", "is", null)
        .neq("owner_reply", "");
    } else if (statusNormalized === "archived") {
      tableQuery = tableQuery.or("status.eq.ignored,status.eq.archived");
    }
    if (!includeNoComment) {
      tableQuery = tableQuery.not("comment", "is", null).neq("comment", "");
    }
    if (ratingMin !== null) {
      tableQuery = tableQuery.gte("rating", ratingMin);
    }
    if (ratingMax !== null) {
      tableQuery = tableQuery.lte("rating", ratingMax);
    }
    if (cursor) {
      tableQuery = tableQuery.or(
        `and(update_time.not.is.null,update_time.lt.${cursor.source_time}),` +
          `and(update_time.not.is.null,update_time.eq.${cursor.source_time},id.lt.${cursor.id}),` +
          `and(update_time.is.null,create_time.not.is.null,create_time.lt.${cursor.source_time}),` +
          `and(update_time.is.null,create_time.not.is.null,create_time.eq.${cursor.source_time},id.lt.${cursor.id}),` +
          `and(update_time.is.null,create_time.is.null,created_at.lt.${cursor.source_time}),` +
          `and(update_time.is.null,create_time.is.null,created_at.eq.${cursor.source_time},id.lt.${cursor.id})`
      );
    }
    const { data: tableRowsRaw, error: tableRowsError } = await tableQuery
      .order("update_time", { ascending: false, nullsFirst: false })
      .order("create_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(candidateLimit + offset);
    if (tableRowsError) {
      console.error("[reviews]", {
        event: "google_reviews_query_failed",
        req_url: req.url ?? null,
        query: parsedQuery,
        table: "google_reviews",
        user_id: safeUserId,
        location_id: locationId,
        location_ids_count: locationIds.length,
        status: rawStatus,
        statusNormalized,
        limit,
        offset,
        message: tableRowsError.message ?? null,
        requestId
      });
      throw new Error(tableRowsError.message ?? "Failed to load review history");
    }
    baseRows = ((tableRowsRaw ?? []) as Array<{
      id: string | null;
      review_id: string | null;
      location_id: string | null;
      author_name: string | null;
      rating: number | null;
      comment: string | null;
      create_time: string | null;
      update_time: string | null;
      created_at: string | null;
      status: string | null;
      owner_reply: string | null;
    }>).map((row) => {
      const mapped: GoogleReviewRow = {
        id: row.id ?? "",
        review_id: row.review_id ?? "",
        location_id: row.location_id ?? "",
        author_name: row.author_name ?? "",
        rating: row.rating,
        comment: row.comment ?? "",
        create_time: row.create_time,
        update_time: row.update_time,
        created_at: row.created_at ?? row.create_time ?? row.update_time,
        status: row.status ?? null,
        owner_reply: row.owner_reply ?? "",
        draft_status: null,
        draft_preview: "",
        draft_updated_at: null,
        has_draft: false,
        has_job_inflight: false,
        is_eligible_to_generate: false
      };
      return {
        ...mapped,
        status: toInboxRowStatus(mapped)
      };
    });

    const tableReviewIds = baseRows.map((row) => row.id).filter(Boolean);
    if (tableReviewIds.length > 0) {
      const { data: draftRows } = await supabaseAdmin
        .from("review_ai_replies")
        .select("review_id, status, draft_text, updated_at")
        .eq("user_id", safeUserId)
        .eq("mode", "draft")
        .in("review_id", tableReviewIds);
      const { data: jobRows } = await supabaseAdmin
        .from("ai_jobs")
        .select("payload")
        .in("status", AI_JOB_IN_FLIGHT_STATUSES)
        .limit(500);
      type DraftLookupRow = {
        review_id: string | null;
        status: string | null;
        draft_text: string | null;
        updated_at: string | null;
      };
      const typedDraftRows = (draftRows ?? []) as DraftLookupRow[];
      const draftByReview = new Map<
        string,
        { status: string | null; draft_text: string | null; updated_at: string | null }
      >(
        typedDraftRows.map((row) => [
          String(row.review_id ?? ""),
          {
            status: row.status ?? null,
            draft_text: row.draft_text ?? null,
            updated_at: row.updated_at ?? null
          }
        ])
      );
      const inflightReviewIds = new Set(
        ((jobRows ?? []) as Array<{ payload?: Record<string, unknown> | null }>)
          .filter((row) => {
            const payload = row.payload ?? {};
            const payloadUserId = payload.user_id;
            return !payloadUserId || payloadUserId === safeUserId;
          })
          .map((row) => String(row.payload?.review_id ?? ""))
          .filter(Boolean)
      );
      baseRows = baseRows.map((row) => {
        const draft = draftByReview.get(row.id);
        const hasDraft = Boolean(draft && isNonEmptyText(draft.draft_text));
        const hasJobInflight = inflightReviewIds.has(row.id);
        const mapped: GoogleReviewRow = {
          ...row,
          has_draft: hasDraft,
          has_job_inflight: hasJobInflight,
          draft_status: draft?.status ?? row.draft_status ?? null,
          draft_preview: draft?.draft_text?.slice(0, 160) ?? row.draft_preview ?? "",
          draft_updated_at: draft?.updated_at ?? row.draft_updated_at ?? null,
          is_eligible_to_generate:
            !isNonEmptyText(row.owner_reply) &&
            isNonEmptyText(row.comment) &&
            !hasDraft &&
            !hasJobInflight
        };
        return {
          ...mapped,
          status: toInboxRowStatus(mapped)
        };
      });
    }

    const rangeFilteredRows = baseRows.filter((row) => {
      const sourceTime = getSourceTime(row);
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
      if (!includeNoComment && !isNonEmptyText(row.comment)) {
        return false;
      }
      if (statusNormalized && toInboxRowStatus(row) !== statusNormalized) {
        return false;
      }
      return true;
    });

    const reviewIds = rangeFilteredRows.map((row) => row.id).filter(Boolean);
    let insights: ReviewInsightRow[] = [];
    if (reviewIds.length > 0) {
      const { data } = (await supabaseAdmin
        .from("review_ai_insights")
        .select("review_pk, sentiment")
        .in("review_pk", reviewIds)) as { data: ReviewInsightRow[] | null; error: unknown };
      insights = data ?? [];
    }
    const sentimentMap = new Map(
      insights.map((item) => [item.review_pk, item.sentiment])
    );

    let tagLinks: ReviewTagLinkRow[] = [];
    if (reviewIds.length > 0) {
      const { data } = (await supabaseAdmin
        .from("review_ai_tags")
        .select("review_pk, tag_id")
        .in("review_pk", reviewIds)) as { data: ReviewTagLinkRow[] | null; error: unknown };
      tagLinks = data ?? [];
    }
    const tagIds = Array.from(
      new Set(tagLinks.map((item) => item.tag_id))
    );
    let tagsData: AiTagRow[] = [];
    if (tagIds.length > 0) {
      const { data } = (await supabaseAdmin
        .from("ai_tags")
        .select("id, tag")
        .in("id", tagIds)) as { data: AiTagRow[] | null; error: unknown };
      tagsData = data ?? [];
    }
    const tagLookup = new Map(tagsData.map((item) => [item.id, item.tag]));
    const tagsByReview = new Map<string, string[]>();
    for (const link of tagLinks) {
      const tag = tagLookup.get(link.tag_id);
      if (!tag) {
        continue;
      }
      const list = tagsByReview.get(link.review_pk) ?? [];
      list.push(tag);
      tagsByReview.set(link.review_pk, list);
    }

    const filtered = rangeFilteredRows
      .filter((row) => {
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
      })
      .sort((a, b) => {
        const aSource = getSourceTime(a) ?? "";
        const bSource = getSourceTime(b) ?? "";
        if (aSource !== bSource) {
          return aSource > bSource ? -1 : 1;
        }
        if (a.id === b.id) {
          return 0;
        }
        return a.id > b.id ? -1 : 1;
      });

    const cursorFiltered = cursor
      ? filtered.filter((row) => {
          const sourceTime = getSourceTime(row);
          if (!sourceTime) {
            return false;
          }
          if (sourceTime < cursor.source_time) {
            return true;
          }
          return sourceTime === cursor.source_time && row.id < cursor.id;
        })
      : filtered;

    const offsetFiltered = offset > 0 ? cursorFiltered.slice(offset) : cursorFiltered;
    const limited = offsetFiltered.slice(0, limit);
    const last = limited[limited.length - 1];
    const hasMore = offsetFiltered.length > limit;
    const nextCursor =
      last && hasMore
        ? buildCursor({
            source_time: getSourceTime(last) ?? "",
            id: last.id
          })
        : null;

    total = filtered.length;

    console.log("[reviews]", {
      event: "list_success",
      req_url: req.url ?? null,
      query: parsedQuery,
      parsed: {
        location_id: locationId,
        status: rawStatus,
        statusNormalized,
        limit,
        offset,
        preset,
        from,
        to,
        tz: timeZone,
        rating_min: ratingMin,
        rating_max: ratingMax,
        sentiment,
        tags
      },
      user_id: safeUserId,
      table: "google_reviews",
      selectedLocationId,
      locationCount: locationIds.length,
      rangeFrom,
      rangeTo,
      lookbackDays: computedLookbackDays,
      base: baseRows.length,
      filtered: filtered.length,
      limited: limited.length,
      total,
      requestId
    });

    return res.status(200).json({
      ok: true,
      items: limited.map((row) => ({
        ...row,
        sentiment: sentimentMap.get(row.id) ?? null,
        tags: tagsByReview.get(row.id) ?? []
      })),
      nextCursor,
      total
    });
  } catch (err) {
    const missingEnv = isMissingEnvError(err);
    console.error("[reviews] error", {
      route,
      req_url: req.url ?? null,
      query: parsedQuery,
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
