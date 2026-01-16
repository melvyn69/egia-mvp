import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Radar,
  Trophy,
  Eye,
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

const Competitors = ({ session }: CompetitorsProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("selection");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

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
    mutationFn: async () => {
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
          action: "scan",
          location_id: selectedLocationId,
          radius_km: radiusKm,
          keyword
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Scan failed");
      }
      return payload;
    },
    onSuccess: () => {
      setScanMessage("Scan termine.");
      setScanError(null);
      queryClient.invalidateQueries({
        queryKey: ["competitors-radar", userId, selectedLocationId]
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de scanner.";
      setScanError(message);
      setScanMessage(null);
    }
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["competitors-radar", userId, selectedLocationId]
      });
      queryClient.invalidateQueries({
        queryKey: ["competitors-followed", userId, selectedLocationId]
      });
    }
  });

  const radarItems = radarQuery.data ?? [];
  const followedItems = followedQuery.data ?? [];
  const enabled = Boolean(settingsQuery.data?.competitive_monitoring_enabled);
  const keywordReady = Boolean(settingsQuery.data?.competitive_monitoring_keyword);

  const sortedFollowed = useMemo(() => {
    return followedItems
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a));
  }, [followedItems]);

  const swotSignals = useMemo(() => {
    const ratings = radarItems
      .map((row) => row.rating)
      .filter((value): value is number => typeof value === "number");
    const reviewCounts = radarItems
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
    return { avgRating, avgVolume };
  }, [radarItems]);

  const podium = useMemo(() => {
    const selfAvg = selfStatsQuery.data?.avg ?? null;
    const selfCount = selfStatsQuery.data?.count ?? 0;
    const selfScore =
      selfAvg !== null ? selfAvg * Math.log10(1 + selfCount) : null;
    const topCompetitors = radarItems
      .slice()
      .sort((a, b) => scoreCompetitor(b) - scoreCompetitor(a))
      .slice(0, 2);
    return {
      self: { score: selfScore, avg: selfAvg, count: selfCount },
      competitors: topCompetitors
    };
  }, [radarItems, selfStatsQuery.data]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Veille concurrentielle
          </h1>
          <p className="text-sm text-slate-500">
            Suivez les acteurs proches et comparez vos performances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">MVP</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["selection", "radar", "swot"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab
                ? "border-ink bg-ink text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab === "selection" && "Ma Selection"}
            {tab === "radar" && "Radar"}
            {tab === "swot" && "Analyse SWOT"}
          </button>
        ))}
      </div>

      {(!enabled || !keywordReady) && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm text-slate-600">
            <div>
              Activez la veille concurrentielle et renseignez le mot-cle dans
              Parametres.
            </div>
            <Button variant="outline" onClick={() => navigate("/settings?tab=locations")}>
              Aller aux parametres
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Etalonnage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="text-xs font-semibold text-slate-600">
            Etablissement suivi
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["competitors-radar", userId, selectedLocationId] })}
            >
              Rafraichir
            </Button>
          </div>
        </CardContent>
      </Card>

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
              <Skeleton className="h-24 w-full" />
            ) : sortedFollowed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                Aucun concurrent suivi pour le moment.
              </div>
            ) : (
              sortedFollowed.map((competitor, index) => {
                const tier = index === 0 ? "LEADER" : index === 1 ? "CHALLENGER" : "OUTSIDER";
                const tierVariant =
                  tier === "LEADER" ? "success" : tier === "CHALLENGER" ? "warning" : "neutral";
                return (
                  <div
                    key={competitor.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {competitor.name}
                        </p>
                        <Badge variant={tierVariant}>{tier}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {competitor.address ?? "Adresse indisponible"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Note: {competitor.rating ?? "—"}</span>
                      <span>Avis: {competitor.user_ratings_total ?? "—"}</span>
                      <span>Distance: {formatDistance(competitor.distance_m)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          followMutation.mutate({
                            placeId: competitor.place_id,
                            isFollowed: false
                          })
                        }
                      >
                        <BookmarkX size={14} className="mr-1" /> Retirer
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "radar" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radar size={18} />
                Scanner ma zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_140px_180px]">
                <label className="text-xs font-semibold text-slate-600">
                  Mot-cle
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="restaurant italien"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Rayon
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                    onClick={() => scanMutation.mutate()}
                    disabled={!keyword || scanMutation.isPending}
                  >
                    {scanMutation.isPending ? "Scan..." : "Scanner"}
                  </Button>
                </div>
              </div>
              {scanMessage && <p className="text-xs text-emerald-600">{scanMessage}</p>}
              {scanError && <p className="text-xs text-rose-600">{scanError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Radar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {radarQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : radarItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                  Lancez un scan pour afficher les concurrents proches.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {radarItems.map((competitor) => (
                    <Card key={competitor.id}>
                      <CardContent className="space-y-3 pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {competitor.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {competitor.address ?? "Adresse indisponible"}
                            </p>
                          </div>
                          <Badge variant="neutral">
                            {formatDistance(competitor.distance_m)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Note: {competitor.rating ?? "—"}</span>
                          <span>Avis: {competitor.user_ratings_total ?? "—"}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            followMutation.mutate({
                              placeId: competitor.place_id,
                              isFollowed: true
                            })
                          }
                        >
                          <BookmarkPlus size={14} className="mr-1" /> Suivre ce concurrent
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "swot" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye size={18} />
                Analyse SWOT
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">Forces</p>
                <p className="mt-2 text-sm text-slate-700">
                  Note moyenne observée:{" "}
                  {swotSignals.avgRating
                    ? swotSignals.avgRating.toFixed(2)
                    : "—"}.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">Faiblesses</p>
                <p className="mt-2 text-sm text-slate-700">
                  Volume moyen d'avis:{" "}
                  {swotSignals.avgVolume
                    ? Math.round(swotSignals.avgVolume)
                    : "—"}.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">Opportunites</p>
                <p className="mt-2 text-sm text-slate-700">
                  Suivez les acteurs proches pour adapter vos actions.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">Menaces</p>
                <p className="mt-2 text-sm text-slate-700">
                  Les concurrents les mieux notes definissent le niveau d'exigence.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Podium</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Votre etablissement</span>
                <span>
                  {podium.self.avg ? podium.self.avg.toFixed(2) : "—"} /{" "}
                  {podium.self.count} avis
                </span>
              </div>
              {podium.competitors.map((row) => (
                <div key={row.id} className="flex items-center justify-between">
                  <span>{row.name}</span>
                  <span>
                    {row.rating ?? "—"} / {row.user_ratings_total ?? "—"} avis
                  </span>
                </div>
              ))}
              {isTop10 && (
                <Badge variant="success">Top 10% du radar</Badge>
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
// 1) Scanner 5km avec un mot-cle, verifier le radar.
// 2) Suivre 2 concurrents, verifier Ma Selection.
// 3) Verifier le podium et l'indicateur Top 10%.
// 4) Si coords manquantes, message d'action affiche et scan refuse.
