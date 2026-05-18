import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Mailbox,
  Radar,
  Settings
} from "lucide-react";
import { cn } from "../../lib/utils";

const items = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/inbox", label: "Boîte", Icon: Mailbox, end: false },
  { to: "/analytics", label: "Stats", Icon: BarChart3, end: false },
  { to: "/alerts", label: "Alertes", Icon: Bell, end: false },
  { to: "/competitors", label: "Veille", Icon: Radar, end: false },
  { to: "/settings", label: "Paramètres", Icon: Settings, end: false }
] as const;

const MobileBottomNav = () => (
  <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden">
    <div className="mx-auto grid h-14 max-w-lg grid-cols-6 items-center gap-1">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              "flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none transition",
              isActive
                ? "bg-ink text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            )
          }
        >
          <Icon size={17} />
          <span className="w-full truncate text-center">{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
);

export { MobileBottomNav };
