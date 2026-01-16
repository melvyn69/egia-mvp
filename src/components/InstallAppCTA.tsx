import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "../lib/utils";

type InstallAppCTAProps = {
  onIosFallback: () => void;
  className?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const InstallAppCTA = ({ onIosFallback, className }: InstallAppCTAProps) => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const isIosSafari = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    return isIos && isSafari;
  }, []);

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

  if (!deferredPrompt && !isIosSafari) {
    return null;
  }

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isIosSafari) {
      onIosFallback();
    }
  };

  return (
    <div className={cn("px-3 pb-4", className)}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-white shadow-lg transition hover:bg-ink/90"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Download size={18} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Installer l’app</span>
          <span className="text-xs text-white/70">Sur votre mobile</span>
        </span>
      </button>
    </div>
  );
};

export { InstallAppCTA };

// Manual test plan:
// 1) Chrome desktop incognito: CTA visible if installable, prompt appears on click.
// 2) Android Chrome: same behavior as desktop.
// 3) iPhone Safari: CTA visible, click opens /settings?tab=mobile via fallback.
// 4) Installed PWA: CTA hidden.
