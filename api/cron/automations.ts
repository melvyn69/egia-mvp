import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../server/_shared_dist/database.types.js";
import { requireUser } from "../../server/_shared_dist/_auth.js";
import { getRequestId, sendError } from "../../server/_shared_dist/api_utils.js";

const createSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role env");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
};

const runAutomationsForUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
) => {
  const { data: workflows, error: wfError } = await supabaseAdmin
    .from("automation_workflows")
    .select("id,user_id,enabled,trigger,location_ids")
    .eq("enabled", true)
    .eq("trigger", "new_review")
    .eq("user_id", userId);
  if (wfError || !workflows || workflows.length === 0) {
    return { processed: 0, inserted: 0, last_cursor: null as string | null };
  }

  const { data: conditions } = await supabaseAdmin
    .from("automation_conditions")
    .select("workflow_id,field,operator,value")
    .in(
      "workflow_id",
      (workflows ?? []).map((w) => w.id)
    );

  const workflowConditions = new Map<string, typeof conditions>();
  for (const condition of conditions ?? []) {
    const list = workflowConditions.get(condition.workflow_id) ?? [];
    list.push(condition);
    workflowConditions.set(condition.workflow_id, list);
  }

  const { data: cronRow } = await supabaseAdmin
    .from("cron_state")
    .select("value")
    .eq("key", `automations_last_processed_at:${userId}`)
    .maybeSingle();
  const lastProcessed =
    (cronRow?.value as { last_processed_at?: string } | null)
      ?.last_processed_at ?? null;

  const { data: reviews, error: reviewsError } = await supabaseAdmin
    .from("google_reviews")
    .select(
      "id,review_id,review_name,location_name,rating,update_time,create_time,user_id"
    )
    .eq("user_id", userId)
    .order("update_time", { ascending: true, nullsFirst: true })
    .limit(500);
  if (reviewsError) {
    return { processed: 0, inserted: 0, last_cursor: lastProcessed };
  }

  const { data: locationRows } = await supabaseAdmin
    .from("google_locations")
    .select("id,location_title,location_resource_name")
    .eq("user_id", userId);
  const locationMap = new Map<string, string>();
  for (const row of locationRows ?? []) {
    if (row.location_title) {
      locationMap.set(row.location_title, row.id);
    }
    if (row.location_resource_name) {
      locationMap.set(row.location_resource_name, row.id);
    }
  }

  let processed = 0;
  let inserted = 0;
  let latestTimestamp = lastProcessed ?? null;

  for (const review of reviews ?? []) {
    const reviewTimestamp = review.update_time ?? review.create_time ?? null;
    if (lastProcessed && reviewTimestamp && reviewTimestamp <= lastProcessed) {
      continue;
    }
    processed += 1;
    if (
      reviewTimestamp &&
      (!latestTimestamp || reviewTimestamp > latestTimestamp)
    ) {
      latestTimestamp = reviewTimestamp;
    }
    const reviewRating =
      typeof review.rating === "number" ? review.rating : null;
    const reviewId = review.review_id ?? review.review_name ?? review.id;
    if (!reviewId) continue;

    for (const workflow of workflows ?? []) {
      const scopedIds = workflow.location_ids ?? [];
      if (scopedIds.length > 0) {
        if (!review.location_name) continue;
        if (!scopedIds.includes(review.location_name)) {
          continue;
        }
      }

      const establishmentId = review.location_name
        ? locationMap.get(review.location_name) ?? null
        : null;
      if (!establishmentId) {
        continue;
      }

      const conditionsForWorkflow = workflowConditions.get(workflow.id) ?? [];
      let matches = true;
      for (const condition of conditionsForWorkflow) {
        if (condition.field !== "rating") continue;
        const target = Number(condition.value);
        if (Number.isNaN(target) || reviewRating === null) {
          matches = false;
          break;
        }
        if (condition.operator === "gte" && !(reviewRating >= target)) {
          matches = false;
        }
        if (condition.operator === "lte" && !(reviewRating <= target)) {
          matches = false;
        }
        if (condition.operator === "eq" && !(reviewRating === target)) {
          matches = false;
        }
        if (!matches) break;
      }

      if (!matches) continue;

      const ruleCode = `AUTO_${workflow.id}`;
      const alertType = "automation";
      const alertPayload = {
        message: "Condition automatique declenchee sur un nouvel avis.",
        rating: reviewRating,
        review_id: reviewId
      };

      const { error: insertError } = await supabaseAdmin
        .from("alerts")
        .insert(
          {
            user_id: userId,
            establishment_id: establishmentId,
            workflow_id: workflow.id,
            alert_type: alertType,
            rule_code: ruleCode,
            severity: "medium",
            review_id: reviewId,
            payload: alertPayload
          },
          {
            onConflict: "workflow_id,review_id,alert_type",
            ignoreDuplicates: true
          }
        );

      if (!insertError) {
        inserted += 1;
      }
    }
  }

  if (latestTimestamp) {
    await supabaseAdmin.from("cron_state").upsert({
      key: `automations_last_processed_at:${userId}`,
      value: { last_processed_at: latestTimestamp },
      updated_at: new Date().toISOString()
    });
  }

  return { processed, inserted, last_cursor: latestTimestamp };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    return sendError(
      res,
      requestId,
      {
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "Missing env"
      },
      500
    );
  }

  const cronSecret =
    typeof req.headers["x-cron-secret"] === "string"
      ? req.headers["x-cron-secret"]
      : null;
  const authHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : null;

  let userIds: string[] = [];

  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    const { data: workflowUsers, error: usersError } = await supabaseAdmin
      .from("automation_workflows")
      .select("user_id")
      .not("user_id", "is", null);
    if (usersError) {
      return sendError(
        res,
        requestId,
        { code: "INTERNAL", message: "Failed to load workflow users" },
        500
      );
    }
    userIds = Array.from(
      new Set((workflowUsers ?? []).map((row) => row.user_id))
    );
  } else if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    let authUser;
    try {
      authUser = await requireUser(req, res);
    } catch (error) {
      return sendError(
        res,
        requestId,
        { code: "UNAUTHORIZED", message: "Unauthorized" },
        401
      );
    }
    userIds = [authUser.id];
  } else {
    return sendError(
      res,
      requestId,
      { code: "UNAUTHORIZED", message: "Unauthorized" },
      401
    );
  }

  let processedUsers = 0;
  for (const userId of userIds) {
    await runAutomationsForUser(supabaseAdmin, userId);
    processedUsers += 1;
  }

  return res.status(200).json({ success: true, processedUsers });
}
