import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type SyncStatusProps = {
  session: Session | null;
};

type LocationRow = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
  last_synced_at: string | null;
};

const formatTimestamp = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const SyncStatus = ({ session }: SyncStatusProps) => {
  const supabaseClient = supabase;
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [jobStats, setJobStats] = useState({
    queued: 0,
    running: 0,
    failed: 0,
    lastError: null as string | null
  });

  useEffect(() => {
    if (!supabaseClient || !session) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: settings } = await supabaseClient
        .from("business_settings")
        .select("active_location_ids")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const activeIds = Array.isArray(settings?.active_location_ids)
        ? settings.active_location_ids.filter(Boolean)
        : null;

      const { data: connection } = await supabaseClient
        .from("google_connections")
        .select("last_synced_at")
        .eq("user_id", session.user.id)
        .eq("provider", "google")
        .maybeSingle();

      const { data: locationRows } = await supabaseClient
        .from("google_locations")
        .select("id, location_title, location_resource_name, last_synced_at")
        .eq("user_id", session.user.id)
        .order("location_title", { ascending: true });

      const filteredLocations =
        activeIds && activeIds.length > 0
          ? (locationRows ?? []).filter((loc) => activeIds.includes(loc.id))
          : (locationRows ?? []);

      const { data: jobs } = await supabaseClient
        .from("job_queue")
        .select("status, last_error, updated_at")
        .eq("user_id", session.user.id);

      if (cancelled) {
        return;
      }

      setLastSyncAt(connection?.last_synced_at ?? null);
      setLocations(filteredLocations);

      const stats = { queued: 0, running: 0, failed: 0, lastError: null as string | null };
      let latestFailed: { updated_at: string | null; last_error: string | null } | null =
        null;
      (jobs ?? []).forEach((job) => {
        if (job.status === "queued") stats.queued += 1;
        if (job.status === "running") stats.running += 1;
        if (job.status === "failed") {
          stats.failed += 1;
          if (
            !latestFailed ||
            (job.updated_at && job.updated_at > (latestFailed.updated_at ?? ""))
          ) {
            latestFailed = {
              updated_at: job.updated_at ?? null,
              last_error: job.last_error ?? null
            };
          }
        }
      });
      stats.lastError = latestFailed?.last_error ?? null;
      setJobStats(stats);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, supabaseClient]);

  const locationsWithSync = useMemo(
    () =>
      locations.map((loc) => ({
        id: loc.id,
        label: loc.location_title ?? loc.location_resource_name,
        lastSync: formatTimestamp(loc.last_synced_at)
      })),
    [locations]
  );

  if (!supabaseClient) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-slate-500">
          Configuration Supabase manquante.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Statut synchronisation
        </h2>
        <p className="text-sm text-slate-500">
          Vue rapide sur les synchronisations et la file de jobs.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Dernier sync global</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {formatTimestamp(lastSyncAt)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <div>En file: {jobStats.queued}</div>
              <div>En cours: {jobStats.running}</div>
              <div>En erreur: {jobStats.failed}</div>
              <div>Derniere erreur: {jobStats.lastError ?? "—"}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dernier sync par lieu (actifs)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {locationsWithSync.length === 0 ? (
                <div>—</div>
              ) : (
                locationsWithSync.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between">
                    <span>{loc.label}</span>
                    <span className="text-xs text-slate-500">{loc.lastSync}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export { SyncStatus };
