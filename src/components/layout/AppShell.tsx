import type { PropsWithChildren, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

type AppShellProps = PropsWithChildren<{
    topbar?: ReactNode;
}>;

export const AppShell = ({ children, topbar }: AppShellProps) => {
    return (
        <div className="flex min-h-screen bg-sand/30 font-sans text-slate-900">
            {/* Desktop Sidebar */}
            <Sidebar className="hidden md:flex" />

            <div className="flex flex-1 flex-col pb-16 md:pb-0">
                {/* Topbar sticky on desktop, maybe different on mobile? 
            For now, we render what is passed (likely the existing Topbar). 
        */}
                {topbar}

                <main className="flex-1 px-4 py-4 md:px-8 md:py-8">
                    {children}
                </main>
            </div>

            {/* Mobile Bottom Nav */}
            <BottomNav />
        </div>
    );
};
