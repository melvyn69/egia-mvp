import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase, supabaseUrl } from "../lib/supabase";

const statusTabs = [
  { id: "new", label: "Nouveau" },
  { id: "reading", label: "À traiter" },
  { id: "replied", label: "Répondu" },
  { id: "archived", label: "Ignoré" },
  { id: "all", label: "Tout" }
] as const;

type StatusFilter = (typeof statusTabs)[number]["id"];
type ReviewStatus = "new" | "reading" | "replied" | "archived";
type AiSentiment = "positive" | "neutral" | "negative";

const isReviewStatus = (value: string | null | undefined): value is ReviewStatus =>
  value === "new" ||
  value === "reading" ||
  value === "replied" ||
  value === "archived";

const isAiSentiment = (value: unknown): value is AiSentiment =>
  value === "positive" || value === "neutral" || value === "negative";

const asNumber = (value: unknown): number =>
  typeof value === "number" ? value : 0;

type Review = {
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
  draftStatus?: string | null;
  draftPreview?: string | null;
  draftUpdatedAt?: string | null;
  hasDraft?: boolean;
  hasJobInflight?: boolean;
  isEligibleToGenerate?: boolean;
};

type LengthPreset = "court" | "moyen" | "long";

type TonePreset = "professionnel" | "amical" | "empathique";

const isTonePreset = (value: string | null | undefined): value is TonePreset =>
  value === "professionnel" || value === "amical" || value === "empathique";

const isLengthPreset = (
  value: string | null | undefined
): value is LengthPreset =>
  value === "court" || value === "moyen" || value === "long";

type ReviewReply = {
  id: string;
  review_id: string;
  reply_text: string;
  status: "draft" | "sent";
  created_at: string;
  sent_at: string | null;
};

type ReviewRow = {
  id: string;
  review_id: string | null;
  location_id: string;
  author_name: string | null;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  status: ReviewStatus | null;
  draft_status?: string | null;
  draft_preview?: string | null;
  draft_updated_at?: string | null;
  has_draft?: boolean;
  has_job_inflight?: boolean;
  is_eligible_to_generate?: boolean;
};

type AiInsight = {
  status: "pending" | "ready";
  sentiment: AiSentiment | null;
  score: number | null;
  summary: string | null;
  tags: string[];
  priority: boolean;
  priorityScore: number;
};

type AiTagRow = {
  tag?: string | null;
  category?: string | null;
};

type ReviewCronStatus = {
  status: "idle" | "running" | "done" | "error";
  last_run_at?: string | null;
  aborted?: boolean;
  cursor?: unknown;
  stats?: { scanned?: number; upserted?: number; processed?: number; tagsUpserted?: number };
  errors_count?: number;
  last_error?: string | null;
  missing_insights_count?: number | null;
};

const statusLabelMap: Record<ReviewStatus, string> = {
  new: "Nouveau",
  reading: "À traiter",
  replied: "Répondu",
  archived: "Ignoré"
};

const statusVariantMap: Record<ReviewStatus, "warning" | "success" | "neutral"> = {
  new: "warning",
  reading: "warning",
  replied: "success",
  archived: "neutral"
};

const aiSentimentLabelMap: Record<AiSentiment, string> = {
  positive: "Positif",
  neutral: "Neutre",
  negative: "Négatif"
};

const aiSentimentVariantMap: Record<AiSentiment, "success" | "neutral" | "warning"> =
  {
    positive: "success",
    neutral: "neutral",
    negative: "warning"
  };

const lengthOptions: Array<{ id: LengthPreset; label: string }> = [
  { id: "court", label: "Court" },
  { id: "moyen", label: "Moyen" },
  { id: "long", label: "Long" }
];

const toneOptions: Array<{ id: TonePreset; label: string }> = [
  { id: "professionnel", label: "Professionnel" },
  { id: "amical", label: "Amical" },
  { id: "empathique", label: "Empathique" }
];

const initialActivityEvents = [
  {
    id: "a1",
    label: "Réponse automatique enregistrée",
    timestamp: "Il y a 12 min"
  },
  { id: "a3", label: "Tag “Service” ajouté", timestamp: "Hier" }
];

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
};

const normalizeSentiment = (value: unknown): AiSentiment | null => {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }
  return null;
};

const asOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
};

const getInsight = (record: {
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

const getTags = (record: {
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

const COOLDOWN_MS = 30000;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getProjectRef = (url: string | null | undefined): string | null => {
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

const maskToken = (token?: string | null): string => {
  if (!token) {
    return "—";
  }
  return `${token.slice(0, 12)}...`;
};

const getRatingPreset = (
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

const formatRelativeDate = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const getAccessToken = async (
  supabaseClient: typeof supabase
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

const CRON_CURSOR_KEY = "google_reviews_last_run";
const CRON_ERROR_KEY = "google_reviews_last_error";

const formatSinceMinutes = (iso: string | null): string => {
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

const formatStatusIcon = (status: ReviewCronStatus["status"]) => {
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

const truncateText = (value: string, maxLength = 80) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const DEFAULT_NEW_DAYS = 90;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isReviewNoteOnly = (review: Pick<Review, "text"> | null) =>
  !review?.text || review.text.trim().length === 0;

const Inbox = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [datePreset, setDatePreset] = useState<
    | "this_week"
    | "this_month"
    | "this_quarter"
    | "this_year"
    | "last_year"
    | "all_time"
    | "custom"
  >("custom");
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - DEFAULT_NEW_DAYS);
    return toDateInputValue(date);
  });
  const [dateTo, setDateTo] = useState(() => toDateInputValue(new Date()));
  const [sentimentFilter, setSentimentFilter] = useState<
    "all" | "positive" | "neutral" | "negative"
  >("all");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState<string>("");
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>("moyen");
  const [tonePreset, setTonePreset] = useState<TonePreset>("professionnel");
  const [replyText, setReplyText] = useState("");
  const [replyDirtyByReview, setReplyDirtyByReview] = useState<
    Record<string, boolean>
  >({});
  const lastSelectedReviewIdRef = useRef<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyTab, setReplyTab] = useState<"reply" | "activity">("reply");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiSuggestion, setAiSuggestion] = useState<{
    reviewId: string;
    text: string;
    status: string | null;
  } | null>(null);
  const [aiSuggestionLoadedByReview, setAiSuggestionLoadedByReview] = useState<
    Record<string, boolean>
  >({});
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activityEvents, setActivityEvents] = useState(initialActivityEvents);
  const [businessMemory, setBusinessMemory] = useState<string[]>([]);
  const toneTouchedRef = useRef(false);
  const lengthTouchedRef = useRef(false);
  const [sessionPreview, setSessionPreview] = useState("—");
  const [sessionExp, setSessionExp] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [replyHistory, setReplyHistory] = useState<ReviewReply[]>([]);
  const [replyHistoryLoading, setReplyHistoryLoading] = useState(false);
  const [replyHistoryError, setReplyHistoryError] = useState<string | null>(null);
  const [draftReplyId, setDraftReplyId] = useState<string | null>(null);
  const [replySaving, setReplySaving] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [draftByReview, setDraftByReview] = useState<Record<string, boolean>>({});
  const [autoDraftStatusByReview, setAutoDraftStatusByReview] = useState<
    Record<string, "idle" | "loading" | "ready" | "error">
  >({});
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchError, setBatchError] = useState<string | null>(null);
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  const pendingReviewIdRef = useRef<string | null>(null);
  const autoDraftRequestedRef = useRef<Record<string, boolean>>({});
  const [importStatus, setImportStatus] = useState<ReviewCronStatus>({
    status: "idle"
  });
  const [aiStatus, setAiStatus] = useState<ReviewCronStatus>({
    status: "idle"
  });
  const [aiRunLoading, setAiRunLoading] = useState(false);
  const [aiRunMessage, setAiRunMessage] = useState<string | null>(null);
  const [aiRunStats, setAiRunStats] = useState<{
    processed?: number;
    tagsUpserted?: number;
    errors?: number;
    skipReason?: string | null;
  } | null>(null);
  const [prepareDraftLoading, setPrepareDraftLoading] = useState(false);
  const [prepareDraftMessage, setPrepareDraftMessage] = useState<string | null>(
    null
  );
  const prepareDraftCooldownRef = useRef<Record<string, number>>({});
  const prepareDraftLastCallRef = useRef<Record<string, number>>({});
  const [aiRunLocationLoading, setAiRunLocationLoading] = useState<string | null>(
    null
  );
  const [aiRunLocationResult, setAiRunLocationResult] = useState<
    Record<string, string>
  >({});
  const queryClient = useQueryClient();

  const isSupabaseAvailable = Boolean(supabase);
  const isCooldownActive = cooldownUntil ? cooldownUntil > Date.now() : false;
  const projectRef = getProjectRef(supabaseUrl);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const buildReviewParams = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (selectedLocation !== "all") {
      params.set("location_id", selectedLocation);
    }
    params.set("preset", datePreset);
    params.set("tz", timeZone);
    if (datePreset === "custom") {
      if (dateFrom) {
        params.set("from", dateFrom);
      }
      if (dateTo) {
        params.set("to", dateTo);
      }
    }
    if (sentimentFilter !== "all") {
      params.set("sentiment", sentimentFilter);
    }
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (ratingMin) {
      params.set("rating_min", ratingMin);
    }
    if (ratingMax) {
      params.set("rating_max", ratingMax);
    }
    if (tagFilter.trim()) {
      params.set("tags", tagFilter.trim());
    }
    params.set("limit", "50");
    if (cursor) {
      params.set("cursor", cursor);
    }
    return params;
  };

  const mapReviewRows = (
    rows: ReviewRow[],
    locationLabels: Record<string, string>,
    userId: string
  ) =>
    rows.map((row) => {
      const createdAt = row.create_time ?? row.update_time ?? new Date().toISOString();
      const updatedAt = row.update_time ?? createdAt;
      const status = isReviewStatus(row.status) ? row.status : "new";
      return {
        id: row.id,
        reviewId: row.review_id ?? row.id,
        locationName:
          locationLabels[row.location_id] ?? row.location_id ?? "—",
        locationId: row.location_id,
        businessId: userId,
        authorName: row.author_name ?? "Anonyme",
        rating: row.rating ?? 0,
        source: "Google",
        status,
        createdAt,
        updatedAt,
        text: row.comment ?? "",
        tags: [],
        aiStatus: "pending",
        aiSentiment: null,
        aiScore: null,
        aiSummary: null,
        aiTags: [],
        aiPriority: false,
        aiPriorityScore: 0,
        draftStatus: row.draft_status ?? null,
        draftPreview: row.draft_preview ?? null,
        draftUpdatedAt: row.draft_updated_at ?? null,
        hasDraft: Boolean(row.has_draft),
        hasJobInflight: Boolean(row.has_job_inflight),
        isEligibleToGenerate: Boolean(row.is_eligible_to_generate)
      } satisfies Review;
    });

  const mergeAiInsights = (
    base: Review[],
    insightsById: Record<string, AiInsight>
  ) =>
    base.map((review: Review) => {
      const insight = insightsById[review.id];
      if (!insight) {
        return review;
      }
      return {
        ...review,
        aiStatus: insight.status,
        aiSentiment: insight.sentiment,
        aiScore: insight.score,
        aiSummary: insight.summary,
        aiTags: insight.tags,
        aiPriority: insight.priority,
        aiPriorityScore: insight.priorityScore
      };
    });

  const fetchAiInsights = async (reviewIds: string[]) => {
    if (!supabase || reviewIds.length === 0) {
      return {} as Record<string, AiInsight>;
    }
    const { data, error } = await supabase
      .from("google_reviews")
      .select(
        "id, review_ai_insights(sentiment, sentiment_score, summary), review_ai_tags(ai_tags(tag, category))"
      )
      .in("id", reviewIds);

    if (error) {
      console.error("ai insights fetch error:", error);
      return {} as Record<string, AiInsight>;
    }

    const insightsById: Record<string, AiInsight> = {};
    (data ?? []).forEach((row) => {
      const record = row as {
        id: string;
        review_ai_insights?: {
          sentiment?: string | null;
          sentiment_score?: number | null;
          summary?: string | null;
        } | null;
        review_ai_tags?: Array<{
          ai_tags?: { tag?: string | null } | null;
        }> | null;
      };
      const insight = getInsight(record);
      const sentiment = insight?.sentiment ?? null;
      const score = insight?.score ?? null;
      const summary = insight?.summary ?? null;
      const tagsWithMeta = getTags(record);
      const tags = tagsWithMeta.map((tag: { tag: string }) => tag.tag);
      const hasNegativeTag = tagsWithMeta.some(
        (tag) => tag.category === "negative"
      );
      const priorityScore =
        sentiment === "negative" || (typeof score === "number" && score < 0.4)
          ? 2
          : hasNegativeTag
            ? 1
            : 0;
      const priority = priorityScore > 0;

      insightsById[record.id] = {
        status: insight || tags.length > 0 ? "ready" : "pending",
        sentiment,
        score,
        summary,
        tags,
        priority,
        priorityScore
      };
    });

    return insightsById;
  };

  const sessionQuery = useQuery({
    queryKey: ["inbox-session"],
    queryFn: async () => {
      if (!supabase) {
        return null;
      }
      const { data } = await supabase.auth.getSession();
      return data.session ?? null;
    },
    enabled: Boolean(supabase),
    staleTime: 5 * 60 * 1000
  });

  const sessionUserId = sessionQuery.data?.user?.id ?? null;
  const adminEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    adminEmails.length > 0 &&
    Boolean(sessionQuery.data?.user?.email) &&
    adminEmails.includes(String(sessionQuery.data?.user?.email).toLowerCase());

  const locationsQuery = useQuery({
    queryKey: ["inbox-locations", sessionUserId],
    queryFn: async () => {
      if (!supabase) {
        return { labels: {}, options: [] as Array<{ id: string; label: string }> };
      }
      const { data, error } = await supabase
        .from("google_locations")
        .select("location_resource_name, location_title")
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("google_locations fetch error:", error);
      }
      const labels: Record<string, string> = {};
      const options: Array<{ id: string; label: string }> = [];
      (data ?? []).forEach((location) => {
        if (location.location_resource_name) {
          labels[location.location_resource_name] =
            location.location_title ?? location.location_resource_name;
          options.push({
            id: location.location_resource_name,
            label: location.location_title ?? location.location_resource_name
          });
        }
      });
      return { labels, options };
    },
    enabled: Boolean(supabase) && Boolean(sessionUserId),
    staleTime: 5 * 60 * 1000
  });

  const locationLabels = useMemo(
    () => locationsQuery.data?.labels ?? {},
    [locationsQuery.data]
  );
  const locationOptions = useMemo(
    () => locationsQuery.data?.options ?? [],
    [locationsQuery.data]
  );

  const cronStateQuery = useQuery({
    queryKey: ["inbox-cron-state", sessionUserId],
    queryFn: async () => {
      if (!supabase || !sessionUserId) {
        return { updatedAt: null, errorsCount: 0 };
      }
      const { data } = await supabase
        .from("cron_state")
        .select("updated_at, value")
        .eq("key", CRON_CURSOR_KEY)
        .eq("user_id", sessionUserId)
        .maybeSingle();
      if (!data) {
        const { data: fallback } = await supabase
          .from("cron_state")
          .select("updated_at, value")
          .eq("key", CRON_CURSOR_KEY)
          .is("user_id", null)
          .maybeSingle();
        if (fallback) {
          const errorsCountFallback = (
            fallback?.value as { errors_count?: number; at?: string } | null
          )?.errors_count;
          const atFallback = (
            fallback?.value as { at?: string } | null
          )?.at;
          return {
            updatedAt: atFallback ?? fallback.updated_at ?? null,
            errorsCount: Number(errorsCountFallback ?? 0)
          };
        }
      }
      const errorsCount = (data?.value as { errors_count?: number } | null)
        ?.errors_count;
      const at = (data?.value as { at?: string } | null)?.at;
      return {
        updatedAt: at ?? data?.updated_at ?? null,
        errorsCount: Number(errorsCount ?? 0)
      };
    },
    enabled: Boolean(supabase) && Boolean(sessionUserId),
    staleTime: 60 * 1000
  });

  const lastCronSyncAt = cronStateQuery.data?.updatedAt ?? null;
  const cronErrors = cronStateQuery.data?.errorsCount ?? 0;

  const cronErrorQuery = useQuery({
    queryKey: ["inbox-cron-error", sessionUserId],
    queryFn: async () => {
      if (!supabase || !sessionUserId) {
        return null as { code?: string | null; at?: string | null } | null;
      }
      const { data } = await supabase
        .from("cron_state")
        .select("value, updated_at")
        .eq("key", CRON_ERROR_KEY)
        .eq("user_id", sessionUserId)
        .maybeSingle();
      if (!data) {
        return null;
      }
      const value = data.value as { code?: string; at?: string } | null;
      return {
        code: value?.code ?? null,
        at: value?.at ?? data.updated_at ?? null
      };
    },
    enabled: Boolean(supabase) && Boolean(sessionUserId),
    staleTime: 60 * 1000
  });

  const reauthRequired = cronErrorQuery.data?.code === "reauth_required";

  const reviewsQuery = useInfiniteQuery({
    queryKey: [
      "inbox",
      sessionUserId,
      selectedLocation,
      datePreset,
      dateFrom,
      dateTo,
      timeZone,
      sentimentFilter,
      statusFilter,
      ratingMin,
      ratingMax,
      tagFilter
    ],
    queryFn: async ({ pageParam }) => {
      if (!supabase) {
        throw new Error("Supabase unavailable");
      }
      const token = await getAccessToken(supabase);
      const params = buildReviewParams(typeof pageParam === "string" ? pageParam : null);
      const response = await fetch(`/api/reviews?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.items) {
        throw new Error("Failed to load reviews");
      }
      const rows = (payload.items ?? []) as ReviewRow[];
      const insightsById = await fetchAiInsights(rows.map((row) => row.id));
      return {
        rows,
        insightsById,
        nextCursor: payload.nextCursor ?? null,
        total: typeof payload.total === "number" ? payload.total : null
      };
    },
    enabled: Boolean(supabase) && Boolean(sessionUserId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (prev) => prev
  });


  const reviewsLoading = reviewsQuery.isLoading;
  const reviewsLoadingMore = reviewsQuery.isFetchingNextPage;
  const reviewsHasMore = Boolean(reviewsQuery.hasNextPage);
  const reviewsError =
    sessionQuery.isSuccess && !sessionUserId
      ? "Session introuvable."
      : reviewsQuery.isError
        ? "Impossible de charger les avis."
        : null;

  const reviews = useMemo(() => {
    if (!sessionUserId) {
      return [];
    }
    const pages = reviewsQuery.data?.pages ?? [];
    return pages.flatMap(
      (page: {
        rows: ReviewRow[];
        insightsById: Record<string, AiInsight>;
        total?: number | null;
      }) => {
      const base = mapReviewRows(page.rows, locationLabels, sessionUserId);
      return mergeAiInsights(base, page.insightsById);
    });
  }, [reviewsQuery.data, locationLabels, sessionUserId]);

  const totalReviewsCount = useMemo(() => {
    const pages = reviewsQuery.data?.pages ?? [];
    const first = pages[0] as { total?: number | null } | undefined;
    return typeof first?.total === "number" ? first.total : null;
  }, [reviewsQuery.data]);

  const locationReviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    reviews.forEach((review: Review) => {
      const key = review.locationId;
      if (!key) {
        return;
      }
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [reviews]);

  const locations = useMemo(() => {
    return [
      { id: "all", label: "Tous" },
      ...locationOptions.map((option) => {
        const count = locationReviewCounts[option.id];
        const suffix = count === 0 ? " (0 avis)" : "";
        return {
          id: option.id,
          label: `${option.label}${suffix}`
        };
      })
    ];
  }, [locationOptions, locationReviewCounts]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((review: Review) => {
      const matchesStatus =
        statusFilter === "all" ? true : review.status === statusFilter;
      const matchesLocation =
        selectedLocation === "all"
          ? true
          : review.locationId === selectedLocation;
      return matchesStatus && matchesLocation;
    });
  }, [reviews, statusFilter, selectedLocation]);

  const eligibleFilteredReviews = useMemo(
    () => filteredReviews.filter((review: Review) => review.isEligibleToGenerate === true),
    [filteredReviews]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetReviewId = params.get("review_id");
    if (typeof targetReviewId === "string" && targetReviewId.length > 0) {
      pendingReviewIdRef.current = targetReviewId;
    }
  }, []);

  useEffect(() => {
    if (filteredReviews.length === 0) {
      setSelectedReviewId("");
      return;
    }
    const stillVisible = filteredReviews.some(
      (review: Review) => review.id === selectedReviewId
    );
    if (!stillVisible) {
      setSelectedReviewId(filteredReviews[0].id);
    }
  }, [filteredReviews, selectedReviewId]);

  useEffect(() => {
    if (!pendingReviewIdRef.current || reviews.length === 0) {
      return;
    }
    const target = reviews.find(
      (review: Review) =>
        review.id === pendingReviewIdRef.current ||
        review.reviewId === pendingReviewIdRef.current
    );
    if (!target) {
      return;
    }
    setSelectedReviewId(target.id);
    setHighlightReviewId(target.id);
    const element = document.getElementById(`review-${target.id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("review_id");
    window.history.replaceState({}, "", url.toString());
    pendingReviewIdRef.current = null;
  }, [reviews]);

  useEffect(() => {
    if (!highlightReviewId) return;
    const timeoutId = setTimeout(() => {
      setHighlightReviewId(null);
    }, 2500);
    return () => clearTimeout(timeoutId);
  }, [highlightReviewId]);

  const selectedReview = useMemo(() => {
    return reviews.find((review: Review) => review.id === selectedReviewId) ?? null;
  }, [reviews, selectedReviewId]);
  const selectedReviewIsNoteOnly = isReviewNoteOnly(selectedReview);
  const hasSavedDraft = Boolean(draftReplyId);

  const activeLocationId = useMemo(() => {
    if (selectedLocation !== "all") {
      return selectedLocation;
    }
    return selectedReview?.locationId ?? reviews[0]?.locationId ?? "";
  }, [selectedLocation, selectedReview, reviews]);

  const autoDraftStatus = selectedReviewId
    ? autoDraftStatusByReview[selectedReviewId] ?? "idle"
    : "idle";

  const aiCronStatusQuery = useQuery({
    queryKey: ["inbox-ai-cron-status", sessionUserId, activeLocationId],
    queryFn: async () => {
      if (!supabase || !sessionUserId || !activeLocationId) {
        return null as
          | {
              updatedAt: string | null;
              value: {
                status?: string | null;
                last_run_at?: string | null;
                missing_insights_count?: number | null;
              };
            }
          | null;
      }
      const key = `ai_status_v1:${sessionUserId}:${activeLocationId}`;
      let { data } = await supabase
        .from("cron_state")
        .select("updated_at, value")
        .eq("key", key)
        .eq("user_id", sessionUserId)
        .maybeSingle();
      if (!data) {
        const { data: fallback } = await supabase
          .from("cron_state")
          .select("updated_at, value")
          .eq("key", key)
          .is("user_id", null)
          .maybeSingle();
        data = fallback ?? null;
      }
      if (!data) {
        return null;
      }
      const value = (data.value ?? {}) as {
        status?: string | null;
        last_run_at?: string | null;
        missing_insights_count?: number | null;
        last_error?: string | null;
      };
      return {
        updatedAt: data.updated_at ?? null,
        value
      };
    },
    enabled: Boolean(supabase) && Boolean(sessionUserId) && Boolean(activeLocationId),
    staleTime: 15000,
    refetchInterval: 30000
  });

  const aiStatusDisplay = useMemo(() => {
    const value = aiCronStatusQuery.data?.value ?? null;
    const status =
      (value?.status as ReviewCronStatus["status"] | undefined) ??
      aiStatus.status ??
      "idle";
    const missing =
      typeof value?.missing_insights_count === "number"
        ? value?.missing_insights_count
        : aiStatus.missing_insights_count ?? 0;
    const lastRunAt =
      value?.last_run_at ??
      aiStatus.last_run_at ??
      aiCronStatusQuery.data?.updatedAt ??
      null;
    return { status, missing, lastRunAt };
  }, [aiCronStatusQuery.data, aiStatus]);

  const aiStatusUi = useMemo(() => {
    const missing = aiStatusDisplay.missing ?? 0;
    const lastError =
      (aiCronStatusQuery.data?.value as { last_error?: string | null } | null)
        ?.last_error ?? (aiStatus as { last_error?: string | null }).last_error;
    if (aiStatusDisplay.status === "running") {
      return {
        label: "En cours",
        showSpinner: true,
        badgeClass: "bg-amber-100 text-amber-700"
      };
    }
    if (aiStatusDisplay.status === "error") {
      return {
        label: "Erreur",
        showSpinner: false,
        badgeClass: "bg-rose-100 text-rose-700",
        errorText: lastError ? truncateText(lastError) : null
      };
    }
    if (aiStatusDisplay.status === "done" && missing === 0) {
      return {
        label: "À jour",
        showSpinner: false,
        badgeClass: "bg-emerald-100 text-emerald-700"
      };
    }
    if (missing > 0) {
      return {
        label: "En attente",
        showSpinner: false,
        badgeClass: "bg-slate-100 text-slate-700",
        countText: `${missing}`
      };
    }
    return {
      label: "En attente",
      showSpinner: false,
      badgeClass: "bg-slate-100 text-slate-700"
    };
  }, [aiStatusDisplay, aiCronStatusQuery.data, aiStatus]);

  const handleRunAiForLocation = async (
    mode?: "recent" | "retry_errors",
    limit?: number
  ) => {
    if (!supabase || !activeLocationId || aiRunLoading) {
      return;
    }
    setAiRunLoading(true);
    setAiRunMessage(null);
    setAiRunStats(null);
    try {
      const token = await getAccessToken(supabase);
      const params = new URLSearchParams({
        location_id: activeLocationId
      });
      if (mode) {
        params.set("mode", mode);
      }
      if (typeof limit === "number" && Number.isFinite(limit)) {
        params.set("limit", String(Math.max(1, Math.floor(limit))));
      }
      const response = await fetch(
        `/api/cron/ai/tag-reviews?${params.toString()}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await response.json().catch(() => null);
      const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : "";
      if (response.status === 401) {
        setAiRunMessage(`Non connecté${requestId}`);
        return;
      }
      if (response.status === 403) {
        setAiRunMessage(`Accès admin requis${requestId}`);
        return;
      }
      if (!response.ok) {
        setAiRunMessage(`Erreur: ${response.status}${requestId}`);
        return;
      }
      setAiRunStats({
        processed: payload?.stats?.reviewsProcessed ?? 0,
        tagsUpserted: payload?.stats?.tagsUpserted ?? 0,
        errors: payload?.stats?.errors?.length ?? 0,
        skipReason: payload?.skipReason ?? null
      });
      setAiRunMessage("Analyse IA lancée");
      queryClient.invalidateQueries({
        queryKey: ["inbox-ai-cron-status", sessionUserId, activeLocationId]
      });
      window.setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["inbox-ai-cron-status", sessionUserId, activeLocationId]
        });
      }, 5000);
    } catch {
      setAiRunMessage("Erreur réseau.");
    } finally {
      setAiRunLoading(false);
    }
  };

  const handlePrepareDrafts = useCallback(
    async (locationId: string, userTriggered = false, requestedLimit = 10) => {
      if (!userTriggered) {
        return;
      }
      if (!supabase || !locationId || prepareDraftLoading) {
        return;
      }
      setPrepareDraftLoading(true);
      setPrepareDraftMessage(null);
      const safeLimit = Math.min(25, Math.max(1, Math.trunc(requestedLimit) || 10));
      try {
        const token = await getAccessToken(supabase);
        const response = await fetch("/api/reviews?action=prepare_drafts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ location_id: locationId, limit: safeLimit })
        });
        const payload = await response.json().catch(() => null);
        if (response.status === 401) {
          setPrepareDraftMessage("Non connecté.");
          return;
        }
        if (response.status === 403) {
          setPrepareDraftMessage("Accès refusé.");
          return;
        }
        if (!response.ok) {
          setPrepareDraftMessage("Erreur lors de la préparation.");
          return;
        }
        const noCommentSkipped = Array.isArray(payload?.results)
          ? payload.results.filter(
              (
                item: { skipped?: boolean; skipped_reason?: string } | null
              ) => item?.skipped && item.skipped_reason === "no_comment"
            ).length
          : 0;
        if (payload?.cooldown) {
          setPrepareDraftMessage("Préparation en cooldown.");
          prepareDraftCooldownRef.current[locationId] = Date.now() + 15 * 60 * 1000;
        } else if ((payload?.queued ?? 0) > 0) {
          const suffix =
            noCommentSkipped > 0 ? ` (${noCommentSkipped} note seule ignorée)` : "";
          setPrepareDraftMessage(
            `${payload.queued} brouillons en préparation.${suffix}`
          );
        } else if (noCommentSkipped > 0) {
          setPrepareDraftMessage(
            `${noCommentSkipped} avis sans commentaire ignorés (note seule).`
          );
        } else {
          setPrepareDraftMessage("Aucun brouillon à préparer.");
        }
      } catch {
        setPrepareDraftMessage("Erreur réseau.");
      } finally {
        prepareDraftLastCallRef.current[locationId] = Date.now();
        setPrepareDraftLoading(false);
      }
    },
    [prepareDraftLoading, supabase]
  );

  const handleRunAiForSpecificLocation = async (locationId: string) => {
    if (!supabase || !locationId || aiRunLocationLoading) {
      return;
    }
    setAiRunLocationLoading(locationId);
    setAiRunLocationResult((prev) => ({ ...prev, [locationId]: "" }));
    try {
      const token = await getAccessToken(supabase);
      const response = await fetch(
        `/api/cron/ai/tag-reviews?force=1&location_id=${encodeURIComponent(locationId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const payload = await response.json().catch(() => null);
      const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : "";
      if (!response.ok) {
        if (response.status === 401) {
          setAiRunLocationResult((prev) => ({
            ...prev,
            [locationId]: `Non connecté${requestId}`
          }));
          return;
        }
        if (response.status === 403) {
          setAiRunLocationResult((prev) => ({
            ...prev,
            [locationId]: `Accès admin requis${requestId}`
          }));
          return;
        }
        setAiRunLocationResult((prev) => ({
          ...prev,
          [locationId]: `Erreur: ${response.status}${requestId}`
        }));
        return;
      }
      const processed =
        payload?.stats?.reviewsProcessed ?? payload?.processed ?? 0;
      const tags = payload?.stats?.tagsUpserted ?? payload?.tagsUpserted ?? 0;
      const errorsCount = payload?.stats?.errors?.length ?? payload?.errors ?? 0;
      const skip = payload?.skipReason ?? null;
      const msg = `OK • ${processed} traités • ${tags} tags • ${errorsCount} erreurs${
        skip ? ` • ${skip}` : ""
      }`;
      setAiRunLocationResult((prev) => ({ ...prev, [locationId]: msg }));
      await queryClient.invalidateQueries({
        queryKey: ["inbox-ai-cron-status", sessionUserId, locationId]
      });
    } catch {
      setAiRunLocationResult((prev) => ({
        ...prev,
        [locationId]: "Erreur réseau."
      }));
    } finally {
      setAiRunLocationLoading(null);
    }
  };

  useEffect(() => {
    if (!selectedReviewId) {
      setReplyText("");
      lastSelectedReviewIdRef.current = null;
      return;
    }
    const nextDraft = drafts[selectedReviewId] ?? "";
    const isDirty = Boolean(replyDirtyByReview[selectedReviewId]);
    const isSameReview = lastSelectedReviewIdRef.current === selectedReviewId;
    setReplyText((current) => {
      if (isDirty) {
        return current;
      }
      if (!isSameReview) {
        return nextDraft;
      }
      if (current.trim()) {
        return current;
      }
      return nextDraft;
    });
    lastSelectedReviewIdRef.current = selectedReviewId;
  }, [drafts, selectedReviewId, replyDirtyByReview]);

  const loadReviewStatuses = useCallback(async () => {
    if (!supabase || !activeLocationId) {
      setImportStatus({ status: "idle" });
      setAiStatus({ status: "idle" });
      return;
    }
    try {
      const token = await getAccessToken(supabase);
      const response = await fetch(
        `/api/reviews?action=status&location_id=${encodeURIComponent(activeLocationId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setImportStatus({ status: "idle" });
        setAiStatus({ status: "idle" });
        return;
      }
      setImportStatus(payload.import ?? { status: "idle" });
      setAiStatus(payload.ai ?? { status: "idle" });
    } catch {
      setImportStatus({ status: "idle" });
      setAiStatus({ status: "idle" });
    }
  }, [activeLocationId]);

  useEffect(() => {
    void loadReviewStatuses();
  }, [loadReviewStatuses]);

  useEffect(() => {
    if (!supabase || !activeLocationId) {
      return;
    }
    const shouldPoll =
      importStatus.status === "running" || aiStatus.status === "running";
    if (!shouldPoll) {
      return;
    }
    const timeoutId = setTimeout(() => {
      void loadReviewStatuses();
    }, 15000);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeLocationId, aiStatus.status, importStatus.status, loadReviewStatuses]);

  useEffect(() => {
    setSavedAt(null);
    setGenerationError(null);
    toneTouchedRef.current = false;
    lengthTouchedRef.current = false;
    setReplyHistory([]);
    setReplyHistoryError(null);
    setDraftReplyId(null);

    const supabaseClient = supabase;
    if (!selectedReview || !supabaseClient) {
      setBusinessMemory([]);
      return;
    }

    const loadBusinessContext = async () => {
      const { data: settings } = await supabaseClient
        .from("business_settings")
        .select("default_tone, default_length, signature")
        .eq("business_id", selectedReview.businessId)
        .maybeSingle();

      if (!toneTouchedRef.current) {
        const ratingPreset = getRatingPreset(selectedReview.rating);
        const nextTone = isTonePreset(settings?.default_tone)
          ? ratingPreset.tone
          : ratingPreset.tone;
        setTonePreset(nextTone);
      }
      if (!lengthTouchedRef.current) {
        const ratingPreset = getRatingPreset(selectedReview.rating);
        const nextLength = isLengthPreset(settings?.default_length)
          ? ratingPreset.length
          : ratingPreset.length;
        setLengthPreset(nextLength);
      }
      const { data: memories } = await supabaseClient
        .from("business_memory")
        .select("content")
        .eq("business_id", selectedReview.businessId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      setBusinessMemory(memories?.map((item) => item.content) ?? []);
    };

    void loadBusinessContext();
  }, [selectedReview, selectedReviewId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!selectedReview || !supabaseClient) {
      setReplyHistory([]);
      setDraftByReview({});
      return;
    }

    const loadReplies = async () => {
      setReplyHistoryLoading(true);
      setReplyHistoryError(null);
      const { data, error } = await supabaseClient
        .from("review_replies")
        .select("id, review_id, reply_text, status, created_at, sent_at")
        .eq("review_id", selectedReview.id)
        .order("created_at", { ascending: false });

      if (error) {
        setReplyHistoryError("Impossible de charger l'historique.");
        setReplyHistory([]);
      } else {
        const rows = (data ?? []) as ReviewReply[];
        setReplyHistory(rows);
        const latestDraft = rows.find((item: ReviewReply) => item.status === "draft");
        setDraftReplyId(latestDraft?.id ?? null);
      }
      setReplyHistoryLoading(false);
    };

    void loadReplies();
  }, [selectedReview, selectedReviewId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!selectedReview || !supabaseClient) {
      setAiSuggestion(null);
      setAiSuggestionError(null);
      return;
    }
    let mounted = true;
    const loadAiSuggestion = async () => {
      setAiSuggestion(null);
      setAiSuggestionError(null);
      setAiSuggestionLoadedByReview((prev) => ({
        ...prev,
        [selectedReview.id]: false
      }));
      const sbAny = supabaseClient as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{
                data?: { draft_text?: string | null; status?: string | null } | null;
                error?: { message?: string | null } | null;
              }>;
            };
          };
        };
      };
      const { data, error } = await sbAny
        .from("review_ai_replies")
        .select("draft_text, status")
        .eq("review_id", selectedReview.id)
        .maybeSingle();
      if (!mounted) {
        return;
      }
      if (error) {
        setAiSuggestionError("Impossible de charger la suggestion IA.");
        setAiSuggestionLoadedByReview((prev) => ({
          ...prev,
          [selectedReview.id]: true
        }));
        return;
      }
      const draftText = data?.draft_text ? String(data.draft_text).trim() : "";
      if (!draftText) {
        setAiSuggestion(null);
        setAiSuggestionLoadedByReview((prev) => ({
          ...prev,
          [selectedReview.id]: true
        }));
        return;
      }
      setAiSuggestion({
        reviewId: selectedReview.id,
        text: draftText,
        status: data?.status ?? null
      });
      setAiSuggestionLoadedByReview((prev) => ({
        ...prev,
        [selectedReview.id]: true
      }));
    };
    void loadAiSuggestion();
    return () => {
      mounted = false;
    };
  }, [selectedReview, selectedReviewId]);

  useEffect(() => {
    if (!selectedReview || !supabase) {
      return;
    }
    const reviewId = selectedReview.id;
    if (isReviewNoteOnly(selectedReview)) {
      setAutoDraftStatusByReview((prev) => ({
        ...prev,
        [reviewId]: "idle"
      }));
      return;
    }
    const suggestionText =
      aiSuggestion?.reviewId === reviewId ? aiSuggestion.text.trim() : "";

    if (suggestionText) {
      setAutoDraftStatusByReview((prev) => ({
        ...prev,
        [reviewId]: "ready"
      }));
      if (!replyDirtyByReview[reviewId]) {
        setDrafts((prev) => ({
          ...prev,
          [reviewId]: suggestionText
        }));
      }
      return;
    }

    if (!aiSuggestionLoadedByReview[reviewId]) {
      return;
    }

    if (autoDraftRequestedRef.current[reviewId]) {
      return;
    }
    autoDraftRequestedRef.current[reviewId] = true;
    setAutoDraftStatusByReview((prev) => ({
      ...prev,
      [reviewId]: "loading"
    }));

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const fetchDraft = async () => {
      const sbAny = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{
                data?: { draft_text?: string | null; status?: string | null } | null;
                error?: { message?: string | null } | null;
              }>;
            };
          };
        };
      };
      const { data, error } = await sbAny
        .from("review_ai_replies")
        .select("draft_text, status")
        .eq("review_id", reviewId)
        .maybeSingle();
      if (error) {
        return "";
      }
      return data?.draft_text ? String(data.draft_text).trim() : "";
    };

    const intervalMs = 2000;
    const maxAttempts = 15;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      const draftText = await fetchDraft();
      if (cancelled) {
        return;
      }
      if (draftText) {
        setAiSuggestion({ reviewId, text: draftText, status: "draft" });
        setAutoDraftStatusByReview((prev) => ({
          ...prev,
          [reviewId]: "ready"
        }));
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        setAutoDraftStatusByReview((prev) => ({
          ...prev,
          [reviewId]: "error"
        }));
        return;
      }
      timeoutId = setTimeout(poll, intervalMs);
    };

    const ensureDraft = async () => {
      try {
        const token = await getAccessToken(supabase);
        const response = await fetch("/api/reviews?action=ensure_draft", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            review_id: reviewId,
            location_id: selectedReview.locationId,
            tone: tonePreset,
            length: lengthPreset
          })
        });
        if (!response.ok) {
          setAutoDraftStatusByReview((prev) => ({
            ...prev,
            [reviewId]: "error"
          }));
          return;
        }
        void poll();
      } catch {
        setAutoDraftStatusByReview((prev) => ({
          ...prev,
          [reviewId]: "error"
        }));
      }
    };

    void ensureDraft();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    aiSuggestion?.text,
    aiSuggestionLoadedByReview,
    lengthPreset,
    replyDirtyByReview,
    selectedReview,
    selectedReviewId,
    tonePreset
  ]);

  useEffect(() => {
    const supabaseClient = supabase;
    const reviewIds = filteredReviews.map((review: Review) => review.id);
    if (!supabaseClient || reviewIds.length === 0) {
      setDraftByReview({});
      return;
    }
    const loadDrafts = async () => {
      const { data } = await supabaseClient
        .from("review_replies")
        .select("review_id, status")
        .in("review_id", reviewIds)
        .eq("status", "draft");
      const nextMap: Record<string, boolean> = {};
      (data ?? []).forEach((row) => {
        if (row.review_id) {
          nextMap[row.review_id] = true;
        }
      });
      setDraftByReview(nextMap);
    };
    void loadDrafts();
  }, [filteredReviews]);

  useEffect(() => {
    if (!import.meta.env.DEV || !supabase) {
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setSessionError(error.message);
          return;
        }
        setSessionPreview(maskToken(data.session?.access_token));
        setSessionExp(
          data.session?.expires_at ? String(data.session.expires_at) : null
        );
      })
      .catch((error) => {
        setSessionError(error instanceof Error ? error.message : "Unknown error");
      });
  }, []);

  const handleInvalidJwt = async () => {
    setGenerationError("Session expirée, reconnecte-toi");
    const supabaseClient = supabase;
    if (!supabaseClient) {
      return;
    }
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (error || !data.session) {
      await supabaseClient.auth.signOut();
      try {
        Object.keys(window.localStorage)
          .filter(
            (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
          )
          .forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // ignore storage errors
      }
      window.location.reload();
    }
  };

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs <= 0) {
      setCooldownUntil(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setCooldownUntil(null);
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [cooldownUntil]);

  const buildNoteOnlyTemplate = (review: Review) => {
    if (review.rating >= 4) {
      return "Merci pour votre note et votre confiance. Au plaisir de vous accueillir de nouveau.";
    }
    if (review.rating === 3) {
      return "Merci pour votre note. Nous restons attentifs a votre experience et serions ravis de vous accueillir a nouveau.";
    }
    return "Merci pour votre note. Nous prenons votre retour au serieux et travaillons a ameliorer votre prochaine experience.";
  };

  const saveDraftReply = useCallback(
    async (
      review: Review,
      draftText: string,
      tone: TonePreset,
      length: LengthPreset
    ) => {
      if (!supabase) {
        return false;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setGenerationError("Connecte-toi pour sauvegarder le brouillon.");
        return false;
      }
      const locationId = uuidRegex.test(review.locationId) ? review.locationId : null;
      const { data: inserted, error: insertError } = await supabase
        .from("review_replies")
        .insert({
          user_id: sessionData.session.user.id,
          review_id: review.id,
          source: review.source.toLowerCase(),
          location_id: locationId,
          business_name: review.locationName,
          tone,
          length,
          reply_text: draftText,
          status: "draft"
        })
        .select("id, review_id, reply_text, status, created_at, sent_at")
        .single();
      if (insertError || !inserted) {
        if (import.meta.env.DEV) {
          console.log("review_replies insert error:", insertError);
        }
        return false;
      }
      const row = inserted as ReviewReply;
      setReplyHistory((prev) => [row, ...prev]);
      setDraftReplyId(row.id);
      setDraftByReview((prev) => ({ ...prev, [review.id]: true }));
      return true;
    },
    [supabase]
  );

  const requestBrandVoiceDraft = useCallback(
    async (review: Review) => {
      if (!supabase) {
        setGenerationError("Configuration Supabase manquante.");
        return { draftText: null, pending: false };
      }
      const token = await getAccessToken(supabase);
      const enqueueResponse = await fetch("/api/reviews?action=prepare_drafts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          location_id: review.locationId,
          review_id: review.id,
          limit: 1
        })
      });
      const enqueuePayload = await enqueueResponse.json().catch(() => null);
      if (enqueueResponse.status === 401) {
        setGenerationError("Session expiree, reconnecte-toi.");
        return { draftText: null, pending: false };
      }
      if (enqueueResponse.status === 403) {
        setGenerationError("Reconnexion Google requise.");
        return { draftText: null, pending: false };
      }
      if (!enqueueResponse.ok) {
        setGenerationError("Impossible de generer une reponse pour le moment.");
        return { draftText: null, pending: false };
      }
      const resultForReview = Array.isArray(enqueuePayload?.results)
        ? enqueuePayload.results.find(
            (item: { review_id?: string } | null) => item?.review_id === review.id
          )
        : null;
      const skippedReason =
        resultForReview &&
        typeof resultForReview === "object" &&
        "skipped_reason" in resultForReview
          ? (
              resultForReview as {
                skipped_reason?: string;
              }
            ).skipped_reason ?? null
          : null;
      if (skippedReason === "no_comment") {
        setGenerationError("Avis note seule: utilisez le modele court.");
        return { draftText: null, pending: false };
      }

      const maxAttempts = 15;
      const intervalMs = 2000;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const statusResponse = await fetch(
          `/api/reviews?action=draft_status&review_id=${encodeURIComponent(review.id)}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const statusPayload = await statusResponse.json().catch(() => null);
        if (statusResponse.status === 401) {
          setGenerationError("Session expiree, reconnecte-toi.");
          return { draftText: null, pending: false };
        }
        if (statusResponse.status === 403) {
          setGenerationError("Reconnexion Google requise.");
          return { draftText: null, pending: false };
        }
        if (
          statusResponse.ok &&
          typeof statusPayload?.draft_text === "string" &&
          statusPayload.draft_text.trim().length > 0
        ) {
          return { draftText: statusPayload.draft_text.trim(), pending: false };
        }
        await new Promise((resolve) => {
          window.setTimeout(resolve, intervalMs);
        });
      }
      setGenerationError("Generation en cours. Reviens dans quelques secondes.");
      return { draftText: null, pending: true };
    },
    [supabase]
  );

  const handleGenerate = async () => {
    if (!selectedReview) {
      return;
    }
    const supabaseClient = supabase;
    if (!supabaseClient) {
      setGenerationError("Configuration Supabase manquante.");
      return;
    }
    if (isReviewNoteOnly(selectedReview)) {
      setGenerationError("Avis note seule: utilisez le modele court.");
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    autoDraftRequestedRef.current[selectedReview.id] = true;
    setAutoDraftStatusByReview((prev) => ({
      ...prev,
      [selectedReview.id]: "loading"
    }));
    try {
      const result = await requestBrandVoiceDraft(selectedReview);
      if (!result.draftText) {
        setAutoDraftStatusByReview((prev) => ({
          ...prev,
          [selectedReview.id]: result.pending ? "loading" : "error"
        }));
        return;
      }
      setReplyText(result.draftText);
      setDrafts((prev) => ({ ...prev, [selectedReview.id]: result.draftText }));
      setAutoDraftStatusByReview((prev) => ({
        ...prev,
        [selectedReview.id]: "ready"
      }));
      await saveDraftReply(
        selectedReview,
        result.draftText,
        tonePreset,
        lengthPreset
      );
    } catch {
      setGenerationError("Erreur lors de la generation.");
      setAutoDraftStatusByReview((prev) => ({
        ...prev,
        [selectedReview.id]: "error"
      }));
    } finally {
      setIsGenerating(false);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
    }
  };

  const handleUseNoteOnlyTemplate = async () => {
    if (!selectedReview) {
      return;
    }
    const template = buildNoteOnlyTemplate(selectedReview);
    setReplyText(template);
    setDrafts((prev) => ({ ...prev, [selectedReview.id]: template }));
    setReplyDirtyByReview((prev) => ({
      ...prev,
      [selectedReview.id]: true
    }));
    setGenerationError(null);
    await saveDraftReply(selectedReview, template, tonePreset, lengthPreset);
  };

  const handleSave = async () => {
    if (!selectedReview) {
      return;
    }
    const supabaseClient = supabase;
    if (!supabaseClient) {
      setGenerationError("Configuration Supabase manquante.");
      return;
    }
    if (!replyText.trim()) {
      setGenerationError("Le brouillon est vide.");
      return;
    }
    setReplySaving(true);
    try {
      if (!draftReplyId) {
        const created = await saveDraftReply(
          selectedReview,
          replyText,
          tonePreset,
          lengthPreset
        );
        if (!created) {
          setGenerationError("Impossible de sauvegarder le brouillon.");
          return;
        }
      } else {
        const { error } = await supabaseClient
          .from("review_replies")
          .update({ reply_text: replyText })
          .eq("id", draftReplyId);
        if (error) {
          setGenerationError("Impossible de sauvegarder le brouillon.");
          return;
        }
        setReplyHistory((prev) =>
          prev.map((item) =>
            item.id === draftReplyId
              ? { ...item, reply_text: replyText }
              : item
          )
        );
      }
      const now = new Date();
      setSavedAt(now.toISOString());
      setActivityEvents((prev) => [
        {
          id: `save-${now.getTime()}`,
          label: "Brouillon sauvegardé",
          timestamp: "A l'instant"
        },
        ...prev
      ]);
    } finally {
      setReplySaving(false);
    }
  };

  const handleSend = async () => {
    if (!selectedReview) {
      return;
    }
    const supabaseClient = supabase;
    if (!draftReplyId || !supabaseClient) {
      setGenerationError("Aucun brouillon à envoyer.");
      return;
    }
    if (!selectedReview.reviewId) {
      setGenerationError("Avis sans identifiant Google.");
      return;
    }
    if (!replyText.trim()) {
      setGenerationError("La réponse est vide.");
      return;
    }
    if (selectedReview.status === "replied") {
      setGenerationError("Avis déjà répondu.");
      return;
    }
    setReplySending(true);
    try {
      const userJwt = await getAccessToken(supabaseClient);
      // TODO: publish_reply_to_google(review)
      const projectRef = getProjectRef(supabaseUrl);
      if (import.meta.env.DEV) {
        console.log("projectRef", projectRef ?? "—");
        console.log(
          "access_token parts/len",
          userJwt.split(".").length,
          userJwt.length
        );
        const { data: userData } = await supabaseClient.auth.getUser();
        console.log("post-reply-google userId", userData.user?.id ?? "null");
        console.log("post-reply-google: invoking", {
          reviewId: selectedReview.reviewId
        });
      }
      const response = await fetch("/api/google/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userJwt}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reviewId: selectedReview.reviewId,
          replyText,
          draftReplyId,
          googleReviewId: selectedReview.id
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        requestId?: string;
        sentAt?: string;
      };
      const error = response.ok ? null : data;
      const isInvalidJwt =
        data?.code === "INVALID_JWT" ||
        data?.code === "INVALID_JWT_FORMAT" ||
        data?.error === "Unauthorized";
      if (isInvalidJwt) {
        await handleInvalidJwt();
        return;
      }
      if (response.status === 401) {
        setGenerationError("Session expirée, reconnecte-toi.");
        return;
      }
      if (response.status === 409) {
        setGenerationError("Avis déjà répondu.");
        return;
      }
      if (response.status === 400) {
        setGenerationError(data?.error ?? "Requête invalide.");
        return;
      }
      if (response.status === 502) {
        setGenerationError("Google a refusé la réponse.");
        return;
      }
      if (import.meta.env.DEV) {
        console.log("post-reply-google: response", { data, error });
      }
      if (error || !data?.ok) {
        setGenerationError("Impossible d'envoyer la réponse.");
        return;
      }
      const sentAt = data?.sentAt ?? new Date().toISOString();
      const { error: updateError } = await supabaseClient
        .from("review_replies")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", draftReplyId);
      if (updateError) {
        setGenerationError("Réponse envoyée, mais statut non mis à jour.");
      } else {
        // 1) Marquer le brouillon comme envoyé dans l'historique
        setReplyHistory((prev) =>
          prev.map((item) =>
            item.id === draftReplyId
              ? { ...item, status: "sent", sent_at: sentAt }
              : item
          )
        );
        setDraftReplyId(null);
        setDraftByReview((prev) => ({ ...prev, [selectedReview.id]: false }));

        // 2) Mettre à jour le statut de l'avis dans la DB (google_reviews)
        // selectedReview.id = id (uuid) de la table google_reviews (pas review_id)
        const { error: reviewStatusError } = await supabaseClient
          .from("google_reviews")
          .update({ status: "replied" })
          .eq("id", selectedReview.id);

        if (reviewStatusError) {
          // On n'empêche pas l'utilisateur d'avancer : la réponse est déjà envoyée à Google
          console.warn("google_reviews status update failed:", reviewStatusError);
        }

        // 3) Mettre à jour le cache (instant)
        const reviewsKey = [
          "inbox",
          sessionUserId,
          selectedLocation,
          datePreset,
          dateFrom,
          dateTo,
          timeZone,
          sentimentFilter,
          statusFilter,
          ratingMin,
          ratingMax,
          tagFilter
        ];
        queryClient.setQueryData(
          reviewsKey,
          (
            old:
              | InfiniteData<{
                  rows: ReviewRow[];
                  insightsById: Record<string, AiInsight>;
                  nextCursor: string | null;
                }>
              | undefined
          ) => {
            if (!old) {
              return old;
            }
            return {
              ...old,
              pages: old.pages.map((page: { rows: ReviewRow[] }) => ({
                ...page,
                rows: page.rows.map((row: ReviewRow) =>
                  row.id === selectedReview.id
                    ? { ...row, status: "replied" }
                    : row
                )
              }))
            };
          }
        );

        // 4) Auto-sélection du prochain avis "new" dans la liste filtrée
        // (On utilise la version la plus fraîche possible)
        const nextNew = filteredReviews.find(
          (r: Review) => r.id !== selectedReview.id && r.status === "new"
        );
        if (nextNew) {
          setSelectedReviewId(nextNew.id);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "No session / not authenticated") {
        setGenerationError("Connecte-toi pour publier la réponse.");
      } else {
        setGenerationError("Impossible d'envoyer la réponse.");
      }
      if (import.meta.env.DEV) {
        console.log("post-reply-google error", error);
      }
    } finally {
      setReplySending(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!supabase) {
      setGenerationError("Configuration Supabase manquante.");
      return;
    }
    if (!activeLocationId) {
      setBatchError("Selectionne un lieu.");
      return;
    }
    if (filteredReviews.length === 0) {
      setBatchError("Aucun avis à traiter.");
      return;
    }
    if (eligibleFilteredReviews.length === 0) {
      setBatchError("Aucun avis éligible à générer.");
      return;
    }
    const cooldownUntil = prepareDraftCooldownRef.current[activeLocationId] ?? 0;
    if (cooldownUntil && Date.now() < cooldownUntil) {
      setBatchError("Preparation en cooldown.");
      return;
    }
    setBatchGenerating(true);
    setBatchError(null);
    setBatchProgress({ current: 0, total: eligibleFilteredReviews.length });
    try {
      setBatchProgress({ current: eligibleFilteredReviews.length, total: eligibleFilteredReviews.length });
      await handlePrepareDrafts(
        activeLocationId,
        true,
        eligibleFilteredReviews.length
      );
    } finally {
      setBatchGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Boîte de réception</h2>
        <p className="text-sm text-slate-500">
          Réponses aux avis et suivi des interactions clients.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Synchronisation automatique toutes les 5 minutes</span>
          <span>•</span>
          <span>Dernière synchronisation : {formatSinceMinutes(lastCronSyncAt)}</span>
          {reauthRequired && (
            <>
              <span>•</span>
              <Badge variant="warning">Reconnexion Google requise</Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  window.location.href = "/settings?tab=locations";
                }}
              >
                Relancer la connexion Google
              </Button>
            </>
          )}
          {cronErrors > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-700">
                ⚠️ Certaines fiches Google n&apos;ont pas pu être synchronisées
              </span>
            </>
          )}
          {reviewsError && (
            <>
              <span>•</span>
              <span className="text-amber-700">{reviewsError}</span>
            </>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <div className="flex items-center justify-between">
            <span>Import avis Google</span>
            <span>
              {formatStatusIcon(importStatus.status)}{" "}
              {totalReviewsCount ?? reviews.length} avis
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Dernier run :{" "}
            {formatSinceMinutes(importStatus.last_run_at ?? null)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Avis affichés : {reviews.length} /{" "}
            {totalReviewsCount ?? reviews.length}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span>Analyse IA</span>
            <span>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${aiStatusUi.badgeClass}`}
              >
                {aiStatusUi.showSpinner && (
                  <span className="inline-flex h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                )}
                {aiStatusUi.label}
                {aiStatusUi.countText ? ` · ${aiStatusUi.countText}` : ""}
              </span>
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Dernière analyse :{" "}
            {aiStatusDisplay.lastRunAt
              ? formatSinceMinutes(aiStatusDisplay.lastRunAt)
              : "Jamais"}
          </div>
          {(prepareDraftLoading || prepareDraftMessage) && (
            <div className="mt-1 text-[11px] text-slate-500">
              {prepareDraftLoading ? "Préparation des brouillons…" : prepareDraftMessage}
            </div>
          )}
          {aiStatusUi.errorText && (
            <div className="mt-1 text-[11px] text-rose-600">
              {aiStatusUi.errorText}
            </div>
          )}
          {isAdmin && activeLocationId && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              {aiStatusDisplay.missing === 0 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRunAiForLocation("recent", 20)}
                    disabled={aiRunLoading}
                  >
                    {aiRunLoading ? "Lancement..." : "Ré-analyser les 20 derniers avis"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRunAiForLocation("retry_errors", 50)}
                    disabled={aiRunLoading}
                  >
                    {aiRunLoading ? "Lancement..." : "Ré-analyser avis en erreur"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleRunAiForLocation()}
                  disabled={aiRunLoading}
                >
                  {aiRunLoading ? "Lancement..." : "Lancer analyse IA"}
                </Button>
              )}
              {aiRunMessage && <span>{aiRunMessage}</span>}
              {aiRunStats && (
                <span>
                  {aiRunStats.processed ?? 0} traités •{" "}
                  {aiRunStats.tagsUpserted ?? 0} tags •{" "}
                  {aiRunStats.errors ?? 0} erreurs
                  {aiRunStats.skipReason ? ` • ${aiRunStats.skipReason}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
        {import.meta.env.DEV && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div>Supabase URL: {supabaseUrl ?? "—"}</div>
            <div>Project ref: {projectRef ?? "—"}</div>
            <div>Session token: {sessionPreview}</div>
            <div>Session exp: {sessionExp ?? "—"}</div>
            {sessionError && <div>Session error: {sessionError}</div>}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1.4fr_1.05fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={statusFilter === tab.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateBatch}
                disabled={batchGenerating || eligibleFilteredReviews.length === 0}
              >
                {batchGenerating
                  ? `Génération ${batchProgress.current}/${batchProgress.total}`
                  : "Générer pour tous"}
              </Button>
              {batchError && (
                <span className="text-xs font-medium text-amber-700">
                  {batchError}
                </span>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Lieu</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={selectedLocation}
                onChange={(event) => setSelectedLocation(event.target.value)}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
              {isAdmin && locationOptions.length > 0 && (
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  {locationOptions.map((location) => (
                    <div
                      key={location.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="font-medium">{location.label}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={aiRunLocationLoading === location.id}
                          onClick={() =>
                            handleRunAiForSpecificLocation(location.id)
                          }
                        >
                          {aiRunLocationLoading === location.id
                            ? "Lancement..."
                            : "Lancer analyse IA (ce lieu)"}
                        </Button>
                      </div>
                      {aiRunLocationResult[location.id] && (
                        <span className="w-full text-[11px] text-slate-500">
                          {aiRunLocationResult[location.id]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Période
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={datePreset}
                onChange={(event) =>
                  setDatePreset(
                    event.target.value as typeof datePreset
                  )
                }
              >
                <option value="all_time">Tout</option>
                <option value="this_week">Cette semaine</option>
                <option value="this_month">Ce mois</option>
                <option value="this_quarter">Ce trimestre</option>
                <option value="this_year">Cette année</option>
                <option value="last_year">Année dernière</option>
                <option value="custom">Personnalisé</option>
              </select>
              {datePreset === "custom" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Sentiment
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={sentimentFilter}
                onChange={(event) =>
                  setSentimentFilter(
                    event.target.value as typeof sentimentFilter
                  )
                }
              >
                <option value="all">Tous</option>
                <option value="positive">Positif</option>
                <option value="neutral">Neutre</option>
                <option value="negative">Négatif</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500">
                  Note min
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={ratingMin}
                  onChange={(event) => setRatingMin(event.target.value)}
                >
                  <option value="">—</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">
                  Note max
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={ratingMax}
                  onChange={(event) => setRatingMax(event.target.value)}
                >
                  <option value="">—</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Tags (séparés par des virgules)
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                placeholder="accueil, attente..."
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewsLoading ? (
              <p className="text-sm text-slate-500">Chargement des avis...</p>
            ) : filteredReviews.length === 0 ? (
              <div className="space-y-1 text-sm text-slate-500">
                <p>Aucun avis à afficher.</p>
                {datePreset === "this_month" && (
                  <div className="mt-2 space-y-2 text-xs text-slate-500">
                    <p>
                      Aucun avis pour ce mois. Essayez “30 derniers jours” ou “Tout”.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDatePreset("all_time")}
                    >
                      Voir tous les avis
                    </Button>
                  </div>
                )}
                {selectedLocation !== "all" && (
                  <p>Aucun avis sur cette fiche.</p>
                )}
              </div>
            ) : (
              <>
                {filteredReviews.map((review: Review) => {
                  const safeStatus = isReviewStatus(review.status)
                    ? review.status
                    : "new";
                  const safeSentiment = isAiSentiment(review.aiSentiment)
                    ? review.aiSentiment
                    : null;
                  const rating = asNumber(review.rating);
                  return (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => setSelectedReviewId(review.id)}
                      id={`review-${review.id}`}
                      className={`w-full rounded-2xl border p-4 text-left transition hover:border-slate-300 ${
                        selectedReviewId === review.id
                          ? "border-slate-400 bg-slate-50"
                          : "border-slate-200"
                      } ${
                        highlightReviewId === review.id
                          ? "ring-2 ring-emerald-400 ring-offset-2"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {review.authorName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {review.locationName}
                          </p>
                        </div>
                        <Badge variant={statusVariantMap[safeStatus]}>
                          {statusLabelMap[safeStatus]}
                        </Badge>
                        {draftByReview[review.id] && (
                          <Badge variant="success">Draft saved</Badge>
                        )}
                        {review.aiPriority && (
                          <Badge variant="warning">À traiter</Badge>
                        )}
                        {isReviewNoteOnly(review) && (
                          <Badge variant="neutral">Note seule</Badge>
                        )}
                        <Badge
                          variant={
                            safeSentiment
                              ? aiSentimentVariantMap[safeSentiment]
                              : "neutral"
                          }
                        >
                          {review.aiStatus === "ready"
                            ? safeSentiment
                              ? aiSentimentLabelMap[safeSentiment]
                              : "IA"
                            : "En attente IA"}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <span>
                          {"★".repeat(Math.max(0, Math.min(5, rating)))}
                          {"☆".repeat(5 - Math.max(0, Math.min(5, rating)))}
                        </span>
                        <span>{review.source}</span>
                        <span>•</span>
                        <span>{formatDate(review.createdAt)}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                        {review.text || "Avis sans commentaire."}
                      </p>
                    </button>
                  );
                })}
                {reviewsHasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reviewsQuery.fetchNextPage()}
                      disabled={reviewsLoadingMore}
                    >
                      {reviewsLoadingMore ? "Chargement..." : "Voir plus"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Détails de l'avis</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedReview ? (
              <p className="text-sm text-slate-500">Sélectionnez un avis.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {selectedReview.authorName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedReview.locationName}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{formatDate(selectedReview.createdAt)}</p>
                    <p className="mt-1">{selectedReview.source}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{selectedReview.rating}★</Badge>
                  <Badge variant={statusVariantMap[selectedReview.status]}>
                    {statusLabelMap[selectedReview.status]}
                  </Badge>
                  {selectedReviewIsNoteOnly && (
                    <Badge variant="neutral">Note seule</Badge>
                  )}
                </div>

                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {selectedReview.text || "Avis sans commentaire."}
                </p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Insights IA
                  </p>
                  {selectedReview.aiStatus !== "ready" ? (
                    <p className="text-sm text-slate-500">En attente IA.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge
                          variant={
                            selectedReview.aiSentiment
                              ? aiSentimentVariantMap[selectedReview.aiSentiment]
                              : "neutral"
                          }
                        >
                          {selectedReview.aiSentiment
                            ? aiSentimentLabelMap[selectedReview.aiSentiment]
                            : "IA"}
                        </Badge>
                        {typeof selectedReview.aiScore === "number" && (
                          <span>
                            Score {(selectedReview.aiScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {selectedReview.aiSummary && (
                        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                          {selectedReview.aiSummary}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {selectedReview.aiTags.length === 0 ? (
                          <span className="text-xs text-slate-400">
                            Aucun tag détecté.
                          </span>
                        ) : (
                          selectedReview.aiTags.map((tag: string) => (
                            <Badge key={tag} variant="neutral">
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedReview.tags.map((tag: string) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Réponse</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={replyTab === "reply" ? "default" : "outline"}
                size="sm"
                onClick={() => setReplyTab("reply")}
              >
                Réponse
              </Button>
              <Button
                variant={replyTab === "activity" ? "default" : "outline"}
                size="sm"
                onClick={() => setReplyTab("activity")}
              >
                Activité & Notes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {replyTab === "activity" ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {activityEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {event.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {event.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Mémoire
                  </p>
                  {businessMemory.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Aucune mémoire active.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {businessMemory.map((item, index) => (
                        <div
                          key={`${item}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Historique
                  </p>
                  {replyHistoryLoading ? (
                    <p className="mt-2 text-sm text-slate-500">Chargement...</p>
                  ) : replyHistoryError ? (
                    <p className="mt-2 text-sm text-amber-700">
                      {replyHistoryError}
                    </p>
                  ) : replyHistory.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Aucun brouillon pour cet avis.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {replyHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                        >
                          <span className="mt-1 h-2 w-2 rounded-full bg-slate-300" />
                          <div className="w-full">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>{formatRelativeDate(item.created_at)}</span>
                              <span>
                                {item.status === "sent" ? "Envoyé" : "Brouillon"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-700">
                              {item.reply_text.slice(0, 120)}
                              {item.reply_text.length > 120 ? "…" : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Longueur</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lengthOptions.map((option) => (
                      <Button
                        key={option.id}
                        variant={lengthPreset === option.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          lengthTouchedRef.current = true;
                          setLengthPreset(option.id);
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500">Ton</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {toneOptions.map((option) => (
                      <Button
                        key={option.id}
                        variant={tonePreset === option.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          toneTouchedRef.current = true;
                          setTonePreset(option.id);
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {aiSuggestionError && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    {aiSuggestionError}
                  </div>
                )}
                {autoDraftStatus === "loading" && !selectedReviewIsNoteOnly && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Generation en cours...
                  </div>
                )}
                {autoDraftStatus === "error" && !selectedReviewIsNoteOnly && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    Impossible de generer un brouillon pour le moment.
                  </div>
                )}
                {selectedReviewIsNoteOnly && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Avis note seule: generation automatique desactivee.
                  </div>
                )}

                <div>
                  <textarea
                    id="reply-editor"
                    className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
                    placeholder="Rediger une reponse..."
                    value={replyText}
                    onChange={(event) => {
                      const next = event.target.value;
                      setReplyText(next);
                      if (selectedReview) {
                        setDrafts((prev) => ({ ...prev, [selectedReview.id]: next }));
                        setReplyDirtyByReview((prev) => ({
                          ...prev,
                          [selectedReview.id]: true
                        }));
                      }
                    }}
                  />
                  <div className="mt-2 text-right text-xs text-slate-500">
                    {replyText.length} caractères
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!hasSavedDraft ? (
                    <>
                      <Button
                        type="button"
                        onClick={handleGenerate}
                        disabled={
                          isGenerating ||
                          !selectedReview ||
                          !isSupabaseAvailable ||
                          isCooldownActive ||
                          selectedReviewIsNoteOnly
                        }
                      >
                        {isGenerating ? "Generation..." : "Generer (IA)"}
                      </Button>
                      {selectedReviewIsNoteOnly ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleUseNoteOnlyTemplate}
                          disabled={!selectedReview}
                        >
                          Modele note seule
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const editor = document.getElementById("reply-editor");
                            if (editor instanceof HTMLTextAreaElement) {
                              editor.focus();
                            }
                          }}
                          disabled={!selectedReview}
                        >
                          Ecrire moi-meme
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={handleSend}
                        disabled={
                          isGenerating ||
                          replySending ||
                          !selectedReview ||
                          !draftReplyId ||
                          selectedReview?.status === "replied"
                        }
                      >
                        {replySending ? "Envoi..." : "Envoyer"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSave}
                        disabled={isGenerating || replySaving || !selectedReview}
                      >
                        {replySaving ? "Sauvegarde..." : "Sauvegarder"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerate}
                        disabled={
                          isGenerating ||
                          !selectedReview ||
                          !isSupabaseAvailable ||
                          isCooldownActive ||
                          selectedReviewIsNoteOnly
                        }
                      >
                        Regenerer
                      </Button>
                    </>
                  )}
                </div>
                {!selectedReview && (
                  <p className="text-xs text-slate-500">Sélectionne un avis.</p>
                )}
                {savedAt && (
                  <Badge variant="success">Sauvegardé</Badge>
                )}
                {generationError && (
                  <p className="text-sm font-medium text-amber-700">
                    {generationError}
                  </p>
                )}
                {!isSupabaseAvailable && (
                  <p className="text-xs text-slate-500">
                    Configuration Supabase manquante. Vérifiez les variables
                    d&apos;environnement.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export { Inbox };
