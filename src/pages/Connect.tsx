import { AlertCircle, CheckCircle2, Link2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type LocationProgress = {
  locationId: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string | null;
  inserted?: number;
  updated?: number;
  skipped?: number;
};

type ImportFailure = {
  location_resource_name: string | null;
  message: string;
};

type ConnectProps = {
  onConnect: () => void;
  onSync?: () => void;
  onRetryFailed?: () => void;
  syncLoading?: boolean;
  syncDisabled?: boolean;
  syncMessage?: string | null;
  lastLogStatus?: string | null;
  lastLogMessage?: string | null;
  locationProgress?: LocationProgress[];
  importFailures?: ImportFailure[];
  retryLoading?: boolean;
};

const statusLabel = {
  pending: "En attente",
  running: "En cours",
  done: "OK",
  error: "Erreur"
} as const;

const statusClass = {
  pending: "bg-slate-100 text-slate-700",
  running: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700"
} as const;

const Connect = ({
  onConnect,
  onSync,
  onRetryFailed,
  syncLoading = false,
  syncDisabled = false,
  syncMessage,
  lastLogStatus,
  lastLogMessage,
  locationProgress = [],
  importFailures = [],
  retryLoading = false
}: ConnectProps) => {
  const doneCount = locationProgress.filter(
    (item) => item.status === "done" || item.status === "error"
  ).length;
  const failedCount = locationProgress.filter(
    (item) => item.status === "error"
  ).length;
  const progressPct =
    locationProgress.length > 0
      ? Math.round((doneCount / locationProgress.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-gradient-to-br from-ink via-[#1d1c20] to-[#3a2f28] text-white shadow-soft">
        <CardHeader>
          <CardTitle className="text-3xl font-semibold">
            Connecter Google Business Profile
          </CardTitle>
          <p className="text-sm text-slate-200">
            Import robuste des etablissements + sync avis sans crash global.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button variant="secondary" size="lg" onClick={onConnect}>
            Lancer la connexion Google
          </Button>

          {onSync && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={syncLoading || syncDisabled}
            >
              {syncLoading ? "Import en cours..." : "Importer mes etablissements"}
            </Button>
          )}

          {onRetryFailed && failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryFailed}
              disabled={syncLoading || retryLoading}
            >
              {retryLoading ? "Retry en cours..." : `Retry failed (${failedCount})`}
            </Button>
          )}

          {syncMessage && (
            <p className="text-xs text-slate-200/80">{syncMessage}</p>
          )}
          <p className="text-xs text-slate-200/80">
            Autorisation requise pour acceder aux avis, repondre et publier.
          </p>
        </CardContent>
      </Card>

      {locationProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Progression sync etablissements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {doneCount}/{locationProgress.length} termines
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-ink transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {locationProgress.map((item) => (
                <div
                  key={item.locationId}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.label}
                      </p>
                      {item.detail && (
                        <p className="text-xs text-slate-500">{item.detail}</p>
                      )}
                      {(item.status === "done" || item.status === "error") && (
                        <p className="text-xs text-slate-500">
                          inserted {item.inserted ?? 0} · updated {item.updated ?? 0} · skipped {item.skipped ?? 0}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${statusClass[item.status]}`}
                    >
                      {item.status === "running" && <Loader2 size={12} className="animate-spin" />}
                      {item.status === "done" && <CheckCircle2 size={12} />}
                      {item.status === "error" && <AlertCircle size={12} />}
                      {statusLabel[item.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {importFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Erreurs import etablissements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-rose-700">
            {importFailures.map((failure, index) => (
              <div key={`${failure.location_resource_name ?? "unknown"}-${index}`}>
                {(failure.location_resource_name ?? "location_unknown")}: {failure.message}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: <ShieldCheck size={18} />,
            title: "Connexion securisee",
            description: "OAuth Google officiel, aucun mot de passe stocke."
          },
          {
            icon: <Link2 size={18} />,
            title: "Donnees centralisees",
            description: "Toutes vos fiches dans un seul tableau."
          },
          {
            icon: <CheckCircle2 size={18} />,
            title: "Temps reel",
            description: "Reponses aux avis et insights instantanes."
          }
        ].map((item) => (
          <Card key={item.title}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-clay text-slate-700">
                {item.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {item.title}
                </p>
                <p className="text-sm text-slate-500">{item.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>
            <span className="font-semibold text-slate-700">Status:</span>{" "}
            {lastLogStatus ?? "-"}
          </p>
          <p>
            <span className="font-semibold text-slate-700">Dernier message:</span>{" "}
            {lastLogMessage ?? "-"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export { Connect };
