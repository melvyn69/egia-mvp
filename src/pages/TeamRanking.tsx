import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  Gem,
  Gift,
  Heart,
  Mail,
  MessageCircle,
  Medal,
  PartyPopper,
  Quote,
  Search,
  Settings,
  Sparkles,
  Sprout,
  Star,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  X
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
  imageUrl?: string | null;
  is_active: boolean;
  mentions: number;
  positiveCount: number;
  previousPositiveCount: number;
  progression: number;
  avgRating: number | null;
  positiveRate: number | null;
  qualities: QualityStat[];
  clientQuotes: string[];
  badges: string[];
};

type HallOfFameEntry = {
  monthKey: string;
  monthLabel: string;
  memberId: string;
  firstName: string;
  role: string | null;
  positiveCount: number;
  avgRating: number | null;
};

type QualityTrend = {
  label: string;
  current: number;
  previous: number;
  delta: number;
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
  qualityTrends: QualityTrend[];
};

type ComplimentSort = "recent" | "popular" | "rating";

type ClientCompliment = {
  id: string;
  reviewId: string;
  memberId: string;
  memberName: string;
  memberRole: string | null;
  quote: string;
  rating: number | null;
  date: string | null;
  qualities: QualityStat[];
  popularity: number;
};

type CareerMentionEntry = {
  memberId: string;
  firstName: string;
  role: string | null;
  imageUrl?: string | null;
  mentions: number;
  latestDate: string | null;
};

type RecognitionRecord = {
  label: string;
  value: string;
  memberName: string;
  detail: string;
};

type RecordTone = "trophy" | "progress" | "streak" | "regular" | "default";

type DisplayRecord = RecognitionRecord & {
  icon: string;
  shortLabel: string;
  tone: RecordTone;
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

const REWARD_SUGGESTIONS = [
  "Carte cadeau",
  "Repas d'équipe",
  "Prime",
  "Après-midi libre",
  "Place de cinéma"
];

const RECOGNITION_LEVELS = [
  {
    label: "🌱 Premières mentions",
    min: 1,
    Icon: Sprout,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  {
    label: "Bronze",
    min: 10,
    Icon: Medal,
    className: "border-orange-200 bg-orange-50 text-orange-700"
  },
  {
    label: "Argent",
    min: 25,
    Icon: Award,
    className: "border-slate-200 bg-slate-50 text-slate-700"
  },
  {
    label: "Or",
    min: 50,
    Icon: Trophy,
    className: "border-amber-200 bg-amber-50 text-amber-700"
  },
  {
    label: "Diamant",
    min: 75,
    Icon: Gem,
    className: "border-sky-200 bg-sky-50 text-sky-700"
  },
  {
    label: "Légende",
    min: 100,
    Icon: Crown,
    className: "border-violet-200 bg-violet-50 text-violet-700"
  }
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

const getTimestamp = (value: string | null) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatClientDate = (value: string | null) => {
  if (!value) return "Date non disponible";
  const timestamp = getTimestamp(value);
  if (!timestamp) return "Date non disponible";
  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const getMonthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "Mois en cours";
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
};

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

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
  const historyStart = new Date(
    safeDate.getFullYear(),
    safeDate.getMonth() - 6,
    1
  );
  return { start, end, previousStart, historyStart };
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

const truncateText = (value: string, maxLength = 130) => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
};

const extractClientQuotes = (comments: string[]) => {
  const seen = new Set<string>();
  const quotes: string[] = [];

  comments.forEach((comment) => {
    const sentences = comment
      .split(/(?<=[.!?])\s+|\n+/)
      .map((part) => truncateText(part.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "")))
      .filter((part) => part.length >= 8);

    const candidates = sentences.length > 0 ? sentences : [truncateText(comment)];
    candidates.forEach((candidate) => {
      const key = normalizeForMatching(candidate);
      if (!key || seen.has(key) || quotes.length >= 3) return;
      seen.add(key);
      quotes.push(candidate);
    });
  });

  return quotes.slice(0, 3);
};

const extractPrimaryQuote = (comment: string) =>
  extractClientQuotes([comment])[0] ?? truncateText(comment, 180);

const countQualityTerms = (comments: string[]) => {
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

  return counts;
};

const sumQualityCounts = (qualities: QualityStat[]) =>
  qualities.reduce((acc, quality) => acc + quality.count, 0);

const getQualityTrends = (
  currentComments: string[],
  previousComments: string[]
) => {
  if (currentComments.length === 0 || previousComments.length === 0) {
    return [] as QualityTrend[];
  }

  const currentCounts = countQualityTerms(currentComments);
  const previousCounts = countQualityTerms(previousComments);

  return QUALITY_TERMS.map((term) => {
    const current = currentCounts.get(term.label) ?? 0;
    const previous = previousCounts.get(term.label) ?? 0;
    return {
      label: term.label,
      current,
      previous,
      delta: current - previous
    };
  })
    .filter((trend) => trend.delta > 0)
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return b.current - a.current;
    })
    .slice(0, 3);
};

const getClientCompliments = (
  members: MemberRow[],
  reviews: ReviewRow[]
): ClientCompliment[] => {
  const activeMembers = members.filter((member) => member.is_active ?? true);
  const membersById = new Map(activeMembers.map((member) => [member.id, member]));
  const seen = new Set<string>();
  const compliments: ClientCompliment[] = [];

  reviews.forEach((review) => {
    if (!isPositiveReview(review) || !review.comment?.trim()) return;
    const mentionedMemberIds = countMentions(review.comment, activeMembers);
    if (mentionedMemberIds.length === 0) return;

    const quote = extractPrimaryQuote(review.comment);
    const qualities = extractPositiveQualities([review.comment]);
    const rating = getNumericRating(review.rating);

    mentionedMemberIds.forEach((memberId) => {
      const member = membersById.get(memberId);
      if (!member) return;
      const key = `${review.id}-${member.id}-${normalizeForMatching(quote)}`;
      if (seen.has(key)) return;
      seen.add(key);
      compliments.push({
        id: key,
        reviewId: review.id,
        memberId: member.id,
        memberName: member.first_name,
        memberRole: member.role,
        quote,
        rating,
        date: review.create_time,
        qualities,
        popularity: (rating ?? 0) * 10 + sumQualityCounts(qualities)
      });
    });
  });

  return compliments.sort((a, b) => getTimestamp(b.date) - getTimestamp(a.date));
};

const getCareerMentionLeaders = (
  members: MemberRow[],
  reviews: ReviewRow[]
): CareerMentionEntry[] => {
  const activeMembers = members.filter((member) => member.is_active ?? true);
  const counts = new Map<string, { mentions: number; latestDate: string | null }>();

  reviews.forEach((review) => {
    if (!isPositiveReview(review) || !review.comment?.trim()) return;
    const mentionedMemberIds = countMentions(review.comment, activeMembers);
    mentionedMemberIds.forEach((memberId) => {
      const current = counts.get(memberId) ?? { mentions: 0, latestDate: null };
      const latestDate =
        getTimestamp(review.create_time) > getTimestamp(current.latestDate)
          ? review.create_time
          : current.latestDate;
      counts.set(memberId, {
        mentions: current.mentions + 1,
        latestDate
      });
    });
  });

  return activeMembers
    .map((member) => {
      const count = counts.get(member.id);
      return {
        memberId: member.id,
        firstName: member.first_name,
        role: member.role,
        imageUrl: getMemberImageUrl(member),
        mentions: count?.mentions ?? 0,
        latestDate: count?.latestDate ?? null
      };
    })
    .filter((entry) => entry.mentions > 0)
    .sort((a, b) => {
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      return a.firstName.localeCompare(b.firstName, "fr");
    });
};

const getMemberMonthlyMentionCounts = (
  members: MemberRow[],
  reviews: ReviewRow[]
) => {
  const activeMembers = members.filter((member) => member.is_active ?? true);
  const counts = new Map<string, Map<string, number>>();

  activeMembers.forEach((member) => counts.set(member.id, new Map()));

  reviews.forEach((review) => {
    if (!isPositiveReview(review) || !review.comment?.trim() || !review.create_time) {
      return;
    }
    const monthKey = getMonthKey(new Date(review.create_time));
    countMentions(review.comment, activeMembers).forEach((memberId) => {
      const memberCounts = counts.get(memberId);
      if (!memberCounts) return;
      memberCounts.set(monthKey, (memberCounts.get(monthKey) ?? 0) + 1);
    });
  });

  return counts;
};

const getMonthIndex = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return year * 12 + month;
};

const getLongestConsecutiveStreak = (monthKeys: string[]) => {
  if (monthKeys.length === 0) return 0;
  const indexes = [...new Set(monthKeys.map(getMonthIndex))].sort((a, b) => a - b);
  let longest = 1;
  let current = 1;

  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] === indexes[index - 1] + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
};

const getHallOfFameEntries = (
  members: MemberRow[],
  reviews: ReviewRow[],
  currentMonthStart: Date
) => {
  const reviewsByMonth = new Map<string, ReviewRow[]>();

  reviews.forEach((review) => {
    if (!review.create_time) return;
    const reviewDate = new Date(review.create_time);
    if (reviewDate.getTime() >= currentMonthStart.getTime()) return;
    const monthKey = getMonthKey(reviewDate);
    const monthReviews = reviewsByMonth.get(monthKey) ?? [];
    monthReviews.push(review);
    reviewsByMonth.set(monthKey, monthReviews);
  });

  return Array.from(reviewsByMonth.entries())
    .map(([monthKey, monthReviews]): HallOfFameEntry | null => {
      const stats = getMonthlyTeamStats(members, monthReviews, []);
      const winner = stats.employeeOfMonth;
      if (!winner || winner.positiveCount <= 0) return null;

      return {
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        memberId: winner.id,
        firstName: winner.first_name,
        role: winner.role,
        positiveCount: winner.positiveCount,
        avgRating: winner.avgRating
      };
    })
    .filter((entry): entry is HallOfFameEntry => Boolean(entry))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
};

const groupHallOfFameByYear = (entries: HallOfFameEntry[]) => {
  const groups = new Map<string, HallOfFameEntry[]>();
  entries.forEach((entry) => {
    const year = entry.monthKey.slice(0, 4);
    const group = groups.get(year) ?? [];
    group.push(entry);
    groups.set(year, group);
  });
  return Array.from(groups.entries()).sort(([yearA], [yearB]) =>
    yearB.localeCompare(yearA)
  );
};

const getRecognitionRecords = (
  members: MemberRow[],
  reviews: ReviewRow[],
  currentStats: MonthlyTeamStats
): RecognitionRecord[] => {
  const activeMembers = members.filter((member) => member.is_active ?? true);
  if (activeMembers.length === 0) return [];

  const membersById = new Map(activeMembers.map((member) => [member.id, member]));
  const careerLeaders = getCareerMentionLeaders(activeMembers, reviews);
  const monthlyCounts = getMemberMonthlyMentionCounts(activeMembers, reviews);
  const records: RecognitionRecord[] = [];

  const topCareer = careerLeaders[0];
  if (topCareer) {
    records.push({
      label: "Plus grand nombre de mentions",
      value: formatCount(topCareer.mentions, "mention", "mentions"),
      memberName: topCareer.firstName,
      detail: "Total cumulé sur les avis positifs disponibles."
    });
  }

  const monthlyRecordCandidates: Array<{
    memberId: string;
    monthKey: string;
    count: number;
  }> = [];
  monthlyCounts.forEach((counts, memberId) => {
    counts.forEach((count, monthKey) => {
      monthlyRecordCandidates.push({ memberId, monthKey, count });
    });
  });
  const bestMonth = monthlyRecordCandidates.sort((a, b) => b.count - a.count)[0];
  if (bestMonth) {
    records.push({
      label: "Meilleur mois",
      value: formatCount(bestMonth.count, "mention", "mentions"),
      memberName: membersById.get(bestMonth.memberId)?.first_name ?? "Équipe",
      detail: getMonthLabel(bestMonth.monthKey)
    });
  }

  const bestProgression = currentStats.memberStats
    .filter((member) => member.is_active)
    .sort((a, b) => {
      if (b.progression !== a.progression) return b.progression - a.progression;
      return b.positiveCount - a.positiveCount;
    })[0];
  if (bestProgression && bestProgression.progression > 0) {
    records.push({
      label: "Plus forte progression",
      value: `+${bestProgression.progression}`,
      memberName: bestProgression.first_name,
      detail: "Comparé au mois précédent."
    });
  }

  const streakCandidates: Array<{
    memberId: string;
    streak: number;
    months: number;
  }> = [];

  monthlyCounts.forEach((counts, memberId) => {
    const positiveMonthKeys = Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([monthKey]) => monthKey);
    streakCandidates.push({
      memberId,
      streak: getLongestConsecutiveStreak(positiveMonthKeys),
      months: positiveMonthKeys.length
    });
  });

  const longestStreak = [...streakCandidates].sort(
    (a, b) => b.streak - a.streak
  )[0];
  const mostRegular = [...streakCandidates].sort(
    (a, b) => b.months - a.months
  )[0];

  if (longestStreak && longestStreak.streak > 1) {
    records.push({
      label: "Plus longue série",
      value: `${longestStreak.streak} mois`,
      memberName: membersById.get(longestStreak.memberId)?.first_name ?? "Équipe",
      detail: "Avec au moins une mention positive chaque mois."
    });
  }

  if (mostRegular && mostRegular.months > 0) {
    records.push({
      label: "Collaborateur le plus régulier",
      value: `${mostRegular.months} mois`,
      memberName: membersById.get(mostRegular.memberId)?.first_name ?? "Équipe",
      detail: "Présence la plus fréquente dans les avis positifs."
    });
  }

  return records.slice(0, 5);
};

const getRecordPresentation = (record: RecognitionRecord): DisplayRecord => {
  if (record.label.includes("Plus grand")) {
    return {
      ...record,
      icon: "🏆",
      shortLabel: "Plus cité",
      tone: "trophy"
    };
  }
  if (record.label.includes("Progression")) {
    return {
      ...record,
      icon: "📈",
      shortLabel: "Progression",
      tone: "progress"
    };
  }
  if (record.label.includes("série")) {
    return {
      ...record,
      icon: "🔥",
      shortLabel: "Série",
      tone: "streak"
    };
  }
  if (record.label.includes("régulier")) {
    return {
      ...record,
      icon: "⭐",
      shortLabel: "Régularité",
      tone: "regular"
    };
  }
  return {
    ...record,
    icon: "✨",
    shortLabel: "Meilleur mois",
    tone: "default"
  };
};

const getRecognitionLevel = (count: number) => {
  if (count <= 0) {
    return {
      label: "💚 Membre actif",
      min: 0,
      Icon: Heart,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }

  return [...RECOGNITION_LEVELS]
    .reverse()
    .find((level) => count >= level.min) ?? RECOGNITION_LEVELS[0];
};

const getNextRecognitionLevel = (count: number) =>
  RECOGNITION_LEVELS.find((level) => count < level.min) ?? null;

const getRecognitionProgress = (count: number) => {
  const currentLevel = getRecognitionLevel(count);
  const nextLevel = getNextRecognitionLevel(count);
  if (!nextLevel) return 100;
  const currentMin = currentLevel.min;
  const span = Math.max(1, nextLevel.min - currentMin);
  return Math.min(100, Math.max(0, ((count - currentMin) / span) * 100));
};

const getRewardSuggestion = (memberId: string | null, month: string) => {
  if (!memberId) return REWARD_SUGGESTIONS[0];
  const seed = `${memberId}-${month}`.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  return REWARD_SUGGESTIONS[seed % REWARD_SUGGESTIONS.length];
};

const getEvolutionMeta = (current: number, previous: number) => {
  const delta = current - previous;
  const direction = delta > 0 ? "up" : "flat";
  const percent =
    previous > 0 ? Math.round((delta / previous) * 100) : null;
  const display =
    percent !== null && delta > 0
      ? `${percent > 0 ? "+" : ""}${percent}%`
      : current > 0
        ? "⭐ En progression"
        : "🤝 Présent dans l'équipe";
  const details =
    delta > 0
      ? `+${delta} mention${delta > 1 ? "s" : ""} positive${delta > 1 ? "s" : ""}`
      : current > 0
      ? "Reconnaissance active ce mois-ci"
      : "Membre suivi dans la reconnaissance client";

  return { delta, direction, display, details };
};

const buildRecognitionSummary = (member: MemberStat) => {
  const qualities = member.qualities.map((quality) => quality.label).slice(0, 3);
  if (qualities.length === 0) {
    return `Les clients ont cité ${member.first_name} positivement ce mois-ci, avec ${formatCount(
      member.positiveCount,
      "mention",
      "mentions"
    )} associée${member.positiveCount > 1 ? "s" : ""}.`;
  }
  if (qualities.length === 1) {
    return `Les clients ont particulièrement apprécié ${member.first_name} ce mois-ci pour une qualité souvent mentionnée : ${qualities[0]}.`;
  }
  const lastQuality = qualities[qualities.length - 1];
  const firstQualities = qualities.slice(0, -1).join(", ");
  return `Les clients ont particulièrement apprécié ${member.first_name} ce mois-ci pour ${firstQualities} et ${lastQuality}.`;
};

type MemberAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const MemberAvatar = ({
  name,
  imageUrl,
  size = "md",
  className
}: MemberAvatarProps) => {
  const sizeClass =
    size === "lg"
      ? "h-16 w-16 rounded-2xl text-lg"
      : size === "sm"
        ? "h-10 w-10 rounded-full text-xs"
        : "h-11 w-11 rounded-full text-sm";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn("shrink-0 object-cover", sizeClass, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-slate-950 font-semibold text-white",
        sizeClass,
        className
      )}
    >
      {initialsFromName(name)}
    </div>
  );
};

const getMemberImageUrl = (member: MemberRow) => {
  const row = member as MemberRow & {
    avatar_url?: string | null;
    image_url?: string | null;
    photo_url?: string | null;
  };
  return row.avatar_url ?? row.image_url ?? row.photo_url ?? null;
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
  const currentQualityComments: string[] = [];
  const previousQualityComments: string[] = [];

  members.forEach((member) => {
    stats.set(member.id, {
      id: member.id,
      first_name: member.first_name,
      role: member.role,
      email: member.email,
      imageUrl: getMemberImageUrl(member),
      is_active: member.is_active ?? true,
      mentions: 0,
      positiveCount: 0,
      previousPositiveCount: 0,
      progression: 0,
      avgRating: null,
      positiveRate: null,
      qualities: [],
      clientQuotes: [],
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

    if (isPositiveReview(review) && review.comment?.trim()) {
      currentQualityComments.push(review.comment);
    }
  });

  previousReviews.forEach((review) => {
    if (!isPositiveReview(review)) return;
    const mentionedMemberIds = countMentions(review.comment, activeMembers);
    if (mentionedMemberIds.length > 0 && review.comment?.trim()) {
      previousQualityComments.push(review.comment);
    }
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
    stat.clientQuotes = extractClientQuotes(qualityComments.get(memberId) ?? []);
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
      badges.push("🌱 Premières mentions");
    }
    if (stat.progression > 0) {
      badges.push("⭐ En progression");
    }
    if (stat.is_active && stat.mentions === 0) {
      badges.push("🤝 Présent dans l'équipe");
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
    mostMentionedMemberId,
    qualityTrends: getQualityTrends(currentQualityComments, previousQualityComments)
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

type PodiumPosition = "first" | "second" | "third";

const getPodiumSlots = (podium: MemberStat[]) =>
  [
    { member: podium[0] ?? null, meta: podiumMeta[0], position: "first" },
    { member: podium[1] ?? null, meta: podiumMeta[1], position: "second" },
    { member: podium[2] ?? null, meta: podiumMeta[2], position: "third" }
  ].filter(
    (
      slot
    ): slot is {
      member: MemberStat;
      meta: (typeof podiumMeta)[number];
      position: PodiumPosition;
    } => Boolean(slot.member)
  );

type HallOfFameTimelineProps = {
  groups: Array<[string, HallOfFameEntry[]]>;
  compact?: boolean;
};

const HallOfFameTimeline = ({
  groups,
  compact = false
}: HallOfFameTimelineProps) => (
  <div
    className={cn(
      "relative space-y-4",
      compact && "max-h-[430px] overflow-hidden"
    )}
  >
    <div className="absolute bottom-2 left-[19px] top-2 w-px bg-gradient-to-b from-amber-200 via-slate-200 to-transparent" />
    {groups.map(([year, entries]) => (
      <div key={year} className="relative pl-12">
        <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white shadow-sm">
          {year}
        </div>
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.monthKey}
              className={cn(
                "rounded-2xl border border-slate-100 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.035)]",
                compact ? "team-motion-card p-2.5" : "p-3"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <MemberAvatar name={entry.firstName} size="sm" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {entry.monthLabel}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.firstName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.role ?? "Collaborateur"}
                    </p>
                  </div>
                </div>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  {formatCount(entry.positiveCount, "mention", "mentions")}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

type ComplimentCardProps = {
  compliment: ClientCompliment;
  index?: number;
  animated?: boolean;
};

const ComplimentCard = ({
  compliment,
  index = 0,
  animated = false
}: ComplimentCardProps) => (
  <article
    className={cn(
      "rounded-[20px] border border-slate-100 bg-gradient-to-br from-white to-slate-50/70 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.045)] sm:rounded-[24px] sm:p-4",
      animated && "team-motion-card"
    )}
    style={animated ? { animationDelay: `${Math.min(index, 8) * 45}ms` } : undefined}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Heart className="h-4 w-4 fill-rose-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {compliment.memberName}
          </p>
          <p className="text-xs text-slate-500">
            {compliment.memberRole ?? "Collaborateur"}
          </p>
        </div>
      </div>
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <Star className="mr-1 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        Google {formatRating(compliment.rating)}
      </Badge>
    </div>
    <blockquote className="mt-3 text-sm leading-6 text-slate-700 sm:mt-4 sm:text-[15px] sm:leading-7">
      “{compliment.quote}”
    </blockquote>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <span className="text-xs font-medium text-slate-400">
        {formatClientDate(compliment.date)}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {compliment.qualities.slice(0, 2).map((quality) => (
          <span
            key={quality.label}
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          >
            {quality.label}
          </span>
        ))}
      </div>
    </div>
  </article>
);

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
  const [complimentFilter, setComplimentFilter] = useState("all");
  const [complimentSearch, setComplimentSearch] = useState("");
  const [complimentSort, setComplimentSort] = useState<ComplimentSort>("recent");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [complimentsOpen, setComplimentsOpen] = useState(false);

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
    queryKey: ["team-reviews", session?.user?.id ?? null],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return [] as ReviewRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("google_reviews")
        .select("id, rating, comment, create_time, location_id, author_name")
        .eq("user_id", session.user.id)
        .order("create_time", { ascending: false });
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as ReviewRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const allReviews = useMemo(
    () => reviewsQuery.data ?? [],
    [reviewsQuery.data]
  );
  const currentReviews = useMemo(
    () =>
      allReviews.filter((review) =>
        isWithinRange(review, monthRange.start, monthRange.end)
      ),
    [allReviews, monthRange.end, monthRange.start]
  );
  const previousReviews = useMemo(
    () =>
      allReviews.filter((review) =>
        isWithinRange(
          review,
          monthRange.previousStart,
          new Date(monthRange.start.getTime() - 1)
        )
      ),
    [allReviews, monthRange.previousStart, monthRange.start]
  );

  const monthlyStats = useMemo(
    () => getMonthlyTeamStats(members, currentReviews, previousReviews),
    [members, currentReviews, previousReviews]
  );
  const hallOfFameEntries = useMemo(
    () =>
      getHallOfFameEntries(
        members,
        allReviews,
        monthRange.start
      ),
    [allReviews, members, monthRange.start]
  );
  const hallOfFameByYear = useMemo(
    () => groupHallOfFameByYear(hallOfFameEntries),
    [hallOfFameEntries]
  );
  const hallOfFamePreviewByYear = useMemo(
    () => groupHallOfFameByYear(hallOfFameEntries.slice(0, 6)),
    [hallOfFameEntries]
  );

  const activeMembers = useMemo(
    () => members.filter((member) => member.is_active ?? true),
    [members]
  );
  const podium = monthlyStats.rankedMembers.slice(0, 3);
  const podiumSlots = getPodiumSlots(podium);
  const employeeOfMonth = monthlyStats.employeeOfMonth;
  const hasRealWinner = Boolean(employeeOfMonth && employeeOfMonth.positiveCount > 0);
  const citedMemberStats = monthlyStats.memberStats.filter(
    (member) => member.is_active && member.mentions > 0
  );
  const positiveReviewsThisMonth = currentReviews.filter(isPositiveReview).length;
  const employeeRecognitionShare =
    employeeOfMonth && positiveReviewsThisMonth > 0
      ? Math.round((employeeOfMonth.positiveCount / positiveReviewsThisMonth) * 100)
      : 0;
  const allCompliments = useMemo(
    () => getClientCompliments(members, allReviews),
    [allReviews, members]
  );
  const previewCompliments = useMemo(
    () => allCompliments.slice(0, 6),
    [allCompliments]
  );
  const complimentFilters = useMemo(() => {
    const uniqueMembers = new Map<string, string>();
    allCompliments.forEach((compliment) => {
      uniqueMembers.set(compliment.memberId, compliment.memberName);
    });
    return [
      { id: "all", label: "Tous" },
      ...Array.from(uniqueMembers.entries()).map(([id, label]) => ({
        id,
        label
      }))
    ];
  }, [allCompliments]);
  const visibleCompliments = useMemo(() => {
    const search = normalizeForMatching(complimentSearch);
    return allCompliments
      .filter((compliment) => {
        const matchesMember =
          complimentFilter === "all" || compliment.memberId === complimentFilter;
        const searchable = normalizeForMatching(
          `${compliment.quote} ${compliment.memberName} ${compliment.qualities
            .map((quality) => quality.label)
            .join(" ")}`
        );
        const matchesSearch = !search || searchable.includes(search);
        return matchesMember && matchesSearch;
      })
      .sort((a, b) => {
        if (complimentSort === "rating") {
          if ((b.rating ?? 0) !== (a.rating ?? 0)) {
            return (b.rating ?? 0) - (a.rating ?? 0);
          }
          return getTimestamp(b.date) - getTimestamp(a.date);
        }
        if (complimentSort === "popular") {
          if (b.popularity !== a.popularity) return b.popularity - a.popularity;
          return getTimestamp(b.date) - getTimestamp(a.date);
        }
        return getTimestamp(b.date) - getTimestamp(a.date);
      });
  }, [allCompliments, complimentFilter, complimentSearch, complimentSort]);
  const recognitionRecords = useMemo(
    () => getRecognitionRecords(members, allReviews, monthlyStats),
    [allReviews, members, monthlyStats]
  );
  const displayRecords = useMemo(
    () =>
      recognitionRecords
        .map(getRecordPresentation)
        .sort((a, b) => {
          const order: Record<RecordTone, number> = {
            trophy: 0,
            progress: 1,
            streak: 2,
            regular: 3,
            default: 4
          };
          return order[a.tone] - order[b.tone];
        })
        .slice(0, 4),
    [recognitionRecords]
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

  const settingsEnabled =
    teamSettingsQuery.data?.enabled ?? teamEnabled ?? true;

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
    if (!emailDraft || !employeeOfMonth?.email?.trim()) {
      setMessage("Ajoutez un email collaborateur avant de préparer l’envoi.");
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    const fullDraft = `À: ${employeeOfMonth.email}
Objet: ${emailDraft.subject}

${emailDraft.body}`;
    let copied = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fullDraft);
        copied = true;
      } catch {
        copied = false;
      }
    }

    const mailto = `mailto:${encodeURIComponent(
      employeeOfMonth.email
    )}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(
      emailDraft.body
    )}`;
    try {
      window.location.href = mailto;
      setMessage(
        copied
          ? "Email préparé et copié dans le presse-papiers."
          : "Email préparé. Copie indisponible sur ce navigateur."
      );
    } catch {
      setMessage(
        copied
          ? "Email copié. Ouvrez votre app mail pour l’envoyer."
          : "Action mail indisponible sur ce navigateur."
      );
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const employeeLevel = employeeOfMonth
    ? getRecognitionLevel(employeeOfMonth.positiveCount)
    : null;
  const employeeNextLevel = employeeOfMonth
    ? getNextRecognitionLevel(employeeOfMonth.positiveCount)
    : null;
  const employeeRecognitionProgress = employeeOfMonth
    ? getRecognitionProgress(employeeOfMonth.positiveCount)
    : 0;
  const employeeSummary = employeeOfMonth
    ? buildRecognitionSummary(employeeOfMonth)
    : null;
  const employeeMainQuote = employeeOfMonth?.clientQuotes[0] ?? null;
  const employeeSecondaryQuotes = employeeOfMonth?.clientQuotes.slice(1) ?? [];
  const rewardSuggestion = getRewardSuggestion(employeeOfMonth?.id ?? null, month);

  const recognitionEmptyTitle =
    activeMembers.length === 0
      ? "Équipe à configurer"
      : monthlyStats.reviewsAnalyzed === 0
        ? "Avis à synchroniser sur ce mois"
        : monthlyStats.exploitableReviews === 0
          ? "Textes clients à venir"
          : "Premières mentions à venir";
  const recognitionEmptyText =
    activeMembers.length === 0
      ? "Ajoutez au moins un collaborateur actif pour commencer à détecter les mentions dans les avis clients."
      : monthlyStats.reviewsAnalyzed === 0
        ? "Le podium apparaîtra dès que des avis Google du mois sélectionné seront disponibles."
        : monthlyStats.exploitableReviews === 0
          ? "Les prochains avis textuels permettront de mettre les collaborateurs en lumière."
          : "Le podium se remplira dès qu'un avis positif citera précisément un membre actif de l'équipe.";

  return (
    <div className="team-page min-w-0 overflow-x-hidden">
      <style>
        {`@keyframes teamPodiumIn {
          0% { opacity: 0; transform: translateY(28px) scale(0.96); }
          70% { opacity: 1; transform: translateY(-6px) scale(1.015); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes teamFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes teamCounterPop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .team-motion-card {
          animation: teamFadeUp 520ms ease-out both;
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        }
        .team-motion-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.08);
        }
        .team-counter {
          animation: teamCounterPop 480ms ease-out both;
        }
        .team-podium-stage {
          perspective: 1000px;
        }
        .team-podium-block {
          transform: rotateX(56deg) rotateZ(-1deg);
          transform-origin: bottom center;
        }
        .team-focus-ring:focus-visible {
          outline: 2px solid rgba(15, 23, 42, 0.22);
          outline-offset: 3px;
        }
        @media (max-width: 767px) {
          .team-podium-block {
            display: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .team-motion-card,
          .team-counter {
            animation: none !important;
            transition: none !important;
          }
          .team-motion-card:hover {
            transform: none;
          }
        }
        `}
      </style>

      <div className="team-screen space-y-4 md:space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-4 text-white shadow-[0_24px_70px_rgba(2,6,23,0.20)] sm:p-6 lg:p-8">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400" />

        <div className="relative grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-white/15 bg-white/10 text-slate-100">
              Reconnaissance client
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-4xl">
                Équipe & reconnaissance client
              </h1>
              <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-slate-300 sm:block sm:text-base">
                Transformez les compliments de vos clients en motivation durable.
                Chaque avis positif devient une reconnaissance concrète du
                travail de votre équipe.
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

        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:mt-7 sm:gap-3 xl:grid-cols-4">
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
              className="rounded-2xl border border-white/10 bg-white/[0.08] p-3 sm:p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {metric.label}
                </p>
                <metric.Icon className="h-4 w-4 text-amber-200" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white sm:mt-3 sm:text-3xl">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.045)] sm:p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Pilotage reconnaissance
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">
            Les emails, invitations, rôles et rapports mensuels restent gérés
            dans Paramètres.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/settings?tab=team"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100 sm:h-9 sm:min-h-0"
          >
            <Settings className="h-4 w-4" />
            Gérer dans Paramètres
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Gamification</span>
            <button
              type="button"
              className={cn(
                "team-focus-ring h-6 w-11 rounded-full border transition",
                settingsEnabled ? "bg-emerald-500" : "bg-slate-200"
              )}
              aria-label="Activer ou désactiver la gamification de reconnaissance"
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
              <CardContent className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
                {membersQuery.isLoading || reviewsQuery.isLoading ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Skeleton className="h-56 w-full rounded-2xl" />
                    <Skeleton className="h-64 w-full rounded-2xl" />
                    <Skeleton className="h-56 w-full rounded-2xl" />
                  </div>
                ) : podiumSlots.length === 0 ? (
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
                  <div className="team-podium-stage rounded-2xl bg-gradient-to-b from-slate-50 via-white to-slate-100/70 p-3 sm:rounded-[28px] sm:p-6">
                    <div className="grid gap-4 md:grid-cols-[0.85fr_1.2fr_0.85fr] md:items-end">
                      {podiumSlots.map(({ member, meta, position }, index) => (
                        <article
                          key={member.id}
                          className={cn(
                            "team-motion-card relative flex flex-col items-center text-center",
                            position === "first" && "md:col-start-2 md:row-start-1",
                            position === "second" && "md:col-start-1 md:row-start-1",
                            position === "third" && "md:col-start-3 md:row-start-1"
                          )}
                          style={{
                            animation: "teamPodiumIn 640ms cubic-bezier(.2,.9,.2,1) both",
                            animationDelay: `${index * 110}ms`
                          }}
                        >
                          <div
                            className={cn(
                              "relative z-10 rounded-[22px] border bg-white/92 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur sm:rounded-[28px] sm:p-4",
                              position === "first"
                                ? "w-full border-amber-200 shadow-[0_24px_64px_rgba(245,158,11,0.18)] sm:max-w-[300px] sm:p-5"
                                : "w-full max-w-[220px] border-slate-200"
                            )}
                          >
                            <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white bg-white px-2 py-1 shadow-sm">
                              <meta.Icon
                                className={cn(
                                  "h-4 w-4",
                                  position === "first"
                                    ? "text-amber-600"
                                    : position === "second"
                                      ? "text-slate-500"
                                      : "text-orange-600"
                                )}
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                {meta.label}
                              </span>
                            </div>
                            <div
                              className={cn(
                                "mx-auto flex items-center justify-center rounded-[24px] bg-slate-950 text-white shadow-[0_16px_35px_rgba(15,23,42,0.18)]",
                                position === "first"
                                  ? "h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl"
                                  : "h-14 w-14 text-base sm:h-16 sm:w-16 sm:text-lg"
                              )}
                            >
                              {initialsFromName(member.first_name)}
                            </div>
                            <p
                              className={cn(
                                "mt-4 font-semibold tracking-normal text-slate-950",
                                position === "first" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                              )}
                            >
                              {member.first_name}
                            </p>
                            <p className="text-sm text-slate-500">
                              {member.role ?? "Collaborateur"}
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <div className="rounded-2xl bg-slate-50 p-2.5 text-left sm:p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  Mentions
                                </p>
                                <p className="team-counter mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">
                                  {member.positiveCount}
                                </p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 p-2.5 text-left sm:p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  Note
                                </p>
                                <p className="team-counter mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">
                                  {formatRating(member.avgRating)}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {member.qualities.length > 0
                                ? `Les clients associent ${member.first_name} à ${member.qualities
                                    .map((quality) => quality.label)
                                    .slice(0, 2)
                                    .join(" et ")}.`
                                : "Une mise en lumière portée par les avis clients positifs."}
                            </p>
                          </div>
                          <div
                            className={cn(
                              "team-podium-block mt-2 w-full max-w-[260px] rounded-[18px] border shadow-[0_18px_45px_rgba(15,23,42,0.12)]",
                              position === "first"
                                ? "h-32 max-w-[300px] border-amber-200 bg-gradient-to-br from-amber-200 via-amber-100 to-white"
                                : position === "second"
                                  ? "h-20 border-slate-200 bg-gradient-to-br from-slate-200 via-white to-slate-100"
                                  : "h-16 border-orange-200 bg-gradient-to-br from-orange-200 via-orange-100 to-white"
                            )}
                          />
                          <div
                            className={cn(
                              "mt-1 rounded-full px-3 py-1 text-xs font-semibold",
                              position === "first"
                                ? "bg-amber-50 text-amber-700"
                                : position === "second"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-orange-50 text-orange-700"
                            )}
                          >
                            #{meta.rank}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
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
                <CardContent className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
                  {employeeOfMonth ? (
                    <div className="space-y-5">
                      <div className="flex items-center gap-4">
                        <MemberAvatar
                          name={employeeOfMonth.first_name}
                          imageUrl={employeeOfMonth.imageUrl}
                          size="lg"
                          className="shadow-card"
                        />
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                              <Trophy className="mr-1 h-3.5 w-3.5" />
                              Mise à l’honneur
                            </Badge>
                            {employeeLevel && (
                              <Badge className={employeeLevel.className}>
                                <employeeLevel.Icon className="mr-1 h-3.5 w-3.5" />
                                {employeeLevel.label}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-xl font-semibold text-slate-950">
                            {employeeOfMonth.first_name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {employeeOfMonth.role ?? "Collaborateur"}
                          </p>
                        </div>
                      </div>

                      <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {employeeSummary}
                      </p>

                      <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
                        <div className="rounded-2xl bg-slate-950 p-3 text-white sm:p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Score de reconnaissance
                          </p>
                          <p className="mt-3 text-sm leading-6 text-slate-300">
                            Les clients parlent de {employeeOfMonth.first_name} dans
                          </p>
                          <p className="team-counter mt-1 text-4xl font-semibold text-white sm:text-5xl">
                            {employeeRecognitionShare}%
                          </p>
                          <p className="text-sm text-slate-300">
                            des avis positifs.
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

                      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Reconnaissance client
                            </p>
                            <p className="text-xs text-slate-500">
                              Progression visuelle selon les mentions positives.
                            </p>
                          </div>
                          <Badge variant="neutral">
                            {employeeNextLevel
                              ? `Prochain : ${employeeNextLevel.label}`
                              : "Niveau max"}
                          </Badge>
                        </div>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-sky-400 transition-all duration-700 ease-out"
                            style={{ width: `${employeeRecognitionProgress}%` }}
                          />
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

                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="flex items-center gap-2">
                          <Quote className="h-4 w-4 text-slate-500" />
                          <p className="text-sm font-semibold text-slate-900">
                            Vraies citations clients
                          </p>
                        </div>
                        {employeeMainQuote ? (
                          <div className="mt-3 space-y-3">
                            <blockquote className="rounded-2xl border border-white bg-white px-3 py-3 text-base font-medium leading-7 text-slate-900 shadow-[0_16px_38px_rgba(15,23,42,0.06)] sm:px-4 sm:py-4 sm:text-lg sm:leading-8">
                              “{employeeMainQuote}”
                            </blockquote>
                            {employeeSecondaryQuotes.map((quote) => (
                              <blockquote
                                key={quote}
                                className="rounded-xl bg-white px-3 py-2 text-sm leading-6 text-slate-600"
                              >
                                “{quote}”
                              </blockquote>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            Les prochaines citations client apparaîtront ici.
                          </p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                        <div className="flex items-center gap-2">
                          <Gift className="h-4 w-4 text-amber-700" />
                          <p className="text-sm font-semibold text-slate-900">
                            Suggestion de récompense
                          </p>
                        </div>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {rewardSuggestion}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {REWARD_SUGGESTIONS.map((reward) => (
                            <span
                              key={reward}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-medium",
                                reward === rewardSuggestion
                                  ? "bg-white text-amber-800 shadow-sm"
                                  : "bg-amber-100/70 text-amber-700"
                              )}
                            >
                              {reward}
                            </span>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={handlePrepareEmail}
                        disabled={!employeeOfMonth.email?.trim()}
                        className="min-h-11 w-full"
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
                      Le prochain collaborateur cité positivement dans un avis
                      sera mis à l’honneur ici.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Hall of Fame</CardTitle>
                      <p className="text-sm text-slate-500">
                        Les 6 dernières reconnaissances mensuelles.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setHistoryOpen(true)}
                      disabled={hallOfFameEntries.length === 0}
                    >
                      <Trophy className="h-4 w-4 text-amber-600" />
                      Voir tout l’historique ({hallOfFameEntries.length} mois)
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {hallOfFamePreviewByYear.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                      Le premier employé du mois apparaîtra ici.
                    </div>
                  ) : (
                    <HallOfFameTimeline groups={hallOfFamePreviewByYear} compact />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.055)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
                  <h2 className="text-xl font-semibold tracking-normal text-slate-950">
                    Mur des compliments
                  </h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Aperçu des derniers compliments clients citant un collaborateur.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setComplimentsOpen(true)}
                disabled={allCompliments.length === 0}
              >
                <MessageCircle className="h-4 w-4" />
                Voir {formatCount(allCompliments.length, "compliment", "compliments")}
              </Button>
            </div>

            {allCompliments.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-7 text-center">
                <MessageCircle className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Les premiers compliments apparaîtront ici
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  Les citations apparaîtront dès qu'un avis positif contient un
                  texte et cite précisément un collaborateur actif.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid max-h-[520px] gap-3 overflow-hidden md:grid-cols-2 xl:grid-cols-3">
                {previewCompliments.map((compliment, index) => (
                  <ComplimentCard
                    key={compliment.id}
                    compliment={compliment}
                    index={index}
                    animated
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <Card className="team-motion-card">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Records EGIA</CardTitle>
                    <p className="text-sm text-slate-500">
                      Repères positifs calculés sans donnée inventée.
                    </p>
                  </div>
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent>
                {displayRecords.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                    Les records apparaîtront après quelques mentions positives.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {displayRecords.map((record) => (
                      <div
                        key={record.label}
                        className={cn(
                          "team-motion-card rounded-2xl border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]",
                          record.tone === "trophy" &&
                            "border-amber-100 bg-amber-50/60",
                          record.tone === "progress" &&
                            "border-emerald-100 bg-emerald-50/60",
                          record.tone === "streak" &&
                            "border-orange-100 bg-orange-50/60",
                          record.tone === "regular" &&
                            "border-sky-100 bg-sky-50/60",
                          record.tone === "default" &&
                            "border-slate-100 bg-slate-50/70"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-2xl" aria-hidden="true">
                            {record.icon}
                          </span>
                          <Badge className="border-white/80 bg-white/80 text-slate-700">
                            {record.value}
                          </Badge>
                        </div>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {record.shortLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {record.memberName}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {record.detail}
                        </p>
                      </div>
                    ))}
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

            <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tendances clients</CardTitle>
                <p className="text-sm text-slate-500">
                  Ce que les clients apprécient de plus en plus par rapport au
                  mois précédent.
                </p>
              </CardHeader>
              <CardContent>
                {monthlyStats.qualityTrends.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                    Les tendances apparaîtront avec plus de retours clients.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {monthlyStats.qualityTrends.map((trend) => (
                      <div
                        key={trend.label}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-700" />
                          <p className="text-sm font-semibold capitalize text-slate-900">
                            {trend.label}
                          </p>
                        </div>
                        <Badge className="border-emerald-200 bg-white text-emerald-700">
                          +{trend.delta}
                        </Badge>
                      </div>
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
                    "🌱 Premières mentions",
                    "Au moins un avis positif cite le collaborateur."
                  ],
                  [
                    "⭐ En progression",
                    "Plus de mentions positives que le mois précédent."
                  ],
                  ["🤝 Présent dans l'équipe", "Collaborateur actif suivi dans l'équipe."]
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
            </div>
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
                <div className="space-y-3">
                  {monthlyStats.memberStats.map((member) => {
                    const evolution = getEvolutionMeta(
                      member.positiveCount,
                      member.previousPositiveCount
                    );
                    const memberLevel = getRecognitionLevel(member.positiveCount);
                    const EvolutionIcon =
                      evolution.direction === "up" ? TrendingUp : Sparkles;

                    return (
                      <details
                        key={member.id}
                        className={cn(
                          "team-motion-card group rounded-2xl border bg-white shadow-[0_12px_30px_rgba(15,23,42,0.035)] transition",
                          member.is_active
                            ? "border-slate-100"
                            : "border-slate-100 opacity-80"
                        )}
                      >
                        <summary className="team-focus-ring flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                          <div className="flex min-w-0 items-center gap-3">
                            <MemberAvatar
                              name={member.first_name}
                              imageUrl={member.imageUrl}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {member.first_name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {member.role ?? "Collaborateur"}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge className="border-slate-200 bg-slate-50 text-slate-700">
                              {formatCount(member.mentions, "mention", "mentions")}
                            </Badge>
                            <Badge className={memberLevel.className}>
                              <memberLevel.Icon className="mr-1 h-3.5 w-3.5" />
                              {memberLevel.label}
                            </Badge>
                            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition group-open:bg-slate-950 group-open:text-white">
                              ▼ Voir les détails
                            </span>
                          </div>
                        </summary>

                        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                Note
                              </p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">
                                {formatRating(member.avgRating)}
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
                                Taux associé
                              </p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">
                                {formatRatio(member.positiveRate)}
                              </p>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm",
                              evolution.direction === "up"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            )}
                          >
                            <div className="flex items-center gap-2 font-semibold">
                              <EvolutionIcon className="h-4 w-4" />
                              {evolution.display}
                            </div>
                            <span className="text-xs opacity-80">
                              {evolution.details}
                            </span>
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
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                🤝 Présent dans l'équipe
                              </span>
                            )}
                            {member.badges.map((badge) => (
                              <Badge
                                key={badge}
                                className={
                                  badge === "🌱 Premières mentions"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : badge === "⭐ En progression"
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                      : badge === "Le plus cité"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-slate-50 text-slate-600"
                                }
                              >
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </details>
                    );
                  })}
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
                        <MemberAvatar
                          name={member.first_name}
                          imageUrl={getMemberImageUrl(member)}
                          size="sm"
                          className="bg-slate-100 text-slate-700"
                        />
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
                          {member.is_active ? "Suivi" : "Hors suivi"}
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

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/60 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)] sm:rounded-[28px]"
            role="dialog"
            aria-modal="true"
            aria-label="Historique complet du Hall of Fame"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
              <div>
                <p className="text-lg font-semibold text-slate-950">
                  Historique Hall of Fame
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Frise complète des employés du mois calculés depuis les avis.
                </p>
              </div>
              <button
                type="button"
                className="team-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                onClick={() => setHistoryOpen(false)}
                aria-label="Fermer l’historique"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
              {hallOfFameByYear.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  Le premier employé du mois apparaîtra ici.
                </div>
              ) : (
                <HallOfFameTimeline groups={hallOfFameByYear} />
              )}
            </div>
          </div>
        </div>
      )}

      {complimentsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4">
          <div
            className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/60 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.25)] sm:rounded-[28px]"
            role="dialog"
            aria-modal="true"
            aria-label="Tous les compliments clients"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
              <div>
                <p className="text-lg font-semibold text-slate-950">
                  Tous les compliments
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Recherche, filtres et tri sur toutes les citations clients.
                </p>
              </div>
              <button
                type="button"
                className="team-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                onClick={() => setComplimentsOpen(false)}
                aria-label="Fermer les compliments"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px]">
                <label className="relative">
                  <span className="sr-only">Rechercher dans les compliments</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                    value={complimentSearch}
                    onChange={(event) => setComplimentSearch(event.target.value)}
                    placeholder="Rechercher un mot, une qualité..."
                  />
                </label>
                <select
                  className="h-10 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                  value={complimentSort}
                  aria-label="Trier les compliments"
                  onChange={(event) =>
                    setComplimentSort(event.target.value as ComplimentSort)
                  }
                >
                  <option value="recent">Plus récent</option>
                  <option value="popular">Plus populaire</option>
                  <option value="rating">Meilleure note</option>
                </select>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {complimentFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setComplimentFilter(filter.id)}
                    aria-pressed={complimentFilter === filter.id}
                    className={cn(
                      "team-focus-ring shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      complimentFilter === filter.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-4 sm:p-5">
              {visibleCompliments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-7 text-center text-sm text-slate-500">
                  Ajustez les filtres pour retrouver les compliments clients.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleCompliments.map((compliment) => (
                    <ComplimentCard
                      key={compliment.id}
                      compliment={compliment}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { TeamRanking };
