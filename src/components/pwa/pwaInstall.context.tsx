/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext } from "react";
import type { PlatformType } from "./pwaInstall.utils";

type InstallResult = "prompted" | "dismissed" | "unavailable" | "installed";
type InstallStatus = "installed" | "available" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PWAInstallContextValue = {
  isInstalled: boolean;
  isInstallable: boolean;
  canInstall: boolean;
  isDismissed: boolean;
  installStatus: InstallStatus;
  platform: PlatformType;
  install: () => Promise<InstallResult>;
  dismissPrompt: () => void;
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
  type InstallResult,
  type InstallStatus,
  type PWAInstallContextValue
};
