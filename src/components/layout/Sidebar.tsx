import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mailbox,
  Radar,
  RefreshCw,
  Settings,
  Sparkles,
  Target,
  Trophy,
  Users,
  WalletCards
} from "lucide-react";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { analyticsQueryKey, fetchAnalyticsBundle } from "../../queries/analytics";
import { scrollToRouteTop } from "../../lib/scrollToRouteTop";
import { InstallAppCTA } from "../InstallAppCTA";
import { EgiaLogo } from "../brand/EgiaLogo";

const desktopNavLinkBase =
  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";
const mobileNavLinkBase =
  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition";

const SHOW_AUTOMATION_NAV = false;

type SidebarProps = {
  variant?: "desktop" | "mobile";
  className?: string;
  onNavigate?: () => void;
  showAdminLinks?: boolean;
};

const Sidebar = ({
  variant = "desktop",
  className,
  onNavigate,
  showAdminLinks = false
}: SidebarProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const baseClasses =
    variant === "mobile"
      ? "flex h-full w-[min(19rem,calc(100vw-2rem))] flex-col justify-between overflow-y-auto border-r border-slate-200 bg-white/95 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-soft backdrop-blur-lg print:hidden"
      : "sticky top-0 hidden h-screen w-64 flex-col justify-between border-r border-slate-200 bg-white/80 px-4 py-6 shadow-soft backdrop-blur-lg print:hidden lg:flex";
  const navLinkBase = variant === "mobile" ? mobileNavLinkBase : desktopNavLinkBase;

  return (
    <aside className={cn(baseClasses, className)}>
      <div className={variant === "mobile" ? "space-y-4" : "space-y-6"}>
        <div className="flex items-center gap-3">
          <EgiaLogo variant="icon" size={variant === "mobile" ? "sm" : "md"} />
          <EgiaLogo
            variant="light"
            size={variant === "mobile" ? "sm" : "md"}
            showSuite
            className="min-w-0"
          />
        </div>

      <nav
        className={variant === "mobile" ? "space-y-1.5" : "space-y-2"}
        onClick={() => {
          scrollToRouteTop();
          onNavigate?.();
        }}
      >
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
          to="/coach"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Target size={18} />
          Coach EGIA
        </NavLink>
        <NavLink
          to="/progress"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Trophy size={18} />
          Progression
        </NavLink>
        <NavLink
          to="/loyalty"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <WalletCards size={18} />
          Fidélité
        </NavLink>
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
          to="/competitors"
          className={({ isActive }) =>
            cn(
              navLinkBase,
              isActive
                ? "bg-ink text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            )
          }
        >
          <Radar size={18} />
          Veille concurrentielle
        </NavLink>
        {SHOW_AUTOMATION_NAV && (
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
        )}
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
          Paramètres
        </NavLink>
        {showAdminLinks && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Admin
            </p>
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
              to="/billing"
              className={({ isActive }) =>
                cn(
                  navLinkBase,
                  isActive
                    ? "bg-ink text-white shadow"
                    : "text-slate-600 hover:bg-slate-100"
                )
              }
            >
              <CreditCard size={18} />
              Facturation
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
              Statut sync
            </NavLink>
            <NavLink
              to="/ai-job-health"
              className={({ isActive }) =>
                cn(
                  navLinkBase,
                  isActive
                    ? "bg-ink text-white shadow"
                    : "text-slate-600 hover:bg-slate-100"
                )
              }
            >
              <Activity size={18} />
              Santé IA
            </NavLink>
          </div>
        )}
      </nav>
    </div>

    <div className={variant === "mobile" ? "mt-auto space-y-3" : "mt-auto space-y-4"}>
      <div className={variant === "mobile" ? "px-1 pb-1" : "px-3 pb-4"}>
        <InstallAppCTA
          hideManualInstall={variant === "mobile"}
          onFallback={() => navigate("/settings?tab=mobile")}
        />
      </div>
      <div className={cn(
        "rounded-2xl border border-slate-200 bg-gradient-to-br from-[#f7f3ec] via-white to-[#f3efe7]",
        variant === "mobile" ? "p-3" : "p-4"
      )}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Statut
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">
          Suivi des avis et des performances
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Dernière mise à jour : aujourd’hui
        </p>
      </div>
    </div>
    </aside>
  );
};

export { Sidebar };
