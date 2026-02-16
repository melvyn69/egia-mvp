import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";

type GoogleConnectionBadgeProps = {
  status: GoogleConnectionStatus;
  isLoading?: boolean;
  onConnect?: () => void;
  onReconnect?: () => void;
};

const GoogleConnectionBadge = ({
  status,
  isLoading = false,
  onConnect,
  onReconnect
}: GoogleConnectionBadgeProps) => {
  const resolvedStatus: GoogleConnectionStatus = isLoading ? "unknown" : status;

  const label =
    resolvedStatus === "connected"
      ? "Google connecté"
      : resolvedStatus === "reauth_required"
        ? "Reconnexion requise"
        : resolvedStatus === "disconnected"
          ? "Google non connecté"
          : "Statut Google inconnu";

  const variant =
    resolvedStatus === "connected"
      ? "success"
      : resolvedStatus === "reauth_required"
        ? "warning"
        : "neutral";

  const renderButton = () => {
    if (resolvedStatus === "connected") {
      if (!onReconnect) {
        return null;
      }
      return (
        <Button variant="outline" size="sm" onClick={onReconnect}>
          Reconnecter
        </Button>
      );
    }

    if ((resolvedStatus === "reauth_required" || resolvedStatus === "disconnected") && onConnect) {
      return (
        <Button size="sm" onClick={onConnect}>
          {resolvedStatus === "reauth_required"
            ? "Relancer la connexion Google"
            : "Connecter Google"}
        </Button>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={variant}>{label}</Badge>
      {renderButton()}
    </div>
  );
};

export { GoogleConnectionBadge };
