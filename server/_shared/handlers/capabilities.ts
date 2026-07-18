import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getAppleWalletRuntimeConfig,
  readProcessEnvironment,
  type EnvironmentReader
} from "../apple_wallet_config";
import { getRequestId, sendError } from "../api_utils";

export const createCapabilitiesHandler = (
  readEnvironment: EnvironmentReader = readProcessEnvironment
) => (req: VercelRequest, res: VercelResponse) => {
  const requestId = getRequestId(req);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");

  if (req.method !== "GET") {
    return sendError(
      res,
      requestId,
      { code: "BAD_REQUEST", message: "Method not allowed" },
      405
    );
  }

  const config = getAppleWalletRuntimeConfig(readEnvironment);
  return res.status(200).json({
    ok: true,
    data: {
      appleWalletEnabled: config.appleWalletEnabled
    },
    requestId
  });
};

export default createCapabilitiesHandler();
