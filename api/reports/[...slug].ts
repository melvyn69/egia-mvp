import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleGenerateClassic from "../../server/_shared_dist/handlers/reports/generate.js";
import handleGeneratePremium from "../../server/_shared_dist/handlers/reports/generate_html.js";

const getRouteParts = (req: VercelRequest) => {
  const raw =
    (req.query as Record<string, unknown>)?.["...slug"] ??
    (req.query as Record<string, unknown>)?.slug ??
    (req.query as Record<string, unknown>)?.["slug[]"];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map(String);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRouteParts(req).join("/");
  if (route === "generate") {
    return handleGenerateClassic(req, res);
  }
  if (route === "generate_html") {
    return handleGeneratePremium(req, res);
  }
  return res.status(404).json({ error: "Not found" });
}
