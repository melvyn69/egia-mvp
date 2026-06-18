import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Gift, RotateCcw, ScanLine, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  recordLoyaltyVisit,
  type RecordLoyaltyVisitResult
} from "../services/loyalty";

type LoyaltyScannerProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
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
          queryKey: ["loyalty-stats", userId]
        });
        void queryClient.invalidateQueries({
          queryKey: ["loyalty-members-recent", userId]
        });
      }
    } catch (err) {
      console.error("record loyalty visit error:", err);
      setError(getScannerError(err));
    } finally {
      setSubmitting(false);
    }
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
                est enregistrée immédiatement.
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
              Établissement
              <select
                value={selectedLocationId}
                disabled={locationsLoading}
                onChange={(event) => setSelectedLocationId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.location_title ?? location.location_resource_name}
                  </option>
                ))}
              </select>
            </label>

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
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    {result.duplicate_scan ? (
                      <RotateCcw size={20} />
                    ) : (
                      <CheckCircle size={20} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      {result.duplicate_scan
                        ? "Scan déjà enregistré"
                        : "Visite enregistrée"}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      {selectedLocation?.location_title ??
                        selectedLocation?.location_resource_name ??
                        "Établissement"}{" "}
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
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Membre
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {result.member_code}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Solde
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
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

              {result.reward_available && (
                <p className="mt-4 text-sm font-medium text-emerald-800">
                  {result.reward_label}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { LoyaltyScanner };
