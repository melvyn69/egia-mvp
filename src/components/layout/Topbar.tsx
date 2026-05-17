import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { Bell, Menu, Sparkles } from "lucide-react";
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
  onToggleMenu?: () => void;
  isMenuOpen?: boolean;
};

const Topbar = ({
  title,
  subtitle,
  userEmail,
  session,
  onSignOut,
  onDebugSession,
  onToggleMenu,
  isMenuOpen
}: TopbarProps) => {
  const [unreadCount, setUnreadCount] = useState(0);
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
  useEffect(() => {
    if (!userId) {
      return;
    }

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
  }, [userId]);

  const handleNotificationClick = () => {
    const section = document.getElementById("notifications-section");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white/70 px-4 py-4 backdrop-blur md:px-6 md:py-5 lg:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onToggleMenu && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-0.5 shrink-0 rounded-xl lg:hidden"
            onClick={onToggleMenu}
            aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            <Menu size={18} />
          </Button>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
            <Sparkles size={14} />
            EGIA LIVE
          </p>
          <h1 className="truncate text-xl font-semibold text-slate-900 md:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        {userEmail && (
          <div className="hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm sm:flex">
            {brandingQuery.isLoading ? (
              <Skeleton className="h-8 w-8 rounded-lg" />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo entreprise"
                className="pointer-events-none h-8 w-8 select-none rounded-lg object-contain"
              />
            ) : (
              <span className="text-xs font-semibold text-slate-600">
                {logoFallback}
              </span>
            )}
          </div>
        )}
        {userId && (
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
        )}
        {userEmail && (
          <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 md:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-900">{userEmail}</p>
              <p className="text-xs text-slate-500">Compte actif</p>
            </div>
            {onDebugSession && (
              <Button variant="ghost" size="sm" onClick={onDebugSession}>
                Diagnostic
              </Button>
            )}
            {onSignOut && (
              <Button variant="outline" size="sm" onClick={onSignOut}>
                Se déconnecter
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { Topbar };
