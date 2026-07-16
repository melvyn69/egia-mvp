import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Gift, MailCheck, Sparkles, WalletCards } from "lucide-react";
import { useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import {
  getPublicLoyaltyProgram,
  requestLoyaltyEnrollment
} from "../services/loyalty";

const getJoinError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message === "INVALID_REQUEST") {
    return "Vérifiez votre prénom et votre adresse e-mail.";
  }
  if (message === "RATE_LIMITED") {
    return "Trop de demandes. Réessayez plus tard.";
  }
  return "Le service est momentanément indisponible.";
};

const LoyaltyJoin = () => {
  const { publicToken } = useParams();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [requestAccepted, setRequestAccepted] = useState(false);

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
    placeholderData: (previous) => previous,
    retry: false
  });

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!publicToken) return;
    setJoining(true);
    setJoinError(null);
    try {
      await requestLoyaltyEnrollment({
        publicToken,
        firstName,
        email,
        company
      });
      setRequestAccepted(true);
    } catch (error) {
      setJoinError(getJoinError(error));
    } finally {
      setJoining(false);
    }
  };

  const program = programQuery.data;
  const programFirstLoad = programQuery.isLoading && !programQuery.data;
  const programRefreshing = programQuery.isFetching && Boolean(programQuery.data);

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
                <p className="text-sm text-slate-500">{program.location_name}</p>
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
            ) : requestAccepted ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <MailCheck size={22} />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-emerald-950">
                    Vérifiez votre boîte e-mail
                  </p>
                  <p className="mt-2 text-sm text-emerald-800">
                    Si la demande est valide, un lien personnel vient d’être
                    envoyé. Il expire dans 15 minutes.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  Aucune carte, aucun QR code et aucune capacité fidélité ne
                  sont délivrés avant la confirmation de l’adresse e-mail.
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
                        E-mail vérifié avant activation
                      </p>
                      <p className="text-xs text-slate-500">
                        Votre carte apparaît uniquement après confirmation.
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
                        {program.reward_threshold_points} points débloquent :{" "}
                        {program.reward_label}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleJoin} className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Prénom
                    <input
                      required
                      maxLength={100}
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                      placeholder="Votre prénom"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    E-mail
                    <input
                      required
                      type="email"
                      maxLength={320}
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                      placeholder="vous@email.com"
                    />
                  </label>
                  <label className="absolute -left-[10000px]" aria-hidden="true">
                    Société
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
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
                    {joining ? "Envoi..." : "Confirmer mon e-mail"}
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
