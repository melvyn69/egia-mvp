import { Download } from "lucide-react";
import { cn } from "../lib/utils";
import { usePwaInstall } from "../hooks/usePwaInstall";

type InstallAppCTAProps = {
  onFallback: () => void;
  className?: string;
  hideManualInstall?: boolean;
};

const InstallAppCTA = ({
  onFallback,
  className,
  hideManualInstall = false
}: InstallAppCTAProps) => {
  const { canInstall, isDismissed, isInstalled, install, platform } =
    usePwaInstall();

  if (isInstalled || isDismissed || !canInstall || (hideManualInstall && platform === "ios")) {
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
        "flex w-full min-h-11 items-center gap-3 rounded-2xl bg-ink px-3 py-2.5 text-left text-white shadow-lg transition hover:bg-ink/90",
        className
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
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
