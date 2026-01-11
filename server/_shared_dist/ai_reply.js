const DEFAULT_REPLY = "Merci pour votre avis.";
const toneMap = {
    professional: "professionnel",
    friendly: "amical",
    warm: "chaleureux",
    formal: "formel"
};
const stripEmojis = (text) => text.replace(/[\p{Extended_Pictographic}]/gu, "");
const applyForbiddenWords = (text, forbidden) => {
    return forbidden.reduce((acc, word) => {
        if (!word)
            return acc;
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return acc.replace(new RegExp(escaped, "gi"), "").trim();
    }, text);
};
export const generateAiReply = async ({ reviewText, rating, brandVoice, overrideTone, businessTone, signature, insights, openaiApiKey, model, requestId }) => {
    if (!openaiApiKey) {
        return DEFAULT_REPLY;
    }
    const enabled = brandVoice?.enabled ?? false;
    const toneKey = overrideTone ??
        businessTone ??
        (enabled ? brandVoice?.tone : null) ??
        "professional";
    const toneLabel = toneMap[toneKey] ?? toneKey;
    const languageLevel = enabled
        ? brandVoice?.language_level ?? "vouvoiement"
        : "vouvoiement";
    const context = enabled ? brandVoice?.context?.trim() : null;
    const useEmojis = enabled ? Boolean(brandVoice?.use_emojis) : false;
    const forbiddenWords = enabled ? brandVoice?.forbidden_words ?? [] : [];
    const signatureText = signature?.trim() ?? "";
    const insightsSummary = insights && (insights.summary || (insights.tags && insights.tags.length > 0))
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
        const json = await response.json();
        const reply = json?.choices?.[0]?.message?.content?.trim() ?? "";
        const sanitized = applyForbiddenWords(useEmojis ? reply : stripEmojis(reply), forbiddenWords);
        return sanitized || DEFAULT_REPLY;
    }
    finally {
        clearTimeout(timeout);
    }
};
