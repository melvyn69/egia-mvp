type PlatformType = "ios" | "android" | "desktop";

const PWA_INSTALL_DISMISSED_UNTIL_KEY = "egia:pwa-install-dismissed-until";
const PWA_INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

const detectPlatform = (): PlatformType => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  const isIpadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(ua) || isIpadOs) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
};

const isStandaloneMode = () => {
  if (typeof window === "undefined") return false;
  const standaloneDisplay =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return Boolean(standaloneDisplay || iosStandalone);
};

const isIosSafari = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const platform = detectPlatform();
  const excludedIosBrowsers = /crios|fxios|edgios|opios/.test(ua);
  return platform === "ios" && /safari/.test(ua) && !excludedIosBrowsers;
};

const isPwaInstallDismissed = () => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PWA_INSTALL_DISMISSED_UNTIL_KEY);
    if (!raw) return false;
    const dismissedUntil = Number(raw);
    if (!Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now()) {
      window.localStorage.removeItem(PWA_INSTALL_DISMISSED_UNTIL_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const dismissPwaInstallPrompt = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PWA_INSTALL_DISMISSED_UNTIL_KEY,
      String(Date.now() + PWA_INSTALL_DISMISS_MS)
    );
  } catch {
    // Ignore storage failures so install UI never blocks app usage.
  }
};

const clearPwaInstallDismiss = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PWA_INSTALL_DISMISSED_UNTIL_KEY);
  } catch {
    // Ignore storage failures so install UI never blocks app usage.
  }
};

export {
  clearPwaInstallDismiss,
  detectPlatform,
  dismissPwaInstallPrompt,
  isIosSafari,
  isPwaInstallDismissed,
  isStandaloneMode
};
export type { PlatformType };
