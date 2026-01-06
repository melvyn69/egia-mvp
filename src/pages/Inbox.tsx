import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";

const statusTabs = [
  { id: "new", label: "Nouveau" },
  { id: "reading", label: "À traiter" },
  { id: "replied", label: "Répondu" },
  { id: "archived", label: "Ignoré" },
  { id: "all", label: "Tout" }
] as const;

type StatusFilter = (typeof statusTabs)[number]["id"];
type ReviewStatus = "new" | "reading" | "replied" | "archived";

const isReviewStatus = (value: string | null | undefined): value is ReviewStatus =>
  value === "new" ||
  value === "reading" ||
  value === "replied" ||
  value === "archived";

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
  { id: "a2", label: "Avis assigné à Lucie", timestamp: "Il y a 1 h" },
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

const Inbox = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedReviewId, setSelectedReviewId] = useState<string>("");
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>("moyen");
  const [tonePreset, setTonePreset] = useState<TonePreset>("professionnel");
  const [replyText, setReplyText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyTab, setReplyTab] = useState<"reply" | "activity">("reply");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDisabled, setSyncDisabled] = useState(false);

  const isSupabaseAvailable = Boolean(supabase);
  const isCooldownActive = cooldownUntil ? cooldownUntil > Date.now() : false;
  const projectRef = getProjectRef(supabaseUrl);

  const loadInboxData = async () => {
    if (!supabase) {
      setReviews([]);
      return;
    }
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      if (!userId) {
        setReviews([]);
        setReviewsError("Session introuvable.");
        return;
      }

      const { data: locationsData, error: locationsError } = await supabase
        .from("google_locations")
        .select("location_resource_name, location_title")
        .order("updated_at", { ascending: false });
      if (locationsError) {
        console.error("google_locations fetch error:", locationsError);
      }
      const nextLocationsMap: Record<string, string> = {};
      (locationsData ?? []).forEach((location) => {
        if (location.location_resource_name) {
          nextLocationsMap[location.location_resource_name] =
            location.location_title ?? location.location_resource_name;
        }
      });
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("google_reviews")
        .select(
          "id, review_id, location_id, author_name, rating, comment, create_time, update_time, status"
        )
        .order("update_time", { ascending: false })
        .limit(50);

      if (reviewsError) {
        setReviewsError("Impossible de charger les avis.");
        setReviews([]);
        return;
      }

      const rows = (reviewsData ?? []) as ReviewRow[];
      const mapped = rows.map((row) => {
        const createdAt = row.create_time ?? row.update_time ?? new Date().toISOString();
        const updatedAt = row.update_time ?? createdAt;
        const status = isReviewStatus(row.status) ? row.status : "new";
        return {
          id: row.id,
          reviewId: row.review_id ?? row.id,
          locationName:
            nextLocationsMap[row.location_id] ?? row.location_id ?? "—",
          locationId: row.location_id,
          businessId: userId,
          authorName: row.author_name ?? "Anonyme",
          rating: row.rating ?? 0,
          source: "Google",
          status,
          createdAt,
          updatedAt,
          text: row.comment ?? "",
          tags: []
        } satisfies Review;
      });

      setReviews(mapped);
    } finally {
      setReviewsLoading(false);
    }
  };

  const locations = useMemo(() => {
    const unique = Array.from(new Set(reviews.map((review) => review.locationName)));
    return ["Tous", ...unique];
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((review) => {
      const matchesStatus =
        statusFilter === "all" ? true : review.status === statusFilter;
      const matchesLocation =
        selectedLocation === "all"
          ? true
          : review.locationName === selectedLocation;
      return matchesStatus && matchesLocation;
    });
  }, [reviews, statusFilter, selectedLocation]);

  useEffect(() => {
    if (filteredReviews.length === 0) {
      setSelectedReviewId("");
      return;
    }
    const stillVisible = filteredReviews.some((review) => review.id === selectedReviewId);
    if (!stillVisible) {
      setSelectedReviewId(filteredReviews[0].id);
    }
  }, [filteredReviews, selectedReviewId]);

  useEffect(() => {
    void loadInboxData();
  }, [isSupabaseAvailable]);

  const selectedReview = useMemo(() => {
    return reviews.find((review) => review.id === selectedReviewId) ?? null;
  }, [reviews, selectedReviewId]);

  useEffect(() => {
    if (!selectedReviewId) {
      setReplyText("");
      return;
    }
    setReplyText(drafts[selectedReviewId] ?? "");
  }, [drafts, selectedReviewId]);

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
        const latestDraft = rows.find((item) => item.status === "draft");
        setDraftReplyId(latestDraft?.id ?? null);
      }
      setReplyHistoryLoading(false);
    };

    void loadReplies();
  }, [selectedReview, selectedReviewId]);

  useEffect(() => {
    const supabaseClient = supabase;
    const reviewIds = filteredReviews.map((review) => review.id);
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

  const handleSyncReviews = async () => {
    setSyncError(null);
    setSyncDisabled(false);
    if (!supabase) {
      setSyncError("Connexion Supabase requise.");
      return;
    }
    setSyncLoading(true);
    try {
      const jwt = await getAccessToken(supabase);
      const response = await fetch("/api/google/gbp/reviews/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`
        }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        if (data?.error === "reauth_required") {
          setSyncError("Reconnecte Google.");
          setSyncDisabled(true);
        } else {
          setSyncError("Erreur de synchronisation.");
        }
        return;
      }
      setSyncDisabled(false);
      await loadInboxData();
    } catch (error) {
      console.error(error);
      setSyncError("Erreur de synchronisation.");
    } finally {
      setSyncLoading(false);
    }
  };

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
    setReplySending(true);
    try {
      const userToken = await getAccessToken(supabaseClient);
      // TODO: publish_reply_to_google(review)
      const projectRef = getProjectRef(supabaseUrl);
      if (import.meta.env.DEV) {
        console.log("projectRef", projectRef ?? "—");
        console.log(
          "access_token parts/len",
          userToken.split(".").length,
          userToken.length
        );
        const { data: userData } = await supabaseClient.auth.getUser();
        console.log("post-reply-google userId", userData.user?.id ?? "null");
        console.log("post-reply-google: invoking", {
          reviewId: selectedReview.reviewId
        });
      }
      const response = await fetch(
        `${supabaseUrl}/functions/v1/post-reply-google`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey ?? "",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            reviewId: selectedReview.reviewId,
            replyText,
            userToken
          })
        }
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
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
      if (import.meta.env.DEV) {
        console.log("post-reply-google: response", { data, error });
      }
      if (error || !data?.ok) {
        setGenerationError("Impossible d'envoyer la réponse.");
        return;
      }
      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabaseClient
        .from("review_replies")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", draftReplyId);
      if (updateError) {
        setGenerationError("Réponse envoyée, mais statut non mis à jour.");
      } else {
        setReplyHistory((prev) =>
          prev.map((item) =>
            item.id === draftReplyId
              ? { ...item, status: "sent", sent_at: sentAt }
              : item
          )
        );
        setDraftReplyId(null);
        setDraftByReview((prev) => ({ ...prev, [selectedReview.id]: false }));
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
    const targets = filteredReviews.filter((review) => review.status === "new");
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Boîte de réception</h2>
        <p className="text-sm text-slate-500">
          Réponses aux avis et suivi des interactions clients.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncReviews}
            disabled={syncLoading || syncDisabled}
          >
            {syncLoading ? "Synchronisation..." : "Synchroniser les avis"}
          </Button>
          {syncError && (
            <span className="text-xs font-medium text-amber-700">
              {syncError}
            </span>
          )}
          {reviewsError && (
            <span className="text-xs font-medium text-amber-700">
              {reviewsError}
            </span>
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
                disabled={batchGenerating || filteredReviews.length === 0}
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
                onChange={(event) =>
                  setSelectedLocation(
                    event.target.value === "Tous" ? "all" : event.target.value
                  )
                }
              >
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location === "Tous" ? "Tous" : location}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewsLoading ? (
              <p className="text-sm text-slate-500">Chargement des avis...</p>
            ) : filteredReviews.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun avis à afficher.</p>
            ) : (
              filteredReviews.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => setSelectedReviewId(review.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:border-slate-300 ${
                    selectedReviewId === review.id
                      ? "border-slate-400 bg-slate-50"
                      : "border-slate-200"
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
                    <Badge variant={statusVariantMap[review.status]}>
                      {statusLabelMap[review.status]}
                    </Badge>
                    {draftByReview[review.id] && (
                      <Badge variant="success">Draft saved</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <span>
                      {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                      {"☆".repeat(5 - Math.max(0, Math.min(5, review.rating)))}
                    </span>
                    <span>{review.source}</span>
                    <span>•</span>
                    <span>{formatDate(review.createdAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                    {review.text}
                  </p>
                </button>
              ))
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
                </div>

                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {selectedReview.text}
                </p>

                <div className="flex flex-wrap gap-2">
                  {selectedReview.tags.map((tag) => (
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

                <div>
                  <textarea
                    className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
                    placeholder="Générer une réponse..."
                    value={replyText}
                    onChange={(event) => {
                      const next = event.target.value;
                      setReplyText(next);
                      if (selectedReview) {
                        setDrafts((prev) => ({ ...prev, [selectedReview.id]: next }));
                      }
                    }}
                  />
                  <div className="mt-2 text-right text-xs text-slate-500">
                    {replyText.length} caractères
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      !selectedReview ||
                      !isSupabaseAvailable ||
                      isCooldownActive
                    }
                  >
                    {isGenerating ? "Génération..." : "Générer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      !selectedReview ||
                      !isSupabaseAvailable ||
                      isCooldownActive
                    }
                  >
                    Regénérer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSave}
                    disabled={
                      isGenerating ||
                      replySaving ||
                      !selectedReview ||
                      !draftReplyId
                    }
                  >
                    {replySaving ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSend}
                    disabled={
                      isGenerating ||
                      replySending ||
                      !selectedReview ||
                      !draftReplyId
                    }
                  >
                    {replySending ? "Envoi..." : "Envoyer"}
                  </Button>
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
