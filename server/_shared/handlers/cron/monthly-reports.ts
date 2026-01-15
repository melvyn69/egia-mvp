import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { generatePremiumReport } from "../reports/generate_html.js";
import { getRequestId, sendError, logRequest } from "../../api_utils.js";

type SimpleAutomationRow = {
  user_id: string;
};
type ReportRow = {
  id: string;
  status: string;
};

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

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

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

  logRequest("[cron-monthly]", {
    requestId,
    method,
    route: req.url ?? "/api/cron/monthly-reports"
  });

  if (method !== "POST" && method !== "GET") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length) {
    return sendError(
      res,
      requestId,
      {
        code: "INTERNAL",
        message: `Missing env: ${missingEnv.join(", ")}`
      },
      500
    );
  }

  const { expected, provided } = getCronSecrets(req);
  if (!expected || !provided || provided !== expected) {
    return sendError(
      res,
      requestId,
      { code: "FORBIDDEN", message: "Unauthorized" },
      403
    );
  }

  if (method === "GET") {
    return res.status(200).json({
      ok: true,
      requestId,
      mode: "healthcheck",
      message: "Use POST to run monthly reports.",
      now_utc: now.toISOString(),
      is_first_day_utc: isFirstDayUtc
    });
  }

  const dryRunParam = req.query?.dry_run;
  const dryRun =
    dryRunParam === "1" ||
    (Array.isArray(dryRunParam) && dryRunParam[0] === "1");
  const forceParam = req.query?.force;
  const force =
    forceParam === "1" || (Array.isArray(forceParam) && forceParam[0] === "1");
  const runForUserParam = req.query?.run_for_user;
  const runForUser = Array.isArray(runForUserParam)
    ? runForUserParam[0]
    : runForUserParam;
  const cursorParam = req.query?.cursor;
  const cursor = Array.isArray(cursorParam) ? cursorParam[0] : cursorParam;
  const batchSize = Math.max(
    1,
    Number(process.env.CRON_MONTHLY_BATCH ?? 20)
  );

  if (!dryRun && !force && !isFirstDayUtc) {
    return res.status(200).json({
      ok: true,
      requestId,
      skipped: true,
      reason: "not_first_day",
      now_utc: now.toISOString(),
      is_first_day_utc: isFirstDayUtc,
      message: "Monthly reports run only on the 1st (UTC)."
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
  } else if (cursor) {
    usersQuery = usersQuery.gt("user_id", cursor);
  }
  const { data: users, error: usersError } = await usersQuery;

  if (usersError) {
    return sendError(
      res,
      requestId,
      { code: "INTERNAL", message: "Failed to load automations" },
      500
    );
  }

  const targets = (users ?? []) as Pick<SimpleAutomationRow, "user_id">[];
  if (dryRun) {
    return res.status(200).json({
      ok: true,
      requestId,
      dryRun: true,
      users: targets.map((row) => row.user_id),
      period: { from: fromIso, to: toIso, key: periodKey },
      now_utc: now.toISOString(),
      is_first_day_utc: isFirstDayUtc,
      next_cursor:
        targets.length === batchSize
          ? targets[targets.length - 1].user_id
          : null
    });
  }

  const results: Array<{ userId: string; reportId?: string; status: string }> = [];

  for (const row of targets) {
    const userId = row.user_id;
    const existing = await findExistingReport(userId, fromIso, toIso);
    if (existing && ["done", "processing", "running"].includes(existing.status)) {
      results.push({ userId, reportId: existing.id, status: "skipped_existing" });
      continue;
    }

    const activeLocationIds = await fetchActiveLocationIds(userId);
    const locations = await loadLocations(userId);
    const selectedLocations = (activeLocationIds
      ? locations.filter((loc) => activeLocationIds.has(loc.id))
      : locations
    )
      .map((loc) => loc.location_resource_name)
      .filter(Boolean);

    if (selectedLocations.length === 0) {
      results.push({ userId, status: "skipped_no_locations" });
      continue;
    }

    const reportName = `Rapport mensuel ${periodKey}`;
    const { data: report, error: reportError } = await supabaseAdmin
      .from("reports")
      .insert({
        user_id: userId,
        name: reportName,
        locations: selectedLocations,
        period_preset: "last_month",
        from_date: fromIso,
        to_date: toIso,
        timezone: DEFAULT_TIMEZONE,
        render_mode: "premium",
        status: "queued"
      })
      .select("id")
      .single();

    if (reportError || !report) {
      results.push({ userId, status: "failed_create" });
      continue;
    }

    const result = await generatePremiumReport({
      supabaseAdmin,
      userId,
      reportId: report.id,
      requestId
    });

    if ("error" in result) {
      results.push({ userId, reportId: report.id, status: "failed_generate" });
    } else {
      results.push({ userId, reportId: report.id, status: "done" });
    }
  }

  return res.status(200).json({
    ok: true,
    requestId,
    processed: results.length,
    period: { from: fromIso, to: toIso, key: periodKey },
    now_utc: now.toISOString(),
    is_first_day_utc: isFirstDayUtc,
    next_cursor:
      targets.length === batchSize ? targets[targets.length - 1].user_id : null,
    results
  });
}

// Smoke tests (manual)
// curl -X POST "$URL/api/cron/monthly-reports?dry_run=1" -H "x-cron-secret: $CRON_SECRET"
// curl -X POST "$URL/api/cron/monthly-reports?force=1" -H "x-cron-secret: $CRON_SECRET"
// curl -X POST "$URL/api/cron/monthly-reports?run_for_user=USER_ID" -H "x-cron-secret: $CRON_SECRET"
