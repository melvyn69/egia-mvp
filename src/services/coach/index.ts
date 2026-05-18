export {
  buildCoachResult,
  buildCoachScore,
  normalizeCoachInput
} from "./scoring";
export {
  buildCoachRecommendations,
  buildCoachTrajectory,
  getBestCoachRecommendation,
  getCoachNextLevelTarget,
  getCoachRecommendationPotentialGain
} from "./recommendations";
export { buildCoachMilestones } from "./milestones";
export {
  buildCoachInputFromFrontendData,
  buildCoachResultFromFrontendData,
  getCompletedCoachMilestones,
  getDominantCoachTags,
  getLastCachedCoachData,
  getNextCoachMilestone,
  readCoachFrontendCacheData
} from "./frontend";
export { useCoachResult } from "./useCoachResult";
export type {
  CoachDataQuality,
  CoachDominantTag,
  CoachFallback,
  CoachFallbackReason,
  CoachInput,
  CoachInputField,
  CoachMilestone,
  CoachRecommendation,
  CoachRecommendationPriority,
  CoachResult,
  CoachScore,
  CoachScoreBreakdownItem,
  CoachScoreLevel,
  NormalizedCoachInput
} from "./types";
export type {
  CoachAiKpiCache,
  CoachFrontendCacheData,
  CoachFrontendLocation,
  CoachFrontendMetrics,
  CoachKpiSummaryCache
} from "./frontend";
export type { CoachNextLevelTarget, CoachTrajectory } from "./recommendations";
