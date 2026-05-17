import { useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BusinessHealthScoreCard,
  buildBusinessHealthScoreModel
} from "../components/coach/BusinessHealthScore";
import { Card, CardContent } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import { useCoachResult } from "../services/coach";

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
  const coach = useCoachResult({ session, googleStatus, locations });
  const healthModel = useMemo(
    () => buildBusinessHealthScoreModel(coach.coachResult, coach.coachInput),
    [coach.coachInput, coach.coachResult]
  );

  return (
    <div className="space-y-6">
      <BusinessHealthScoreCard
        model={healthModel}
        variant="full"
        loading={coach.isLoading || locationsLoading}
      />

      {(coach.isError || locationsError) && (
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
