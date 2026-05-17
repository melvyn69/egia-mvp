import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  type CoachFrontendLocation,
  type CoachKpiSummaryCache
} from "./frontend";

type UseCoachResultParams = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  locations: CoachFrontendLocation[];
  notifications?: AppNotificationBase[];
};

export const useCoachResult = ({
  session,
  googleStatus,
  locations,
  notifications
}: UseCoachResultParams) => {
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(() => {
      setCacheVersion((version) => version + 1);
    });
  }, [queryClient]);

  const coachKpiQuery = useQuery<CoachKpiSummaryCache>({
    queryKey: ["coach-health-kpi", userId, timeZone],
    queryFn: async () => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("Missing session");
      }
      const params = new URLSearchParams();
      params.set("preset", "all_time");
      params.set("tz", timeZone);
      const response = await fetch(`/api/kpi/summary?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error("Failed to load KPIs");
      }
      return payload as CoachKpiSummaryCache;
    },
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev
  });

  const cacheData = useMemo(
    () => readCoachFrontendCacheData(queryClient, userId, locations.length),
    [cacheVersion, locations.length, queryClient, userId]
  );
  const notificationsForScore = notifications ?? getNotifications();
  const notificationActionCount =
    getCoachNotificationActionCount(notificationsForScore);
  const kpiSummary = coachKpiQuery.data ?? cacheData.kpiSummary;
  const computed = useMemo(
    () =>
      buildCoachResultFromFrontendData({
        googleConnected: googleStatus === "connected",
        locationsCount: locations.length,
        activeLocationsCount: cacheData.activeLocationsCount,
        kpiSummary,
        aiStats: cacheData.aiStats,
        alertsOpenCount: cacheData.alertsOpenCount ?? notificationActionCount,
        reportsCount: cacheData.reportsCount,
        teamMembersCount: cacheData.teamMembersCount,
        competitorWatchActive: cacheData.competitorWatchActive,
        notificationActionCount,
        accountCreatedAt: session?.user.created_at ?? null
      }),
    [
      cacheData.activeLocationsCount,
      cacheData.aiStats,
      cacheData.alertsOpenCount,
      cacheData.competitorWatchActive,
      cacheData.reportsCount,
      cacheData.teamMembersCount,
      googleStatus,
      kpiSummary,
      locations.length,
      notificationActionCount,
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
    aiStats: cacheData.aiStats,
    cacheData,
    isLoading: coachKpiQuery.isLoading,
    isError: coachKpiQuery.isError
  };
};
