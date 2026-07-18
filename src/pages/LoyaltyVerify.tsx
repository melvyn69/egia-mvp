import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Copy, Gift, Sparkles } from "lucide-react";
import { AppleWalletCta } from "../components/loyalty/AppleWalletCta";
import { LoyaltyQrCode } from "../components/loyalty/LoyaltyQrCode";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  getAppleWalletPassUrl,
  getPublicCapabilities,
  verifyLoyaltyEnrollment,
  type JoinLoyaltyResult
} from "../services/loyalty";

type VerificationState =
  | { status: "loading"; member: null }
  | { status: "error"; member: null }
  | { status: "success"; member: JoinLoyaltyResult };

const readAndClearToken = () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token")?.trim() ?? "";
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
};

const LoyaltyVerify = () => {
  const started = useRef(false);
  const [verification, setVerification] = useState<VerificationState>({
    status: "loading",
    member: null
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = readAndClearToken();
    if (!token) {
      void Promise.resolve().then(() =>
        setVerification({ status: "error", member: null })
      );
      return;
    }
    void verifyLoyaltyEnrollment(token)
      .then((member) => setVerification({ status: "success", member }))
      .catch(() => setVerification({ status: "error", member: null }));
  }, []);

  const member =
    verification.status === "success" ? verification.member : null;
  const capabilitiesQuery = useQuery({
    queryKey: ["public-capabilities"],
    queryFn: () => getPublicCapabilities(),
    enabled: Boolean(member?.wallet_public_token),
    retry: false
  });

  const handleCopy = async () => {
    if (!member?.member_code || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(member.member_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleWallet = () => {
    if (member?.wallet_public_token) {
      window.location.href = getAppleWalletPassUrl(member.wallet_public_token);
    }
  };

  const appleWalletEnabled =
    capabilitiesQuery.data?.appleWalletEnabled === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand via-white to-clay px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              EGIA
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Validation fidélité
            </h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white shadow-lg">
            <Sparkles size={18} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {verification.status === "loading"
                ? "Validation en cours"
                : verification.status === "error"
                  ? "Lien invalide ou expiré"
                  : member?.program_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {verification.status === "loading" && (
              <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                Vérification de votre lien personnel…
              </p>
            )}
            {verification.status === "error" && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                Ce lien a déjà été utilisé ou a expiré. Reprenez le parcours
                depuis le lien du programme fidélité pour recevoir un nouveau
                message.
              </p>
            )}
            {member && (
              <>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle size={21} />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-emerald-950">
                    E-mail confirmé
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Votre carte fidélité est maintenant disponible.
                  </p>
                </div>

                <div className="mx-auto h-64 w-64 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <LoyaltyQrCode
                    value={member.member_code}
                    label={`Carte fidélité ${member.member_code}`}
                    className="h-full w-full"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Code membre
                  </p>
                  <p className="mt-2 break-all text-2xl font-semibold text-slate-900">
                    {member.member_code}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={handleCopy}
                  >
                    <Copy size={15} />
                    {copied ? "Code copié" : "Copier mon code"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Points
                    </p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {member.points_balance}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Visites
                    </p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {member.visits_count}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <Gift size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Votre prochaine récompense
                      </p>
                      <p className="text-xs text-slate-500">
                        {member.reward_threshold_points} points débloquent :{" "}
                        {member.reward_label}
                      </p>
                    </div>
                  </div>
                </div>

                <AppleWalletCta
                  enabled={appleWalletEnabled}
                  onAdd={handleWallet}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export { LoyaltyVerify };
