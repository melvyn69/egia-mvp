import { WalletCards } from "lucide-react";
import { Button } from "../ui/button";

type AppleWalletCtaProps = {
  enabled: boolean;
  onAdd: () => void;
};

const AppleWalletCta = ({ enabled, onAdd }: AppleWalletCtaProps) => {
  if (!enabled) return null;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4"
      data-testid="apple-wallet-capability"
    >
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onAdd}
      >
        <WalletCards size={18} />
        Ajouter à Apple Wallet
      </Button>
    </div>
  );
};

export { AppleWalletCta };
