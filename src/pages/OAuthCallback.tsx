import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase } from "../lib/supabase";
import { startGoogleConnection } from "../lib/googleAuth";

type CallbackStatus =
  | "loading"
  | "success"
  | "error";

const getStatusFromUrl = (): CallbackStatus => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  if (status === "success") {
    return "success";
  }
  if (status === "error") {
    return "error";
  }
  return "loading";
};

const OAuthCallback = () => {
  const [status, setStatus] = useState<CallbackStatus>(getStatusFromUrl);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    getStatusFromUrl() === "error"
      ? "Connexion Google impossible."
      : null
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncDisabled, setSyncDisabled] = useState(false);

  const handleReconnect = async () => {
    if (!supabase) {
      setStatus("error");
      setErrorMessage("Configuration Supabase manquante.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      await startGoogleConnection(supabase);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage("Impossible de relancer la connexion Google.");
    }
  };

  const handleSync = async () => {
    if (!supabase) {
      setSyncMessage("Connexion Supabase requise.");
      return;
    }
    setSyncLoading(true);
    setSyncMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? null;
    if (!jwt) {
      setSyncMessage("Session Supabase manquante.");
      setSyncLoading(false);
      return;
    }
    const response = await fetch("/api/google/gbp/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      if (response.status === 401 && data?.error === "reauth_required") {
        setSyncMessage("Reconnecte Google.");
        setSyncDisabled(true);
      } else {
        setSyncMessage("Erreur de synchronisation.");
      }
    } else {
      setSyncMessage(
        `Synchronisation terminée: ${data?.locationsCount ?? 0} lieux.`
      );
      setSyncDisabled(false);
    }
    setSyncLoading(false);
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Connexion Google</CardTitle>
          <p className="text-sm text-slate-500">
            Finalisation de la connexion en cours.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Loader2 size={18} className="animate-spin" />
              Finalisation de la connexion Google...
            </div>
          )}
          {status === "success" && (
            <div className="flex items-center gap-3 text-sm text-emerald-700">
              <CheckCircle2 size={18} />
              Connexion Google réussie ✅
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} />
                Connexion impossible
              </div>
              <p className="mt-2">{errorMessage}</p>
            </div>
          )}
          {status === "error" && (
            <Button variant="outline" onClick={handleReconnect}>
              Relancer la connexion Google
            </Button>
          )}
          {status === "success" && (
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncLoading || syncDisabled}
              >
                {syncLoading
                  ? "Synchronisation..."
                  : "Lancer la synchronisation"}
              </Button>
              {syncMessage && (
                <p className="text-xs text-slate-500">{syncMessage}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { OAuthCallback };
