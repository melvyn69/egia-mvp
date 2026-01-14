import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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

const getLastMonthRange = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const periodKey = `${start.getUTCFullYear()}-${String(
    start.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  return { start, end, periodKey };
};

const respondJson = (
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>
) => res.status(status).json(payload);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return respondJson(res, 405, {
      ok: false,
      error: { message: "Method not allowed", code: "BAD_REQUEST" },
      requestId
    });
  }

  const expected = String(process.env.CRON_SECRET ?? "").trim();
  const provided = String(
    (req.headers["x-cron-secret"] as string | undefined) ?? ""
  ).trim();
  if (!expected || !provided || provided !== expected) {
    return respondJson(res, 403, {
      ok: false,
      error: { message: "Unauthorized", code: "FORBIDDEN" },
      requestId
    });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return respondJson(res, 500, {
      ok: false,
      error: { message: "Missing Supabase env", code: "INTERNAL" },
      requestId
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  console.log("[cron][monthly-reports]", { requestId, route: req.url });

  try {
    const { start, end, periodKey } = getLastMonthRange();
    const fromIso = start.toISOString();
    const toIso = end.toISOString();
    const batchSize = Math.max(
      1,
      Number(process.env.CRON_MONTHLY_BATCH ?? 20)
    );

    const { data: locationRows, error: locationsError } = await supabaseAdmin
      .from("google_locations")
      .select("user_id, location_resource_name")
      .not("user_id", "is", null)
      .limit(batchSize * 50);
    if (locationsError) {
      return respondJson(res, 500, {
        ok: false,
        error: { message: "Failed to load locations", code: "INTERNAL" },
        requestId
      });
    }

    const locationsByUser = new Map<string, string[]>();
    for (const row of locationRows ?? []) {
      const userId = row.user_id as string | null;
      const locationId = row.location_resource_name as string | null;
      if (!userId || !locationId) {
        continue;
      }
      const list = locationsByUser.get(userId) ?? [];
      list.push(locationId);
      locationsByUser.set(userId, list);
    }

    const users = Array.from(locationsByUser.keys()).slice(0, batchSize);
    if (users.length === 0) {
      return respondJson(res, 200, {
        ok: true,
        requestId,
        period: { from: fromIso, to: toIso, key: periodKey },
        stats: { total: 0, created: 0, skipped: 1, failed: 0 },
        created: 0,
        skipped: 1,
        errors: [],
        results: [],
        skipReason: "no_candidates"
      });
    }

    const results: Array<{
      userId: string;
      reportId?: string;
      status: "created" | "skipped" | "failed";
      reason?: string;
      error?: string;
    }> = [];

    for (const userId of users) {
      try {
        const existing = await supabaseAdmin
          .from("reports")
          .select("id")
          .eq("user_id", userId)
          .eq("period_preset", "last_month")
          .eq("from_date", fromIso)
          .eq("to_date", toIso)
          .eq("render_mode", "premium")
          .maybeSingle();
        if (existing.data?.id) {
          results.push({
            userId,
            reportId: existing.data.id as string,
            status: "skipped",
            reason: "already_exists"
          });
          continue;
        }

        const locations = locationsByUser.get(userId) ?? [];
        if (locations.length === 0) {
          results.push({
            userId,
            status: "skipped",
            reason: "no_locations"
          });
          continue;
        }

        const insertPayload = {
          user_id: userId,
          name: `Rapport mensuel ${periodKey}`,
          locations,
          period_preset: "last_month",
          from_date: fromIso,
          to_date: toIso,
          timezone: "Europe/Paris",
          status: "draft",
          render_mode: "premium",
          notes: null,
          updated_at: new Date().toISOString()
        };

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("reports")
          .insert(insertPayload)
          .select("id")
          .maybeSingle();
        if (insertError || !inserted?.id) {
          results.push({
            userId,
            status: "failed",
            reason: "insert_failed",
            error: insertError?.message ?? "insert_failed"
          });
          continue;
        }

        results.push({
          userId,
          reportId: inserted.id as string,
          status: "created"
        });
      } catch (error) {
        results.push({
          userId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    const stats = results.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "created") acc.created += 1;
        if (item.status === "skipped") acc.skipped += 1;
        if (item.status === "failed") acc.failed += 1;
        return acc;
      },
      { total: 0, created: 0, skipped: 0, failed: 0 }
    );

    const errors = results
      .filter((item) => item.status === "failed")
      .map((item) => ({
        userId: item.userId,
        reportId: item.reportId ?? null,
        error: item.error ?? "Unknown error"
      }));

    return respondJson(res, 200, {
      ok: true,
      requestId,
      period: { from: fromIso, to: toIso, key: periodKey },
      stats,
      created: stats.created,
      skipped: stats.skipped,
      errors,
      results
    });
  } catch (error) {
    console.error("[cron][monthly-reports] fatal", error);
    return respondJson(res, 500, {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL"
      },
      requestId
    });
  }
}
