import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { FaFacebookF, FaGoogle, FaInstagram } from "react-icons/fa";
import { SiTripadvisor } from "react-icons/si";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { startGoogleConnection } from "../lib/googleAuth";
import { BrandVoice } from "./BrandVoice";
import SettingsAlertesIntelligentes from "./SettingsAlertesIntelligentes";
import SettingsEntreprise from "./SettingsEntreprise";
import SettingsProfile from "./SettingsProfile";

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

type LocationRow = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
  address_json?: unknown | null;
  phone?: string | null;
  website_uri?: string | null;
  last_synced_at?: string | null;
};

type TabId =
  | "integrations"
  | "ai-identity"
  | "locations"
  | "mobile"
  | "team"
  | "profile"
  | "company"
  | "alerts";

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
    id: "alerts",
    label: "Alertes intelligentes",
    description: "Surveillance proactive et signaux a fort impact."
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

const formatAddress = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const formatted =
    (record.formatted_address as string | undefined) ??
    (record.formattedAddress as string | undefined);
  if (formatted) return formatted;
  const line1 =
    (record.address_line_1 as string | undefined) ??
    (record.line1 as string | undefined);
  const line2 =
    (record.address_line_2 as string | undefined) ??
    (record.line2 as string | undefined);
  const city = (record.city as string | undefined) ?? null;
  const postal =
    (record.postal_code as string | undefined) ??
    (record.zip as string | undefined);
  const region =
    (record.region as string | undefined) ??
    (record.state as string | undefined);
  const parts = [line1, line2, postal, city, region]
    .filter(Boolean)
    .join(" ");
  return parts || null;
};

const formatRelativeTime = (isoDate: string | null) => {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "a l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `il y a ${diffDays} j`;
};

const Settings = ({ session }: SettingsProps) => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [locationsNotice, setLocationsNotice] = useState<string | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);
  const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);
  const [activeLocationsSaving, setActiveLocationsSaving] = useState(false);
  const deviceHint = useMemo(() => {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
      return "ios";
    }
    if (ua.includes("android")) {
      return "android";
    }
    return "desktop";
  }, []);
  const appBaseUrl =
    typeof window === "undefined"
      ? ""
      : ((import.meta as any).env?.VITE_APP_BASE_URL ??
        window.location.origin);
  const handleOpenApp = () => {
    if (!appBaseUrl) return;
    window.open(appBaseUrl, "_blank");
  };

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!raw) return;
    const normalized = raw.toLowerCase();
    const map: Record<string, TabId> = {
      equipe: "team",
      team: "team",
      integrations: "integrations",
      "ai-identity": "ai-identity",
      locations: "locations",
      mobile: "mobile",
      profile: "profile",
      company: "company",
      alerts: "alerts",
      alertes: "alerts"
    };
    const next = map[normalized];
    if (next && next !== activeTab) {
      setActiveTab(next);
    }
  }, [activeTab, searchParams]);

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

  const googleConnectionQuery = useQuery({
    queryKey: ["google-connection", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) return null;
      const { data, error } = await supabaseClient
        .from("google_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const locationsQuery = useQuery({
    queryKey: ["google-locations", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) return [];
      const { data, error } = await supabaseClient
        .from("google_locations")
        .select(
          "id, location_title, location_resource_name, address_json, phone, website_uri, last_synced_at"
        )
        .eq("user_id", userId)
        .order("location_title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  useEffect(() => {
    if (!supabaseClient || !userId) {
      setSelectedActiveIds([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabaseClient
        .from("business_settings")
        .select("active_location_ids")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("business_settings load error:", error);
        setSelectedActiveIds((locationsQuery.data ?? []).map((loc) => loc.id));
        return;
      }
      const ids = Array.isArray(data?.active_location_ids)
        ? data.active_location_ids.filter(Boolean)
        : null;
      const allIds = (locationsQuery.data ?? []).map((loc) => loc.id);
      const resolved = ids && ids.length > 0 ? ids : allIds;
      setSelectedActiveIds(resolved);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabaseClient, userId, locationsQuery.data]);

  const reviewsNeedingReplyQuery = useQuery({
    queryKey: ["reviews-needing-reply", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) return [];
      const { data, error } = await sb
        .from("google_reviews")
        .select("id, location_id, needs_reply, update_time, create_time")
        .eq("user_id", userId)
        .eq("needs_reply", true);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        location_id: string | null;
        needs_reply: boolean | null;
        update_time?: string | null;
        create_time?: string | null;
      }>;
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const lastSyncQuery = useQuery({
    queryKey: ["google-connection-sync", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) return null;
      const { data, error } = await supabaseClient
        .from("google_connections")
        .select("last_synced_at")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
      if (error) throw error;
      return data?.last_synced_at ?? null;
    },
    enabled: Boolean(supabaseClient) && Boolean(userId)
  });

  const persistActiveLocations = async (nextActive: string[]) => {
    if (!supabaseClient || !userId) return;
    setActiveLocationsSaving(true);
    const allIds = (locationsQuery.data ?? []).map((loc) => loc.id);
    const payload = {
      user_id: userId,
      business_id: userId,
      business_name: session?.user?.email ?? "Business",
      active_location_ids:
        nextActive.length === 0 || nextActive.length === allIds.length
          ? null
          : nextActive,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb
      .from("business_settings")
      .upsert(payload, { onConflict: "business_id" });
    if (error) {
      console.error("business_settings save error:", error);
      setLocationsError("Impossible de sauvegarder les etablissements actifs.");
    } else {
      setLocationsError(null);
    }
    setActiveLocationsSaving(false);
  };

  const handleLocationToggle = (locationId: string, checked: boolean) => {
    setSelectedActiveIds((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, locationId]))
        : prev.filter((id) => id !== locationId);
      void persistActiveLocations(next);
      return next;
    });
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);
    setLocationsNotice(null);
    if (!supabaseClient) {
      setGoogleError("Connexion Supabase requise.");
      return;
    }
    try {
      await startGoogleConnection(supabaseClient);
    } catch (error) {
      console.error("google oauth error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de demarrer la connexion Google.";
      setGoogleError(message);
    }
  };

  const handleSyncLocations = async () => {
    setLocationsError(null);
    setLocationsNotice(null);
    if (!supabaseClient || !session) {
      setLocationsError("Connexion Supabase requise.");
      return;
    }
    try {
      setSyncingLocations(true);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const jwt = sessionData.session?.access_token;
      const response = await fetch("/api/google/gbp/sync", {
        method: "POST",
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        if (response.status === 401 && data?.error === "reauth_required") {
          setLocationsError("Reconnectez Google pour synchroniser.");
          return;
        }
        setLocationsError("Impossible de synchroniser les lieux.");
        return;
      }
      setLocationsNotice(
        data?.queued
          ? "Synchronisation planifiee."
          : "Synchronisation lancee."
      );
      await queryClient.invalidateQueries({
        queryKey: ["google-locations", userId]
      });
    } catch (error) {
      console.error("google gbp sync error:", error);
      setLocationsError("Impossible de synchroniser les lieux.");
    } finally {
      setSyncingLocations(false);
    }
  };

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
    await queryClient.invalidateQueries({
      queryKey: ["team-invitations", userId]
    });
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
      const response = await fetch("/api/team", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "resend",
          first_name: invitation.first_name ?? "",
          email: invitation.email,
          role: invitation.role ?? "editor",
          receive_monthly_reports: Boolean(
            invitation.receive_monthly_reports
          )
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
        setInviteError(raw || "Impossible de renvoyer l'invitation.");
        return;
      }
      if (payload?.emailSent === false) {
        setInviteSuccess(
          "Invitation renvoyee, mais l'email n'a pas ete envoye."
        );
      } else {
        setInviteSuccess("Invitation renvoyee.");
      }
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
        <div className="space-y-6">
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
                    onChange={(event) =>
                      handleMonthlyToggle(event.target.checked)
                    }
                    disabled={updatingCompany}
                  />
                </label>
              )}
              {companyError && (
                <p className="text-xs text-rose-600">{companyError}</p>
              )}
            </CardContent>
          </Card>
          <SettingsEntreprise session={session} />
        </div>
      );
    }

    if (activeTab === "integrations") {
      const googleActive = Boolean(googleConnectionQuery.data);
      const integrations = [
        {
          id: "google",
          name: "Google Business Profile",
          type: "Source d'avis",
          description: "Synchronisation des avis et reponses en temps reel.",
          status: googleActive ? "active" : "inactive",
          actionLabel: googleActive ? null : "Connecter",
          accent: "bg-emerald-50 border-emerald-200",
          Icon: FaGoogle
        },
        {
          id: "facebook",
          name: "Facebook Pages",
          type: "Source d'avis",
          description: "Gerez les avis et commentaires de vos pages.",
          status: "soon",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: FaFacebookF
        },
        {
          id: "instagram",
          name: "Instagram",
          type: "Canal social",
          description: "Publiez vos meilleurs avis en story.",
          status: "soon",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: FaInstagram
        },
        {
          id: "tripadvisor",
          name: "TripAdvisor",
          type: "Source d'avis",
          description: "Importation des avis voyageurs.",
          status: "soon",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: SiTripadvisor
        }
      ] as const;

      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Connexions</h2>
            <p className="text-sm text-slate-500">
              Centralisez vos sources d'avis et canaux sociaux.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {integrations.map((integration) => {
              const isActive = integration.status === "active";
              const isSoon = integration.status === "soon";
              return (
                <div
                  key={integration.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    isActive ? integration.accent : "bg-white border-slate-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
                        <integration.Icon size={22} className="text-slate-700" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {integration.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {integration.type}
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <Badge variant="success">ACTIF</Badge>
                    ) : isSoon ? (
                      <Badge variant="neutral">BIENTOT</Badge>
                    ) : (
                      <Badge variant="warning">INACTIF</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {integration.description}
                  </p>
                  {integration.actionLabel && (
                    <div className="mt-4">
                      <Button
                        size="sm"
                        onClick={handleConnectGoogle}
                        disabled={googleConnectionQuery.isLoading}
                      >
                        {integration.actionLabel}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeTab === "ai-identity") {
      return <BrandVoice session={session} />;
    }

    if (activeTab === "locations") {
      const connected = Boolean(googleConnectionQuery.data);
      const locations = locationsQuery.data ?? [];
      const activeCount =
        selectedActiveIds.length > 0 ? selectedActiveIds.length : locations.length;
      const reviewsNeedingReply = reviewsNeedingReplyQuery.data ?? [];
      const reviewsByLocation = new Map<string, number>();
      reviewsNeedingReply.forEach((row) => {
        const key = row.location_id ?? "";
        if (!key) return;
        reviewsByLocation.set(key, (reviewsByLocation.get(key) ?? 0) + 1);
      });
      const totalNeedsReply = reviewsNeedingReply.length;
      const latestReviewTime = reviewsNeedingReply.reduce<string | null>(
        (acc, row) => {
          const ts = row.update_time ?? row.create_time ?? null;
          if (!ts) return acc;
          if (!acc) return ts;
          return ts > acc ? ts : acc;
        },
        null
      );
      const latestLocationSync = locations.reduce<string | null>(
        (acc, location) => {
          const ts = location.last_synced_at ?? null;
          if (!ts) return acc;
          if (!acc) return ts;
          return ts > acc ? ts : acc;
        },
        null
      );
      const lastSync =
        latestLocationSync ?? lastSyncQuery.data ?? latestReviewTime ?? null;
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Pilotage business
            </h2>
            <p className="text-sm text-slate-500">
              Suivez la sante des lieux connectes et des avis a traiter.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Lieux actifs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900">
                  {locationsQuery.isLoading ? "…" : activeCount}
                </p>
                <p className="text-xs text-slate-500">
                  Etablissements suivis dans le dashboard.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Derniere synchro</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900">
                  {lastSyncQuery.isLoading ? "…" : formatRelativeTime(lastSync)}
                </p>
                <p className="text-xs text-slate-500">
                  Derniere activite connue cote Google.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Avis a traiter</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900">
                  {reviewsNeedingReplyQuery.isLoading ? "…" : totalNeedsReply}
                </p>
                <p className="text-xs text-slate-500">
                  Avis nécessitant une reponse.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {connected ? (
                <Badge variant="success">Google connecte</Badge>
              ) : (
                <Badge variant="warning">Connexion requise</Badge>
              )}
              <p className="text-sm text-slate-600">
                Synchronisez vos avis et mettez a jour vos fiches en temps reel.
              </p>
            </div>
            <Button onClick={handleSyncLocations} disabled={syncingLocations}>
              {syncingLocations ? "Synchronisation..." : "Synchroniser maintenant"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Connexion Google Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Synchronisez vos avis et mettez a jour vos fiches en temps reel.
              </p>
              {googleConnectionQuery.isLoading ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {connected ? (
                    <Badge variant="success">Google connecte</Badge>
                  ) : (
                    <Badge variant="warning">Connexion requise</Badge>
                  )}
                  <Button onClick={handleConnectGoogle}>
                    {connected ? "Reconnecter Google" : "Lancer la connexion Google"}
                  </Button>
                  {connected && (
                    <Button
                      variant="outline"
                      onClick={handleSyncLocations}
                      disabled={syncingLocations}
                    >
                      {syncingLocations
                        ? "Synchronisation..."
                        : "Synchroniser mes etablissements & avis"}
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Autorisation requise pour acceder aux avis, repondre et publier.
              </p>
              {googleError && (
                <p className="text-xs text-rose-600">{googleError}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vos etablissements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Lieux connectes et statut d'activation.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/sync-status")}
                >
                  Voir le statut de sync
                </Button>
              </div>
              {locationsNotice && (
                <p className="text-xs text-emerald-600">{locationsNotice}</p>
              )}
              {locationsError && (
                <p className="text-xs text-rose-600">{locationsError}</p>
              )}
              {locationsQuery.isLoading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Card key={`location-skeleton-${index}`}>
                      <CardContent className="space-y-3 pt-6">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : locations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                  Aucun etablissement. Cliquez sur “Importer depuis Google” pour
                  demarrer.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {locations.map((location) => {
                    const address = formatAddress(location.address_json);
                    const isActive = selectedActiveIds.includes(location.id);
                    const needsReplyCount = reviewsByLocation.get(location.id) ?? 0;
                    const lastSyncLabel = formatRelativeTime(
                      location.last_synced_at ?? lastSync
                    );
                    return (
                      <Card key={location.id}>
                        <CardContent className="space-y-4 pt-6">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {location.location_title ??
                                  location.location_resource_name}
                              </p>
                              {needsReplyCount > 0 && (
                                <Badge variant="warning">
                                  {needsReplyCount} avis a traiter
                                </Badge>
                              )}
                            </div>
                            {address && (
                              <p className="text-xs text-slate-500">{address}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Derniere synchro: {lastSyncLabel}</span>
                            {location.website_uri ? (
                              <a
                                href={location.website_uri}
                                target="_blank"
                                rel="noreferrer"
                                className="text-ink/80 hover:underline"
                              >
                                Site web
                              </a>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-ink"
                                checked={isActive}
                                disabled={activeLocationsSaving}
                                onChange={(event) =>
                                  handleLocationToggle(
                                    location.id,
                                    event.target.checked
                                  )
                                }
                              />
                              {isActive ? "Actif" : "Inactif"}
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(`/inbox?locationId=${location.id}`)
                              }
                            >
                              Ouvrir la boite de reception
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {locations.length > 0 && activeCount === 0 && (
                <p className="text-xs text-amber-600">
                  Aucun lieu actif. Activez au moins un etablissement pour
                  recevoir les alertes et rapports.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  if (connected) {
                    void handleSyncLocations();
                  } else {
                    void handleConnectGoogle();
                  }
                }}
              >
                Importer depuis Google
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/sync-status")}
              >
                Mapper Google
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setLocationsNotice(
                    "Ajout manuel indisponible pour l'instant."
                  )
                }
              >
                Ajouter manuellement
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "mobile") {
      const iosHighlight = deviceHint === "ios";
      const androidHighlight = deviceHint === "android";
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 text-ink">
                  <Smartphone size={18} />
                </span>
                Installez EGIA sur votre mobile
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Gérez vos avis et recevez des notifications où que vous soyez,
              sans passer par l’App Store.
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card
              className={
                iosHighlight ? "border-2 border-ink/40 shadow-sm" : ""
              }
            >
              <CardHeader>
                <CardTitle>Sur iPhone (iOS)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    1
                  </span>
                  <p>Ouvrez EGIA dans Safari.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    2
                  </span>
                  <p>Appuyez sur “Partager”.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    3
                  </span>
                  <p>Choisissez “Sur l’écran d’accueil”.</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className={
                androidHighlight ? "border-2 border-ink/40 shadow-sm" : ""
              }
            >
              <CardHeader>
                <CardTitle>Sur Android</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    1
                  </span>
                  <p>Ouvrez EGIA dans Chrome.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    2
                  </span>
                  <p>Appuyez sur le menu ⋮.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                    3
                  </span>
                  <p>Sélectionnez “Installer l’application”.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-slate-600">
                Lancez EGIA depuis votre écran d’accueil pour une expérience
                pleine page.
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenApp}>
                Ouvrir l’application
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "alerts") {
      return <SettingsAlertesIntelligentes />;
    }

    if (activeTab === "profile") {
      return <SettingsProfile session={session} />;
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
    deviceHint,
    appBaseUrl,
    businessSettingsQuery.isLoading,
    monthlyEnabled,
    updatingCompany,
    companyError,
    googleConnectionQuery.data,
    googleConnectionQuery.isLoading,
    googleError,
    locationsError,
    locationsNotice,
    locationsQuery.data,
    locationsQuery.isLoading,
    reviewsNeedingReplyQuery.data,
    reviewsNeedingReplyQuery.isLoading,
    lastSyncQuery.data,
    lastSyncQuery.isLoading,
    selectedActiveIds,
    activeLocationsSaving,
    syncingLocations,
    invitationsQuery.isLoading,
    invitationsQuery.data,
    session,
    navigate
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

// Manual test plan:
// 1) /settings?tab=locations (non connecte): bouton connexion visible.
// 2) Connecte: badge Google connecte + bouton sync.
// 3) Import/sync: liste rafraichie apres action.
// 4) Aucun lieu: bloc vide affiche.
// 5) npm run build.
