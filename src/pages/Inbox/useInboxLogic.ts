import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    type InfiniteData,
    useInfiniteQuery,
    useQuery,
    useQueryClient
} from "@tanstack/react-query";
import { supabase, supabaseUrl } from "../../lib/supabase";
import {
    type AiInsight,
    type LengthPreset,
    type Review,
    type ReviewCronStatus,
    type ReviewReply,
    type ReviewRow,
    type StatusFilter,
    type TonePreset
} from "./types";
import {
    COOLDOWN_MS,
    CRON_CURSOR_KEY,
    CRON_ERROR_KEY,
    getAccessToken,
    getInsight,
    getProjectRef,
    getRatingPreset,
    getTags,
    initialActivityEvents,
    isLengthPreset,
    isReviewStatus,
    isTonePreset,
    maskToken,
    uuidRegex,
    truncateText
} from "./utils";

export const useInboxLogic = () => {
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
    >("all_time");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
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
    const [isGenerating, setIsGenerating] = useState(false);
    const [replyTab, setReplyTab] = useState<"reply" | "activity">("reply");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [aiSuggestion, setAiSuggestion] = useState<{
        text: string;
        status: string | null;
    } | null>(null);
    const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [activityEvents, setActivityEvents] = useState(initialActivityEvents);
    const [businessSignature, setBusinessSignature] = useState<string | null>(null);
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
    const [batchGenerating, setBatchGenerating] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [batchError, setBatchError] = useState<string | null>(null);
    const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
    const pendingReviewIdRef = useRef<string | null>(null);
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
                aiPriorityScore: 0
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

    const activeLocationId = useMemo(() => {
        if (selectedLocation !== "all") {
            return selectedLocation;
        }
        return selectedReview?.locationId ?? reviews[0]?.locationId ?? "";
    }, [selectedLocation, selectedReview, reviews]);

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
            const msg = `OK • ${processed} traités • ${tags} tags • ${errorsCount} erreurs${skip ? ` • ${skip}` : ""
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
            return;
        }
        setReplyText(drafts[selectedReviewId] ?? "");
    }, [drafts, selectedReviewId]);

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
            setBusinessSignature(null);
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
            setBusinessSignature(settings?.signature ?? null);

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
                return;
            }
            const draftText = data?.draft_text ? String(data.draft_text).trim() : "";
            if (!draftText) {
                setAiSuggestion(null);
                return;
            }
            setAiSuggestion({ text: draftText, status: data?.status ?? null });
        };
        void loadAiSuggestion();
        return () => {
            mounted = false;
        };
    }, [selectedReview, selectedReviewId]);

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

    useEffect(() => {
        if (!supabase) {
            return;
        }
        supabase.auth.getSession().then(({ data }) => {
            console.log("SESSION =", data.session);
            console.log("ACCESS_TOKEN =", data.session?.access_token);
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

    const handleGenerate = async () => {
        if (!selectedReview) {
            return;
        }
        const supabaseClient = supabase;
        if (!supabaseClient) {
            setGenerationError("Configuration Supabase manquante.");
            console.log("generate-reply: supabase client missing");
            return;
        }
        setIsGenerating(true);
        setGenerationError(null);
        try {
            // TODO: generate_ai_reply(review)
            console.log("generate-reply: invoking edge function", {
                reviewId: selectedReview.id,
                tone: tonePreset,
                length: lengthPreset
            });
            const { data, error } = await supabaseClient.functions.invoke("generate-reply", {
                body: {
                    businessId: selectedReview.businessId,
                    reviewText: selectedReview.text,
                    rating: selectedReview.rating,
                    authorName: selectedReview.authorName,
                    businessName: selectedReview.locationName,
                    source: selectedReview.source.toLowerCase(),
                    tone: tonePreset,
                    length: lengthPreset,
                    memory: businessMemory.length > 0 ? businessMemory : undefined,
                    signature: businessSignature ?? undefined
                }
            });
            const isInvalidJwt =
                error?.status === 401 ||
                error?.message?.includes("Invalid JWT") ||
                (data as { code?: number; message?: string } | null)?.code === 401 ||
                (data as { message?: string } | null)?.message?.includes("Invalid JWT");
            if (isInvalidJwt) {
                await handleInvalidJwt();
                return;
            }
            console.log("generate-reply: response", { data, error });
            if (error || !data?.reply) {
                setGenerationError("Impossible de générer une réponse pour le moment.");
                console.error("generate-reply error:", error ?? data?.error);
            } else {
                setReplyText(data.reply);
                setDrafts((prev) => ({ ...prev, [selectedReview.id]: data.reply }));
                if (supabaseClient) {
                    const { data: sessionData } = await supabaseClient.auth.getSession();
                    if (!sessionData.session?.user) {
                        setGenerationError("Connecte-toi pour sauvegarder le brouillon.");
                    } else {
                        const locationId =
                            uuidRegex.test(selectedReview.locationId)
                                ? selectedReview.locationId
                                : null;
                        const { data: inserted, error: insertError } = await supabaseClient
                            .from("review_replies")
                            .insert({
                                user_id: sessionData.session.user.id,
                                review_id: selectedReview.id,
                                source: selectedReview.source.toLowerCase(),
                                location_id: locationId,
                                business_name: selectedReview.locationName,
                                tone: tonePreset,
                                length: lengthPreset,
                                reply_text: data.reply,
                                status: "draft"
                            })
                            .select("id, review_id, reply_text, status, created_at, sent_at")
                            .single();
                        if (!insertError && inserted) {
                            const row = inserted as ReviewReply;
                            setReplyHistory((prev) => [row, ...prev]);
                            setDraftReplyId(row.id);
                            setDraftByReview((prev) => ({ ...prev, [selectedReview.id]: true }));
                        } else if (import.meta.env.DEV) {
                            console.log("review_replies insert error:", insertError);
                        }
                    }
                }
            }
        } catch {
            setGenerationError("Erreur lors de la génération.");
            console.error("generate-reply error: request failed");
        } finally {
            setIsGenerating(false);
            setCooldownUntil(Date.now() + COOLDOWN_MS);
        }
    };

    const handleGenerateBrandVoice = async () => {
        if (!selectedReview) {
            return;
        }
        if (!supabase) {
            setGenerationError("Configuration Supabase manquante.");
            return;
        }
        setIsGenerating(true);
        setGenerationError(null);
        try {
            const token = await getAccessToken(supabase);
            const response = await fetch("/api/google/reply", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "draft",
                    review_id: selectedReview.reviewId ?? selectedReview.id,
                    location_id: selectedReview.locationId
                })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.draft_text) {
                setGenerationError("Impossible de générer une réponse pour le moment.");
                return;
            }
            setReplyText(payload.draft_text);
            setDrafts((prev) => ({ ...prev, [selectedReview.id]: payload.draft_text }));
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData.session?.user) {
                setGenerationError("Connecte-toi pour sauvegarder le brouillon.");
            } else {
                const locationId =
                    uuidRegex.test(selectedReview.locationId)
                        ? selectedReview.locationId
                        : null;
                const { data: inserted, error: insertError } = await supabase
                    .from("review_replies")
                    .insert({
                        user_id: sessionData.session.user.id,
                        review_id: selectedReview.id,
                        source: selectedReview.source.toLowerCase(),
                        location_id: locationId,
                        business_name: selectedReview.locationName,
                        tone: tonePreset,
                        length: lengthPreset,
                        reply_text: payload.draft_text,
                        status: "draft"
                    })
                    .select("id, review_id, reply_text, status, created_at, sent_at")
                    .single();
                if (!insertError && inserted) {
                    const row = inserted as ReviewReply;
                    setReplyHistory((prev) => [row, ...prev]);
                    setDraftReplyId(row.id);
                    setDraftByReview((prev) => ({ ...prev, [selectedReview.id]: true }));
                } else if (import.meta.env.DEV) {
                    console.log("review_replies insert error:", insertError);
                }
            }
        } catch {
            setGenerationError("Erreur lors de la génération.");
        } finally {
            setIsGenerating(false);
            setCooldownUntil(Date.now() + COOLDOWN_MS);
        }
    };

    const handleViewDraft = () => {
        if (!selectedReview) {
            return;
        }
        const latestDraft = replyHistory.find(
            (item: ReviewReply) => item.status === "draft"
        );
        if (!latestDraft) {
            setGenerationError("Aucun brouillon disponible pour cet avis.");
            return;
        }
        setReplyText(latestDraft.reply_text);
        setDrafts((prev) => ({ ...prev, [selectedReview.id]: latestDraft.reply_text }));
        setDraftReplyId(latestDraft.id);
    };

    const handleSave = async () => {
        if (!selectedReview) {
            return;
        }
        const supabaseClient = supabase;
        if (!draftReplyId || !supabaseClient) {
            setGenerationError("Aucun brouillon à sauvegarder.");
            return;
        }
        setReplySaving(true);
        try {
            const { error } = await supabaseClient
                .from("review_replies")
                .update({ reply_text: replyText })
                .eq("id", draftReplyId);
            if (error) {
                setGenerationError("Impossible de sauvegarder le brouillon.");
            } else {
                const now = new Date();
                setSavedAt(now.toISOString());
                setReplyHistory((prev) =>
                    prev.map((item) =>
                        item.id === draftReplyId
                            ? { ...item, reply_text: replyText }
                            : item
                    )
                );
                setActivityEvents((prev) => [
                    {
                        id: `save-${now.getTime()}`,
                        label: "Brouillon sauvegardé",
                        timestamp: "À l'instant"
                    },
                    ...prev
                ]);
            }
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
        const supabaseClient = supabase;
        if (!supabaseClient) {
            setGenerationError("Configuration Supabase manquante.");
            return;
        }
        const targets = filteredReviews.filter(
            (review: Review) => review.status === "new"
        );
        if (targets.length === 0) {
            setBatchError("Aucun avis à traiter.");
            return;
        }
        if (isCooldownActive) {
            setBatchError("Cooldown en cours. Réessaie dans quelques secondes.");
            return;
        }
        setBatchGenerating(true);
        setBatchError(null);
        setBatchProgress({ current: 0, total: targets.length });
        for (let index = 0; index < targets.length; index += 1) {
            const review = targets[index];
            setBatchProgress({ current: index + 1, total: targets.length });
            const preset = getRatingPreset(review.rating);
            const { data: genData, error: genError } = await supabaseClient.functions.invoke(
                "generate-reply",
                {
                    body: {
                        businessId: review.businessId,
                        reviewText: review.text,
                        rating: review.rating,
                        authorName: review.authorName,
                        businessName: review.locationName,
                        source: review.source.toLowerCase(),
                        tone: preset.tone,
                        length: preset.length
                    }
                }
            );
            if (genError?.status === 429 || genData?.error === "Rate limit") {
                setBatchError("Rate limit atteint. Réessaie plus tard.");
                break;
            }
            if (genError || !genData?.reply) {
                setBatchError("Erreur pendant la génération batch.");
                break;
            }
            const { data: sessionData } = await supabaseClient.auth.getSession();
            if (!sessionData.session?.user) {
                setBatchError("Connecte-toi pour sauvegarder les brouillons.");
                break;
            }
            const locationId = uuidRegex.test(review.locationId) ? review.locationId : null;
            const { data: inserted, error: insertError } = await supabaseClient
                .from("review_replies")
                .insert({
                    user_id: sessionData.session.user.id,
                    review_id: review.id,
                    source: review.source.toLowerCase(),
                    location_id: locationId,
                    business_name: review.locationName,
                    tone: preset.tone,
                    length: preset.length,
                    reply_text: genData.reply,
                    status: "draft"
                })
                .select("id, review_id, reply_text, status, created_at, sent_at")
                .single();
            if (!insertError && inserted) {
                setDraftByReview((prev) => ({ ...prev, [review.id]: true }));
            } else if (import.meta.env.DEV) {
                console.log("review_replies batch insert error:", insertError);
            }
        }
        setBatchGenerating(false);
    };

    return {
        state: {
            statusFilter,
            selectedLocation,
            datePreset,
            dateFrom,
            dateTo,
            sentimentFilter,
            ratingMin,
            ratingMax,
            tagFilter,
            selectedReviewId,
            lengthPreset,
            tonePreset,
            replyText,
            isGenerating,
            replyTab,
            drafts,
            aiSuggestion,
            aiSuggestionError,
            generationError,
            cooldownUntil,
            savedAt,
            activityEvents,
            businessSignature,
            businessMemory,
            sessionPreview,
            sessionExp,
            sessionError,
            replyHistory,
            replyHistoryLoading,
            replyHistoryError,
            draftReplyId,
            replySaving,
            replySending,
            draftByReview,
            batchGenerating,
            batchProgress,
            batchError,
            highlightReviewId,
            importStatus,
            aiStatus,
            aiRunLoading,
            aiRunMessage,
            aiRunStats,
            aiRunLocationLoading,
            aiRunLocationResult,
            isSupabaseAvailable,
            isCooldownActive,
            projectRef,
            timeZone,
            reviewsLoading,
            reviewsLoadingMore,
            reviewsHasMore,
            reviewsError,
            totalReviewsCount,
            locationReviewCounts,
            locations,
            filteredReviews,
            locationOptions,
            selectedReview,
            activeLocationId,
            aiStatusDisplay,
            aiStatusUi,
            isAdmin,
            reauthRequired,
            lastCronSyncAt,
            cronErrors
        },
        actions: {
            setStatusFilter,
            setSelectedLocation,
            setDatePreset,
            setDateFrom,
            setDateTo,
            setSentimentFilter,
            setRatingMin,
            setRatingMax,
            setTagFilter,
            setSelectedReviewId,
            setLengthPreset,
            setTonePreset,
            setReplyText,
            setReplyTab,
            handleRunAiForLocation,
            handleRunAiForSpecificLocation,
            handleGenerate,
            handleGenerateBrandVoice,
            handleViewDraft,
            handleSave,
            handleSend,
            handleGenerateBatch,
            fetchMoreReviews: reviewsQuery.fetchNextPage
        }
    };
};
