import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import type { AnalyticsDrilldown } from "../types/analytics";
import { analyticsQueryKey, fetchAnalyticsBundle } from "../queries/analytics";

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

const formatRatio = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

const formatDelta = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

const formatDeltaCount = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value)}`;

const formatDeltaPct = (value: number | null): string =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;

const formatHours = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)} h`;

const formatShare = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}%`;

const getSeverityVariant = (
  severity: "good" | "warn" | "bad"
): "success" | "warning" | "neutral" => {
  if (severity === "good") {
    return "success";
  }
  if (severity === "bad") {
    return "warning";
  }
  return "neutral";
};

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
  const [granularity, setGranularity] = useState<"auto" | "day" | "week">(
    "auto"
  );
  const [drilldown, setDrilldown] = useState<AnalyticsDrilldown | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [drilldownDriver, setDrilldownDriver] = useState<{
    label: string;
    source: "ai" | "manual";
    tag_ids?: string[];
  } | null>(null);
  const [metric, setMetric] = useState<
    "reviews" | "avg_rating" | "neg_share" | "reply_rate"
  >("reviews");
  const presetKey = useMemo(() => {
    if (preset === "custom") {
      return `${from || "?"}_${to || "?"}`;
    }
    return preset;
  }, [preset, from, to]);

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

  const analyticsQuery = useQuery({
    queryKey: analyticsQueryKey({
      userId: session?.user?.id ?? null,
      locationId,
      presetKey,
      tz: timeZone
    }),
    queryFn: () => {
      if (!session?.access_token) {
        throw new Error("Missing session");
      }
      return fetchAnalyticsBundle({
        accessToken: session.access_token,
        locationId,
        preset,
        from,
        to,
        tz: timeZone,
        granularity
      });
    },
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev
  });

  const overview = analyticsQuery.data?.overview ?? null;
  const timeseries = analyticsQuery.data?.timeseries ?? null;
  const compare = analyticsQuery.data?.compare ?? null;
  const insights = analyticsQuery.data?.insights ?? null;
  const drivers = analyticsQuery.data?.drivers ?? null;
  const quality = analyticsQuery.data?.quality ?? null;
  const loading = analyticsQuery.isLoading;
  const isFetching = analyticsQuery.isFetching;
  const showSkeleton = loading && !analyticsQuery.data;
  const error = analyticsQuery.isError
    ? "Impossible de charger les analytics."
    : analyticsQuery.data?.error ?? null;

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

  const chartPoints = useMemo(
    () => (timeseries?.points ?? []).slice(-14),
    [timeseries]
  );

  const metricMax = useMemo(() => {
    if (metric === "reviews") {
      return Math.max(...chartPoints.map((point) => point.review_count), 1);
    }
    if (metric === "avg_rating") {
      return 5;
    }
    return 1;
  }, [chartPoints, metric]);

  const metricLabel = useMemo(() => {
    switch (metric) {
      case "avg_rating":
        return "Note";
      case "neg_share":
        return "Négatifs";
      case "reply_rate":
        return "Réponse";
      default:
        return "Avis";
    }
  }, [metric]);

  const formatMetricValue = (value: number | null) => {
    if (metric === "reviews") {
      return formatCount(value);
    }
    if (metric === "avg_rating") {
      return formatRating(value);
    }
    return formatRatio(value);
  };

  const locationLabelById = useMemo(() => {
    return new Map(
      locations.map((location) => [
        location.location_resource_name,
        location.location_title ?? location.location_resource_name
      ])
    );
  }, [locations]);

  const compareRows = useMemo(() => {
    if (!compare) {
      return [];
    }
    return [
      {
        key: "review_count",
        label: "Avis",
        a: formatCount(compare.metrics.review_count.a),
        b: formatCount(compare.metrics.review_count.b),
        delta: formatDeltaCount(compare.metrics.review_count.delta),
        deltaPct: formatDeltaPct(compare.metrics.review_count.delta_pct)
      },
      {
        key: "avg_rating",
        label: "Note",
        a: formatRating(compare.metrics.avg_rating.a),
        b: formatRating(compare.metrics.avg_rating.b),
        delta: formatDelta(compare.metrics.avg_rating.delta),
        deltaPct: "—"
      },
      {
        key: "neg_share",
        label: "Négatifs",
        a: formatRatio(compare.metrics.neg_share.a),
        b: formatRatio(compare.metrics.neg_share.b),
        delta: formatDeltaPct(compare.metrics.neg_share.delta),
        deltaPct: formatDeltaPct(compare.metrics.neg_share.delta_pct)
      },
      {
        key: "reply_rate",
        label: "Réponse",
        a: formatRatio(compare.metrics.reply_rate.a),
        b: formatRatio(compare.metrics.reply_rate.b),
        delta: formatDeltaPct(compare.metrics.reply_rate.delta),
        deltaPct: formatDeltaPct(compare.metrics.reply_rate.delta_pct)
      }
    ];
  }, [compare]);

  const loadDrilldown = async (
    driver: { label: string; source: "ai" | "manual"; tag_ids?: string[] },
    offset: number,
    append = false
  ) => {
    if (!session?.access_token) {
      return;
    }
    setDrilldownLoading(true);
    setDrilldownError(null);
    if (!append) {
      setDrilldown(null);
    }
    setDrilldownDriver(driver);
    const params = new URLSearchParams();
    if (locationId !== "all") {
      params.set("location", locationId);
    }
    params.set("period", preset);
    params.set("tz", timeZone);
    if (preset === "custom") {
      if (from) {
        params.set("from", from);
      }
      if (to) {
        params.set("to", to);
      }
    }
    params.set("tag", driver.label);
    params.set("source", driver.source);
    if (driver.tag_ids && driver.tag_ids.length > 0) {
      params.set("tag_ids", driver.tag_ids.join(","));
    }
    params.set("offset", String(offset));
    params.set("limit", "10");
    try {
      const response = await fetch(
        `/api/analytics?view=drilldown&${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setDrilldownError("Impossible de charger les avis.");
        setDrilldownLoading(false);
        return;
      }
      setDrilldown((prev) => {
        if (append && prev) {
          return {
            ...payload,
            items: [...prev.items, ...payload.items]
          } as AnalyticsDrilldown;
        }
        return payload as AnalyticsDrilldown;
      });
    } catch {
      setDrilldownError("Impossible de charger les avis.");
    } finally {
      setDrilldownLoading(false);
    }
  };

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
                  variant={granularity === "auto" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setGranularity("auto")}
                >
                  Auto
                </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyticsQuery.refetch()}
            disabled={loading}
          >
            Rafraîchir
          </Button>
          {locationsError && (
            <span className="text-xs text-amber-700">{locationsError}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Période: {getPresetLabel(preset)}</span>
          {isFetching && !loading && (
            <span className="text-xs text-slate-400">Actualisation...</span>
          )}
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
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Évolution</CardTitle>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                value={metric}
                onChange={(event) =>
                  setMetric(event.target.value as typeof metric)
                }
              >
                <option value="reviews">Avis</option>
                <option value="avg_rating">Note</option>
                <option value="neg_share">Négatifs</option>
                <option value="reply_rate">Réponse</option>
              </select>
            </div>
            <p className="text-sm text-slate-500">
              {metricLabel} sur la période sélectionnée.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSkeleton ? (
              <Skeleton className="h-40 w-full" />
            ) : chartPoints.length > 0 ? (
              <div className="space-y-3">
                {chartPoints.map((point) => {
                  const value =
                    metric === "reviews"
                      ? point.review_count
                      : metric === "avg_rating"
                        ? point.avg_rating
                        : metric === "neg_share"
                          ? point.neg_share
                          : point.reply_rate;
                  const width =
                    value === null || metricMax === 0
                      ? 0
                      : Math.round((value / metricMax) * 100);
                  return (
                    <div key={point.date} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{point.date}</span>
                        <span>
                          {metricLabel}: {formatMetricValue(value)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-ink"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
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
            <CardTitle>Comparaison</CardTitle>
            <p className="text-sm text-slate-500">
              Période actuelle vs période précédente.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSkeleton ? (
              <Skeleton className="h-36 w-full" />
            ) : compare ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Période A</span>
                  <span>
                    {compare.periodA.start.slice(0, 10)} {" - "}{" "}
                    {compare.periodA.end.slice(0, 10)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Période B</span>
                  <span>
                    {compare.periodB.start.slice(0, 10)} {" - "}{" "}
                    {compare.periodB.end.slice(0, 10)}
                  </span>
                </div>
                <div className="grid gap-3">
                  {compareRows.map((row) => (
                    <div
                      key={row.key}
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>{row.label}</span>
                        <span className="font-semibold text-slate-900">
                          {row.delta}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>A: {row.a}</span>
                        <span>B: {row.b}</span>
                        <span>{row.deltaPct}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Insights</CardTitle>
            <p className="text-sm text-slate-500">
              Points d'action prioritaires.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-36 w-full" />
            ) : insights && insights.insights.length > 0 ? (
              <div className="space-y-3">
                {insights.insights.map((insight, index) => (
                  <div
                    key={`${insight.title}-${index}`}
                    className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span className="font-semibold">{insight.title}</span>
                      <Badge variant={getSeverityVariant(insight.severity)}>
                        {insight.severity === "good"
                          ? "OK"
                          : insight.severity === "bad"
                            ? "Alerte"
                            : "À suivre"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{insight.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">—</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Drivers positifs</CardTitle>
            <p className="text-sm text-slate-500">
              Sujets qui tirent la satisfaction vers le haut.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-32 w-full" />
            ) : drivers && drivers.positives.length > 0 ? (
              drivers.positives.map((item) => (
                <button
                  key={`pos-${item.label}`}
                  type="button"
                  onClick={() =>
                    loadDrilldown(
                      { label: item.label, source: item.source, tag_ids: item.tag_ids },
                      0
                    )
                  }
                  className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-xs text-slate-500">
                      {formatDeltaCount(item.delta)} · {formatDeltaPct(item.delta_pct)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{item.count} mentions</span>
                    <span>{formatShare(item.share_pct)}</span>
                    <span>Solde: {item.net_sentiment}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                {overview ? reasonLabel : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Irritants principaux</CardTitle>
            <p className="text-sm text-slate-500">
              Sujets qui tirent la satisfaction vers le bas.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-32 w-full" />
            ) : drivers && drivers.irritants.length > 0 ? (
              drivers.irritants.map((item) => (
                <button
                  key={`neg-${item.label}`}
                  type="button"
                  onClick={() =>
                    loadDrilldown(
                      { label: item.label, source: item.source, tag_ids: item.tag_ids },
                      0
                    )
                  }
                  className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-xs text-slate-500">
                      {formatDeltaCount(item.delta)} · {formatDeltaPct(item.delta_pct)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{item.count} mentions</span>
                    <span>{formatShare(item.share_pct)}</span>
                    <span>Solde: {item.net_sentiment}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                {overview ? reasonLabel : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Qualité de réponse</CardTitle>
            <p className="text-sm text-slate-500">
              Suivi du temps et du taux de réponse.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-24 w-full" />
            ) : quality ? (
              <>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Taux de réponse</span>
                  <span className="font-semibold text-slate-900">
                    {formatRatio(quality.reply_rate)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Délai moyen</span>
                  <span className="font-semibold text-slate-900">
                    {formatHours(quality.avg_reply_delay_hours)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Réponses &lt; 24h</span>
                  <span className="font-semibold text-slate-900">
                    {formatRatio(quality.sla_24h)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {quality.replied_with_time_count} réponses avec délai mesuré.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">—</p>
            )}
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
            {showSkeleton ? (
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
            {showSkeleton ? (
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
            {showSkeleton ? (
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

      {drilldownDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <CardTitle>Exemples d'avis</CardTitle>
              <p className="text-sm text-slate-500">
                {drilldownDriver.label}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {drilldownLoading && <Skeleton className="h-32 w-full" />}
              {drilldownError && (
                <p className="text-sm text-amber-700">{drilldownError}</p>
              )}
              {!drilldownLoading && !drilldownError && drilldown ? (
                <div className="space-y-3">
                  {drilldown.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {item.rating ?? "—"}★ ·{" "}
                          {item.create_time ? item.create_time.slice(0, 10) : "—"}
                        </span>
                        <span>
                          {item.location_id
                            ? locationLabelById.get(item.location_id) ?? item.location_id
                            : "—"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {item.comment ?? "Avis sans commentaire."}
                      </p>
                    </div>
                  ))}
                  {drilldown.has_more && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        loadDrilldown(
                          drilldownDriver,
                          drilldown.items.length,
                          true
                        )
                      }
                      disabled={drilldownLoading}
                    >
                      Voir plus
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDrilldownDriver(null);
                    setDrilldown(null);
                    setDrilldownError(null);
                  }}
                >
                  Fermer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export { Analytics };
