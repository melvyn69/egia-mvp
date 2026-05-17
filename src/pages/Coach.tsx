import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  BusinessHealthScoreCard,
  buildBusinessHealthScore,
  getStoredCompetitorContextStatus
} from "../components/coach/BusinessHealthScore";
import { Card, CardContent } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import { getNotifications } from "../lib/notifications";

type CoachProps = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

type CoachKpiSummary = {
  counts: {
    reviews_total: number;
    reviews_replyable: number;
  };
  ratings: {
    avg_rating: number | null;
  };
  response: {
    response_rate_pct: number | null;
  };
  sentiment: {
    sentiment_samples: number;
  };
  meta: {
    data_status: "ok" | "no_data" | "collecting";
    reasons: string[];
  };
};

const Coach = ({
  session,
  googleStatus,
  locations,
  locationsLoading,
  locationsError
}: CoachProps) => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const kpiQuery = useQuery<CoachKpiSummary>({
    queryKey: ["coach-health-kpi", session?.user?.id ?? null, timeZone],
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
      return payload as CoachKpiSummary;
    },
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev
  });

  const notifications = getNotifications();
  const urgentActionsCount = notifications.filter(
    (notification) => notification.requiresAction === true
  ).length;
  const kpiData = kpiQuery.data ?? null;
  const responseRate = kpiData?.response.response_rate_pct ?? null;
  const responseRateValid =
    responseRate !== null && responseRate >= 0 && responseRate <= 100;
  const healthModel = buildBusinessHealthScore({
    googleConnected: googleStatus === "connected",
    locationsCount: locations.length,
    reviewsTotal: kpiData?.counts.reviews_total ?? 0,
    responseRate: responseRateValid ? responseRate : null,
    avgRating: kpiData?.ratings.avg_rating ?? null,
    aiSamples: kpiData?.sentiment.sentiment_samples ?? 0,
    priorityCount: urgentActionsCount,
    activeLocationsCount: locations.length,
    alertSignalsReady: notifications.length > 0,
    competitorContextReady: getStoredCompetitorContextStatus()
  });

  return (
    <div className="space-y-6">
      <BusinessHealthScoreCard
        model={healthModel}
        variant="full"
        loading={kpiQuery.isLoading || locationsLoading}
      />

      {(kpiQuery.isError || locationsError) && (
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm text-amber-700">
            <p className="font-semibold">Données partielles</p>
            <p>
              Le coach reste disponible, mais certains indicateurs n'ont pas pu
              être chargés pour le moment.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export { Coach };
