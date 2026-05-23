import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { GoogleConnectionStatus } from "../../hooks/useGoogleConnectionStatus";
import type { AppNotificationBase } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
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
  automationCount?: number | null;
  reportsCount?: number | null;
  teamMembersCount?: number | null;
  competitorWatchActive?: boolean | null;
};

type CoachAlertSignal = {
  resolved_at?: string | null;
};

type CoachReportSignal = {
  last_generated_at?: string | null;
  storage_path?: string | null;
  status?: string | null;
};

const COACH_SIGNAL_STALE_TIME_MS = 30_000;

const countOpenAlerts = (alerts: CoachAlertSignal[]): number =>
  alerts.filter((alert) => !alert.resolved_at).length;

const hasGeneratedReportSignal = (report: CoachReportSignal): boolean =>
  Boolean(report.last_generated_at || report.storage_path) ||
  report.status === "generated" ||
  report.status === "sent";

export const useCoachResult = ({
  session,
  googleStatus,
  locations,
  notifications,
  kpiSummary: providedKpiSummary,
  aiStats: providedAiStats,
  activeLocationsCount,
  alertsOpenCount,
  automationCount,
  reportsCount,
  teamMembersCount,
  competitorWatchActive
}: UseCoachResultParams) => {
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const accessToken = session?.access_token ?? null;
  const [cacheVersion, setCacheVersion] = useState(0);

  const alertsQuery = useQuery({
    queryKey: ["alerts", userId],
    queryFn: async () => {
      if (!accessToken) {
        return [] as CoachAlertSignal[];
      }
      const response = await fetch("/api/reviews?action=alerts_list", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load alerts");
      }
      const payload = (await response.json()) as {
        alerts?: CoachAlertSignal[];
      };
      return payload.alerts ?? [];
    },
    enabled: Boolean(accessToken && userId),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  const automationCountQuery = useQuery({
    queryKey: ["coach-automation-count", userId],
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      const { count, error } = await supabase
        .from("automation_workflows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("enabled", true);
      if (error) {
        throw error;
      }
      return count ?? 0;
    },
    enabled: Boolean(userId),
    staleTime: COACH_SIGNAL_STALE_TIME_MS
  });

  const reportsCountQuery = useQuery({
    queryKey: ["coach-reports-count", userId],
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      const [reportsResult, generatedReportsResult] = await Promise.all([
        supabase
          .from("reports")
          .select("id,last_generated_at,storage_path,status")
          .eq("user_id", userId),
        supabase
          .from("generated_reports")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
      ]);
      if (reportsResult.error) {
        throw reportsResult.error;
      }
      if (generatedReportsResult.error) {
        throw generatedReportsResult.error;
      }
      const generatedClassicReports = (
        (reportsResult.data ?? []) as CoachReportSignal[]
      ).filter(hasGeneratedReportSignal).length;

      return generatedClassicReports + (generatedReportsResult.count ?? 0);
    },
    enabled: Boolean(userId),
    staleTime: COACH_SIGNAL_STALE_TIME_MS
  });

  const teamMembersCountQuery = useQuery({
    queryKey: ["coach-team-members-count", userId],
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      const { count, error } = await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) {
        throw error;
      }
      return count ?? 0;
    },
    enabled: Boolean(userId),
    staleTime: COACH_SIGNAL_STALE_TIME_MS
  });

  const competitorWatchQuery = useQuery({
    queryKey: ["coach-competitor-watch", userId],
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      const [settingsResult, competitorsResponse] = await Promise.all([
        supabase
          .from("business_settings")
          .select("competitive_monitoring_enabled")
          .eq("user_id", userId)
          .maybeSingle(),
        accessToken
          ? fetch("/api/reports/competitors?action=list", {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            })
          : Promise.resolve(null)
      ]);
      if (settingsResult.error) {
        throw settingsResult.error;
      }

      const settings = settingsResult.data as
        | { competitive_monitoring_enabled?: boolean | null }
        | null;
      if (settings?.competitive_monitoring_enabled === true) {
        return true;
      }

      if (!competitorsResponse) {
        return false;
      }
      if (!competitorsResponse.ok) {
        const text = await competitorsResponse.text();
        throw new Error(text || "Failed to load competitors");
      }
      const payload = (await competitorsResponse.json().catch(() => null)) as {
        items?: unknown[];
      } | null;
      return Array.isArray(payload?.items) && payload.items.length > 0;
    },
    enabled: Boolean(userId),
    staleTime: COACH_SIGNAL_STALE_TIME_MS
  });

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(() => {
      setCacheVersion((version) => version + 1);
    });
  }, [queryClient]);

  const cacheData = useMemo(
    () => readCoachFrontendCacheData(queryClient, userId, locations.length),
    [cacheVersion, locations.length, queryClient, userId]
  );
  const notificationsForMetrics = notifications ?? [];
  const notificationActionCount =
    getCoachNotificationActionCount(notificationsForMetrics);
  const kpiSummary =
    providedKpiSummary !== undefined ? providedKpiSummary : cacheData.kpiSummary;
  const aiStats =
    providedAiStats !== undefined ? providedAiStats : cacheData.aiStats;
  const resolvedActiveLocationsCount =
    activeLocationsCount !== undefined
      ? activeLocationsCount
      : cacheData.activeLocationsCount;
  const resolvedAlertsOpenCount =
    alertsOpenCount !== undefined
      ? alertsOpenCount
      : alertsQuery.data
        ? countOpenAlerts(alertsQuery.data)
        : cacheData.alertsOpenCount;
  const resolvedAutomationCount =
    automationCount !== undefined
      ? automationCount
      : automationCountQuery.data ?? cacheData.automationCount;
  const resolvedReportsCount =
    reportsCount !== undefined
      ? reportsCount
      : reportsCountQuery.data ?? cacheData.reportsCount;
  const resolvedTeamMembersCount =
    teamMembersCount !== undefined
      ? teamMembersCount
      : teamMembersCountQuery.data ?? cacheData.teamMembersCount;
  const resolvedCompetitorWatchActive =
    competitorWatchActive !== undefined
      ? competitorWatchActive
      : competitorWatchQuery.data ?? cacheData.competitorWatchActive;
  const computed = useMemo(
    () =>
      buildCoachResultFromFrontendData({
        googleConnected: googleStatus === "connected",
        locationsCount: locations.length,
        activeLocationsCount: resolvedActiveLocationsCount,
        kpiSummary,
        aiStats,
        alertsOpenCount: resolvedAlertsOpenCount,
        automationCount: resolvedAutomationCount,
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
      resolvedAutomationCount,
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
    isLoading:
      alertsQuery.isLoading ||
      automationCountQuery.isLoading ||
      reportsCountQuery.isLoading ||
      teamMembersCountQuery.isLoading ||
      competitorWatchQuery.isLoading,
    isError:
      alertsQuery.isError ||
      automationCountQuery.isError ||
      reportsCountQuery.isError ||
      teamMembersCountQuery.isError ||
      competitorWatchQuery.isError
  };
};
