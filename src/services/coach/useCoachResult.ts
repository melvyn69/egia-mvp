import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { GoogleConnectionStatus } from "../../hooks/useGoogleConnectionStatus";
import {
  getNotifications,
  type AppNotificationBase
} from "../../lib/notifications";
import {
  buildCoachResultFromFrontendData,
  getCoachNotificationActionCount,
  getCompletedCoachMilestones,
  getNextCoachMilestone,
  readCoachFrontendCacheData,
  type CoachAiKpiCache,
  type CoachFrontendLocation,
  type CoachKpiSummaryCache
} from "./frontend";

type UseCoachResultParams = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  locations: CoachFrontendLocation[];
  notifications?: AppNotificationBase[];
  kpiSummary?: CoachKpiSummaryCache | null;
  aiStats?: CoachAiKpiCache | null;
  activeLocationsCount?: number;
  alertsOpenCount?: number | null;
  reportsCount?: number | null;
  teamMembersCount?: number | null;
  competitorWatchActive?: boolean | null;
};

export const useCoachResult = ({
  session,
  googleStatus,
  locations,
  notifications,
  kpiSummary: providedKpiSummary,
  aiStats: providedAiStats,
  activeLocationsCount,
  alertsOpenCount,
  reportsCount,
  teamMembersCount,
  competitorWatchActive
}: UseCoachResultParams) => {
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(() => {
      setCacheVersion((version) => version + 1);
    });
  }, [queryClient]);

  const cacheData = useMemo(
    () => readCoachFrontendCacheData(queryClient, userId, locations.length),
    [cacheVersion, locations.length, queryClient, userId]
  );
  const notificationsForScore = notifications ?? getNotifications();
  const notificationActionCount =
    getCoachNotificationActionCount(notificationsForScore);
  const kpiSummary =
    providedKpiSummary !== undefined ? providedKpiSummary : cacheData.kpiSummary;
  const aiStats =
    providedAiStats !== undefined ? providedAiStats : cacheData.aiStats;
  const resolvedActiveLocationsCount =
    activeLocationsCount !== undefined
      ? activeLocationsCount
      : cacheData.activeLocationsCount;
  const resolvedAlertsOpenCount =
    alertsOpenCount !== undefined ? alertsOpenCount : cacheData.alertsOpenCount;
  const resolvedReportsCount =
    reportsCount !== undefined ? reportsCount : cacheData.reportsCount;
  const resolvedTeamMembersCount =
    teamMembersCount !== undefined
      ? teamMembersCount
      : cacheData.teamMembersCount;
  const resolvedCompetitorWatchActive =
    competitorWatchActive !== undefined
      ? competitorWatchActive
      : cacheData.competitorWatchActive;
  const computed = useMemo(
    () =>
      buildCoachResultFromFrontendData({
        googleConnected: googleStatus === "connected",
        locationsCount: locations.length,
        activeLocationsCount: resolvedActiveLocationsCount,
        kpiSummary,
        aiStats,
        alertsOpenCount: resolvedAlertsOpenCount ?? notificationActionCount,
        reportsCount: resolvedReportsCount,
        teamMembersCount: resolvedTeamMembersCount,
        competitorWatchActive: resolvedCompetitorWatchActive,
        notificationActionCount,
        accountCreatedAt: session?.user.created_at ?? null
      }),
    [
      aiStats,
      googleStatus,
      kpiSummary,
      locations.length,
      notificationActionCount,
      resolvedActiveLocationsCount,
      resolvedAlertsOpenCount,
      resolvedCompetitorWatchActive,
      resolvedReportsCount,
      resolvedTeamMembersCount,
      session?.user.created_at
    ]
  );
  const completedMilestones = useMemo(
    () => getCompletedCoachMilestones(computed.result),
    [computed.result]
  );
  const nextMilestone = useMemo(
    () => getNextCoachMilestone(computed.result),
    [computed.result]
  );

  return {
    coachResult: computed.result,
    coachInput: computed.input,
    coachMetrics: computed.metrics,
    completedMilestones,
    nextMilestone,
    kpiSummary,
    aiStats,
    cacheData,
    isLoading: false,
    isError: false
  };
};
