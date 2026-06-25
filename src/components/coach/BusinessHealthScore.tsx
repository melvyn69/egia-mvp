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
import type { BusinessHealthScoreModel } from "./businessHealthScoreModel";

type BusinessHealthScoreCardProps = {
  model: BusinessHealthScoreModel;
  variant?: "dashboard" | "full";
  loading?: boolean;
};

const getPriorityStyle = (
  priority: BusinessHealthScoreModel["nextBestAction"]["priority"]
) => {
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

const ScoreRing = ({
  model,
  size = "lg"
}: {
  model: BusinessHealthScoreModel;
  size?: "sm" | "md" | "lg";
}) => {
  const ringSize =
    size === "sm" ? "h-20 w-20" : size === "md" ? "h-28 w-28" : "h-32 w-32";
  const scoreSize =
    size === "sm" ? "text-2xl" : size === "md" ? "text-3xl" : "text-4xl";

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
  const visibleTodoItems = todoItems.length ? todoItems : model.checklist.slice(0, 3);
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

          <div className="space-y-4 bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Priorités du score
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  Ce qui débloque la progression
                </p>
                <p className="text-xs text-slate-500">
                  Actions classées par impact business estimé.
                </p>
              </div>
              {loading ? (
                <Badge variant="neutral">Calcul...</Badge>
              ) : (
                <TrendingUp size={18} className="text-emerald-600" />
              )}
            </div>
            <div className="grid gap-2">
              {visibleTodoItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                      item.complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {item.complete ? <CheckCircle size={14} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-slate-900">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {item.description}
                    </span>
                  </span>
                  <span className="hidden text-xs font-semibold text-slate-400 transition group-hover:text-slate-700 sm:inline">
                    {item.complete ? "OK" : item.cta}
                  </span>
                </button>
              ))}
            </div>
            {model.blockedScoreSignals.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Gains estimés
                  </p>
                  <span className="text-[11px] font-medium text-slate-500">
                    Potentiel Coach
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {model.blockedScoreSignals.map((signal) => (
                    <div
                      key={signal.label}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate text-slate-600">
                        {signal.label}
                      </span>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
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
        <div className="bg-slate-950 p-4 text-white sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                <Sparkles size={14} />
                Coach business EGIA
              </div>
              <h3 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
                Business Health Score
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Score, priorités et prochaine action dans un cockpit compact.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {loading && <Badge variant="neutral">Calcul en cours</Badge>}
              <Badge className={model.level.badgeClass}>
                <Medal size={14} />
                Niveau {model.level.label}
              </Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[120px_minmax(0,1fr)_minmax(300px,0.82fr)] xl:items-center">
            <div className="flex justify-center xl:justify-start">
              <ScoreRing model={model} size="md" />
            </div>

            <div className="min-w-0 space-y-3">
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
                {[
                  ["Tendance", model.trajectory.trendLabel],
                  ["Score précédent", `${model.trajectory.previousScore}/100`],
                  [
                    "Prochain niveau",
                    model.nextLevel.label === "Maximum"
                      ? "Niveau stabilisé"
                      : `${model.nextLevel.label} à ${model.nextLevel.threshold}`
                  ]
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/10 bg-white/10 p-3"
                  >
                    <p className="text-[11px] font-semibold uppercase text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {model.scoreFactors.map((factor) => (
                  <div
                    key={factor.label}
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
                  >
                    <p className="truncate text-[11px] text-slate-400">
                      {factor.label}
                    </p>
                    <p
                      className={`mt-0.5 truncate text-xs font-semibold ${
                        factor.complete ? "text-emerald-300" : "text-slate-200"
                      }`}
                    >
                      {factor.value}
                    </p>
                  </div>
                ))}
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
                  <p className="mt-1 line-clamp-2 text-sm text-slate-300">
                    {model.nextBestAction.detail}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-emerald-300">
                    Gain estimé: +{model.nextBestAction.potentialGain} pts
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

        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
          <div className="space-y-4">
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
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
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

          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Recommandations prioritaires
              </p>
              <div className="mt-3 grid gap-3">
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
                      <div className="mt-3 grid gap-2 rounded-xl bg-white/70 p-3 text-xs text-slate-600 sm:grid-cols-2">
                        <p>{item.reason}</p>
                        <p className="font-semibold text-emerald-700">
                          {item.impact}
                        </p>
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

export { BusinessHealthScoreCard };
