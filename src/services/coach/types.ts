export type CoachDominantTag =
  | string
  | {
      tag?: string | null;
      label?: string | null;
      count?: number | null;
    };

export type CoachInput = {
  googleConnected?: boolean | null;
  activeLocationsCount?: number | null;
  totalLocationsCount?: number | null;
  totalReviews?: number | null;
  reviewsWithText?: number | null;
  averageRating?: number | null;
  responseRate?: number | null;
  criticalReviewsCount?: number | null;
  unansweredReviewsCount?: number | null;
  aiInsightsReady?: boolean | null;
  dominantTags?: CoachDominantTag[] | null;
  alertsOpenCount?: number | null;
  automationCount?: number | null;
  teamMembersCount?: number | null;
  competitorWatchActive?: boolean | null;
  reportsCount?: number | null;
  accountCreatedAt?: string | Date | null;
};

export type CoachInputField = keyof CoachInput;

export type CoachFallbackReason = "missing" | "invalid" | "clamped";

export type CoachFallback = {
  field: CoachInputField;
  reason: CoachFallbackReason;
  fallbackValue: unknown;
  message: string;
};

export type CoachDataQuality = {
  status: "complete" | "partial" | "low";
  missingFields: CoachInputField[];
  invalidFields: CoachInputField[];
  fallbacks: CoachFallback[];
};

export type CoachScoreLevel = "bronze" | "silver" | "gold" | "expert";

export type CoachScoreBreakdownItem = {
  id:
    | "setup"
    | "review-volume"
    | "response-rate"
    | "average-rating"
    | "ai-tags"
    | "alerts"
    | "automations"
    | "advanced";
  label: string;
  points: number;
  maxPoints: number;
  status: "complete" | "partial" | "empty" | "missing";
  reason: string;
  sourceFields: CoachInputField[];
  missingFields: CoachInputField[];
};

export type CoachScore = {
  value: number;
  max: 100;
  level: CoachScoreLevel;
  breakdown: CoachScoreBreakdownItem[];
};

export type CoachRecommendationPriority = "critical" | "high" | "medium" | "low";

export type CoachRecommendation = {
  id:
    | "prioritize-critical-reviews"
    | "reply-to-reviews"
    | "connect-google"
    | "import-locations"
    | "calibrate-ai-voice"
    | "activate-alerts"
    | "create-automation"
    | "add-competitor-watch"
    | "create-report";
  priority: CoachRecommendationPriority;
  title: string;
  description: string;
  reason: string;
  impact: string;
  sourceFields: CoachInputField[];
  missingFields: CoachInputField[];
};

export type CoachMilestone = {
  id:
    | "account-created"
    | "google-connected"
    | "first-location-imported"
    | "first-reviews-synced"
    | "first-review-replied"
    | "response-rate-90"
    | "reviews-treated-50"
    | "reviews-synced-100"
    | "first-automation"
    | "first-competitor-watch"
    | "first-pdf-report";
  label: string;
  description: string;
  achieved: boolean;
  achievedAt: string | null;
  evidence: string | null;
  sourceFields: CoachInputField[];
  missingFields: CoachInputField[];
};

export type CoachResult = {
  score: CoachScore;
  recommendations: CoachRecommendation[];
  milestones: CoachMilestone[];
  dataQuality: CoachDataQuality;
};

export type NormalizedCoachInput = {
  googleConnected: boolean;
  activeLocationsCount: number;
  totalLocationsCount: number;
  totalReviews: number;
  reviewsWithText: number;
  averageRating: number | null;
  responseRate: number | null;
  criticalReviewsCount: number;
  unansweredReviewsCount: number;
  aiInsightsReady: boolean;
  dominantTags: string[];
  alertsOpenCount: number | null;
  automationCount: number;
  teamMembersCount: number;
  competitorWatchActive: boolean;
  reportsCount: number;
  accountCreatedAt: string | null;
  dataQuality: CoachDataQuality;
};
