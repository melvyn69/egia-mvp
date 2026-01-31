import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from "../server/_shared_dist/_date.js";
import { parseFilters } from "../server/_shared_dist/_filters.js";
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
};

type ReviewInsightRow = { review_pk: string; sentiment: string | null };

type ReviewTagLinkRow = { review_pk: string; tag_id: string };

type AiTagRow = { id: string; tag: string };

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
        .select("id")
        .maybeSingle();
      if (error) {
        return res.status(500).json({ error: "Failed to resolve alert" });
      }
      if (!data) {
        return res.status(404).json({ error: "Alert not found" });
      }
      return res.status(200).json({ ok: true });
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
          .maybeSingle();
        const { data: aiState } = await supabaseAdmin
          .from("cron_state")
          .select("value")
          .eq("key", aiKey)
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
    const cursorParam = req.query.cursor;
    const cursor = parseCursor(
      Array.isArray(cursorParam) ? cursorParam[0] : cursorParam
    );

    let query = supabaseAdmin
      .from("google_reviews")
      .select(
        "id, review_id, location_id, author_name, rating, comment, create_time, update_time, created_at, status"
      )
      .eq("user_id", userId)
      .order("update_time", { ascending: false, nullsFirst: false })
      .order("create_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(limit * 3);
    if (locationIds.length === 1) {
      query = query.eq("location_id", locationIds[0]);
    } else {
      query = query.in("location_id", locationIds);
    }

    query = query.or(
      `and(update_time.gte.${range.from},update_time.lte.${range.to}),` +
        `and(update_time.is.null,create_time.gte.${range.from},create_time.lte.${range.to}),` +
        `and(update_time.is.null,create_time.is.null,created_at.gte.${range.from},created_at.lte.${range.to})`
    );

    if (ratingMin !== null && Number.isFinite(ratingMin)) {
      query = query.gte("rating", ratingMin);
    }
    if (ratingMax !== null && Number.isFinite(ratingMax)) {
      query = query.lte("rating", ratingMax);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: baseRows, error: baseError } = (await query) as {
      data: GoogleReviewRow[] | null;
      error: unknown;
    };
    if (baseError) {
      throw baseError;
    }

    const rows = (baseRows ?? []).filter((row) => {
      const sourceTime =
        row.update_time ?? row.create_time ?? row.created_at ?? null;
      if (!sourceTime || !cursor) {
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
      rows: limited.map((row) => ({
        ...row,
        sentiment: sentimentMap.get(row.id) ?? null,
        tags: tagsByReview.get(row.id) ?? []
      })),
      nextCursor
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
