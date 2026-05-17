import { useMemo, useState } from "react";
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

type OnboardingProps = {
  googleStatus: GoogleConnectionStatus;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
};

type VoicePreset = "professionnel" | "chaleureux" | "premium" | "direct" | "luxe" | "humain";

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

const Onboarding = ({ googleStatus, locations }: OnboardingProps) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<VoicePreset>("premium");
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    locations.slice(0, 2).map((location) => location.id)
  );
  const progress = Math.round(((currentStep + 1) / steps.length) * 100);
  const googleConnected = googleStatus === "connected";
  const foundLocations = locations.length || 3;
  const selectedCount = selectedLocations.length || Math.min(2, foundLocations);
  const initialScore = useMemo(() => {
    const base = googleConnected ? 42 : 28;
    const locationBoost = Math.min(18, selectedCount * 6);
    return Math.min(78, base + locationBoost + 12);
  }, [googleConnected, selectedCount]);

  const next = () => setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  const back = () => setCurrentStep((step) => Math.max(step - 1, 0));
  const toggleLocation = (id: string) => {
    setSelectedLocations((prev) =>
      prev.includes(id)
        ? prev.filter((locationId) => locationId !== id)
        : [...prev, id]
    );
  };

  const locationCards =
    locations.length > 0
      ? locations
      : [
          {
            id: "mock-1",
            location_title: "Établissement principal",
            location_resource_name: "locations/mock-1"
          },
          {
            id: "mock-2",
            location_title: "Second établissement",
            location_resource_name: "locations/mock-2"
          },
          {
            id: "mock-3",
            location_title: "Fiche à valider",
            location_resource_name: "locations/mock-3"
          }
        ];

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
              Construisons votre système réputation.
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
              Premier moment de valeur
            </p>
            <div className="mt-5 space-y-4">
              {[
                "Google relié",
                "Établissements sélectionnés",
                "Voix IA calibrée",
                "Première réponse simulée",
                "Coach activé"
              ].map((item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-emerald-300">
                    {index + 1}
                  </div>
                  <span className="text-sm text-slate-200">{item}</span>
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
            <h2 className="text-3xl font-semibold text-slate-950">
              Connectez Google en toute sécurité
            </h2>
            <p className="mt-3 max-w-2xl text-slate-500">
              EGIA lit vos établissements et avis pour générer un pilotage clair,
              des priorités et des réponses IA adaptées à votre marque.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { icon: ShieldCheck, label: "Sécurisé", text: "Connexion Google officielle." },
                { icon: Clock, label: "2 minutes", text: "Configuration rapide." },
                { icon: Lock, label: "Contrôlé", text: "Aucune action sans validation." }
              ].map(({ icon: Icon, label, text }) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
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
                    {googleConnected ? "Google connecté" : "Connexion prête"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {googleConnected
                      ? "Votre compte est déjà relié."
                      : "Vous pourrez relier Google depuis la page Connexion."}
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => (googleConnected ? next() : navigate("/connect"))}
              >
                {googleConnected ? "Continuer" : "Ouvrir connexion Google"}
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
            <h2 className="text-3xl font-semibold text-slate-950">
              Import établissements
            </h2>
            <p className="mt-3 text-slate-500">
              Nous avons préparé une sélection pour lancer votre système sans
              friction. Vous pourrez l’ajuster ensuite.
            </p>
            <div className="mt-6 space-y-3">
              {locationCards.map((location, index) => {
                const checked = selectedLocations.includes(location.id) || (!locations.length && index < 2);

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
                          {location.location_title ?? location.location_resource_name}
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
              })}
            </div>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
                  <p className="text-sm font-semibold">Analyse premium en cours</p>
                </div>
                <p className="mt-4 text-4xl font-semibold">{foundLocations}</p>
                <p className="text-sm text-slate-300">établissements trouvés</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-300" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div>
          <h2 className="text-3xl font-semibold text-slate-950">
            Calibrez la voix IA
          </h2>
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
                <p className="mt-2 text-sm text-slate-500">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (currentStep === 4) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-3xl font-semibold text-slate-950">
              Première réponse IA
            </h2>
            <p className="mt-3 text-slate-500">
              Simulation de génération : EGIA transforme un avis client en réponse
              prête à valider.
            </p>
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <MessageSquare size={20} className="mt-1 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">Avis client</p>
                  <p className="mt-2 text-sm text-slate-600">
                    “Service rapide, mais l’accueil pourrait être plus chaleureux.”
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-3">
              <Wand2 size={20} className="text-emerald-300" />
              <p className="font-semibold">Génération IA</p>
            </div>
            <div className="mt-5 space-y-3">
              <div className="h-2 w-2/3 animate-pulse rounded-full bg-white/20" />
              <div className="h-2 w-5/6 animate-pulse rounded-full bg-white/20" />
              <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/20" />
            </div>
            <div className="mt-6 rounded-2xl bg-white p-4 text-slate-800">
              <p className="text-sm">
                Merci pour votre retour. Nous sommes ravis que la rapidité du
                service ait répondu à vos attentes. Votre remarque sur l’accueil
                est bien prise en compte afin d’améliorer l’expérience dès votre
                prochaine visite.
              </p>
            </div>
            <Badge className="mt-4 border-emerald-200 bg-emerald-50 text-emerald-700">
              Votre assistant réputation est prêt.
            </Badge>
          </div>
        </div>
      );
    }

    if (currentStep === 5) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <h2 className="text-3xl font-semibold text-slate-950">
              Découvrez votre Coach EGIA
            </h2>
            <p className="mt-3 text-slate-500">
              Le Coach transforme vos signaux réputation en actions simples,
              priorisées et mesurables.
            </p>
            <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Score initial</p>
                  <p className="mt-1 text-5xl font-semibold">{initialScore}</p>
                </div>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                  Bronze avancé
                </Badge>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-amber-300 transition-all duration-700"
                  style={{ width: `${initialScore}%` }}
                />
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Prochaine action
                </p>
                <p className="mt-1 font-semibold">Répondre aux avis prioritaires</p>
                <p className="mt-1 text-sm text-slate-300">
                  Votre premier levier de progression est identifié.
                </p>
              </div>
            </div>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              {[
                { icon: Target, label: "Priorités prêtes" },
                { icon: Trophy, label: "Progression débloquée" },
                { icon: Radar, label: "Veille disponible" }
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <Icon size={18} />
                  </div>
                  <p className="font-semibold text-slate-900">{label}</p>
                </div>
              ))}
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
          Votre assistant réputation est configuré. Vous pouvez maintenant piloter
          les avis, les réponses et la progression depuis EGIA.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Score", value: `${initialScore}/100` },
            { label: "Établissements", value: String(selectedCount) },
            { label: "IA", value: "Prête" },
            { label: "Progression", value: "Débloquée" }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-400">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <Button size="lg" className="mt-8" onClick={() => navigate("/")}>
          Accéder au Dashboard
          <ArrowRight size={18} />
        </Button>
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
            {steps.map((step, index) => (
              <div
                key={step}
                className={index <= currentStep ? "text-white" : "text-slate-500"}
              >
                {step}
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
