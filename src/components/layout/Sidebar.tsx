import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  FileText,
  LayoutDashboard,
  Link2,
  Mailbox,
  RefreshCw,
  Settings,
  Sparkles,
  Users
} from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { analyticsQueryKey, fetchAnalyticsBundle } from "../../queries/analytics";
import { InstallAppCTA } from "../InstallAppCTA";

const navLinkBase =
  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";

const Sidebar = () => {
  const queryClient = useQueryClient();
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      return;
    }
    let active = true;
    const loadSession = async () => {
      const { data } = await sb.auth.getSession();
      if (active) {
        setHasSession(Boolean(data.session));
      }
    };
    loadSession();
    const { data: subscription } = sb.auth.onAuthStateChange(
      (_event, session) => {
        setHasSession(Boolean(session));
      }
    );
    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const prefetchAnalytics = async () => {
    if (!supabase) {
      return;
    }
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user?.id || !session.access_token) {
      return;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const preset = "this_month";
    const presetKey = preset;
    const queryKey = analyticsQueryKey({
      userId: session.user.id,
      locationId: "all",
      presetKey,
      tz
    });
    void queryClient.prefetchQuery({
      queryKey,
      queryFn: () =>
        fetchAnalyticsBundle({
          accessToken: session.access_token,
          locationId: "all",
          preset,
          tz,
          granularity: "auto"
        }),
      staleTime: 5 * 60 * 1000
    });
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col justify-between border-r border-slate-200 bg-white/80 px-4 py-6 shadow-soft backdrop-blur-lg lg:flex">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white shadow-lg">
            <Building2 size={20} />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              EGIA
            </p>
            <p className="text-lg font-semibold text-slate-900">Business Suite</p>
          </div>
        </div>

      <nav className="space-y-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>
        <NavLink
          to="/connect"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Link2 size={18} />
          Connexion Google
        </NavLink>
        <NavLink
          to="/analytics"
          onMouseEnter={prefetchAnalytics}
          onFocus={prefetchAnalytics}
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <BarChart3 size={18} />
          Analytics
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <FileText size={18} />
          Rapports
        </NavLink>
        {hasSession && (
          <NavLink
            to="/team"
            className={({ isActive }) =>
              cn(
                navLinkBase,
                isActive
                  ? "bg-ink text-white shadow"
                  : "text-slate-600 hover:bg-slate-100"
              )
            }
          >
            <Users size={18} />
            Équipe
          </NavLink>
        )}
        <NavLink
          to="/inbox"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Mailbox size={18} />
          Boîte de réception
        </NavLink>
        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Bell size={18} />
          Alertes
        </NavLink>
        <NavLink
          to="/automation"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Sparkles size={18} />
          Automatisations
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Settings size={18} />
          Parametres
        </NavLink>
        <NavLink
          to="/settings/brand-voice"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Settings size={18} />
          Brand Voice
        </NavLink>
        <NavLink
          to="/settings/test-lab"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Settings size={18} />
          Test Lab
        </NavLink>
        <NavLink
          to="/sync-status"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <RefreshCw size={18} />
          Sync status
        </NavLink>
      </nav>
    </div>

    <div className="mt-auto space-y-4">
      <div className="px-3 pb-4">
        <InstallAppCTA
          onFallback={() => navigate("/settings?tab=mobile")}
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#f7f3ec] via-white to-[#f3efe7] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Status
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">
          Suivi des avis et des performances
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Derniere mise a jour: aujourd'hui
        </p>
      </div>
    </div>
    </aside>
  );
};

export { Sidebar };
