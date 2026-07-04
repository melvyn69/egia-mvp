import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import { supabase } from "../lib/supabase";

export type DashboardKpiPreset =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

export type DashboardKpiSummary = {
  period: { preset: string; from: string | null; to: string | null; tz: string };
  scope: { locationId?: string | null; locationsCount: number };
  counts: {
    reviews_total: number;
    reviews_with_text: number;
    reviews_replied: number;
    reviews_replyable: number;
  };
  ratings: {
    avg_rating: number | null;
  };
  response: {
    response_rate_pct: number | null;
  };
  sentiment: {
    sentiment_positive_pct: number | null;
    sentiment_samples: number;
  };
  nps: {
    nps_score: number | null;
    nps_samples: number;
  };
  meta: {
    data_status: "ok" | "no_data" | "collecting";
    reasons: string[];
  };
  top_tags?: Array<{ tag: string; count: number }>;
};

export type DashboardAiKpiData = {
  sentiment: {
    positivePct: number | null;
    neutralPct: number | null;
    negativePct: number | null;
    mixedPct: number | null;
    samples: number;
  };
  avgScore: number | null;
  topTags: Array<{ tag: string; count: number }>;
  trend: Array<{
    date: string;
    avgScore: number | null;
    samples: number;
    criticalCount: number;
  }>;
  priorityCount: number;
};

type DashboardScope = {
  workspaceId: string | null;
  accountId: string | null;
  userId: string | null;
};

type DashboardKpiParams = DashboardScope & {
  accessToken: string | null;
  locationId: string;
  preset: DashboardKpiPreset;
  from: string;
  to: string;
  timeZone: string;
};

type DashboardAiInsightRow = {
  id: string;
  create_time: string | null;
  location_id: string | null;
  review_ai_insights?:
    | {
        sentiment?: string | null;
        sentiment_score?: number | null;
      }
    | Array<{
        sentiment?: string | null;
        sentiment_score?: number | null;
      }>
    | null;
  review_ai_tags?:
    | Array<{
        ai_tags?: { tag?: string | null; category?: string | null } | null;
      }>
    | null;
};

type DashboardAiTagRow = {
  tag?: string | null;
  category?: string | null;
};

type DashboardActiveLocationSettings = {
  active_location_ids: string[] | null;
};

type SaveDashboardActiveLocationsInput = DashboardScope & {
  businessName: string;
  selectedActiveIds: string[];
  allLocationIds: string[];
};

type SaveDashboardActiveLocationsResult = {
  activeLocationIds: string[] | null;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getPresetRange = (
  preset: DashboardKpiPreset,
  from: string,
  to: string
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  switch (preset) {
    case "this_week": {
      const day = now.getDay();
      const diff = (day + 6) % 7;
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff));
      return { start, end: endOfDay(now) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfDay(now) };
    }
    case "this_quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      return { start, end: endOfDay(now) };
    }
    case "last_quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      const lastQuarter = quarter === 0 ? 3 : quarter - 1;
      const year = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, lastQuarter * 3, 1);
      const end = endOfDay(new Date(year, lastQuarter * 3 + 3, 0));
      return { start, end };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: endOfDay(now) };
    }
    case "last_year": {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
      return { start, end };
    }
    case "custom": {
      const start = from ? startOfDay(new Date(from)) : null;
      const end = to ? endOfDay(new Date(to)) : null;
      return { start, end };
    }
    case "all_time":
    default:
      return { start: null, end: null };
  }
};

const normalizeSentiment = (value: unknown): "positive" | "neutral" | "negative" | null => {
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

const getInsight = (record: DashboardAiInsightRow) => {
  const insight = asOne(record.review_ai_insights);
  if (!insight) {
    return null;
  }
  return {
    sentiment: normalizeSentiment(insight.sentiment),
    score:
      typeof insight.sentiment_score === "number"
        ? insight.sentiment_score
        : null
  };
};

const getTags = (record: DashboardAiInsightRow) => {
  if (!Array.isArray(record.review_ai_tags)) {
    return [];
  }
  return record.review_ai_tags
    .map((tagRow) => {
      const tagRecord = tagRow?.ai_tags as DashboardAiTagRow | null | undefined;
      return {
        tag: typeof tagRecord?.tag === "string" ? tagRecord.tag : null,
        category:
          typeof tagRecord?.category === "string" ? tagRecord.category : null
      };
    })
    .filter((tag): tag is { tag: string; category: string | null } => !!tag.tag);
};

const dashboardScopeKey = ({ workspaceId, accountId }: DashboardScope) => ({
  workspaceId,
  accountId
});

export const dashboardKpiSummaryQueryKey = ({
  workspaceId,
  accountId,
  userId,
  locationId,
  preset,
  from,
  to,
  timeZone
}: Omit<DashboardKpiParams, "accessToken">) =>
  [
    "kpi-summary",
    userId,
    locationId,
    preset,
    dashboardScopeKey({ workspaceId, accountId, userId }),
    from,
    to,
    timeZone
  ] as const;

export const dashboardAiKpisQueryKey = ({
  workspaceId,
  accountId,
  userId,
  locationId,
  preset,
  from,
  to,
  timeZone
}: Omit<DashboardKpiParams, "accessToken">) =>
  [
    "ai-kpis",
    userId,
    locationId,
    preset,
    dashboardScopeKey({ workspaceId, accountId, userId }),
    from,
    to,
    timeZone
  ] as const;

export const dashboardActiveLocationSettingsQueryKey = ({
  workspaceId,
  accountId,
  userId
}: DashboardScope) =>
  [
    "business-settings",
    userId,
    "dashboard-active-locations",
    dashboardScopeKey({ workspaceId, accountId, userId })
  ] as const;

export const useDashboardKpiSummary = ({
  accessToken,
  workspaceId,
  accountId,
  userId,
  locationId,
  preset,
  from,
  to,
  timeZone
}: DashboardKpiParams) =>
  useQuery<DashboardKpiSummary>({
    queryKey: dashboardKpiSummaryQueryKey({
      workspaceId,
      accountId,
      userId,
      locationId,
      preset,
      from,
      to,
      timeZone
    }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Dashboard",
        queryKey,
        queryFn: async () => {
          if (!accessToken) {
            throw new Error("Missing session");
          }
          const params = new URLSearchParams();
          if (locationId && locationId !== "all") {
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
          const response = await fetch(`/api/kpi/summary?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload) {
            throw new Error("Failed to load KPIs");
          }
          return payload as DashboardKpiSummary;
        },
        getRowCount: (data) => data.counts.reviews_total
      }),
    enabled: Boolean(accessToken) && (preset !== "custom" || Boolean(from && to)),
    placeholderData: (prev) => prev
  });

export const useDashboardAiKpis = ({
  workspaceId,
  accountId,
  userId,
  locationId,
  preset,
  from,
  to,
  timeZone
}: Omit<DashboardKpiParams, "accessToken">) =>
  useQuery<DashboardAiKpiData>({
    queryKey: dashboardAiKpisQueryKey({
      workspaceId,
      accountId,
      userId,
      locationId,
      preset,
      from,
      to,
      timeZone
    }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Dashboard",
        queryKey,
        queryFn: async () => {
          if (!userId) {
            throw new Error("Missing session");
          }
          const { start, end } = getPresetRange(preset, from, to);

          let query = supabase
            .from("google_reviews")
            .select(
              "id, create_time, location_id, review_ai_insights(sentiment, sentiment_score), review_ai_tags(ai_tags(tag, category))"
            )
            .eq("user_id", userId);
          if (locationId && locationId !== "all") {
            query = query.eq("location_id", locationId);
          }
          if (start) {
            query = query.gte("create_time", start.toISOString());
          }
          if (end) {
            query = query.lte("create_time", end.toISOString());
          }

          const { data, error } = await query;
          if (error) {
            throw error;
          }

          const rows = (data ?? []) as DashboardAiInsightRow[];
          const sentimentCounts = {
            positive: 0,
            neutral: 0,
            negative: 0,
            mixed: 0,
            total: 0
          };
          let scoreSum = 0;
          let scoreCount = 0;
          const tagCounts = new Map<string, { tag: string; count: number }>();
          let priorityCount = 0;

          rows.forEach((row) => {
            const insight = getInsight(row);
            if (insight) {
              if (insight.sentiment) {
                sentimentCounts[insight.sentiment] += 1;
              } else {
                sentimentCounts.mixed += 1;
              }
              sentimentCounts.total += 1;
            }
            if (typeof insight?.score === "number") {
              scoreSum += insight.score;
              scoreCount += 1;
            }
            let hasNegativeTag = false;
            const tags = getTags(row);
            tags.forEach((tag) => {
              const normalizedTag = tag.tag.toLowerCase();
              const existing = tagCounts.get(normalizedTag);
              if (existing) {
                existing.count += 1;
              } else {
                tagCounts.set(normalizedTag, { tag: tag.tag, count: 1 });
              }
              if (tag.category === "negative") {
                hasNegativeTag = true;
              }
            });
            if (
              insight?.sentiment === "negative" ||
              (typeof insight?.score === "number" && insight.score < 0.4) ||
              hasNegativeTag
            ) {
              priorityCount += 1;
            }
          });

          const topTags = Array.from(tagCounts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(({ tag, count }) => ({ tag, count }));

          const totalSamples = sentimentCounts.total;
          const sentiment = {
            positivePct: totalSamples
              ? (sentimentCounts.positive / totalSamples) * 100
              : null,
            neutralPct: totalSamples
              ? (sentimentCounts.neutral / totalSamples) * 100
              : null,
            negativePct: totalSamples
              ? (sentimentCounts.negative / totalSamples) * 100
              : null,
            mixedPct: totalSamples
              ? (sentimentCounts.mixed / totalSamples) * 100
              : null,
            samples: totalSamples
          };

          const avgScore = scoreCount ? scoreSum / scoreCount : null;

          const trendStart = startOfDay(new Date());
          trendStart.setDate(trendStart.getDate() - 29);
          const trendEnd = endOfDay(new Date());
          let trendQuery = supabase
            .from("google_reviews")
            .select("id, create_time, location_id, review_ai_insights(sentiment_score)")
            .eq("user_id", userId)
            .gte("create_time", trendStart.toISOString())
            .lte("create_time", trendEnd.toISOString());
          if (locationId && locationId !== "all") {
            trendQuery = trendQuery.eq("location_id", locationId);
          }
          const { data: trendData, error: trendError } = await trendQuery;
          if (trendError) {
            throw trendError;
          }

          const buckets = new Map<
            string,
            { sum: number; analysedCount: number; criticalCount: number }
          >();
          for (let i = 0; i < 30; i += 1) {
            const day = new Date(trendStart);
            day.setDate(trendStart.getDate() + i);
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, { sum: 0, analysedCount: 0, criticalCount: 0 });
          }

          (trendData ?? []).forEach((row) => {
            const record = row as DashboardAiInsightRow;
            if (!record.create_time) {
              return;
            }
            const dateKey = new Date(record.create_time).toISOString().slice(0, 10);
            const bucket = buckets.get(dateKey);
            if (!bucket) {
              return;
            }
            const insight = getInsight(record);
            if (insight) {
              bucket.analysedCount += 1;
              if (typeof insight.score === "number") {
                bucket.sum += insight.score;
              }
            }
            const hasNegativeTag = getTags(record).some(
              (tag) => tag.category === "negative"
            );
            if (
              insight?.sentiment === "negative" ||
              (typeof insight?.score === "number" && insight.score < 0.4) ||
              hasNegativeTag
            ) {
              bucket.criticalCount += 1;
            }
          });

          const trend = Array.from(buckets.entries()).map(([date, bucket]) => ({
            date,
            avgScore: bucket.analysedCount ? bucket.sum / bucket.analysedCount : null,
            samples: bucket.analysedCount,
            criticalCount: bucket.criticalCount
          }));

          return {
            sentiment,
            avgScore,
            topTags,
            trend,
            priorityCount
          };
        },
        getRowCount: (data) => data.sentiment.samples
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

export const useDashboardActiveLocationSettings = ({
  workspaceId,
  accountId,
  userId
}: DashboardScope) =>
  useQuery<DashboardActiveLocationSettings>({
    queryKey: dashboardActiveLocationSettingsQueryKey({
      workspaceId,
      accountId,
      userId
    }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Dashboard",
        queryKey,
        queryFn: async () => {
          if (!userId) {
            return { active_location_ids: null };
          }
          const { data, error } = await supabase
            .from("business_settings")
            .select("active_location_ids")
            .eq("user_id", userId)
            .maybeSingle();
          if (error) {
            throw error;
          }
          const activeLocationIds = Array.isArray(data?.active_location_ids)
            ? data.active_location_ids.filter(Boolean)
            : null;
          return { active_location_ids: activeLocationIds };
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

export const useSaveDashboardActiveLocations = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SaveDashboardActiveLocationsResult,
    Error,
    SaveDashboardActiveLocationsInput
  >({
    mutationFn: async ({
      accountId,
      userId,
      businessName,
      selectedActiveIds,
      allLocationIds
    }) => {
      if (!userId || !accountId) {
        throw new Error("Missing session");
      }
      const nextActive =
        selectedActiveIds.length === 0 || selectedActiveIds.length === allLocationIds.length
          ? null
          : selectedActiveIds;
      const payload = {
        user_id: userId,
        business_id: accountId,
        business_name: businessName,
        active_location_ids: nextActive,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase
        .from("business_settings")
        .upsert(payload, { onConflict: "business_id" });
      if (error) {
        throw error;
      }
      return { activeLocationIds: nextActive };
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<DashboardActiveLocationSettings>(
        dashboardActiveLocationSettingsQueryKey({
          workspaceId: variables.workspaceId,
          accountId: variables.accountId,
          userId: variables.userId
        }),
        { active_location_ids: data.activeLocationIds }
      );
    }
  });
};
