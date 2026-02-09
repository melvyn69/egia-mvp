import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { JobCard } from "./AIJobHealth/components/JobCard";
import { JobDetailDrawer } from "./AIJobHealth/components/JobDetailDrawer";
import { formatTimestamp } from "./AIJobHealth/utils";
import type { CronStateRow, LocationRow, RunRow, StatusValue } from "./AIJobHealth/types";

type AIJobHealthProps = {
  session: Session | null;
};

const statusStyles: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  running: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  idle: "bg-slate-100 text-slate-600"
};

const AIJobHealth = ({ session }: AIJobHealthProps) => {
  const supabaseClient = supabase;
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CronStateRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    ok?: boolean;
    processed?: number;
    tagsUpserted?: number;
    errors?: number;
    skipReason?: string | null;
  } | null>(null);
  const [runLocationLoading, setRunLocationLoading] = useState<string | null>(
    null
  );
  const [runLocationMessage, setRunLocationMessage] = useState<
    Record<string, string>
  >({});
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const [runsFilter, setRunsFilter] = useState<"all" | "location" | "errors">(
    "all"
  );
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    if (!supabaseClient || !session) return;
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

    const runQuery = (supabaseClient as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean }
          ) => {
            limit: (
              count: number
            ) => Promise<{ data?: unknown[] | null; error?: { message?: string } | null }>;
          };
        };
      };
    }).from("ai_run_history");
    const { data: runRows } = await runQuery
      .select(
        "id, started_at, finished_at, duration_ms, processed, tags_upserted, errors_count, aborted, skip_reason, meta"
      )
      .order("started_at", { ascending: false })
      .limit(50);

    if (locationsError || cronError) {
      setError(
        locationsError?.message ?? cronError?.message ?? "Erreur de chargement"
      );
      setLoading(false);
      return;
    }
    setLocations((locationRows ?? []) as LocationRow[]);
    setRows((cronRows ?? []) as CronStateRow[]);
    setRuns((runRows ?? []) as unknown as RunRow[]);
    setLoading(false);
  }, [session, supabaseClient]);

  useEffect(() => {
    let cancelled = false;
    const runLoad = async () => {
      if (cancelled) return;
      await load();
    };
    void runLoad();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, refreshTick]);

  const triggerRun = async () => {
    if (!session || runLoading) return;
    setRunLoading(true);
    setRunMessage(null);
    setRunResult(null);
    const token = session.access_token;
    try {
      const res = await fetch("/api/cron/ai/tag-reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json().catch(() => null);
      const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : "";
      if (res.status === 401) {
        setRunMessage(`Non connecté${requestId}`);
        return;
      }
      if (res.status === 403) {
        setRunMessage(`Accès admin requis${requestId}`);
        return;
      }
      if (!res.ok) {
        setRunMessage(`Erreur: ${res.status}${requestId}`);
        return;
      }
      setRunResult({
        ok: payload?.ok ?? true,
        processed: payload?.stats?.reviewsProcessed ?? payload?.processed ?? 0,
        tagsUpserted: payload?.stats?.tagsUpserted ?? payload?.tagsUpserted ?? 0,
        errors: payload?.stats?.errors?.length ?? payload?.errors ?? 0,
        skipReason: payload?.skipReason ?? null
      });
      setRunMessage("Analyse lancée");
      await load();
      window.setTimeout(() => {
        setRefreshTick((value) => value + 1);
      }, 5000);
    } catch {
      setRunMessage("Erreur réseau.");
    } finally {
      setRunLoading(false);
    }
  };

  const triggerRunForLocation = async (locationId: string) => {
    if (!session || runLocationLoading) return;
    setRunLocationLoading(locationId);
    setRunLocationMessage((prev) => ({ ...prev, [locationId]: "" }));
    const token = session.access_token;
    try {
      const res = await fetch(
        `/api/cron/ai/tag-reviews?location_id=${encodeURIComponent(locationId)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await res.json().catch(() => null);
      const requestId = payload?.requestId ? ` (requestId: ${payload.requestId})` : "";
      if (res.status === 401) {
        setRunLocationMessage((prev) => ({
          ...prev,
          [locationId]: `Non connecté${requestId}`
        }));
        return;
      }
      if (res.status === 403) {
        setRunLocationMessage((prev) => ({
          ...prev,
          [locationId]: `Accès admin requis${requestId}`
        }));
        return;
      }
      if (!res.ok) {
        setRunLocationMessage((prev) => ({
          ...prev,
          [locationId]: `Erreur: ${res.status}${requestId}`
        }));
        return;
      }
      const processed = payload?.stats?.reviewsProcessed ?? payload?.processed ?? 0;
      const tags = payload?.stats?.tagsUpserted ?? payload?.tagsUpserted ?? 0;
      const errorsCount = payload?.stats?.errors?.length ?? payload?.errors ?? 0;
      const skip = payload?.skipReason ?? null;
      const msg = `OK • ${processed} traités • ${tags} tags • ${errorsCount} erreurs${skip ? ` • ${skip}` : ""
        }`;
      setRunLocationMessage((prev) => ({ ...prev, [locationId]: msg }));
      await load();
      window.setTimeout(() => {
        setRefreshTick((value) => value + 1);
      }, 5000);
    } catch {
      setRunLocationMessage((prev) => ({
        ...prev,
        [locationId]: "Erreur réseau."
      }));
    } finally {
      setRunLocationLoading(null);
    }
  };

  const locationById = useMemo(() => {
    const map = new Map<string, LocationRow>();
    locations.forEach((loc) => {
      map.set(loc.id, loc);
      if (loc.location_resource_name) {
        map.set(loc.location_resource_name, loc);
      }
    });
    return map;
  }, [locations]);

  const getLocationLabel = (id?: string | null) => {
    if (!id) return "—";
    const loc = locationById.get(id);
    return loc ? (loc.location_title ?? loc.location_resource_name) : id;
  };

  const items = useMemo(() => {
    const normalized = rows.map((row) => {
      const parts = row.key.split(":");
      const locationId = parts[2] ?? "";
      const value = row.value as StatusValue;
      return {
        locationId,
        location: getLocationLabel(locationId),
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
    const sorted = normalized.sort((a, b) => {
      const statusDiff = statusRank(a.status) - statusRank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return (b.missing ?? 0) - (a.missing ?? 0);
    });
    const now = Date.now();
    return sorted.filter((item) => {
      if (showErrorsOnly && item.status !== "error" && item.errors === 0) {
        return false;
      }
      if (showRecentOnly) {
        const ts = item.lastRunAt ? new Date(item.lastRunAt).getTime() : 0;
        if (!ts || now - ts > 24 * 60 * 60 * 1000) {
          return false;
        }
      }
      return true;
    });
  }, [rows, locationById, showErrorsOnly, showRecentOnly]);

  const filteredRuns = useMemo(() => {
    const now = Date.now();
    return runs
      .filter((run) => {
        if (runsFilter === "errors" && (run.errors_count ?? 0) === 0) {
          return false;
        }
        if (runsFilter === "location" && !run.meta?.location_id) {
          return false;
        }
        if (showErrorsOnly && (run.errors_count ?? 0) === 0) {
          return false;
        }
        if (showRecentOnly) {
          const ts = run.started_at ? new Date(run.started_at).getTime() : 0;
          if (!ts || now - ts > 24 * 60 * 60 * 1000) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 20);
  }, [runs, runsFilter, showErrorsOnly, showRecentOnly]);

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              AI Job Health
            </h2>
            <p className="text-sm text-slate-500">
              Suivi interne des traitements IA par établissement.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setRefreshTick((value) => value + 1)}
              variant="outline"
              size="sm"
            >
              Rafraîchir
            </Button>
            <Button onClick={triggerRun} disabled={runLoading} size="sm">
              {runLoading ? "Lancement..." : "Run Global Analysis"}
            </Button>
          </div>
        </div>

        {runMessage && (
          <p className="mt-2 text-sm text-slate-600">{runMessage}</p>
        )}

        {runResult && (
          <div className="mt-2 text-xs text-slate-500">
            {runResult.ok ? "OK" : "Échec"} •{" "}
            {runResult.processed ?? 0} traités •{" "}
            {runResult.tagsUpserted ?? 0} tags •{" "}
            {runResult.errors ?? 0} erreurs
            {runResult.skipReason ? ` • ${runResult.skipReason}` : ""}
          </div>
        )}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              checked={showErrorsOnly}
              onChange={(e) => setShowErrorsOnly(e.target.checked)}
            />
            Erreurs uniquement
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              checked={showRecentOnly}
              onChange={(e) => setShowRecentOnly(e.target.checked)}
            />
            Récents (24h)
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Type</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={runsFilter}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "all" || value === "location" || value === "errors") {
                  setRunsFilter(value);
                }
              }}
            >
              <option value="all">Tous</option>
              <option value="location">Par location</option>
              <option value="errors">Avec erreurs</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-rose-600">
            {error}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Location Status Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              État par établissement
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.locationId} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 bg-slate-50/50 p-4 pb-2">
                    <CardTitle className="text-sm font-semibold truncate" title={item.location}>{item.location}</CardTitle>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyles[item.status] ?? statusStyles.idle}`}>
                      {item.status}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 text-xs text-slate-600 space-y-1.5">
                    <div className="flex justify-between">
                      <span>Dernier run:</span>
                      <span className="font-medium">{formatTimestamp(item.lastRunAt)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Traités</div>
                        <div className="font-medium text-slate-900">{item.processed}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Manquants</div>
                        <div className="font-medium text-amber-600">{item.missing}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Erreurs</div>
                        <div className={`font-medium ${item.errors > 0 ? "text-rose-600" : "text-slate-900"}`}>{item.errors}</div>
                      </div>
                    </div>

                    {item.lastError && (
                      <div className="mt-2 rounded bg-rose-50 p-2 text-rose-600 line-clamp-2">
                        {item.lastError}
                      </div>
                    )}

                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-8"
                        disabled={runLocationLoading === item.locationId}
                        onClick={() => triggerRunForLocation(item.locationId)}
                      >
                        {runLocationLoading === item.locationId ? "En cours..." : "Lancer l'analyse"}
                      </Button>
                    </div>
                    {runLocationMessage[item.locationId] && (
                      <div className="text-[10px] text-slate-500 text-center">
                        {runLocationMessage[item.locationId]}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Section 2: Recent Runs List (Cards) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Derniers runs ({filteredRuns.length})
            </h3>

            {filteredRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Aucun historique récent.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredRuns.map((run) => (
                  <JobCard
                    key={run.id}
                    run={run}
                    locationName={getLocationLabel(run.meta?.location_id)}
                    onClick={() => setSelectedRun(run)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <JobDetailDrawer
        isOpen={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        run={selectedRun}
        locationName={getLocationLabel(selectedRun?.meta?.location_id)}
      />
    </div>
  );
};

export default AIJobHealth;
