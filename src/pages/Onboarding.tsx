import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  Clock,
  Lock,
  MessageSquare,
  Radar,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Wand2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import type { AppNotificationBase } from "../lib/notifications";
import {
  type CoachMilestone,
  type CoachResult,
  type CoachScoreLevel,
  useCoachResult
} from "../services/coach";

type OnboardingProps = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  notifications: AppNotificationBase[];
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
};

type VoicePreset =
  | "professionnel"
  | "chaleureux"
  | "premium"
  | "direct"
  | "luxe"
  | "humain";

type StatusLabel = "Validé" | "À compléter" | "Non encore mesuré" | "À venir";

type StepState = {
  label: (typeof steps)[number];
  complete: boolean;
  status: StatusLabel;
};

const voicePresets: Array<{
  id: VoicePreset;
  label: string;
  description: string;
}> = [
  {
    id: "professionnel",
    label: "Professionnel",
    description: "Clair, fiable, orienté service."
  },
  {
    id: "chaleureux",
    label: "Chaleureux",
    description: "Empathique, humain, rassurant."
  },
  {
    id: "premium",
    label: "Premium",
    description: "Sobre, précis, haut de gamme."
  },
  {
    id: "direct",
    label: "Direct",
    description: "Court, efficace, sans détour."
  },
  {
    id: "luxe",
    label: "Luxe",
    description: "Élégant, attentionné, exigeant."
  },
  {
    id: "humain",
    label: "Humain",
    description: "Naturel, sincère, conversationnel."
  }
];

const steps = [
  "Bienvenue",
  "Connexion",
  "Établissements",
  "Voix IA",
  "Première réponse",
  "Coach",
  "Succès"
] as const;

const getMilestone = (
  result: CoachResult,
  id: CoachMilestone["id"]
): CoachMilestone => {
  const milestone = result.milestones.find((item) => item.id === id);
  if (!milestone) {
    throw new Error(`Missing coach milestone: ${id}`);
  }
  return milestone;
};

const getMilestoneStatus = (milestone: CoachMilestone): StatusLabel => {
  if (milestone.achieved) {
    return "Validé";
  }

  return milestone.missingFields.length > 0 ? "Non encore mesuré" : "À compléter";
};

const getScoreLevelLabel = (level: CoachScoreLevel): string => {
  switch (level) {
    case "expert":
      return "Expert";
    case "gold":
      return "Gold";
    case "silver":
      return "Silver";
    case "bronze":
    default:
      return "Bronze";
  }
};

const getStatusClass = (status: StatusLabel): string => {
  if (status === "Validé") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Non encore mesuré") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  if (status === "À venir") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
};

const formatMeasuredCount = (
  value: number | null | undefined,
  unit: string
): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value} ${unit}`
    : "Non encore mesuré";

const describeMilestone = (milestone: CoachMilestone): string => {
  if (milestone.achieved && milestone.evidence) {
    return `${milestone.description} ${milestone.evidence}.`;
  }

  if (!milestone.achieved && milestone.missingFields.length > 0) {
    return `${milestone.description} Non encore mesuré.`;
  }

  return milestone.description;
};

const Onboarding = ({
  session,
  googleStatus,
  locations,
  notifications
}: OnboardingProps) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<VoicePreset>("premium");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const coach = useCoachResult({
    session,
    googleStatus,
    locations,
    notifications
  });

  useEffect(() => {
    setSelectedLocations((previous) => {
      const availableIds = new Set(locations.map((location) => location.id));
      const stillAvailable = previous.filter((id) => availableIds.has(id));
      if (stillAvailable.length > 0) {
        return stillAvailable;
      }
      return locations.slice(0, 2).map((location) => location.id);
    });
  }, [locations]);

  const kpiSummary = coach.kpiSummary;
  const aiStats = coach.aiStats;
  const googleConnected = googleStatus === "connected";
  const notificationActionCount = coach.coachMetrics.notificationActionCount;
  const unansweredReviewsCount = coach.coachMetrics.unansweredReviewsCount;
  const aiSamples = coach.coachMetrics.aiSamples;
  const dominantTags = coach.coachMetrics.dominantTags;
  const aiReady =
    (typeof aiSamples === "number" && aiSamples > 0) ||
    Boolean(dominantTags?.length);
  const coachResult = coach.coachResult;
  const accountMilestone = getMilestone(coachResult, "account-created");
  const googleMilestone = getMilestone(coachResult, "google-connected");
  const locationMilestone = getMilestone(coachResult, "first-location-imported");
  const replyMilestone = getMilestone(coachResult, "first-review-replied");
  const coachScoreMeasured =
    googleConnected ||
    locations.length > 0 ||
    typeof kpiSummary?.counts?.reviews_total === "number";
  const nextRecommendation = coachResult.recommendations[0] ?? null;
  const scoreLevelLabel = getScoreLevelLabel(coachResult.score.level);
  const selectedCount = selectedLocations.length;
  const progress = Math.round(((currentStep + 1) / steps.length) * 100);
  const stepStates: StepState[] = [
    {
      label: "Bienvenue",
      complete: accountMilestone.achieved,
      status: getMilestoneStatus(accountMilestone)
    },
    {
      label: "Connexion",
      complete: googleMilestone.achieved,
      status: getMilestoneStatus(googleMilestone)
    },
    {
      label: "Établissements",
      complete: locationMilestone.achieved,
      status: getMilestoneStatus(locationMilestone)
    },
    {
      label: "Voix IA",
      complete: aiReady,
      status:
        typeof aiSamples === "number" || dominantTags !== null
          ? aiReady
            ? "Validé"
            : "À compléter"
          : "Non encore mesuré"
    },
    {
      label: "Première réponse",
      complete: replyMilestone.achieved,
      status: getMilestoneStatus(replyMilestone)
    },
    {
      label: "Coach",
      complete: coachScoreMeasured,
      status: coachScoreMeasured ? "Validé" : "Non encore mesuré"
    },
    {
      label: "Succès",
      complete: googleMilestone.achieved && locationMilestone.achieved && coachScoreMeasured,
      status:
        googleMilestone.achieved && locationMilestone.achieved && coachScoreMeasured
          ? "Validé"
          : "À venir"
    }
  ];

  const next = () => setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  const back = () => setCurrentStep((step) => Math.max(step - 1, 0));
  const toggleLocation = (id: string) => {
    setSelectedLocations((prev) =>
      prev.includes(id)
        ? prev.filter((locationId) => locationId !== id)
        : [...prev, id]
    );
  };

  const renderStatusBadge = (status: StatusLabel) => (
    <Badge className={getStatusClass(status)}>{status}</Badge>
  );

  const renderStep = () => {
    if (currentStep === 0) {
      return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <Badge className="border-white/10 bg-white/10 text-white">
              <Sparkles size={14} />
              Onboarding premium
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Bienvenue dans EGIA
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">
              Construisons votre système réputation avec les données déjà
              disponibles dans votre espace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-white text-slate-950 hover:bg-slate-100"
                onClick={next}
              >
                Commencer
                <ArrowRight size={18} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => navigate("/")}
              >
                Plus tard
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-sm font-semibold text-slate-200">
              État de votre setup
            </p>
            <div className="mt-5 space-y-4">
              {stepStates.slice(1, 6).map((item, index) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      item.complete
                        ? "bg-emerald-300 text-slate-950"
                        : "bg-white/10 text-slate-300"
                    }`}
                  >
                    {item.complete ? <Check size={15} /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-200">{item.label}</span>
                    <p className="text-xs text-slate-400">{item.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                Connectez Google en toute sécurité
              </h2>
              {renderStatusBadge(getMilestoneStatus(googleMilestone))}
            </div>
            <p className="mt-3 max-w-2xl text-slate-500">
              EGIA lit vos établissements et avis pour générer un pilotage clair,
              des priorités et des réponses IA adaptées à votre marque.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  label: "Sécurisé",
                  text: "Connexion Google officielle."
                },
                { icon: Clock, label: "2 minutes", text: "Configuration rapide." },
                {
                  icon: Lock,
                  label: "Contrôlé",
                  text: "Aucune action sans validation."
                }
              ].map(({ icon: Icon, label, text }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <Icon size={20} className="text-emerald-600" />
                  <p className="mt-3 font-semibold text-slate-900">{label}</p>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {googleConnected ? "Google connecté" : "Connexion à compléter"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {googleConnected
                      ? "Votre compte est déjà relié."
                      : "Reliez Google pour importer les établissements et avis."}
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => (googleConnected ? next() : navigate("/connect"))}
              >
                {googleConnected ? "Continuer" : "Connecter Google"}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                Import établissements
              </h2>
              {renderStatusBadge(getMilestoneStatus(locationMilestone))}
            </div>
            <p className="mt-3 text-slate-500">
              Sélectionnez les fiches à suivre. Si aucune fiche n’est encore
              importée, lancez l’import depuis la connexion Google.
            </p>
            <div className="mt-6 space-y-3">
              {locations.length > 0 ? (
                locations.map((location) => {
                  const checked = selectedLocations.includes(location.id);

                  return (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => toggleLocation(location.id)}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                          <Building2 size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {location.location_title ??
                              location.location_resource_name}
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            Prêt pour le suivi réputation
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          checked
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-400"
                        }`}
                      >
                        {checked && <Check size={15} />}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                  <p className="font-semibold text-slate-900">
                    Aucun établissement importé
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    À compléter depuis la connexion Google.
                  </p>
                  <Button className="mt-4" onClick={() => navigate("/connect")}>
                    Importer établissements
                  </Button>
                </div>
              )}
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      locations.length > 0 ? "bg-emerald-300" : "bg-slate-500"
                    }`}
                  />
                  <p className="text-sm font-semibold">Données réelles</p>
                </div>
                <p className="mt-4 text-4xl font-semibold">
                  {locations.length > 0 ? locations.length : "À compléter"}
                </p>
                <p className="text-sm text-slate-300">établissements importés</p>
                <p className="mt-4 text-sm text-slate-300">
                  {selectedCount > 0
                    ? `${selectedCount} fiche${selectedCount > 1 ? "s" : ""} sélectionnée${selectedCount > 1 ? "s" : ""}.`
                    : "Aucune fiche sélectionnée."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                Calibrez la voix IA
              </h2>
              {renderStatusBadge(stepStates[3].status)}
            </div>
            <p className="mt-3 max-w-2xl text-slate-500">
              Choisissez le style qui correspond à votre marque. EGIA l’utilisera
              comme base pour les réponses.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {voicePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedVoice(preset.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selectedVoice === preset.id
                      ? "border-slate-950 bg-white shadow-card"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{preset.label}</p>
                    {selectedVoice === preset.id && (
                      <CheckCircle size={18} className="text-emerald-600" />
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <Wand2 size={22} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {aiReady ? "IA déjà alimentée" : "Voix IA à compléter"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {aiReady
                      ? `${formatMeasuredCount(aiSamples, "avis analysé(s)")}.`
                      : stepStates[3].status}
                  </p>
                </div>
              </div>
              {dominantTags?.length ? (
                <div className="flex flex-wrap gap-2">
                  {dominantTags.slice(0, 4).map((tag) => {
                    const label =
                      typeof tag === "string" ? tag : tag.tag ?? tag.label ?? "";
                    return (
                      <Badge key={label} variant="neutral">
                        {label}
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
              <Button
                variant={aiReady ? "outline" : "default"}
                className="w-full"
                onClick={() => navigate("/settings/brand-voice")}
              >
                Configurer voix IA
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === 4) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                Première réponse IA
              </h2>
              {renderStatusBadge(getMilestoneStatus(replyMilestone))}
            </div>
            <p className="mt-3 text-slate-500">
              L’étape se valide quand au moins un avis répondu est mesuré par les
              KPIs déjà chargés.
            </p>
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <MessageSquare size={20} className="mt-1 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">
                    {replyMilestone.achieved
                      ? "Premier avis répondu"
                      : "Avis à traiter"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {describeMilestone(replyMilestone)}
                  </p>
                </div>
              </div>
              <Button className="mt-5" onClick={() => navigate("/inbox")}>
                Ouvrir Inbox
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-3">
              <Wand2 size={20} className="text-emerald-300" />
              <p className="font-semibold">Données avis</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Avis synchronisés",
                  value: formatMeasuredCount(
                    kpiSummary?.counts?.reviews_total ?? null,
                    "avis"
                  )
                },
                {
                  label: "Taux réponse",
                  value:
                    typeof kpiSummary?.response?.response_rate_pct === "number"
                      ? `${Math.round(kpiSummary.response.response_rate_pct)}%`
                      : "Non encore mesuré"
                },
                {
                  label: "À répondre",
                  value:
                    typeof unansweredReviewsCount === "number"
                      ? String(unansweredReviewsCount)
                      : "Non encore mesuré"
                },
                {
                  label: "Priorités",
                  value: String(aiStats?.priorityCount ?? notificationActionCount)
                }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (currentStep === 5) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                Découvrez votre Coach EGIA
              </h2>
              {renderStatusBadge(stepStates[5].status)}
            </div>
            <p className="mt-3 text-slate-500">
              Le Coach transforme vos signaux réputation en actions simples,
              priorisées et mesurables.
            </p>
            <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Score Coach</p>
                  <p className="mt-1 text-5xl font-semibold">
                    {coachScoreMeasured
                      ? coachResult.score.value
                      : "Non encore mesuré"}
                  </p>
                </div>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  {scoreLevelLabel}
                </Badge>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-amber-300 transition-all duration-700"
                  style={{ width: `${coachResult.score.value}%` }}
                />
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Prochaine action
                </p>
                <p className="mt-1 font-semibold">
                  {nextRecommendation?.title ?? "Ouvrir le Coach"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {nextRecommendation?.description ??
                    "Le Coach est prêt à consolider vos priorités."}
                </p>
              </div>
            </div>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              {[
                {
                  icon: Target,
                  label: "Priorités",
                  detail: nextRecommendation ? "Prêtes" : "À compléter"
                },
                {
                  icon: Trophy,
                  label: "Progression",
                  detail: scoreLevelLabel
                },
                {
                  icon: Radar,
                  label: "Veille",
                  detail:
                    coach.cacheData.competitorWatchActive === null
                      ? "Non encore mesuré"
                      : coach.cacheData.competitorWatchActive
                        ? "Active"
                        : "À compléter"
                }
              ].map(({ icon: Icon, label, detail }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-sm text-slate-500">{detail}</p>
                  </div>
                </div>
              ))}
              <Button className="w-full" onClick={() => navigate("/coach")}>
                Ouvrir Coach
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
          <Star size={28} />
        </div>
        <h2 className="mt-6 text-4xl font-semibold text-slate-950">
          Système réputation activé
        </h2>
        <p className="mt-3 text-slate-500">
          Votre assistant réputation est prêt à être piloté. Les indicateurs à
          compléter resteront explicitement marqués comme non encore mesurés.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            {
              label: "Score",
              value: coachScoreMeasured
                ? `${coachResult.score.value}/100`
                : "Non mesuré"
            },
            {
              label: "Établissements",
              value:
                locations.length > 0 ? String(locations.length) : "À compléter"
            },
            {
              label: "IA",
              value: aiReady ? "Prête" : stepStates[3].status
            },
            {
              label: "Avis",
              value: formatMeasuredCount(kpiSummary?.counts?.reviews_total, "avis")
            }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <p className="text-xs font-semibold uppercase text-slate-400">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={() => navigate("/")}>
            Accéder au Dashboard
            <ArrowRight size={18} />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/coach")}>
            Ouvrir Coach
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card">
        <div className="bg-slate-950 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Setup EGIA
              </p>
              <p className="mt-1 text-lg font-semibold">
                Premier moment de valeur en moins de 3 minutes
              </p>
            </div>
            <Badge className="border-white/10 bg-white/10 text-white">
              {currentStep + 1}/{steps.length}
            </Badge>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-emerald-300 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 text-[11px] font-semibold text-slate-400 sm:grid-cols-7">
            {stepStates.map((step, index) => (
              <div
                key={step.label}
                className={`min-w-0 rounded-xl px-2 py-1 ${
                  index === currentStep
                    ? "bg-white/10 text-white"
                    : step.complete
                      ? "text-emerald-200"
                      : "text-slate-500"
                }`}
              >
                <span className="block truncate">{step.label}</span>
                <span className="mt-0.5 block truncate text-[10px] font-medium">
                  {step.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          key={currentStep}
          className="min-h-[520px] animate-[fadeIn_220ms_ease-out] bg-slate-50 p-5 sm:p-8"
        >
          {renderStep()}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={currentStep === 0}
            className="sm:w-auto"
          >
            Retour
          </Button>
          {currentStep < steps.length - 1 ? (
            <Button onClick={next} className="sm:w-auto">
              Continuer
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={() => navigate("/")} className="sm:w-auto">
              Accéder au Dashboard
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export { Onboarding };
