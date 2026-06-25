import {
  buildCoachTrajectory,
  type CoachInput,
  type CoachMilestone,
  type CoachRecommendation as CoachEngineRecommendation,
  type CoachResult,
  type CoachScoreBreakdownItem,
  type CoachScoreLevel,
  getBestCoachRecommendation,
  getCoachNextLevelTarget,
  getCoachRecommendationPotentialGain,
  type CoachNextLevelTarget,
  type CoachTrajectory
} from "../../services/coach";

type HealthLevel = {
  label: "Bronze" | "Silver" | "Gold" | "Expert";
  badgeClass: string;
  accentClass: string;
  progressClass: string;
  ringColor: string;
};

type HealthChecklistItem = {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  href: string;
  cta: string;
};

type HealthRecommendation = {
  id: string;
  label: string;
  detail: string;
  href: string;
  cta: string;
  priority: "critical" | "business" | "optimization" | "growth";
  reason: string;
  impact: string;
  potentialGain: number;
};

type QuickAction = {
  label: string;
  href: string;
};

type ScoreFactor = {
  label: string;
  value: string;
  complete: boolean;
};

type BusinessHealthScoreModel = {
  score: number;
  level: HealthLevel;
  nextLevel: CoachNextLevelTarget;
  trajectory: CoachTrajectory;
  checklist: HealthChecklistItem[];
  completedChecklistCount: number;
  completedMilestones: CoachMilestone[];
  nextMilestone: CoachMilestone;
  recommendations: HealthRecommendation[];
  nextBestAction: HealthRecommendation;
  positiveScoreSignals: ScoreFactor[];
  blockedScoreSignals: ScoreFactor[];
  quickActions: QuickAction[];
  scoreFactors: ScoreFactor[];
  dataQuality: CoachResult["dataQuality"];
};

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const getHealthLevel = (level: CoachScoreLevel): HealthLevel => {
  switch (level) {
    case "expert":
      return {
        label: "Expert",
        badgeClass: "border-violet-300 bg-violet-100 text-violet-800 gap-2",
        accentClass: "text-violet-300",
        progressClass: "bg-violet-300",
        ringColor: "#a78bfa"
      };
    case "gold":
      return {
        label: "Gold",
        badgeClass: "border-amber-300 bg-amber-100 text-amber-800 gap-2",
        accentClass: "text-amber-300",
        progressClass: "bg-amber-300",
        ringColor: "#fbbf24"
      };
    case "silver":
      return {
        label: "Silver",
        badgeClass: "border-slate-200 bg-slate-100 text-slate-700 gap-2",
        accentClass: "text-slate-200",
        progressClass: "bg-slate-200",
        ringColor: "#cbd5e1"
      };
    case "bronze":
    default:
      return {
        label: "Bronze",
        badgeClass: "border-orange-300 bg-orange-100 text-orange-800 gap-2",
        accentClass: "text-orange-300",
        progressClass: "bg-orange-300",
        ringColor: "#fb923c"
      };
  }
};

const isValidPercent = (value: number | null | undefined): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;

const isValidRating = (value: number | null | undefined): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 5;

const formatCountLabel = (
  value: number | null | undefined,
  singular: string,
  plural: string
): string => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return `Aucun ${singular}`;
  }

  const count = Math.floor(value);
  return `${count} ${count > 1 ? plural : singular}`;
};

const getMilestone = (
  result: CoachResult,
  id: CoachMilestone["id"]
): CoachMilestone | null =>
  result.milestones.find((milestone) => milestone.id === id) ?? null;

const getBreakdownItem = (
  result: CoachResult,
  id: CoachScoreBreakdownItem["id"]
): CoachScoreBreakdownItem | null =>
  result.score.breakdown.find((item) => item.id === id) ?? null;

const hasRecommendation = (
  result: CoachResult,
  id: CoachEngineRecommendation["id"]
): boolean => result.recommendations.some((item) => item.id === id);

const mapRecommendationPriority = (
  priority: CoachEngineRecommendation["priority"]
): HealthRecommendation["priority"] => {
  if (priority === "critical") {
    return "critical";
  }
  if (priority === "high") {
    return "business";
  }
  if (priority === "medium") {
    return "optimization";
  }
  return "growth";
};

const recommendationRoutes: Record<
  CoachEngineRecommendation["id"],
  { href: string; cta: string; id: string }
> = {
  "prioritize-critical-reviews": {
    id: "critical-reviews",
    href: "/inbox?priority=critical&status=unanswered",
    cta: "Prioriser"
  },
  "reply-to-reviews": {
    id: "reply-rate",
    href: "/inbox?status=unanswered",
    cta: "Traiter"
  },
  "connect-google": {
    id: "connect-google",
    href: "/connect",
    cta: "Connecter"
  },
  "import-locations": {
    id: "import-locations",
    href: "/settings?tab=locations",
    cta: "Importer"
  },
  "calibrate-ai-voice": {
    id: "ai-insights",
    href: "/settings/brand-voice",
    cta: "Configurer"
  },
  "activate-alerts": {
    id: "alerts-next",
    href: "/alerts",
    cta: "Configurer"
  },
  "create-automation": {
    id: "automation-next",
    href: "/automation",
    cta: "Automatiser"
  },
  "add-competitor-watch": {
    id: "competitors-next",
    href: "/competitors",
    cta: "Comparer"
  },
  "create-report": {
    id: "report-next",
    href: "/reports",
    cta: "Créer"
  }
};

const mapRecommendationReason = (
  recommendation: CoachEngineRecommendation
): string => recommendation.reason;

const mapRecommendation = (
  recommendation: CoachEngineRecommendation,
  result: CoachResult
): HealthRecommendation => {
  const route = recommendationRoutes[recommendation.id];
  const potentialGain = getCoachRecommendationPotentialGain(
    recommendation,
    result
  );

  return {
    id: route.id,
    label: recommendation.title,
    detail: recommendation.description,
    href: route.href,
    cta: route.cta,
    priority: mapRecommendationPriority(recommendation.priority),
    reason: mapRecommendationReason(recommendation),
    impact: `${recommendation.impact} Gain estimé: +${potentialGain} pts.`,
    potentialGain
  };
};

const buildChecklist = (
  input: CoachInput,
  result: CoachResult
): HealthChecklistItem[] => {
  const googleMilestone = getMilestone(result, "google-connected");
  const locationsMilestone = getMilestone(result, "first-location-imported");
  const reviewsMilestone = getMilestone(result, "first-reviews-synced");
  const competitorMilestone = getMilestone(result, "first-competitor-watch");
  const aiBreakdown = getBreakdownItem(result, "ai-tags");
  const alertsBreakdown = getBreakdownItem(result, "alerts");
  const responseRateValid = isValidPercent(input.responseRate);
  const responseRateValue: number | null =
    responseRateValid && typeof input.responseRate === "number"
      ? input.responseRate
      : null;
  const locationsCount =
    typeof input.totalLocationsCount === "number" &&
    Number.isFinite(input.totalLocationsCount)
      ? Math.max(0, Math.floor(input.totalLocationsCount))
      : 0;
  const reviewsTotal =
    typeof input.totalReviews === "number" && Number.isFinite(input.totalReviews)
      ? Math.max(0, Math.floor(input.totalReviews))
      : 0;
  const aiReady = aiBreakdown !== null && aiBreakdown.points > 0;
  const alertsReady = alertsBreakdown !== null && alertsBreakdown.status !== "missing";

  return [
    {
      id: "google",
      label: "Connecter Google",
      description: googleMilestone?.achieved
        ? "La source principale est connectée."
        : "Reliez Google Business Profile pour démarrer.",
      complete: googleMilestone?.achieved ?? false,
      href: "/connect",
      cta: "Connecter"
    },
    {
      id: "locations",
      label: "Importer les établissements",
      description: locationsMilestone?.achieved
        ? `${locationsCount} établissement${locationsCount > 1 ? "s" : ""} disponible${locationsCount > 1 ? "s" : ""}.`
        : "Ajoutez les fiches à piloter dans EGIA.",
      complete: locationsMilestone?.achieved ?? false,
      href: "/settings?tab=locations",
      cta: "Importer"
    },
    {
      id: "reviews",
      label: "Faire remonter les avis",
      description: reviewsMilestone?.achieved
        ? `${reviewsTotal} avis analysables.`
        : "Synchronisez les premiers avis pour activer le coach.",
      complete: reviewsMilestone?.achieved ?? false,
      href: "/inbox",
      cta: "Voir l'inbox"
    },
    {
      id: "response-rate",
      label: "Atteindre 70% de réponse",
      description: responseRateValid
        ? `Taux actuel: ${formatPercent(responseRateValue)}.`
        : "Le taux apparaîtra après import des avis.",
      complete: responseRateValid && !hasRecommendation(result, "reply-to-reviews"),
      href: "/inbox",
      cta: "Répondre"
    },
    {
      id: "ai-identity",
      label: "Calibrer la voix IA",
      description: aiReady
        ? "Les premiers signaux IA sont disponibles."
        : "Définissez le ton de réponse pour gagner en constance.",
      complete: aiReady,
      href: "/settings/brand-voice",
      cta: "Configurer"
    },
    {
      id: "alerts",
      label: "Activer les alertes",
      description: "Recevez les signaux qui demandent une action rapide.",
      complete: alertsReady,
      href: "/alerts",
      cta: "Ouvrir"
    },
    {
      id: "competitors",
      label: "Surveiller la concurrence",
      description: "Comparez votre réputation locale aux concurrents.",
      complete: competitorMilestone?.achieved ?? false,
      href: "/competitors",
      cta: "Scanner"
    }
  ];
};

const buildScoreFactors = (
  input: CoachInput,
  result: CoachResult
): ScoreFactor[] => {
  const responseRateValid = isValidPercent(input.responseRate);
  const responseRateValue: number | null =
    responseRateValid && typeof input.responseRate === "number"
      ? input.responseRate
      : null;
  const ratingValue = isValidRating(input.averageRating)
    ? input.averageRating
    : null;
  const automationMilestone = getMilestone(result, "first-automation");
  const reviewsMilestone = getMilestone(result, "first-reviews-synced");
  const automationCount =
    typeof input.automationCount === "number" &&
    Number.isFinite(input.automationCount)
      ? Math.max(0, Math.floor(input.automationCount))
      : 0;
  const teamMembersCount =
    typeof input.teamMembersCount === "number" &&
    Number.isFinite(input.teamMembersCount)
      ? Math.max(0, Math.floor(input.teamMembersCount))
      : 0;

  return [
    {
      label: "Taux réponse",
      value: responseRateValid ? formatPercent(responseRateValue) : "À mesurer",
      complete: responseRateValid && !hasRecommendation(result, "reply-to-reviews")
    },
    {
      label: "Volume traité",
      value: reviewsMilestone?.achieved
        ? formatCountLabel(input.totalReviews, "avis", "avis")
        : "Aucun avis",
      complete: reviewsMilestone?.achieved ?? false
    },
    {
      label: "Réputation",
      value: ratingValue !== null ? `${ratingValue.toFixed(1)}/5` : "À mesurer",
      complete: ratingValue !== null && ratingValue >= 4
    },
    {
      label: "Automatisations",
      value:
        automationCount > 0
          ? `${automationCount} active${automationCount > 1 ? "s" : ""}`
          : "À activer",
      complete: automationMilestone?.achieved ?? false
    },
    {
      label: "Équipe",
      value:
        teamMembersCount > 0
          ? `${teamMembersCount} membre${teamMembersCount > 1 ? "s" : ""}`
          : "Solo",
      complete: teamMembersCount > 0
    }
  ];
};

const buildPositiveScoreSignals = (result: CoachResult): ScoreFactor[] =>
  result.score.breakdown
    .filter((item) => item.points > 0)
    .slice()
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((item) => ({
      label: item.label,
      value: `+${Math.round(item.points)} pts`,
      complete: item.status === "complete"
    }));

const buildBlockedScoreSignals = (result: CoachResult): ScoreFactor[] =>
  result.recommendations
    .map((recommendation) => ({
      label: recommendation.title,
      value: `+${getCoachRecommendationPotentialGain(
        recommendation,
        result
      )} pts estimés`,
      complete: false
    }))
    .slice(0, 3);

const buildBusinessHealthScoreModel = (
  coachResult: CoachResult,
  input: CoachInput
): BusinessHealthScoreModel => {
  const score = coachResult.score.value;
  const checklist = buildChecklist(input, coachResult);
  const completedMilestones = coachResult.milestones.filter(
    (milestone) => milestone.achieved
  );
  const nextMilestone =
    coachResult.milestones.find((milestone) => !milestone.achieved) ??
    coachResult.milestones[coachResult.milestones.length - 1];
  const visibleRecommendations = coachResult.recommendations
    .slice(0, 3)
    .map((recommendation) => mapRecommendation(recommendation, coachResult));
  const bestRecommendation = getBestCoachRecommendation(coachResult);
  const nextBestAction = visibleRecommendations[0] ?? {
    id: "open-coach",
    label: "Pilotez les réponses du jour",
    detail: "Le socle est prêt, gardez le rythme opérationnel.",
    href: "/inbox",
    cta: "Ouvrir",
    priority: "optimization",
    reason: "Le score ne détecte pas de blocage immédiat.",
    impact: "Un pilotage régulier maintient votre niveau de réputation.",
    potentialGain: 0
  };
  const nextBestRecommendation =
    bestRecommendation !== null
      ? mapRecommendation(bestRecommendation, coachResult)
      : nextBestAction;

  return {
    score,
    level: getHealthLevel(coachResult.score.level),
    nextLevel: getCoachNextLevelTarget(coachResult),
    trajectory: buildCoachTrajectory(coachResult),
    checklist,
    completedChecklistCount: checklist.filter((item) => item.complete).length,
    completedMilestones,
    nextMilestone,
    recommendations: visibleRecommendations,
    nextBestAction: nextBestRecommendation,
    positiveScoreSignals: buildPositiveScoreSignals(coachResult),
    blockedScoreSignals: buildBlockedScoreSignals(coachResult),
    scoreFactors: buildScoreFactors(input, coachResult),
    quickActions: [
      { label: "Inbox", href: "/inbox" },
      { label: "Établissements", href: "/settings?tab=locations" },
      { label: "Voix IA", href: "/settings/brand-voice" },
      { label: "Alertes", href: "/alerts" },
      { label: "Veille", href: "/competitors" }
    ],
    dataQuality: coachResult.dataQuality
  };
};

export { buildBusinessHealthScoreModel };
export type { BusinessHealthScoreModel };
