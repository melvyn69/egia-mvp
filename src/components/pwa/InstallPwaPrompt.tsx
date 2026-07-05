import { useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "../ui/button";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import { cn } from "../../lib/utils";

type InstallPwaPromptProps = {
  className?: string;
};

const InstallPwaPrompt = ({ className }: InstallPwaPromptProps) => {
  const {
    canInstall,
    dismissPrompt,
    install,
    isDismissed,
    isInstalled,
    platform
  } = usePwaInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIosInstructionHighlighted, setIsIosInstructionHighlighted] =
    useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  if (isInstalled || isDismissed || !canInstall) {
    return null;
  }

  const isIos = platform === "ios";

  const handleInstall = async () => {
    if (isIos) {
      setIsIosInstructionHighlighted(true);
      return;
    }

    setIsInstalling(true);
    const result = await install();
    setIsInstalling(false);

    if (result === "unavailable") {
      setInstallMessage("Installation non disponible sur ce navigateur.");
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-card",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
            <Download size={18} />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">
              Installer EGIA sur votre téléphone
            </h3>
            <p className="max-w-xl text-sm text-slate-600">
              Accédez plus vite à vos avis, réponses IA et reconnaissance équipe.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={handleInstall} disabled={isInstalling}>
            {isInstalling ? "Installation..." : "Installer"}
          </Button>
          <button
            type="button"
            onClick={dismissPrompt}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            aria-label="Masquer la proposition d’installation"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {isIos && (
        <div
          className={cn(
            "mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition",
            isIosInstructionHighlighted
              ? "border-ink/30 bg-clay text-slate-900"
              : "border-slate-200 bg-sand text-slate-700"
          )}
        >
          <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          <p>Ouvrez le menu Partager puis Ajouter à l’écran d’accueil</p>
        </div>
      )}

      {installMessage && !isIos && (
        <p className="mt-3 text-xs text-slate-500">{installMessage}</p>
      )}
    </div>
  );
};

export { InstallPwaPrompt };
