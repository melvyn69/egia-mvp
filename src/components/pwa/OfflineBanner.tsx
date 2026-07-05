import { Wifi, WifiOff, X } from "lucide-react";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

const OfflineBanner = () => {
  const { dismissOnlineToast, isOnline, showOnlineToast } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div
        className="fixed bottom-4 left-4 z-50 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-card"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">EGIA est hors ligne</p>
            <p className="mt-0.5 text-amber-800">
              Reconnectez-vous pour charger vos dernières données.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!showOnlineToast) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-50 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-card"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Wifi className="h-4 w-4" />
        <span className="font-medium">Connexion rétablie</span>
        <button
          type="button"
          onClick={dismissOnlineToast}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
          aria-label="Masquer le message de reconnexion"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export { OfflineBanner };
