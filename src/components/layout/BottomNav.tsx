import { NavLink } from "react-router-dom";
import {
    Activity,
    Home,
    Mailbox,
    Settings,
    Sparkles
} from "lucide-react";
import { cn } from "../../lib/utils";

export const BottomNav = () => {
    const navItems = [
        { to: "/", icon: Home, label: "Home", end: true },
        { to: "/inbox", icon: Mailbox, label: "Inbox" },
        { to: "/ai-job-health", icon: Activity, label: "Jobs" },
        { to: "/automation", icon: Sparkles, label: "Auto" },
        { to: "/settings", icon: Settings, label: "Config" },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-200 bg-white/95 px-2 pb-safe backdrop-blur-lg md:hidden">
            {navItems.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                        cn(
                            "flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1 transition-colors",
                            isActive ? "text-ink" : "text-slate-400 hover:text-slate-600"
                        )
                    }
                >
                    {({ isActive }) => (
                        <>
                            <Icon
                                size={22}
                                strokeWidth={isActive ? 2.5 : 2}
                                className={cn("transition-transform", isActive && "scale-110")}
                            />
                            <span className="text-[10px] font-medium">{label}</span>
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
};
