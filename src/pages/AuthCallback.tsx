import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { supabase } from "../lib/supabase";

type CallbackStatus = "loading" | "success" | "error";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (error) {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage("Echec de l'authentification Supabase.");
          }
          return;
        }
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.toString());
      }

      if (!cancelled) {
        setStatus("success");
        setErrorMessage(null);
        window.setTimeout(() => {
          navigate("/", { replace: true });
        }, 600);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <p className="text-sm text-slate-500">
            Finalisation de la connexion en cours.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Loader2 size={18} className="animate-spin" />
              Authentification Supabase...
            </div>
          )}
          {status === "success" && (
            <div className="flex items-center gap-3 text-sm text-emerald-700">
              <CheckCircle2 size={18} />
              Connexion reussie ✅ Redirection...
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
        </CardContent>
      </Card>
    </div>
  );
};

export { AuthCallback };
