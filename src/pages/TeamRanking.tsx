import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import type { Database } from "../database.types";

type TeamRankingProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
};

type MemberRow = Database["public"]["Tables"]["team_members"]["Row"];
type TeamSettingsRow = Database["public"]["Tables"]["team_settings"]["Row"];

type ReviewRow = {
  id: string;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  location_id: string | null;
  author_name: string | null;
};

type MemberStat = {
  id: string;
  first_name: string;
  role: string | null;
  is_active: boolean;
  mentions: number;
  positiveCount: number;
  avgRating: number | null;
  positiveRate: number | null;
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatRatio = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const formatRating = (value: number | null) =>
  value === null ? "—" : value.toFixed(1).replace(".", ",");

const getMonthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "Mois en cours";
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
};

const TeamRanking = ({ session, locations }: TeamRankingProps) => {
  const supabaseClient = supabase;
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("");
  const [memberActive, setMemberActive] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [teamEnabled, setTeamEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const monthRange = useMemo(() => {
    const [year, monthValue] = month.split("-").map(Number);
    const start = new Date(year, monthValue - 1, 1);
    const end = new Date(year, monthValue, 0, 23, 59, 59, 999);
    return { start, end };
  }, [month]);

  const locationsMap = useMemo(() => {
    return new Map(
      locations.map((location) => [
        location.location_resource_name,
        location.location_title ?? location.location_resource_name
      ])
    );
  }, [locations]);

  const teamSettingsQuery = useQuery({
    queryKey: ["team-settings", session?.user?.id ?? null],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return null;
      }
      const { data, error: queryError } = await supabaseClient
        .from("team_settings")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (queryError) {
        throw queryError;
      }
      return data as TeamSettingsRow | null;
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const membersQuery = useQuery({
    queryKey: ["team-members", session?.user?.id ?? null],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return [] as MemberRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("team_members")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as MemberRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const reviewsQuery = useQuery({
    queryKey: [
      "team-reviews",
      session?.user?.id ?? null,
      month,
      monthRange.start.toISOString(),
      monthRange.end.toISOString()
    ],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return [] as ReviewRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("google_reviews")
        .select(
          "id, rating, comment, create_time, location_id, author_name"
        )
        .eq("user_id", session.user.id)
        .gte("create_time", monthRange.start.toISOString())
        .lte("create_time", monthRange.end.toISOString());
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as ReviewRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const members = membersQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  const memberMatchers = useMemo(() => {
    return members.map((member) => ({
      member,
      regex: new RegExp(`\\b${escapeRegex(member.first_name)}\\b`, "i")
    }));
  }, [members]);

  const memberStats = useMemo<MemberStat[]>(() => {
    const stats = new Map<string, MemberStat>();
    members.forEach((member) => {
      stats.set(member.id, {
        id: member.id,
        first_name: member.first_name,
        role: member.role,
        is_active: member.is_active ?? true,
        mentions: 0,
        positiveCount: 0,
        avgRating: null,
        positiveRate: null
      });
    });

    const ratingSums = new Map<string, { sum: number; count: number }>();

    reviews.forEach((review) => {
      const comment = review.comment ?? "";
      if (!comment) return;
      const matches = memberMatchers.filter((matcher) =>
        matcher.regex.test(comment)
      );
      if (matches.length === 0) return;

      matches.forEach(({ member }) => {
        const stat = stats.get(member.id);
        if (!stat) return;
        stat.mentions += 1;
        if (typeof review.rating === "number" && review.rating >= 4) {
          stat.positiveCount += 1;
        }
        if (typeof review.rating === "number") {
          const rating = ratingSums.get(member.id) ?? { sum: 0, count: 0 };
          rating.sum += review.rating;
          rating.count += 1;
          ratingSums.set(member.id, rating);
        }
      });
    });

    stats.forEach((stat, memberId) => {
      const rating = ratingSums.get(memberId);
      if (rating && rating.count > 0) {
        stat.avgRating = rating.sum / rating.count;
      }
      stat.positiveRate =
        stat.mentions > 0 ? stat.positiveCount / stat.mentions : null;
    });

    return Array.from(stats.values());
  }, [members, reviews, memberMatchers]);

  const podium = useMemo(() => {
    return [...memberStats]
      .filter((stat) => stat.is_active)
      .sort((a, b) => {
        if (b.positiveCount !== a.positiveCount) {
          return b.positiveCount - a.positiveCount;
        }
        return b.mentions - a.mentions;
      })
      .slice(0, 3);
  }, [memberStats]);

  const employeeOfMonth = podium[0] ?? null;

  const summaryTotals = useMemo(() => {
    const mentions = memberStats.reduce((acc, stat) => acc + stat.mentions, 0);
    const positives = memberStats.reduce(
      (acc, stat) => acc + stat.positiveCount,
      0
    );
    return { mentions, positives };
  }, [memberStats]);

  const emailDraft = useMemo(() => {
    if (!employeeOfMonth) return null;
    const subject = `Félicitations ${employeeOfMonth.first_name} – Employé du mois`;
    const body = `Bonjour ${employeeOfMonth.first_name},

Bravo pour ce mois de ${getMonthLabel(month)} ! Tu es notre employé du mois grâce à ${employeeOfMonth.positiveCount} avis positifs et ${employeeOfMonth.mentions} mentions clients.

Merci pour ton engagement quotidien. Continue comme ça !

L'équipe EGIA`;
    return { subject, body };
  }, [employeeOfMonth, month]);

  const handleToggleTeam = async (next: boolean) => {
    if (!supabaseClient || !session?.user?.id) {
      return;
    }
    setTeamEnabled(next);
    await supabaseClient
      .from("team_settings")
      .upsert({
        user_id: session.user.id,
        enabled: next,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    void teamSettingsQuery.refetch();
  };

  const handleCreateMember = async () => {
    if (!supabaseClient || !session?.user?.id) {
      return;
    }
    if (!firstName.trim()) {
      setError("Ajoutez un prénom.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabaseClient
      .from("team_members")
      .insert({
        user_id: session.user.id,
        first_name: firstName.trim(),
        role: role.trim() || null,
        is_active: memberActive,
        updated_at: new Date().toISOString()
      });
    if (insertError) {
      setError("Impossible d’ajouter le collaborateur.");
    } else {
      setFirstName("");
      setRole("");
      setMemberActive(true);
      membersQuery.refetch();
    }
    setSaving(false);
  };

  const handleToggleActive = async (member: MemberRow, next: boolean) => {
    if (!supabaseClient) return;
    await supabaseClient
      .from("team_members")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", member.id);
    void membersQuery.refetch();
  };

  const handleDeleteMember = async (member: MemberRow) => {
    if (!supabaseClient) return;
    await supabaseClient.from("team_members").delete().eq("id", member.id);
    void membersQuery.refetch();
  };

  const handlePrepareEmail = async () => {
    if (!emailDraft) return;
    await navigator.clipboard.writeText(
      `${emailDraft.subject}\n\n${emailDraft.body}`
    );
    setMessage("Email copié dans le presse-papiers.");
    setTimeout(() => setMessage(null), 2000);
  };

  const settingsEnabled =
    teamSettingsQuery.data?.enabled ?? teamEnabled ?? true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Équipe & Classement
          </h2>
          <p className="text-sm text-slate-500">
            Valorisez les collaborateurs grâce aux mentions clients positives.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>Gamification</span>
          <button
            type="button"
            className={`h-6 w-11 rounded-full border transition ${
              settingsEnabled ? "bg-emerald-500" : "bg-slate-200"
            }`}
            onClick={() => handleToggleTeam(!settingsEnabled)}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow ${
                settingsEnabled ? "translate-x-5" : "translate-x-1"
              } transition`}
            />
          </button>
        </div>
      </div>

      {!settingsEnabled ? (
        <Card>
          <CardContent className="py-6 text-sm text-slate-600">
            La gamification est désactivée. Activez-la pour voir les classements.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ajouter un collaborateur</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">
                  Prénom
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Thomas"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Rôle</label>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="Coiffeur, manager…"
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={memberActive}
                    onChange={(event) => setMemberActive(event.target.checked)}
                  />
                  Actif
                </label>
                <Button onClick={handleCreateMember} disabled={saving}>
                  {saving ? "Ajout..." : "Ajouter"}
                </Button>
              </div>
              {error && <p className="text-sm text-amber-700">{error}</p>}
              {message && <p className="text-sm text-emerald-700">{message}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Équipe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {membersQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : members.length > 0 ? (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {member.first_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {member.role ?? "Collaborateur"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        {member.is_active ? "Actif" : "Inactif"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleToggleActive(member, !member.is_active)
                        }
                      >
                        {member.is_active ? "Désactiver" : "Activer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteMember(member)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Aucun collaborateur pour le moment.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Classement mensuel</CardTitle>
              <input
                type="month"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                {summaryTotals.positives} avis positifs et {summaryTotals.mentions} mentions
                sur {getMonthLabel(month)}.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {podium.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Pas assez de mentions pour afficher un classement.
                  </p>
                ) : (
                  podium.map((member, index) => (
                    <Card key={member.id}>
                      <CardContent className="py-4 text-center">
                        <div className="text-lg font-semibold text-slate-900">
                          {member.first_name}
                        </div>
                        <p className="text-xs text-slate-500">
                          {member.role ?? "Collaborateur"}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {member.positiveCount} avis positifs
                        </p>
                        <p className="text-xs text-slate-500">
                          {member.mentions} mentions
                        </p>
                        <Badge variant="neutral" className="mt-2">
                          {index === 0
                            ? "Or"
                            : index === 1
                              ? "Argent"
                              : "Bronze"}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statistiques par membre</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {memberStats.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {member.first_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {member.role ?? "Collaborateur"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <span>{member.mentions} mentions</span>
                      <span>Note moyenne {formatRating(member.avgRating)}</span>
                      <span>Positif {formatRatio(member.positiveRate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Employé du mois</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {employeeOfMonth ? (
                <>
                  <p className="text-sm text-slate-700">
                    {employeeOfMonth.first_name} est en tête pour {getMonthLabel(month)}
                    avec {employeeOfMonth.positiveCount} avis positifs.
                  </p>
                  <Button onClick={handlePrepareEmail} variant="outline">
                    Préparer l’email de félicitations
                  </Button>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Pas assez de données pour désigner un employé du mois.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export { TeamRanking };
