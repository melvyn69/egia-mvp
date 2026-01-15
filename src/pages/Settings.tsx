import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";

type SettingsProps = {
  session: Session | null;
};

type TeamMemberRow = {
  id: string;
  first_name: string;
  role: string | null;
  email?: string | null;
  receive_monthly_reports?: boolean | null;
  is_active?: boolean | null;
};

type TeamInvitationRow = {
  id: string;
  email: string;
  first_name?: string | null;
  role?: string | null;
  receive_monthly_reports?: boolean | null;
  status?: string | null;
  expires_at?: string | null;
};

type BusinessSettingsRow = {
  business_name?: string | null;
  monthly_report_enabled?: boolean | null;
};

type TabId =
  | "integrations"
  | "ai-identity"
  | "locations"
  | "mobile"
  | "team"
  | "profile"
  | "company"
  | "notifications";

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  {
    id: "integrations",
    label: "Integrations",
    description: "Connexions et sources de donnees."
  },
  {
    id: "ai-identity",
    label: "Identite IA",
    description: "Ton, style, et regles de langage."
  },
  {
    id: "locations",
    label: "Etablissements",
    description: "Parametrage des lieux suivis."
  },
  {
    id: "mobile",
    label: "App Mobile",
    description: "Acces et notifications mobiles."
  },
  {
    id: "team",
    label: "Equipe",
    description: "Collaborateurs et invitations."
  },
  {
    id: "profile",
    label: "Mon Profil",
    description: "Informations personnelles."
  },
  {
    id: "company",
    label: "Entreprise",
    description: "Preferences business et rapports."
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Reglages d'alertes."
  }
];

const roleLabel = (value: string | null) => {
  if (!value) return "Editeur";
  if (value.toLowerCase() === "admin") return "Admin";
  return "Editeur";
};

const initialsFromName = (value: string) => {
  const parts = value.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const Settings = ({ session }: SettingsProps) => {
  const queryClient = useQueryClient();
  const supabaseClient = supabase;
  const sb = supabaseClient as any;
  const userId = session?.user?.id ?? null;
  const [activeTab, setActiveTab] = useState<TabId>("team");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteMonthly, setInviteMonthly] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const teamMembersQuery = useQuery({
    queryKey: ["team-members", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) {
        return [] as TeamMemberRow[];
      }
      const { data, error } = await sb
        .from("team_members")
        .select("id, first_name, role, email, receive_monthly_reports, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const businessSettingsQuery = useQuery({
    queryKey: ["business-settings", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) {
        return null as BusinessSettingsRow | null;
      }
      const { data, error } = await sb
        .from("business_settings")
        .select("business_name, monthly_report_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BusinessSettingsRow | null;
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const monthlyEnabled =
    businessSettingsQuery.data?.monthly_report_enabled ?? false;

  const invitationsQuery = useQuery({
    queryKey: ["team-invitations", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) {
        return [] as TeamInvitationRow[];
      }
      const { data, error } = await sb
        .from("team_invitations")
        .select(
          "id, email, first_name, role, receive_monthly_reports, status, expires_at"
        )
        .eq("owner_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamInvitationRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const handleInvite = async () => {
    if (!supabaseClient || !userId) return;
    setInviteError(null);
    setInviteSuccess(null);
    setInviteSending(true);

    const firstName = inviteFirstName.trim();
    const email = inviteEmail.trim().toLowerCase();
    if (!firstName) {
      setInviteError("Le prenom est obligatoire.");
      setInviteSending(false);
      return;
    }
    if (!email) {
      setInviteError("L'email est obligatoire.");
      setInviteSending(false);
      return;
    }

    const accessToken = session?.access_token ?? null;
    if (!accessToken) {
      setInviteError("Session invalide. Reconnectez-vous.");
      setInviteSending(false);
      return;
    }

    let successMessage: string | null = null;
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "invite",
          first_name: firstName,
          email,
          role: inviteRole,
          receive_monthly_reports: inviteMonthly
        })
      });
      const raw = await response.text();
      let payload: { ok?: boolean; emailSent?: boolean; warning?: string } | null = null;
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
      }
      if (!response.ok) {
        setInviteError(raw || "Impossible d'envoyer l'invitation.");
        setInviteSending(false);
        return;
      }
      if (payload?.emailSent === false) {
        successMessage =
          "Invitation creee, mais l'email n'a pas ete envoye. Vous pouvez renvoyer.";
      }
    } catch {
      setInviteError("Impossible d'envoyer l'invitation.");
      setInviteSending(false);
      return;
    }

    setInviteFirstName("");
    setInviteEmail("");
    setInviteRole("editor");
    setInviteMonthly(false);
    setInviteSuccess(successMessage ?? "Invitation envoyee.");
    void queryClient.invalidateQueries({ queryKey: ["team-invitations", userId] });
    setInviteSending(false);
  };

  const handleResend = async (invitation: TeamInvitationRow) => {
    if (!supabaseClient || !userId) return;
    setInviteError(null);
    setInviteSuccess(null);
    const accessToken = session?.access_token ?? null;
    if (!accessToken) {
      setInviteError("Session invalide. Reconnectez-vous.");
      return;
    }
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          first_name: invitation.first_name ?? "",
          email: invitation.email,
          role: invitation.role ?? "editor",
          receive_monthly_reports: Boolean(
            invitation.receive_monthly_reports
          )
        })
      });
      if (!response.ok) {
        const text = await response.text();
        setInviteError(text || "Impossible de renvoyer l'invitation.");
        return;
      }
      setInviteSuccess("Invitation renvoyee.");
      void queryClient.invalidateQueries({
        queryKey: ["team-invitations", userId]
      });
    } catch {
      setInviteError("Impossible de renvoyer l'invitation.");
    }
  };

  const handleMemberToggle = async (
    member: TeamMemberRow,
    nextValue: boolean
  ) => {
    if (!supabaseClient || !userId) return;
    if (!member.email) return;
    setToggleError(null);
    const previous = Boolean(member.receive_monthly_reports);
    queryClient.setQueryData(["team-members", userId], (old) => {
      const rows = (old as TeamMemberRow[] | undefined) ?? [];
      return rows.map((row) =>
        row.id === member.id
          ? { ...row, receive_monthly_reports: nextValue }
          : row
      );
    });
    const { error } = await sb
      .from("team_members")
      .update({
        receive_monthly_reports: nextValue,
        updated_at: new Date().toISOString()
      })
      .eq("id", member.id)
      .eq("user_id", userId);
    if (error) {
      queryClient.setQueryData(["team-members", userId], (old) => {
        const rows = (old as TeamMemberRow[] | undefined) ?? [];
        return rows.map((row) =>
          row.id === member.id
            ? { ...row, receive_monthly_reports: previous }
            : row
        );
      });
      setToggleError("Impossible de mettre a jour ce membre.");
    }
  };

  const handleMonthlyToggle = async (nextValue: boolean) => {
    if (!supabaseClient || !userId) return;
    setCompanyError(null);
    setUpdatingCompany(true);
    const previous = monthlyEnabled;
    queryClient.setQueryData(["business-settings", userId], (old) => ({
      ...(old as BusinessSettingsRow | null),
      monthly_report_enabled: nextValue
    }));
    const { error } = await sb
      .from("business_settings")
      .update({
        monthly_report_enabled: nextValue,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);
    if (error) {
      queryClient.setQueryData(["business-settings", userId], (old) => ({
        ...(old as BusinessSettingsRow | null),
        monthly_report_enabled: previous
      }));
      setCompanyError("Impossible de sauvegarder le parametre.");
    }
    setUpdatingCompany(false);
  };

  const teamMembers = teamMembersQuery.data ?? [];

  const tabContent = useMemo(() => {
    if (activeTab === "team") {
      return (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Collaborateurs actifs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-500">
                Le rapport mensuel est envoye automatiquement par email aux
                membres actifs.
              </p>
              {teamMembersQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                  Aucun collaborateur actif.
                </div>
              ) : (
                teamMembers.map((member) => {
                  const name = member.first_name || "Collaborateur";
                  const email = member.email ?? "Non renseigne";
                  const role = roleLabel(member.role);
                  const canToggle = Boolean(member.email);
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                          {initialsFromName(name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {name}
                            </p>
                            {member.receive_monthly_reports && (
                              <Badge variant="success">Rapport mensuel</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-ink"
                            checked={Boolean(member.receive_monthly_reports)}
                            disabled={!canToggle}
                            onChange={(event) =>
                              handleMemberToggle(member, event.target.checked)
                            }
                          />
                          Recevoir le rapport mensuel
                        </label>
                        <Badge variant="neutral">{role}</Badge>
                      </div>
                    </div>
                  );
                })
              )}
              {toggleError && (
                <p className="text-xs text-rose-600">{toggleError}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invitations en attente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invitationsQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (invitationsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucune invitation en attente.
                </p>
              ) : (
                (invitationsQuery.data ?? []).map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {invite.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        {roleLabel(invite.role ?? "editor")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResend(invite)}
                    >
                      Renvoyer
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inviter un membre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Prenom
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                    value={inviteFirstName}
                    onChange={(event) => setInviteFirstName(event.target.value)}
                    placeholder="Prénom"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Email professionnel
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="prenom@entreprise.com"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Role
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                  >
                    <option value="editor">Editeur</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
                  Recevoir les rapports mensuels
                  <input
                    type="checkbox"
                    checked={inviteMonthly}
                    onChange={(event) => setInviteMonthly(event.target.checked)}
                    className="h-4 w-4 accent-ink"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Le rapport mensuel est envoye automatiquement par email aux
                  membres actifs.
                </p>
              </div>

              {inviteError && (
                <p className="text-xs text-rose-600">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="text-xs text-emerald-600">{inviteSuccess}</p>
              )}

              <Button onClick={handleInvite} disabled={inviteSending}>
                Envoyer l'invitation
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "company") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Entreprise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {businessSettingsQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Activer l'envoi du rapport mensuel
                  </p>
                  <p className="text-xs text-slate-500">
                    Les collaborateurs opt-in recevront le rapport chaque mois.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-ink"
                  checked={monthlyEnabled}
                  onChange={(event) => handleMonthlyToggle(event.target.checked)}
                  disabled={updatingCompany}
                />
              </label>
            )}
            {companyError && (
              <p className="text-xs text-rose-600">{companyError}</p>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>{tabs.find((tab) => tab.id === activeTab)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Section en cours de finalisation.
          </p>
        </CardContent>
      </Card>
    );
  }, [
    activeTab,
    teamMembersQuery.isLoading,
    teamMembers,
    inviteFirstName,
    inviteEmail,
    inviteRole,
    inviteMonthly,
    inviteError,
    inviteSuccess,
    toggleError,
    inviteSending,
    businessSettingsQuery.isLoading,
    monthlyEnabled,
    updatingCompany,
    companyError,
    invitationsQuery.isLoading,
    invitationsQuery.data
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Parametres
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-xs font-semibold transition",
              activeTab === tab.id
                ? "border-ink bg-ink text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
        {tabs.find((tab) => tab.id === activeTab)?.description}
      </div>

      {tabContent}
    </div>
  );
};

export default Settings;
