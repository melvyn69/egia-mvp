import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type InviteProps = {
  session: Session | null;
};

const Invite = ({ session }: InviteProps) => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "accepted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [accountMismatch, setAccountMismatch] = useState(false);

  const hasSession = Boolean(session?.access_token);

  const invitePath = useMemo(
    () => `/invite?token=${encodeURIComponent(token)}`,
    [token]
  );
  const inviteUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}${invitePath}`;
  }, [invitePath]);

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
    setMessage("Lien de connexion envoyé. Vérifiez votre boîte mail.");
  };

  const handleAccept = async () => {
    if (!session?.access_token) return;
    setError(null);
    setMessage(null);
    setAccountMismatch(false);
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
      if (response.status === 403) {
        setAccountMismatch(true);
        setError(
          "Cette invitation ne peut pas être acceptée avec le compte actuellement connecté."
        );
        setStatus("idle");
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        setError(text || "Impossible d'accepter l'invitation.");
        setStatus("idle");
        return;
      }
      setStatus("accepted");
      setMessage("Invitation acceptée. Vous pouvez accéder à l'app.");
      navigate("/settings?tab=equipe", { replace: true });
    } catch {
      setError("Impossible d'accepter l'invitation.");
      setStatus("idle");
    }
  };

  const handleSwitchAccount = async () => {
    if (!supabase) return;
    setError(null);
    setMessage(null);
    setStatus("sending");
    const { error: signOutError } = await supabase.auth.signOut({
      scope: "local"
    });
    if (signOutError) {
      setError("Impossible de changer de compte. Réessayez.");
      setStatus("idle");
      return;
    }
    setAccountMismatch(false);
    setStatus("idle");
    navigate(invitePath, { replace: true });
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
                {accountMismatch
                  ? "Reconnectez-vous avec le compte destinataire de l'invitation."
                  : "Cliquez pour accepter l'invitation."}
              </p>
              {accountMismatch ? (
                <Button
                  variant="outline"
                  onClick={handleSwitchAccount}
                  disabled={status === "sending"}
                >
                  Se connecter avec un autre compte
                </Button>
              ) : (
                <Button onClick={handleAccept} disabled={status === "sending"}>
                  Accepter l'invitation
                </Button>
              )}
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
