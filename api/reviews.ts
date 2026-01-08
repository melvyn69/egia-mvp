import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { resolveDateRange } from "./_date.js";
import { parseFilters } from "./_filters.js";
import { requireUser } from "./_auth.js";

type Cursor = { source_time: string; id: string };

type GoogleLocationRow = { location_resource_name: string };

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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const route = "/api/reviews";
  const requestId = getRequestId(req);
  let userId: string | null = null;
  let locationId: string | null = null;

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

    const filters = parseFilters(req.query);
    locationId = filters.location_id ?? null;
    if (!locationId) {
      return res.status(400).json({ error: "Missing location_id" });
    }
    if (filters.reject) {
      return res.status(200).json({ rows: [], nextCursor: null });
    }
    console.log("[reviews]", {
      route,
      query: req.query,
      userId,
      location_id: locationId
    });

    const { data: locationRow } = (await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId)
      .eq("location_resource_name", locationId)
      .maybeSingle()) as { data: GoogleLocationRow | null; error: unknown };
    if (!locationRow) {
      return res.status(404).json({ error: "Location not found" });
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
      .order("update_time", { ascending: false, nullsFirst: false })
      .order("create_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(limit * 3);
    query = query.eq("location_id", locationId);

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
