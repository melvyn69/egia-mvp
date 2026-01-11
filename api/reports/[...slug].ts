import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleGenerate from "../../server/reports/generate.js";

const routeReports = async (req: VercelRequest, res: VercelResponse) => {
  const slugParam = req.query?.slug;
  const parts = Array.isArray(slugParam)
    ? slugParam
    : slugParam
    ? [slugParam]
    : [];
  const route = parts.join("/");

  if (route === "generate") {
    return handleGenerate(req, res);
  }

  return res.status(404).json({ error: "Not found" });
};

export default routeReports;
