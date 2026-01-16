import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import {
  getUnreadNotificationCount,
  NOTIFICATIONS_UPDATED_EVENT
} from "../../lib/notifications";
import { getActiveLegalEntityLogo, pickInitials } from "../../lib/businessBranding";
import { Skeleton } from "../ui/skeleton";

type TopbarProps = {
  title: string;
  subtitle?: string;
  userEmail?: string | null;
  session?: Session | null;
  onSignOut?: () => void;
  onDebugSession?: () => void;
};

const Topbar = ({
  title,
  subtitle,
  userEmail,
  session,
  onSignOut,
  onDebugSession
}: TopbarProps) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const userId = session?.user?.id ?? null;
  const brandingQuery = useQuery({
    queryKey: ["branding", userId],
    queryFn: async () => {
      if (!userId) return null;
      return getActiveLegalEntityLogo(userId);
    },
    enabled: Boolean(userId),
    staleTime: 60_000
  });

  const logoUrl = brandingQuery.data?.logoUrl ?? null;
  const companyName = brandingQuery.data?.companyName ?? null;
  const logoFallback = pickInitials(companyName ?? "EG");
  const handleLogoClick = () => {
    navigate("/settings?tab=company");
  };

  useEffect(() => {
    const updateUnreadCount = () => {
      setUnreadCount(getUnreadNotificationCount());
    };

    updateUnreadCount();

    const handleNotificationsUpdate = () => {
      updateUnreadCount();
    };

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdate);
    window.addEventListener("storage", handleNotificationsUpdate);

    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdate);
      window.removeEventListener("storage", handleNotificationsUpdate);
    };
  }, []);

  const handleNotificationClick = () => {
    const section = document.getElementById("notifications-section");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 bg-white/70 px-6 py-5 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
          <Sparkles size={14} />
          EGIA LIVE
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 lg:flex">
          <Search size={16} />
          Rechercher un lieu
        </div>
        {userEmail && (
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm"
            title="Paramètres entreprise"
          >
            {brandingQuery.isLoading ? (
              <Skeleton className="h-8 w-8 rounded-lg" />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo entreprise"
                className="h-8 w-8 rounded-lg object-contain"
              />
            ) : (
              <span className="text-xs font-semibold text-slate-600">
                {logoFallback}
              </span>
            )}
          </button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="relative rounded-full"
          onClick={handleNotificationClick}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
        {userEmail && (
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-900">{userEmail}</p>
              <p className="text-xs text-slate-500">Compte actif</p>
            </div>
            {onDebugSession && (
              <Button variant="ghost" size="sm" onClick={onDebugSession}>
                Debug session
              </Button>
            )}
            {onSignOut && (
              <Button variant="outline" size="sm" onClick={onSignOut}>
                Se deconnecter
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { Topbar };
