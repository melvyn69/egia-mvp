import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Gift,
  RotateCcw,
  ScanLine,
  Search,
  UserRound
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import {
  fetchLoyaltyProgram,
  recordLoyaltyVisit,
  type RecordLoyaltyVisitResult
} from "../services/loyalty";

type LoyaltyScannerProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json?: unknown | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return "Maintenant";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
};

const formatProgress = (points: number, threshold: number) =>
  Math.min(100, Math.round((points / Math.max(1, threshold)) * 100));

const formatAddress = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const formatted =
    (record.formatted_address as string | undefined) ??
    (record.formattedAddress as string | undefined);
  if (formatted) return formatted;
  const line1 =
    (record.address_line_1 as string | undefined) ??
    (record.line1 as string | undefined);
  const line2 =
    (record.address_line_2 as string | undefined) ??
    (record.line2 as string | undefined);
  const city = (record.city as string | undefined) ?? null;
  const postal =
    (record.postal_code as string | undefined) ??
    (record.zip as string | undefined);
  const region =
    (record.region as string | undefined) ??
    (record.state as string | undefined);
  const parts = [line1, line2, postal, city, region]
    .filter(Boolean)
    .join(" ");
  return parts || null;
};

const getLocationName = (
  location: LoyaltyScannerProps["locations"][number]
) => location.location_title ?? location.location_resource_name;

const getLocationOptionLabel = (
  location: LoyaltyScannerProps["locations"][number]
) => {
  const address = formatAddress(location.address_json);
  return address ? `${getLocationName(location)} — ${address}` : getLocationName(location);
};

const getScannerError = (error: unknown) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  if (message.includes("loyalty_program_not_found")) {
    return "Programme fidélité inactif pour cet établissement.";
  }
  if (message.includes("loyalty_member_not_found")) {
    return "Membre introuvable.";
  }
  if (message.includes("member_identifier_required")) {
    return "Scannez ou saisissez un identifiant membre.";
  }
  return "Impossible d’enregistrer la visite.";
};

const LoyaltyScanner = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: LoyaltyScannerProps) => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState(
    searchParams.get("location") ?? ""
  );
  const [scannerInput, setScannerInput] = useState(
    searchParams.get("token") ?? searchParams.get("code") ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordLoyaltyVisitResult | null>(null);
  const [doubleScanRemaining, setDoubleScanRemaining] = useState(0);

  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [result, error]);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId),
    [locations, selectedLocationId]
  );

  const programQuery = useQuery({
    queryKey: ["loyalty-program", session?.user.id ?? null, selectedLocationId],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "LoyaltyScanner",
        queryKey,
        queryFn: () => {
          if (!session?.user.id || !selectedLocationId) return null;
          return fetchLoyaltyProgram(session.user.id, selectedLocationId);
        },
        getRowCount: (data) => (data ? 1 : 0)
      }),
    enabled: Boolean(session?.user.id && selectedLocationId),
    placeholderData: (prev) => prev
  });

  const rewardThreshold = programQuery.data?.reward_threshold_points ?? 100;
  const progressPercent = result
    ? formatProgress(result.points_balance, rewardThreshold)
    : 0;
  const pointsRemaining = result
    ? Math.max(0, rewardThreshold - result.points_balance)
    : rewardThreshold;

  useEffect(() => {
    if (!result?.duplicate_scan) {
      setDoubleScanRemaining(0);
      return;
    }

    const updateRemaining = () => {
      if (!result.last_visit_at) {
        setDoubleScanRemaining(90);
        return;
      }
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(result.last_visit_at).getTime()) / 1000
      );
      setDoubleScanRemaining(Math.max(0, 90 - elapsedSeconds));
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [result]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedLocationId) {
      setError("Choisissez un établissement.");
      return;
    }
    if (!scannerInput.trim()) {
      setError("Scannez ou saisissez un identifiant membre.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const nextResult = await recordLoyaltyVisit({
        locationId: selectedLocationId,
        scannerInput
      });
      setResult(nextResult);
      setScannerInput("");
      const userId = session?.user.id ?? null;
      if (userId) {
        void queryClient.invalidateQueries({
          queryKey: ["loyalty-stats", userId, selectedLocationId],
          exact: true
        });
        void queryClient.invalidateQueries({
          queryKey: ["loyalty-members-recent", userId, selectedLocationId],
          exact: true
        });
        void queryClient.invalidateQueries({
          queryKey: [
            "loyalty-highlights",
            userId,
            selectedLocationId,
            rewardThreshold
          ],
          exact: true
        });
      }
    } catch (err) {
      console.error("record loyalty visit error:", err);
      setError(getScannerError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resultIsDuplicate = Boolean(result?.duplicate_scan);
  const resultTitle = resultIsDuplicate
    ? "Déjà scanné à l’instant"
    : "Visite enregistrée";
  const resultMessage = resultIsDuplicate
    ? `Pas de nouveaux points ajoutés. Réessayez dans ${doubleScanRemaining} s.`
    : `${result?.points_added ?? 0} points ajoutés au compte fidélité.`;
  const displayedMemberName = result?.first_name?.trim() || "Membre fidélité";

  const handleNextScan = () => {
    setResult(null);
    setError(null);
    setScannerInput("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!session) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-slate-500">
          Connectez-vous pour utiliser le scanner fidélité.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Scanner fidélité</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Scannez le QR membre ou saisissez son identifiant. Une visite
                est enregistrée immédiatement. Vos points sont liés à vos
                visites.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {locationsError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              {locationsError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Établissement au comptoir
              <select
                value={selectedLocationId}
                disabled={locationsLoading && locations.length === 0}
                onChange={(event) => setSelectedLocationId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {getLocationOptionLabel(location)}
                  </option>
                ))}
              </select>
            </label>

            {selectedLocation && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Scanner actif pour
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {getLocationName(selectedLocation)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatAddress(selectedLocation.address_json) ??
                    selectedLocation.location_resource_name}
                </p>
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700">
              Identifiant membre
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    ref={inputRef}
                    value={scannerInput}
                    onChange={(event) => setScannerInput(event.target.value)}
                    placeholder="EG12345678 ou token QR"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-base font-semibold uppercase tracking-wide text-slate-900 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting || locations.length === 0}
                  className="h-14"
                >
                  <ScanLine size={18} />
                  {submitting ? "..." : "Valider"}
                </Button>
              </div>
            </label>
          </form>

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertTriangle size={21} />
              </div>
              <div>
                <p className="text-base font-semibold">Scan impossible</p>
                <p className="mt-1 text-sm text-rose-700">{error}</p>
                <p className="mt-3 text-xs font-medium text-rose-600">
                  Vérifiez le code membre, puis rescanner ou saisissez le code
                  manuellement.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div
              className={
                resultIsDuplicate
                  ? "rounded-2xl border border-amber-200 bg-amber-50 p-5"
                  : "rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
              }
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      resultIsDuplicate
                        ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                        : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                    }
                  >
                    {result.duplicate_scan ? (
                      <RotateCcw size={20} />
                    ) : (
                      <CheckCircle size={22} />
                    )}
                  </div>
                  <div>
                    <p
                      className={
                        resultIsDuplicate
                          ? "text-lg font-semibold text-amber-950"
                          : "text-lg font-semibold text-emerald-950"
                      }
                    >
                      {resultTitle}
                    </p>
                    <p
                      className={
                        resultIsDuplicate
                          ? "mt-1 text-sm font-medium text-amber-800"
                          : "mt-1 text-sm font-medium text-emerald-800"
                      }
                    >
                      {resultMessage}
                    </p>
                    <p
                      className={
                        resultIsDuplicate
                          ? "mt-2 text-xs text-amber-700"
                          : "mt-2 text-xs text-emerald-700"
                      }
                    >
                      {selectedLocation
                        ? getLocationName(selectedLocation)
                        : "Établissement"}{" "}
                      · {formatDate(result.last_visit_at)}
                    </p>
                  </div>
                </div>

                {result.reward_available && (
                  <Badge variant="success">
                    <Gift size={13} />
                    Récompense disponible
                  </Badge>
                )}
                {resultIsDuplicate && (
                  <Badge variant="warning">
                    <Clock size={13} />
                    {doubleScanRemaining} s
                  </Badge>
                )}
              </div>

              <div className="mt-5 rounded-2xl bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <UserRound size={18} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {displayedMemberName}
                      </p>
                      <p className="text-sm font-medium text-slate-500">
                        {result.member_code}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Points ajoutés
                    </p>
                    <p className="text-5xl font-semibold leading-none text-slate-900">
                      +{result.points_added}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Total points
                  </p>
                  <p className="mt-2 text-4xl font-semibold leading-none text-slate-900">
                    {result.points_balance} pts
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Visites
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {result.visits_count}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Progression récompense
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {result.reward_available
                        ? "Le seuil est atteint."
                        : `${pointsRemaining} points restants avant récompense.`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {result.points_balance}/{rewardThreshold}
                  </p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={
                      result.reward_available
                        ? "h-full rounded-full bg-emerald-500"
                        : "h-full rounded-full bg-ink"
                    }
                    style={{
                      width: `${result.reward_available ? 100 : progressPercent}%`
                    }}
                  />
                </div>
              </div>

              {result.reward_available && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-5 text-emerald-900">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Gift size={19} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        Récompense disponible
                      </p>
                      <p className="mt-1 text-sm font-medium text-emerald-800">
                        {result.reward_label}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button className="mt-4 w-full" size="lg" onClick={handleNextScan}>
                <ScanLine size={18} />
                Scanner un autre client
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { LoyaltyScanner };
