import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { BusinessHealthScoreCard } from "../components/coach/BusinessHealthScore";
import { buildBusinessHealthScoreModel } from "../components/coach/businessHealthScoreModel";
import { Card, CardContent } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import { type CoachKpiSummaryCache, useCoachResult } from "../services/coach";

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

const Coach = ({
  session,
  googleStatus,
  locations,
  locationsLoading,
  locationsError
}: CoachProps) => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const kpiQuery = useQuery<CoachKpiSummaryCache>({
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
      return payload as CoachKpiSummaryCache;
    },
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev
  });
  const coach = useCoachResult({
    session,
    googleStatus,
    locations,
    kpiSummary: kpiQuery.data
  });
  const healthModel = useMemo(
    () => buildBusinessHealthScoreModel(coach.coachResult, coach.coachInput),
    [coach.coachInput, coach.coachResult]
  );

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
