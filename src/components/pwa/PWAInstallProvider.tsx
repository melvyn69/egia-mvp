import { useEffect, useMemo, useState } from "react";
import { detectPlatform } from "./pwaInstall.utils";
import {
  type BeforeInstallPromptEvent,
  type PWAInstallContextValue,
  PWAInstallContext
} from "./pwaInstall.context";

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
        (navigator as { standalone?: boolean }).standalone === true;
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

  const install = async () => {
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

export { PWAInstallProvider };
