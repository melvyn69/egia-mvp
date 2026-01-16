import { Download } from "lucide-react";
import { cn } from "../lib/utils";
import { usePWAInstall } from "./pwa/PWAInstallProvider";

type InstallAppCTAProps = {
  onFallback: () => void;
  className?: string;
};

const InstallAppCTA = ({ onFallback, className }: InstallAppCTAProps) => {
  const { isInstalled, install, platform } = usePWAInstall();

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (platform === "ios") {
      onFallback();
      return;
    }
    const result = await install();
    if (result === "unavailable") {
      onFallback();
    }
  };

  const subtitle =
    platform === "desktop" ? "Sur votre ordinateur" : "Sur votre mobile";

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
        <span className="text-xs text-white/70">{subtitle}</span>
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
