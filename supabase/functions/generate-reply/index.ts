// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient
} from "https://esm.sh/@supabase/supabase-js@2";

type GenerateReplyPayload = {
  businessId?: string;
  reviewText?: string;
  reviewId?: string;
  rating?: number;
  authorName?: string;
  businessName?: string;
  locationName?: string;
  platform?: string;
  source?: string;
  tone?: string;
  length?: string;
  memory?: string[];
  signature?: string;
};

type BusinessMemoryRow = {
  id: string;
  kind: string;
  content: string;
  business_id: string;
  user_id: string | null;
  created_at: string;
};

type BusinessSettingsRow = {
  business_id: string;
  user_id: string | null;
  business_name: string;
  default_tone: string;
  default_length: string;
  signature: string | null;
  do_not_say: string | null;
  preferred_phrases: string | null;
  updated_at: string;
};

const configuredOrigin = (() => {
  const value = Deno.env.get("ALLOWED_ORIGIN") ?? Deno.env.get("APP_BASE_URL") ?? "";
  try {
    return new URL(value).origin;
  } catch {
    return "https://egia-six.vercel.app";
  }
})();

const corsHeaders = {
  "Access-Control-Allow-Origin": configuredOrigin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_REVIEW_TEXT_LENGTH = 1200;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const APP_GLOBAL = "00000000-0000-0000-0000-000000000001";
const DEBUG_MEMORY = Deno.env.get("DEBUG_MEMORY") === "true";

const buildUserPrompt = (payload: GenerateReplyPayload): string => {
  const parts = [
    `Avis: ${payload.reviewText ?? ""}`,
    `Note: ${payload.rating ?? ""}`,
    `Auteur: ${payload.authorName ?? ""}`,
    `Lieu: ${payload.locationName ?? payload.businessName ?? ""}`,
    `Plateforme: ${payload.source ?? payload.platform ?? ""}`,
    `Ton souhaité: ${payload.tone ?? ""}`,
    `Longueur souhaitée: ${payload.length ?? ""}`
  ];
  return parts.join("\n");
};

const dedupeByPriority = <T,>(
  items: T[],
  getKey: (item: T) => string,
  getPriority: (item: T) => number,
  getTimestamp: (item: T) => number
): T[] => {
  const sorted = items.slice().sort((a, b) => {
    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return getTimestamp(b) - getTimestamp(a);
  });
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of sorted) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

const getMemoryPriority = (
  row: BusinessMemoryRow,
  businessId: string,
  userId: string
): number => {
  if (row.business_id === businessId && row.user_id === userId) {
    return 0;
  }
  if (row.business_id === businessId && row.user_id === null) {
    return 1;
  }
  if (row.business_id === APP_GLOBAL && row.user_id === null) {
    return 2;
  }
  return 99;
};

const getSettingsPriority = (
  row: BusinessSettingsRow,
  businessId: string,
  userId: string
): number => {
  if (row.business_id === businessId && row.user_id === userId) {
    return 0;
  }
  if (row.business_id === businessId && row.user_id === null) {
    return 1;
  }
  if (row.business_id === APP_GLOBAL && row.user_id === null) {
    return 2;
  }
  return 99;
};

const getEffectiveBusinessMemory = async (
  supabase: SupabaseClient<any>,
  businessId: string,
  userId: string
): Promise<BusinessMemoryRow[]> => {
  const { data, error } = await supabase
    .from("business_memory")
    .select("id,kind,content,business_id,user_id,created_at")
    .in("business_id", [businessId, APP_GLOBAL])
    .eq("is_active", true);
  if (error || !data) {
    if (DEBUG_MEMORY) {
      console.debug("memory: query error", error?.message ?? "unknown");
    }
    return [];
  }
  const rows = data as unknown as BusinessMemoryRow[];
  const filtered = rows.filter(
    (row) => row.user_id === userId || row.user_id === null
  ) as BusinessMemoryRow[];
  return dedupeByPriority(
    filtered,
    (row) => `${row.kind}::${row.content}`,
    (row) => getMemoryPriority(row, businessId, userId),
    (row) => new Date(row.created_at).getTime()
  );
};

const getEffectiveBusinessSettings = async (
  supabase: SupabaseClient<any>,
  businessId: string,
  userId: string
): Promise<BusinessSettingsRow | null> => {
  const { data, error } = await supabase
    .from("business_settings")
    .select(
      "business_id,user_id,business_name,default_tone,default_length,signature,do_not_say,preferred_phrases,updated_at"
    )
    .in("business_id", [businessId, APP_GLOBAL]);
  if (error || !data) {
    if (DEBUG_MEMORY) {
      console.debug("settings: query error", error?.message ?? "unknown");
    }
    return null;
  }
  const rows = data as unknown as BusinessSettingsRow[];
  const filtered = rows.filter(
    (row) => row.user_id === userId || row.user_id === null
  ) as BusinessSettingsRow[];
  const sorted = filtered
    .slice()
    .sort((a, b) => {
      const priorityDiff =
        getSettingsPriority(a, businessId, userId) -
        getSettingsPriority(b, businessId, userId);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  return sorted[0] ?? null;
};

const buildMemoryBlock = (rows: BusinessMemoryRow[]): string => {
  if (rows.length === 0) {
    return "";
  }
  const grouped: Record<string, string[]> = {
    style: [],
    rule: [],
    note: []
  };
  rows.forEach((row) => {
    const key = row.kind.toLowerCase();
    if (key === "style") {
      grouped.style.push(row.content);
    } else if (key === "rule") {
      grouped.rule.push(row.content);
    } else {
      grouped.note.push(row.content);
    }
  });
  const lines: string[] = ["MEMORY (à respecter) :"];
  if (grouped.style.length > 0) {
    lines.push(`- STYLE: ${grouped.style.join(" | ")}`);
  }
  if (grouped.rule.length > 0) {
    lines.push(`- RULES: ${grouped.rule.join(" | ")}`);
  }
  if (grouped.note.length > 0) {
    lines.push(`- NOTES: ${grouped.note.join(" | ")}`);
  }
  return lines.join("\n");
};

const buildSettingsBlock = (settings: BusinessSettingsRow | null): string => {
  if (!settings) {
    return "";
  }
  const lines = ["SETTINGS :"];
  if (settings.default_tone) {
    lines.push(`- TONE: ${settings.default_tone}`);
  }
  if (settings.default_length) {
    lines.push(`- LENGTH: ${settings.default_length}`);
  }
  if (settings.signature) {
    lines.push(`- SIGNATURE: ${settings.signature}`);
  }
  if (settings.do_not_say) {
    lines.push(`- DO_NOT_SAY: ${settings.do_not_say}`);
  }
  if (settings.preferred_phrases) {
    lines.push(`- PREFERRED_PHRASES: ${settings.preferred_phrases}`);
  }
  return lines.join("\n");
};

const getClientIp = (req: Request): string => {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
};

const jsonWithCors = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (req.method !== "POST") {
    return jsonWithCors(405, { error: "Method not allowed", requestId });
  }

  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const userToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonWithCors(500, { error: "Server misconfigured", requestId });
  }
  if (!userToken) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
  const { data: authData, error: authError } =
    await supabaseAuth.auth.getUser(userToken);
  const userId = authData?.user?.id ?? null;
  if (authError || !userId) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  const ip = getClientIp(req);
  const apiKeyHeader = req.headers.get("apikey");
  if (!apiKeyHeader) {
    return jsonWithCors(401, { error: "Unauthorized", requestId });
  }

  const now = Date.now();
  const rateEntry = rateLimitMap.get(ip);
  if (rateEntry && now < rateEntry.resetAt && rateEntry.count >= RATE_LIMIT_MAX) {
    console.log(
      JSON.stringify({
        requestId,
        method: req.method,
        ip,
        userId,
        status: 429,
        reason: "rate_limit"
      })
    );
    return jsonWithCors(429, { error: "Rate limit", requestId });
  }
  const nextReset =
    rateEntry && now < rateEntry.resetAt
      ? rateEntry.resetAt
      : now + RATE_LIMIT_WINDOW_MS;
  const nextCount =
    rateEntry && now < rateEntry.resetAt
      ? rateEntry.count + 1
      : 1;
  rateLimitMap.set(ip, { count: nextCount, resetAt: nextReset });

  try {
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return jsonWithCors(400, { error: "Invalid JSON body", requestId });
    }
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return jsonWithCors(400, { error: "Invalid JSON body", requestId });
    }
    if (new TextEncoder().encode(JSON.stringify(rawPayload)).byteLength > MAX_REQUEST_BYTES) {
      return jsonWithCors(413, { error: "Payload too large", requestId });
    }

    const payload = rawPayload as GenerateReplyPayload;
    const businessId =
      typeof payload.businessId === "string" ? payload.businessId.trim() : "";
    const reviewText =
      typeof payload.reviewText === "string" ? payload.reviewText.trim() : "";
    const boundedTextFields: Array<[unknown, number]> = [
      [payload.reviewId, 2048],
      [payload.authorName, 256],
      [payload.businessName, 256],
      [payload.locationName, 256],
      [payload.platform, 64],
      [payload.source, 64],
      [payload.tone, 64],
      [payload.length, 64],
      [payload.signature, 512]
    ];
    if (
      boundedTextFields.some(
        ([value, limit]) =>
          value !== undefined &&
          (typeof value !== "string" || value.length > limit)
      ) ||
      (payload.memory !== undefined &&
        (!Array.isArray(payload.memory) ||
          payload.memory.length > 10 ||
          payload.memory.some(
            (item) => typeof item !== "string" || item.length > 512
          )))
    ) {
      return jsonWithCors(400, { error: "Invalid payload fields", requestId });
    }

    if (!businessId) {
      return jsonWithCors(400, { error: "Missing businessId.", requestId });
    }
    if (businessId !== userId) {
      return jsonWithCors(403, { error: "Forbidden", requestId });
    }
    if (reviewText.length > MAX_REVIEW_TEXT_LENGTH) {
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          ip,
          userId,
          reviewId: payload.reviewId ?? null,
          status: 400,
          reason: "reviewText_too_long"
        })
      );
      return jsonWithCors(400, { error: "Review text too long", requestId });
    }

    if (
      !reviewText ||
      typeof payload.rating !== "number" ||
      !Number.isFinite(payload.rating) ||
      payload.rating < 1 ||
      payload.rating > 5
    ) {
      return jsonWithCors(400, {
        error: "Missing required fields: reviewText, rating.",
        requestId
      });
    }
    const normalizedPayload: GenerateReplyPayload = {
      ...payload,
      businessId,
      reviewText
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonWithCors(500, { error: "OpenAI key missing.", requestId });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("authorization") ?? ""
        }
      }
    });

    const effectiveUserId = userId;
    const memoryRows =
      effectiveUserId === ""
        ? []
        : await getEffectiveBusinessMemory(
            supabase,
            businessId,
            effectiveUserId
          );
    const settingsRow =
      effectiveUserId === ""
        ? null
        : await getEffectiveBusinessSettings(
            supabase,
            businessId,
            effectiveUserId
          );

    if (DEBUG_MEMORY) {
      console.debug("memory rows:", memoryRows.length);
      console.debug("settings row:", settingsRow?.business_name ?? "none");
    }

    const memoryBlock =
      memoryRows.length > 0 ? buildMemoryBlock(memoryRows) : "";
    const settingsBlock = buildSettingsBlock(settingsRow);
    const signatureBlock = settingsRow?.signature
      ? `Signature: ${settingsRow.signature}`
      : "";
    const systemPrompt = [
      memoryBlock,
      settingsBlock,
      "Tu rédiges des réponses aux avis clients. Réponds en français, ton professionnel, poli et concis. Ne mentionne jamais l'IA ni un remboursement. Personnalise avec le prénom et le lieu si disponibles. Remercie et invite à revenir. Adapte la réponse à la note.",
      signatureBlock
    ]
      .filter(Boolean)
      .join("\n");

    const requestBody = (model: string) =>
      JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(normalizedPayload) }]
          }
        ]
      });

    const requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    };

    const openAiStart = Date.now();
    let response = await fetch("https://api.openai.com/v1/responses", {
      ...requestInit,
      body: requestBody("gpt-5-mini")
    });

    if (response.status === 404) {
      response = await fetch("https://api.openai.com/v1/responses", {
        ...requestInit,
        body: requestBody("gpt-5")
      });
    }

    const openAiDurationMs = Date.now() - openAiStart;
    if (!response.ok) {
      await response.body?.cancel();
      console.error("OpenAI request failed", { requestId, status: response.status });
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          ip,
          userId,
          reviewId: payload.reviewId ?? null,
          status: 500,
          openAiDurationMs
        })
      );
      return jsonWithCors(500, { error: "OpenAI request failed.", requestId });
    }

    const json = await response.json();
    const reply =
      json.output_text ??
      json.output?.flatMap((o: any) => o.content ?? [])
        ?.find((c: any) => c.type === "output_text")?.text;

    if (!reply) {
      console.error("OpenAI response missing output", { requestId });
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          ip,
          userId,
          reviewId: payload.reviewId ?? null,
          status: 500,
          openAiDurationMs
        })
      );
      return jsonWithCors(500, { error: "OpenAI request failed.", requestId });
    }

    console.log(
      JSON.stringify({
        requestId,
        method: req.method,
        ip,
        userId,
        reviewId: payload.reviewId ?? null,
        status: 200,
        openAiDurationMs
      })
    );
    return jsonWithCors(200, { reply, requestId });
  } catch (error) {
    console.error("generate-reply failed", {
      requestId,
      error: error instanceof Error ? error.name : "unknown"
    });
    console.log(
      JSON.stringify({
        requestId,
        method: req.method,
        ip: getClientIp(req),
        userId,
        status: 500
      })
    );
    return jsonWithCors(500, { error: "OpenAI request failed.", requestId });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-reply' \
    --header 'Authorization: Bearer <local-user-jwt>' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
