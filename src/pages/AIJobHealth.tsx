import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type AIJobHealthProps = {
  session: Session | null;
};

type CronStateRow = {
  key: string;
  value: unknown;
  updated_at: string | null;
};

type LocationRow = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
};

type RunRow = {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  processed: number | null;
  tags_upserted: number | null;
  errors_count: number | null;
  aborted: boolean | null;
  skip_reason: string | null;
};

type StatusValue = {
  status?: "idle" | "running" | "done" | "error";
  last_run_at?: string;
  aborted?: boolean;
  stats?: { processed?: number; tagsUpserted?: number };
  errors_count?: number;
  last_error?: string | null;
  missing_insights_count?: number;
};

const statusStyles: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  running: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  idle: "bg-slate-100 text-slate-600"
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const AIJobHealth = ({ session }: AIJobHealthProps) => {
  const supabaseClient = supabase;
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CronStateRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseClient || !session) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const userId = session.user.id;
      const { data: locationRows, error: locationsError } = await supabaseClient
        .from("google_locations")
        .select("id, location_title, location_resource_name")
        .eq("user_id", userId)
        .order("location_title", { ascending: true });
      const { data: cronRows, error: cronError } = await supabaseClient
        .from("cron_state")
        .select("key, value, updated_at")
        .like("key", `ai_status_v1:${userId}:%`)
        .eq("user_id", userId);

      const { data: runRows } = await supabaseClient
        .from("ai_run_history")
        .select(
          "id, started_at, finished_at, processed, tags_upserted, errors_count, aborted, skip_reason"
        )
        .order("started_at", { ascending: false })
        .limit(5);

      if (cancelled) return;
      if (locationsError || cronError) {
        setError(
          locationsError?.message ?? cronError?.message ?? "Erreur de chargement"
        );
        setLoading(false);
        return;
      }
      setLocations((locationRows ?? []) as LocationRow[]);
      setRows((cronRows ?? []) as CronStateRow[]);
      setRuns((runRows ?? []) as RunRow[]);
      setLoading(false);
    };

    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, supabaseClient]);

  const locationById = useMemo(() => {
    const map = new Map<string, LocationRow>();
    locations.forEach((loc) => map.set(loc.id, loc));
    return map;
  }, [locations]);

  const items = useMemo(() => {
    const normalized = rows.map((row) => {
      const parts = row.key.split(":");
      const locationId = parts[2] ?? "";
      const value = row.value as StatusValue;
      return {
        locationId,
        location:
          locationById.get(locationId)?.location_title ??
          locationById.get(locationId)?.location_resource_name ??
          locationId,
        status: value?.status ?? "idle",
        lastRunAt: value?.last_run_at ?? row.updated_at ?? null,
        processed: value?.stats?.processed ?? 0,
        tags: value?.stats?.tagsUpserted ?? 0,
        missing: value?.missing_insights_count ?? 0,
        errors: value?.errors_count ?? 0,
        lastError: value?.last_error ?? null
      };
    });
    const statusRank = (status: string) => {
      if (status === "error") return 0;
      if (status === "running") return 1;
      if (status === "done") return 2;
      return 3;
    };
    return normalized.sort((a, b) => {
      const statusDiff = statusRank(a.status) - statusRank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return (b.missing ?? 0) - (a.missing ?? 0);
    });
  }, [rows, locationById]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          AI Job Health
        </h2>
        <p className="text-sm text-slate-500">
          Suivi interne des traitements IA par établissement.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-rose-600">
            {error}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <Card key={item.locationId}>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{item.location}</CardTitle>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status] ?? statusStyles.idle}`}
                  >
                    {item.status}
                  </span>
                </CardHeader>
                <CardContent className="text-sm text-slate-600 space-y-1">
                  <div>Dernier run : {formatTimestamp(item.lastRunAt)}</div>
                  <div>Avis traités : {item.processed}</div>
                  <div>Tags créés : {item.tags}</div>
                  <div>Manquants : {item.missing}</div>
                  <div>Erreurs : {item.errors}</div>
                  {item.lastError && (
                    <div className="text-rose-600">
                      Dernière erreur : {item.lastError}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last 5 AI Runs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <div className="grid grid-cols-6 gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase text-slate-500">
                <div>Time</div>
                <div>Processed</div>
                <div>Tags</div>
                <div>Errors</div>
                <div>Aborted</div>
                <div>Skip Reason</div>
              </div>
              <div className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <div key={run.id} className="grid grid-cols-6 gap-2 py-2">
                    <div>{formatTimestamp(run.started_at)}</div>
                    <div>{run.processed ?? 0}</div>
                    <div>{run.tags_upserted ?? 0}</div>
                    <div>{run.errors_count ?? 0}</div>
                    <div>{run.aborted ? "yes" : "no"}</div>
                    <div>{run.skip_reason ?? "—"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AIJobHealth;
