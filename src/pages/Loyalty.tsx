import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Gift,
  MapPin,
  QrCode,
  ScanLine,
  Users,
  WalletCards
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import {
  fetchLoyaltyHighlights,
  fetchLoyaltyProgram,
  fetchLoyaltyStats,
  fetchRecentLoyaltyMembers,
  getPublicCapabilities,
  saveLoyaltyProgram,
  type LoyaltyProgramForm
} from "../services/loyalty";

type LoyaltyProps = {
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

const defaultForm: LoyaltyProgramForm = {
  is_enabled: false,
  name: "Programme fidélité",
  points_per_visit: 10,
  reward_threshold_points: 100,
  reward_label: "Récompense disponible"
};

const formatDate = (value: string | null) => {
  if (!value) return "Aucune visite";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

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

const getLocationName = (location: LoyaltyProps["locations"][number]) =>
  location.location_title ?? location.location_resource_name;

const getLocationOptionLabel = (location: LoyaltyProps["locations"][number]) => {
  const address = formatAddress(location.address_json);
  return address ? `${getLocationName(location)} — ${address}` : getLocationName(location);
};

const metricCards = [
  { key: "membersCount", label: "Membres", Icon: Users },
  { key: "visitsCount", label: "Visites", Icon: ScanLine },
  { key: "pointsDistributed", label: "Points distribués", Icon: WalletCards },
  { key: "rewardsAvailable", label: "Récompenses", Icon: Gift }
] as const;

const Loyalty = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: LoyaltyProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [form, setForm] = useState<LoyaltyProgramForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId),
    [locations, selectedLocationId]
  );

  const programQuery = useQuery({
    queryKey: ["loyalty-program", userId, selectedLocationId],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Loyalty",
        queryKey,
        queryFn: () => {
          if (!userId || !selectedLocationId) return null;
          return fetchLoyaltyProgram(userId, selectedLocationId);
        },
        getRowCount: (data) => (data ? 1 : 0)
      }),
    enabled: Boolean(userId && selectedLocationId),
    placeholderData: (prev) => prev
  });

  const statsQuery = useQuery({
    queryKey: ["loyalty-stats", userId, selectedLocationId],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Loyalty",
        queryKey,
        queryFn: () => {
          if (!userId) {
            return {
              membersCount: 0,
              visitsCount: 0,
              pointsDistributed: 0,
              rewardsAvailable: 0
            };
          }
          return fetchLoyaltyStats(userId, selectedLocationId || null);
        },
        getRowCount: (data) => data.membersCount
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

  const membersQuery = useQuery({
    queryKey: ["loyalty-members-recent", userId, selectedLocationId],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Loyalty",
        queryKey,
        queryFn: () => {
          if (!userId) return [];
          return fetchRecentLoyaltyMembers(userId, selectedLocationId || null);
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

  const rewardThreshold =
    programQuery.data?.reward_threshold_points ?? form.reward_threshold_points;

  const highlightsQuery = useQuery({
    queryKey: [
      "loyalty-highlights",
      userId,
      selectedLocationId,
      rewardThreshold
    ],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Loyalty",
        queryKey,
        queryFn: () => {
          if (!userId) {
            return { nearRewardMembers: [], availableRewards: [] };
          }
          return fetchLoyaltyHighlights({
            userId,
            locationId: selectedLocationId || null,
            rewardThresholdPoints: rewardThreshold
          });
        },
        getRowCount: (data) =>
          data.nearRewardMembers.length + data.availableRewards.length
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

  const capabilitiesQuery = useQuery({
    queryKey: ["public-capabilities"],
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Loyalty",
        queryKey,
        queryFn: () => getPublicCapabilities()
      }),
    retry: false
  });

  useEffect(() => {
    const program = programQuery.data;
    if (!program) {
      setForm(defaultForm);
      return;
    }
    setForm({
      is_enabled: program.is_enabled,
      name: program.name,
      points_per_visit: program.points_per_visit,
      reward_threshold_points: program.reward_threshold_points,
      reward_label: program.reward_label
    });
  }, [programQuery.data]);

  const publicJoinUrl =
    typeof window !== "undefined" && programQuery.data?.public_token
      ? `${window.location.origin}/loyalty/join/${programQuery.data.public_token}`
      : null;

  const handleSave = async () => {
    if (!userId || !selectedLocationId) return;
    const previousRewardThreshold = rewardThreshold;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const saved = await saveLoyaltyProgram({
        userId,
        locationId: selectedLocationId,
        form
      });
      queryClient.setQueryData(
        ["loyalty-program", userId, selectedLocationId],
        saved
      );
      await queryClient.invalidateQueries({
        queryKey: ["loyalty-program", userId, selectedLocationId],
        exact: true
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "loyalty-highlights",
          userId,
          selectedLocationId,
          previousRewardThreshold
        ],
        exact: true
      });
      if (saved.reward_threshold_points !== previousRewardThreshold) {
        await queryClient.invalidateQueries({
          queryKey: [
            "loyalty-highlights",
            userId,
            selectedLocationId,
            saved.reward_threshold_points
          ],
          exact: true
        });
      }
      setNotice("Programme fidélité enregistré.");
    } catch (err) {
      console.error("loyalty save error:", err);
      setError("Impossible de sauvegarder le programme.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!publicJoinUrl) return;
    if (!navigator.clipboard?.writeText) {
      setError("Copie indisponible sur ce navigateur.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicJoinUrl);
      setNotice("Lien d’adhésion copié.");
    } catch {
      setError("Copie indisponible sur ce navigateur.");
    }
  };

  const stats = statsQuery.data;
  const locationsFirstLoad = locationsLoading && locations.length === 0;
  const statsFirstLoad = statsQuery.isLoading && !statsQuery.data;
  const highlightsFirstLoad = highlightsQuery.isLoading && !highlightsQuery.data;
  const membersFirstLoad = membersQuery.isLoading && !membersQuery.data;
  const loyaltyRefreshing =
    (programQuery.isFetching && Boolean(programQuery.data)) ||
    (statsQuery.isFetching && Boolean(statsQuery.data)) ||
    (highlightsQuery.isFetching && Boolean(highlightsQuery.data)) ||
    (membersQuery.isFetching && Boolean(membersQuery.data));

  if (!session) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-slate-500">
          Connectez-vous pour gérer la fidélité.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Fidélité</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Programme fidélité proposé après votre retour. Vos points sont
                  liés à vos visites.
                </p>
                {loyaltyRefreshing && (
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    Actualisation...
                  </p>
                )}
              </div>
              <Button
                onClick={() =>
                  navigate(
                    selectedLocationId
                      ? `/loyalty/scanner?location=${selectedLocationId}`
                      : "/loyalty/scanner"
                  )
                }
                disabled={!selectedLocationId}
              >
                <ScanLine size={17} />
                Ouvrir le scanner
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {locationsError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                {locationsError}
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700">
              Établissement
              <select
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
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
                  Établissement configuré
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

            {locationsFirstLoad ? (
              <Skeleton className="h-24 w-full" />
            ) : locations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                Connectez au moins un établissement Google pour activer la
                fidélité.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <span>
                    <span className="block font-semibold text-slate-900">
                      Activer la fidélité
                    </span>
                    <span className="text-xs text-slate-500">
                      Rend la page d’adhésion publique disponible.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        is_enabled: event.target.checked
                      }))
                    }
                    className="h-4 w-4 accent-ink"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Nom du programme
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        name: event.target.value
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Points par visite
                  <input
                    type="number"
                    min={1}
                    value={form.points_per_visit}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        points_per_visit: Number(event.target.value)
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Seuil récompense
                  <input
                    type="number"
                    min={1}
                    value={form.reward_threshold_points}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        reward_threshold_points: Number(event.target.value)
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  Récompense disponible
                  <input
                    value={form.reward_label}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        reward_label: event.target.value
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                  />
                </label>
              </div>
            )}

            {notice && <p className="text-sm text-emerald-600">{notice}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={saving || !selectedLocationId || locations.length === 0}
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
              {programQuery.data?.is_enabled ? (
                <Badge variant="success">Actif</Badge>
              ) : (
                <Badge variant="neutral">Inactif</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions fidélité</CardTitle>
            <p className="text-sm text-slate-500">
              Deux liens différents: un pour le commerçant, un pour le client.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <ScanLine size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Scanner commerçant
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    À ouvrir au comptoir pour ajouter les points après une
                    visite.
                  </p>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() =>
                  navigate(
                    selectedLocationId
                      ? `/loyalty/scanner?location=${selectedLocationId}`
                      : "/loyalty/scanner"
                  )
                }
                disabled={!selectedLocationId}
              >
                <ScanLine size={17} />
                Ouvrir le scanner
              </Button>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <QrCode size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  Lien d’adhésion client
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  {publicJoinUrl ??
                    "Enregistrez et activez le programme pour générer le lien."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!publicJoinUrl || !programQuery.data?.is_enabled}
              className="w-full"
            >
              <Copy size={16} />
              Copier le lien d’adhésion
            </Button>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
              Ce lien peut être envoyé après un avis, affiché sur un QR comptoir
              ou partagé par SMS. Aucune récompense n’est liée à la note donnée.
            </div>
            {capabilitiesQuery.data?.appleWalletEnabled && (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <span className="font-medium text-slate-700">Apple Wallet</span>
                <Badge variant="success">Prêt</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {metricCards.map(({ key, label, Icon }) => (
          <Card key={key}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {statsFirstLoad ? "—" : stats?.[key] ?? 0}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Icon size={18} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Membres proches de la récompense</CardTitle>
            <p className="text-sm text-slate-500">
              Clients à encourager lors de leur prochaine visite.
            </p>
          </CardHeader>
          <CardContent>
            {highlightsFirstLoad ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (highlightsQuery.data?.nearRewardMembers ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                Aucun membre proche du seuil pour le moment.
              </div>
            ) : (
              <div className="space-y-4">
                {(highlightsQuery.data?.nearRewardMembers ?? []).map(
                  (member) => (
                    <div
                      key={member.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {member.first_name}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {member.member_code}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">
                          {member.points_balance}/{rewardThreshold} pts
                        </p>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-ink"
                          style={{ width: `${member.progressPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Encore {member.pointsRemaining} points ·{" "}
                        {member.visits_count} visites
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Récompenses disponibles</CardTitle>
            <p className="text-sm text-slate-500">
              Récompenses débloquées à remettre en établissement.
            </p>
          </CardHeader>
          <CardContent>
            {highlightsFirstLoad ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (highlightsQuery.data?.availableRewards ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                Aucune récompense disponible.
              </div>
            ) : (
              <div className="space-y-3">
                {(highlightsQuery.data?.availableRewards ?? []).map(
                  (reward) => (
                    <div
                      key={reward.id}
                      className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Gift size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-emerald-950">
                          {reward.first_name}
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          {reward.reward_label}
                        </p>
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          {reward.member_code || "Code indisponible"} ·{" "}
                          {formatDate(reward.unlocked_at)}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Membres récents</CardTitle>
            {selectedLocation && (
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin size={14} />
                {selectedLocation.location_title ??
                  selectedLocation.location_resource_name}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {membersFirstLoad ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (membersQuery.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              Aucun membre fidélité pour le moment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(membersQuery.data ?? []).map((member) => (
                <div
                  key={member.id}
                  className="grid gap-3 py-4 text-sm md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {member.first_name}
                    </p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-900">
                      {member.member_code}
                    </span>
                  </div>
                  <div className="text-slate-500">
                    {member.points_balance} pts · {member.visits_count} visites
                    · {formatDate(member.last_visit_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { Loyalty };
