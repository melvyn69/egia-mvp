export const statusTabs = [
    { id: "new", label: "Nouveau" },
    { id: "reading", label: "À traiter" },
    { id: "replied", label: "Répondu" },
    { id: "archived", label: "Ignoré" },
    { id: "all", label: "Tout" }
] as const;

export type StatusFilter = (typeof statusTabs)[number]["id"];
export type ReviewStatus = "new" | "reading" | "replied" | "archived";
export type AiSentiment = "positive" | "neutral" | "negative";

export type Review = {
    id: string;
    reviewId?: string;
    locationName: string;
    locationId: string;
    businessId: string;
    authorName: string;
    rating: number;
    source: "Google" | "Facebook";
    status: ReviewStatus;
    createdAt: string;
    updatedAt: string;
    text: string;
    tags: string[];
    aiStatus: "pending" | "ready";
    aiSentiment: AiSentiment | null;
    aiScore: number | null;
    aiSummary: string | null;
    aiTags: string[];
    aiPriority: boolean;
    aiPriorityScore: number;
};

export type LengthPreset = "court" | "moyen" | "long";
export type TonePreset = "professionnel" | "amical" | "empathique";

export type ReviewReply = {
    id: string;
    review_id: string;
    reply_text: string;
    status: "draft" | "sent";
    created_at: string;
    sent_at: string | null;
};

export type ReviewRow = {
    id: string;
    review_id: string | null;
    location_id: string;
    author_name: string | null;
    rating: number | null;
    comment: string | null;
    create_time: string | null;
    update_time: string | null;
    status: ReviewStatus | null;
};

export type AiInsight = {
    status: "pending" | "ready";
    sentiment: AiSentiment | null;
    score: number | null;
    summary: string | null;
    tags: string[];
    priority: boolean;
    priorityScore: number;
};

export type AiTagRow = {
    tag?: string | null;
    category?: string | null;
};

export type ReviewCronStatus = {
    status: "idle" | "running" | "done" | "error";
    last_run_at?: string | null;
    aborted?: boolean;
    cursor?: unknown;
    stats?: { scanned?: number; upserted?: number; processed?: number; tagsUpserted?: number };
    errors_count?: number;
    last_error?: string | null;
    missing_insights_count?: number | null;
};
