import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type SettingsProfileProps = {
  session: Session | null;
};

type ProfileData = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  auth_provider: string | null;
};

const SettingsProfile = ({ session }: SettingsProfileProps) => {
  const queryClient = useQueryClient();
  const accessToken = session?.access_token ?? null;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", session?.user?.id],
    queryFn: async () => {
      if (!accessToken) return null as ProfileData | null;
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "profile_get" })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load profile");
      }
      const payload = (await response.json()) as { data?: ProfileData };
      return payload.data ?? null;
    },
    enabled: Boolean(accessToken)
  });

  useEffect(() => {
    const data = profileQuery.data;
    if (!data) return;
    setFullName(data.full_name ?? "");
    setEmail(data.email ?? "");
    setRole(data.role ?? null);
    setProvider(data.auth_provider ?? null);
  }, [profileQuery.data]);

  const handleSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "profile_update",
          full_name: fullName
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible de mettre a jour le profil.");
      }
      setStatus("Profil mis a jour.");
      await queryClient.invalidateQueries({
        queryKey: ["profile", session?.user?.id]
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de mettre a jour le profil."
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!supabase) return;
    setPasswordMessage(null);
    setError(null);
    if (!password || password.length < 8) {
      setPasswordMessage("Le mot de passe doit contenir au moins 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordMessage("Les mots de passe ne correspondent pas.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPasswordMessage("Impossible de mettre a jour le mot de passe.");
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    setPasswordMessage("Mot de passe mis a jour.");
  };

  const handleDeleteRequest = async () => {
    if (!accessToken) return;
    setDeleteError(null);
    setDeleteMessage(null);
    setDeleteLoading(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "profile_delete_request"
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible de traiter la demande.");
      }
      setDeleteMessage("Demande prise en compte.");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Impossible de traiter la demande."
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mon profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Nom complet
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Prénom Nom"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Email
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  value={email}
                  readOnly
                />
              </label>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {role && <span>Rôle: {role}</span>}
                {provider && <span>Connexion: {provider}</span>}
              </div>
              {status && (
                <p className="text-xs text-emerald-600">{status}</p>
              )}
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Securite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {provider === "google" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Votre compte est connecte via Google. La gestion du mot de passe
              se fait depuis Google.
            </div>
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Nouveau mot de passe
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Confirmer le mot de passe
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
              </label>
              {passwordMessage && (
                <p className="text-xs text-slate-500">{passwordMessage}</p>
              )}
              <Button variant="outline" onClick={handlePasswordUpdate}>
                Mettre a jour le mot de passe
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zone de danger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Cette action desactive votre acces. Vous pourrez revenir vers
            l'equipe EGIA si besoin.
          </p>
          <label className="block text-xs font-semibold text-slate-600">
            Tapez SUPPRIMER pour confirmer
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="SUPPRIMER"
            />
          </label>
          {deleteError && <p className="text-xs text-rose-600">{deleteError}</p>}
          {deleteMessage && (
            <p className="text-xs text-emerald-600">{deleteMessage}</p>
          )}
          <Button
            variant="outline"
            onClick={handleDeleteRequest}
            disabled={deleteConfirm !== "SUPPRIMER" || deleteLoading}
          >
            {deleteLoading ? "Traitement..." : "Demander la suppression"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsProfile;
