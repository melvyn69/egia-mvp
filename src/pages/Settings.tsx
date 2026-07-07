import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  Brain,
  Building2,
  Plug,
  Settings2,
  ShieldCheck,
  Smartphone,
  Users
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { InstallPwaPrompt } from "../components/pwa/InstallPwaPrompt";
import { usePwaInstall } from "../hooks/usePwaInstall";
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
  competitive_monitoring_enabled?: boolean | null;
  competitive_monitoring_keyword?: string | null;
  competitive_monitoring_radius_km?: number | null;
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

type BrandVoiceStatusRow = {
  id: string;
  enabled?: boolean | null;
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
    label: "Intégrations",
    description: "Connexions et sources de données."
  },
  {
    id: "ai-identity",
    label: "Identité IA",
    description: "Ton, style et règles de langage."
  },
  {
    id: "locations",
    label: "Établissements",
    description: "Paramétrage des lieux suivis."
  },
  {
    id: "mobile",
    label: "App Mobile",
    description: "Accès et notifications mobiles."
  },
  {
    id: "team",
    label: "Équipe",
    description: "Collaborateurs et invitations."
  },
  {
    id: "profile",
    label: "Mon profil",
    description: "Informations personnelles."
  },
  {
    id: "company",
    label: "Entreprise",
    description: "Préférences business et rapports."
  },
  {
    id: "alerts",
    label: "Alertes intelligentes",
    description: "Surveillance proactive et signaux à fort impact."
  }
];

const tabIcons: Record<TabId, typeof Plug> = {
  integrations: Plug,
  "ai-identity": Brain,
  locations: Building2,
  mobile: Smartphone,
  team: Users,
  profile: ShieldCheck,
  company: Settings2,
  alerts: Bell
};

const panelClass =
  "overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]";

const sectionHeaderClass =
  "border-b border-slate-100 px-4 py-4 sm:px-6";

const sectionContentClass = "space-y-4 px-4 py-4 sm:px-6 sm:py-5";

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

const SectionHeader = ({
  title,
  description,
  status,
  statusVariant = "neutral"
}: {
  title: string;
  description: string;
  status?: string;
  statusVariant?: "success" | "warning" | "neutral";
}) => (
  <div className={sectionHeaderClass}>
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-950 sm:text-lg">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {status && (
        <Badge variant={statusVariant} className="w-fit shrink-0">
          {status}
        </Badge>
      )}
    </div>
  </div>
);

const MetricTile = ({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      {label}
    </p>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
      {value}
    </p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </div>
);

const roleLabel = (value: string | null) => {
  if (!value) return "Éditeur";
  if (value.toLowerCase() === "admin") return "Admin";
  return "Éditeur";
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

const GoogleLogo = () => (
  <svg
    viewBox="0 0 533.5 544.3"
    className="h-6 w-6"
    aria-hidden="true"
  >
    <path
      fill="#4285F4"
      d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.4H272v95.3h146.9c-6.3 34-25 62.7-53.4 82v68h86.4c50.6-46.6 81.6-115.3 81.6-195z"
    />
    <path
      fill="#34A853"
      d="M272 544.3c72.6 0 133.6-24.1 178.1-65.4l-86.4-68c-24 16.1-54.6 25.6-91.7 25.6-70.5 0-130.3-47.6-151.6-111.5H31.8v69.9c44.5 88.5 137.6 149.4 240.2 149.4z"
    />
    <path
      fill="#FBBC04"
      d="M120.4 324.9c-10.8-32.2-10.8-67.1 0-99.3v-69.9H31.8c-36.5 72.9-36.5 159.1 0 232z"
    />
    <path
      fill="#EA4335"
      d="M272 107.7c39.5-.6 77.5 14.2 106.6 41.1l79.4-79.4C403.5 24.4 339.7-1.5 272 0 169.4 0 76.3 60.9 31.8 149.4l88.6 69.9c21.3-63.9 81.1-111.5 151.6-111.5z"
    />
  </svg>
);

const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-700" aria-hidden="true">
    <path
      fill="currentColor"
      d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
    />
  </svg>
);

const InstagramLogo = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-700" aria-hidden="true">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path
      d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const TripAdvisorLogo = () => (
  <span className="text-sm font-semibold text-emerald-600">TA</span>
);

const Settings = ({ session }: SettingsProps) => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const supabaseClient = supabase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseClient as any;
  const userId = session?.user?.id ?? null;
  const [activeTab, setActiveTab] = useState<TabId>("locations");
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
  const [activeLocationsLoaded, setActiveLocationsLoaded] = useState(false);
  const [activeLocationsSaving, setActiveLocationsSaving] = useState(false);
  const pwaInstall = usePwaInstall();
  const appBaseUrl =
    typeof window === "undefined"
      ? ""
      : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (import.meta as any).env?.VITE_APP_BASE_URL ??
        window.location.origin);
  const handleOpenApp = () => {
    if (!appBaseUrl) return;
    const opened = window.open(appBaseUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.assign(appBaseUrl);
    }
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
        .select(
          "business_name, monthly_report_enabled, competitive_monitoring_enabled, competitive_monitoring_keyword, competitive_monitoring_radius_km"
        )
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
      setActiveLocationsLoaded(false);
      return;
    }
    setActiveLocationsLoaded(false);
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
        setActiveLocationsLoaded(true);
        return;
      }
      const ids = Array.isArray(data?.active_location_ids)
        ? data.active_location_ids.filter(Boolean)
        : null;
      const allIds = (locationsQuery.data ?? []).map((loc) => loc.id);
      const resolved = ids && ids.length > 0 ? ids : allIds;
      setSelectedActiveIds(resolved);
      setActiveLocationsLoaded(true);
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

  const brandVoiceStatusQuery = useQuery({
    queryKey: ["brand-voice-status", userId],
    queryFn: async () => {
      if (!supabaseClient || !userId) return [] as BrandVoiceStatusRow[];
      const { data, error } = await supabaseClient
        .from("brand_voice")
        .select("id, enabled")
        .eq("user_id", userId)
        .limit(5);
      if (error) throw error;
      return (data ?? []) as BrandVoiceStatusRow[];
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
      setLocationsError("Impossible de sauvegarder les établissements actifs.");
    } else {
      setLocationsError(null);
    }
    setActiveLocationsSaving(false);
  };

  const handleLocationToggle = (locationId: string, checked: boolean) => {
    if (!checked && selectedActiveIds.length <= 1) {
      setLocationsError(
        "Au moins un établissement doit rester actif avec la configuration actuelle."
      );
      return;
    }
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
          : "Impossible de démarrer la connexion Google.";
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
          ? "Synchronisation planifiée."
          : "Synchronisation lancée."
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
      setInviteError("Le prénom est obligatoire.");
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
          "Invitation créée, mais l'email n'a pas été envoyé. Vous pouvez renvoyer.";
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
    setInviteSuccess(successMessage ?? "Invitation envoyée.");
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
          "Invitation renvoyée, mais l'email n'a pas été envoyé."
        );
      } else {
        setInviteSuccess("Invitation renvoyée.");
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
      setToggleError("Impossible de mettre à jour ce membre.");
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
      .upsert({
        user_id: userId,
        business_id: userId,
        business_name: session?.user?.email ?? "Business",
        monthly_report_enabled: nextValue,
        updated_at: new Date().toISOString()
      }, { onConflict: "business_id" });
    if (error) {
      queryClient.setQueryData(["business-settings", userId], (old) => ({
        ...(old as BusinessSettingsRow | null),
        monthly_report_enabled: previous
      }));
      setCompanyError("Impossible de sauvegarder le paramètre.");
    }
    setUpdatingCompany(false);
  };

  const teamMembers = teamMembersQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const googleConnected = Boolean(googleConnectionQuery.data);
  const hasBrandVoice = (brandVoiceStatusQuery.data ?? []).length > 0;
  const enabledBrandVoice = (brandVoiceStatusQuery.data ?? []).some(
    (row) => row.enabled !== false
  );
  const configuredSignals = [
    googleConnected,
    locations.length > 0,
    teamMembers.length > 0,
    hasBrandVoice,
    monthlyEnabled
  ];
  const configurationScore = Math.round(
    (configuredSignals.filter(Boolean).length / configuredSignals.length) * 100
  );

  const tabContent = (() => {
    if (activeTab === "team") {
      return (
        <div className="space-y-4 md:space-y-6">
          <section className={panelClass}>
            <SectionHeader
              title="Reconnaissance client"
              description="Consultez le podium, les mentions et l'employé du mois depuis la page Équipe."
              status="Connecté à l'équipe"
              statusVariant="success"
            />
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="max-w-2xl text-sm leading-6 text-slate-500">
                Les données collaborateurs restent synchronisées avec les
                classements et les rapports mensuels.
              </p>
              <Button
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                onClick={() => navigate("/team")}
              >
                Voir le classement
              </Button>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:gap-6">
          <Card className={panelClass}>
            <SectionHeader
              title="Collaborateurs actifs"
              description="Le rapport mensuel est envoyé automatiquement par email aux membres actifs."
              status={`${teamMembers.length} actifs`}
              statusVariant={teamMembers.length > 0 ? "success" : "neutral"}
            />
            <CardContent className={sectionContentClass}>
              <p className="text-xs text-slate-500">
                Le rapport mensuel est envoyé automatiquement par email aux
                membres actifs.
              </p>
              {teamMembersQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                  <p className="font-semibold text-slate-900">Aucun collaborateur actif</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Invitez un membre pour activer les rôles et les rapports partagés.
                  </p>
                </div>
              ) : (
                teamMembers.map((member) => {
                  const name = member.first_name || "Collaborateur";
                  const email = member.email ?? "Non renseigné";
                  const role = roleLabel(member.role);
                  const canToggle = Boolean(member.email && member.email.trim());
                  return (
                    <div
                      key={member.id}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 shadow-sm transition hover:border-slate-300 hover:bg-white sm:p-4 xl:flex-row xl:items-center xl:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white sm:h-12 sm:w-12">
                          {initialsFromName(name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="min-w-0 text-sm font-semibold text-slate-900">
                              {name}
                            </p>
                            {member.receive_monthly_reports && (
                              <Badge variant="success">Rapport mensuel</Badge>
                            )}
                            {!canToggle && (
                              <Badge variant="neutral">
                                Aucun email configuré
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 break-all text-xs leading-5 text-slate-500">
                            {email}
                          </p>
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:flex xl:shrink-0 xl:items-center xl:gap-4">
                        <label
                          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 xl:min-h-0 xl:border-0 xl:bg-transparent xl:px-0 xl:py-0"
                          onClick={() => {
                            if (!canToggle) {
                              setToggleError(
                                "Ajoutez un email à ce collaborateur pour activer l'envoi du rapport."
                              );
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-ink"
                            checked={Boolean(
                              member.receive_monthly_reports && canToggle
                            )}
                            disabled={!canToggle}
                            onChange={(event) =>
                              handleMemberToggle(member, event.target.checked)
                            }
                          />
                          <span>Recevoir le rapport mensuel</span>
                        </label>
                        {!canToggle && (
                          <span className="text-xs leading-5 text-slate-400 sm:col-span-2 xl:col-span-1">
                            Ajoutez un email pour activer.
                          </span>
                        )}
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

          <Card className={panelClass}>
            <SectionHeader
              title="Invitations en attente"
              description="Relancez les invitations envoyées qui n'ont pas encore été acceptées."
              status={`${(invitationsQuery.data ?? []).length} en attente`}
            />
            <CardContent className={sectionContentClass}>
              {invitationsQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (invitationsQuery.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-500">
                  Aucune invitation en attente.
                </div>
              ) : (
                (invitationsQuery.data ?? []).map((invite) => (
                  <div
                    key={invite.id}
                    className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 text-sm transition hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium text-slate-900">
                        {invite.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        {roleLabel(invite.role ?? "editor")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                      onClick={() => handleResend(invite)}
                    >
                      Renvoyer
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <SectionHeader
              title="Inviter un membre"
              description="Ajoutez un collaborateur et définissez ses droits dès l'invitation."
              status="Action"
            />
            <CardContent className={sectionContentClass}>
              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Prénom
                  <input
                    className={fieldClass}
                    value={inviteFirstName}
                    onChange={(event) => setInviteFirstName(event.target.value)}
                    placeholder="Prénom"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Email professionnel
                  <input
                    type="email"
                    className={fieldClass}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="prenom.nom@entreprise.com"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Rôle
                  <select
                    className={fieldClass}
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                  >
                    <option value="editor">Éditeur</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-700">
                  <span className="pr-3 leading-5">
                    Recevoir les rapports mensuels
                  </span>
                  <input
                    type="checkbox"
                    checked={inviteMonthly}
                    onChange={(event) => setInviteMonthly(event.target.checked)}
                    className="h-4 w-4 accent-ink"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Le rapport mensuel est envoyé automatiquement par email aux
                  membres actifs.
                </p>
              </div>

              {inviteError && (
                <p className="text-xs text-rose-600">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="text-xs text-emerald-600">{inviteSuccess}</p>
              )}

              <Button
                className="min-h-11 w-full sm:w-auto"
                onClick={handleInvite}
                disabled={inviteSending}
              >
                Envoyer l’invitation
              </Button>
            </CardContent>
          </Card>
          </div>
        </div>
      );
    }

    if (activeTab === "company") {
      return (
        <div className="space-y-6">
          <Card className={panelClass}>
            <SectionHeader
              title="Entreprise"
              description="Pilotez l'envoi global des rapports et les informations utilisées dans les documents."
              status={monthlyEnabled ? "Rapports activés" : "Rapports désactivés"}
              statusVariant={monthlyEnabled ? "success" : "neutral"}
            />
            <CardContent className={sectionContentClass}>
              {businessSettingsQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 transition hover:bg-white">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Activer l’envoi du rapport mensuel
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
          description: "Synchronisation des avis et réponses en temps réel.",
          status: googleActive ? "active" : "inactive",
          actionLabel: googleActive ? null : "Connecter",
          accent: "bg-emerald-50 border-emerald-200",
          Icon: GoogleLogo
        },
        {
          id: "facebook",
          name: "Facebook Pages",
          type: "Source d'avis",
          description: "Connecteur backend non activé pour ce compte.",
          status: "unavailable",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: FacebookLogo
        },
        {
          id: "instagram",
          name: "Instagram",
          type: "Canal social",
          description: "Connecteur backend non activé pour ce compte.",
          status: "unavailable",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: InstagramLogo
        },
        {
          id: "tripadvisor",
          name: "TripAdvisor",
          type: "Source d'avis",
          description: "Connecteur backend non activé pour ce compte.",
          status: "unavailable",
          actionLabel: null,
          accent: "bg-slate-50 border-slate-200",
          Icon: TripAdvisorLogo
        }
      ] as const;

      return (
        <section className={panelClass}>
          <SectionHeader
            title="Connexions"
            description="Centralisez vos sources d'avis et canaux sociaux."
            status={googleActive ? "Google actif" : "Connexion requise"}
            statusVariant={googleActive ? "success" : "warning"}
          />

          <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
            {integrations.map((integration) => {
              const isActive = integration.status === "active";
              const isUnavailable = integration.status === "unavailable";
              return (
                <div
                  key={integration.id}
                  className={cn(
                    "rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]",
                    isActive ? integration.accent : "bg-white border-slate-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
                        <integration.Icon />
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
                    ) : isUnavailable ? (
                      <Badge variant="neutral">NON ACTIVÉ</Badge>
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
        </section>
      );
    }

    if (activeTab === "ai-identity") {
      return <BrandVoice session={session} />;
    }

    if (activeTab === "locations") {
      const connected = Boolean(googleConnectionQuery.data);
      const locations = locationsQuery.data ?? [];
      const activeCount = activeLocationsLoaded
        ? selectedActiveIds.length
        : locations.length;
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
          <section className={panelClass}>
            <SectionHeader
              title="Pilotage business"
              description="Suivez la santé des lieux connectés et des avis à traiter."
              status={connected ? "Google connecté" : "Connexion requise"}
              statusVariant={connected ? "success" : "warning"}
            />

            <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-3">
            <Card className="border-slate-200/80 bg-slate-50/60 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Lieux actifs</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-3xl font-semibold text-slate-900">
                  {locationsQuery.isLoading || !activeLocationsLoaded ? "…" : activeCount}
                </p>
                <p className="text-xs text-slate-500">
                  Établissements suivis dans le dashboard.
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-slate-50/60 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Dernière synchro</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-3xl font-semibold text-slate-900">
                  {lastSyncQuery.isLoading ? "…" : formatRelativeTime(lastSync)}
                </p>
                <p className="text-xs text-slate-500">
                  Dernière activité connue côté Google.
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-slate-50/60 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Avis à traiter</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-3xl font-semibold text-slate-900">
                  {reviewsNeedingReplyQuery.isLoading ? "…" : totalNeedsReply}
                </p>
                <p className="text-xs text-slate-500">
                  Avis nécessitant une réponse.
                </p>
              </CardContent>
            </Card>
            </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              {connected ? (
                <Badge variant="success">Google connecté</Badge>
              ) : (
                <Badge variant="warning">Connexion requise</Badge>
              )}
              <p className="text-sm text-slate-600">
                Synchronisez vos avis et mettez à jour vos fiches en temps réel.
              </p>
            </div>
            <Button
              onClick={() => {
                if (connected) {
                  void handleSyncLocations();
                } else {
                  void handleConnectGoogle();
                }
              }}
              disabled={syncingLocations}
            >
              {syncingLocations
                ? "Synchronisation..."
                : connected
                  ? "Synchroniser maintenant"
                  : "Connecter Google"}
            </Button>
          </div>
          </section>

          <Card className={panelClass}>
            <SectionHeader
              title="Connexion Google Business Profile"
              description="Autorisation Google officielle pour accéder aux avis, répondre et publier."
              status={connected ? "Connecté" : "À connecter"}
              statusVariant={connected ? "success" : "warning"}
            />
            <CardContent className={sectionContentClass}>
              <p className="text-sm text-slate-600">
                Synchronisez vos avis et mettez à jour vos fiches en temps réel.
              </p>
              {googleConnectionQuery.isLoading ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {connected ? (
                    <Badge variant="success">Google connecté</Badge>
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
                        : "Synchroniser mes établissements & avis"}
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Autorisation requise pour accéder aux avis, répondre et publier.
              </p>
              {googleError && (
                <p className="text-xs text-rose-600">{googleError}</p>
              )}
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <SectionHeader
              title="Vos établissements"
              description="Lieux connectés, statut d'activation et accès rapide à la boîte de réception."
              status={`${locations.length} lieux`}
              statusVariant={locations.length > 0 ? "success" : "neutral"}
            />
            <CardContent className={sectionContentClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Lieux connectés et statut d’activation.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/sync-status")}
                >
                  Voir le statut de synchronisation
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
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                  <p className="font-semibold text-slate-900">Aucun établissement importé</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Cliquez sur “Importer depuis Google” pour démarrer.
                  </p>
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
                      <Card key={location.id} className="border-slate-200/80 bg-slate-50/50 shadow-sm transition hover:bg-white hover:shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
                        <CardContent className="space-y-4 p-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {location.location_title ??
                                  location.location_resource_name}
                              </p>
                              {needsReplyCount > 0 && (
                                <Badge variant="warning">
                                  {needsReplyCount} avis à traiter
                                </Badge>
                              )}
                            </div>
                            {address && (
                              <p className="text-xs text-slate-500">{address}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Dernière synchro : {lastSyncLabel}</span>
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
                                disabled={
                                  !activeLocationsLoaded ||
                                  activeLocationsSaving ||
                                  (activeLocationsLoaded &&
                                    isActive &&
                                    selectedActiveIds.length <= 1)
                                }
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
                              Ouvrir la boîte de réception
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              {activeLocationsLoaded && locations.length > 0 && activeCount === 0 && (
                <p className="text-xs text-amber-600">
                  Aucun lieu actif. Activez au moins un établissement pour
                  recevoir les alertes et rapports.
                </p>
              )}
              {activeLocationsLoaded && locations.length > 0 && activeCount === 1 && (
                <p className="text-xs text-slate-500">
                  Un établissement doit rester actif : l'état zéro actif n'est
                  pas pris en charge par la configuration actuelle.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <SectionHeader
              title="Actions rapides"
              description="Lancez les actions opérationnelles liées à Google et aux synchronisations."
              status="Actions"
            />
            <CardContent className="flex flex-wrap gap-3 px-4 py-4 sm:px-6">
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
                Voir le statut de synchronisation
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "mobile") {
      const statusLabel =
        pwaInstall.installStatus === "installed"
          ? "Installée"
          : pwaInstall.installStatus === "available"
            ? "Disponible"
            : "Non disponible sur ce navigateur";
      const statusVariant =
        pwaInstall.installStatus === "installed"
          ? "success"
          : pwaInstall.installStatus === "available"
            ? "warning"
            : "neutral";
      const statusDescription =
        pwaInstall.installStatus === "installed"
          ? "EGIA est lancée en mode application sur cet appareil."
          : pwaInstall.installStatus === "available"
            ? pwaInstall.isDismissed
              ? "La proposition d’installation est masquée temporairement."
              : "Vous pouvez ajouter EGIA à l’écran d’accueil de cet appareil."
            : "Utilisez Safari sur iPhone ou Chrome sur Android pour installer EGIA.";

      return (
        <div className="space-y-4 sm:space-y-6">
          <InstallPwaPrompt />

          <Card className={panelClass}>
            <SectionHeader
              title="Application mobile"
              description="Accédez à EGIA en plein écran depuis votre écran d'accueil, sans passer par une boutique d'applications."
              status={statusLabel}
              statusVariant={statusVariant}
            />
            <CardContent className="space-y-3 px-4 pb-4 text-sm text-slate-600 sm:space-y-4 sm:px-6 sm:pb-6">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink">
                  <Smartphone size={18} />
                </span>
                <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Statut
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {statusDescription}
                </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-slate-600">
                Lancez EGIA depuis votre écran d’accueil pour une expérience
                pleine page.
              </p>
              <Button className="min-h-11 sm:min-h-0" variant="outline" size="sm" onClick={handleOpenApp}>
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
  })();

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/70 px-4 py-5 sm:px-6 lg:px-7">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                <Settings2 className="h-3.5 w-3.5" />
                Centre de contrôle
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Paramètres EGIA
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Connexions, établissements, équipe, identité IA et informations
                d’entreprise au même endroit.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[420px]">
              <MetricTile
                label="Configuration"
                value={`${configurationScore}%`}
                detail="Signaux activés"
              />
              <MetricTile
                label="Google"
                value={googleConnectionQuery.isLoading ? "…" : googleConnected ? "Actif" : "À connecter"}
                detail="Business Profile"
              />
              <MetricTile
                label="Équipe"
                value={teamMembersQuery.isLoading ? "…" : teamMembers.length}
                detail="Membres actifs"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-7">
          {[
            {
              label: "Établissements",
              value: locationsQuery.isLoading ? "…" : locations.length,
              active: locations.length > 0
            },
            {
              label: "Identité IA",
              value: brandVoiceStatusQuery.isLoading
                ? "…"
                : enabledBrandVoice
                  ? "Active"
                  : hasBrandVoice
                    ? "Désactivée"
                    : "Non définie",
              active: enabledBrandVoice
            },
            {
              label: "Rapports",
              value: businessSettingsQuery.isLoading
                ? "…"
                : monthlyEnabled
                  ? "Activés"
                  : "Désactivés",
              active: monthlyEnabled
            },
            {
              label: "Invitations",
              value: invitationsQuery.isLoading
                ? "…"
                : (invitationsQuery.data ?? []).length,
              active: (invitationsQuery.data ?? []).length > 0
            },
            {
              label: "Alertes",
              value: "Préférences non connectées",
              active: false
            }
          ].map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {item.value}
                </p>
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  item.active ? "bg-emerald-500" : "bg-slate-300"
                )}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div
          className="flex min-w-max gap-2 rounded-[1.35rem] border border-slate-200/80 bg-white/85 p-1.5 shadow-sm backdrop-blur sm:min-w-0 sm:flex-wrap"
          role="tablist"
          aria-label="Sections des paramètres"
        >
          {tabs.map((tab) => {
            const Icon = tabIcons[tab.id];
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 sm:h-11 sm:px-4",
                  selected
                    ? "bg-ink text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-transform duration-200 group-hover:scale-105",
                    selected ? "text-white" : "text-slate-400"
                  )}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-500 shadow-sm">
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
