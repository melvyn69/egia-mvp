import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookmarkPlus,
  BookmarkX,
  CalendarDays,
  ChevronRight,
  Download,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Trophy,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  type CompetitorRow,
  competitorsFollowedQueryKey,
  competitorsRadarQueryKey,
  useCompetitorBenchmarkHistory,
  useCompetitorLocations,
  useCompetitorRadar,
  useCompetitorSelfStats,
  useCompetitorSettings,
  useFollowedCompetitors
} from "../hooks/useCompetitorQueries";
import { cn } from "../lib/utils";

type CompetitorsProps = {
  session: Session | null;
  isAdmin?: boolean;
};

type BenchmarkTimelineItem = {
  id: string;
  groupKey: string;
  createdAtTs: number;
  month: string | null;
  date: string | null;
  total: number | null;
  medianRating: number | null;
  bestCompetitor: string | null;
  versionCount: number;
};

type DisplayKpi = {
  label: string;
  value: string;
  detail?: string;
  Icon: LucideIcon;
  tone: string;
};

type DisplayCompetitor = {
  competitor: CompetitorRow;
  label: string;
  badge: string;
  rank: number;
  tone: string;
};

const integerFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0
});

const decimalFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const scoreCompetitor = (row: {
  rating: number | null;
  user_ratings_total: number | null;
}) => {
  const rating = typeof row.rating === "number" ? row.rating : 0;
  const reviews = typeof row.user_ratings_total === "number" ? row.user_ratings_total : 0;
  return rating * Math.log10(1 + reviews);
};

const formatDistance = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 1000) return `${value} m`;
  return `${(value / 1000).toFixed(1)} km`;
};

const formatDateLabel = (value: Date | string | number | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatMonthLabel = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const label = date.toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric"
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatMonthKey = (value: string | null | undefined) => {
  if (!value) return "unknown-period";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-period";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const formatRating = (value: number) => `${decimalFormatter.format(value)}/5`;

const formatInteger = (value: number) => integerFormatter.format(Math.round(value));

const formatDelta = (delta: number) =>
  `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;

const formatVsDelta = (delta: number | null) => {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.05) return null;
  return formatDelta(delta);
};

const formatCountDelta = (delta: number | null) => {
  if (delta === null) return null;
  if (Math.abs(delta) < 1) return null;
  const rounded = Math.round(delta);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampPercent = (value: number) =>
  Math.max(4, Math.min(100, Math.round(value)));

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const extractCategoryLabel = (raw: unknown | null | undefined) => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const primary = (record.primaryCategory as { displayName?: unknown } | undefined)
    ?.displayName;
  if (typeof primary === "string" && primary.trim()) {
    return primary.trim();
  }
  const categories = record.categories;
  if (Array.isArray(categories)) {
    for (const item of categories) {
      const label = (item as { displayName?: unknown } | undefined)?.displayName;
      if (typeof label === "string" && label.trim()) {
        return label.trim();
      }
    }
  }
  const fallback = (record.category as { displayName?: unknown } | undefined)
    ?.displayName;
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }
  return null;
};

const getCompetitorInsights = (row: CompetitorRow) => {
  const insights: string[] = [];
  if (typeof row.rating === "number") {
    if (row.rating >= 4.5) insights.push("Excellente note");
    if (row.rating <= 3.5) insights.push("Note à améliorer");
  }
  if (typeof row.user_ratings_total === "number") {
    if (row.user_ratings_total >= 200) insights.push("Avis élevés");
    if (row.user_ratings_total <= 20) insights.push("Peu d'avis");
  }
  if (typeof row.distance_m === "number" && row.distance_m <= 800) {
    insights.push("Très proche");
  }
  return insights;
};

const getStrategicTags = (
  row: CompetitorRow,
  context: { selfAvg: number | null; radiusKm: number }
) => {
  const rating = typeof row.rating === "number" ? row.rating : null;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
  const distance = typeof row.distance_m === "number" ? row.distance_m : null;
  const delta =
    context.selfAvg !== null && rating !== null ? rating - context.selfAvg : null;
  const extremeDistance =
    distance !== null && distance <= Math.max(400, context.radiusKm * 1000 * 0.2);
  const tags: string[] = [];
  const addTag = (value: string) => {
    if (!tags.includes(value)) tags.push(value);
  };

  if (extremeDistance) addTag("Très proche");
  if (delta !== null && delta >= 0.2) addTag("Note supérieure");
  if (reviews !== null && reviews >= 200) addTag("Fort volume");
  if (
    distance !== null &&
    distance <= context.radiusKm * 1000 * 0.5 &&
    rating !== null &&
    rating >= 4.7
  ) {
    addTag("Impact local");
  }

  return tags.slice(0, 3);
};

const getMajorWeakPoint = (row: CompetitorRow, radiusKm: number) => {
  const rating = typeof row.rating === "number" ? row.rating : null;
  const reviews =
    typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
  const distance = typeof row.distance_m === "number" ? row.distance_m : null;

  if (rating !== null && rating < 4.0) return "Qualité";
  if (reviews !== null && reviews < 40) return "Visibilité";
  if (distance !== null && distance > radiusKm * 1000 * 0.7) return "Proximité";
  return "Expérience";
};

const getActionRecommendation = (weakPoint: string) => {
  if (weakPoint === "Qualité") return "Travailler les irritants visibles dans les avis.";
  if (weakPoint === "Visibilité") return "Renforcer la collecte d'avis récente.";
  if (weakPoint === "Proximité") return "Concentrer l'analyse sur les acteurs plus proches.";
  return "Valoriser les preuves d'expérience locale.";
};

const normalizeZoneLabel = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return normalized.slice(0, 40);
};

const renderChipList = (items: string[]) => {
  const visible = items.slice(0, 2);
  const extra = items.length - visible.length;
  return (
    <>
      {visible.map((item) => (
        <Badge key={item} variant="neutral">
          {item}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge variant="neutral">+{extra}</Badge>
      )}
    </>
  );
};

const Competitors = ({ session }: CompetitorsProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
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
  const [radarTopLimit, setRadarTopLimit] = useState<number | null>(25);
  const [radarPageSize, setRadarPageSize] = useState(6);
  const [pendingPlaceIds, setPendingPlaceIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [downloadingBenchmarkId, setDownloadingBenchmarkId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [zoneInput, setZoneInput] = useState("");
  const [scanHistory, setScanHistory] = useState<
    Array<{
      ts: number;
      locationId: string | null;
      keyword: string;
      radiusKm: number;
      zoneLabel: string | null;
    }>
  >([]);

  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  const workspaceId = userId;

  const locationsQuery = useCompetitorLocations({ workspaceId, userId });
  const settingsQuery = useCompetitorSettings({ workspaceId, userId });

  useEffect(() => {
    const list = locationsQuery.data ?? [];
    if (!selectedLocationId && list.length > 0) {
      setSelectedLocationId(list[0].id);
    }
  }, [locationsQuery.data, selectedLocationId]);

  useEffect(() => {
    const row = settingsQuery.data;
    if (!row) return;
    if (row.competitive_monitoring_radius_km && radiusKm === 5) {
      setRadiusKm(row.competitive_monitoring_radius_km);
    }
  }, [settingsQuery.data, radiusKm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("competitors_zone_label");
    if (stored) {
      setZoneInput(stored);
    }
    const history = window.localStorage.getItem("competitors_scan_history");
    if (history) {
      try {
        const parsed = JSON.parse(history) as typeof scanHistory;
        if (Array.isArray(parsed)) {
          setScanHistory(
            parsed.filter((item) => typeof item?.ts === "number")
          );
        }
      } catch {
        setScanHistory([]);
      }
    }
  }, []);

  const radarQuery = useCompetitorRadar({
    workspaceId,
    userId,
    token,
    locationId: selectedLocationId
  });
  const followedQuery = useFollowedCompetitors({
    workspaceId,
    userId,
    token,
    locationId: selectedLocationId
  });
  const selfStatsQuery = useCompetitorSelfStats({
    workspaceId,
    userId,
    token,
    locationId: selectedLocationId
  });
  const benchmarkHistoryQuery = useCompetitorBenchmarkHistory({
    workspaceId,
    userId
  });

  const scanMutation = useMutation({
    mutationFn: async (input?: { keyword?: string; radiusKm?: number }) => {
      setIsScanning(true);
      const t0 = Date.now();
      try {
        if (!token || !selectedLocationId) {
          throw new Error("Missing location");
        }
        const scanKeyword = (input?.keyword ?? "").trim();
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
      } finally {
        const elapsed = Date.now() - t0;
        const minMs = 700;
        if (elapsed < minMs) {
          await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
        }
        setIsScanning(false);
      }
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
        payload?.keyword ? `"${payload.keyword}"` : sectorLabel ? `"${sectorLabel}"` : null,
        durationLabel ? `${durationLabel}` : null
      ].filter(Boolean);
      setScanMessage(
        labelParts.length > 0
          ? `Scan terminé: ${labelParts.join(" • ")}.`
          : "Scan terminé."
      );
      setScanError(null);
      setScanErrorHint(null);
      setLastScanAt(new Date());
      if (typeof window !== "undefined") {
        const entry = {
          ts: Date.now(),
          locationId: selectedLocationId ?? null,
          keyword: payload?.keyword ?? sectorLabel,
          radiusKm: payload?.radius_km ?? radiusKm,
          zoneLabel: normalizedZoneInput || null
        };
        setScanHistory((prev) => {
          const nextHistory = [entry, ...prev].slice(0, 6);
          window.localStorage.setItem(
            "competitors_scan_history",
            JSON.stringify(nextHistory)
          );
          return nextHistory;
        });
      }
      queryClient.invalidateQueries({
        queryKey: competitorsRadarQueryKey({
          workspaceId,
          userId,
          locationId: selectedLocationId
        }),
        exact: true
      });
      queryClient.invalidateQueries({
        queryKey: competitorsFollowedQueryKey({
          workspaceId,
          userId,
          locationId: selectedLocationId
        }),
        exact: true
      });
      queryClient.setQueryData(["coach-competitor-watch", userId], true);
      void queryClient.invalidateQueries({
        queryKey: ["coach-competitor-watch", userId],
        exact: true
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
      setToast({ type: "error", message: "Connectez-vous pour générer." });
      return;
    }
    if (!selectedLocationId) {
      setToast({ type: "error", message: "Sélectionnez un établissement." });
      return;
    }
    if (!sectorLabel) {
      setToast({
        type: "error",
        message: "Définis d’abord la catégorie de l’établissement."
      });
      return;
    }
    setBenchmarkLoading(true);
    setToast(null);
    try {
      const payload = {
        action: "generate",
        location_id: selectedLocationId,
        keyword: sectorLabel,
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
        throw new Error(data?.error?.message ?? "Échec de génération.");
      }
      const reportId =
        typeof data?.report?.id === "string" ? data.report.id : null;
      const downloadUrl =
        typeof data?.download_url === "string"
          ? data.download_url
          : typeof data?.report?.download_url === "string"
            ? data.report.download_url
            : typeof data?.report?.pdf_url === "string"
              ? data.report.pdf_url
              : null;
      if (downloadUrl) {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setToast({
          type: "success",
          message: "Rapport généré. Téléchargement en cours."
        });
        void queryClient.invalidateQueries({
          queryKey: ["coach-reports-count", userId],
          exact: true
        });
        return;
      }
      if (reportId) {
        const pdfRes = await fetch(
          `/api/reports/competitors-benchmark/pdf?report_id=${reportId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `benchmark-${reportId}.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => window.URL.revokeObjectURL(url), 1000);
          setToast({
            type: "success",
            message: "PDF téléchargé."
          });
          void queryClient.invalidateQueries({
            queryKey: ["coach-reports-count", userId],
            exact: true
          });
          return;
        }
        navigate(`/reports?report_id=${reportId}`);
        setToast({
          type: "success",
          message: "Rapport généré. Téléchargez-le depuis Rapports."
        });
        void queryClient.invalidateQueries({
          queryKey: ["coach-reports-count", userId],
          exact: true
        });
        return;
      }
      navigate("/reports");
      void queryClient.invalidateQueries({
        queryKey: ["coach-reports-count", userId],
        exact: true
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Échec de génération.";
      setToast({ type: "error", message });
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const downloadBenchmarkReport = async (reportId: string) => {
    if (!token) {
      setToast({ type: "error", message: "Connectez-vous pour télécharger." });
      return;
    }
    setDownloadingBenchmarkId(reportId);
    try {
      const pdfRes = await fetch(
        `/api/reports/competitors-benchmark/pdf?report_id=${reportId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!pdfRes.ok) {
        throw new Error("Téléchargement indisponible.");
      }
      const blob = await pdfRes.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `benchmark-${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setToast({ type: "success", message: "PDF téléchargé." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Téléchargement impossible.";
      setToast({ type: "error", message });
    } finally {
      setDownloadingBenchmarkId(null);
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
      const radarKey = competitorsRadarQueryKey({
        workspaceId,
        userId,
        locationId: selectedLocationId
      });
      const followedKey = competitorsFollowedQueryKey({
        workspaceId,
        userId,
        locationId: selectedLocationId
      });
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
          competitorsRadarQueryKey({
            workspaceId,
            userId,
            locationId: selectedLocationId
          }),
          context.previousRadar
        );
      }
      if (context?.previousFollowed) {
        queryClient.setQueryData(
          competitorsFollowedQueryKey({
            workspaceId,
            userId,
            locationId: selectedLocationId
          }),
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
        queryKey: competitorsRadarQueryKey({
          workspaceId,
          userId,
          locationId: selectedLocationId
        }),
        exact: true
      });
      queryClient.invalidateQueries({
        queryKey: competitorsFollowedQueryKey({
          workspaceId,
          userId,
          locationId: selectedLocationId
        }),
        exact: true
      });
      queryClient.setQueryData(["coach-competitor-watch", userId], true);
      void queryClient.invalidateQueries({
        queryKey: ["coach-competitor-watch", userId],
        exact: true
      });
    },
    onSettled: (_data, _error, payload) => {
      setPendingPlaceIds((prev) =>
        prev.filter((id) => id !== payload.placeId)
      );
    }
  });

  const radarItems = useMemo(() => radarQuery.data ?? [], [radarQuery.data]);
  const followedItems = useMemo(
    () => followedQuery.data ?? [],
    [followedQuery.data]
  );
  const locationsFirstLoad = locationsQuery.isLoading && !locationsQuery.data;
  const radarFirstLoad = radarQuery.isLoading && !radarQuery.data;
  const benchmarkHistoryFirstLoad =
    benchmarkHistoryQuery.isLoading && !benchmarkHistoryQuery.data;
  const competitorsRefreshing =
    (radarQuery.isFetching && Boolean(radarQuery.data)) ||
    (followedQuery.isFetching && Boolean(followedQuery.data));
  const benchmarkHistoryRefreshing =
    benchmarkHistoryQuery.isFetching && Boolean(benchmarkHistoryQuery.data);
  const settingsRow = settingsQuery.data;
  const enabled = Boolean(settingsRow?.competitive_monitoring_enabled);
  const googleConnected = (locationsQuery.data ?? []).length > 0;
  const statusRadius = settingsRow?.competitive_monitoring_radius_km ?? radiusKm;
  const locationsEmpty =
    !locationsFirstLoad && (locationsQuery.data ?? []).length === 0;
  const locationLabelById = useMemo(() => {
    const map = new Map<string, string>();
    (locationsQuery.data ?? []).forEach((location) => {
      map.set(
        location.id,
        location.location_title ?? location.location_resource_name
      );
    });
    return map;
  }, [locationsQuery.data]);
  const selectedLocation = (locationsQuery.data ?? []).find(
    (location) => location.id === selectedLocationId
  );
  const sectorLabel =
    extractCategoryLabel(selectedLocation?.address_json) ??
    (settingsRow?.competitive_monitoring_keyword ?? "").trim();
  const sectorMissing = !sectorLabel;
  const normalizedZoneInput = normalizeZoneLabel(zoneInput);
  const selectedLocationLabel =
    selectedLocation?.location_title || selectedLocation?.location_resource_name || null;
  const zoneLabel = normalizedZoneInput
    ? normalizedZoneInput
    : selectedLocationLabel;
  const rawLocationRating =
    typeof (selectedLocation as { rating?: number | null })?.rating === "number"
      ? (selectedLocation as { rating?: number | null }).rating
      : null;
  const locationRating =
    typeof rawLocationRating === "number" && rawLocationRating > 0
      ? rawLocationRating
      : null;
  const rawLocationReviewCount =
    typeof (selectedLocation as { reviewCount?: number | null })?.reviewCount ===
    "number"
      ? (selectedLocation as { reviewCount?: number | null }).reviewCount
      : typeof (selectedLocation as { review_count?: number | null })?.review_count ===
        "number"
        ? (selectedLocation as { review_count?: number | null }).review_count
        : null;
  const locationReviewCount =
    typeof rawLocationReviewCount === "number" && rawLocationReviewCount > 0
      ? rawLocationReviewCount
      : null;
  const rawSelfAvg = selfStatsQuery.data?.avg ?? null;
  const rawSelfCount = selfStatsQuery.data?.count ?? null;
  const selfAvg =
    typeof rawSelfAvg === "number" && rawSelfAvg > 0 ? rawSelfAvg : null;
  const selfCount =
    typeof rawSelfCount === "number" && rawSelfCount > 0 ? rawSelfCount : null;
  const displaySelfAvg = locationRating ?? selfAvg;
  const displaySelfCount = locationReviewCount ?? selfCount;
  const buildGoogleLink = (placeId: string) =>
    `https://www.google.com/maps/place/?q=place_id:${placeId}`;

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

  const topLimitOptions = useMemo(() => {
    const total = radarItems.length;
    const candidates = [10, 20, 25, 50];
    return candidates.filter((value) => value <= total);
  }, [radarItems.length]);

  useEffect(() => {
    if (topLimitOptions.length === 0) {
      if (radarTopLimit !== null) {
        setRadarTopLimit(null);
      }
      return;
    }
    if (!radarTopLimit || !topLimitOptions.includes(radarTopLimit)) {
      const preferred = topLimitOptions.includes(20)
        ? 20
        : topLimitOptions[0];
      setRadarTopLimit(preferred);
    }
  }, [topLimitOptions, radarTopLimit]);

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
    const rating = typeof row.rating === "number" ? row.rating : null;
    const reviews =
      typeof row.user_ratings_total === "number" ? row.user_ratings_total : null;
    if (displaySelfAvg !== null && displaySelfCount !== null) {
      if (rating !== null && reviews !== null) {
        if (rating >= displaySelfAvg && reviews >= displaySelfCount) {
          return { label: "Leader", variant: "success" as const };
        }
        if (rating >= displaySelfAvg || reviews >= displaySelfCount) {
          return { label: "Challenger", variant: "warning" as const };
        }
        return { label: "Outsider", variant: "neutral" as const };
      }
    }
    return { label: "Outsider", variant: "neutral" as const };
  };

  const sortedFollowed = useMemo(() => {
    return followedItems
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a));
  }, [followedItems]);

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

  const visibleRadar = filteredRadar.slice(0, radarPageSize);
  const canLoadMore = filteredRadar.length > radarPageSize;
  const skeletonCards = Array.from({ length: 4 }, (_, index) => (
    <Skeleton key={`skeleton-${index}`} className="h-40 w-full" />
  ));

  const swotBullets = useMemo(() => {
    const forces: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];
    const actions: string[] = [];

    if (displaySelfAvg !== null && swotReport.avgRating !== null) {
      const delta = displaySelfAvg - swotReport.avgRating;
      if (delta >= 0.2) {
        forces.push(
          `Note supérieure de ${formatDelta(delta)} vs moyenne (${displaySelfAvg.toFixed(
            1
          )} vs ${swotReport.avgRating.toFixed(1)}).`
        );
      } else if (delta <= -0.2) {
        weaknesses.push(
          `Note inférieure de ${formatDelta(Math.abs(delta))} vs moyenne (${displaySelfAvg.toFixed(
            1
          )} vs ${swotReport.avgRating.toFixed(1)}).`
        );
      }
    }

    if (displaySelfCount !== null && swotReport.avgVolume !== null) {
      const avgVolume = swotReport.avgVolume;
      if (displaySelfCount >= avgVolume * 1.2) {
        forces.push(
          `Avis supérieurs à la moyenne (${displaySelfCount} vs ~${Math.round(
            avgVolume
          )}).`
        );
      } else if (displaySelfCount <= avgVolume * 0.8) {
        weaknesses.push(
          `Avis inférieurs à la moyenne (${displaySelfCount} vs ~${Math.round(
            avgVolume
          )}).`
        );
      }
    }

    if (
      displaySelfAvg !== null &&
      swotReport.maxRating !== null &&
      displaySelfAvg >= swotReport.maxRating
    ) {
      forces.push(`Au niveau de la meilleure note (${displaySelfAvg.toFixed(1)}).`);
    }

    if (swotReport.leader?.rating !== null && displaySelfAvg !== null) {
      const delta = swotReport.leader.rating - displaySelfAvg;
      if (delta >= 0.3) {
        weaknesses.push(`Leader à ${formatDelta(delta)} points d'avance.`);
      } else if (delta > 0 && delta <= 0.2) {
        opportunities.push(
          `Écart faible avec le leader (${formatDelta(delta)}).`
        );
      }
    }

    if (swotReport.minRating !== null && swotReport.minRating <= 3.5) {
      opportunities.push("Certains concurrents sont notés sous 3.5.");
    }

    if (swotReport.avgVolume !== null && swotReport.avgVolume < 30) {
      opportunities.push(
        `Marché peu dense (volume moyen ~${Math.round(swotReport.avgVolume)} avis).`
      );
    }

    if (
      swotReport.leader?.rating !== null &&
      displaySelfAvg !== null &&
      swotReport.leader.user_ratings_total !== null &&
      displaySelfCount !== null &&
      swotReport.leader.rating >= displaySelfAvg + 0.3 &&
      swotReport.leader.user_ratings_total > displaySelfCount
    ) {
      threats.push("Leader mieux noté avec plus d'avis.");
    }

    if (swotReport.highRatedCount >= 3) {
      threats.push(
        `${swotReport.highRatedCount} concurrents notés >= 4.5.`
      );
    }

    if (swotReport.nearbyHighRated > 0) {
      threats.push(
        `${swotReport.nearbyHighRated} concurrent(s) très bien notés à moins d'1 km.`
      );
    }

    if (weaknesses.length > 0 && swotReport.avgRating !== null) {
      actions.push(
        `Renforcer la satisfaction client parce que la moyenne marché est à ${swotReport.avgRating.toFixed(
          1
        )}.`
      );
    }
    if (
      displaySelfCount !== null &&
      swotReport.avgVolume !== null &&
      displaySelfCount <= swotReport.avgVolume * 0.8
    ) {
      actions.push(
        `Collecter plus d'avis parce que le volume moyen est ~${Math.round(
          swotReport.avgVolume
        )}.`
      );
    }
    if (swotReport.nearbyHighRated > 0) {
      actions.push(
        `Mettre en avant vos atouts locaux parce que ${swotReport.nearbyHighRated} concurrent(s) très bien notés sont proches.`
      );
    }
    if (swotReport.leader?.rating !== null && displaySelfAvg !== null) {
      const delta = swotReport.leader.rating - displaySelfAvg;
      if (delta > 0 && delta <= 0.2) {
        actions.push(
          `Gagner quelques points de note pour dépasser le leader (${formatDelta(
            delta
          )}).`
        );
      }
    }
    if (swotReport.minRating !== null && swotReport.minRating <= 3.5) {
      actions.push(
        "Cibler les faiblesses des concurrents les moins bien notés."
      );
    }

    const trimList = (list: string[]) => list.slice(0, 3);
    return {
      forces: trimList(forces),
      weaknesses: trimList(weaknesses),
      opportunities: trimList(opportunities),
      threats: trimList(threats),
      actions: actions.slice(0, 1)
    };
  }, [displaySelfAvg, displaySelfCount, swotReport]);

  const marketRows = useMemo(() => {
    const rows = new Map<string, CompetitorRow>();
    [...sortedFollowed, ...radarItems].forEach((row) => {
      const key = row.place_id || row.id;
      if (!rows.has(key)) {
        rows.set(key, row);
      }
    });
    return Array.from(rows.values());
  }, [radarItems, sortedFollowed]);

  const rankedMarket = useMemo(
    () => marketRows.slice().sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a)),
    [marketRows]
  );

  const distanceRankedMarket = useMemo(
    () =>
      marketRows
        .filter((row) => isFiniteNumber(row.distance_m))
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0)),
    [marketRows]
  );

  const marketStats = useMemo(() => {
    const ratings = marketRows
      .map((row) => row.rating)
      .filter((value): value is number => isFiniteNumber(value));
    const reviews = marketRows
      .map((row) => row.user_ratings_total)
      .filter((value): value is number => isFiniteNumber(value));
    const distances = marketRows
      .map((row) => row.distance_m)
      .filter((value): value is number => isFiniteNumber(value));
    const closeThreshold = Math.max(800, radiusKm * 1000 * 0.25);
    return {
      total: marketRows.length,
      medianRating: ratings.length > 0 ? median(ratings) : null,
      medianReviews: reviews.length > 0 ? median(reviews) : null,
      medianDistance: distances.length > 0 ? median(distances) : null,
      bestRating: ratings.length > 0 ? Math.max(...ratings) : null,
      closestCompetitor: distanceRankedMarket[0] ?? null,
      leader: rankedMarket[0] ?? null,
      closeCount: marketRows.filter(
        (row) => isFiniteNumber(row.distance_m) && row.distance_m <= closeThreshold
      ).length,
      highRatedCount: marketRows.filter(
        (row) => isFiniteNumber(row.rating) && row.rating >= 4.5
      ).length
    };
  }, [distanceRankedMarket, marketRows, radiusKm, rankedMarket]);

  const selfMarketPosition = useMemo(() => {
    if (displaySelfAvg === null || displaySelfCount === null || marketRows.length === 0) {
      return null;
    }
    const selfScore = scoreCompetitor({
      rating: displaySelfAvg,
      user_ratings_total: displaySelfCount
    });
    const rank = rankedMarket.filter((row) => scoreCompetitor(row) > selfScore).length + 1;
    const totalWithSelf = marketRows.length + 1;
    const percentile = rank / totalWithSelf;
    const label =
      percentile <= 0.25
        ? "Leader"
        : percentile <= 0.4
          ? "Solide"
          : percentile <= 0.65
            ? "À défendre"
            : "À renforcer";
    return {
      rank,
      totalWithSelf,
      label,
      value: rank <= 3 ? `#${rank}` : `Top ${Math.round(percentile * 100)}%`
    };
  }, [displaySelfAvg, displaySelfCount, marketRows.length, rankedMarket]);

  const marketKpis = useMemo(() => {
    const cards: DisplayKpi[] = [];
    if (selfMarketPosition) {
      cards.push({
        label: "Position marché",
        value: selfMarketPosition.value,
        detail: `${selfMarketPosition.label} · rang ${selfMarketPosition.rank}/${selfMarketPosition.totalWithSelf}`,
        Icon: Trophy,
        tone: "bg-blue-50 text-blue-700"
      });
    }
    if (marketStats.total > 0) {
      const pressure =
        marketStats.closeCount >= 3 || marketStats.highRatedCount >= 4
          ? "Élevée"
          : marketStats.closeCount > 0 || marketStats.highRatedCount > 0
            ? "À surveiller"
            : "Modérée";
      cards.push({
        label: "Pression concurrentielle",
        value: pressure,
        detail:
          marketStats.closeCount > 0
            ? `${formatInteger(marketStats.closeCount)} acteur(s) proches`
            : `${formatInteger(marketStats.total)} observés`,
        Icon: ShieldAlert,
        tone:
          pressure === "Élevée"
            ? "bg-rose-50 text-rose-700"
            : "bg-amber-50 text-amber-700"
      });
    }
    if (
      (displaySelfCount !== null && marketStats.medianReviews !== null) ||
      (displaySelfAvg !== null && marketStats.bestRating !== null)
    ) {
      const reviewGap =
        displaySelfCount !== null && marketStats.medianReviews !== null
          ? marketStats.medianReviews - displaySelfCount
          : null;
      const ratingGap =
        displaySelfAvg !== null && marketStats.bestRating !== null
          ? marketStats.bestRating - displaySelfAvg
          : null;
      const hasReviewGap = reviewGap !== null && reviewGap > 0;
      const hasRatingGap = ratingGap !== null && ratingGap > 0.1;
      cards.push({
        label: "Potentiel de progression",
        value: hasReviewGap || hasRatingGap ? "Important" : "Favorable",
        detail: hasReviewGap
          ? `${formatInteger(Math.ceil(reviewGap))} avis vers la médiane`
          : hasRatingGap && ratingGap !== null
            ? `${formatDelta(ratingGap)} pt face au leader`
            : "Écart limité",
        Icon: TrendingUp,
        tone: "bg-emerald-50 text-emerald-700"
      });
    }
    if (displaySelfCount !== null && marketStats.medianReviews !== null) {
      const visibility =
        displaySelfCount >= marketStats.medianReviews
          ? "Solide"
          : displaySelfCount >= marketStats.medianReviews * 0.7
            ? "À renforcer"
            : "Faible";
      cards.push({
        label: "Visibilité locale",
        value: visibility,
        detail: `${formatInteger(displaySelfCount)} avis vs médiane ${formatInteger(
          marketStats.medianReviews
        )}`,
        Icon: Users,
        tone:
          visibility === "Solide"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-700"
      });
    }
    const closestDistance = formatDistance(marketStats.closestCompetitor?.distance_m);
    if (closestDistance && marketStats.closestCompetitor) {
      cards.push({
        label: "Concurrent le plus proche",
        value: closestDistance,
        detail: marketStats.closestCompetitor.name,
        Icon: MapPin,
        tone: "bg-sky-50 text-sky-700"
      });
    }
    return cards;
  }, [
    displaySelfAvg,
    displaySelfCount,
    marketStats,
    selfMarketPosition
  ]);

  const topRankByPlaceId = useMemo(() => {
    const ranks = new Map<string, number>();
    rankedMarket.forEach((row, index) => {
      ranks.set(row.place_id || row.id, index + 1);
    });
    return ranks;
  }, [rankedMarket]);

  const getCompetitorBadges = (row: CompetitorRow) => {
    const badges: string[] = [];
    const rank = topRankByPlaceId.get(row.place_id || row.id);
    const distanceLabel = formatDistance(row.distance_m);
    if (rank === 1) badges.push("Leader");
    if (distanceLabel && (row.distance_m ?? 0) <= 1000) badges.push("Très proche");
    if (
      isFiniteNumber(row.user_ratings_total) &&
      marketStats.medianReviews !== null &&
      row.user_ratings_total >= marketStats.medianReviews * 1.4
    ) {
      badges.push("Fort volume");
    }
    if (
      isFiniteNumber(row.rating) &&
      displaySelfAvg !== null &&
      row.rating >= displaySelfAvg
    ) {
      badges.push("À surveiller");
    }
    return Array.from(new Set(badges)).slice(0, 3);
  };

  const threatRows = useMemo(() => {
    const top3 = new Set(rankedMarket.slice(0, 3).map((row) => row.place_id || row.id));
    return rankedMarket
      .map((row) => {
        const key = row.place_id || row.id;
        const isTop3 = top3.has(key);
        const isNear = isFiniteNumber(row.distance_m) && row.distance_m <= 1000;
        const isClose =
          isFiniteNumber(row.distance_m) &&
          row.distance_m <= Math.max(1200, radiusKm * 1000 * 0.35);
        const hasBetterRating =
          displaySelfAvg !== null &&
          isFiniteNumber(row.rating) &&
          row.rating >= displaySelfAvg;
        const hasHigherVolume =
          displaySelfCount !== null &&
          isFiniteNumber(row.user_ratings_total) &&
          row.user_ratings_total > displaySelfCount;
        const aboveMedianRating =
          marketStats.medianRating !== null &&
          isFiniteNumber(row.rating) &&
          row.rating >= marketStats.medianRating;
        const aboveMedianVolume =
          marketStats.medianReviews !== null &&
          isFiniteNumber(row.user_ratings_total) &&
          row.user_ratings_total >= marketStats.medianReviews;
        const pressureSignals = [
          hasBetterRating,
          hasHigherVolume,
          isNear,
          isTop3,
          aboveMedianRating && aboveMedianVolume
        ].filter(Boolean).length;
        const signals = [
          isNear ? "Très proche" : null,
          hasBetterRating ? "Note supérieure" : null,
          hasHigherVolume ? "Volume d'avis supérieur" : null,
          isTop3 ? "Top 3 local" : null,
          aboveMedianRating && aboveMedianVolume ? "Forte visibilité" : null
        ].filter((item): item is string => item !== null);
        const level =
          pressureSignals >= 3 || (isTop3 && (hasBetterRating || hasHigherVolume || isNear))
            ? "Menace forte"
            : pressureSignals >= 1 || isClose
              ? "À surveiller"
              : "Faible menace";
        const impact =
          level === "Menace forte"
            ? "Fort"
            : level === "À surveiller"
              ? "Moyen"
              : "Faible";
        const reason =
          isNear && hasHigherVolume
            ? "Très proche et volume d'avis supérieur."
            : isNear && hasBetterRating
              ? "Très proche avec une note au moins équivalente."
              : hasBetterRating && hasHigherVolume
                ? "Note et volume d'avis supérieurs."
                : isTop3
                  ? "Présent dans le top 3 local."
                  : hasHigherVolume
                    ? "Volume d'avis supérieur."
                    : hasBetterRating
                      ? "Note au moins équivalente à la vôtre."
                      : isClose
                        ? "Concurrent proche dans le rayon étudié."
                        : "Signal concurrentiel limité.";
        return {
          row,
          level,
          impact,
          reason,
          signals,
          rank: topRankByPlaceId.get(key) ?? null
        };
      })
      .slice(0, 9);
  }, [
    displaySelfAvg,
    displaySelfCount,
    marketStats.medianRating,
    marketStats.medianReviews,
    radiusKm,
    rankedMarket,
    topRankByPlaceId
  ]);

  const visibleThreatRows = useMemo(() => {
    const activeThreats = threatRows.filter((item) => item.level !== "Faible menace");
    return (activeThreats.length > 0 ? activeThreats : threatRows).slice(0, 6);
  }, [threatRows]);

  const podiumCards = useMemo(() => {
    const used = new Set<string>();
    const cards: DisplayCompetitor[] = [];
    const addCard = (
      competitor: CompetitorRow | null,
      label: string,
      badge: string,
      tone: string
    ) => {
      if (!competitor) return;
      const key = competitor.place_id || competitor.id;
      if (used.has(key)) return;
      used.add(key);
      cards.push({
        competitor,
        label,
        badge,
        rank: topRankByPlaceId.get(key) ?? cards.length + 1,
        tone
      });
    };
    addCard(rankedMarket[0] ?? null, "Leader local", "Leader", "bg-slate-950 text-white");
    addCard(rankedMarket[1] ?? null, "Challenger", "À surveiller", "bg-white text-slate-950");
    addCard(
      distanceRankedMarket[0] ?? null,
      "Concurrent proche",
      "Très proche",
      "bg-white text-slate-950"
    );
    return cards.slice(0, 3);
  }, [distanceRankedMarket, rankedMarket, topRankByPlaceId]);

  const gapCards = useMemo(() => {
    const cards: Array<{ label: string; value: string; detail?: string }> = [];
    if (displaySelfAvg === null && displaySelfCount === null) return cards;
    if (displaySelfAvg !== null && marketStats.medianRating !== null) {
      const delta = displaySelfAvg - marketStats.medianRating;
      cards.push({
        label: "Écart note vs médiane",
        value: Math.abs(delta) < 0.05 ? "Aligné" : formatDelta(delta),
        detail: `${formatRating(displaySelfAvg)} vs ${formatRating(marketStats.medianRating)}`
      });
    }
    if (displaySelfCount !== null && marketStats.medianReviews !== null) {
      const delta = displaySelfCount - marketStats.medianReviews;
      cards.push({
        label: "Écart avis vs médiane",
        value: Math.abs(delta) < 1 ? "Aligné" : `${delta >= 0 ? "+" : ""}${formatInteger(delta)}`,
        detail: `${formatInteger(displaySelfCount)} vs ${formatInteger(
          marketStats.medianReviews
        )}`
      });
    }
    if (displaySelfAvg !== null && marketStats.bestRating !== null) {
      const delta = displaySelfAvg - marketStats.bestRating;
      cards.push({
        label: "Écart face au leader",
        value: Math.abs(delta) < 0.05 ? "Aligné" : formatDelta(delta),
        detail: marketStats.leader?.name
      });
    }
    const closestDistance = formatDistance(marketStats.closestCompetitor?.distance_m);
    if (closestDistance && marketStats.closestCompetitor) {
      cards.push({
        label: "Distance du plus proche",
        value: closestDistance,
        detail: marketStats.closestCompetitor.name
      });
    }
    return cards;
  }, [displaySelfAvg, displaySelfCount, marketStats]);

  const opportunityCards = useMemo(() => {
    const cards: Array<{ title: string; detail: string; tone: string }> = [];
    if (
      displaySelfCount !== null &&
      marketStats.medianReviews !== null &&
      marketStats.medianReviews > displaySelfCount
    ) {
      cards.push({
        title: "Avis à rattraper",
        detail: "Se rapprocher du volume médian d'avis.",
        tone: "border-blue-100 bg-blue-50/70 text-blue-800"
      });
    }
    if (
      displaySelfAvg !== null &&
      marketStats.bestRating !== null &&
      marketStats.bestRating > displaySelfAvg &&
      marketStats.bestRating - displaySelfAvg <= 0.3
    ) {
      cards.push({
        title: "Leader accessible",
        detail: "Faible écart de note avec le leader local.",
        tone: "border-emerald-100 bg-emerald-50/70 text-emerald-800"
      });
    }
    if (marketStats.closeCount >= 2) {
      cards.push({
        title: "Zone dense",
        detail: "Se différencier auprès des clients à proximité.",
        tone: "border-amber-100 bg-amber-50/70 text-amber-800"
      });
    }
    if (marketStats.total > 0 && marketStats.highRatedCount <= 2) {
      cards.push({
        title: "Terrain qualité",
        detail: "Occuper le territoire des meilleures notes locales.",
        tone: "border-slate-200 bg-white text-slate-800"
      });
    }
    return cards.slice(0, 4);
  }, [displaySelfAvg, displaySelfCount, marketStats]);

  const roadmapActions = useMemo(() => {
    const actions: Array<{ label: string; action: string; detail?: string }> = [];
    const addAction = (label: string, action: string, detail?: string) => {
      if (!actions.find((item) => item.label === label || item.action === action)) {
        actions.push({ label, action, detail });
      }
    };

    if (
      marketStats.closestCompetitor &&
      isFiniteNumber(marketStats.closestCompetitor.distance_m) &&
      marketStats.closestCompetitor.distance_m <= 1000
    ) {
      addAction(
        "Aujourd'hui",
        `Surveiller ${marketStats.closestCompetitor.name}.`,
        "Concurrent très proche dans le rayon étudié."
      );
    }
    if (
      displaySelfCount !== null &&
      marketStats.medianReviews !== null &&
      marketStats.medianReviews > displaySelfCount
    ) {
      const missingReviews = Math.ceil(marketStats.medianReviews - displaySelfCount);
      addAction(
        "Cette semaine",
        `Obtenir ${formatInteger(
          missingReviews
        )} nouveaux avis.`,
        "Objectif: se rapprocher de la médiane locale."
      );
    }
    if (
      displaySelfAvg !== null &&
      marketStats.bestRating !== null &&
      marketStats.bestRating > displaySelfAvg
    ) {
      addAction(
        "30 jours",
        "Réduire l'écart de note avec le leader.",
        "Répondre aux avis et valoriser les points forts déjà visibles."
      );
    }
    if (marketStats.closeCount >= 2 || marketStats.highRatedCount >= 3) {
      addAction(
        "90 jours",
        "Installer une différenciation locale durable.",
        marketStats.closeCount >= 2
          ? `${formatInteger(marketStats.closeCount)} concurrent(s) proches détectés.`
          : `${formatInteger(marketStats.highRatedCount)} concurrent(s) très bien notés.`
      );
    }
    return actions.slice(0, 4);
  }, [
    displaySelfAvg,
    displaySelfCount,
    marketStats.bestRating,
    marketStats.closeCount,
    marketStats.closestCompetitor,
    marketStats.highRatedCount,
    marketStats.medianReviews
  ]);

  const swotSections = useMemo(
    () =>
      [
        {
          title: "Forces",
          Icon: Sparkles,
          items: swotBullets.forces,
          tone: "border-emerald-100 bg-emerald-50/70 text-emerald-800"
        },
        {
          title: "Faiblesses",
          Icon: TrendingDown,
          items: swotBullets.weaknesses,
          tone: "border-rose-100 bg-rose-50/70 text-rose-800"
        },
        {
          title: "Opportunités",
          Icon: TrendingUp,
          items: swotBullets.opportunities,
          tone: "border-sky-100 bg-sky-50/70 text-sky-800"
        },
        {
          title: "Menaces",
          Icon: ShieldAlert,
          items: swotBullets.threats,
          tone: "border-slate-200 bg-slate-50 text-slate-700"
        }
      ].filter((section) => section.items.length > 0),
    [swotBullets]
  );

  const benchmarkTimeline = useMemo(() => {
    const grouped = new Map<
      string,
      { latest: BenchmarkTimelineItem; latestTs: number; versionCount: number }
    >();

    (benchmarkHistoryQuery.data ?? []).forEach((report) => {
      const payload = report.payload ?? null;
      const stats = payload?.stats ?? {};
      const locationKey = payload?.location_id ?? selectedLocationId ?? "all-locations";
      const keywordKey = (payload?.keyword ?? "benchmark").trim().toLowerCase();
      const radiusKey =
        typeof payload?.radius_km === "number" ? `${payload.radius_km}` : "all-radius";
      const monthKey = formatMonthKey(report.created_at);
      const groupKey = [
        "competitors_benchmark",
        locationKey,
        keywordKey,
        radiusKey,
        monthKey
      ].join("|");
      const total = isFiniteNumber(stats.total) ? stats.total : null;
      const medianRating = isFiniteNumber(stats.median_rating)
        ? stats.median_rating
        : null;
      const bestCompetitor =
        payload?.top_competitors?.find((item) => item.name?.trim()) ?? null;
      const timestamp = getTimestamp(report.created_at);
      const item: BenchmarkTimelineItem = {
        id: report.id,
        groupKey,
        createdAtTs: timestamp,
        month: formatMonthLabel(report.created_at),
        date: formatDateLabel(report.created_at),
        total,
        medianRating,
        bestCompetitor: bestCompetitor?.name?.trim() ?? null,
        versionCount: 1
      };
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, { latest: item, latestTs: timestamp, versionCount: 1 });
        return;
      }
      existing.versionCount += 1;
      if (timestamp >= existing.latestTs) {
        existing.latest = item;
        existing.latestTs = timestamp;
      }
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group.latest,
        versionCount: group.versionCount
      }))
      .filter((item) => item.month || item.total !== null || item.medianRating !== null)
      .sort((a, b) => b.createdAtTs - a.createdAtTs)
      .slice(0, 6);
  }, [benchmarkHistoryQuery.data, selectedLocationId]);

  const dedupedScanHistory = useMemo(() => {
    const seen = new Set<string>();
    return scanHistory.filter((item) => {
      const key = [
        item.locationId ?? "all-locations",
        item.keyword.trim().toLowerCase(),
        item.radiusKm,
        item.zoneLabel?.trim().toLowerCase() ?? "all-zones"
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [scanHistory]);

  const latestAnalysisDate =
    formatDateLabel(lastScanAt) ?? formatDateLabel(scanHistory[0]?.ts ?? null);

  const marketNarrative = useMemo(() => {
    const insights: string[] = [];
    if (displaySelfAvg !== null && marketStats.medianRating !== null) {
      const delta = displaySelfAvg - marketStats.medianRating;
      if (delta >= 0.2) {
        insights.push("Votre note est au-dessus de la médiane locale.");
      } else if (delta <= -0.2) {
        insights.push("L'écart de note avec la médiane locale doit être réduit.");
      } else {
        insights.push("Votre note est alignée avec le marché local.");
      }
    }
    if (displaySelfCount !== null && marketStats.medianReviews !== null) {
      if (displaySelfCount < marketStats.medianReviews) {
        insights.push("Le principal écart à combler concerne le volume d'avis.");
      } else {
        insights.push("Votre volume d'avis soutient votre visibilité locale.");
      }
    }
    if (marketStats.leader?.name && marketStats.bestRating !== null) {
      insights.push(
        `${marketStats.leader.name} mène le marché avec ${formatRating(
          marketStats.bestRating
        )}.`
      );
    }
    const closestDistance = formatDistance(marketStats.closestCompetitor?.distance_m);
    if (marketStats.closestCompetitor?.name && closestDistance) {
      insights.push(
        `${marketStats.closestCompetitor.name} est le concurrent le plus proche (${closestDistance}).`
      );
    }
    return insights.slice(0, 3);
  }, [
    displaySelfAvg,
    displaySelfCount,
    marketStats.bestRating,
    marketStats.closestCompetitor,
    marketStats.medianRating,
    marketStats.medianReviews,
    marketStats.leader
  ]);

  const comparisonPanels = useMemo(() => {
    const panels: Array<{
      title: string;
      caption: string;
      rows: Array<{ label: string; value: string; width: number; tone: string }>;
    }> = [];

    const noteRows = [
      displaySelfAvg !== null
        ? {
            label: "Vous",
            value: formatRating(displaySelfAvg),
            width: clampPercent((displaySelfAvg / 5) * 100),
            tone: "bg-blue-600"
          }
        : null,
      marketStats.leader?.rating !== null && isFiniteNumber(marketStats.leader?.rating)
        ? {
            label: "Leader",
            value: formatRating(marketStats.leader.rating),
            width: clampPercent((marketStats.leader.rating / 5) * 100),
            tone: "bg-slate-950"
          }
        : null,
      marketStats.medianRating !== null
        ? {
            label: "Médiane",
            value: formatRating(marketStats.medianRating),
            width: clampPercent((marketStats.medianRating / 5) * 100),
            tone: "bg-slate-400"
          }
        : null
    ].filter(
      (row): row is { label: string; value: string; width: number; tone: string } =>
        row !== null
    );
    if (noteRows.length >= 2) {
      panels.push({
        title: "Note",
        caption: "Position qualitative sur 5.",
        rows: noteRows
      });
    }

    const reviewValues = [
      displaySelfCount,
      marketStats.leader?.user_ratings_total ?? null,
      marketStats.medianReviews
    ].filter((value): value is number => isFiniteNumber(value) && value > 0);
    const maxReviews = reviewValues.length > 0 ? Math.max(...reviewValues) : null;
    if (maxReviews) {
      const reviewRows = [
        displaySelfCount !== null
          ? {
              label: "Vous",
              value: `${formatInteger(displaySelfCount)} avis`,
              width: clampPercent((displaySelfCount / maxReviews) * 100),
              tone: "bg-blue-600"
            }
          : null,
        marketStats.leader?.user_ratings_total !== null &&
        isFiniteNumber(marketStats.leader?.user_ratings_total)
          ? {
              label: "Leader",
              value: `${formatInteger(marketStats.leader.user_ratings_total)} avis`,
              width: clampPercent(
                (marketStats.leader.user_ratings_total / maxReviews) * 100
              ),
              tone: "bg-slate-950"
            }
          : null,
        marketStats.medianReviews !== null
          ? {
              label: "Médiane",
              value: `${formatInteger(marketStats.medianReviews)} avis`,
              width: clampPercent((marketStats.medianReviews / maxReviews) * 100),
              tone: "bg-slate-400"
            }
          : null
      ].filter(
        (row): row is { label: string; value: string; width: number; tone: string } =>
          row !== null
      );
      if (reviewRows.length >= 2) {
        panels.push({
          title: "Volume d'avis",
          caption: "Visibilité cumulée Google.",
          rows: reviewRows
        });
      }
    }

    const closestDistance = marketStats.closestCompetitor?.distance_m ?? null;
    const distanceValues = [closestDistance, marketStats.medianDistance].filter(
      (value): value is number => isFiniteNumber(value) && value > 0
    );
    const maxDistance = distanceValues.length > 0 ? Math.max(...distanceValues) : null;
    if (maxDistance && distanceValues.length >= 2) {
      panels.push({
        title: "Proximité",
        caption: "Distance réelle dans la zone étudiée.",
        rows: [
          closestDistance !== null
            ? {
                label: "Plus proche",
                value: formatDistance(closestDistance) ?? "",
                width: clampPercent((closestDistance / maxDistance) * 100),
                tone: "bg-rose-500"
              }
            : null,
          marketStats.medianDistance !== null
            ? {
                label: "Médiane",
                value: formatDistance(marketStats.medianDistance) ?? "",
                width: clampPercent((marketStats.medianDistance / maxDistance) * 100),
                tone: "bg-slate-400"
              }
            : null
        ].filter(
          (row): row is { label: string; value: string; width: number; tone: string } =>
            row !== null && row.value.length > 0
        )
      });
    }
    return panels;
  }, [
    displaySelfAvg,
    displaySelfCount,
    marketStats.closestCompetitor,
    marketStats.leader,
    marketStats.medianDistance,
    marketStats.medianRating,
    marketStats.medianReviews
  ]);

  const runCurrentScan = () => {
    if (!sectorLabel) {
      setScanError("Définis la catégorie de l’établissement avant de scanner.");
      setScanErrorHint("Renseigne-la dans Paramètres > Établissements.");
      setScanMessage(null);
      return;
    }
    scanMutation.mutate({ keyword: sectorLabel, radiusKm });
  };

  const relaunchLastScan = () => {
    const lastScan = scanHistory[0] ?? null;
    const fallbackRadius =
      lastScan?.radiusKm ??
      radiusKm ??
      settingsRow?.competitive_monitoring_radius_km ??
      0;
    if (!selectedLocationId) return;
    if (!enabled || !lastScan?.keyword || !fallbackRadius || !lastScan) {
      setScanError("Relance indisponible sans analyse précédente.");
      setScanErrorHint("Lance d’abord une analyse depuis le panneau.");
      setScanMessage(null);
      return;
    }
    setRadiusKm(fallbackRadius);
    if (lastScan.zoneLabel) {
      setZoneInput(lastScan.zoneLabel);
    }
    if (lastScan.locationId && lastScan.locationId !== selectedLocationId) {
      setSelectedLocationId(lastScan.locationId);
      setTimeout(() => {
        scanMutation.mutate({
          keyword: lastScan.keyword,
          radiusKm: fallbackRadius
        });
      }, 0);
      return;
    }
    scanMutation.mutate({
      keyword: lastScan.keyword,
      radiusKm: fallbackRadius
    });
  };

  return (
    <div className="competitors-report min-w-0 space-y-3 overflow-x-hidden pb-8 md:space-y-5">
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
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: #ffffff !important; }
          main {
            padding: 0 !important;
            background: #ffffff !important;
          }
          .competitors-report {
            color: #0f172a !important;
            background: #ffffff !important;
            padding: 0 !important;
            gap: 10px !important;
            overflow: visible !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .competitors-print-hidden,
          .competitors-report button,
          .competitors-report input,
          .competitors-report select,
          .competitors-report textarea,
          .competitors-report a,
          .competitors-report [role="button"] {
            display: none !important;
          }
          .competitors-report section,
          .competitors-report article,
          .competitors-report .competitors-print-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            min-width: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .competitors-report .competitors-list-section,
          .competitors-report .competitors-list-section article,
          .competitors-report .competitors-list-section [class*="grid"] {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
          }
          .competitors-report section,
          .competitors-report article,
          .competitors-report div {
            box-shadow: none !important;
          }
          .competitors-report section,
          .competitors-report article,
          .competitors-report [class*="bg-slate-950"],
          .competitors-report [class*="bg-slate-50"],
          .competitors-report [class*="bg-blue-50"] {
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .competitors-report [class*="rounded-"] {
            border-radius: 12px !important;
          }
          .competitors-report h1 {
            font-size: 30px !important;
            line-height: 1.1 !important;
          }
          .competitors-report h2 {
            font-size: 18px !important;
            margin: 0 !important;
          }
          .competitors-report h1,
          .competitors-report h2,
          .competitors-report h3,
          .competitors-report h4,
          .competitors-report h5,
          .competitors-report p,
          .competitors-report span,
          .competitors-report li {
            writing-mode: horizontal-tb !important;
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {isScanning && (
        <div className="competitors-print-hidden fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-sm">
          <div className="relative flex h-60 w-60 items-center justify-center rounded-full">
            <div className="absolute inset-0 rounded-full border border-blue-200/30" />
            <div
              className="absolute inset-0 rounded-full border border-blue-200/60"
              style={{ animation: "radar-pulse 2.6s ease-out infinite" }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(rgba(96,165,250,0.28), rgba(96,165,250,0) 62%)",
                animation: "radar-sweep 2.2s linear infinite"
              }}
            />
            <div className="relative z-10 rounded-2xl bg-slate-950/70 px-5 py-4 text-center shadow-2xl">
              <div className="text-sm font-semibold text-white">
                Analyse du marché local...
              </div>
              <div className="mt-1 text-xs text-blue-100">
                Lecture des concurrents autour de votre établissement.
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="competitors-print-hidden sticky top-4 z-20 flex justify-end pointer-events-none">
          <div
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs shadow-[0_18px_45px_rgba(15,23,42,0.10)]",
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-600"
            )}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Fermer"
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              onClick={() => setToast(null)}
            >
              x
            </button>
          </div>
        </div>
      )}

      <section className="competitors-print-card rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:p-5 lg:rounded-[24px] lg:p-6">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="min-w-0 space-y-2 lg:space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={googleConnected ? "success" : "neutral"}>
                {googleConnected ? "Google connecté" : "Google à connecter"}
              </Badge>
              <Badge variant={enabled ? "success" : "neutral"}>
                {enabled ? "Veille activée" : "Veille à activer"}
              </Badge>
              {latestAnalysisDate && (
                <Badge variant="neutral">Dernière analyse: {latestAnalysisDate}</Badge>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Lecture du marché local
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Veille concurrentielle
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600 md:text-base md:leading-6">
                Comprendre votre position locale et les écarts à combler.
              </p>
              {marketNarrative.length > 0 && (
                <div className="mt-3 hidden max-w-3xl gap-2 sm:grid sm:grid-cols-2">
                  {marketNarrative.map((item) => (
                    <p
                      key={item}
                      className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-2.5 text-sm font-medium leading-6 text-slate-800"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs text-slate-600 sm:gap-2">
              {selectedLocationLabel && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">
                  <MapPin size={13} />
                  {selectedLocationLabel}
                </span>
              )}
              {zoneLabel && zoneLabel !== selectedLocationLabel && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">
                  Zone: {zoneLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">
                Rayon: {radiusKm || statusRadius} km
              </span>
              {sectorLabel && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">
                  Secteur: {sectorLabel}
                </span>
              )}
              {marketStats.total > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium">
                  {formatInteger(marketStats.total)} concurrents
                </span>
              )}
            </div>
          </div>
          <div className="competitors-print-hidden flex w-full flex-col gap-2 sm:w-auto sm:flex-row lg:flex-col xl:flex-row">
            <Button
              className="min-h-11 w-full bg-ink text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] hover:bg-ink/90 sm:w-auto"
              onClick={runCurrentScan}
              disabled={sectorMissing || scanMutation.isPending || !selectedLocationId}
            >
              <span className="flex items-center justify-center gap-2">
                {scanMutation.isPending ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-white/70 border-t-white" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {scanMutation.isPending ? "Analyse..." : "Relancer"}
              </span>
            </Button>
            <Button
              variant="outline"
              className="min-h-11 w-full border-slate-200 bg-white sm:w-auto"
              onClick={handleGenerateBenchmark}
              disabled={benchmarkLoading || !selectedLocationId}
            >
              <span className="flex items-center justify-center gap-2">
                {benchmarkLoading ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-slate-700" />
                ) : (
                  <Download size={15} />
                )}
                <span className="sm:hidden">
                  {benchmarkLoading ? "Génération..." : "Benchmark"}
                </span>
                <span className="hidden sm:inline">
                  {benchmarkLoading ? "Génération..." : "Télécharger le benchmark"}
                </span>
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:mt-5 lg:grid-cols-5">
          {marketKpis.length > 0 ? (
            marketKpis.map(({ label, value, detail, Icon, tone }) => (
              <div
                key={label}
                className="competitors-print-card min-h-[118px] rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 lg:p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500">{label}</span>
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      tone
                    )}
                  >
                    <Icon size={16} />
                  </span>
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950 md:text-2xl">
                  {value}
                </div>
                {detail && (
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">
                    {detail}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              Lancez une analyse pour afficher les indicateurs du marché local.
            </div>
          )}
        </div>
      </section>

      {comparisonPanels.length > 0 && (
        <section className="competitors-print-card rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.045)] md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Positionnement comparé
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Vous, le leader et la médiane
              </h2>
            </div>
            <Badge variant="neutral">Données réelles</Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {comparisonPanels.map((panel) => (
              <article
                key={panel.title}
                className="competitors-print-card rounded-[20px] border border-slate-200 bg-slate-50/70 p-3 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.07)] motion-reduce:hover:translate-y-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">{panel.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{panel.caption}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {panel.rows.map((row) => (
                    <div key={`${panel.title}-${row.label}`} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-600">{row.label}</span>
                        <span className="font-semibold text-slate-900">{row.value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className={cn("h-full rounded-full", row.tone)}
                          style={{ width: `${row.width}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="competitors-print-hidden grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <details className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ink/20 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Target size={17} />
              Paramètres d’analyse
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
          </summary>
          <div className="mt-3 space-y-3">
            {locationsEmpty ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  Aucun établissement sélectionné
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Ajoutez un lieu pour lancer la veille concurrentielle.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-11 w-full"
                  onClick={() => navigate("/settings?tab=locations")}
                >
                  Choisir un établissement
                </Button>
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-600">
                  Établissement
                  <select
                    className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    value={selectedLocationId ?? ""}
                    onChange={(event) =>
                      setSelectedLocationId(event.target.value || null)
                    }
                  >
                    {locationsFirstLoad && <option>Chargement...</option>}
                    {!locationsFirstLoad &&
                      (locationsQuery.data ?? []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.location_title || location.location_resource_name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Rayon
                    <select
                      className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                      value={radiusKm}
                      onChange={(event) => setRadiusKm(Number(event.target.value))}
                    >
                      <option value={1}>1 km</option>
                      <option value={5}>5 km</option>
                      <option value={10}>10 km</option>
                      <option value={20}>20 km</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Zone
                    <input
                      className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                      value={zoneInput}
                      onChange={(event) => {
                        const nextValue = event.target.value.slice(0, 40);
                        setZoneInput(nextValue);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem("competitors_zone_label", nextValue);
                        }
                      }}
                      placeholder="ex: ecully"
                    />
                  </label>
                </div>
                {sectorMissing && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Secteur à compléter</span>
                      <Badge variant="warning">Action requise</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 min-h-11 w-full bg-white"
                      onClick={() => navigate("/settings?tab=locations")}
                    >
                      Compléter l’établissement
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="min-h-11 bg-ink text-white hover:bg-ink/90"
                    onClick={runCurrentScan}
                    disabled={sectorMissing || scanMutation.isPending || !selectedLocationId}
                  >
                    Lancer
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={relaunchLastScan}
                    disabled={!selectedLocationId || scanMutation.isPending || !scanHistory[0]}
                  >
                    Relancer
                  </Button>
                </div>
              </>
            )}
            {scanMutation.isPending && (
              <p className="text-xs text-slate-500">Analyse du marché local en cours...</p>
            )}
            {scanMessage && <p className="text-xs text-emerald-600">{scanMessage}</p>}
            {scanError && (
              <div className="text-xs text-rose-600">
                <p>{scanError}</p>
                {scanErrorHint && <p className="text-rose-500">{scanErrorHint}</p>}
              </div>
            )}
          </div>
        </details>

        <details className="group rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ink/20 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <CalendarDays size={17} />
              Historique benchmark
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
          </summary>
          <div className="mt-3">
            {benchmarkHistoryFirstLoad ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : benchmarkTimeline.length > 0 ? (
              <div className="space-y-2">
                {benchmarkTimeline.slice(0, 3).map((item, index) => (
                  <div
                    key={item.groupKey}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                        {item.month ?? item.date}
                      </p>
                      {index === 0 && <Badge variant="success">Dernier</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      {item.total !== null && (
                        <span>{formatInteger(item.total)} concurrents</span>
                      )}
                      {item.medianRating !== null && (
                        <span>Note {formatRating(item.medianRating)}</span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="min-h-11 bg-ink text-white hover:bg-ink/90"
                        onClick={() => navigate(`/reports?report_id=${item.id}`)}
                      >
                        Voir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 bg-white"
                        onClick={() => void downloadBenchmarkReport(item.id)}
                        disabled={downloadingBenchmarkId === item.id}
                      >
                        {downloadingBenchmarkId === item.id ? "..." : "PDF"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                Aucun benchmark généré.
              </div>
            )}
          </div>
        </details>

        <Card className="hidden rounded-[24px] shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:block">
          <CardHeader className="p-4 pb-0 md:p-5 md:pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target size={18} />
              Paramètres d'analyse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-5">
            {locationsEmpty ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  Aucun établissement sélectionné
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Ajoutez un lieu pour lancer la veille concurrentielle.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate("/settings?tab=locations")}
                >
                  Choisir un établissement
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Établissement
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                      value={selectedLocationId ?? ""}
                      onChange={(event) =>
                        setSelectedLocationId(event.target.value || null)
                      }
                    >
                      {locationsFirstLoad && <option>Chargement...</option>}
                      {!locationsFirstLoad &&
                        (locationsQuery.data ?? []).map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.location_title || location.location_resource_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Rayon
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                      value={radiusKm}
                      onChange={(event) => setRadiusKm(Number(event.target.value))}
                    >
                      <option value={1}>1 km</option>
                      <option value={5}>5 km</option>
                      <option value={10}>10 km</option>
                      <option value={20}>20 km</option>
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-600">
                  Zone géographique
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    value={zoneInput}
                    onChange={(event) => {
                      const nextValue = event.target.value.slice(0, 40);
                      setZoneInput(nextValue);
                      if (typeof window !== "undefined") {
                        window.localStorage.setItem("competitors_zone_label", nextValue);
                      }
                    }}
                    placeholder="ex: ecully, lyon 9"
                  />
                </label>
                {sectorMissing && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Secteur à compléter</span>
                      <Badge variant="warning">Action requise</Badge>
                    </div>
                    <p className="mt-1 leading-5">
                      Complétez la catégorie de l'établissement avant de relancer l'analyse.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => navigate("/settings?tab=locations")}
                    >
                      Compléter l'établissement
                    </Button>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1 bg-ink text-white hover:bg-ink/90"
                    onClick={runCurrentScan}
                    disabled={sectorMissing || scanMutation.isPending || !selectedLocationId}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw size={14} />
                      Lancer l'analyse
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={relaunchLastScan}
                    disabled={!selectedLocationId || scanMutation.isPending || !scanHistory[0]}
                  >
                    Relancer
                  </Button>
                </div>
              </>
            )}
            {scanMutation.isPending && (
              <p className="text-xs text-slate-500">Analyse du marché local en cours...</p>
            )}
            {scanMessage && <p className="text-xs text-emerald-600">{scanMessage}</p>}
            {scanError && (
              <div className="text-xs text-rose-600">
                <p>{scanError}</p>
                {scanErrorHint && <p className="text-rose-500">{scanErrorHint}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hidden rounded-[24px] shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:block">
          <CardHeader className="p-4 pb-0 md:p-5 md:pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays size={18} />
              Historique benchmark
            </CardTitle>
            {benchmarkHistoryRefreshing && (
              <p className="mt-1 text-xs font-medium text-slate-400">
                Actualisation...
              </p>
            )}
          </CardHeader>
          <CardContent className="p-4 md:p-5">
            {benchmarkHistoryFirstLoad ? (
              <div className="flex gap-3 overflow-hidden">
                <Skeleton className="h-24 min-w-48 rounded-2xl" />
                <Skeleton className="h-24 min-w-48 rounded-2xl" />
              </div>
            ) : benchmarkTimeline.length > 1 ? (
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {benchmarkTimeline.map((item, index) => (
                  <div
                    key={item.groupKey}
                    className="min-w-[230px] max-w-[260px] rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                        {item.month ?? item.date}
                      </p>
                      <span className="h-2 w-2 rounded-full bg-blue-600" />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      {item.total !== null && (
                        <p>{formatInteger(item.total)} concurrents</p>
                      )}
                      {item.medianRating !== null && (
                        <p>Note médiane {formatRating(item.medianRating)}</p>
                      )}
                      {item.bestCompetitor && (
                        <p className="truncate">Leader: {item.bestCompetitor}</p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {index === 0 && <Badge variant="success">Dernier</Badge>}
                      {item.versionCount > 1 && (
                        <Badge variant="neutral">{item.versionCount} versions</Badge>
                      )}
                      {item.versionCount === 1 && index === 0 && (
                        <Badge variant="neutral">Dernière version</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 flex-1 bg-ink text-white hover:bg-ink/90"
                        onClick={() => navigate(`/reports?report_id=${item.id}`)}
                      >
                        Voir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 bg-white"
                        onClick={() => void downloadBenchmarkReport(item.id)}
                        disabled={downloadingBenchmarkId === item.id}
                      >
                        {downloadingBenchmarkId === item.id ? "..." : "PDF"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : benchmarkTimeline.length === 1 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Première analyse disponible.</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {benchmarkTimeline[0].total !== null && (
                    <span>{formatInteger(benchmarkTimeline[0].total)} concurrents</span>
                  )}
                  {benchmarkTimeline[0].medianRating !== null && (
                    <span>Note médiane {formatRating(benchmarkTimeline[0].medianRating)}</span>
                  )}
                  {benchmarkTimeline[0].bestCompetitor && (
                    <span className="truncate">Leader: {benchmarkTimeline[0].bestCompetitor}</span>
                  )}
                  {benchmarkTimeline[0].versionCount > 1 && (
                    <span>{benchmarkTimeline[0].versionCount} versions</span>
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    className="bg-ink text-white hover:bg-ink/90"
                    onClick={() => navigate(`/reports?report_id=${benchmarkTimeline[0].id}`)}
                  >
                    Voir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void downloadBenchmarkReport(benchmarkTimeline[0].id)}
                    disabled={downloadingBenchmarkId === benchmarkTimeline[0].id}
                  >
                    {downloadingBenchmarkId === benchmarkTimeline[0].id
                      ? "Téléchargement..."
                      : "Télécharger"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Aucun benchmark généré.
              </div>
            )}
            {dedupedScanHistory.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {dedupedScanHistory.slice(0, 2).map((item) => (
                  <button
                    key={`${item.keyword}-${item.ts}`}
                    type="button"
                    onClick={() => {
                      setRadiusKm(item.radiusKm);
                      setZoneInput(item.zoneLabel ?? "");
                      if (item.locationId) {
                        setSelectedLocationId(item.locationId);
                      }
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="block truncate font-semibold text-slate-800">
                      {item.keyword} - {item.radiusKm} km
                    </span>
                    <span className="mt-1 block truncate text-slate-500">
                      {item.zoneLabel ??
                        (item.locationId
                          ? locationLabelById.get(item.locationId) ?? "Établissement"
                          : "Établissement")}{" "}
                      {formatDateLabel(item.ts) ? `- ${formatDateLabel(item.ts)}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {podiumCards.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Podium local
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Les acteurs qui structurent votre marché immédiat.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {podiumCards.map(({ competitor, label, badge, rank, tone }) => {
              const distance = formatDistance(competitor.distance_m);
              const tags = getCompetitorBadges(competitor);
              const leaderScore = podiumCards[0]
                ? scoreCompetitor(podiumCards[0].competitor)
                : 0;
              const progressWidth =
                leaderScore > 0
                  ? clampPercent((scoreCompetitor(competitor) / leaderScore) * 100)
                  : null;
              const ratingDelta = formatVsDelta(
                displaySelfAvg !== null && isFiniteNumber(competitor.rating)
                  ? competitor.rating - displaySelfAvg
                  : null
              );
              const reviewsDelta = formatCountDelta(
                displaySelfCount !== null && isFiniteNumber(competitor.user_ratings_total)
                  ? competitor.user_ratings_total - displaySelfCount
                  : null
              );
              return (
                <article
                  key={`${label}-${competitor.place_id}`}
                  className={cn(
                    "competitors-print-card rounded-[22px] border border-slate-200 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)] motion-reduce:hover:translate-y-0",
                    tone
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                      {label}
                    </p>
                    <Badge variant={rank === 1 ? "success" : "neutral"}>{badge}</Badge>
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold",
                        rank === 1 ? "bg-white text-slate-950" : "bg-slate-100 text-slate-900"
                      )}
                    >
                      {rank}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{competitor.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm opacity-75">
                        {isFiniteNumber(competitor.rating) && (
                          <span>{formatRating(competitor.rating)}</span>
                        )}
                        {isFiniteNumber(competitor.user_ratings_total) && (
                          <span>{formatInteger(competitor.user_ratings_total)} avis</span>
                        )}
                        {distance && <span>{distance}</span>}
                      </div>
                    </div>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-current/10 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {(progressWidth !== null || ratingDelta || reviewsDelta) && (
                    <div className="mt-4 space-y-3">
                      {progressWidth !== null && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs opacity-70">
                            <span>Force locale</span>
                            <span>{progressWidth}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                rank === 1 ? "bg-blue-300" : "bg-blue-600"
                              )}
                              style={{ width: `${progressWidth}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs font-semibold opacity-75">
                        {ratingDelta && <span>Note {ratingDelta}</span>}
                        {reviewsDelta && <span>Avis {reviewsDelta}</span>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {visibleThreatRows.length > 0 && (
          <Card className="competitors-print-card rounded-[22px] shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <CardHeader className="p-4 pb-0 md:p-5 md:pb-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert size={18} />
                Menaces locales
              </CardTitle>
              <p className="text-sm text-slate-500">
                Pourquoi certains acteurs pèsent vraiment sur votre zone.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {visibleThreatRows.map(({ row, reason, rank, impact, level, signals }) => (
                <article
                  key={`threat-${row.place_id}`}
                  className="competitors-print-card rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.07)] motion-reduce:hover:translate-y-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {row.name}
                        </p>
                        {rank && <Badge variant="neutral">#{rank}</Badge>}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {reason}
                      </p>
                    </div>
                    <Badge variant={level === "Menace forte" ? "warning" : "neutral"}>
                      Impact {impact}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                    {isFiniteNumber(row.rating) && (
                      <span>{formatRating(row.rating)}</span>
                    )}
                    {isFiniteNumber(row.user_ratings_total) && (
                      <span>{formatInteger(row.user_ratings_total)} avis</span>
                    )}
                    {formatDistance(row.distance_m) && (
                      <span>{formatDistance(row.distance_m)}</span>
                    )}
                  </div>
                  {signals.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {signals.slice(0, 3).map((signal) => (
                        <span
                          key={`${row.place_id}-${signal}`}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>
        )}

        {gapCards.length > 0 && (
          <Card className="competitors-print-card rounded-[22px] shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <CardHeader className="p-4 pb-0 md:p-5 md:pb-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target size={18} />
                Écarts à combler
              </CardTitle>
              <p className="text-sm text-slate-500">
                Comparaison avec les médianes et le leader local.
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
              {gapCards.map((card) => (
                <div
                  key={card.label}
                  className="competitors-print-card rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {card.value}
                  </p>
                  {card.detail && (
                    <p className="mt-1 truncate text-xs text-slate-500">{card.detail}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {opportunityCards.length > 0 && (
        <section className="competitors-print-card rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Opportunités
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Où progresser sans inventer de nouveaux leviers
              </h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {opportunityCards.map((card) => (
              <article
                key={card.title}
                className={cn(
                  "competitors-print-card rounded-[20px] border p-3 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.07)] motion-reduce:hover:translate-y-0",
                  card.tone
                )}
              >
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="mt-2 text-sm leading-6 opacity-80">{card.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {roadmapActions.length > 0 && (
        <section className="competitors-print-card rounded-[22px] border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
                Plan d'action
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Roadmap concurrentielle
              </h2>
            </div>
            <Badge variant="neutral">Plan court</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {roadmapActions.map((item) => (
              <article
                key={item.label}
                className="competitors-print-card rounded-2xl border border-white/10 bg-white/[0.06] p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
                  {item.label}
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-100">
                  {item.action}
                </p>
                {item.detail && (
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {item.detail}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {swotSections.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Analyse SWOT
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Lecture synthétique des forces, faiblesses, opportunités et menaces.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {swotSections.map(({ title, Icon, items, tone }) => (
              <article
                key={title}
                className={cn("competitors-print-card rounded-[22px] border p-3", tone)}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={16} />
                  {title}
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-6">
                  {items.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="competitors-list-section space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Concurrents
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Table responsive des acteurs observés et des actions disponibles.
            </p>
            {competitorsRefreshing && (
              <p className="mt-1 text-xs font-medium text-slate-400">
                Actualisation...
              </p>
            )}
          </div>
          <div className="text-xs font-medium text-slate-500">
            {visibleRadar.length} affichés / {filteredRadar.length} total
          </div>
        </div>

        <Card className="competitors-print-card rounded-[22px] shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <CardContent className="space-y-3 p-4">
            <div className="competitors-print-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(130px,0.8fr)_minmax(120px,0.7fr)_minmax(120px,0.8fr)]">
                <label className="text-xs font-semibold text-slate-600">
                  Rechercher
                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      value={radarSearch}
                      onChange={(event) => setRadarSearch(event.target.value)}
                      placeholder="Nom du concurrent"
                    />
                  </div>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Tri
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    value={radarSort}
                    onChange={(event) =>
                      setRadarSort(
                        event.target.value as "distance" | "rating" | "reviews"
                      )
                    }
                  >
                    <option value="distance">Distance</option>
                    <option value="rating">Note</option>
                    <option value="reviews">Avis</option>
                  </select>
                </label>
                {topLimitOptions.length > 0 && (
                  <label className="text-xs font-semibold text-slate-600">
                    Top
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      value={radarTopLimit ?? ""}
                      onChange={(event) => setRadarTopLimit(Number(event.target.value))}
                    >
                      {topLimitOptions.map((value) => (
                        <option key={value} value={value}>
                          Top {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 md:self-end">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={radarFollowedOnly}
                    onChange={(event) => setRadarFollowedOnly(event.target.checked)}
                  />
                  Suivis uniquement
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["all", "top3", "high", "low"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRadarFilter(filter)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      radarFilter === filter
                        ? "border-ink bg-ink text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {filter === "all" && "Tout"}
                    {filter === "top3" && "Top 3"}
                    {filter === "high" && "> 4.5"}
                    {filter === "low" && "< 3.5"}
                  </button>
                ))}
              </div>
            </div>

            {radarFirstLoad ? (
              <div className="grid gap-3 md:grid-cols-2">{skeletonCards}</div>
            ) : radarItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Aucun concurrent analysé</p>
                <p className="mt-1 leading-6 text-slate-500">
                  Lancez une analyse pour identifier les acteurs de votre zone.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={runCurrentScan}
                  disabled={scanMutation.isPending || !selectedLocationId || sectorMissing}
                >
                  Lancer l'analyse
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visibleRadar.map((competitor) => {
                  const rank = topRankByPlaceId.get(competitor.place_id || competitor.id);
                  const tier = getRadarTier(competitor);
                  const isPending = pendingPlaceIds.includes(competitor.place_id);
                  const isFollowed = competitor.is_followed;
                  const strategicTags = getStrategicTags(competitor, {
                    selfAvg: displaySelfAvg,
                    radiusKm
                  });
                  const insights = getCompetitorInsights(competitor);
                  const chips =
                    strategicTags.length > 0 ? strategicTags : insights.length > 0 ? insights : [];
                  const ratingDeltaLabel = formatVsDelta(
                    displaySelfAvg !== null && competitor.rating !== null
                      ? competitor.rating - displaySelfAvg
                      : null
                  );
                  const reviewsDeltaLabel = formatCountDelta(
                    displaySelfCount !== null &&
                      competitor.user_ratings_total !== null
                      ? competitor.user_ratings_total - displaySelfCount
                      : null
                  );
                  const distance = formatDistance(competitor.distance_m);
                  const riskItem = threatRows.find(
                    (item) => item.row.place_id === competitor.place_id
                  );
                  const risk = riskItem?.level ?? tier.label;
                  const action = getMajorWeakPoint(competitor, radiusKm);
                  const actionText = getActionRecommendation(action);
                  const leaderScore = rankedMarket[0]
                    ? scoreCompetitor(rankedMarket[0])
                    : 0;
                  const competitorProgress =
                    leaderScore > 0
                      ? clampPercent((scoreCompetitor(competitor) / leaderScore) * 100)
                      : null;
                  const metricCards = [
                    isFiniteNumber(competitor.rating)
                      ? { label: "Note", value: formatRating(competitor.rating) }
                      : null,
                    isFiniteNumber(competitor.user_ratings_total)
                      ? {
                          label: "Avis",
                          value: formatInteger(competitor.user_ratings_total)
                        }
                      : null,
                    distance ? { label: "Distance", value: distance } : null,
                    ratingDeltaLabel || reviewsDeltaLabel
                      ? {
                          label: "Écart",
                          value: ratingDeltaLabel ?? reviewsDeltaLabel ?? ""
                        }
                      : null
                  ].filter(
                    (item): item is { label: string; value: string } => item !== null
                  );
                  return (
                    <article
                      key={competitor.id}
                      className="competitors-print-card rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)] motion-reduce:hover:translate-y-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          {rank && (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-900">
                              #{rank}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 truncate text-base font-semibold text-slate-950">
                                {competitor.name}
                              </h3>
                              <Badge variant={tier.variant}>{tier.label}</Badge>
                              {isFollowed && <Badge variant="neutral">Suivi</Badge>}
                            </div>
                            {competitor.address && (
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {competitor.address}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={risk === "Menace forte" ? "warning" : "neutral"}
                          className="shrink-0"
                        >
                          {risk}
                        </Badge>
                      </div>

                      {metricCards.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {metricCards.map((metric) => (
                            <div
                              key={`${competitor.id}-${metric.label}`}
                              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                                {metric.label}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-950">
                                {metric.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {competitorProgress !== null && (
                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Force relative</span>
                            <span>{competitorProgress}% du leader</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${competitorProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {riskItem?.reason && (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                              Pourquoi il compte
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              {riskItem.reason}
                            </p>
                          </div>
                        )}
                        <div className="rounded-2xl bg-blue-50/70 px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                            Action
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-700">
                            {actionText}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-1.5">
                          {chips.length > 0 ? (
                            renderChipList(chips)
                          ) : (
                            <Badge variant="neutral">{action}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              followMutation.mutate({
                                placeId: competitor.place_id,
                                isFollowed: !isFollowed
                              })
                            }
                            disabled={isPending}
                          >
                            <span className="flex items-center gap-2">
                              {isPending ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-slate-600" />
                              ) : isFollowed ? (
                                <BookmarkX size={14} />
                              ) : (
                                <BookmarkPlus size={14} />
                              )}
                              {isFollowed ? "Retirer" : "Suivre"}
                            </span>
                          </Button>
                          <a
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                            href={buildGoogleLink(competitor.place_id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Google
                            <ArrowUpRight size={12} />
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {radarItems.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  {visibleRadar.length} affichés / {filteredRadar.length} total
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
      </section>
    </div>
  );
};

export { Competitors };
