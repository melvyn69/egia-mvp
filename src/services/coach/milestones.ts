import type {
  CoachInputField,
  CoachMilestone,
  NormalizedCoachInput
} from "./types";

const getMissingFields = (
  input: NormalizedCoachInput,
  fields: CoachInputField[]
): CoachInputField[] =>
  fields.filter((field) =>
    input.dataQuality.fallbacks.some((fallback) => fallback.field === field)
  );

const getAnsweredReviewsCount = (input: NormalizedCoachInput): number | null => {
  const missingTotal = input.dataQuality.fallbacks.some(
    (fallback) => fallback.field === "totalReviews"
  );
  const missingUnanswered = input.dataQuality.fallbacks.some(
    (fallback) => fallback.field === "unansweredReviewsCount"
  );

  if (!missingTotal && !missingUnanswered) {
    return Math.max(0, input.totalReviews - input.unansweredReviewsCount);
  }

  if (input.totalReviews > 0 && input.responseRate !== null) {
    return Math.round((input.totalReviews * input.responseRate) / 100);
  }

  return null;
};

const makeMilestone = ({
  input,
  id,
  label,
  description,
  achieved,
  achievedAt = null,
  evidence,
  sourceFields
}: Omit<CoachMilestone, "missingFields" | "achievedAt"> & {
  achievedAt?: string | null;
  input: NormalizedCoachInput;
}): CoachMilestone => ({
  id,
  label,
  description,
  achieved,
  achievedAt,
  evidence,
  sourceFields,
  missingFields: getMissingFields(input, sourceFields)
});

export const buildCoachMilestones = (
  input: NormalizedCoachInput
): CoachMilestone[] => {
  const answeredReviewsCount = getAnsweredReviewsCount(input);

  return [
    makeMilestone({
      input,
      id: "account-created",
      label: "Compte créé",
      description: "L'espace utilisateur existe.",
      achieved: input.accountCreatedAt !== null,
      achievedAt: input.accountCreatedAt,
      evidence: input.accountCreatedAt,
      sourceFields: ["accountCreatedAt"]
    }),
    makeMilestone({
      input,
      id: "google-connected",
      label: "Google connecté",
      description: "Google Business Profile est relié.",
      achieved: input.googleConnected,
      evidence: input.googleConnected ? "Connexion active" : null,
      sourceFields: ["googleConnected"]
    }),
    makeMilestone({
      input,
      id: "first-location-imported",
      label: "Premier établissement importé",
      description: "Au moins une fiche est disponible.",
      achieved: input.totalLocationsCount > 0 || input.activeLocationsCount > 0,
      evidence:
        input.totalLocationsCount > 0
          ? `${input.totalLocationsCount} établissement(s)`
          : null,
      sourceFields: ["totalLocationsCount", "activeLocationsCount"]
    }),
    makeMilestone({
      input,
      id: "first-reviews-synced",
      label: "Premiers avis synchronisés",
      description: "Le Coach dispose de premiers avis.",
      achieved: input.totalReviews > 0,
      evidence: input.totalReviews > 0 ? `${input.totalReviews} avis` : null,
      sourceFields: ["totalReviews"]
    }),
    makeMilestone({
      input,
      id: "first-review-replied",
      label: "Premier avis répondu",
      description: "Au moins un avis a été traité.",
      achieved: answeredReviewsCount !== null && answeredReviewsCount > 0,
      evidence:
        answeredReviewsCount !== null
          ? `${answeredReviewsCount} avis répondu(s)`
          : null,
      sourceFields: ["totalReviews", "unansweredReviewsCount", "responseRate"]
    }),
    makeMilestone({
      input,
      id: "response-rate-90",
      label: "Taux réponse 90%",
      description: "Le taux de réponse atteint le niveau premium.",
      achieved: input.responseRate !== null && input.responseRate >= 90,
      evidence:
        input.responseRate !== null
          ? `${Math.round(input.responseRate)}% de réponse`
          : null,
      sourceFields: ["responseRate"]
    }),
    makeMilestone({
      input,
      id: "reviews-treated-50",
      label: "50 avis traités",
      description: "Le volume de traitement devient robuste.",
      achieved: answeredReviewsCount !== null && answeredReviewsCount >= 50,
      evidence:
        answeredReviewsCount !== null
          ? `${answeredReviewsCount} avis traité(s)`
          : null,
      sourceFields: ["totalReviews", "unansweredReviewsCount", "responseRate"]
    }),
    makeMilestone({
      input,
      id: "reviews-synced-100",
      label: "100 avis synchronisés",
      description: "Le volume d'avis synchronisés est conséquent.",
      achieved: input.totalReviews >= 100,
      evidence: `${input.totalReviews} avis synchronisé(s)`,
      sourceFields: ["totalReviews"]
    }),
    makeMilestone({
      input,
      id: "first-automation",
      label: "Première automatisation",
      description: "Un scénario opérationnel est actif.",
      achieved: input.automationCount > 0,
      evidence:
        input.automationCount > 0
          ? `${input.automationCount} automatisation(s)`
          : null,
      sourceFields: ["automationCount"]
    }),
    makeMilestone({
      input,
      id: "first-competitor-watch",
      label: "Première veille concurrentielle",
      description: "Le pilotage inclut le contexte marché.",
      achieved: input.competitorWatchActive,
      evidence: input.competitorWatchActive ? "Veille active" : null,
      sourceFields: ["competitorWatchActive"]
    }),
    makeMilestone({
      input,
      id: "first-pdf-report",
      label: "Premier rapport PDF",
      description: "Un rapport a été généré.",
      achieved: input.reportsCount > 0,
      evidence: input.reportsCount > 0 ? `${input.reportsCount} rapport(s)` : null,
      sourceFields: ["reportsCount"]
    })
  ];
};
