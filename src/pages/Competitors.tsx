import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Eye,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  BookmarkPlus,
  BookmarkX
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type CompetitorsProps = {
  session: Session | null;
};

type LocationOption = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
};

type CompetitorRow = {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  distance_m: number | null;
  rating: number | null;
  user_ratings_total: number | null;
  is_followed: boolean;
  location_id: string | null;
  years_active?: number | null;
};

type SettingsRow = {
  competitive_monitoring_enabled?: boolean | null;
  competitive_monitoring_keyword?: string | null;
  competitive_monitoring_radius_km?: number | null;
};

type TabId = "selection" | "radar" | "swot";

const scoreCompetitor = (row: {
  rating: number | null;
  user_ratings_total: number | null;
}) => {
  const rating = typeof row.rating === "number" ? row.rating : 0;
  const reviews = typeof row.user_ratings_total === "number" ? row.user_ratings_total : 0;
  return rating * Math.log10(1 + reviews);
};

const formatDistance = (value: number | null) => {
  if (!value) return "—";
  if (value < 1000) return `${value} m`;
  return `${(value / 1000).toFixed(1)} km`;
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const getCompetitorInsights = (row: CompetitorRow) => {
  const insights: string[] = [];
  if (typeof row.rating === "number") {
    if (row.rating >= 4.5) insights.push("Excellente note");
    if (row.rating <= 3.5) insights.push("Note a ameliorer");
  }
  if (typeof row.user_ratings_total === "number") {
    if (row.user_ratings_total >= 200) insights.push("Volume d'avis eleve");
    if (row.user_ratings_total <= 20) insights.push("Peu d'avis");
  }
  if (typeof row.distance_m === "number" && row.distance_m <= 800) {
    insights.push("Tres proche");
  }
  return insights;
};

const getStrategicTags = (
  row: CompetitorRow,
  selfAvg: number | null,
  radiusKm: number
) => {
  const tags: string[] = [];
  const rating = typeof row.rating === "number" ? row.rating : null;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
  const distance = typeof row.distance_m === "number" ? row.distance_m : null;
  const delta = selfAvg !== null && rating !== null ? rating - selfAvg : null;
  const dangerRadius = radiusKm * 1000 * 0.5;

  if (rating !== null && rating >= 4.8) tags.push("Tres bien note");
  if (reviews !== null && reviews >= 200) tags.push("Fort volume");
  if (distance !== null && distance <= 800) tags.push("Tres proche");
  if (delta !== null && delta <= -0.3) tags.push("Risque eleve");
  if (delta !== null && delta >= 0.2) tags.push("A surveiller");
  if (distance !== null && distance <= dangerRadius && rating !== null && rating >= 4.8) {
    tags.push("Impact local");
  }
  return tags.slice(0, 4);
};

const getOpportunitiesToCheck = (row: CompetitorRow) => {
  const suggestions: string[] = [];
  const rating = typeof row.rating === "number" ? row.rating : null;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
  if (rating !== null && rating >= 4.6) {
    suggestions.push("Verifier l’accueil et les services additionnels.");
  }
  if (reviews !== null && reviews >= 200) {
    suggestions.push("Verifier les leviers d’acquisition d’avis.");
  }
  if (suggestions.length === 0) {
    suggestions.push("Verifier les avantages perçus par les clients.");
  }
  return suggestions.slice(0, 2);
};

const getWatchlistRationale = (row: CompetitorRow, selfAvg: number | null) => {
  const rating = typeof row.rating === "number" ? row.rating : null;
  const distance = typeof row.distance_m === "number" ? row.distance_m : null;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
  const isVeryClose = distance !== null && distance <= 1000;
  const isClose = distance !== null && distance <= 3000;
  const hasStrongVolume = reviews !== null && reviews >= 150;

  if (selfAvg !== null && rating !== null) {
    const delta = rating - selfAvg;
    if (delta >= 0.2 && isVeryClose) {
      return "Note superieure et concurrent tres proche.";
    }
    if (delta >= 0.2 && hasStrongVolume) {
      return "Note superieure avec un volume d’avis eleve.";
    }
    if (delta <= -0.2 && hasStrongVolume) {
      return "Volume d’avis eleve mais note inferieure a la votre.";
    }
    if (delta >= 0.2 && isClose) {
      return "Note superieure dans votre zone immediate.";
    }
  }

  if (isVeryClose && hasStrongVolume) {
    return "Concurrent tres proche avec un volume d’avis eleve.";
  }
  if (isVeryClose) {
    return "Concurrent tres proche de votre emplacement.";
  }
  if (hasStrongVolume) {
    return "Volume d’avis eleve dans votre zone.";
  }
  return "Concurrent comparable dans votre zone.";
};

const Competitors = ({ session }: CompetitorsProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("selection");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanErrorHint, setScanErrorHint] = useState<string | null>(null);
  const [radarSort, setRadarSort] = useState<"distance" | "rating" | "reviews">(
    "distance"
  );
  const [radarFilter, setRadarFilter] = useState<
    "all" | "top3" | "high" | "low"
  >("all");
  const [radarSearch, setRadarSearch] = useState("");
  const [radarFollowedOnly, setRadarFollowedOnly] = useState(false);
  const [radarTopLimit, setRadarTopLimit] = useState<10 | 25 | 50>(25);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [radarPageSize, setRadarPageSize] = useState(6);
  const [pendingPlaceIds, setPendingPlaceIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;

  const locationsQuery = useQuery({
    queryKey: ["competitors-locations", userId],
    queryFn: async () => {
      if (!supabase || !userId) return [] as LocationOption[];
      const { data, error } = await supabase
        .from("google_locations")
        .select("id, location_title, location_resource_name")
        .eq("user_id", userId)
        .order("location_title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LocationOption[];
    },
    enabled: Boolean(userId)
  });

  const settingsQuery = useQuery({
    queryKey: ["competitors-settings", userId],
    queryFn: async () => {
      if (!supabase || !userId) return null as SettingsRow | null;
      const { data, error } = await supabase
        .from("business_settings")
        .select(
          "competitive_monitoring_enabled, competitive_monitoring_keyword, competitive_monitoring_radius_km"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SettingsRow | null;
    },
    enabled: Boolean(userId)
  });

  useEffect(() => {
    const list = locationsQuery.data ?? [];
    if (!selectedLocationId && list.length > 0) {
      setSelectedLocationId(list[0].id);
    }
  }, [locationsQuery.data, selectedLocationId]);

  useEffect(() => {
    const row = settingsQuery.data;
    if (!row) return;
    if (!keyword) {
      setKeyword(row.competitive_monitoring_keyword ?? "");
    }
    if (row.competitive_monitoring_radius_km && radiusKm === 5) {
      setRadiusKm(row.competitive_monitoring_radius_km);
    }
  }, [settingsQuery.data, keyword, radiusKm]);

  const radarQuery = useQuery({
    queryKey: ["competitors-radar", userId, selectedLocationId],
    queryFn: async () => {
      if (!token || !selectedLocationId) return [] as CompetitorRow[];
      const response = await fetch("/api/reports/competitors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "list",
          location_id: selectedLocationId,
          mode: "radar"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.items) {
        throw new Error("Failed to load competitors");
      }
      return payload.items as CompetitorRow[];
    },
    enabled: Boolean(token && selectedLocationId)
  });

  const followedQuery = useQuery({
    queryKey: ["competitors-followed", userId, selectedLocationId],
    queryFn: async () => {
      if (!token || !selectedLocationId) return [] as CompetitorRow[];
      const response = await fetch("/api/reports/competitors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "list",
          location_id: selectedLocationId,
          mode: "followed"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.items) {
        throw new Error("Failed to load competitors");
      }
      return payload.items as CompetitorRow[];
    },
    enabled: Boolean(token && selectedLocationId)
  });

  const selfStatsQuery = useQuery({
    queryKey: ["competitors-self", userId, selectedLocationId],
    queryFn: async () => {
      if (!supabase || !userId || !selectedLocationId) return null;
      const { data, error } = await supabase
        .from("google_reviews")
        .select("rating")
        .eq("user_id", userId)
        .eq("location_id", selectedLocationId)
        .limit(200);
      if (error) throw error;
      const ratings = (data ?? [])
        .map((row: { rating: number | null }) => Number(row.rating))
        .filter((value) => Number.isFinite(value));
      if (ratings.length === 0) {
        return { avg: null, count: 0 };
      }
      const sum = ratings.reduce((acc, value) => acc + value, 0);
      return { avg: sum / ratings.length, count: ratings.length };
    },
    enabled: Boolean(userId && selectedLocationId)
  });

  const scanMutation = useMutation({
    mutationFn: async (input?: { keyword?: string; radiusKm?: number }) => {
      if (!token || !selectedLocationId) {
        throw new Error("Missing location");
      }
      const scanKeyword = (input?.keyword ?? keyword).trim();
      const scanRadius = input?.radiusKm ?? radiusKm;
      if (!scanKeyword || !scanRadius) {
        throw new Error("Missing scan parameters");
      }
      const response = await fetch("/api/reports/competitors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "scan",
          location_id: selectedLocationId,
          radius_km: scanRadius,
          keyword: scanKeyword
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const err = new Error(payload?.error?.message ?? "Scan failed") as Error & {
          details?: { hint?: string };
        };
        if (payload?.error?.details?.hint) {
          err.details = { hint: payload.error.details.hint };
        }
        throw err;
      }
      return payload;
    },
    onSuccess: (payload) => {
      const count = typeof payload?.scanned === "number" ? payload.scanned : null;
      const durationMs =
        typeof payload?.duration_ms === "number" ? payload.duration_ms : null;
      const durationLabel =
        typeof durationMs === "number" ? `${(durationMs / 1000).toFixed(1)}s` : "";
      const labelParts = [
        count !== null ? `${count} concurrents` : null,
        payload?.radius_km ? `${payload.radius_km} km` : null,
        payload?.keyword ? `"${payload.keyword}"` : null,
        durationLabel ? `${durationLabel}` : null
      ].filter(Boolean);
      setScanMessage(
        labelParts.length > 0
          ? `Scan termine: ${labelParts.join(" • ")}.`
          : "Scan termine."
      );
      setScanError(null);
      setScanErrorHint(null);
      setLastScanAt(new Date());
      queryClient.invalidateQueries({
        queryKey: ["competitors-radar", userId, selectedLocationId]
      });
      queryClient.invalidateQueries({
        queryKey: ["competitors-followed", userId, selectedLocationId]
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de scanner.";
      const hint =
        error instanceof Error &&
        (error as Error & { details?: { hint?: string } }).details?.hint
          ? (error as Error & { details?: { hint?: string } }).details?.hint
          : null;
      setScanError(message);
      setScanErrorHint(hint ?? null);
      setScanMessage(null);
    }
  });

  const handleGenerateBenchmark = async () => {
    if (!token) {
      setToast({ type: "error", message: "Connectez-vous pour generer." });
      return;
    }
    if (!selectedLocationId) {
      setToast({ type: "error", message: "Selectionnez un etablissement." });
      return;
    }
    setBenchmarkLoading(true);
    setToast(null);
    try {
      const payload = {
        action: "generate",
        location_id: selectedLocationId,
        keyword: keyword.trim() || settingsQuery.data?.competitive_monitoring_keyword,
        radius_km: radiusKm || settingsQuery.data?.competitive_monitoring_radius_km
      };
      const response = await fetch("/api/reports/competitors-benchmark", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.report) {
        throw new Error(data?.error?.message ?? "Echec de generation.");
      }
      setToast({
        type: "success",
        message: "Rapport concurrentiel genere."
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Echec de generation.";
      setToast({ type: "error", message });
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const followMutation = useMutation({
    mutationFn: async (payload: { placeId: string; isFollowed: boolean }) => {
      if (!token || !selectedLocationId) {
        throw new Error("Missing location");
      }
      const response = await fetch("/api/reports/competitors", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: payload.isFollowed ? "follow" : "unfollow",
          location_id: selectedLocationId,
          place_id: payload.placeId,
          is_followed: payload.isFollowed
        })
      });
      const payloadResponse = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payloadResponse?.error?.message ?? "Update failed");
      }
      return payloadResponse;
    },
    onMutate: async (payload) => {
      const placeId = payload.placeId;
      const isFollowed = payload.isFollowed;
      setPendingPlaceIds((prev) =>
        prev.includes(placeId) ? prev : [...prev, placeId]
      );
      const radarKey = ["competitors-radar", userId, selectedLocationId];
      const followedKey = ["competitors-followed", userId, selectedLocationId];
      const previousRadar =
        queryClient.getQueryData<CompetitorRow[]>(radarKey) ?? [];
      const previousFollowed =
        queryClient.getQueryData<CompetitorRow[]>(followedKey) ?? [];
      const updateList = (list: CompetitorRow[]) =>
        list.map((row) =>
          row.place_id === placeId ? { ...row, is_followed: isFollowed } : row
        );
      const radarUpdate = updateList(previousRadar);
      const fromRadar = previousRadar.find((row) => row.place_id === placeId);
      let followedUpdate = updateList(previousFollowed);
      if (isFollowed) {
        if (!followedUpdate.find((row) => row.place_id === placeId) && fromRadar) {
          followedUpdate = [{ ...fromRadar, is_followed: true }, ...followedUpdate];
        }
      } else {
        followedUpdate = followedUpdate.filter((row) => row.place_id !== placeId);
      }
      queryClient.setQueryData(radarKey, radarUpdate);
      queryClient.setQueryData(followedKey, followedUpdate);
      return { previousRadar, previousFollowed, placeId };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousRadar) {
        queryClient.setQueryData(
          ["competitors-radar", userId, selectedLocationId],
          context.previousRadar
        );
      }
      if (context?.previousFollowed) {
        queryClient.setQueryData(
          ["competitors-followed", userId, selectedLocationId],
          context.previousFollowed
        );
      }
      setToast({ type: "error", message: "Action impossible pour le moment." });
    },
    onSuccess: (_data, payload) => {
      setToast({
        type: "success",
        message: payload.isFollowed
          ? "Concurrent ajoute a la selection."
          : "Concurrent retire."
      });
      queryClient.invalidateQueries({
        queryKey: ["competitors-radar", userId, selectedLocationId]
      });
      queryClient.invalidateQueries({
        queryKey: ["competitors-followed", userId, selectedLocationId]
      });
    },
    onSettled: (_data, _error, payload) => {
      setPendingPlaceIds((prev) =>
        prev.filter((id) => id !== payload.placeId)
      );
    }
  });

  const radarItems = radarQuery.data ?? [];
  const followedItems = followedQuery.data ?? [];
  const settingsRow = settingsQuery.data;
  const enabled = Boolean(settingsRow?.competitive_monitoring_enabled);
  const keywordReady = Boolean(settingsRow?.competitive_monitoring_keyword);
  const googleConnected = (locationsQuery.data ?? []).length > 0;
  const statusKeyword = settingsRow?.competitive_monitoring_keyword ?? "";
  const statusRadius = settingsRow?.competitive_monitoring_radius_km ?? radiusKm;
  const locationsEmpty =
    !locationsQuery.isLoading && (locationsQuery.data ?? []).length === 0;

  const radarRatings = radarItems
    .map((row) => row.rating)
    .filter((value): value is number => typeof value === "number");
  const radarReviewCounts = radarItems
    .map((row) => row.user_ratings_total)
    .filter((value): value is number => typeof value === "number");
  const radarDistances = radarItems
    .map((row) => row.distance_m)
    .filter((value): value is number => typeof value === "number");
  const medianRating = median(radarRatings);
  const medianReviews = median(radarReviewCounts);
  const medianDistance = median(radarDistances);
  const maxRating = radarRatings.length > 0 ? Math.max(...radarRatings) : 0;

  const filteredRadar = useMemo(() => {
    let items = radarItems.slice();
    const search = radarSearch.trim().toLowerCase();
    if (search) {
      items = items.filter((row) =>
        (row.name ?? "").toLowerCase().includes(search)
      );
    }
    if (radarFollowedOnly) {
      items = items.filter((row) => row.is_followed);
    }
    if (radarFilter === "top3") {
      items = items.slice(0, 3);
    }
    if (radarFilter === "high") {
      items = items.filter((row) => (row.rating ?? 0) >= 4.5);
    }
    if (radarFilter === "low") {
      items = items.filter((row) => (row.rating ?? 0) < 3.5);
    }
    if (radarSort === "rating") {
      items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (radarSort === "reviews") {
      items.sort(
        (a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0)
      );
    } else {
      items.sort((a, b) => {
        const distanceDiff = (a.distance_m ?? 0) - (b.distance_m ?? 0);
        if (distanceDiff !== 0) return distanceDiff;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
    }
    if (radarTopLimit) {
      items = items.slice(0, radarTopLimit);
    }
    return items;
  }, [radarItems, radarFilter, radarSort, radarSearch, radarFollowedOnly, radarTopLimit]);

  useEffect(() => {
    setRadarPageSize(6);
  }, [
    radarFilter,
    radarSort,
    radarSearch,
    radarFollowedOnly,
    radarTopLimit,
    selectedLocationId,
    radarItems.length
  ]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timeout);
  }, [toast]);

  const getRadarTier = (row: CompetitorRow) => {
    const rating = row.rating ?? 0;
    const reviews = row.user_ratings_total ?? 0;
    const distance = row.distance_m ?? Number.MAX_SAFE_INTEGER;
    if (rating >= maxRating && reviews > medianReviews) {
      return { label: "Leader", variant: "success" as const };
    }
    if (rating >= medianRating && distance <= medianDistance) {
      return { label: "Challenger", variant: "warning" as const };
    }
    return { label: "Outsider", variant: "neutral" as const };
  };

  const sortedFollowed = useMemo(() => {
    return followedItems
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a));
  }, [followedItems]);

  const getSelectionTier = (row: CompetitorRow) => {
    const selfAvg = selfStatsQuery.data?.avg ?? null;
    if (selfAvg === null) {
      return { label: "OUTSIDER", variant: "neutral" as const };
    }
    const rating = row.rating ?? 0;
    if (rating >= selfAvg + 0.2) {
      return { label: "LEADER", variant: "success" as const };
    }
    if (rating >= selfAvg - 0.2) {
      return { label: "CHALLENGER", variant: "warning" as const };
    }
    return { label: "OUTSIDER", variant: "neutral" as const };
  };

  const swotReport = useMemo(() => {
    const source = sortedFollowed.length > 0 ? sortedFollowed : radarItems;
    const ratings = source
      .map((row) => row.rating)
      .filter((value): value is number => typeof value === "number");
    const reviewCounts = source
      .map((row) => row.user_ratings_total)
      .filter((value): value is number => typeof value === "number");
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((acc, value) => acc + value, 0) / ratings.length
        : null;
    const avgVolume =
      reviewCounts.length > 0
        ? reviewCounts.reduce((acc, value) => acc + value, 0) / reviewCounts.length
        : null;
    const minRating = ratings.length > 0 ? Math.min(...ratings) : null;
    const maxRating = ratings.length > 0 ? Math.max(...ratings) : null;
    const highRatedCount = source.filter((row) => (row.rating ?? 0) >= 4.5).length;
    const nearbyHighRated = source.filter(
      (row) => (row.rating ?? 0) >= 4.5 && (row.distance_m ?? 999999) <= 1000
    ).length;
    const topCompetitors = source
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a));
    return {
      source,
      avgRating,
      avgVolume,
      minRating,
      maxRating,
      highRatedCount,
      nearbyHighRated,
      leader: topCompetitors[0] ?? null,
      challenger: topCompetitors[1] ?? null
    };
  }, [radarItems, sortedFollowed]);

  const podium = useMemo(() => {
    const selfAvg = selfStatsQuery.data?.avg ?? null;
    const selfCount = selfStatsQuery.data?.count ?? 0;
    const selfScore =
      selfAvg !== null ? selfAvg * Math.log10(1 + selfCount) : null;
    const source = sortedFollowed.length > 0 ? sortedFollowed : radarItems;
    const topCompetitors = source
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a))
      .slice(0, 2);
    return {
      self: { score: selfScore, avg: selfAvg, count: selfCount },
      competitors: topCompetitors
    };
  }, [radarItems, sortedFollowed, selfStatsQuery.data]);

  const topScores = radarItems.map((row) => scoreCompetitor(row));
  const selfScoreValue = podium.self.score ?? null;
  const top10Threshold = topScores
    .slice()
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, Math.ceil(topScores.length * 0.1)))
    .pop();
  const isTop10 =
    selfScoreValue !== null && top10Threshold !== undefined
      ? selfScoreValue >= top10Threshold
      : false;

  const visibleRadar = filteredRadar.slice(0, radarPageSize);
  const canLoadMore = filteredRadar.length > radarPageSize;
  const skeletonCards = Array.from({ length: 4 }, (_, index) => (
    <Skeleton key={`skeleton-${index}`} className="h-40 w-full" />
  ));

  const buildGoogleLink = (placeId: string) =>
    `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  const formatDelta = (delta: number) =>
    `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
  const selfAvg = selfStatsQuery.data?.avg ?? null;
  const selfCount = selfStatsQuery.data?.count ?? null;
  const selfScoreLabel = selfAvg !== null ? selfAvg.toFixed(2) : "—";
  const selfReviewsLabel = selfCount !== null ? `${selfCount}` : "—";

  const radarSummary = useMemo(() => {
    const total = radarItems.length;
    const higherThanSelf =
      selfAvg !== null
        ? radarItems.filter((row) => (row.rating ?? 0) > selfAvg).length
        : null;
    const distances = radarItems
      .map((row) => row.distance_m)
      .filter((value): value is number => typeof value === "number");
    const closestDistance =
      distances.length > 0 ? Math.min(...distances) : null;
    const ratings = radarItems
      .map((row) => row.rating)
      .filter((value): value is number => typeof value === "number");
    const reviews = radarItems
      .map((row) => row.user_ratings_total)
      .filter((value): value is number => typeof value === "number");
    const medianRating = ratings.length > 0 ? median(ratings) : null;
    const medianReviews = reviews.length > 0 ? median(reviews) : null;
    const bestRating = ratings.length > 0 ? Math.max(...ratings) : null;
    const dangerRadius = radiusKm * 1000 * 0.5;
    const riskyCount = radarItems.filter(
      (row) =>
        typeof row.rating === "number" &&
        typeof row.distance_m === "number" &&
        row.rating >= 4.8 &&
        row.distance_m <= dangerRadius
    ).length;
    return {
      total,
      higherThanSelf,
      closestDistance,
      medianRating,
      medianReviews,
      bestRating,
      riskyCount
    };
  }, [radarItems, selfAvg, radiusKm]);

  const swotBullets = useMemo(() => {
    const forces: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];
    const actions: string[] = [];

    if (selfAvg !== null && swotReport.avgRating !== null) {
      const delta = selfAvg - swotReport.avgRating;
      if (delta >= 0.2) {
        forces.push(
          `Note superieure de ${formatDelta(delta)} vs moyenne (${selfAvg.toFixed(
            1
          )} vs ${swotReport.avgRating.toFixed(1)}).`
        );
      } else if (delta <= -0.2) {
        weaknesses.push(
          `Note inferieure de ${formatDelta(Math.abs(delta))} vs moyenne (${selfAvg.toFixed(
            1
          )} vs ${swotReport.avgRating.toFixed(1)}).`
        );
      }
    }

    if (selfCount !== null && swotReport.avgVolume !== null) {
      const avgVolume = swotReport.avgVolume;
      if (selfCount >= avgVolume * 1.2) {
        forces.push(
          `Volume d'avis superieur a la moyenne (${selfCount} vs ~${Math.round(
            avgVolume
          )}).`
        );
      } else if (selfCount <= avgVolume * 0.8) {
        weaknesses.push(
          `Volume d'avis inferieur a la moyenne (${selfCount} vs ~${Math.round(
            avgVolume
          )}).`
        );
      }
    }

    if (
      selfAvg !== null &&
      swotReport.maxRating !== null &&
      selfAvg >= swotReport.maxRating
    ) {
      forces.push(`Au niveau du meilleur note (${selfAvg.toFixed(1)}).`);
    }

    if (swotReport.leader?.rating !== null && selfAvg !== null) {
      const delta = swotReport.leader.rating - selfAvg;
      if (delta >= 0.3) {
        weaknesses.push(`Leader a ${formatDelta(delta)} points d'avance.`);
      } else if (delta > 0 && delta <= 0.2) {
        opportunities.push(
          `Ecart faible avec le leader (${formatDelta(delta)}).`
        );
      }
    }

    if (swotReport.minRating !== null && swotReport.minRating <= 3.5) {
      opportunities.push("Certains concurrents sont notes sous 3.5.");
    }

    if (swotReport.avgVolume !== null && swotReport.avgVolume < 30) {
      opportunities.push(
        `Marche peu dense (volume moyen ~${Math.round(swotReport.avgVolume)} avis).`
      );
    }

    if (
      swotReport.leader?.rating !== null &&
      selfAvg !== null &&
      swotReport.leader.user_ratings_total !== null &&
      selfCount !== null &&
      swotReport.leader.rating >= selfAvg + 0.3 &&
      swotReport.leader.user_ratings_total > selfCount
    ) {
      threats.push("Leader mieux note avec plus d'avis.");
    }

    if (swotReport.highRatedCount >= 3) {
      threats.push(
        `${swotReport.highRatedCount} concurrents notes >= 4.5.`
      );
    }

    if (swotReport.nearbyHighRated > 0) {
      threats.push(
        `${swotReport.nearbyHighRated} concurrent(s) tres bien notes a moins d'1 km.`
      );
    }

    if (weaknesses.length > 0 && swotReport.avgRating !== null) {
      actions.push(
        `Renforcer la satisfaction client parce que la moyenne marche est a ${swotReport.avgRating.toFixed(
          1
        )}.`
      );
    }
    if (selfCount !== null && swotReport.avgVolume !== null && selfCount <= swotReport.avgVolume * 0.8) {
      actions.push(
        `Collecter plus d'avis parce que le volume moyen est ~${Math.round(
          swotReport.avgVolume
        )}.`
      );
    }
    if (swotReport.nearbyHighRated > 0) {
      actions.push(
        `Mettre en avant vos atouts locaux parce que ${swotReport.nearbyHighRated} concurrent(s) tres bien notes sont proches.`
      );
    }
    if (swotReport.leader?.rating !== null && selfAvg !== null) {
      const delta = swotReport.leader.rating - selfAvg;
      if (delta > 0 && delta <= 0.2) {
        actions.push(
          `Gagner quelques points de note pour depasser le leader (${formatDelta(
            delta
          )}).`
        );
      }
    }
    if (swotReport.minRating !== null && swotReport.minRating <= 3.5) {
      actions.push(
        "Cibler les faiblesses des concurrents les moins bien notes."
      );
    }

    const trimList = (list: string[]) => list.slice(0, 3);
    return {
      forces: trimList(forces),
      weaknesses: trimList(weaknesses),
      opportunities: trimList(opportunities),
      threats: trimList(threats),
      actions: actions.slice(0, 5)
    };
  }, [selfAvg, selfCount, swotReport]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">
            Veille concurrentielle
          </h1>
          <p className="text-sm text-slate-500">
            Pilotez votre positionnement local avec une lecture claire du marché.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variant={googleConnected ? "success" : "neutral"}>
              {googleConnected ? "Google connecte" : "Google non connecte"}
            </Badge>
            <Badge variant={enabled ? "success" : "neutral"}>
              {enabled ? "Veille activee" : "Veille desactivee"}
            </Badge>
            {statusKeyword ? (
              <Badge variant="neutral">Mot-cle: {statusKeyword}</Badge>
            ) : (
              <Badge variant="neutral">Mot-cle manquant</Badge>
            )}
            <Badge variant="neutral">Rayon: {statusRadius} km</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Badge variant="neutral">MVP</Badge>
        </div>
      </div>

      {toast && (
        <div className="sticky top-4 z-20 flex justify-end pointer-events-none">
          <div
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-600"
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Fermer"
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <Card className="relative z-10">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Contrôles</CardTitle>
          <div className="text-[11px] text-slate-400">
            Dernier scan:{" "}
            {lastScanAt
              ? `${lastScanAt.toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short"
                })} • ${lastScanAt.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}`
              : "—"}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(!enabled || !keywordReady) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <span>
                Activez la veille concurrentielle et renseignez le mot-cle dans
                Parametres.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/settings?tab=locations")}
              >
                Ouvrir les parametres
              </Button>
            </div>
          )}
          {locationsEmpty ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              <p className="text-base font-semibold text-slate-800">
                🏬 Aucun etablissement selectionne
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Aucun etablissement n’est associe a ce compte. Selectionnez un lieu pour lancer la veille.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate("/settings?tab=locations")}
              >
                Choisir un etablissement
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[2.2fr_1fr_1fr_1fr_1fr]">
              <label className="text-xs font-semibold text-slate-600">
                Etablissement
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  value={selectedLocationId ?? ""}
                  onChange={(event) =>
                    setSelectedLocationId(event.target.value || null)
                  }
                >
                  {locationsQuery.isLoading && <option>Chargement...</option>}
                  {!locationsQuery.isLoading &&
                    (locationsQuery.data ?? []).map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.location_title || location.location_resource_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Mot-cle
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="restaurant italien"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Rayon
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  value={radiusKm}
                  onChange={(event) =>
                    setRadiusKm(Number(event.target.value))
                  }
                >
                  <option value={1}>1 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={20}>20 km</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() => scanMutation.mutate({})}
                  disabled={!keyword || scanMutation.isPending || !selectedLocationId}
                >
                  <span className="flex items-center justify-center gap-2">
                    {scanMutation.isPending && (
                      <span className="h-3 w-3 animate-spin rounded-full border border-white/70 border-t-white" />
                    )}
                    {scanMutation.isPending ? "Analyse..." : "Lancer l’analyse"}
                  </span>
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const fallbackKeyword =
                      keyword || settingsRow?.competitive_monitoring_keyword || "";
                    const fallbackRadius =
                      radiusKm || settingsRow?.competitive_monitoring_radius_km || 0;
                    if (!selectedLocationId) return;
                    if (!enabled || !fallbackKeyword || !fallbackRadius) {
                      setScanError(
                        "Configurez le mot-cle et le rayon avant de lancer un scan."
                      );
                      setScanErrorHint(
                        "Renseignez les parametres dans Parametres > Etablissements."
                      );
                      setScanMessage(null);
                      return;
                    }
                    setKeyword(fallbackKeyword);
                    setRadiusKm(fallbackRadius);
                    scanMutation.mutate({
                      keyword: fallbackKeyword,
                      radiusKm: fallbackRadius
                    });
                  }}
                  disabled={!selectedLocationId || scanMutation.isPending}
                >
                  Relancer
                </Button>
              </div>
            </div>
          )}
          {scanMutation.isPending && (
            <p className="text-xs text-slate-500">Analyse en cours…</p>
          )}
          {scanMessage && (
            <p className="text-xs text-emerald-600">
              {scanMessage}
            </p>
          )}
          {scanError && (
            <div className="text-xs text-rose-600">
              <p>{scanError}</p>
              {scanErrorHint && (
                <p className="text-rose-500">{scanErrorHint}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
          <CardTitle className="text-lg">Aperçu</CardTitle>
            <p className="text-xs text-slate-500">
              Comparaison rapide avec les acteurs les plus impactants.
            </p>
          </div>
          {isTop10 && <Badge variant="success">Top 10% du radar</Badge>}
        </CardHeader>
        <CardContent>
          {selfAvg === null && selfCount === null ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              <p className="text-base font-semibold text-slate-800">À configurer</p>
              <p className="mt-1 text-sm text-slate-500">
                Synchronise tes avis Google pour afficher ta note et tes comparaisons.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="h-full">
                <CardContent className="space-y-2 pt-6 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Vous</p>
                    <Badge variant="neutral">Vous</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    Note: {selfScoreLabel} / Avis: {selfReviewsLabel}
                  </div>
                  <div className="text-xs text-slate-500">Distance: —</div>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-6 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {swotReport.leader?.name ?? "Leader"}
                    </p>
                    <Badge variant="success">Leader</Badge>
                  </div>
                  {swotReport.leader ? (
                    <>
                      <div className="text-xs text-slate-500">
                        Note: {swotReport.leader.rating ?? "—"} / Avis:{" "}
                        {swotReport.leader.user_ratings_total ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Delta:{" "}
                        {selfAvg !== null && swotReport.leader.rating !== null
                          ? `${formatDelta(swotReport.leader.rating - selfAvg)}`
                          : "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Distance: {formatDistance(swotReport.leader.distance_m)}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-6 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {swotReport.challenger?.name ?? "Challenger"}
                    </p>
                    <Badge variant="warning">Challenger</Badge>
                  </div>
                  {swotReport.challenger ? (
                    <>
                      <div className="text-xs text-slate-500">
                        Note: {swotReport.challenger.rating ?? "—"} / Avis:{" "}
                        {swotReport.challenger.user_ratings_total ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Delta:{" "}
                        {selfAvg !== null && swotReport.challenger.rating !== null
                          ? `${formatDelta(swotReport.challenger.rating - selfAvg)}`
                          : "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Distance: {formatDistance(swotReport.challenger.distance_m)}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["selection", "radar", "swot"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
              activeTab === tab
                ? "border-ink bg-ink text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab === "selection" && "Ma Selection"}
            {tab === "radar" && "Radar"}
            {tab === "swot" && "Analyse SWOT"}
          </button>
        ))}
      </div>

      {activeTab === "selection" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy size={18} />
              Ma Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {followedQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">{skeletonCards}</div>
            ) : sortedFollowed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
                <p className="text-base font-semibold text-slate-800">🧭 Aucune veille active</p>
                <p className="mt-1 text-sm text-slate-500">
                  Votre liste de veille est vide. Lancez une analyse puis ajoutez les concurrents a suivre.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setActiveTab("radar")}
                >
                  Aller au Radar
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {sortedFollowed.map((competitor) => {
                  const tier = getSelectionTier(competitor);
                  const insights = getCompetitorInsights(competitor);
                  const strategicTags = getStrategicTags(competitor, selfAvg, radiusKm);
                  const opportunities = getOpportunitiesToCheck(competitor);
                  const rationale = getWatchlistRationale(competitor, selfAvg);
                  const ratingDelta =
                    selfAvg !== null && competitor.rating !== null
                      ? formatDelta(competitor.rating - selfAvg)
                      : null;
                  const reviewsDelta =
                    selfCount !== null && competitor.user_ratings_total !== null
                      ? formatDelta(competitor.user_ratings_total - selfCount)
                      : null;
                  const yearsActive =
                    typeof competitor.years_active === "number"
                      ? `${competitor.years_active} ans`
                      : "indisponible";
                  return (
                    <Card key={competitor.id} className="h-full">
                      <CardContent className="flex h-full flex-col gap-3 pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {competitor.name}
                              </p>
                              <Badge variant={tier.variant}>{tier.label}</Badge>
                              <Badge variant="neutral">Suivi</Badge>
                            </div>
                            <p className="text-xs text-slate-500">
                              {competitor.address ?? "Adresse indisponible"}
                            </p>
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDistance(competitor.distance_m)}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Note: {competitor.rating ?? "—"}</span>
                          <span>Avis: {competitor.user_ratings_total ?? "—"}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {insights.length > 0 ? (
                            insights.map((insight) => (
                              <Badge key={insight} variant="neutral">
                                {insight}
                              </Badge>
                            ))
                          ) : (
                            <span>
                              Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">Comparaison</div>
                          <ul className="mt-1 space-y-1 text-xs text-slate-500">
                            <li>
                              Note: {competitor.rating ?? "—"}
                              {ratingDelta ? ` (${ratingDelta} vs vous)` : ""}
                            </li>
                            <li>
                              Avis: {competitor.user_ratings_total ?? "—"}
                              {reviewsDelta ? ` (${reviewsDelta} vs vous)` : ""}
                            </li>
                            <li>Distance: {formatDistance(competitor.distance_m)}</li>
                            <li
                              title="Google ne fournit pas toujours l’année d’ouverture via notre flux actuel."
                            >
                              Ancienneté: {yearsActive}
                            </li>
                          </ul>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">Tags stratégiques</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {strategicTags.length > 0 ? (
                              strategicTags.map((tag) => (
                                <Badge key={tag} variant="neutral">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span>Aucun tag stratégique.</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">
                            Pourquoi ce concurrent compte
                          </div>
                          <div className="mt-1">{rationale}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">
                            Opportunités à vérifier
                          </div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-500">
                            {opportunities.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                          {confirmRemoveId === competitor.id ? (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  followMutation.mutate({
                                    placeId: competitor.place_id,
                                    isFollowed: false
                                  });
                                  setConfirmRemoveId(null);
                                }}
                                disabled={pendingPlaceIds.includes(competitor.place_id)}
                              >
                                {pendingPlaceIds.includes(competitor.place_id) ? "..." : "Confirmer"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmRemoveId(null)}
                              >
                                Annuler
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmRemoveId(competitor.id)}
                              disabled={pendingPlaceIds.includes(competitor.place_id)}
                            >
                              <span className="flex items-center gap-2">
                                {pendingPlaceIds.includes(competitor.place_id) ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-slate-600" />
                                ) : (
                                  <BookmarkX size={14} />
                                )}
                                Retirer
                              </span>
                            </Button>
                          )}
                          <a
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                            href={buildGoogleLink(competitor.place_id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Voir sur Google
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "radar" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Radar</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="sticky top-4 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
                <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                  <label className="text-xs font-semibold text-slate-600">
                    Rechercher
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={radarSearch}
                      onChange={(event) => setRadarSearch(event.target.value)}
                      placeholder="Nom du concurrent"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Tri
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={radarSort}
                      onChange={(event) =>
                        setRadarSort(
                          event.target.value as "distance" | "rating" | "reviews"
                        )
                      }
                    >
                      <option value="distance">Distance</option>
                      <option value="rating">Note</option>
                      <option value="reviews">Volume avis</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Top
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={radarTopLimit}
                      onChange={(event) =>
                        setRadarTopLimit(
                          Number(event.target.value) as 10 | 25 | 50
                        )
                      }
                    >
                      <option value={10}>Top 10</option>
                      <option value={25}>Top 25</option>
                      <option value={50}>Top 50</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={radarFollowedOnly}
                      onChange={(event) => setRadarFollowedOnly(event.target.checked)}
                    />
                    Suivis uniquement
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {(["all", "top3", "high", "low"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setRadarFilter(filter)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                        radarFilter === filter
                          ? "border-ink bg-ink text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {filter === "all" && "Tout"}
                      {filter === "top3" && "Top 3"}
                      {filter === "high" && ">4.5"}
                      {filter === "low" && "<3.5"}
                    </button>
                  ))}
                </div>
              </div>
              {radarQuery.isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">{skeletonCards}</div>
              ) : radarItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
                  <p className="text-base font-semibold text-slate-800">📡 Aucun résultat</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Aucun concurrent n’a été trouvé pour cette zone. Essayez un rayon plus large ou un mot‑clé différent.
                  </p>
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-500">
                    <li>Choisir un etablissement</li>
                    <li>Verifier mot-cle et rayon</li>
                    <li>Lancer l’analyse</li>
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => scanMutation.mutate({})}
                    disabled={scanMutation.isPending || !selectedLocationId}
                  >
                    Lancer l’analyse
                  </Button>
                </div>
              ) : (
                <div className="relative space-y-4">
                  <style>{`
                    @keyframes radar-pulse {
                      0% { transform: scale(0.4); opacity: 0.4; }
                      70% { transform: scale(1.2); opacity: 0; }
                      100% { opacity: 0; }
                    }
                    @keyframes radar-sweep {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                  {scanMutation.isPending && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60">
                      <div className="relative flex h-40 w-40 items-center justify-center">
                        <div className="absolute inset-0 rounded-full border border-emerald-300/40" />
                        <div
                          className="absolute inset-0 rounded-full border border-emerald-300/50"
                          style={{ animation: "radar-pulse 2.6s ease-out infinite" }}
                        />
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "conic-gradient(rgba(16,185,129,0.15), rgba(16,185,129,0.0) 60%)",
                            animation: "radar-sweep 2.2s linear infinite"
                          }}
                        />
                        <div className="relative z-10 text-xs font-semibold text-emerald-700">
                          Analyse en cours…
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-slate-700">
                          Résumé radar —
                        </span>
                        <span>• {radarSummary.total} établissements</span>
                        <span>
                          • Plus notés que vous:{" "}
                          {radarSummary.higherThanSelf !== null
                            ? radarSummary.higherThanSelf
                            : "—"}
                        </span>
                        <span>
                          • Plus proche:{" "}
                          {radarSummary.closestDistance !== null
                            ? formatDistance(radarSummary.closestDistance)
                            : "—"}
                        </span>
                        <span>
                          • Note médiane:{" "}
                          {radarSummary.medianRating !== null
                            ? radarSummary.medianRating.toFixed(1)
                            : "—"}
                        </span>
                        <span>
                          • Avis médian:{" "}
                          {radarSummary.medianReviews !== null
                            ? Math.round(radarSummary.medianReviews)
                            : "—"}
                        </span>
                        <span>
                          • Meilleure note:{" "}
                          {radarSummary.bestRating !== null
                            ? radarSummary.bestRating.toFixed(1)
                            : "—"}
                        </span>
                        <span>
                          • Risque élevé: {radarSummary.riskyCount}
                        </span>
                      </div>
                      <span
                        className="cursor-help rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500"
                        title="Le résumé met en avant les concurrents les plus influents localement."
                      >
                        i
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                  {visibleRadar.map((competitor) => {
                    const tier = getRadarTier(competitor);
                    const isPending = pendingPlaceIds.includes(competitor.place_id);
                    const isFollowed = competitor.is_followed;
                    const insights = getCompetitorInsights(competitor);
                    const selfAvg = selfStatsQuery.data?.avg ?? null;
                    const delta =
                      typeof competitor.rating === "number" && selfAvg !== null
                        ? competitor.rating - selfAvg
                        : null;
                    const strategicTags = getStrategicTags(competitor, selfAvg, radiusKm);
                    const opportunities = getOpportunitiesToCheck(competitor);
                    const ratingDelta =
                      selfAvg !== null && competitor.rating !== null
                        ? formatDelta(competitor.rating - selfAvg)
                        : null;
                    const reviewsDelta =
                      selfCount !== null && competitor.user_ratings_total !== null
                        ? formatDelta(competitor.user_ratings_total - selfCount)
                        : null;
                    const yearsActive =
                      typeof competitor.years_active === "number"
                        ? `${competitor.years_active} ans`
                        : "indisponible";
                    const dangerRadius =
                      typeof radiusKm === "number" ? radiusKm * 1000 * 0.5 : null;
                    const isDangerous =
                      typeof competitor.rating === "number" &&
                      typeof competitor.distance_m === "number" &&
                      competitor.rating >= 4.8 &&
                      dangerRadius !== null &&
                      competitor.distance_m <= dangerRadius;
                    return (
                    <Card
                      key={competitor.id}
                      className={isDangerous ? "border-rose-200 bg-rose-50" : undefined}
                    >
                      <CardContent className="flex h-full flex-col gap-3 pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {competitor.name}
                              </p>
                              <Badge variant={tier.variant}>{tier.label}</Badge>
                              {isFollowed && <Badge variant="neutral">Suivi</Badge>}
                              {isDangerous && (
                                <Badge variant="warning">Impact fort</Badge>
                              )}
                              {delta !== null && (
                                <Badge variant="neutral">
                                  {delta >= 0 ? "+" : ""}
                                  {delta.toFixed(1)} vs vous
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {competitor.address ?? "Adresse indisponible"}
                            </p>
                          </div>
                          <Badge variant="neutral">
                            {formatDistance(competitor.distance_m)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Note: {competitor.rating ?? "—"}</span>
                          <span>Avis: {competitor.user_ratings_total ?? "—"}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {insights.length > 0 ? (
                            insights.map((insight) => (
                              <Badge key={insight} variant="neutral">
                                {insight}
                              </Badge>
                            ))
                          ) : (
                            <span>
                              Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">Comparaison</div>
                          <ul className="mt-1 space-y-1 text-xs text-slate-500">
                            <li>
                              Note: {competitor.rating ?? "—"}
                              {ratingDelta ? ` (${ratingDelta} vs vous)` : ""}
                            </li>
                            <li>
                              Avis: {competitor.user_ratings_total ?? "—"}
                              {reviewsDelta ? ` (${reviewsDelta} vs vous)` : ""}
                            </li>
                            <li>Distance: {formatDistance(competitor.distance_m)}</li>
                            <li
                              title="Google ne fournit pas toujours l’année d’ouverture via notre flux actuel."
                            >
                              Ancienneté: {yearsActive}
                            </li>
                          </ul>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">Tags stratégiques</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {strategicTags.length > 0 ? (
                              strategicTags.map((tag) => (
                                <Badge key={tag} variant="neutral">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span>Aucun tag stratégique.</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">
                            Opportunités à vérifier
                          </div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-500">
                            {opportunities.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              followMutation.mutate({
                                placeId: competitor.place_id,
                                isFollowed: true
                              })
                            }
                            disabled={isPending || isFollowed}
                          >
                            <span className="flex items-center gap-2">
                              {isPending ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-slate-600" />
                              ) : (
                                <BookmarkPlus size={14} />
                              )}
                              {isFollowed ? "Suivi" : "Suivre"}
                            </span>
                          </Button>
                          <a
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                            href={buildGoogleLink(competitor.place_id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Voir sur Google
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  );
                  })}
                  </div>
                </div>
              )}
              {radarItems.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {visibleRadar.length} affiches / {filteredRadar.length} total
                  </span>
                  {canLoadMore && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const currentScroll = window.scrollY;
                        setRadarPageSize((prev) => prev + 6);
                        requestAnimationFrame(() => {
                          window.scrollTo({ top: currentScroll });
                        });
                      }}
                    >
                      Charger plus
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "swot" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Eye size={18} />
                Analyse SWOT
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateBenchmark}
                disabled={benchmarkLoading || !selectedLocationId}
              >
                {benchmarkLoading ? "Generation..." : "Generer un rapport"}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Sparkles size={14} />
                  Forces
                </div>
                {swotBullets.forces.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {swotBullets.forces.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Prochaine action : renforcer ce qui surperforme deja le marche.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <TrendingDown size={14} />
                  Faiblesses
                </div>
                {swotBullets.weaknesses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {swotBullets.weaknesses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Prochaine action : corriger le signal le plus faible.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <TrendingUp size={14} />
                  Opportunités
                </div>
                {swotBullets.opportunities.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {swotBullets.opportunities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Prochaine action : viser les gains rapides sur les points faibles.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <ShieldAlert size={14} />
                  Menaces
                </div>
                {swotBullets.threats.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                    {swotBullets.threats.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Prochaine action : surveiller ces rivaux chaque semaine.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions recommandees</CardTitle>
            </CardHeader>
            <CardContent>
              {swotBullets.actions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Ajoute des concurrents suivis ou elargis le rayon pour enrichir l’analyse.
                </p>
              ) : (
                <ul className="list-disc space-y-2 pl-4 text-sm text-slate-700">
                  {swotBullets.actions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export { Competitors };

// Manual test plan:
// 1) Etalonnage sans etablissement -> etat vide + CTA Parametres.
// 2) Controles: select 5 km cliquable + mise a jour rayon.
// 3) Radar: scan 5km -> animation radar + message "Scan termine" + resume.
// 4) Radar: tri/filtres/top + pagination "Charger plus".
// 5) Suivre/retirer un concurrent -> toast + MAJ optimistic + boutons desactives.
// 6) Ma Selection: comparaison + tags strategiques + opportunites a verifier.
// 7) SWOT: actions + textes FR sans anglais.
// 8) Erreur coords -> message + hint affiches proprement.

// Data audit (non disponible dans le payload actuel) :
// - Annee d'ouverture / anciennete officielle
// - Statut d'activite (open/closed)
// - Gamme de prix / price_level
// - Services, attributs, options (ex: terrasse, livraison)
// - Horaires d'ouverture
// - Photos et medias
// - Categories detaillees
// - Site web officiel / telephone (si non remonte)
