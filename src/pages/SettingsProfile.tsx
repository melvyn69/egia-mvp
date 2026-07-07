import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

const panelClass =
  "overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]";

const sectionHeaderClass = "border-b border-slate-100 px-4 py-4 sm:px-6";

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

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
        throw new Error(text || "Impossible de mettre à jour le profil.");
      }
      setStatus("Profil mis à jour.");
      await queryClient.invalidateQueries({
        queryKey: ["profile", session?.user?.id]
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de mettre à jour le profil."
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
      setPasswordMessage("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordMessage("Les mots de passe ne correspondent pas.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPasswordMessage("Impossible de mettre à jour le mot de passe.");
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    setPasswordMessage("Mot de passe mis à jour.");
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
    <div className="space-y-4">
      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold sm:text-lg">Mon profil</CardTitle>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Informations personnelles utilisées dans l'espace équipe.
              </p>
            </div>
            {role && (
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {role}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-6">
          {profileQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Nom complet
                <input
                  className={fieldClass}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Prénom Nom"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Email
                <input
                  type="email"
                  className={`${fieldClass} bg-slate-50 text-slate-700`}
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

      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <CardTitle className="text-base font-semibold sm:text-lg">Sécurité</CardTitle>
          <p className="text-sm leading-6 text-slate-500">
            Gestion du mot de passe selon le fournisseur de connexion.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-6">
          {provider === "google" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Votre compte est connecté via Google. La gestion du mot de passe
              se fait depuis Google.
            </div>
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Nouveau mot de passe
                <input
                  type="password"
                  className={fieldClass}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Confirmer le mot de passe
                <input
                  type="password"
                  className={fieldClass}
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
              </label>
              {passwordMessage && (
                <p className="text-xs text-slate-500">{passwordMessage}</p>
              )}
              <Button variant="outline" onClick={handlePasswordUpdate}>
                Mettre à jour le mot de passe
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <CardTitle className="text-base font-semibold sm:text-lg">Zone de danger</CardTitle>
          <p className="text-sm leading-6 text-slate-500">
            Demande de désactivation du compte courant.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-6">
          <p className="text-sm text-slate-600">
            Cette action désactive votre accès. Vous pourrez revenir vers
            l'equipe EGIA si besoin.
          </p>
          <label className="block text-xs font-semibold text-slate-600">
            Tapez SUPPRIMER pour confirmer
            <input
              className={fieldClass}
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
