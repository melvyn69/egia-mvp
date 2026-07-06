import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Copy, Gift, Sparkles, WalletCards } from "lucide-react";
import { useParams } from "react-router-dom";
import { LoyaltyQrCode } from "../components/loyalty/LoyaltyQrCode";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import {
  getAppleWalletPassUrl,
  getAppleWalletStatus,
  getPublicLoyaltyProgram,
  joinLoyaltyProgram,
  type JoinLoyaltyResult
} from "../services/loyalty";

const getJoinError = (error: unknown) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  if (message.includes("valid_email_required")) {
    return "Email invalide.";
  }
  if (message.includes("first_name_required")) {
    return "Prénom requis.";
  }
  if (message.includes("loyalty_program_not_found")) {
    return "Programme fidélité indisponible.";
  }
  return "Inscription impossible.";
};

const LoyaltyJoin = () => {
  const { publicToken } = useParams();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [member, setMember] = useState<JoinLoyaltyResult | null>(null);

  const programQuery = useQuery({
    queryKey: ["public-loyalty-program", publicToken],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "LoyaltyJoin",
        queryKey,
        queryFn: () =>
          publicToken ? getPublicLoyaltyProgram(publicToken) : Promise.resolve(null),
        getRowCount: (data) => (data ? 1 : 0)
      }),
    enabled: Boolean(publicToken),
    placeholderData: (prev) => prev,
    retry: false
  });

  const appleWalletQuery = useQuery({
    queryKey: ["apple-wallet-status", member?.wallet_public_token ?? null],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "LoyaltyJoin",
        queryKey,
        queryFn: () => getAppleWalletStatus(member?.wallet_public_token)
      }),
    enabled: Boolean(member?.wallet_public_token),
    retry: false
  });

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!publicToken) return;
    setJoining(true);
    setJoinError(null);
    try {
      const nextMember = await joinLoyaltyProgram({
        publicToken,
        firstName,
        email
      });
      setMember(nextMember);
      setCopied(false);
    } catch (error) {
      console.error("join loyalty error:", error);
      setJoinError(getJoinError(error));
    } finally {
      setJoining(false);
    }
  };

  const handleCopyMemberCode = async () => {
    if (!member?.member_code) return;
    if (!navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(member.member_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleAddToAppleWallet = () => {
    if (!member?.wallet_public_token) return;
    window.location.href = getAppleWalletPassUrl(member.wallet_public_token);
  };

  const program = programQuery.data;
  const programFirstLoad = programQuery.isLoading && !programQuery.data;
  const programRefreshing = programQuery.isFetching && Boolean(programQuery.data);
  const appleWalletConfigured = Boolean(appleWalletQuery.data?.configured);
  const appleWalletLoading = Boolean(
    member?.wallet_public_token &&
      appleWalletQuery.isLoading &&
      !appleWalletQuery.data
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand via-white to-clay px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              EGIA
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Programme fidélité proposé après votre retour
            </h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white shadow-lg">
            <Sparkles size={18} />
          </div>
        </div>

        <Card>
          <CardHeader>
            {programFirstLoad ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : program ? (
              <>
                <div className="flex items-center gap-2">
                  <CardTitle>{program.program_name}</CardTitle>
                  <Badge variant="success">Actif</Badge>
                </div>
                <p className="text-sm text-slate-500">
                  {program.location_name}
                </p>
                {programRefreshing && (
                  <p className="text-xs font-medium text-slate-400">
                    Actualisation...
                  </p>
                )}
              </>
            ) : (
              <CardTitle>Programme indisponible</CardTitle>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {programFirstLoad ? (
              <Skeleton className="h-44 w-full" />
            ) : !program ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Le programme fidélité n’est pas disponible.
              </div>
            ) : member ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle size={21} />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-emerald-950">
                    Carte fidélité créée
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Présentez ce QR code ou ce code lors de votre prochaine
                    visite.
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
                    onClick={handleCopyMemberCode}
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
                        {member.reward_threshold_points} points débloquent:{" "}
                        {member.reward_label}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                  Vos points sont liés à vos visites. Aucune récompense n’est
                  liée à la note donnée.
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Button
                    type="button"
                    size="lg"
                    variant={appleWalletConfigured ? "default" : "outline"}
                    className="w-full"
                    onClick={handleAddToAppleWallet}
                    disabled={!appleWalletConfigured || appleWalletLoading}
                  >
                    <WalletCards size={18} />
                    {appleWalletLoading
                      ? "Vérification Apple Wallet..."
                      : "Ajouter à Apple Wallet"}
                  </Button>
                  {!appleWalletConfigured && !appleWalletLoading && (
                    <p className="mt-3 text-center text-sm text-slate-500">
                      Apple Wallet sera bientôt disponible. Votre QR code EGIA
                      reste utilisable dès maintenant.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                        <WalletCards size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          1 visite = {program.points_per_visit} points
                        </p>
                        <p className="text-xs text-slate-500">
                          Vos points sont liés à vos visites.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Simple au comptoir
                      </p>
                      <p className="text-xs text-slate-500">
                        Présentez votre QR ou votre code au commerçant.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <Gift size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Une récompense à débloquer
                      </p>
                      <p className="text-xs text-slate-500">
                        {program.reward_threshold_points} points débloquent:{" "}
                        {program.reward_label}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-medium text-slate-600">
                  Aucune récompense n’est liée à la note donnée.
                </div>

                <form onSubmit={handleJoin} className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Prénom
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                      placeholder="Votre prénom"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                      placeholder="vous@email.com"
                    />
                  </label>

                  {joinError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {joinError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={joining}
                  >
                    {joining ? "Création..." : "Rejoindre"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export { LoyaltyJoin };
