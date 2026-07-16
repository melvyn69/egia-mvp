import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_REQUESTS_PER_HOUR = 60;
const MAX_REQUESTS_PER_HOUR = 1000;

const getHourlyLimit = () => {
  const parsed = Number(process.env.AI_USER_REQUESTS_PER_HOUR ?? "");
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_REQUESTS_PER_HOUR;
  }
  return Math.min(parsed, MAX_REQUESTS_PER_HOUR);
};

const getAiQuotaBucket = (userId: string) =>
  createHash("sha256").update(`ai:user:${userId}`).digest("hex");

export const consumeAiUserQuota = async (
  supabaseAdmin: SupabaseClient,
  userId: string
) => {
  const { data, error } = await supabaseAdmin.rpc(
    "consume_security_rate_limit",
    {
      p_bucket_key: getAiQuotaBucket(userId),
      p_limit: getHourlyLimit(),
      p_window_seconds: 3600,
      p_cost: 1
    }
  );
  if (error) {
    throw new Error("ai_quota_unavailable");
  }
  return data === true;
};
