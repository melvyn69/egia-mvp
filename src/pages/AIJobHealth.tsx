import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";

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
  duration_ms?: number | null;
  processed: number | null;
  tags_upserted: number | null;
  errors_count: number | null;
  aborted: boolean | null;
  skip_reason: string | null;
  meta?: { location_id?: string | null; debug?: unknown } | null;
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

const formatDurationSeconds = (
  startedAt?: string | null,
  finishedAt?: string | null,
  durationMs?: number | null
) => {
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  if (!startedAt || !finishedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }
  return `${Math.round((end - start) / 1000)}s`;
};

const formatSkipReason = (value?: string | null) => {
  if (!value) return "—";
  if (value === "no_candidates") return "Aucune tâche";
  if (value === "locked") return "Verrouillé";
  return value;
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
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
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

    const sbAny = supabaseClient as unknown as any;
    const { data: runRows } = await sbAny
        .from("ai_run_history")
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
      if (res.status === 401 || res.status === 403) {
        setRunMessage("Accès refusé (admin requis)");
        return;
      }
      if (!res.ok) {
        setRunMessage(`Erreur: ${res.status}`);
        return;
      }
      const payload = await res.json().catch(() => null);
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
      if (res.status === 401 || res.status === 403) {
        setRunLocationMessage((prev) => ({
          ...prev,
          [locationId]: "Accès refusé (admin requis)"
        }));
        return;
      }
      if (!res.ok) {
        setRunLocationMessage((prev) => ({
          ...prev,
          [locationId]: `Erreur: ${res.status}`
        }));
        return;
      }
      const payload = await res.json().catch(() => null);
      const processed = payload?.stats?.reviewsProcessed ?? payload?.processed ?? 0;
      const tags = payload?.stats?.tagsUpserted ?? payload?.tagsUpserted ?? 0;
      const errorsCount = payload?.stats?.errors?.length ?? payload?.errors ?? 0;
      const skip = payload?.skipReason ?? null;
      const msg = `OK • ${processed} traités • ${tags} tags • ${errorsCount} erreurs${
        skip ? ` • ${skip}` : ""
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

  const locationLabelById = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((loc) => {
      const label =
        loc.location_title ?? loc.location_resource_name ?? loc.id;
      map.set(loc.id, label);
      if (loc.location_resource_name) {
        map.set(loc.location_resource_name, label);
      }
    });
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

  const handleCopyMeta = async (meta?: RunRow["meta"]) => {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(meta, null, 2));
      setCopyStatus("Copié");
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus("Échec");
      window.setTimeout(() => setCopyStatus(null), 1500);
    }
  };

  return (
    <div className="space-y-6">
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
            >
              Rafraîchir
            </Button>
            <Button onClick={triggerRun} disabled={runLoading}>
              {runLoading ? "Lancement..." : "Run AI Analysis Now"}
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
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={showErrorsOnly}
              onChange={(event) => setShowErrorsOnly(event.target.checked)}
            />
            Afficher seulement erreurs
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={showRecentOnly}
              onChange={(event) => setShowRecentOnly(event.target.checked)}
            />
            Afficher seulement runs récents (24h)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">
              Filtre runs
            </span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={runsFilter}
              onChange={(event) =>
                setRunsFilter(event.target.value as typeof runsFilter)
              }
            >
              <option value="all">Tous</option>
              <option value="location">Par location</option>
              <option value="errors">Erreurs only</option>
            </select>
          </div>
        </div>
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
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runLocationLoading === item.locationId}
                      onClick={() => triggerRunForLocation(item.locationId)}
                    >
                      {runLocationLoading === item.locationId
                        ? "Lancement..."
                        : "Run (location)"}
                    </Button>
                  </div>
                  {runLocationMessage[item.locationId] && (
                    <div className="text-xs text-slate-500">
                      {runLocationMessage[item.locationId]}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Last 20 AI Runs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {filteredRuns.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Aucun run enregistré.
                </div>
              ) : (
              <div className="grid grid-cols-7 gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase text-slate-500">
                <div>Time</div>
                <div>Location</div>
                <div>Processed</div>
                <div>Tags</div>
                <div>Errors</div>
                <div>Durée</div>
                <div>Skip Reason</div>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredRuns.map((run) => (
                  <button
                    type="button"
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className="grid w-full grid-cols-7 gap-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div>{formatTimestamp(run.started_at)}</div>
                    <div>
                      {run.meta?.location_id
                        ? locationLabelById.get(run.meta.location_id) ??
                          run.meta.location_id
                        : "—"}
                    </div>
                    <div>{run.processed ?? 0}</div>
                    <div>{run.tags_upserted ?? 0}</div>
                    <div>{run.errors_count ?? 0}</div>
                    <div>
                      {formatDurationSeconds(
                        run.started_at,
                        run.finished_at,
                        run.duration_ms ?? null
                      )}
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {formatSkipReason(run.skip_reason)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Run details
              </h3>
              <Button variant="outline" size="sm" onClick={() => setSelectedRun(null)}>
                Fermer
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Location:</span>{" "}
                {selectedRun.meta?.location_id
                  ? locationLabelById.get(selectedRun.meta.location_id) ??
                    selectedRun.meta.location_id
                  : "all"}
                <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {selectedRun.meta?.location_id ? "specific" : "all"}
                </span>
              </div>
              <div>
                <span className="font-semibold">Last error:</span>{" "}
                {selectedRun.skip_reason
                  ? `${formatSkipReason(selectedRun.skip_reason)}`
                  : "—"}
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Meta</span>
                  <div className="flex items-center gap-2">
                    {copyStatus && (
                      <span className="text-[11px] text-slate-500">
                        {copyStatus}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyMeta(selectedRun.meta)}
                    >
                      Copy JSON
                    </Button>
                  </div>
                </div>
                <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed">
                  {JSON.stringify(selectedRun.meta ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIJobHealth;
