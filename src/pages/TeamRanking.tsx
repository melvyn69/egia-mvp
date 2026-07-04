import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  Medal,
  PartyPopper,
  Settings,
  Sparkles,
  Star,
  Trophy,
  UserPlus,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import type { Database } from "../database.types";

type TeamRankingProps = {
  session: Session | null;
};

type MemberRow = Database["public"]["Tables"]["team_members"]["Row"] & {
  email?: string | null;
  receive_monthly_reports?: boolean | null;
};
type TeamSettingsRow = Database["public"]["Tables"]["team_settings"]["Row"];

type ReviewRow = {
  id: string;
  rating: number | null;
  comment: string | null;
  create_time: string | null;
  location_id: string | null;
  author_name: string | null;
};

type QualityStat = {
  label: string;
  count: number;
};

type MemberStat = {
  id: string;
  first_name: string;
  role: string | null;
  email?: string | null;
  is_active: boolean;
  mentions: number;
  positiveCount: number;
  previousPositiveCount: number;
  progression: number;
  avgRating: number | null;
  positiveRate: number | null;
  qualities: QualityStat[];
  badges: string[];
};

type MonthlyTeamStats = {
  memberStats: MemberStat[];
  rankedMembers: MemberStat[];
  employeeOfMonth: MemberStat | null;
  reviewsAnalyzed: number;
  exploitableReviews: number;
  totalMentions: number;
  positiveAssociatedMentions: number;
  citedMembers: number;
  bestScore: number;
  mostMentionedMemberId: string | null;
};

const POSITIVE_RATING_THRESHOLD = 4;

const QUALITY_TERMS: Array<{ label: string; keywords: string[] }> = [
  { label: "accueil", keywords: ["accueil", "accueillant", "accueillante"] },
  { label: "sourire", keywords: ["sourire", "souriant", "souriante"] },
  { label: "conseil", keywords: ["conseil", "conseille", "conseils"] },
  {
    label: "professionnalisme",
    keywords: ["professionnalisme", "professionnel", "professionnelle"]
  },
  { label: "rapidité", keywords: ["rapidite", "rapide", "rapidement"] },
  { label: "écoute", keywords: ["ecoute", "ecouter", "attentif", "attentive"] },
  { label: "gentillesse", keywords: ["gentillesse", "gentil", "gentille"] },
  { label: "qualité", keywords: ["qualite", "excellent", "excellente"] },
  { label: "patience", keywords: ["patience", "patient", "patiente"] },
  { label: "ambiance", keywords: ["ambiance", "chaleureux", "chaleureuse"] }
];

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeForMatching = (value: string) =>
  normalizeName(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string) =>
  normalizeForMatching(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

const getNameVariants = (name: string) => {
  const tokens = tokenize(name).filter((part) => part.length >= 2);
  if (tokens.length === 0) return [];
  const variants = new Set<string[]>();
  variants.add([tokens[0]]);
  if (tokens.length > 1) {
    variants.add(tokens);
  }
  return Array.from(variants);
};

const hasTokenSequence = (tokens: string[], expected: string[]) => {
  if (expected.length === 0 || tokens.length < expected.length) return false;
  for (let index = 0; index <= tokens.length - expected.length; index += 1) {
    const match = expected.every(
      (part, offset) => tokens[index + offset] === part
    );
    if (match) return true;
  }
  return false;
};

const countMentions = (comment: string | null, members: MemberRow[]) => {
  const commentTokens = tokenize(comment ?? "");
  if (commentTokens.length === 0) return [] as string[];
  return members
    .filter((member) =>
      getNameVariants(member.first_name).some((variant) =>
        hasTokenSequence(commentTokens, variant)
      )
    )
    .map((member) => member.id);
};

const extractPositiveQualities = (comments: string[]) => {
  const counts = new Map<string, number>();

  comments.forEach((comment) => {
    const tokens = tokenize(comment);
    QUALITY_TERMS.forEach((term) => {
      const detected = term.keywords.some((keyword) =>
        hasTokenSequence(tokens, tokenize(keyword))
      );
      if (detected) {
        counts.set(term.label, (counts.get(term.label) ?? 0) + 1);
      }
    });
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "fr");
    })
    .slice(0, 5);
};

const getNumericRating = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isPositiveReview = (review: ReviewRow) => {
  const rating = getNumericRating(review.rating);
  return rating !== null && rating >= POSITIVE_RATING_THRESHOLD;
};

const formatRatio = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

const formatRating = (value: number | null) =>
  value === null ? "—" : value.toFixed(1).replace(".", ",");

const formatCount = (value: number, singular: string, plural: string) =>
  `${value} ${value > 1 ? plural : singular}`;

const getMonthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "Mois en cours";
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
};

const getMonthRange = (value: string) => {
  const [year, monthValue] = value.split("-").map(Number);
  const safeDate =
    year && monthValue ? new Date(year, monthValue - 1, 1) : new Date();
  const start = new Date(safeDate.getFullYear(), safeDate.getMonth(), 1);
  const end = new Date(
    safeDate.getFullYear(),
    safeDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  const previousStart = new Date(
    safeDate.getFullYear(),
    safeDate.getMonth() - 1,
    1
  );
  return { start, end, previousStart };
};

const isWithinRange = (review: ReviewRow, start: Date, end: Date) => {
  if (!review.create_time) return false;
  const timestamp = new Date(review.create_time).getTime();
  return (
    Number.isFinite(timestamp) &&
    timestamp >= start.getTime() &&
    timestamp <= end.getTime()
  );
};

const initialsFromName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const getMonthlyTeamStats = (
  members: MemberRow[],
  currentReviews: ReviewRow[],
  previousReviews: ReviewRow[]
): MonthlyTeamStats => {
  const activeMembers = members.filter((member) => member.is_active ?? true);
  const stats = new Map<string, MemberStat>();
  const ratingSums = new Map<string, { sum: number; count: number }>();
  const qualityComments = new Map<string, string[]>();

  members.forEach((member) => {
    stats.set(member.id, {
      id: member.id,
      first_name: member.first_name,
      role: member.role,
      email: member.email,
      is_active: member.is_active ?? true,
      mentions: 0,
      positiveCount: 0,
      previousPositiveCount: 0,
      progression: 0,
      avgRating: null,
      positiveRate: null,
      qualities: [],
      badges: []
    });
  });

  currentReviews.forEach((review) => {
    const mentionedMemberIds = countMentions(review.comment, activeMembers);
    if (mentionedMemberIds.length === 0) return;

    mentionedMemberIds.forEach((memberId) => {
      const stat = stats.get(memberId);
      if (!stat) return;
      stat.mentions += 1;

      const rating = getNumericRating(review.rating);
      if (rating !== null) {
        const currentRating = ratingSums.get(memberId) ?? { sum: 0, count: 0 };
        currentRating.sum += rating;
        currentRating.count += 1;
        ratingSums.set(memberId, currentRating);
      }

      if (isPositiveReview(review)) {
        stat.positiveCount += 1;
        if (review.comment?.trim()) {
          const comments = qualityComments.get(memberId) ?? [];
          comments.push(review.comment);
          qualityComments.set(memberId, comments);
        }
      }
    });
  });

  previousReviews.forEach((review) => {
    if (!isPositiveReview(review)) return;
    const mentionedMemberIds = countMentions(review.comment, activeMembers);
    mentionedMemberIds.forEach((memberId) => {
      const stat = stats.get(memberId);
      if (!stat) return;
      stat.previousPositiveCount += 1;
    });
  });

  stats.forEach((stat, memberId) => {
    const rating = ratingSums.get(memberId);
    if (rating && rating.count > 0) {
      stat.avgRating = rating.sum / rating.count;
    }
    stat.positiveRate =
      stat.mentions > 0 ? stat.positiveCount / stat.mentions : null;
    stat.progression = stat.positiveCount - stat.previousPositiveCount;
    stat.qualities = extractPositiveQualities(qualityComments.get(memberId) ?? []);
  });

  const mostMentionedMember = Array.from(stats.values())
    .filter((stat) => stat.is_active && stat.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)[0];
  const mostMentionedMemberId = mostMentionedMember?.id ?? null;

  stats.forEach((stat) => {
    const badges: string[] = [];
    if (stat.id === mostMentionedMemberId && stat.mentions > 0) {
      badges.push("Le plus cité");
    }
    if (stat.positiveCount > 0) {
      badges.push("Mention client positive");
    }
    if (stat.progression > 0) {
      badges.push("Progression du mois");
    }
    if (stat.is_active && stat.mentions === 0) {
      badges.push("Esprit d’équipe");
    }
    stat.badges = badges.slice(0, 3);
  });

  const memberStats = Array.from(stats.values()).sort((a, b) => {
    if (b.positiveCount !== a.positiveCount) {
      return b.positiveCount - a.positiveCount;
    }
    if (b.mentions !== a.mentions) return b.mentions - a.mentions;
    return a.first_name.localeCompare(b.first_name, "fr");
  });

  const rankedMembers = memberStats
    .filter((stat) => stat.is_active && stat.positiveCount > 0)
    .sort((a, b) => {
      if (b.positiveCount !== a.positiveCount) {
        return b.positiveCount - a.positiveCount;
      }
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      if ((b.avgRating ?? 0) !== (a.avgRating ?? 0)) {
        return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      }
      return a.first_name.localeCompare(b.first_name, "fr");
    });

  const totalMentions = memberStats.reduce(
    (acc, stat) => acc + stat.mentions,
    0
  );
  const positiveAssociatedMentions = memberStats.reduce(
    (acc, stat) => acc + stat.positiveCount,
    0
  );

  return {
    memberStats,
    rankedMembers,
    employeeOfMonth: rankedMembers[0] ?? null,
    reviewsAnalyzed: currentReviews.length,
    exploitableReviews: currentReviews.filter((review) =>
      Boolean(review.comment?.trim())
    ).length,
    totalMentions,
    positiveAssociatedMentions,
    citedMembers: memberStats.filter((stat) => stat.mentions > 0).length,
    bestScore: rankedMembers[0]?.positiveCount ?? 0,
    mostMentionedMemberId
  };
};

const podiumMeta = [
  {
    rank: 1,
    label: "Or",
    Icon: Trophy,
    className:
      "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white shadow-[0_20px_50px_rgba(245,158,11,0.18)] md:order-2 md:-mt-5 md:scale-[1.03]",
    iconClassName: "bg-amber-100 text-amber-700"
  },
  {
    rank: 2,
    label: "Argent",
    Icon: Medal,
    className: "border-slate-200 bg-gradient-to-br from-slate-50 to-white md:order-1",
    iconClassName: "bg-slate-100 text-slate-600"
  },
  {
    rank: 3,
    label: "Bronze",
    Icon: Award,
    className:
      "border-orange-200 bg-gradient-to-br from-orange-50/80 to-white md:order-3",
    iconClassName: "bg-orange-100 text-orange-700"
  }
];

const TeamRanking = ({ session }: TeamRankingProps) => {
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

  const monthRange = useMemo(() => getMonthRange(month), [month]);
  const monthLabel = useMemo(() => getMonthLabel(month), [month]);

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
      monthRange.previousStart.toISOString(),
      monthRange.end.toISOString()
    ],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return [] as ReviewRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("google_reviews")
        .select("id, rating, comment, create_time, location_id, author_name")
        .eq("user_id", session.user.id)
        .gte("create_time", monthRange.previousStart.toISOString())
        .lte("create_time", monthRange.end.toISOString());
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as ReviewRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const currentReviews = useMemo(
    () =>
      (reviewsQuery.data ?? []).filter((review) =>
        isWithinRange(review, monthRange.start, monthRange.end)
      ),
    [monthRange.end, monthRange.start, reviewsQuery.data]
  );
  const previousReviews = useMemo(
    () =>
      (reviewsQuery.data ?? []).filter((review) =>
        isWithinRange(
          review,
          monthRange.previousStart,
          new Date(monthRange.start.getTime() - 1)
        )
      ),
    [monthRange.previousStart, monthRange.start, reviewsQuery.data]
  );

  const monthlyStats = useMemo(
    () => getMonthlyTeamStats(members, currentReviews, previousReviews),
    [members, currentReviews, previousReviews]
  );

  const activeMembers = useMemo(
    () => members.filter((member) => member.is_active ?? true),
    [members]
  );
  const podium = monthlyStats.rankedMembers.slice(0, 3);
  const podiumMembers = podium.map((member, index) => ({
    member,
    meta: podiumMeta[index]
  }));
  const employeeOfMonth = monthlyStats.employeeOfMonth;
  const hasRealWinner = Boolean(employeeOfMonth && employeeOfMonth.positiveCount > 0);
  const citedMemberStats = monthlyStats.memberStats.filter(
    (member) => member.is_active && member.mentions > 0
  );

  const emailDraft = useMemo(() => {
    if (!employeeOfMonth) return null;
    const qualities =
      employeeOfMonth.qualities.length > 0
        ? employeeOfMonth.qualities.map((quality) => quality.label).join(", ")
        : "la qualité de l'accueil et l'attention portée aux clients";
    const subject = `Bravo ${employeeOfMonth.first_name} pour les retours clients`;
    const body = `Bonjour ${employeeOfMonth.first_name},

Je voulais prendre un moment pour te remercier pour les retours clients reçus en ${monthLabel}.

Plusieurs avis positifs t'ont cité(e) ce mois-ci. Les qualités qui ressortent le plus sont : ${qualities}.

Merci pour ton implication et pour l'expérience que tu fais vivre aux clients au quotidien. Cette reconnaissance est une belle mise en avant de ton travail, sans esprit de compétition.

Bravo encore,
L'équipe`;
    return { subject, body };
  }, [employeeOfMonth, monthLabel]);

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
      void membersQuery.refetch();
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
    if (!emailDraft || !employeeOfMonth?.email?.trim()) return;
    const fullDraft = `À: ${employeeOfMonth.email}
Objet: ${emailDraft.subject}

${emailDraft.body}`;

    try {
      await navigator.clipboard.writeText(fullDraft);
    } catch {
      // The mailto link still prepares the message if clipboard access is blocked.
    }

    const mailto = `mailto:${encodeURIComponent(
      employeeOfMonth.email
    )}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(
      emailDraft.body
    )}`;
    window.location.href = mailto;
    setMessage("Email préparé et copié dans le presse-papiers.");
    setTimeout(() => setMessage(null), 3000);
  };

  const settingsEnabled =
    teamSettingsQuery.data?.enabled ?? teamEnabled ?? true;

  const recognitionEmptyTitle =
    activeMembers.length === 0
      ? "Aucun collaborateur actif"
      : monthlyStats.reviewsAnalyzed === 0
        ? "Aucun avis synchronisé sur ce mois"
        : monthlyStats.exploitableReviews === 0
          ? "Avis sans texte exploitable"
          : "Aucune mention positive détectée";
  const recognitionEmptyText =
    activeMembers.length === 0
      ? "Ajoutez au moins un collaborateur actif pour commencer à détecter les mentions dans les avis clients."
      : monthlyStats.reviewsAnalyzed === 0
        ? "Le podium apparaîtra dès que des avis Google du mois sélectionné seront disponibles."
        : monthlyStats.exploitableReviews === 0
          ? "Les avis du mois ne contiennent pas encore de texte permettant d'identifier des collaborateurs."
          : "Le podium se remplira dès qu'un avis positif citera précisément un membre actif de l'équipe.";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-[0_24px_70px_rgba(2,6,23,0.20)] sm:p-6 lg:p-8">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400" />
        {hasRealWinner && (
          <div className="pointer-events-none absolute right-5 top-5 hidden h-24 w-32 sm:block">
            {["bg-amber-300", "bg-emerald-300", "bg-sky-300", "bg-rose-300"].map(
              (color, index) => (
                <span
                  key={color}
                  className={cn(
                    "absolute block h-2 w-7 rounded-full opacity-80 shadow-sm",
                    color
                  )}
                  style={{
                    left: `${index * 24}px`,
                    top: `${(index % 2) * 28}px`,
                    transform: `rotate(${index % 2 === 0 ? 18 : -24}deg)`
                  }}
                />
              )
            )}
          </div>
        )}

        <div className="relative grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-white/15 bg-white/10 text-slate-100">
              Reconnaissance client
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Équipe & reconnaissance client
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Mettez en lumière les collaborateurs cités positivement dans les
                avis, identifiez les qualités perçues par les clients et préparez
                une félicitation humaine.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              <CalendarDays className="h-4 w-4" />
              Mois analysé
            </label>
            <input
              type="month"
              className="mt-2 w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-300 xl:w-56"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Avis analysés",
              value: monthlyStats.reviewsAnalyzed,
              Icon: BarChart3
            },
            {
              label: "Mentions collaborateurs",
              value: monthlyStats.totalMentions,
              Icon: Sparkles
            },
            {
              label: "Collaborateurs cités",
              value: monthlyStats.citedMembers,
              Icon: Users
            },
            {
              label: "Meilleur score du mois",
              value: monthlyStats.bestScore,
              Icon: Trophy
            }
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-white/10 bg-white/[0.08] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {metric.label}
                </p>
                <metric.Icon className="h-4 w-4 text-amber-200" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-white">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Pilotage reconnaissance
          </p>
          <p className="text-xs text-slate-500">
            Les emails, invitations, rôles et rapports mensuels restent gérés
            dans Paramètres.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/settings?tab=team"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
          >
            <Settings className="h-4 w-4" />
            Gérer dans Paramètres
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Gamification</span>
            <button
              type="button"
              className={cn(
                "h-6 w-11 rounded-full border transition",
                settingsEnabled ? "bg-emerald-500" : "bg-slate-200"
              )}
              aria-pressed={settingsEnabled}
              onClick={() => handleToggleTeam(!settingsEnabled)}
            >
              <span
                className={cn(
                  "block h-5 w-5 rounded-full bg-white shadow transition",
                  settingsEnabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {!settingsEnabled ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  La gamification est désactivée
                </p>
                <p>
                  Activez-la pour afficher le podium, les badges et l'employé du
                  mois.
                </p>
              </div>
              <Button onClick={() => handleToggleTeam(true)}>
                <Sparkles className="h-4 w-4" />
                Activer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-amber-50/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Podium mensuel</CardTitle>
                    <p className="text-sm text-slate-500">
                      Classement basé uniquement sur les avis positifs qui citent
                      un collaborateur actif en {monthLabel}.
                    </p>
                  </div>
                  {hasRealWinner && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                      <PartyPopper className="mr-1 h-3.5 w-3.5" />
                      Gagnant réel
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {membersQuery.isLoading || reviewsQuery.isLoading ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Skeleton className="h-56 w-full rounded-2xl" />
                    <Skeleton className="h-64 w-full rounded-2xl" />
                    <Skeleton className="h-56 w-full rounded-2xl" />
                  </div>
                ) : podiumMembers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-900">
                      {recognitionEmptyTitle}
                    </p>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                      {recognitionEmptyText}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr_0.9fr] md:items-end">
                    {podiumMembers.map(({ member, meta }) => (
                      <article
                        key={member.id}
                        className={cn(
                          "relative rounded-2xl border p-5 text-center transition",
                          meta.className
                        )}
                      >
                        {meta.rank === 1 && hasRealWinner && (
                          <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1">
                            <span className="h-2 w-6 rotate-12 rounded-full bg-amber-300" />
                            <span className="h-2 w-6 -rotate-12 rounded-full bg-emerald-300" />
                            <span className="h-2 w-6 rotate-6 rounded-full bg-sky-300" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "mx-auto flex h-12 w-12 items-center justify-center rounded-full",
                            meta.iconClassName
                          )}
                        >
                          <meta.Icon className="h-6 w-6" />
                        </div>
                        <Badge className="mt-4 border-white bg-white/80 text-slate-700">
                          {meta.label}
                        </Badge>
                        <p className="mt-4 text-2xl font-semibold text-slate-950">
                          {member.first_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {member.role ?? "Collaborateur"}
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                          <div className="rounded-xl bg-white/75 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                              Mentions
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-900">
                              {member.positiveCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white/75 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                              Note moy.
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-900">
                              {formatRating(member.avgRating)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          {member.qualities.length > 0
                            ? `Les clients remarquent surtout ${member.qualities
                                .map((quality) => quality.label)
                                .slice(0, 2)
                                .join(" et ")}.`
                            : "Une belle mise en avant portée par les retours clients positifs."}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-slate-950 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-white">Employé du mois</CardTitle>
                    <p className="text-sm text-slate-300">
                      Félicitation prête à personnaliser.
                    </p>
                  </div>
                  <Star className="h-5 w-5 text-amber-300" />
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {employeeOfMonth ? (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-lg font-semibold text-white shadow-card">
                        {initialsFromName(employeeOfMonth.first_name)}
                      </div>
                      <div>
                        <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                          <Trophy className="mr-1 h-3.5 w-3.5" />
                          Mise à l’honneur
                        </Badge>
                        <p className="mt-2 text-xl font-semibold text-slate-950">
                          {employeeOfMonth.first_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {employeeOfMonth.role ?? "Collaborateur"}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm leading-6 text-slate-600">
                      {employeeOfMonth.first_name} ressort dans les avis clients
                      positifs de {monthLabel}. La mise en avant reste collective :
                      elle sert à nourrir la motivation et les bonnes pratiques
                      de l'équipe.
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Mentions
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {employeeOfMonth.positiveCount}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Note
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {formatRating(employeeOfMonth.avgRating)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Qualités
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          {employeeOfMonth.qualities.length}
                        </p>
                      </div>
                    </div>

                    {employeeOfMonth.qualities.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {employeeOfMonth.qualities.map((quality) => (
                          <Badge
                            key={quality.label}
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            {quality.label}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={handlePrepareEmail}
                      disabled={!employeeOfMonth.email?.trim()}
                      className="w-full"
                    >
                      <Mail className="h-4 w-4" />
                      Préparer l’email de félicitations
                    </Button>
                    {!employeeOfMonth.email?.trim() && (
                      <p className="text-sm text-amber-700">
                        Email non configuré — ajoutez-le depuis{" "}
                        <Link
                          to="/settings?tab=team"
                          className="font-semibold underline underline-offset-4"
                        >
                          Paramètres &gt; Équipe
                        </Link>
                        .
                      </p>
                    )}
                    {message && (
                      <p className="text-sm text-emerald-700">{message}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-6 text-slate-500">
                    Aucun employé du mois n'est désigné tant qu'un avis positif
                    ne cite pas explicitement un collaborateur actif.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Qualités perçues par les clients</CardTitle>
                    <p className="text-sm text-slate-500">
                      Tags déterministes détectés dans les avis positifs citant
                      chaque collaborateur.
                    </p>
                  </div>
                  <Badge variant="neutral">
                    {formatCount(citedMemberStats.length, "membre cité", "membres cités")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {citedMemberStats.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
                    Les qualités apparaîtront dès que les avis positifs citent un
                    membre actif et contiennent des mots-clés comme accueil,
                    sourire, conseil ou professionnalisme.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {citedMemberStats.map((member) => (
                      <article
                        key={member.id}
                        className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {member.first_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatCount(
                                member.positiveCount,
                                "avis positif associé",
                                "avis positifs associés"
                              )}
                            </p>
                          </div>
                          <Sparkles className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {member.qualities.length > 0 ? (
                            member.qualities.map((quality) => (
                              <Badge
                                key={quality.label}
                                className="border-emerald-200 bg-emerald-50 text-emerald-700"
                              >
                                {quality.label}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="neutral">
                              Qualités à préciser dans les prochains avis
                            </Badge>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Badges positifs</CardTitle>
                <p className="text-sm text-slate-500">
                  Les badges valorisent les signaux utiles sans afficher de rang
                  négatif.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Le plus cité", "Le collaborateur actif avec le plus de mentions."],
                  [
                    "Mention client positive",
                    "Au moins un avis positif cite le collaborateur."
                  ],
                  [
                    "Progression du mois",
                    "Plus de mentions positives que le mois précédent."
                  ],
                  ["Esprit d’équipe", "Collaborateur actif suivi dans l'équipe."]
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {title}
                      </p>
                      <p className="text-xs leading-5 text-slate-500">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Statistiques par membre</CardTitle>
                  <p className="text-sm text-slate-500">
                    Vue performance-reconnaissance du mois sélectionné. Les
                    données administratives se configurent dans Paramètres.
                  </p>
                </div>
                <Link
                  to="/settings?tab=team"
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  Paramètres équipe
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {membersQuery.isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Skeleton className="h-48 rounded-2xl" />
                  <Skeleton className="h-48 rounded-2xl" />
                  <Skeleton className="h-48 rounded-2xl" />
                </div>
              ) : monthlyStats.memberStats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aucun collaborateur pour le moment.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {monthlyStats.memberStats.map((member) => (
                    <article
                      key={member.id}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]",
                        member.is_active
                          ? "border-slate-100"
                          : "border-slate-100 opacity-70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                            {initialsFromName(member.first_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {member.first_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {member.role ?? "Collaborateur"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={member.is_active ? "success" : "neutral"}>
                          {member.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Mentions
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {member.mentions}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Positifs
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {member.positiveCount}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Note
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatRating(member.avgRating)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {member.badges.map((badge) => (
                          <Badge
                            key={badge}
                            className={
                              badge === "Mention client positive"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : badge === "Progression du mois"
                                  ? "border-sky-200 bg-sky-50 text-sky-700"
                                  : badge === "Le plus cité"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : undefined
                            }
                          >
                            {badge}
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {member.qualities.length > 0 ? (
                          member.qualities.slice(0, 3).map((quality) => (
                            <span
                              key={quality.label}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {quality.label}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">
                            Qualités détectées à venir
                          </span>
                        )}
                      </div>

                      <p className="mt-4 text-xs text-slate-500">
                        Taux positif associé : {formatRatio(member.positiveRate)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
            <Card>
              <CardHeader>
                <CardTitle>Ajouter un collaborateur</CardTitle>
                <p className="text-sm text-slate-500">
                  Ajout rapide conservé sur cette page. Les emails, invitations
                  et rôles avancés se configurent dans Paramètres.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-500">
                    Prénom ou nom affiché
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Thomas"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    Rôle
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      placeholder="Conseiller, manager..."
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-ink"
                      checked={memberActive}
                      onChange={(event) => setMemberActive(event.target.checked)}
                    />
                    Actif
                  </label>
                  <Button onClick={handleCreateMember} disabled={saving}>
                    <UserPlus className="h-4 w-4" />
                    {saving ? "Ajout..." : "Ajouter"}
                  </Button>
                </div>
                {error && <p className="text-sm text-amber-700">{error}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Base équipe</CardTitle>
                    <p className="text-sm text-slate-500">
                      Gestion minimale existante. Pour les emails et rapports,
                      utilisez Paramètres.
                    </p>
                  </div>
                  <Link
                    to="/settings?tab=team"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                  >
                    <Settings className="h-4 w-4" />
                    Configurer
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {membersQuery.isLoading ? (
                  <Skeleton className="h-24 w-full rounded-2xl" />
                ) : members.length > 0 ? (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {initialsFromName(member.first_name)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {member.first_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {member.role ?? "Collaborateur"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={member.is_active ? "success" : "neutral"}>
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
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    Aucun collaborateur pour le moment.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Les emails, invitations, rôles et rapports mensuels restent dans
                l'onglet Équipe des paramètres pour éviter les doublons de
                configuration.
              </p>
              <Link
                to="/settings?tab=team"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-ink px-3 text-sm font-medium text-white transition hover:bg-slate-900"
              >
                <Copy className="h-4 w-4" />
                Ouvrir Paramètres
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export { TeamRanking };
