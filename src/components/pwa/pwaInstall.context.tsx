/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext } from "react";
import type { PlatformType } from "./pwaInstall.utils";

type InstallResult = "prompted" | "unavailable" | "installed";

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

const usePWAInstall = () => {
  const ctx = useContext(PWAInstallContext);
  if (!ctx) {
    throw new Error("usePWAInstall must be used within PWAInstallProvider");
  }
  return ctx;
};

export {
  PWAInstallContext,
  usePWAInstall,
  type BeforeInstallPromptEvent,
  type PWAInstallContextValue
};
