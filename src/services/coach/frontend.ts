import type { QueryClient } from "@tanstack/react-query";
import { buildCoachResult } from "./scoring";
import type {
  CoachDominantTag,
  CoachInput,
  CoachMilestone,
  CoachResult
} from "./types";

export type CoachFrontendLocation = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
  address_json: unknown | null;
  phone: string | null;
  website_uri: string | null;
};

export type CoachKpiSummaryCache = {
  counts?: {
    reviews_total?: number | null;
    reviews_with_text?: number | null;
    reviews_replied?: number | null;
    reviews_replyable?: number | null;
  };
  ratings?: {
    avg_rating?: number | null;
  };
  response?: {
    response_rate_pct?: number | null;
  };
  sentiment?: {
    sentiment_samples?: number | null;
  };
  top_tags?: Array<{ tag?: string | null; count?: number | null }>;
};

export type CoachAiKpiCache = {
  sentiment?: {
    samples?: number | null;
  };
  topTags?: Array<{ tag?: string | null; count?: number | null }>;
  priorityCount?: number | null;
};

type AlertsCache = Array<{
  resolved_at?: string | null;
}>;

type BusinessSettingsCache = {
  active_location_ids?: unknown;
};

type CompetitorCache = Array<unknown>;

export type CoachFrontendCacheData = {
  kpiSummary: CoachKpiSummaryCache | null;
  aiStats: CoachAiKpiCache | null;
  activeLocationsCount: number;
  alertsOpenCount: number | null;
  reportsCount: number | null;
  teamMembersCount: number | null;
  competitorWatchActive: boolean | null;
};

export type CoachFrontendMetrics = {
  aiSamples: number | null;
  unansweredReviewsCount: number | null;
  notificationActionCount: number;
  dominantTags: CoachDominantTag[] | null;
};

export const getLastCachedCoachData = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): T | null => {
  const entries = queryClient.getQueriesData<T>({ queryKey });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const data = entries[index]?.[1];
    if (data !== undefined && data !== null) {
      return data;
    }
  }
  return null;
};

const getCachedArrayCount = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): number | null => {
  const data = getLastCachedCoachData<T[]>(queryClient, queryKey);
  return Array.isArray(data) ? data.length : null;
};

const getActiveLocationsCount = (
  businessSettings: BusinessSettingsCache | null,
  fallbackCount: number
): number => {
  const activeLocationIds = businessSettings?.active_location_ids;
  if (!Array.isArray(activeLocationIds)) {
    return fallbackCount;
  }

  const count = activeLocationIds.filter(Boolean).length;
  return count > 0 ? count : fallbackCount;
};

const getCachedAlertsOpenCount = (
  queryClient: QueryClient,
  userId: string | null
): number | null => {
  if (!userId) {
    return null;
  }

  const alerts = getLastCachedCoachData<AlertsCache>(queryClient, [
    "alerts",
    userId
  ]);
  if (!Array.isArray(alerts)) {
    return null;
  }

  return alerts.filter((alert) => !alert.resolved_at).length;
};

const getCompetitorWatchActive = (
  queryClient: QueryClient,
  userId: string | null
): boolean | null => {
  if (!userId) {
    return null;
  }

  const followed = queryClient.getQueriesData<CompetitorCache>({
    queryKey: ["competitors-followed", userId]
  });
  if (followed.some(([, data]) => Array.isArray(data) && data.length > 0)) {
    return true;
  }

  const radar = queryClient.getQueriesData<CompetitorCache>({
    queryKey: ["competitors-radar", userId]
  });
  if (radar.some(([, data]) => Array.isArray(data) && data.length > 0)) {
    return true;
  }

  return followed.length > 0 || radar.length > 0 ? false : null;
};

export const readCoachFrontendCacheData = (
  queryClient: QueryClient,
  userId: string | null,
  locationsCount: number
): CoachFrontendCacheData => {
  if (!userId) {
    return {
      kpiSummary: null,
      aiStats: null,
      activeLocationsCount: locationsCount,
      alertsOpenCount: null,
      reportsCount: null,
      teamMembersCount: null,
      competitorWatchActive: null
    };
  }

  const coachKpiSummary = getLastCachedCoachData<CoachKpiSummaryCache>(
    queryClient,
    ["coach-health-kpi", userId]
  );
  const dashboardAllTimeKpiSummary =
    getLastCachedCoachData<CoachKpiSummaryCache>(queryClient, [
      "kpi-summary",
      userId,
      "all",
      "all_time"
    ]);
  const dashboardKpiSummary = getLastCachedCoachData<CoachKpiSummaryCache>(
    queryClient,
    ["kpi-summary", userId]
  );
  const allTimeAiStats = getLastCachedCoachData<CoachAiKpiCache>(queryClient, [
    "ai-kpis",
    userId,
    "all",
    "all_time"
  ]);
  const businessSettings = getLastCachedCoachData<BusinessSettingsCache>(
    queryClient,
    ["business-settings", userId]
  );

  return {
    kpiSummary:
      coachKpiSummary ?? dashboardAllTimeKpiSummary ?? dashboardKpiSummary,
    aiStats:
      allTimeAiStats ??
      getLastCachedCoachData<CoachAiKpiCache>(queryClient, [
        "ai-kpis",
        userId
      ]),
    activeLocationsCount: getActiveLocationsCount(
      businessSettings,
      locationsCount
    ),
    alertsOpenCount: getCachedAlertsOpenCount(queryClient, userId),
    reportsCount:
      getCachedArrayCount<unknown>(queryClient, [
        "generated-reports",
        userId
      ]) ?? getCachedArrayCount<unknown>(queryClient, ["reports", userId]),
    teamMembersCount: getCachedArrayCount<unknown>(queryClient, [
      "team-members",
      userId
    ]),
    competitorWatchActive: getCompetitorWatchActive(queryClient, userId)
  };
};

export const getDominantCoachTags = (
  kpiSummary: CoachKpiSummaryCache | null,
  aiStats: CoachAiKpiCache | null
): CoachDominantTag[] | null =>
  (aiStats?.topTags?.length ? aiStats.topTags : kpiSummary?.top_tags)?.filter(
    (tag): tag is { tag: string; count?: number | null } =>
      typeof tag.tag === "string" && tag.tag.trim().length > 0
  ) ?? null;

export const getCoachNotificationActionCount = (
  notifications: Array<{ requiresAction?: boolean }>
): number =>
  notifications.filter((notification) => notification.requiresAction === true)
    .length;

export const buildCoachInputFromFrontendData = ({
  googleConnected,
  locationsCount,
  activeLocationsCount,
  kpiSummary,
  aiStats,
  alertsOpenCount,
  reportsCount,
  teamMembersCount,
  competitorWatchActive,
  notificationActionCount,
  accountCreatedAt
}: {
  googleConnected: boolean;
  locationsCount: number;
  activeLocationsCount: number;
  kpiSummary: CoachKpiSummaryCache | null;
  aiStats: CoachAiKpiCache | null;
  alertsOpenCount: number | null;
  reportsCount: number | null;
  teamMembersCount: number | null;
  competitorWatchActive: boolean | null;
  notificationActionCount: number;
  accountCreatedAt?: string | Date | null;
}): { input: CoachInput; metrics: CoachFrontendMetrics } => {
  const reviewsReplyable = kpiSummary?.counts?.reviews_replyable ?? null;
  const reviewsReplied = kpiSummary?.counts?.reviews_replied ?? null;
  const unansweredReviewsCount =
    typeof reviewsReplyable === "number" && typeof reviewsReplied === "number"
      ? Math.max(0, reviewsReplyable - reviewsReplied)
      : null;
  const aiSamples =
    aiStats?.sentiment?.samples ??
    kpiSummary?.sentiment?.sentiment_samples ??
    null;
  const dominantTags = getDominantCoachTags(kpiSummary, aiStats);
  const aiInsightsReady =
    typeof aiSamples === "number" && Number.isFinite(aiSamples)
      ? aiSamples > 0 || Boolean(dominantTags?.length)
      : undefined;

  return {
    input: {
      googleConnected,
      activeLocationsCount,
      totalLocationsCount: locationsCount,
      totalReviews: kpiSummary?.counts?.reviews_total,
      reviewsWithText: kpiSummary?.counts?.reviews_with_text,
      averageRating: kpiSummary?.ratings?.avg_rating,
      responseRate: kpiSummary?.response?.response_rate_pct,
      criticalReviewsCount: aiStats?.priorityCount ?? notificationActionCount,
      unansweredReviewsCount,
      aiInsightsReady,
      dominantTags,
      alertsOpenCount,
      automationCount: undefined,
      teamMembersCount,
      competitorWatchActive,
      reportsCount,
      accountCreatedAt
    },
    metrics: {
      aiSamples,
      unansweredReviewsCount,
      notificationActionCount,
      dominantTags
    }
  };
};

export const buildCoachResultFromFrontendData = (
  params: Parameters<typeof buildCoachInputFromFrontendData>[0]
): { result: CoachResult; input: CoachInput; metrics: CoachFrontendMetrics } => {
  const { input, metrics } = buildCoachInputFromFrontendData(params);
  return {
    result: buildCoachResult(input),
    input,
    metrics
  };
};

export const getCompletedCoachMilestones = (
  result: CoachResult
): CoachMilestone[] => result.milestones.filter((milestone) => milestone.achieved);

export const getNextCoachMilestone = (result: CoachResult): CoachMilestone =>
  result.milestones.find((milestone) => !milestone.achieved) ??
  result.milestones[result.milestones.length - 1];
