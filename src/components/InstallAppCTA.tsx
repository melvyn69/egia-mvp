import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "../lib/utils";

type InstallAppCTAProps = {
  onFallback: () => void;
  className?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const InstallAppCTA = ({ onFallback, className }: InstallAppCTAProps) => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkInstalled = () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true;
      setIsInstalled(Boolean(standalone));
    };
    checkInstalled();

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    onFallback();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-white shadow-lg transition hover:bg-ink/90",
        className
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
        <Download size={18} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Installer l’app</span>
        <span className="text-xs text-white/70">Sur votre mobile</span>
      </span>
    </button>
  );
};

export { InstallAppCTA };

// Manual test plan:
// 1) Chrome desktop incognito: CTA visible if installable, prompt appears on click.
// 2) Android Chrome: same behavior as desktop.
// 3) iPhone Safari: CTA visible, click opens /settings?tab=mobile via fallback.
// 4) Installed PWA: CTA hidden.
