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

const getDailyCoachSummary = (model: BusinessHealthScoreModel): string => {
  if (model.nextLevel.remainingPoints === 0) {
    return "Votre réputation est stabilisée, gardez le rythme aujourd'hui.";
  }

  if (
    model.nextLevel.remainingPoints > 0 &&
    model.nextLevel.remainingPoints <= 10
  ) {
    return `Encore ${model.nextLevel.remainingPoints} point${
      model.nextLevel.remainingPoints > 1 ? "s" : ""
    } pour atteindre le niveau ${model.nextLevel.label}.`;
  }

  if (
    model.nextBestAction.priority === "critical" ||
    model.nextBestAction.priority === "business"
  ) {
    return `Votre priorité du jour : ${model.nextBestAction.label}.`;
  }

  if (model.trajectory.delta7Days > 0) {
    return `Votre réputation progresse : ${model.trajectory.trendLabel}.`;
  }

  if (model.nextBestAction.potentialGain > 0) {
    return `La prochaine action peut ajouter +${model.nextBestAction.potentialGain} points aujourd'hui.`;
  }

  return "Une action ciblée aujourd'hui peut renforcer votre score.";
};

const ScoreRing = ({
  model,
  size = "lg"
}: {
  model: BusinessHealthScoreModel;
  size?: "sm" | "md" | "lg" | "xl" | "dashboard";
}) => {
  const ringSize =
    size === "sm"
      ? "h-20 w-20"
      : size === "md"
        ? "h-28 w-28"
        : size === "dashboard"
          ? "h-36 w-36 sm:h-44 sm:w-44"
          : size === "xl"
            ? "h-40 w-40 sm:h-52 sm:w-52"
          : "h-32 w-32";
  const scoreSize =
    size === "sm"
      ? "text-2xl"
      : size === "md"
        ? "text-3xl"
        : size === "dashboard"
          ? "text-5xl sm:text-6xl"
          : size === "xl"
            ? "text-6xl sm:text-7xl"
          : "text-4xl";
  const heroShellClass =
    size === "dashboard"
      ? "p-2 shadow-[0_24px_70px_-34px_rgba(16,185,129,0.9)]"
      : size === "xl"
        ? "p-2.5 shadow-[0_30px_90px_-38px_rgba(16,185,129,0.9)]"
        : "p-2";

  return (
    <div
      className={`relative flex ${ringSize} items-center justify-center rounded-full ${heroShellClass}`}
      style={{
        background: `conic-gradient(${model.level.ringColor} ${model.score * 3.6}deg, rgba(148,163,184,0.22) 0deg)`
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950 text-white ring-1 ring-white/10">
        <span className={`${scoreSize} font-semibold leading-none`}>
          {model.score}
        </span>
        <span className="mt-1 text-xs font-semibold text-slate-400">/100</span>
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
  const dailyCoachSummary = getDailyCoachSummary(model);

  return (
    <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white shadow-[0_30px_90px_-42px_rgba(15,23,42,0.95)]">
      <CardContent className="p-0">
        <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[170px_minmax(0,1fr)_auto] lg:items-center lg:p-5">
          <div className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <ScoreRing model={model} size="dashboard" />
            <p className="max-w-[11rem] text-xs font-semibold leading-5 text-emerald-100">
              {dailyCoachSummary}
            </p>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={model.level.badgeClass}>
                <Medal size={14} />
                Niveau {model.level.label}
              </Badge>
              {loading && (
                <Badge className="border-white/10 bg-white/10 text-slate-200">
                  Calcul en cours
                </Badge>
              )}
            </div>
            <h3 className="mt-2 text-xl font-semibold leading-tight sm:text-2xl">
              Business Health Score au maximum
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Le socle réputation est prêt. Gardez le rythme avec le coach EGIA.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
            onClick={() => navigate("/coach")}
          >
            Voir le coach EGIA
            <ArrowRight size={18} />
          </Button>
        </div>
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
  const dailyCoachSummary = getDailyCoachSummary(model);
  const objectiveLabel =
    model.nextLevel.label === "Maximum"
      ? "Objectif final"
      : `Objectif ${model.nextLevel.label}`;

  return (
    <Card className="overflow-hidden border-slate-900 bg-slate-950 shadow-[0_30px_90px_-42px_rgba(15,23,42,0.95)]">
      <CardContent className="p-0">
        <div className="bg-slate-950 p-3 text-white sm:p-4 lg:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Score business
              </p>
              <h3 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">
                Business Health Score
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {loading && (
                <Badge className="border-white/10 bg-white/10 text-slate-200">
                  Calcul en cours
                </Badge>
              )}
              <Badge className={model.level.badgeClass}>
                <Medal size={14} />
                {model.level.label}
              </Badge>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,0.42fr)_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/75 p-3 sm:p-4 lg:items-start">
              <ScoreRing model={model} size="dashboard" />
              <p className="max-w-sm text-center text-sm font-semibold leading-5 text-emerald-100 lg:text-left">
                {dailyCoachSummary}
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                    Score actuel
                  </p>
                  <p className="mt-1 text-2xl font-semibold leading-none text-white">
                    {model.score}/100
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-2.5 text-slate-950">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {objectiveLabel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold leading-none">
                    {model.nextLevel.threshold}/100
                  </p>
                </div>
              </div>
              <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-2.5">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                  <span>Progression du score</span>
                  <span>
                    {model.completedChecklistCount}/{model.checklist.length} étapes
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
                  <div
                    className={`h-full rounded-full ${model.level.progressClass} transition-all duration-700`}
                    style={{ width: `${model.score}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>Actuel {model.score}</span>
                  <span>
                    {objectiveLabel} {model.nextLevel.threshold}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white p-3 text-slate-950 shadow-[0_26px_80px_-30px_rgba(15,23,42,0.95)] ring-1 ring-emerald-200/70 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white">
                  <Target className={nextPriorityStyle.iconClass} size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Prochaine action prioritaire
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge className={nextPriorityStyle.badgeClass}>
                      {nextPriorityStyle.label}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xl font-semibold leading-tight sm:text-2xl">
                {model.nextBestAction.label}
              </p>
              <p className="mt-1.5 max-w-3xl text-sm leading-5 text-slate-600">
                {model.nextBestAction.detail}
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(160px,0.42fr)_minmax(0,1fr)] sm:items-end">
                <div className="rounded-2xl border border-emerald-500 bg-emerald-600 p-3 text-white shadow-[0_18px_48px_-24px_rgba(5,150,105,0.9)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-50">
                    Gain potentiel
                  </p>
                  <p className="mt-1 text-4xl font-semibold leading-none">
                    +{model.nextBestAction.potentialGain}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-50">
                    points Business Health
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-start">
                  <Button
                    size="lg"
                    className="w-full shadow-[0_18px_45px_-22px_rgba(15,23,42,0.9)] sm:w-auto"
                    onClick={() => navigate(model.nextBestAction.href)}
                  >
                    {model.nextBestAction.cta}
                    <ArrowRight size={18} />
                  </Button>
                  <p className="text-xs text-slate-500">
                    Priorité calculée à partir des signaux actifs du score.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Progression 7 jours
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                {model.trajectory.delta7Days > 0
                  ? `+${model.trajectory.delta7Days} pts estimés`
                  : "Non encore mesurée"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Prochain niveau
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                {model.nextLevel.label === "Maximum"
                  ? "Niveau stabilisé"
                  : `${model.nextLevel.label} à ${model.nextLevel.threshold}`}
              </p>
            </div>
            {model.positiveScoreSignals.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Signaux positifs
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {model.positiveScoreSignals.map((signal) => (
                    <span
                      key={signal.label}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200"
                    >
                      {signal.value} {signal.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2 bg-slate-50/95 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.5fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Priorités du score
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-950">
                  Ce qui débloque la progression
                </p>
              </div>
              {loading ? (
                <Badge variant="neutral">Calcul...</Badge>
              ) : (
                <TrendingUp size={17} className="text-emerald-600" />
              )}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {visibleTodoItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="group flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                      item.complete
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {item.complete ? <CheckCircle size={13} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-slate-900">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      {item.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {model.blockedScoreSignals.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Gains estimés
                </p>
                <span className="text-[11px] font-medium text-slate-500">
                  Potentiel Coach
                </span>
              </div>
              <div className="mt-2 grid gap-1.5">
                {model.blockedScoreSignals.map((signal) => (
                  <div
                    key={signal.label}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-1.5 text-xs"
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
  const dailyCoachSummary = getDailyCoachSummary(model);
  const objectiveLabel =
    model.nextLevel.label === "Maximum"
      ? "Objectif final"
      : `Objectif ${model.nextLevel.label}`;

  return (
    <Card className="overflow-hidden border-slate-900 shadow-[0_30px_90px_-42px_rgba(15,23,42,0.8)]">
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

          <div className="mt-5 grid gap-4 xl:grid-cols-[190px_minmax(0,1fr)_minmax(320px,0.9fr)] xl:items-center">
            <div className="flex flex-col items-center gap-3 text-center xl:items-start xl:text-left">
              <ScoreRing model={model} size="xl" />
              <p className="max-w-[13rem] text-sm font-semibold leading-5 text-emerald-100">
                {dailyCoachSummary}
              </p>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
                  <span>Progression commerciale</span>
                  <span>
                    {model.completedChecklistCount}/{model.checklist.length} étapes
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
                  <div
                    className={`h-full rounded-full ${model.level.progressClass} transition-all duration-700`}
                    style={{ width: `${model.score}%` }}
                  />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                      Score actuel
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {model.score}/100
                    </p>
                  </div>
                  <div className="rounded-xl border border-white bg-white px-3 py-2 text-slate-950">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {objectiveLabel}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {model.nextLevel.threshold}/100
                    </p>
                  </div>
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

            <div className="rounded-2xl border border-emerald-100 bg-white p-4 text-slate-950 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.9)] ring-1 ring-emerald-200/70">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
                  <Target className={nextPriorityStyle.iconClass} size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Prochaine action prioritaire
                    </p>
                    <Badge className={nextPriorityStyle.badgeClass}>
                      {nextPriorityStyle.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xl font-semibold leading-tight">
                    {model.nextBestAction.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {model.nextBestAction.detail}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-500 bg-emerald-600 p-3 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-50">
                  Gain potentiel
                </p>
                <p className="mt-1 text-3xl font-semibold leading-none">
                  +{model.nextBestAction.potentialGain}
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-50">
                  points Business Health
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate(model.nextBestAction.href)}
                >
                  {model.nextBestAction.cta}
                  <ArrowRight size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
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
