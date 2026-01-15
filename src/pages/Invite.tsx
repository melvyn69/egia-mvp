import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type InviteProps = {
  session: Session | null;
};

const Invite = ({ session }: InviteProps) => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "accepted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasSession = Boolean(session?.access_token);

  const inviteUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/invite?token=${encodeURIComponent(token)}`;
  }, [token]);

  const handleLogin = async () => {
    if (!supabase) return;
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Email requis.");
      return;
    }
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: inviteUrl }
    });
    if (loginError) {
      setError("Impossible d'envoyer le lien de connexion.");
      return;
    }
    setMessage("Lien de connexion envoye. Verifie ta boite mail.");
  };

  const handleAccept = async () => {
    if (!session?.access_token) return;
    setError(null);
    setMessage(null);
    setStatus("sending");
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "accept", token })
      });
      if (!response.ok) {
        const text = await response.text();
        setError(text || "Impossible d'accepter l'invitation.");
        setStatus("idle");
        return;
      }
      setStatus("accepted");
      setMessage("Invitation acceptee. Vous pouvez acceder a l'app.");
    } catch {
      setError("Impossible d'accepter l'invitation.");
      setStatus("idle");
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Invitation EGIA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token && (
            <p className="text-sm text-slate-600">
              Lien d'invitation invalide.
            </p>
          )}

          {token && !hasSession && (
            <>
              <p className="text-sm text-slate-600">
                Connectez-vous pour accepter l'invitation.
              </p>
              <label className="text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@entreprise.com"
                />
              </label>
              <Button onClick={handleLogin}>Recevoir le lien de connexion</Button>
            </>
          )}

          {token && hasSession && (
            <>
              <p className="text-sm text-slate-600">
                Cliquez pour accepter l'invitation.
              </p>
              <Button onClick={handleAccept} disabled={status === "sending"}>
                Accepter l'invitation
              </Button>
            </>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default Invite;
