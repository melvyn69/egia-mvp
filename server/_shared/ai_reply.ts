type BrandVoiceConfig = {
  enabled: boolean;
  tone: "professional" | "friendly" | "warm" | "formal";
  language_level: "tutoiement" | "vouvoiement";
  context: string | null;
  use_emojis: boolean;
  forbidden_words: string[];
};

type GenerateAiReplyInput = {
  reviewText: string;
  rating: number | null;
  brandVoice: BrandVoiceConfig | null;
  overrideTone?: string | null;
  openaiApiKey: string;
  model: string;
  requestId?: string;
};

const normalizeBrandVoice = (
  brandVoice: BrandVoiceConfig | null
): BrandVoiceConfig => {
  if (!brandVoice || brandVoice.enabled === false) {
    return {
      enabled: false,
      tone: "professional",
      language_level: "vouvoiement",
      context: null,
      use_emojis: false,
      forbidden_words: []
    };
  }
  return {
    enabled: true,
    tone: brandVoice.tone ?? "professional",
    language_level: brandVoice.language_level ?? "vouvoiement",
    context: brandVoice.context ?? null,
    use_emojis: Boolean(brandVoice.use_emojis),
    forbidden_words: Array.isArray(brandVoice.forbidden_words)
      ? brandVoice.forbidden_words.filter(Boolean)
      : []
  };
};

const sanitizeForbiddenWords = (text: string, forbidden: string[]) => {
  if (!forbidden.length) {
    return text;
  }
  let result = text;
  forbidden.forEach((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, "");
  });
  return result.replace(/\s{2,}/g, " ").trim();
};

const stripEmojis = (text: string) =>
  text.replace(
    /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu,
    ""
  );

const resolveTone = (
  overrideTone: string | null | undefined,
  brandVoice: BrandVoiceConfig
): BrandVoiceConfig["tone"] => {
  if (
    overrideTone === "professional" ||
    overrideTone === "friendly" ||
    overrideTone === "warm" ||
    overrideTone === "formal"
  ) {
    return overrideTone;
  }
  return brandVoice.tone ?? "professional";
};

const extractOpenAiText = (payload: unknown) => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.output_text === "string" && record.output_text.trim()) {
      return record.output_text;
    }
    const outputItems = Array.isArray(record.output) ? record.output : [];
    const chunks: string[] = [];
    for (const item of outputItems) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const contentItems = Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as Array<Record<string, unknown>>)
        : [];
      for (const content of contentItems) {
        const text = typeof content?.text === "string" ? content.text : undefined;
        if (text) {
          chunks.push(text);
        }
      }
    }
    if (chunks.length) {
      return chunks.join("\n");
    }
  }
  return null;
};

const buildSystemPrompt = (params: {
  tone: BrandVoiceConfig["tone"];
  languageLevel: BrandVoiceConfig["language_level"];
  useEmojis: boolean;
  context: string | null;
  forbiddenWords: string[];
}) => {
  const rules = [
    "Tu es un expert en reponses aux avis Google pour une entreprise locale.",
    "Ne jamais inventer des details non presents.",
    "Pas de markdown, pas de liste, pas de puces.",
    "2 a 4 phrases maximum.",
    params.languageLevel === "tutoiement"
      ? "Utilise le tutoiement."
      : "Utilise le vouvoiement.",
    params.useEmojis ? "Emojis autorises avec moderation." : "Ne mets aucun emoji."
  ];
  if (params.context) {
    rules.push(
      "Integre le contexte suivant de facon naturelle sans le repeter mot a mot."
    );
  }
  if (params.forbiddenWords.length) {
    rules.push(
      `Evite absolument ces mots: ${params.forbiddenWords.join(", ")}.`
    );
  }
  return rules.join(" ");
};

const buildUserPrompt = (params: {
  reviewText: string;
  rating: number | null;
  tone: BrandVoiceConfig["tone"];
  context: string | null;
}) => {
  const parts = [
    `Avis: ${params.reviewText || "Avis sans commentaire."}`,
    `Note: ${params.rating ?? "inconnue"}`,
    `Ton souhaite: ${params.tone}`
  ];
  if (params.context) {
    parts.push(`Contexte: ${params.context}`);
  }
  return parts.join("\n");
};

const generateAiReply = async (input: GenerateAiReplyInput) => {
  const safeVoice = normalizeBrandVoice(input.brandVoice);
  const tone = resolveTone(input.overrideTone, safeVoice);
  const systemPrompt = buildSystemPrompt({
    tone,
    languageLevel: safeVoice.language_level,
    useEmojis: safeVoice.use_emojis,
    context: safeVoice.context,
    forbiddenWords: safeVoice.forbidden_words
  });
  const userPrompt = buildUserPrompt({
    reviewText: input.reviewText.trim(),
    rating: input.rating,
    tone,
    context: safeVoice.context
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`OpenAI error: ${txt.slice(0, 200)}`);
    }
    const payload = await response.json();
    const outputText = extractOpenAiText(payload);
    if (!outputText) {
      throw new Error("OpenAI response missing output");
    }
    let reply = outputText.trim();
    if (!safeVoice.use_emojis) {
      reply = stripEmojis(reply);
    }
    reply = sanitizeForbiddenWords(reply, safeVoice.forbidden_words);
    const cleaned = reply.replace(/\s{2,}/g, " ").trim();
    return cleaned.length > 0 ? cleaned : "Merci pour votre avis.";
  } finally {
    clearTimeout(timeout);
  }
};

export type { BrandVoiceConfig, GenerateAiReplyInput };
export { generateAiReply };
