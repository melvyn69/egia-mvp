import { buildCoachMilestones } from "./milestones";
import { buildCoachRecommendations } from "./recommendations";
import type {
  CoachDataQuality,
  CoachFallback,
  CoachInput,
  CoachInputField,
  CoachResult,
  CoachScore,
  CoachScoreBreakdownItem,
  NormalizedCoachInput
} from "./types";

const SCORE_MAX = 100;

const SCORE_WEIGHTS = {
  setup: 15,
  reviewVolume: 15,
  responseRate: 25,
  averageRating: 15,
  aiTags: 10,
  alerts: 8,
  automations: 7,
  advanced: 5
} as const;

const inputFields: CoachInputField[] = [
  "googleConnected",
  "activeLocationsCount",
  "totalLocationsCount",
  "totalReviews",
  "reviewsWithText",
  "averageRating",
  "responseRate",
  "criticalReviewsCount",
  "unansweredReviewsCount",
  "aiInsightsReady",
  "dominantTags",
  "alertsOpenCount",
  "automationCount",
  "teamMembersCount",
  "competitorWatchActive",
  "reportsCount",
  "accountCreatedAt"
];

const roundScore = (value: number): number => Math.round(value * 10) / 10;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null;

const addFallback = (
  fallbacks: CoachFallback[],
  field: CoachInputField,
  reason: CoachFallback["reason"],
  fallbackValue: unknown,
  message: string
): void => {
  fallbacks.push({ field, reason, fallbackValue, message });
};

const normalizeCount = (
  input: CoachInput,
  field: CoachInputField,
  fallbacks: CoachFallback[]
): number => {
  const value = input[field];
  if (!hasValue(value)) {
    addFallback(fallbacks, field, "missing", 0, `${field} absent, fallback 0.`);
    return 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addFallback(fallbacks, field, "invalid", 0, `${field} invalide, fallback 0.`);
    return 0;
  }
  if (value < 0) {
    addFallback(fallbacks, field, "clamped", 0, `${field} négatif, borné à 0.`);
    return 0;
  }
  return Math.floor(value);
};

const normalizeBoolean = (
  input: CoachInput,
  field: CoachInputField,
  fallbacks: CoachFallback[]
): boolean => {
  const value = input[field];
  if (!hasValue(value)) {
    addFallback(
      fallbacks,
      field,
      "missing",
      false,
      `${field} absent, fallback false.`
    );
    return false;
  }
  if (typeof value !== "boolean") {
    addFallback(
      fallbacks,
      field,
      "invalid",
      false,
      `${field} invalide, fallback false.`
    );
    return false;
  }
  return value;
};

const normalizeRate = (
  input: CoachInput,
  field: "responseRate",
  fallbacks: CoachFallback[]
): number | null => {
  const value = input[field];
  if (!hasValue(value)) {
    addFallback(fallbacks, field, "missing", null, `${field} absent, fallback null.`);
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addFallback(fallbacks, field, "invalid", null, `${field} invalide, fallback null.`);
    return null;
  }
  const clamped = clamp(value, 0, 100);
  if (clamped !== value) {
    addFallback(
      fallbacks,
      field,
      "clamped",
      clamped,
      `${field} hors bornes, borné entre 0 et 100.`
    );
  }
  return clamped;
};

const normalizeRating = (
  input: CoachInput,
  fallbacks: CoachFallback[]
): number | null => {
  const value = input.averageRating;
  if (!hasValue(value)) {
    addFallback(
      fallbacks,
      "averageRating",
      "missing",
      null,
      "averageRating absent, fallback null."
    );
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addFallback(
      fallbacks,
      "averageRating",
      "invalid",
      null,
      "averageRating invalide, fallback null."
    );
    return null;
  }
  const clamped = clamp(value, 0, 5);
  if (clamped !== value) {
    addFallback(
      fallbacks,
      "averageRating",
      "clamped",
      clamped,
      "averageRating hors bornes, borné entre 0 et 5."
    );
  }
  return clamped;
};

const normalizeDominantTags = (
  input: CoachInput,
  fallbacks: CoachFallback[]
): string[] => {
  const value = input.dominantTags;
  if (!hasValue(value)) {
    addFallback(
      fallbacks,
      "dominantTags",
      "missing",
      [],
      "dominantTags absent, fallback tableau vide."
    );
    return [];
  }
  if (!Array.isArray(value)) {
    addFallback(
      fallbacks,
      "dominantTags",
      "invalid",
      [],
      "dominantTags invalide, fallback tableau vide."
    );
    return [];
  }

  const tags = value
    .map((tag) => {
      if (typeof tag === "string") {
        return tag.trim();
      }
      if (tag && typeof tag === "object") {
        return (tag.tag ?? tag.label ?? "").trim();
      }
      return "";
    })
    .filter((tag) => tag.length > 0);

  if (value.length > 0 && tags.length === 0) {
    addFallback(
      fallbacks,
      "dominantTags",
      "invalid",
      [],
      "dominantTags ne contient aucun tag exploitable."
    );
  }

  return Array.from(new Set(tags));
};

const normalizeAlertsOpenCount = (
  input: CoachInput,
  fallbacks: CoachFallback[]
): number | null => {
  const value = input.alertsOpenCount;
  if (!hasValue(value)) {
    addFallback(
      fallbacks,
      "alertsOpenCount",
      "missing",
      null,
      "alertsOpenCount absent, fallback null."
    );
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addFallback(
      fallbacks,
      "alertsOpenCount",
      "invalid",
      null,
      "alertsOpenCount invalide, fallback null."
    );
    return null;
  }
  if (value < 0) {
    addFallback(
      fallbacks,
      "alertsOpenCount",
      "clamped",
      0,
      "alertsOpenCount négatif, borné à 0."
    );
    return 0;
  }
  return Math.floor(value);
};

const normalizeAccountCreatedAt = (
  input: CoachInput,
  fallbacks: CoachFallback[]
): string | null => {
  const value = input.accountCreatedAt;
  if (!hasValue(value)) {
    addFallback(
      fallbacks,
      "accountCreatedAt",
      "missing",
      null,
      "accountCreatedAt absent, fallback null."
    );
    return null;
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date) {
    addFallback(
      fallbacks,
      "accountCreatedAt",
      "invalid",
      null,
      "accountCreatedAt invalide, fallback null."
    );
    return null;
  }
  if (Number.isNaN(date.getTime())) {
    addFallback(
      fallbacks,
      "accountCreatedAt",
      "invalid",
      null,
      "accountCreatedAt invalide, fallback null."
    );
    return null;
  }
  return date.toISOString();
};

const buildDataQuality = (fallbacks: CoachFallback[]): CoachDataQuality => {
  const missingFields = Array.from(
    new Set(
      fallbacks
        .filter((fallback) => fallback.reason === "missing")
        .map((fallback) => fallback.field)
    )
  );
  const invalidFields = Array.from(
    new Set(
      fallbacks
        .filter((fallback) => fallback.reason !== "missing")
        .map((fallback) => fallback.field)
    )
  );
  const status =
    fallbacks.length === 0
      ? "complete"
      : fallbacks.length >= Math.ceil(inputFields.length / 2)
        ? "low"
        : "partial";

  return {
    status,
    missingFields,
    invalidFields,
    fallbacks
  };
};

export const normalizeCoachInput = (input: CoachInput): NormalizedCoachInput => {
  const fallbacks: CoachFallback[] = [];
  const totalLocationsCount = normalizeCount(
    input,
    "totalLocationsCount",
    fallbacks
  );
  const activeLocationsCount = normalizeCount(
    input,
    "activeLocationsCount",
    fallbacks
  );

  return {
    googleConnected: normalizeBoolean(input, "googleConnected", fallbacks),
    activeLocationsCount,
    totalLocationsCount,
    totalReviews: normalizeCount(input, "totalReviews", fallbacks),
    reviewsWithText: normalizeCount(input, "reviewsWithText", fallbacks),
    averageRating: normalizeRating(input, fallbacks),
    responseRate: normalizeRate(input, "responseRate", fallbacks),
    criticalReviewsCount: normalizeCount(
      input,
      "criticalReviewsCount",
      fallbacks
    ),
    unansweredReviewsCount: normalizeCount(
      input,
      "unansweredReviewsCount",
      fallbacks
    ),
    aiInsightsReady: normalizeBoolean(input, "aiInsightsReady", fallbacks),
    dominantTags: normalizeDominantTags(input, fallbacks),
    alertsOpenCount: normalizeAlertsOpenCount(input, fallbacks),
    automationCount: normalizeCount(input, "automationCount", fallbacks),
    teamMembersCount: normalizeCount(input, "teamMembersCount", fallbacks),
    competitorWatchActive: normalizeBoolean(
      input,
      "competitorWatchActive",
      fallbacks
    ),
    reportsCount: normalizeCount(input, "reportsCount", fallbacks),
    accountCreatedAt: normalizeAccountCreatedAt(input, fallbacks),
    dataQuality: buildDataQuality(fallbacks)
  };
};

const getMissingFields = (
  input: NormalizedCoachInput,
  fields: CoachInputField[]
): CoachInputField[] =>
  fields.filter((field) =>
    input.dataQuality.fallbacks.some((fallback) => fallback.field === field)
  );

const makeBreakdownItem = ({
  input,
  id,
  label,
  points,
  maxPoints,
  reason,
  sourceFields
}: Omit<CoachScoreBreakdownItem, "points" | "status" | "missingFields"> & {
  input: NormalizedCoachInput;
  points: number;
}): CoachScoreBreakdownItem => {
  const missingFields = getMissingFields(input, sourceFields);
  const roundedPoints = roundScore(clamp(points, 0, maxPoints));
  const status =
    missingFields.length > 0
      ? "missing"
      : roundedPoints === 0
        ? "empty"
        : roundedPoints >= maxPoints
          ? "complete"
          : "partial";

  return {
    id,
    label,
    points: roundedPoints,
    maxPoints,
    status,
    reason,
    sourceFields,
    missingFields
  };
};

const getVolumeScore = (input: NormalizedCoachInput): number => {
  if (input.totalReviews <= 0) {
    return 0;
  }

  const volumeBase =
    input.totalReviews >= 100
      ? 12
      : input.totalReviews >= 50
        ? 10
        : input.totalReviews >= 10
          ? 7
          : 4;
  const textCoverage =
    input.totalReviews > 0
      ? Math.min(1, input.reviewsWithText / input.totalReviews)
      : 0;

  return volumeBase + textCoverage * 3;
};

const getAlertsScore = (input: NormalizedCoachInput): number => {
  if (input.alertsOpenCount === null) {
    return 0;
  }
  if (input.alertsOpenCount === 0) {
    return SCORE_WEIGHTS.alerts;
  }

  return Math.max(2, SCORE_WEIGHTS.alerts - input.alertsOpenCount * 2);
};

const getScoreLevel = (value: number): CoachScore["level"] => {
  if (value >= 90) {
    return "expert";
  }
  if (value >= 70) {
    return "gold";
  }
  if (value >= 45) {
    return "silver";
  }
  return "bronze";
};

export const buildCoachScore = (input: NormalizedCoachInput): CoachScore => {
  const setupScore =
    (input.googleConnected ? 7 : 0) +
    (input.totalLocationsCount > 0 ? 4 : 0) +
    (input.activeLocationsCount > 0 ? 4 : 0);
  const volumeScore = getVolumeScore(input);
  const responseScore =
    input.responseRate === null
      ? 0
      : (input.responseRate / 100) * SCORE_WEIGHTS.responseRate;
  const ratingScore =
    input.averageRating === null
      ? 0
      : (input.averageRating / 5) * SCORE_WEIGHTS.averageRating;
  const aiScore =
    (input.aiInsightsReady ? 7 : 0) +
    (input.dominantTags.length > 0 ? 3 : 0);
  const alertsScore = getAlertsScore(input);
  const automationScore =
    input.automationCount > 0 ? SCORE_WEIGHTS.automations : 0;
  const advancedScore =
    (input.teamMembersCount > 0 ? 1.5 : 0) +
    (input.reportsCount > 0 ? 1.5 : 0) +
    (input.competitorWatchActive ? 2 : 0);

  const breakdown: CoachScoreBreakdownItem[] = [
    makeBreakdownItem({
      input,
      id: "setup",
      label: "Setup Google + établissements",
      points: setupScore,
      maxPoints: SCORE_WEIGHTS.setup,
      reason: "Google vaut 7 pts, établissements importés 4 pts, actifs 4 pts.",
      sourceFields: [
        "googleConnected",
        "totalLocationsCount",
        "activeLocationsCount"
      ]
    }),
    makeBreakdownItem({
      input,
      id: "review-volume",
      label: "Volume avis",
      points: volumeScore,
      maxPoints: SCORE_WEIGHTS.reviewVolume,
      reason: "Le volume pèse 12 pts, la couverture texte jusqu'à 3 pts.",
      sourceFields: ["totalReviews", "reviewsWithText"]
    }),
    makeBreakdownItem({
      input,
      id: "response-rate",
      label: "Taux réponse",
      points: responseScore,
      maxPoints: SCORE_WEIGHTS.responseRate,
      reason: "Le taux de réponse est linéaire jusqu'à 25 pts.",
      sourceFields: ["responseRate"]
    }),
    makeBreakdownItem({
      input,
      id: "average-rating",
      label: "Note moyenne",
      points: ratingScore,
      maxPoints: SCORE_WEIGHTS.averageRating,
      reason: "La note moyenne est linéaire sur 5 étoiles.",
      sourceFields: ["averageRating"]
    }),
    makeBreakdownItem({
      input,
      id: "ai-tags",
      label: "IA/tags",
      points: aiScore,
      maxPoints: SCORE_WEIGHTS.aiTags,
      reason: "Les insights IA valent 7 pts, les tags dominants 3 pts.",
      sourceFields: ["aiInsightsReady", "dominantTags"]
    }),
    makeBreakdownItem({
      input,
      id: "alerts",
      label: "Alertes",
      points: alertsScore,
      maxPoints: SCORE_WEIGHTS.alerts,
      reason: "Aucune alerte ouverte vaut 8 pts; chaque alerte ouverte réduit ce bloc.",
      sourceFields: ["alertsOpenCount"]
    }),
    makeBreakdownItem({
      input,
      id: "automations",
      label: "Automatisations",
      points: automationScore,
      maxPoints: SCORE_WEIGHTS.automations,
      reason: "Au moins une automatisation active vaut 7 pts.",
      sourceFields: ["automationCount"]
    }),
    makeBreakdownItem({
      input,
      id: "advanced",
      label: "Équipe/rapports/veille",
      points: advancedScore,
      maxPoints: SCORE_WEIGHTS.advanced,
      reason: "Équipe 1,5 pt, rapports 1,5 pt, veille 2 pts.",
      sourceFields: ["teamMembersCount", "reportsCount", "competitorWatchActive"]
    })
  ];
  const value = Math.round(
    clamp(
      breakdown.reduce((total, item) => total + item.points, 0),
      0,
      SCORE_MAX
    )
  );

  return {
    value,
    max: SCORE_MAX,
    level: getScoreLevel(value),
    breakdown
  };
};

export const buildCoachResult = (input: CoachInput): CoachResult => {
  const normalizedInput = normalizeCoachInput(input);

  return {
    score: buildCoachScore(normalizedInput),
    recommendations: buildCoachRecommendations(normalizedInput),
    milestones: buildCoachMilestones(normalizedInput),
    dataQuality: normalizedInput.dataQuality
  };
};
