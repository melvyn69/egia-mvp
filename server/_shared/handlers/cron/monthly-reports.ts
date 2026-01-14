import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { getRequestId, logRequest } from "../../api_utils";
import { generatePremiumReport } from "../reports/generate_html";

type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

type ReportRow = Database["public"]["Tables"]["reports"]["Row"];

const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return "";
};

const supabaseUrl = getEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceRoleKey = getEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
const cronSecret = getEnv(["CRON_SECRET"]);
const DEFAULT_TIMEZONE = "Europe/Paris";

const getMissingEnv = () => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!cronSecret) missing.push("CRON_SECRET");
  return missing;
};

const supabaseAdmin: SupabaseAdmin = createClient<Database>(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: { persistSession: false }
  }
);

const getCronSecrets = (req: VercelRequest) => {
  const expected = String(cronSecret ?? "").trim();
  const headerSecret =
    (req.headers["x-cron-secret"] as string | undefined) ??
    (req.headers["x-cron-key"] as string | undefined);
  const auth = (req.headers.authorization as string | undefined) ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const provided = String(headerSecret ?? bearer ?? "").trim();
  return { expected, provided };
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

const getNowUtcInfo = () => {
  const now = new Date();
  return { now, isFirstDayUtc: now.getUTCDate() === 1 };
};

const fetchActiveLocationIds = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from("business_settings")
    .select("active_location_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const activeIds = Array.isArray(data?.active_location_ids)
    ? data.active_location_ids.filter(Boolean)
    : null;
  return activeIds && activeIds.length > 0 ? new Set(activeIds) : null;
};

const loadLocations = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from("google_locations")
    .select("id, location_resource_name")
    .eq("user_id", userId);
  return data ?? [];
};

const findExistingReport = async (
  userId: string,
  fromIso: string,
  toIso: string
) => {
  const { data } = await supabaseAdmin
    .from("reports")
    .select("id, status")
    .eq("user_id", userId)
    .eq("period_preset", "last_month")
    .eq("from_date", fromIso)
    .eq("to_date", toIso)
    .maybeSingle();
  return data as Pick<ReportRow, "id" | "status"> | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  res.setHeader("Cache-Control", "no-store");
  const method = req.method ?? "GET";
  const { now, isFirstDayUtc } = getNowUtcInfo();

  logRequest("[cron][monthly-reports]", {
    requestId,
    method,
    route: req.url ?? "/api/cron/monthly-reports"
  });

  if (method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: { message: "Method not allowed", code: "BAD_REQUEST" },
      requestId
    });
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    return res.status(500).json({
      ok: false,
      error: {
        message: `Missing env: ${missingEnv.join(", ")}`,
        code: "INTERNAL"
      },
      requestId
    });
  }

  const { expected, provided } = getCronSecrets(req);
  if (!expected || !provided || provided !== expected) {
    return res.status(403).json({
      ok: false,
      error: { message: "Unauthorized", code: "FORBIDDEN" },
      requestId
    });
  }

  try {
    const dryRunParam = req.query?.dry_run;
    const dryRun =
      dryRunParam === "1" ||
      (Array.isArray(dryRunParam) && dryRunParam[0] === "1");
    const forceParam = req.query?.force;
    const force =
      forceParam === "1" ||
      (Array.isArray(forceParam) && forceParam[0] === "1");
    const runForUserParam = req.query?.run_for_user;
    const runForUser = Array.isArray(runForUserParam)
      ? runForUserParam[0]
      : runForUserParam;
    const batchSize = Math.max(
      1,
      Number(process.env.CRON_MONTHLY_BATCH ?? 20)
    );

    if (!dryRun && !force && !isFirstDayUtc) {
      return res.status(200).json({
        ok: true,
        requestId,
        skipped: 1,
        created: 0,
        errors: [],
        stats: { total: 0, created: 0, skipped: 1, failed: 0 },
        reason: "not_first_day",
        now_utc: now.toISOString(),
        is_first_day_utc: isFirstDayUtc
      });
    }

    const { start, end, periodKey } = getLastMonthRange();
    const fromIso = start.toISOString();
    const toIso = end.toISOString();

    let usersQuery = supabaseAdmin
      .from("simple_automations")
      .select("user_id")
      .eq("monthly_report_enabled", true)
      .order("user_id", { ascending: true })
      .limit(batchSize);
    if (runForUser) {
      usersQuery = usersQuery.eq("user_id", runForUser);
    }
    const { data: userRows, error: usersError } = await usersQuery;
    if (usersError) {
      return res.status(500).json({
        ok: false,
        error: { message: "Failed to load monthly users", code: "INTERNAL" },
        requestId
      });
    }

    const users = (userRows ?? [])
      .map((row) => row.user_id)
      .filter(Boolean) as string[];
    if (users.length === 0) {
      return res.status(200).json({
        ok: true,
        requestId,
        skipped: 1,
        created: 0,
        errors: [],
        stats: { total: 0, created: 0, skipped: 1, failed: 0 },
        skipReason: "no_candidates"
      });
    }

    const results: Array<{
      userId: string;
      reportId?: string;
      status: "done" | "skipped" | "failed";
      reason?: string;
      error?: string;
    }> = [];

    for (const userId of users) {
      try {
        const existing = await findExistingReport(userId, fromIso, toIso);
        if (existing) {
          results.push({
            userId,
            reportId: existing.id,
            status: "skipped",
            reason: "already_exists"
          });
          continue;
        }

        const activeLocations = await fetchActiveLocationIds(userId);
        const locations = await loadLocations(userId);
        const locationIds = locations
          .map((row) => row.location_resource_name)
          .filter(Boolean)
          .filter((locationId) =>
            activeLocations ? activeLocations.has(locationId) : true
          );
        if (locationIds.length === 0) {
          results.push({
            userId,
            status: "skipped",
            reason: "no_locations"
          });
          continue;
        }

        const reportName = `Rapport mensuel ${periodKey}`;
        const insertPayload = {
          user_id: userId,
          name: reportName,
          locations: locationIds,
          period_preset: "last_month",
          from_date: fromIso,
          to_date: toIso,
          timezone: DEFAULT_TIMEZONE,
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

        if (dryRun) {
          results.push({
            userId,
            reportId: inserted.id,
            status: "skipped",
            reason: "dry_run"
          });
          continue;
        }

        await generatePremiumReport({
          supabaseAdmin,
          reportId: inserted.id,
          requestId,
          userId
        });

        results.push({
          userId,
          reportId: inserted.id,
          status: "done"
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
        if (item.status === "done") acc.created += 1;
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

    return res.status(200).json({
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
    return res.status(500).json({
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL"
      },
      requestId
    });
  }
}
