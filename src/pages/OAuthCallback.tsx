import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase } from "../lib/supabase";
import { startGoogleConnection } from "../lib/googleAuth";

type CallbackStatus =
  | "loading"
  | "no_session"
  | "success"
  | "error";

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!supabase) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Configuration Supabase manquante.");
        }
        return;
      }
      setStatus("loading");
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }
      if (error) {
        setStatus("error");
        setErrorMessage("Impossible de charger la session.");
        return;
      }
      const session = data.session;
      const hasSession = Boolean(session);
      if (import.meta.env.DEV) {
        console.log("oauth callback session exists:", hasSession);
      }
      if (!session) {
        setStatus("no_session");
        setErrorMessage("Session Supabase manquante. Reconnecte-toi.");
        return;
      }
      if (!code) {
        setStatus("error");
        setErrorMessage("Code OAuth manquant.");
        return;
      }
      const callbackUrl = new URL(
        "/api/google/oauth/callback",
        window.location.origin
      );
      callbackUrl.searchParams.set("code", code);
      if (state) {
        callbackUrl.searchParams.set("state", state);
      }
      callbackUrl.searchParams.set("user_id", session.user.id);
      window.location.assign(callbackUrl.toString());
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleReconnect = async () => {
    if (!supabase) {
      setStatus("error");
      setErrorMessage("Configuration Supabase manquante.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/", { replace: true });
        return;
      }
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
      setSyncMessage("Erreur de synchronisation.");
    } else {
      setSyncMessage(
        `Synchronisation terminée: ${data?.locationsCount ?? 0} lieux.`
      );
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
              Connexion Google réussie ✅ Redirection...
            </div>
          )}
          {status === "no_session" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} />
                Connexion incomplète
              </div>
              <p className="mt-2">{errorMessage}</p>
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
          {status === "no_session" && (
            <Button variant="outline" onClick={handleReconnect}>
              Relancer la connexion Google
            </Button>
          )}
          {status === "success" && (
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncLoading}
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
