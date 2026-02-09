import * as React from "react";
import { cn } from "../../lib/utils";
import { X } from "lucide-react";
import { Button } from "./button";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    className?: string;
}

export function Drawer({ isOpen, onClose, children, title, className }: DrawerProps) {
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setVisible(true);
            document.body.style.overflow = "hidden";
        } else {
            const timer = setTimeout(() => setVisible(false), 300);
            document.body.style.overflow = "";
            return () => clearTimeout(timer);
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end sm:justify-center md:justify-end">
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/40 transition-opacity duration-300",
                    isOpen ? "opacity-100" : "opacity-0"
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer Panel */}
            <div
                className={cn(
                    "relative z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out sm:max-w-lg",
                    // Mobile: slide up from bottom? actually standard drawers often slide from right or bottom.
                    // Let's do slide from right for desktop consistency, and maybe bottom for mobile if requested?
                    // The plan asked for "JobDetailDrawer (Mobile) - Slide-up panel".
                    // So let's make it responsive.
                    "md:h-screen md:w-[400px] md:translate-x-0", // Desktop base
                    isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full", // Mobile slide-up, Desktop slide-right
                    "fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl md:relative md:inset-auto md:h-full md:rounded-none",
                    className
                )}
            >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-6 md:py-4">
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
