import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase } from "../lib/supabase";
import { connectGoogle } from "../lib/googleAuth";

type CallbackStatus =
  | "loading"
  | "no_session"
  | "no_provider_token"
  | "success"
  | "error";

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);
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
      const hasProviderToken = Boolean(session?.provider_token);
      if (import.meta.env.DEV) {
        console.log("oauth callback session exists:", hasSession);
        console.log("oauth callback provider_token present:", hasProviderToken);
      }
      if (!session) {
        setStatus("no_session");
        setErrorMessage("Session Supabase manquante. Reconnecte-toi.");
        return;
      }
      if (!session.provider_token) {
        setStatus("no_provider_token");
        setErrorMessage("Token Google manquant, reconnecte Google.");
        return;
      }
      setProviderToken(session.provider_token);
      setStatus("success");
      setErrorMessage(null);
      window.setTimeout(() => {
        navigate("/inbox", { replace: true });
      }, 800);
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
    await supabase.auth.signOut();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { error } = await connectGoogle(supabase);
    if (error) {
      setStatus("error");
      setErrorMessage("Impossible de relancer la connexion Google.");
    }
  };

  const handleSync = async () => {
    if (!supabase || !providerToken) {
      setSyncMessage("Token Google manquant.");
      return;
    }
    setSyncLoading(true);
    setSyncMessage(null);
    const { data, error } = await supabase.functions.invoke("google_gbp_sync_all", {
      headers: {
        "X-Google-Token": providerToken
      }
    });
    if (error || !data?.ok) {
      setSyncMessage("Erreur de synchronisation.");
    } else {
      setSyncMessage(
        `Synchronisation lancée: ${data.locationsCount ?? 0} lieux, ${
          data.reviewsCount ?? 0
        } avis.`
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
          {(status === "no_session" || status === "no_provider_token") && (
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
          {(status === "no_session" || status === "no_provider_token") && (
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
