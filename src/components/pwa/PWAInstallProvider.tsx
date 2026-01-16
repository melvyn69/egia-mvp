import { createContext, useContext, useEffect, useMemo, useState } from "react";

type InstallResult = "prompted" | "unavailable" | "installed";

type PlatformType = "ios" | "android" | "desktop";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PWAInstallContextValue = {
  isInstalled: boolean;
  isInstallable: boolean;
  platform: PlatformType;
  install: () => Promise<InstallResult>;
};

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

const detectPlatform = (): PlatformType => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
};

const PWAInstallProvider = ({ children }: { children: React.ReactNode }) => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const platform = useMemo(() => detectPlatform(), []);

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
      if (import.meta.env.DEV) {
        console.info("[pwa] beforeinstallprompt captured");
      }
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

  const install = async (): Promise<InstallResult> => {
    if (isInstalled) return "installed";
    if (import.meta.env.DEV) {
      console.info("[pwa] install() called", { hasPrompt: Boolean(deferredPrompt) });
    }
    if (!deferredPrompt) {
      return "unavailable";
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return "prompted";
  };

  const value: PWAInstallContextValue = {
    isInstalled,
    isInstallable: Boolean(deferredPrompt),
    platform,
    install
  };

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
};

const usePWAInstall = () => {
  const ctx = useContext(PWAInstallContext);
  if (!ctx) {
    throw new Error("usePWAInstall must be used within PWAInstallProvider");
  }
  return ctx;
};

export { PWAInstallProvider, usePWAInstall };
