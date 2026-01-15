import type {
  AnalyticsCompare,
  AnalyticsDrivers,
  AnalyticsInsights,
  AnalyticsOverview,
  AnalyticsQuality,
  AnalyticsTimeseries
} from "../types/analytics";

type AnalyticsQueryKeyParams = {
  userId: string | null;
  locationId: string;
  presetKey: string;
  tz: string;
};

type AnalyticsFetchParams = {
  accessToken: string;
  locationId: string;
  preset: string;
  from?: string;
  to?: string;
  tz: string;
  granularity: "auto" | "day" | "week";
};

export type AnalyticsBundle = {
  error: string | null;
  overview: AnalyticsOverview | null;
  timeseries: AnalyticsTimeseries | null;
  compare: AnalyticsCompare | null;
  insights: AnalyticsInsights | null;
  drivers: AnalyticsDrivers | null;
  quality: AnalyticsQuality | null;
};

export const analyticsQueryKey = ({
  userId,
  locationId,
  presetKey,
  tz
}: AnalyticsQueryKeyParams) =>
  ["analytics", userId ?? null, locationId, presetKey, tz] as const;

export const fetchAnalyticsBundle = async ({
  accessToken,
  locationId,
  preset,
  from,
  to,
  tz,
  granularity
}: AnalyticsFetchParams): Promise<AnalyticsBundle> => {
  const params = new URLSearchParams();
  if (locationId !== "all") {
    params.set("location", locationId);
  }
  params.set("period", preset);
  params.set("tz", tz);
  if (preset === "custom") {
    if (from) {
      params.set("from", from);
    }
    if (to) {
      params.set("to", to);
    }
  }
  params.set("granularity", granularity);

  const [
    overviewRes,
    seriesRes,
    compareRes,
    insightsRes,
    driversRes,
    qualityRes
  ] = await Promise.all([
    fetch(`/api/kpi/analytics?view=overview&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    fetch(`/api/kpi/analytics?view=timeseries&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    fetch(`/api/kpi/analytics?view=compare&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    fetch(`/api/kpi/analytics?view=insights&mode=auto&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    fetch(`/api/kpi/analytics?view=drivers&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }),
    fetch(`/api/kpi/analytics?view=quality&${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
  ]);

  const overviewPayload = await overviewRes.json().catch(() => null);
  if (!overviewRes.ok || !overviewPayload) {
    return {
      error: "Impossible de charger l'aperçu analytics.",
      overview: null,
      timeseries: null,
      compare: null,
      insights: null,
      drivers: null,
      quality: null
    };
  }

  const seriesPayload = await seriesRes.json().catch(() => null);
  const comparePayload = await compareRes.json().catch(() => null);
  const insightsPayload = await insightsRes.json().catch(() => null);
  const driversPayload = await driversRes.json().catch(() => null);
  const qualityPayload = await qualityRes.json().catch(() => null);

  return {
    error: !seriesRes.ok || !seriesPayload
      ? "Impossible de charger les tendances."
      : null,
    overview: overviewPayload as AnalyticsOverview,
    timeseries: seriesRes.ok ? (seriesPayload as AnalyticsTimeseries) : null,
    compare: compareRes.ok ? (comparePayload as AnalyticsCompare) : null,
    insights: insightsRes.ok ? (insightsPayload as AnalyticsInsights) : null,
    drivers: driversRes.ok ? (driversPayload as AnalyticsDrivers) : null,
    quality: qualityRes.ok ? (qualityPayload as AnalyticsQuality) : null
  };
};
