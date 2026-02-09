import {
    type AiSentiment,
    type AiTagRow,
    type LengthPreset,
    type ReviewCronStatus,
    type ReviewStatus,
    type TonePreset
} from "./types";

export const isReviewStatus = (value: string | null | undefined): value is ReviewStatus =>
    value === "new" ||
    value === "reading" ||
    value === "replied" ||
    value === "archived";

export const isAiSentiment = (value: unknown): value is AiSentiment =>
    value === "positive" || value === "neutral" || value === "negative";

export const asNumber = (value: unknown): number =>
    typeof value === "number" ? value : 0;

export const isTonePreset = (value: string | null | undefined): value is TonePreset =>
    value === "professionnel" || value === "amical" || value === "empathique";

export const isLengthPreset = (
    value: string | null | undefined
): value is LengthPreset =>
    value === "court" || value === "moyen" || value === "long";

export const statusLabelMap: Record<ReviewStatus, string> = {
    new: "Nouveau",
    reading: "À traiter",
    replied: "Répondu",
    archived: "Ignoré"
};

export const statusVariantMap: Record<ReviewStatus, "warning" | "success" | "neutral"> = {
    new: "warning",
    reading: "warning",
    replied: "success",
    archived: "neutral"
};

export const aiSentimentLabelMap: Record<AiSentiment, string> = {
    positive: "Positif",
    neutral: "Neutre",
    negative: "Négatif"
};

export const aiSentimentVariantMap: Record<AiSentiment, "success" | "neutral" | "warning"> =
{
    positive: "success",
    neutral: "neutral",
    negative: "warning"
};

export const lengthOptions: Array<{ id: LengthPreset; label: string }> = [
    { id: "court", label: "Court" },
    { id: "moyen", label: "Moyen" },
    { id: "long", label: "Long" }
];

export const toneOptions: Array<{ id: TonePreset; label: string }> = [
    { id: "professionnel", label: "Professionnel" },
    { id: "amical", label: "Amical" },
    { id: "empathique", label: "Empathique" }
];

export const initialActivityEvents = [
    {
        id: "a1",
        label: "Réponse automatique enregistrée",
        timestamp: "Il y a 12 min"
    },
    { id: "a2", label: "Avis assigné à Lucie", timestamp: "Il y a 1 h" },
    { id: "a3", label: "Tag “Service” ajouté", timestamp: "Hier" }
];

export const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
};

export const normalizeSentiment = (value: unknown): AiSentiment | null => {
    if (value === "positive" || value === "neutral" || value === "negative") {
        return value;
    }
    return null;
};

export const asOne = <T,>(value: T | T[] | null | undefined): T | null => {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }
    return value ?? null;
};

export const getInsight = (record: {
    review_ai_insights?:
    | {
        sentiment?: string | null;
        sentiment_score?: number | null;
        summary?: string | null;
    }
    | Array<{
        sentiment?: string | null;
        sentiment_score?: number | null;
        summary?: string | null;
    }>
    | null;
}) => {
    const insight = asOne(record.review_ai_insights);
    if (!insight) {
        return null;
    }
    return {
        sentiment: normalizeSentiment(insight.sentiment),
        score:
            typeof insight.sentiment_score === "number"
                ? insight.sentiment_score
                : null,
        summary: typeof insight.summary === "string" ? insight.summary : null
    };
};

export const getTags = (record: {
    review_ai_tags?: Array<{ ai_tags?: AiTagRow | null }> | null;
}) => {
    if (!Array.isArray(record.review_ai_tags)) {
        return [];
    }
    return record.review_ai_tags
        .map((tagRow) => {
            const tagRecord = tagRow?.ai_tags as AiTagRow | null | undefined;
            return {
                tag: typeof tagRecord?.tag === "string" ? tagRecord.tag : null,
                category:
                    typeof tagRecord?.category === "string" ? tagRecord.category : null
            };
        })
        .filter((tag): tag is { tag: string; category: string | null } => !!tag.tag);
};

export const COOLDOWN_MS = 30000;

export const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getProjectRef = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }
    try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        return host.split(".")[0] ?? null;
    } catch {
        return null;
    }
};

export const maskToken = (token?: string | null): string => {
    if (!token) {
        return "—";
    }
    return `${token.slice(0, 12)}...`;
};

export const getRatingPreset = (
    rating: number
): { tone: TonePreset; length: LengthPreset } => {
    if (rating >= 5) {
        return { tone: "amical", length: "court" };
    }
    if (rating >= 4) {
        return { tone: "professionnel", length: "moyen" };
    }
    if (rating === 3) {
        return { tone: "empathique", length: "moyen" };
    }
    return { tone: "empathique", length: "long" };
};

export const formatRelativeDate = (iso: string): string => {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
};

// Moving getAccessToken to utils since it's a pure helper, 
// though it depends on supabase client which is passed in? 
// In original code it took supabaseClient as arg.
export const getAccessToken = async (
    supabaseClient: any
): Promise<string> => {
    if (!supabaseClient) {
        throw new Error("No supabase client");
    }
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (!token) {
        throw new Error("No session / not authenticated");
    }
    return token;
};

export const CRON_CURSOR_KEY = "google_reviews_last_run";
export const CRON_ERROR_KEY = "google_reviews_last_error";

export const formatSinceMinutes = (iso: string | null): string => {
    if (!iso) {
        return "—";
    }
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) {
        return "—";
    }
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
        return "moins d'une minute";
    }
    if (minutes === 1) {
        return "1 minute";
    }
    return `${minutes} minutes`;
};

export const formatStatusIcon = (status: ReviewCronStatus["status"]) => {
    switch (status) {
        case "done":
            return "✅";
        case "running":
            return "⏳";
        case "error":
            return "❌";
        case "idle":
            return "—";
        default:
            return "—";
    }
};

export const truncateText = (value: string, maxLength = 80) =>
    value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
