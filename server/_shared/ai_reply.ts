import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

type BrandVoiceRow = Database["public"]["Tables"]["brand_voice"]["Row"];
type BrandVoiceTone = Database["public"]["Enums"]["brand_voice_tone"];
type BrandVoiceLanguageLevel = Database["public"]["Enums"]["brand_voice_language_level"];

type BrandVoiceLike = Pick<
  BrandVoiceRow,
  | "id"
  | "enabled"
  | "tone"
  | "language_level"
  | "context"
  | "use_emojis"
  | "forbidden_words"
>;

type BusinessSettingsRow = Database["public"]["Tables"]["business_settings"]["Row"];

export type AiIdentityMeta = {
  ai_identity_applied: boolean;
  ai_identity_id: string | null;
  ai_identity_hash: string;
};

type AiIdentitySource = "location" | "user" | "default" | "override";

type ResolvedAiIdentity = {
  identityId: string | null;
  source: AiIdentitySource;
  enabled: boolean;
  tone: BrandVoiceTone;
  languageLevel: BrandVoiceLanguageLevel;
  context: string | null;
  useEmojis: boolean;
  forbiddenWords: string[];
};

type GenerateAiReplyParams = {
  reviewText: string;
  rating: number | null;
  userId: string;
  locationId?: string | null;
  supabaseAdmin?: SupabaseClient<Database>;
  allowIdentityOverride?: boolean;
  brandVoiceOverride?: Partial<BrandVoiceLike> | null;
  businessTone?: string | null;
  signature?: string | null;
  insights?: {
    sentiment?: string | null;
    score?: number | null;
    summary?: string | null;
    tags?: string[];
  } | null;
  openaiApiKey: string;
  model: string;
  requestId?: string;
  strictIdentity?: boolean;
};

export type GenerateAiReplyResult = {
  replyText: string;
  meta: AiIdentityMeta;
};

export class MissingAiIdentityError extends Error {
  readonly code = "missing_ai_identity";
  readonly meta: AiIdentityMeta;

  constructor(message: string, meta: AiIdentityMeta) {
    super(message);
    this.name = "MissingAiIdentityError";
    this.meta = meta;
  }
}

const DEFAULT_REPLY = "Merci pour votre avis.";

const toneMap: Record<string, string> = {
  professional: "professionnel",
  friendly: "amical",
  warm: "chaleureux",
  formal: "formel"
};

const normalizeTone = (value: string | null | undefined): BrandVoiceTone => {
  if (
    value === "professional" ||
    value === "friendly" ||
    value === "warm" ||
    value === "formal"
  ) {
    return value;
  }
  return "professional";
};

const normalizeLanguageLevel = (
  value: string | null | undefined
): BrandVoiceLanguageLevel => {
  if (value === "tutoiement" || value === "vouvoiement") {
    return value;
  }
  return "vouvoiement";
};

const normalizeForbiddenWords = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
};

const stripEmojis = (text: string) =>
  text.replace(/[\p{Extended_Pictographic}]/gu, "");

const applyForbiddenWords = (text: string, forbidden: string[]) => {
  return forbidden.reduce((acc, word) => {
    if (!word) return acc;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return acc.replace(new RegExp(escaped, "gi"), "").trim();
  }, text);
};

const getSharedSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role env for ai_reply");
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
};

const fetchBusinessSettings = async (
  supabaseAdmin: SupabaseClient<Database>,
  userId: string
): Promise<Pick<BusinessSettingsRow, "default_tone" | "signature"> | null> => {
  const { data: byUser } = await supabaseAdmin
    .from("business_settings")
    .select("default_tone, signature")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser) {
    return byUser;
  }
  const { data: byBusiness } = await supabaseAdmin
    .from("business_settings")
    .select("default_tone, signature")
    .eq("business_id", userId)
    .maybeSingle();
  return byBusiness ?? null;
};

const hashAiIdentity = (identity: ResolvedAiIdentity) => {
  const payload = JSON.stringify({
    source: identity.source,
    id: identity.identityId,
    enabled: identity.enabled,
    tone: identity.tone,
    language_level: identity.languageLevel,
    context: identity.context ?? "",
    use_emojis: identity.useEmojis,
    forbidden_words: identity.forbiddenWords
  });
  return createHash("sha256").update(payload).digest("hex");
};

const toAiIdentityMeta = (identity: ResolvedAiIdentity): AiIdentityMeta => ({
  ai_identity_applied: identity.enabled,
  ai_identity_id: identity.identityId,
  ai_identity_hash: hashAiIdentity(identity)
});

const resolveDbAiIdentity = async (params: {
  supabaseAdmin: SupabaseClient<Database>;
  userId: string;
  locationId: string | null;
  fallbackTone: string | null;
  strictIdentity: boolean;
}): Promise<ResolvedAiIdentity> => {
  const { supabaseAdmin, userId, locationId, fallbackTone, strictIdentity } = params;
  const selectFields =
    "id, enabled, tone, language_level, context, use_emojis, forbidden_words";

  try {
    if (locationId) {
      const { data: locationRow, error: locationError } = await supabaseAdmin
        .from("brand_voice")
        .select(selectFields)
        .eq("user_id", userId)
        .eq("location_id", locationId)
        .maybeSingle();
      if (locationError) {
        throw new Error(locationError.message ?? "brand_voice location lookup failed");
      }
      if (locationRow) {
        return {
          identityId: locationRow.id,
          source: "location",
          enabled: Boolean(locationRow.enabled),
          tone: normalizeTone(locationRow.tone),
          languageLevel: normalizeLanguageLevel(locationRow.language_level),
          context: locationRow.context?.trim() ?? null,
          useEmojis: Boolean(locationRow.use_emojis),
          forbiddenWords: normalizeForbiddenWords(locationRow.forbidden_words)
        };
      }
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("brand_voice")
      .select(selectFields)
      .eq("user_id", userId)
      .is("location_id", null)
      .maybeSingle();
    if (userError) {
      throw new Error(userError.message ?? "brand_voice user lookup failed");
    }
    if (userRow) {
      return {
        identityId: userRow.id,
        source: "user",
        enabled: Boolean(userRow.enabled),
        tone: normalizeTone(userRow.tone),
        languageLevel: normalizeLanguageLevel(userRow.language_level),
        context: userRow.context?.trim() ?? null,
        useEmojis: Boolean(userRow.use_emojis),
        forbiddenWords: normalizeForbiddenWords(userRow.forbidden_words)
      };
    }
  } catch (error) {
    if (strictIdentity) {
      throw new MissingAiIdentityError(
        "missing_ai_identity",
        toAiIdentityMeta({
          identityId: null,
          source: "default",
          enabled: false,
          tone: normalizeTone(fallbackTone),
          languageLevel: "vouvoiement",
          context: null,
          useEmojis: false,
          forbiddenWords: []
        })
      );
    }
    console.error("[ai_reply] brand_voice lookup failed", {
      userId,
      locationId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }

  return {
    identityId: null,
    source: "default",
    enabled: false,
    tone: normalizeTone(fallbackTone),
    languageLevel: "vouvoiement",
    context: null,
    useEmojis: false,
    forbiddenWords: []
  };
};

const resolveAiIdentity = async (params: {
  supabaseAdmin: SupabaseClient<Database>;
  userId: string;
  locationId: string | null;
  fallbackTone: string | null;
  allowIdentityOverride: boolean;
  brandVoiceOverride: Partial<BrandVoiceLike> | null;
  strictIdentity: boolean;
}): Promise<ResolvedAiIdentity> => {
  if (params.allowIdentityOverride && params.brandVoiceOverride) {
    return {
      identityId:
        typeof params.brandVoiceOverride.id === "string"
          ? params.brandVoiceOverride.id
          : null,
      source: "override",
      enabled: Boolean(params.brandVoiceOverride.enabled),
      tone: normalizeTone(params.brandVoiceOverride.tone),
      languageLevel: normalizeLanguageLevel(
        params.brandVoiceOverride.language_level
      ),
      context:
        typeof params.brandVoiceOverride.context === "string"
          ? params.brandVoiceOverride.context.trim()
          : null,
      useEmojis: Boolean(params.brandVoiceOverride.use_emojis),
      forbiddenWords: normalizeForbiddenWords(
        params.brandVoiceOverride.forbidden_words
      )
    };
  }

  return resolveDbAiIdentity({
    supabaseAdmin: params.supabaseAdmin,
    userId: params.userId,
    locationId: params.locationId,
    fallbackTone: params.fallbackTone,
    strictIdentity: params.strictIdentity
  });
};

type PromptContext = {
  system: string;
  user: string;
  useEmojis: boolean;
  forbiddenWords: string[];
  aiIdentity: ResolvedAiIdentity;
  meta: AiIdentityMeta;
};

export const buildPromptContext = async ({
  reviewText,
  rating,
  userId,
  locationId,
  supabaseAdmin,
  allowIdentityOverride,
  brandVoiceOverride,
  businessTone,
  signature,
  insights,
  requestId,
  strictIdentity
}: Pick<
  GenerateAiReplyParams,
  | "reviewText"
  | "rating"
  | "userId"
  | "locationId"
  | "supabaseAdmin"
  | "allowIdentityOverride"
  | "brandVoiceOverride"
  | "businessTone"
  | "signature"
  | "insights"
  | "requestId"
  | "strictIdentity"
>): Promise<PromptContext> => {
  const sb = supabaseAdmin ?? getSharedSupabaseAdmin();
  const businessSettings =
    businessTone !== undefined || signature !== undefined
      ? { default_tone: businessTone ?? null, signature: signature ?? null }
      : await fetchBusinessSettings(sb, userId);
  const effectiveBusinessTone = businessSettings?.default_tone ?? null;
  const effectiveSignature = businessSettings?.signature ?? null;
  const aiIdentity = await resolveAiIdentity({
    supabaseAdmin: sb,
    userId,
    locationId: locationId ?? null,
    fallbackTone: effectiveBusinessTone,
    allowIdentityOverride: Boolean(allowIdentityOverride),
    brandVoiceOverride: brandVoiceOverride ?? null,
    strictIdentity: Boolean(strictIdentity)
  });
  const toneKey = aiIdentity.enabled
    ? aiIdentity.tone
    : normalizeTone(effectiveBusinessTone);
  const toneLabel = toneMap[toneKey] ?? toneKey;
  const languageLevel = aiIdentity.enabled
    ? aiIdentity.languageLevel
    : "vouvoiement";
  const context = aiIdentity.enabled ? aiIdentity.context?.trim() : null;
  const useEmojis = aiIdentity.enabled ? aiIdentity.useEmojis : false;
  const forbiddenWords = aiIdentity.enabled ? aiIdentity.forbiddenWords : [];
  const signatureText = effectiveSignature?.trim() ?? "";
  const insightsSummary =
    insights && (insights.summary || (insights.tags && insights.tags.length > 0))
      ? [
          insights.sentiment ? `Sentiment: ${insights.sentiment}.` : "",
          typeof insights.score === "number"
            ? `Score: ${insights.score.toFixed(2)}.`
            : "",
          insights.summary ? `Resume: ${insights.summary}` : "",
          insights.tags && insights.tags.length
            ? `Tags: ${insights.tags.join(", ")}.`
            : ""
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const system = [
    "Tu es un expert en e-reputation.",
    "Tu rediges une reponse courte a un avis Google.",
    "Ne jamais inventer de details ou de causes.",
    "2 a 4 phrases maximum.",
    "Reponds dans la langue de l'avis, francais par defaut.",
    "N'evoque jamais l'analyse interne ou le score.",
    useEmojis ? "Les emojis sont autorises." : "N'utilise aucun emoji."
  ].join(" ");

  const user = [
    `Avis: """${reviewText.trim()}"""`,
    rating !== null ? `Note: ${rating}/5.` : "Note: inconnue.",
    `Ton souhaite: ${toneLabel}.`,
    `Niveau de langage: ${languageLevel}.`,
    context ? `Contexte a integrer: ${context}` : "",
    insightsSummary ? `Insights IA: ${insightsSummary}` : "",
    signatureText ? `Signature souhaitee: ${signatureText}` : "",
    forbiddenWords.length ? `Mots interdits: ${forbiddenWords.join(", ")}.` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const meta = toAiIdentityMeta(aiIdentity);
  console.log("[ai_reply] ai_identity", {
    requestId: requestId ?? null,
    userId,
    locationId: locationId ?? null,
    identityId: meta.ai_identity_id,
    hash: meta.ai_identity_hash,
    tone: aiIdentity.tone,
    languageLevel: aiIdentity.languageLevel,
    bannedWordsCount: aiIdentity.forbiddenWords.length,
    allowEmojis: aiIdentity.useEmojis,
    applied: aiIdentity.enabled,
    source: aiIdentity.source
  });

  return {
    system,
    user,
    useEmojis,
    forbiddenWords,
    aiIdentity,
    meta
  };
};

export const isMissingAiIdentityError = (
  error: unknown
): error is MissingAiIdentityError =>
  error instanceof MissingAiIdentityError ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "missing_ai_identity");

export const generateAiReply = async ({
  reviewText,
  rating,
  userId,
  locationId,
  supabaseAdmin,
  allowIdentityOverride,
  brandVoiceOverride,
  businessTone,
  signature,
  insights,
  openaiApiKey,
  model,
  requestId,
  strictIdentity
}: GenerateAiReplyParams): Promise<GenerateAiReplyResult> => {
  const { system, user, useEmojis, forbiddenWords, meta } = await buildPromptContext({
    reviewText,
    rating,
    userId,
    locationId,
    supabaseAdmin,
    allowIdentityOverride,
    brandVoiceOverride,
    businessTone,
    signature,
    insights,
    requestId,
    strictIdentity
  });

  if (!openaiApiKey) {
    return { replyText: DEFAULT_REPLY, meta };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.6,
        max_tokens: 220,
        user: requestId
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error: ${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } | null }>;
    };
    const reply = json?.choices?.[0]?.message?.content?.trim() ?? "";
    const sanitized = applyForbiddenWords(
      useEmojis ? reply : stripEmojis(reply),
      forbiddenWords
    );
    return { replyText: sanitized || DEFAULT_REPLY, meta };
  } finally {
    clearTimeout(timeout);
  }
};
