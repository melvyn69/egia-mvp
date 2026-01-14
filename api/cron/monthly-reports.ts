import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleMonthlyReports from "../../server/_shared/handlers/cron/monthly-reports";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  const provided = String(
    (req.headers["x-cron-secret"] as string | undefined) ?? ""
  ).trim();
  if (!expected || !provided || provided !== expected) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  return handleMonthlyReports(req, res);
}
