import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  Bot,
  Check,
  CheckCircle,
  FileText,
  Flag,
  Lock,
  Radar,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import type { AppNotificationBase } from "../lib/notifications";
import {
  buildCoachResult,
  type CoachMilestone,
  type CoachScoreLevel
} from "../services/coach";

type ProgressProps = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  notifications: AppNotificationBase[];
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
};

type Achievement = {
  title: string;
  description: string;
  unlocked: boolean;
  date?: string;
  statusLabel?: "À venir" | "Non encore mesuré" | "Débloqué";
};

type TrophyItem = Achievement & {
  icon: typeof Trophy;
};

type FeatureUnlock = {
  label: string;
  description: string;
  unlocked: boolean;
  icon: typeof Sparkles;
  statusLabel: "À venir" | "Non encore mesuré" | "Débloqué";
};

type KpiSummaryCache = {
  counts?: {
    reviews_total?: number | null;
    reviews_with_text?: number | null;
    reviews_replied?: number | null;
    reviews_replyable?: number | null;
  };
  ratings?: {
    avg_rating?: number | null;
  };
  response?: {
    response_rate_pct?: number | null;
  };
  sentiment?: {
    sentiment_samples?: number | null;
  };
  top_tags?: Array<{ tag?: string | null; count?: number | null }>;
};

type AiKpiCache = {
  sentiment?: {
    samples?: number | null;
  };
  topTags?: Array<{ tag?: string | null; count?: number | null }>;
  priorityCount?: number | null;
};

type AlertsCache = Array<{
  resolved_at?: string | null;
  severity?: "low" | "medium" | "high" | string | null;
}>;

type BusinessSettingsCache = {
  active_location_ids?: unknown;
};

type CompetitorCache = Array<unknown>;

type CoachProgressCacheData = {
  kpiSummary: KpiSummaryCache | null;
  aiStats: AiKpiCache | null;
  activeLocationsCount: number;
  alertsOpenCount: number | null;
  reportsCount: number | null;
  teamMembersCount: number | null;
  competitorWatchActive: boolean | null;
};

const formatDate = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  } catch {
    return undefined;
  }
};

const getProgressLevel = (level: CoachScoreLevel) => {
  switch (level) {
    case "expert":
      return {
        label: "Expert",
        badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
        barClass: "bg-violet-400",
        message: "Votre réputation locale atteint un niveau avancé."
      };
    case "gold":
      return {
        label: "Gold",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        barClass: "bg-amber-300",
        message: "Votre système réputation devient un vrai avantage business."
      };
    case "silver":
      return {
        label: "Silver",
        badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
        barClass: "bg-slate-300",
        message: "Votre base est solide, les prochains leviers sont clairs."
      };
    case "bronze":
    default:
      return {
        label: "Bronze",
        badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
        barClass: "bg-orange-300",
        message: "Votre parcours EGIA commence, chaque action débloque de la valeur."
      };
  }
};

const getMilestoneStatus = (
  milestone: CoachMilestone
): "À venir" | "Non encore mesuré" | "Débloqué" => {
  if (milestone.achieved) {
    return "Débloqué";
  }

  return milestone.missingFields.length > 0 ? "Non encore mesuré" : "À venir";
};

const getMilestoneDate = (milestone: CoachMilestone): string | undefined =>
  milestone.achievedAt
    ? formatDate(milestone.achievedAt)
    : milestone.achieved
      ? milestone.evidence ?? "Débloqué"
      : undefined;

const describeMilestone = (milestone: CoachMilestone): string => {
  if (milestone.achieved && milestone.evidence) {
    return `${milestone.description} ${milestone.evidence}.`;
  }

  if (!milestone.achieved && milestone.missingFields.length > 0) {
    return `${milestone.description} Non encore mesuré.`;
  }

  return milestone.description;
};

const toAchievement = (milestone: CoachMilestone): Achievement => ({
  title: milestone.label,
  description: describeMilestone(milestone),
  unlocked: milestone.achieved,
  date: getMilestoneDate(milestone),
  statusLabel: getMilestoneStatus(milestone)
});

const milestoneHref: Record<CoachMilestone["id"], string> = {
  "account-created": "/connect",
  "google-connected": "/connect",
  "first-location-imported": "/settings?tab=locations",
  "first-reviews-synced": "/settings?tab=locations",
  "first-review-replied": "/coach",
  "response-rate-90": "/coach",
  "reviews-treated-50": "/coach",
  "reviews-synced-100": "/coach",
  "first-automation": "/automation",
  "first-competitor-watch": "/competitors",
  "first-pdf-report": "/reports"
};

const getMilestone = (
  milestones: CoachMilestone[],
  id: CoachMilestone["id"]
): CoachMilestone => {
  const milestone = milestones.find((item) => item.id === id);
  if (!milestone) {
    throw new Error(`Missing coach milestone: ${id}`);
  }
  return milestone;
};

const getLastCachedData = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): T | null => {
  const entries = queryClient.getQueriesData<T>({ queryKey });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const data = entries[index]?.[1];
    if (data !== undefined && data !== null) {
      return data;
    }
  }
  return null;
};

const getCachedArrayCount = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): number | null => {
  const data = getLastCachedData<T[]>(queryClient, queryKey);
  return Array.isArray(data) ? data.length : null;
};

const getActiveLocationsCount = (
  businessSettings: BusinessSettingsCache | null,
  fallbackCount: number
): number => {
  const activeLocationIds = businessSettings?.active_location_ids;
  if (!Array.isArray(activeLocationIds)) {
    return fallbackCount;
  }

  const count = activeLocationIds.filter(Boolean).length;
  return count > 0 ? count : fallbackCount;
};

const getCachedAlertsOpenCount = (
  queryClient: QueryClient,
  userId: string | null
): number | null => {
  if (!userId) {
    return null;
  }

  const alerts = getLastCachedData<AlertsCache>(queryClient, ["alerts", userId]);
  if (!Array.isArray(alerts)) {
    return null;
  }

  return alerts.filter((alert) => !alert.resolved_at).length;
};

const getCompetitorWatchActive = (
  queryClient: QueryClient,
  userId: string | null
): boolean | null => {
  if (!userId) {
    return null;
  }

  const followed = queryClient.getQueriesData<CompetitorCache>({
    queryKey: ["competitors-followed", userId]
  });
  if (followed.some(([, data]) => Array.isArray(data) && data.length > 0)) {
    return true;
  }

  const radar = queryClient.getQueriesData<CompetitorCache>({
    queryKey: ["competitors-radar", userId]
  });
  if (radar.some(([, data]) => Array.isArray(data) && data.length > 0)) {
    return true;
  }

  return followed.length > 0 || radar.length > 0 ? false : null;
};

const readCoachProgressCacheData = (
  queryClient: QueryClient,
  userId: string | null,
  locationsCount: number
): CoachProgressCacheData => {
  if (!userId) {
    return {
      kpiSummary: null,
      aiStats: null,
      activeLocationsCount: locationsCount,
      alertsOpenCount: null,
      reportsCount: null,
      teamMembersCount: null,
      competitorWatchActive: null
    };
  }

  const coachKpiSummary = getLastCachedData<KpiSummaryCache>(queryClient, [
    "coach-health-kpi",
    userId
  ]);
  const dashboardKpiSummary = getLastCachedData<KpiSummaryCache>(queryClient, [
    "kpi-summary",
    userId
  ]);
  const businessSettings = getLastCachedData<BusinessSettingsCache>(
    queryClient,
    ["business-settings", userId]
  );
  const reportsCount =
    getCachedArrayCount<unknown>(queryClient, ["generated-reports", userId]) ??
    getCachedArrayCount<unknown>(queryClient, ["reports", userId]);

  return {
    kpiSummary: coachKpiSummary ?? dashboardKpiSummary,
    aiStats: getLastCachedData<AiKpiCache>(queryClient, ["ai-kpis", userId]),
    activeLocationsCount: getActiveLocationsCount(
      businessSettings,
      locationsCount
    ),
    alertsOpenCount: getCachedAlertsOpenCount(queryClient, userId),
    reportsCount,
    teamMembersCount: getCachedArrayCount<unknown>(queryClient, [
      "team-members",
      userId
    ]),
    competitorWatchActive: getCompetitorWatchActive(queryClient, userId)
  };
};

const getNotificationActionCount = (
  notifications: AppNotificationBase[]
): number =>
  notifications.filter((notification) => notification.requiresAction === true)
    .length;

const getDominantTags = (
  kpiSummary: KpiSummaryCache | null,
  aiStats: AiKpiCache | null
) =>
  (aiStats?.topTags?.length ? aiStats.topTags : kpiSummary?.top_tags)?.filter(
    (tag): tag is { tag: string; count?: number | null } =>
      typeof tag.tag === "string" && tag.tag.trim().length > 0
  ) ?? null;

const Progress = ({
  session,
  googleStatus,
  locations,
  notifications
}: ProgressProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(() => {
      setCacheVersion((version) => version + 1);
    });
  }, [queryClient]);

  const cachedCoachData = useMemo(
    () => readCoachProgressCacheData(queryClient, userId, locations.length),
    [cacheVersion, locations.length, queryClient, userId]
  );
  const kpiSummary = cachedCoachData.kpiSummary;
  const aiStats = cachedCoachData.aiStats;
  const notificationActionCount = getNotificationActionCount(notifications);
  const reviewsReplyable = kpiSummary?.counts?.reviews_replyable ?? null;
  const reviewsReplied = kpiSummary?.counts?.reviews_replied ?? null;
  const unansweredReviewsCount =
    typeof reviewsReplyable === "number" && typeof reviewsReplied === "number"
      ? Math.max(0, reviewsReplyable - reviewsReplied)
      : null;
  const aiSamples =
    aiStats?.sentiment?.samples ?? kpiSummary?.sentiment?.sentiment_samples ?? null;
  const alertsOpenCount =
    cachedCoachData.alertsOpenCount ?? notificationActionCount;
  const coachResult = buildCoachResult({
    googleConnected: googleStatus === "connected",
    activeLocationsCount: cachedCoachData.activeLocationsCount,
    totalLocationsCount: locations.length,
    totalReviews: kpiSummary?.counts?.reviews_total,
    reviewsWithText: kpiSummary?.counts?.reviews_with_text,
    averageRating: kpiSummary?.ratings?.avg_rating,
    responseRate: kpiSummary?.response?.response_rate_pct,
    criticalReviewsCount: aiStats?.priorityCount ?? notificationActionCount,
    unansweredReviewsCount,
    aiInsightsReady:
      typeof aiSamples === "number" && Number.isFinite(aiSamples)
        ? aiSamples > 0
        : undefined,
    dominantTags: getDominantTags(kpiSummary, aiStats),
    alertsOpenCount,
    automationCount: undefined,
    teamMembersCount: cachedCoachData.teamMembersCount,
    competitorWatchActive: cachedCoachData.competitorWatchActive,
    reportsCount: cachedCoachData.reportsCount,
    accountCreatedAt: session?.user.created_at ?? null
  });
  const milestones = coachResult.milestones;
  const nextMilestone =
    milestones.find((milestone) => !milestone.achieved) ??
    milestones[milestones.length - 1];
  const progressScore = coachResult.score.value;
  const level = getProgressLevel(coachResult.score.level);

  const timeline: Achievement[] = [
    toAchievement(getMilestone(milestones, "account-created")),
    toAchievement(getMilestone(milestones, "google-connected")),
    toAchievement(getMilestone(milestones, "first-location-imported")),
    toAchievement(getMilestone(milestones, "first-reviews-synced")),
    toAchievement(getMilestone(milestones, "first-automation")),
    toAchievement(getMilestone(milestones, "first-pdf-report"))
  ];

  const trophies: TrophyItem[] = [
    {
      icon: Trophy,
      ...toAchievement(getMilestone(milestones, "first-review-replied"))
    },
    {
      icon: Star,
      ...toAchievement(getMilestone(milestones, "reviews-treated-50"))
    },
    {
      icon: BarChart3,
      ...toAchievement(getMilestone(milestones, "response-rate-90"))
    },
    {
      icon: Zap,
      ...toAchievement(getMilestone(milestones, "first-automation"))
    },
    {
      icon: Award,
      ...toAchievement(getMilestone(milestones, "reviews-synced-100"))
    },
    {
      icon: Radar,
      ...toAchievement(getMilestone(milestones, "first-competitor-watch"))
    },
    {
      icon: FileText,
      ...toAchievement(getMilestone(milestones, "first-pdf-report"))
    }
  ];
  const automationMilestone = getMilestone(milestones, "first-automation");
  const competitorMilestone = getMilestone(milestones, "first-competitor-watch");
  const reportMilestone = getMilestone(milestones, "first-pdf-report");
  const aiFeatureUnlocked =
    typeof aiSamples === "number" && Number.isFinite(aiSamples) && aiSamples > 0;
  const aiFeatureStatus =
    typeof aiSamples === "number" && Number.isFinite(aiSamples)
      ? aiFeatureUnlocked
        ? "Débloqué"
        : "À venir"
      : "Non encore mesuré";

  const features: FeatureUnlock[] = [
    {
      icon: Bot,
      label: "Réponses IA",
      description: aiFeatureUnlocked
        ? `Drafts assistés pour répondre plus vite. ${aiSamples} avis analysé(s).`
        : `Drafts assistés pour répondre plus vite. ${aiFeatureStatus}.`,
      unlocked: aiFeatureUnlocked,
      statusLabel: aiFeatureStatus
    },
    {
      icon: Radar,
      label: "Veille",
      description: describeMilestone(competitorMilestone),
      unlocked: competitorMilestone.achieved,
      statusLabel: getMilestoneStatus(competitorMilestone)
    },
    {
      icon: Sparkles,
      label: "Widgets",
      description: "Preuves sociales intégrables. À venir.",
      unlocked: false,
      statusLabel: "À venir"
    },
    {
      icon: FileText,
      label: "Rapports",
      description: describeMilestone(reportMilestone),
      unlocked: reportMilestone.achieved,
      statusLabel: getMilestoneStatus(reportMilestone)
    },
    {
      icon: Zap,
      label: "Automatisations",
      description: describeMilestone(automationMilestone),
      unlocked: automationMilestone.achieved,
      statusLabel: getMilestoneStatus(automationMilestone)
    },
    {
      icon: Users,
      label: "Social Studio",
      description: "Activation marque et contenus. À venir.",
      unlocked: false,
      statusLabel: "À venir"
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                <Trophy size={14} />
                Parcours business
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  Niveau {level.label}
                </h2>
                <Badge className={level.badgeClass}>{level.label}</Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                {level.message}
              </p>
              <div className="mt-8">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-300">
                  <span>Progression utilisateur</span>
                  <span>{progressScore}/100</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full ${level.barClass} transition-all duration-700`}
                    style={{ width: `${progressScore}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <p className="text-sm font-semibold text-slate-200">
                Prochain déblocage
              </p>
              <p className="mt-2 text-2xl font-semibold">{nextMilestone.label}</p>
              <p className="mt-2 text-sm text-slate-300">
                {describeMilestone(nextMilestone)}
              </p>
              <Button
                className="mt-5 bg-white text-slate-950 hover:bg-slate-100"
                onClick={() => navigate(milestoneHref[nextMilestone.id])}
              >
                Continuer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Historique activité</CardTitle>
            <p className="text-sm text-slate-500">
              Les étapes qui structurent votre montée en puissance.
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-5 before:absolute before:left-3 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
              {timeline.map((item) => (
                <div key={item.title} className="relative flex gap-4">
                  <div
                    className={`z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white ${
                      item.unlocked
                        ? "border-emerald-200 text-emerald-600"
                        : "border-slate-200 text-slate-400"
                    }`}
                  >
                    {item.unlocked ? <Check size={14} /> : <Lock size={13} />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      {item.date && (
                        <span className="text-xs text-slate-500">{item.date}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Salle des trophées</CardTitle>
            <p className="text-sm text-slate-500">
              Des jalons business élégants, pensés pour garder le rythme.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {trophies.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className={`rounded-2xl border p-4 transition ${
                      item.unlocked
                        ? "border-emerald-100 bg-emerald-50/60"
                        : "border-slate-200 bg-slate-50 opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                          item.unlocked
                            ? "bg-white text-emerald-600"
                            : "bg-white text-slate-400"
                        }`}
                      >
                        {item.unlocked ? <Icon size={20} /> : <Lock size={18} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {item.title}
                          </p>
                          {item.unlocked && (
                            <CheckCircle size={15} className="text-emerald-600" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.description}
                        </p>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {item.unlocked
                            ? item.date ?? "Débloqué"
                            : item.statusLabel ?? "À venir"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Fonctionnalités débloquées</CardTitle>
          <p className="text-sm text-slate-500">
            Les capacités activées à mesure que votre système devient plus mature.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.label}
                  className={`rounded-2xl border p-4 ${
                    feature.unlocked
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        feature.unlocked
                          ? "bg-slate-950 text-white"
                          : "bg-white text-slate-400"
                      }`}
                    >
                      {feature.unlocked ? <Icon size={19} /> : <Lock size={17} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {feature.label}
                        </p>
                        <Badge variant={feature.unlocked ? "success" : "neutral"}>
                          {feature.unlocked ? "Débloqué" : feature.statusLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-white">
        <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <Flag size={14} />
              Passez au niveau supérieur
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Transformez vos prochains progrès en avantage commercial.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Continuez depuis le Coach EGIA, automatisez les actions répétitives
              et renforcez votre réputation locale.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
            <Button onClick={() => navigate("/coach")}>Ouvrir Coach</Button>
            <Button variant="outline" onClick={() => navigate("/automation")}>
              Voir automatisations
            </Button>
            <Button variant="outline" onClick={() => navigate("/inbox")}>
              Améliorer réputation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { Progress };
