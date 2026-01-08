import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from '../../server/_shared/_auth.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth = await requireUser(req, res);
    if (!auth) {
      return;
    }
    const { userId, supabaseAdmin } = auth;

    let locationId = req.query.location_id;
    if (Array.isArray(locationId)) {
      locationId = locationId[0];
    }
    if (!locationId) {
      return res.status(400).json({ error: "Missing location_id" });
    }

    const { data: locationRow } = await supabaseAdmin
      .from("google_locations")
      .select("location_resource_name")
      .eq("user_id", userId)
      .eq("location_resource_name", locationId)
      .maybeSingle();
    if (!locationRow) {
      return res.status(404).json({ error: "Location not found" });
    }

    const importKey = `import_status_v1:${userId}:${locationId}`;
    const aiKey = `ai_status_v1:${userId}:${locationId}`;

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
      location_id: locationId,
      import: importStatus,
      ai: aiStatus
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load status" });
  }
}
