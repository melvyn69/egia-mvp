import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSupabaseAdmin, getUserFromRequest } from "../google/_utils.js";

type CronStatus = {
  status: "ok" | "running" | "error" | "unknown";
  [key: string]: unknown;
};

const toStatus = (value: unknown): CronStatus => {
  if (value && typeof value === "object" && "status" in value) {
    return value as CronStatus;
  }
  return { status: "unknown" };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const { userId } = await getUserFromRequest(
      { headers: req.headers as Record<string, string | undefined> },
      supabaseAdmin
    );
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let locationId = req.query.location_id;
    if (Array.isArray(locationId)) {
      locationId = locationId[0];
    }
    if (!locationId) {
      const { data: locationRow } = await supabaseAdmin
        .from("google_locations")
        .select("location_resource_name")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      locationId = locationRow?.location_resource_name ?? null;
    }

    if (!locationId) {
      return res.status(404).json({ error: "Location not found" });
    }

    const importKey = `gmb_import_status:${locationId}`;
    const aiKey = `ai_tags_status:${locationId}`;

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

    const importStatus = toStatus(importState?.value);
    const aiStatus = toStatus(aiState?.value);

    return res.status(200).json({
      import: importStatus,
      ai: aiStatus
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load status" });
  }
}
