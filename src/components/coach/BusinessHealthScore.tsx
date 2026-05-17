import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle,
  Medal,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

type HealthLevel = {
  label: "Bronze" | "Silver" | "Gold";
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
};

type QuickAction = {
  label: string;
  href: string;
};

type BusinessHealthScoreInput = {
  googleConnected: boolean;
  locationsCount: number;
  reviewsTotal: number;
  responseRate: number | null;
  avgRating: number | null;
  aiSamples: number;
  priorityCount: number;
  activeLocationsCount: number;
  alertSignalsReady: boolean;
  competitorContextReady: boolean;
};

type BusinessHealthScoreModel = {
  score: number;
  level: HealthLevel;
  checklist: HealthChecklistItem[];
  completedChecklistCount: number;
  recommendations: HealthRecommendation[];
  nextBestAction: HealthRecommendation;
  quickActions: QuickAction[];
};

type BusinessHealthScoreCardProps = {
  model: BusinessHealthScoreModel;
  variant?: "dashboard" | "full";
  loading?: boolean;
};

const clampHealthScore = (score: number): number =>
  Math.max(0, Math.min(100, Math.round(score)));

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const getHealthLevel = (score: number): HealthLevel => {
  if (score >= 75) {
    return {
      label: "Gold",
      badgeClass: "border-amber-300 bg-amber-100 text-amber-800 gap-2",
      accentClass: "text-amber-300",
      progressClass: "bg-amber-300",
      ringColor: "#fbbf24"
    };
  }

  if (score >= 45) {
    return {
      label: "Silver",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700 gap-2",
      accentClass: "text-slate-200",
      progressClass: "bg-slate-200",
      ringColor: "#cbd5e1"
    };
  }

  return {
    label: "Bronze",
    badgeClass: "border-orange-300 bg-orange-100 text-orange-800 gap-2",
    accentClass: "text-orange-300",
    progressClass: "bg-orange-300",
    ringColor: "#fb923c"
  };
};

const getStoredCompetitorContextStatus = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const zoneLabel = window.localStorage.getItem("competitors_zone_label");
    const rawHistory = window.localStorage.getItem("competitors_scan_history");
    const history = rawHistory ? JSON.parse(rawHistory) : [];
    return Boolean(zoneLabel) || (Array.isArray(history) && history.length > 0);
  } catch {
    return false;
  }
};

const buildBusinessHealthScore = ({
  googleConnected,
  locationsCount,
  reviewsTotal,
  responseRate,
  avgRating,
  aiSamples,
  priorityCount,
  activeLocationsCount,
  alertSignalsReady,
  competitorContextReady
}: BusinessHealthScoreInput): BusinessHealthScoreModel => {
  const responseRateValid =
    responseRate !== null && responseRate >= 0 && responseRate <= 100;
  const hasReviews = reviewsTotal > 0;
  const hasAiInsights = aiSamples > 0;
  const activeLocationsReady = locationsCount > 0 && activeLocationsCount > 0;
  const responseScore = responseRateValid ? Math.min(20, responseRate * 0.2) : 0;
  const ratingScore = avgRating !== null ? Math.min(12, avgRating * 2.4) : 0;
  const workloadScore = hasReviews
    ? priorityCount === 0
      ? 5
      : priorityCount <= 3
        ? 3
        : 0
    : 0;
  const advancedSetupScore =
    (activeLocationsReady ? 3 : 0) +
    (alertSignalsReady ? 2 : 0) +
    (competitorContextReady ? 3 : 0);
  const score = clampHealthScore(
    (googleConnected ? 15 : 0) +
      (locationsCount > 0 ? 15 : 0) +
      (hasReviews ? 15 : 0) +
      responseScore +
      ratingScore +
      (hasAiInsights ? 10 : 0) +
      workloadScore +
      advancedSetupScore
  );
  const checklist: HealthChecklistItem[] = [
    {
      id: "google",
      label: "Connecter Google",
      description: googleConnected
        ? "La source principale est connectée."
        : "Reliez Google Business Profile pour démarrer.",
      complete: googleConnected,
      href: "/connect",
      cta: "Connecter"
    },
    {
      id: "locations",
      label: "Importer les établissements",
      description: locationsCount
        ? `${locationsCount} établissement${locationsCount > 1 ? "s" : ""} disponible${locationsCount > 1 ? "s" : ""}.`
        : "Ajoutez les fiches à piloter dans EGIA.",
      complete: locationsCount > 0,
      href: "/settings?tab=locations",
      cta: "Importer"
    },
    {
      id: "reviews",
      label: "Faire remonter les avis",
      description: hasReviews
        ? `${reviewsTotal} avis analysables.`
        : "Synchronisez les premiers avis pour activer le coach.",
      complete: hasReviews,
      href: "/inbox",
      cta: "Voir l'inbox"
    },
    {
      id: "response-rate",
      label: "Atteindre 70% de réponse",
      description: responseRateValid
        ? `Taux actuel: ${formatPercent(responseRate)}.`
        : "Le taux apparaîtra après import des avis.",
      complete: responseRateValid && responseRate >= 70,
      href: "/inbox",
      cta: "Répondre"
    },
    {
      id: "ai-identity",
      label: "Calibrer la voix IA",
      description: hasAiInsights
        ? "Les premiers signaux IA sont disponibles."
        : "Définissez le ton de réponse pour gagner en constance.",
      complete: hasAiInsights,
      href: "/settings/brand-voice",
      cta: "Configurer"
    },
    {
      id: "alerts",
      label: "Activer les alertes",
      description: "Recevez les signaux qui demandent une action rapide.",
      complete: alertSignalsReady,
      href: "/alerts",
      cta: "Ouvrir"
    },
    {
      id: "competitors",
      label: "Surveiller la concurrence",
      description: "Comparez votre réputation locale aux concurrents.",
      complete: competitorContextReady,
      href: "/competitors",
      cta: "Scanner"
    }
  ];
  const recommendations: HealthRecommendation[] = [];

  if (!googleConnected) {
    recommendations.push({
      id: "connect-google",
      label: "Connectez Google en premier",
      detail: "Sans connexion Google, EGIA ne peut pas coacher la réputation.",
      href: "/connect",
      cta: "Connecter"
    });
  } else if (locationsCount === 0) {
    recommendations.push({
      id: "import-locations",
      label: "Importez les établissements",
      detail: "Le score devient utile dès qu'une fiche est suivie.",
      href: "/settings?tab=locations",
      cta: "Importer"
    });
  } else if (!hasReviews) {
    recommendations.push({
      id: "sync-reviews",
      label: "Synchronisez les premiers avis",
      detail: "Les avis déclenchent les priorités, le sentiment et les drafts.",
      href: "/settings?tab=locations",
      cta: "Synchroniser"
    });
  }

  if (hasReviews && (!responseRateValid || responseRate < 70)) {
    recommendations.push({
      id: "reply-rate",
      label: "Augmentez le taux de réponse",
      detail: "Objectif V1: répondre à au moins 70% des avis exploitables.",
      href: "/inbox",
      cta: "Traiter"
    });
  }

  if (priorityCount > 0) {
    recommendations.push({
      id: "priority-reviews",
      label: "Traitez les avis critiques",
      detail: `${priorityCount} avis demandent une action prioritaire.`,
      href: "/inbox",
      cta: "Prioriser"
    });
  }

  if (hasReviews && !hasAiInsights) {
    recommendations.push({
      id: "ai-insights",
      label: "Lancez la montée en qualité IA",
      detail: "Calibrez la voix IA pour stabiliser les drafts de réponse.",
      href: "/settings/brand-voice",
      cta: "Configurer"
    });
  }

  recommendations.push(
    {
      id: "alerts-next",
      label: "Mettez les alertes sous contrôle",
      detail: "Gardez les signaux réputation au bon endroit avant la vente.",
      href: "/alerts",
      cta: "Voir"
    },
    {
      id: "competitors-next",
      label: "Ajoutez le contexte concurrentiel",
      detail: "La veille donne au score une lecture marché plus actionnable.",
      href: "/competitors",
      cta: "Comparer"
    }
  );

  const visibleRecommendations = recommendations.slice(0, 3);
  const nextBestAction = visibleRecommendations[0] ?? {
    id: "open-coach",
    label: "Pilotez les réponses du jour",
    detail: "Le socle est prêt, gardez le rythme opérationnel.",
    href: "/inbox",
    cta: "Ouvrir"
  };

  return {
    score,
    level: getHealthLevel(score),
    checklist,
    completedChecklistCount: checklist.filter((item) => item.complete).length,
    recommendations: visibleRecommendations,
    nextBestAction,
    quickActions: [
      { label: "Inbox", href: "/inbox" },
      { label: "Établissements", href: "/settings?tab=locations" },
      { label: "Voix IA", href: "/settings/brand-voice" },
      { label: "Alertes", href: "/alerts" },
      { label: "Veille", href: "/competitors" }
    ]
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

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
          <div className="bg-slate-950 p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  <Sparkles size={14} />
                  Coach EGIA
                </div>
                <h3 className="mt-3 text-2xl font-semibold leading-tight">
                  Business Health Score
                </h3>
                <p className="mt-2 max-w-xl text-sm text-slate-300">
                  Votre prochain levier réputation, sans alourdir le Dashboard.
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
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="flex items-start gap-3">
                    <Target className={model.level.accentClass} size={20} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Prochaine action
                      </p>
                      <p className="mt-1 font-semibold">{model.nextBestAction.label}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {model.nextBestAction.detail}
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
                  À finaliser
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
              <div className="mx-auto sm:mx-0">
                <ScoreRing model={model} />
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

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="flex items-start gap-3">
                    <Target className={model.level.accentClass} size={20} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Prochaine action
                      </p>
                      <p className="mt-1 font-semibold">{model.nextBestAction.label}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {model.nextBestAction.detail}
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
                {model.recommendations.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-500">{item.detail}</p>
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
                ))}
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
  buildBusinessHealthScore,
  getStoredCompetitorContextStatus
};
export type { BusinessHealthScoreInput, BusinessHealthScoreModel };
