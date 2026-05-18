import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Medal,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
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

type BusinessHealthScoreCardProps = {
  model: BusinessHealthScoreModel;
  variant?: "dashboard" | "full";
  loading?: boolean;
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

const getPriorityStyle = (priority: HealthRecommendation["priority"]) => {
  switch (priority) {
    case "critical":
      return {
        label: "Critique",
        badgeClass: "border-red-200 bg-red-50 text-red-700",
        iconClass: "text-red-600",
        borderClass: "border-red-100 bg-red-50/40"
      };
    case "business":
      return {
        label: "Business",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        iconClass: "text-amber-600",
        borderClass: "border-amber-100 bg-amber-50/40"
      };
    case "optimization":
      return {
        label: "Optimisation",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
        iconClass: "text-blue-600",
        borderClass: "border-blue-100 bg-blue-50/40"
      };
    case "growth":
    default:
      return {
        label: "Croissance",
        badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
        iconClass: "text-violet-600",
        borderClass: "border-violet-100 bg-violet-50/40"
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

const businessReasonByRecommendation: Record<
  CoachEngineRecommendation["id"],
  string
> = {
  "prioritize-critical-reviews":
    "Des avis sensibles demandent une prise en charge rapide.",
  "reply-to-reviews":
    "Le rythme de réponse peut encore progresser pour renforcer la réputation.",
  "connect-google":
    "Votre pilotage réputation doit encore être relié à Google.",
  "import-locations":
    "Aucun établissement n'est encore prêt pour le suivi réputation.",
  "calibrate-ai-voice":
    "La voix IA doit encore être affinée avec vos premiers signaux.",
  "activate-alerts":
    "Aucun système d'alerte avancé n'est encore configuré.",
  "create-automation":
    "Aucune automatisation active n'a encore été détectée.",
  "add-competitor-watch":
    "La veille concurrentielle n'est pas encore activée.",
  "create-report": "Aucun reporting partageable n'a encore été préparé."
};

const mapRecommendationReason = (
  recommendation: CoachEngineRecommendation
): string => businessReasonByRecommendation[recommendation.id];

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
  const setupBreakdown = getBreakdownItem(result, "setup");
  const reviewsMilestone = getMilestone(result, "first-reviews-synced");
  const automationCount =
    typeof input.automationCount === "number" &&
    Number.isFinite(input.automationCount)
      ? Math.max(0, Math.floor(input.automationCount))
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
      value: automationCount > 0 ? `${automationCount} active` : "À activer",
      complete: automationMilestone?.achieved ?? false
    },
    {
      label: "Activité équipe",
      value:
        setupBreakdown !== null && setupBreakdown.points >= 15
          ? "Suivi actif"
          : "À structurer",
      complete: setupBreakdown !== null && setupBreakdown.points >= 15
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

const ScoreRing = ({ model, size = "lg" }: { model: BusinessHealthScoreModel; size?: "sm" | "lg" }) => {
  const ringSize = size === "sm" ? "h-20 w-20" : "h-32 w-32";
  const scoreSize = size === "sm" ? "text-2xl" : "text-4xl";

  return (
    <div
      className={`relative flex ${ringSize} items-center justify-center rounded-full p-2`}
      style={{
        background: `conic-gradient(${model.level.ringColor} ${model.score * 3.6}deg, rgba(255,255,255,0.16) 0deg)`
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950 text-white">
        <span className={`${scoreSize} font-semibold`}>{model.score}</span>
        <span className="text-xs font-semibold text-slate-400">/100</span>
      </div>
    </div>
  );
};

const SuccessDashboardCard = ({
  model,
  loading
}: {
  model: BusinessHealthScoreModel;
  loading?: boolean;
}) => {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <ScoreRing model={model} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={model.level.badgeClass}>
                <Medal size={14} />
                Niveau {model.level.label}
              </Badge>
              {loading && <Badge variant="neutral">Calcul en cours</Badge>}
            </div>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">
              Business Health Score au maximum
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Le socle réputation est prêt. Gardez le rythme avec le coach EGIA.
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/coach")}>
          Voir le coach EGIA
          <ArrowRight size={16} />
        </Button>
      </CardContent>
    </Card>
  );
};

const DashboardScoreCard = ({
  model,
  loading
}: {
  model: BusinessHealthScoreModel;
  loading?: boolean;
}) => {
  const navigate = useNavigate();
  const todoItems = model.checklist.filter((item) => !item.complete).slice(0, 3);
  const nextPriorityStyle = getPriorityStyle(model.nextBestAction.priority);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
          <div className="bg-slate-950 p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  <Sparkles size={14} />
                  Aperçu rapide du Coach
                </div>
                <h3 className="mt-3 text-2xl font-semibold leading-tight">
                  Business Health Score
                </h3>
                <p className="mt-2 max-w-xl text-sm text-slate-300">
                  Le même moteur que Coach et Progression, condensé pour décider vite.
                </p>
              </div>
              <Badge className={model.level.badgeClass}>
                <Medal size={14} />
                {model.level.label}
              </Badge>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-[118px_minmax(0,1fr)] sm:items-center">
              <ScoreRing model={model} />
              <div className="min-w-0 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
                    <span>Progression</span>
                    <span>
                      {model.completedChecklistCount}/{model.checklist.length} étapes
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                    <div
                      className={`h-full rounded-full ${model.level.progressClass} transition-all duration-700`}
                      style={{ width: `${model.score}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Progression 7 jours
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {model.trajectory.delta7Days > 0
                        ? `+${model.trajectory.delta7Days} pts estimés`
                        : "Non encore mesurée"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Prochain niveau
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {model.nextLevel.label === "Maximum"
                        ? "Niveau stabilisé"
                      : `${model.nextLevel.label} à ${model.nextLevel.threshold}`}
                    </p>
                  </div>
                </div>
                {model.positiveScoreSignals.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Ce qui améliore le score
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {model.positiveScoreSignals.map((signal) => (
                        <span
                          key={signal.label}
                          className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-100"
                        >
                          {signal.value} {signal.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="flex items-start gap-3">
                    <Target className={nextPriorityStyle.iconClass} size={20} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">
                          Prochaine action
                        </p>
                        <Badge className={nextPriorityStyle.badgeClass}>
                          {nextPriorityStyle.label}
                        </Badge>
                      </div>
                      <p className="mt-1 font-semibold">{model.nextBestAction.label}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {model.nextBestAction.detail}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-300">
                        Gain potentiel: +{model.nextBestAction.potentialGain} pts
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-white text-slate-950 hover:bg-slate-100"
                      onClick={() => navigate(model.nextBestAction.href)}
                    >
                      {model.nextBestAction.cta}
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={() => navigate("/coach")}
                    >
                      Voir le coach EGIA
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Ce qui bloque actuellement
                </p>
                <p className="text-xs text-slate-500">
                  Les priorités qui débloquent le score.
                </p>
              </div>
              {loading ? (
                <Badge variant="neutral">Calcul...</Badge>
              ) : (
                <TrendingUp size={18} className="text-emerald-600" />
              )}
            </div>
            <div className="space-y-2">
              {(todoItems.length ? todoItems : model.checklist.slice(0, 3)).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      item.complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <CheckCircle size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {model.blockedScoreSignals.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Gains estimés
                </p>
                <div className="mt-2 space-y-1.5">
                  {model.blockedScoreSignals.map((signal) => (
                    <div
                      key={signal.label}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-600">{signal.label}</span>
                      <span className="font-semibold text-slate-900">
                        {signal.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/coach")}
            >
              Voir le détail du score
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const FullScorePanel = ({
  model,
  loading
}: {
  model: BusinessHealthScoreModel;
  loading?: boolean;
}) => {
  const navigate = useNavigate();
  const nextPriorityStyle = getPriorityStyle(model.nextBestAction.priority);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
          <div className="bg-slate-950 p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  <Sparkles size={14} />
                  Coach business EGIA
                </div>
                <div>
                  <h3 className="text-2xl font-semibold leading-tight sm:text-3xl">
                    Business Health Score
                  </h3>
                  <p className="mt-2 max-w-xl text-sm text-slate-300">
                    Le détail complet pour comprendre votre score, choisir la
                    prochaine action et progresser sans dispersion.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {loading && <Badge variant="neutral">Calcul en cours</Badge>}
                <Badge className={model.level.badgeClass}>
                  <Medal size={14} />
                  Niveau {model.level.label}
                </Badge>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
              <div className="mx-auto w-full max-w-[180px] sm:mx-0">
                <ScoreRing model={model} />
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Calculé selon :
                  </p>
                  <div className="mt-3 space-y-2">
                    {model.scoreFactors.map((factor) => (
                      <div
                        key={factor.label}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-slate-400">{factor.label}</span>
                        <span
                          className={
                            factor.complete ? "text-emerald-300" : "text-slate-200"
                          }
                        >
                          {factor.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {model.positiveScoreSignals.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Ce qui améliore le score
                    </p>
                    <div className="mt-3 space-y-2">
                      {model.positiveScoreSignals.map((signal) => (
                        <div
                          key={signal.label}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="text-slate-400">{signal.label}</span>
                          <span className="font-semibold text-emerald-300">
                            {signal.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
                    <span>Progression commerciale</span>
                    <span>
                      {model.completedChecklistCount}/{model.checklist.length} étapes
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                    <div
                      className={`h-full rounded-full ${model.level.progressClass} transition-all duration-700`}
                      style={{ width: `${model.score}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Progression 7 jours
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {model.trajectory.trendLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Score précédent
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {model.trajectory.previousScore}/100
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Prochain niveau
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {model.nextLevel.label === "Maximum"
                        ? "Niveau stabilisé"
                        : `${model.nextLevel.label} à ${model.nextLevel.threshold}`}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="flex items-start gap-3">
                    <Target className={nextPriorityStyle.iconClass} size={20} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">
                          Prochaine action
                        </p>
                        <Badge className={nextPriorityStyle.badgeClass}>
                          {nextPriorityStyle.label}
                        </Badge>
                      </div>
                      <p className="mt-1 font-semibold">{model.nextBestAction.label}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {model.nextBestAction.detail}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-300">
                        Prochain gain estimé: +{model.nextBestAction.potentialGain} pts
                      </p>
                      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/20 p-3 text-xs text-slate-300">
                        <p className="font-semibold text-slate-200">
                          Pourquoi cette recommandation ?
                        </p>
                        <p className="mt-1">{model.nextBestAction.reason}</p>
                        <p className="mt-2 font-semibold text-emerald-300">
                          {model.nextBestAction.impact}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-white text-slate-950 hover:bg-slate-100"
                      onClick={() => navigate(model.nextBestAction.href)}
                    >
                      {model.nextBestAction.cta}
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={() => navigate("/inbox")}
                    >
                      Ouvrir l'inbox
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Checklist intelligente
                  </p>
                  <p className="text-xs text-slate-500">
                    Les actions qui augmentent le score.
                  </p>
                </div>
                <TrendingUp size={18} className="text-emerald-600" />
              </div>
              <div className="mt-4 grid gap-2">
                {model.checklist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        item.complete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <CheckCircle size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.description}
                      </span>
                    </span>
                    <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
                      {item.complete ? "OK" : item.cta}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Recommandations prioritaires
              </p>
              <div className="mt-3 space-y-3">
                {model.recommendations.map((item) => {
                  const priorityStyle = getPriorityStyle(item.priority);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3 ${priorityStyle.borderClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={priorityStyle.badgeClass}>
                              {priorityStyle.label}
                            </Badge>
                            <p className="text-sm font-semibold text-slate-900">
                              {item.label}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.detail}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => navigate(item.href)}
                        >
                          {item.cta}
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 rounded-xl bg-white/70 p-3 text-xs text-slate-600">
                        <div className="flex items-start gap-2">
                          <AlertTriangle
                            size={14}
                            className={`${priorityStyle.iconClass} mt-0.5 shrink-0`}
                          />
                          <div>
                            <p className="font-semibold text-slate-800">
                              Pourquoi cette recommandation ?
                            </p>
                            <p className="mt-0.5">{item.reason}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <TrendingUp
                            size={14}
                            className="mt-0.5 shrink-0 text-emerald-600"
                          />
                          <div>
                            <p className="font-semibold text-slate-800">
                              Impact estimé
                            </p>
                            <p className="mt-0.5">{item.impact}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {model.quickActions.map((action) => (
                <Button
                  key={action.href}
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(action.href)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const BusinessHealthScoreCard = ({
  model,
  variant = "dashboard",
  loading = false
}: BusinessHealthScoreCardProps) => {
  if (variant === "full") {
    return <FullScorePanel model={model} loading={loading} />;
  }

  if (model.score >= 100) {
    return <SuccessDashboardCard model={model} loading={loading} />;
  }

  return <DashboardScoreCard model={model} loading={loading} />;
};

export {
  BusinessHealthScoreCard,
  buildBusinessHealthScoreModel
};
export type { BusinessHealthScoreModel };
