import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import type { AnalyticsOverview, AnalyticsTimeseries } from "../types/analytics";

type AnalyticsProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatRating = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}/5`;

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

const getReasonLabel = (reasons: string[]): string => {
  if (reasons.includes("no_locations")) {
    return "Aucune fiche connectée";
  }
  if (reasons.includes("no_reviews_in_range")) {
    return "Aucun avis sur la période";
  }
  if (reasons.includes("no_sentiment_data")) {
    return "Analyse en cours";
  }
  if (reasons.includes("no_ai_topics")) {
    return "Pas de thèmes détectés";
  }
  if (reasons.includes("no_replyable_reviews")) {
    return "Aucun avis avec texte";
  }
  return "Pas assez de données";
};

const getPresetLabel = (preset: string): string => {
  switch (preset) {
    case "this_week":
      return "Cette semaine";
    case "this_month":
      return "Ce mois";
    case "this_quarter":
      return "Ce trimestre";
    case "last_quarter":
      return "Trimestre précédent";
    case "this_year":
      return "Cette année";
    case "last_year":
      return "Année dernière";
    case "all_time":
      return "Depuis toujours";
    case "custom":
      return "Personnalisé";
    default:
      return "—";
  }
};

const Analytics = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: AnalyticsProps) => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [preset, setPreset] = useState<
    | "this_week"
    | "this_month"
    | "this_quarter"
    | "last_quarter"
    | "this_year"
    | "last_year"
    | "all_time"
    | "custom"
  >("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationId, setLocationId] = useState("all");
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLocationId("all");
    }
  }, [locationId]);

  const rangeDays = useMemo(() => {
    if (preset === "custom" && from && to) {
      const diff =
        new Date(to).getTime() - new Date(from).getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    if (preset === "all_time") {
      return 365;
    }
    return 0;
  }, [preset, from, to]);

  useEffect(() => {
    if (!session?.access_token) {
      setOverview(null);
      setTimeseries(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (locationId !== "all") {
        params.set("location_id", locationId);
      }
      params.set("preset", preset);
      params.set("tz", timeZone);
      if (preset === "custom") {
        if (from) {
          params.set("from", from);
        }
        if (to) {
          params.set("to", to);
        }
      }
      params.set("granularity", granularity);
      try {
        const [overviewRes, seriesRes] = await Promise.all([
          fetch(`/api/analytics?op=overview&${params.toString()}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }),
          fetch(`/api/analytics?op=timeseries&${params.toString()}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          })
        ]);
        const overviewPayload = await overviewRes.json().catch(() => null);
        const seriesPayload = await seriesRes.json().catch(() => null);
        if (cancelled) {
          return;
        }
        if (!overviewRes.ok || !overviewPayload) {
          setError("Impossible de charger l'aperçu analytics.");
          setOverview(null);
          setTimeseries(null);
          return;
        }
        if (!seriesRes.ok || !seriesPayload) {
          setError("Impossible de charger les tendances.");
          setOverview(overviewPayload as AnalyticsOverview);
          setTimeseries(null);
          return;
        }
        setOverview(overviewPayload as AnalyticsOverview);
        setTimeseries(seriesPayload as AnalyticsTimeseries);
      } catch {
        if (!cancelled) {
          setError("Impossible de charger les analytics.");
          setOverview(null);
          setTimeseries(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, preset, from, to, locationId, timeZone, granularity]);

  const ratingTotal = useMemo(() => {
    if (!overview) {
      return 0;
    }
    return (
      overview.ratings["1"] +
      overview.ratings["2"] +
      overview.ratings["3"] +
      overview.ratings["4"] +
      overview.ratings["5"]
    );
  }, [overview]);

  const trendMax = useMemo(() => {
    if (!timeseries?.points.length) {
      return 1;
    }
    return Math.max(...timeseries.points.map((point) => point.reviews_total), 1);
  }, [timeseries]);

  const reasonLabel = overview ? getReasonLabel(overview.reasons) : "";
  const showGranularityToggle = rangeDays > 30 || preset === "all_time";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Analytics</h2>
        <p className="text-sm text-slate-500">
          Suivi des tendances et de la performance des avis.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Lieu</label>
            <select
              className="mt-1 w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={locationsLoading}
            >
              <option value="all">Toutes les fiches</option>
              {locations.map((location) => (
                <option
                  key={location.location_resource_name}
                  value={location.location_resource_name}
                >
                  {location.location_title ?? location.location_resource_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Période</label>
            <select
              className="mt-1 w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              value={preset}
              onChange={(event) => setPreset(event.target.value as typeof preset)}
            >
              <option value="this_week">Cette semaine</option>
              <option value="this_month">Ce mois</option>
              <option value="this_quarter">Ce trimestre</option>
              <option value="last_quarter">Trimestre précédent</option>
              <option value="this_year">Cette année</option>
              <option value="last_year">Année dernière</option>
              <option value="all_time">Depuis toujours</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
              <input
                type="date"
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          )}
          {showGranularityToggle && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">
                Granularité
              </label>
              <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                <Button
                  variant={granularity === "day" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setGranularity("day")}
                >
                  Jour
                </Button>
                <Button
                  variant={granularity === "week" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setGranularity("week")}
                >
                  Semaine
                </Button>
              </div>
            </div>
          )}
          {locationsError && (
            <span className="text-xs text-amber-700">{locationsError}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Période: {getPresetLabel(preset)}</span>
          {overview && overview.data_status !== "ok" && (
            <Badge variant="warning">{reasonLabel || "Données partielles"}</Badge>
          )}
        </div>
      </section>

      {error && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-amber-700">{error}</p>
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tendances</CardTitle>
            <p className="text-sm text-slate-500">
              Avis et note moyenne sur la période.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : timeseries && timeseries.points.length > 0 ? (
              <div className="space-y-3">
                {timeseries.points.slice(-10).map((point) => (
                  <div key={point.bucket_start} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{point.bucket_start.slice(0, 10)}</span>
                      <span>
                        {formatCount(point.reviews_total)} avis ·{" "}
                        {formatRating(point.avg_rating)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-ink"
                        style={{
                          width: `${Math.round(
                            (point.reviews_total / trendMax) * 100
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {overview ? reasonLabel : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Résumé rapide</CardTitle>
            <p className="text-sm text-slate-500">
              Synthèse des KPIs principaux.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Total avis</span>
              <span className="font-semibold text-slate-900">
                {formatCount(overview?.kpis.reviews_total)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Note moyenne</span>
              <span className="font-semibold text-slate-900">
                {formatRating(overview?.kpis.avg_rating ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Taux de réponse</span>
              <span className="font-semibold text-slate-900">
                {formatPercent(overview?.kpis.response_rate_pct ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Part d'avis négatifs</span>
              <span className="font-semibold text-slate-900">
                {formatPercent(overview?.kpis.negative_share_pct ?? null)}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des notes</CardTitle>
            <p className="text-sm text-slate-500">
              Distribution des notes 1 à 5.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : overview ? (
              (["5", "4", "3", "2", "1"] as const).map((rating) => {
                const count = overview.ratings[rating];
                const percent =
                  ratingTotal > 0
                    ? Math.round((count / ratingTotal) * 100)
                    : null;
                return (
                  <div key={rating} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{rating}★</span>
                      <span>
                        {formatCount(count)} ·{" "}
                        {percent === null ? "—" : `${percent}%`}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-slate-700"
                        style={{
                          width: `${
                            percent === null ? 0 : Math.max(percent, 2)
                          }%`
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Réactivité</CardTitle>
            <p className="text-sm text-slate-500">
              Réponses envoyées sur les avis avec texte.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Taux de réponse</span>
              <span className="font-semibold text-slate-900">
                {formatPercent(overview?.kpis.response_rate_pct ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Réponses</span>
              <span className="font-semibold text-slate-900">
                {formatCount(overview?.kpis.replied_count)} /{" "}
                {formatCount(overview?.kpis.replyable_count)}
              </span>
            </div>
            {overview?.kpis.replyable_count === 0 && (
              <p className="text-xs text-slate-500">{reasonLabel}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Points forts</CardTitle>
            <p className="text-sm text-slate-500">
              Ce que vos clients apprécient le plus.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : overview && overview.topics.strengths.length > 0 ? (
              <div className="space-y-2">
                {overview.topics.strengths.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span>{item.label}</span>
                    <Badge variant="neutral">{item.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {overview ? reasonLabel : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Irritants</CardTitle>
            <p className="text-sm text-slate-500">
              Points d'amélioration récurrents.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : overview && overview.topics.irritants.length > 0 ? (
              <div className="space-y-2">
                {overview.topics.irritants.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span>{item.label}</span>
                    <Badge variant="neutral">{item.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {overview ? reasonLabel : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export { Analytics };
