import type {
  CoachInputField,
  CoachRecommendation,
  CoachRecommendationPriority,
  CoachResult,
  CoachScoreBreakdownItem,
  CoachScoreLevel,
  NormalizedCoachInput
} from "./types";

const getMissingFields = (
  input: NormalizedCoachInput,
  fields: CoachInputField[]
): CoachInputField[] =>
  fields.filter((field) =>
    input.dataQuality.fallbacks.some((fallback) => fallback.field === field)
  );

const makeRecommendation = ({
  id,
  priority,
  title,
  description,
  reason,
  impact,
  sourceFields,
  input
}: Omit<CoachRecommendation, "missingFields"> & {
  input: NormalizedCoachInput;
}): CoachRecommendation => ({
  id,
  priority,
  title,
  description,
  reason,
  impact,
  sourceFields,
  missingFields: getMissingFields(input, sourceFields)
});

const priorityRank: Record<CoachRecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export const buildCoachRecommendations = (
  input: NormalizedCoachInput
): CoachRecommendation[] => {
  const recommendations: CoachRecommendation[] = [];

  if (input.criticalReviewsCount > 0) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "prioritize-critical-reviews",
        priority: "critical",
        title: "Prioriser les avis critiques",
        description:
          input.criticalReviewsCount === 1
            ? "1 avis critique demande une action rapide."
            : `${input.criticalReviewsCount} avis critiques demandent une action rapide.`,
        reason: "Des avis critiques sont détectés dans les signaux disponibles.",
        impact: "Traiter ces avis réduit le risque réputationnel immédiat.",
        sourceFields: ["criticalReviewsCount"]
      })
    );
  }

  if (
    (input.responseRate !== null && input.responseRate < 70) ||
    input.unansweredReviewsCount > 0
  ) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "reply-to-reviews",
        priority: "high",
        title: "Répondre aux avis en attente",
        description:
          input.unansweredReviewsCount > 0
            ? `${input.unansweredReviewsCount} avis restent sans réponse.`
            : "Le taux de réponse est sous l'objectif de 70%.",
        reason:
          input.responseRate !== null
            ? `Taux de réponse actuel: ${Math.round(input.responseRate)}%.`
            : "Des avis sans réponse sont détectés.",
        impact: "Le taux de réponse est le levier le plus lourd du score Coach.",
        sourceFields: ["responseRate", "unansweredReviewsCount"]
      })
    );
  }

  if (!input.googleConnected) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "connect-google",
        priority: "high",
        title: "Connecter Google Business Profile",
        description: "La source principale doit être connectée avant le pilotage.",
        reason: "Votre pilotage réputation doit encore être relié à Google.",
        impact: "La connexion débloque les établissements, avis et KPIs.",
        sourceFields: ["googleConnected"]
      })
    );
  }

  if (input.totalLocationsCount === 0 && input.activeLocationsCount === 0) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "import-locations",
        priority: "high",
        title: "Importer un premier établissement",
        description: "Le Coach a besoin d'au moins une fiche à piloter.",
        reason: "Aucun établissement n'est encore prêt pour le suivi réputation.",
        impact: "Les établissements débloquent le socle du pilotage.",
        sourceFields: ["totalLocationsCount", "activeLocationsCount"]
      })
    );
  }

  if (!input.aiInsightsReady) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "calibrate-ai-voice",
        priority: "medium",
        title: "Calibrer la voix IA",
        description: "La qualité IA n'est pas encore considérée comme prête.",
        reason: "La voix IA doit encore être affinée avec vos premiers signaux.",
        impact: "Une voix IA calibrée améliore la cohérence des réponses.",
        sourceFields: ["aiInsightsReady", "dominantTags"]
      })
    );
  }

  if (input.alertsOpenCount === null) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "activate-alerts",
        priority: "medium",
        title: "Activer des alertes fiables",
        description: "Aucun système d'alerte avancé n'est encore configuré.",
        reason: "Les alertes doivent encore être configurées pour sécuriser le suivi.",
        impact: "Un signal d'alertes fiable évite de manquer les sujets urgents.",
        sourceFields: ["alertsOpenCount"]
      })
    );
  }

  if (input.automationCount === 0) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "create-automation",
        priority: "medium",
        title: "Créer une première automatisation",
        description: "Aucune automatisation active n'a encore été détectée.",
        reason: "Les actions récurrentes peuvent encore être automatisées.",
        impact: "Une automatisation réduit le suivi manuel récurrent.",
        sourceFields: ["automationCount"]
      })
    );
  }

  if (!input.competitorWatchActive) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "add-competitor-watch",
        priority: "low",
        title: "Ajouter une veille concurrentielle",
        description: "La réputation locale manque encore de contexte marché.",
        reason: "La veille concurrentielle n'est pas encore activée.",
        impact: "La veille aide à prioriser les opportunités locales.",
        sourceFields: ["competitorWatchActive"]
      })
    );
  }

  if (input.reportsCount === 0) {
    recommendations.push(
      makeRecommendation({
        input,
        id: "create-report",
        priority: "low",
        title: "Créer un premier rapport PDF",
        description: "Aucun rapport généré n'est détecté.",
        reason: "Aucun reporting partageable n'a encore été préparé.",
        impact: "Un rapport rend la progression partageable et pilotable.",
        sourceFields: ["reportsCount"]
      })
    );
  }

  return recommendations.sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority]
  );
};

const recommendationBreakdownIds: Record<
  CoachRecommendation["id"],
  CoachScoreBreakdownItem["id"][]
> = {
  "prioritize-critical-reviews": ["response-rate", "alerts"],
  "reply-to-reviews": ["response-rate"],
  "connect-google": ["setup"],
  "import-locations": ["setup"],
  "calibrate-ai-voice": ["ai-tags"],
  "activate-alerts": ["alerts"],
  "create-automation": ["automations"],
  "add-competitor-watch": ["advanced"],
  "create-report": ["advanced"]
};

const nextLevelTargets: Array<{
  level: CoachScoreLevel;
  label: "Silver" | "Gold" | "Expert";
  threshold: number;
}> = [
  { level: "silver", label: "Silver", threshold: 45 },
  { level: "gold", label: "Gold", threshold: 70 },
  { level: "expert", label: "Expert", threshold: 90 }
];

export type CoachNextLevelTarget = {
  label: "Silver" | "Gold" | "Expert" | "Maximum";
  threshold: number;
  remainingPoints: number;
};

export type CoachTrajectory = {
  previousScore: number;
  delta7Days: number;
  trendLabel: string;
  rhythmLabel: string;
  confidenceLabel: "estimé" | "basé sur les signaux disponibles";
};

export const getCoachRecommendationPotentialGain = (
  recommendation: CoachRecommendation,
  result: CoachResult
): number => {
  const breakdownIds = recommendationBreakdownIds[recommendation.id];
  const remaining = breakdownIds.reduce((total, id) => {
    const item = result.score.breakdown.find((breakdown) => breakdown.id === id);
    if (!item) {
      return total;
    }

    return total + Math.max(0, item.maxPoints - item.points);
  }, 0);

  return Math.max(1, Math.round(remaining));
};

export const getBestCoachRecommendation = (
  result: CoachResult
): CoachRecommendation | null =>
  result.recommendations
    .slice()
    .sort((a, b) => {
      const gainDiff =
        getCoachRecommendationPotentialGain(b, result) -
        getCoachRecommendationPotentialGain(a, result);
      if (gainDiff !== 0) {
        return gainDiff;
      }

      return priorityRank[a.priority] - priorityRank[b.priority];
    })[0] ?? null;

export const getCoachNextLevelTarget = (
  result: CoachResult
): CoachNextLevelTarget => {
  const target = nextLevelTargets.find(
    (level) => result.score.value < level.threshold
  );

  if (!target) {
    return {
      label: "Maximum",
      threshold: result.score.max,
      remainingPoints: 0
    };
  }

  return {
    label: target.label,
    threshold: target.threshold,
    remainingPoints: Math.max(0, target.threshold - result.score.value)
  };
};

export const buildCoachTrajectory = (result: CoachResult): CoachTrajectory => {
  const completedMilestones = result.milestones.filter(
    (milestone) => milestone.achieved
  ).length;
  const strongestSignal = result.score.breakdown.reduce<
    CoachScoreBreakdownItem | null
  >((best, item) => {
    if (!best || item.points > best.points) {
      return item;
    }

    return best;
  }, null);
  const signalDelta = strongestSignal
    ? Math.round(strongestSignal.points * 0.25)
    : 0;
  const delta7Days = Math.min(
    18,
    Math.max(0, Math.round(completedMilestones * 1.5 + signalDelta))
  );
  const previousScore = Math.max(0, result.score.value - delta7Days);
  const nextLevel = getCoachNextLevelTarget(result);

  return {
    previousScore,
    delta7Days,
    trendLabel:
      delta7Days > 0
        ? `+${delta7Days} points sur 7 jours`
        : "Tendance non encore mesurée",
    rhythmLabel:
      nextLevel.remainingPoints === 0
        ? "niveau stabilisé"
        : nextLevel.remainingPoints <= 10
          ? "rythme proche du prochain niveau"
          : "rythme à renforcer",
    confidenceLabel:
      result.dataQuality.status === "complete"
        ? "basé sur les signaux disponibles"
        : "estimé"
  };
};
