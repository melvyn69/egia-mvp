import { useEffect, useMemo, useState } from "react";
import {
  clearPwaInstallDismiss,
  detectPlatform,
  dismissPwaInstallPrompt,
  isIosSafari,
  isPwaInstallDismissed,
  isStandaloneMode
} from "./pwaInstall.utils";
import {
  type BeforeInstallPromptEvent,
  type PWAInstallContextValue,
  PWAInstallContext
} from "./pwaInstall.context";

const PWAInstallProvider = ({ children }: { children: React.ReactNode }) => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());
  const [isDismissed, setIsDismissed] = useState(() =>
    isPwaInstallDismissed()
  );

  const platform = useMemo(() => detectPlatform(), []);
  const supportsManualInstall = platform === "ios" && isIosSafari();

  useEffect(() => {
    if (typeof window === "undefined") return;
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
      setIsDismissed(false);
      clearPwaInstallDismiss();
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
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "dismissed") {
      dismissPwaInstallPrompt();
      setIsDismissed(true);
      return "dismissed";
    }
    return "prompted";
  };

  const dismissPrompt = () => {
    dismissPwaInstallPrompt();
    setIsDismissed(true);
  };

  const canInstall = !isInstalled && (Boolean(deferredPrompt) || supportsManualInstall);
  const installStatus = isInstalled
    ? "installed"
    : canInstall
      ? "available"
      : "unavailable";

  const value: PWAInstallContextValue = {
    isInstalled,
    isInstallable: Boolean(deferredPrompt),
    canInstall,
    isDismissed,
    installStatus,
    platform,
    install,
    dismissPrompt
  };

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
};

export { PWAInstallProvider };
