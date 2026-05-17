import type { Session } from "@supabase/supabase-js";
import {
  Award,
  BarChart3,
  Bot,
  Check,
  CheckCircle,
  FileText,
  Flag,
  Lock,
  Radar,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import { getNotifications } from "../lib/notifications";

type ProgressProps = {
  session: Session | null;
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

type Achievement = {
  title: string;
  description: string;
  unlocked: boolean;
  date?: string;
};

type TrophyItem = Achievement & {
  icon: typeof Trophy;
};

type FeatureUnlock = {
  label: string;
  description: string;
  unlocked: boolean;
  icon: typeof Sparkles;
};

const getStoredCompetitorProgress = (): boolean => {
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

const formatDate = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  } catch {
    return undefined;
  }
};

const getProgressLevel = (score: number) => {
  if (score >= 90) {
    return {
      label: "Expert",
      badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
      barClass: "bg-violet-400",
      message: "Votre réputation locale atteint un niveau avancé."
    };
  }

  if (score >= 70) {
    return {
      label: "Gold",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      barClass: "bg-amber-300",
      message: "Votre système réputation devient un vrai avantage business."
    };
  }

  if (score >= 40) {
    return {
      label: "Silver",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
      barClass: "bg-slate-300",
      message: "Votre base est solide, les prochains leviers sont clairs."
    };
  }

  return {
    label: "Bronze",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
    barClass: "bg-orange-300",
    message: "Votre parcours EGIA commence, chaque action débloque de la valeur."
  };
};

const Progress = ({ session, googleStatus, locations }: ProgressProps) => {
  const navigate = useNavigate();
  const googleConnected = googleStatus === "connected";
  const hasLocations = locations.length > 0;
  const notifications = getNotifications();
  const hasActivity = notifications.length > 0;
  const hasCompetitorProgress = getStoredCompetitorProgress();
  const createdAt = formatDate(session?.user.created_at);
  const unlockedSignals = [
    Boolean(session),
    googleConnected,
    hasLocations,
    hasActivity,
    hasCompetitorProgress
  ].filter(Boolean).length;
  const progressScore = Math.min(100, 38 + unlockedSignals * 12);
  const level = getProgressLevel(progressScore);

  const timeline: Achievement[] = [
    {
      title: "Compte créé",
      description: "Votre espace EGIA est prêt.",
      unlocked: Boolean(session),
      date: createdAt
    },
    {
      title: "Google connecté",
      description: "La source principale de réputation est reliée.",
      unlocked: googleConnected,
      date: googleConnected ? "Aujourd’hui" : undefined
    },
    {
      title: "Premiers établissements importés",
      description: hasLocations
        ? `${locations.length} établissement${locations.length > 1 ? "s" : ""} suivi${locations.length > 1 ? "s" : ""}.`
        : "Importez vos fiches pour lancer le pilotage.",
      unlocked: hasLocations,
      date: hasLocations ? "Aujourd’hui" : undefined
    },
    {
      title: "Premiers avis synchronisés",
      description: "Les signaux clients commencent à alimenter le coach.",
      unlocked: hasActivity,
      date: hasActivity ? "Aujourd’hui" : undefined
    },
    {
      title: "Première automatisation activée",
      description: "Un workflow fait gagner du temps à l’équipe.",
      unlocked: false
    },
    {
      title: "Premier rapport généré",
      description: "Une synthèse business est prête à partager.",
      unlocked: false
    }
  ];

  const trophies: TrophyItem[] = [
    {
      icon: Trophy,
      title: "Premier avis répondu",
      description: "Répondre au premier avis depuis EGIA.",
      unlocked: hasActivity,
      date: hasActivity ? "Aujourd’hui" : undefined
    },
    {
      icon: Star,
      title: "50 avis traités",
      description: "Installer une vraie routine de réponse client.",
      unlocked: false
    },
    {
      icon: BarChart3,
      title: "Taux réponse 90%",
      description: "Maintenir un niveau de suivi premium.",
      unlocked: hasActivity,
      date: hasActivity ? "Aujourd’hui" : undefined
    },
    {
      icon: Zap,
      title: "Première automatisation",
      description: "Activer un scénario qui accélère l’exploitation.",
      unlocked: false
    },
    {
      icon: Award,
      title: "100 avis synchronisés",
      description: "Atteindre un volume robuste d’apprentissage.",
      unlocked: false
    },
    {
      icon: Radar,
      title: "Première veille concurrentielle",
      description: "Comparer votre présence locale au marché.",
      unlocked: hasCompetitorProgress,
      date: hasCompetitorProgress ? "Aujourd’hui" : undefined
    },
    {
      icon: FileText,
      title: "Premier rapport PDF",
      description: "Produire un livrable clair pour piloter.",
      unlocked: false
    }
  ];

  const features: FeatureUnlock[] = [
    {
      icon: Bot,
      label: "Réponses IA",
      description: "Drafts assistés pour répondre plus vite.",
      unlocked: googleConnected && hasLocations
    },
    {
      icon: Radar,
      label: "Veille",
      description: "Analyse concurrentielle locale.",
      unlocked: hasCompetitorProgress
    },
    {
      icon: Sparkles,
      label: "Widgets",
      description: "Preuves sociales intégrables.",
      unlocked: false
    },
    {
      icon: FileText,
      label: "Rapports",
      description: "Synthèses business exportables.",
      unlocked: false
    },
    {
      icon: Zap,
      label: "Automatisations",
      description: "Scénarios pour industrialiser le suivi.",
      unlocked: false
    },
    {
      icon: Users,
      label: "Social Studio",
      description: "Activation marque et contenus.",
      unlocked: false
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                <Trophy size={14} />
                Parcours business
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  Niveau {level.label}
                </h2>
                <Badge className={level.badgeClass}>{level.label}</Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                {level.message}
              </p>
              <div className="mt-8">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-300">
                  <span>Progression utilisateur</span>
                  <span>{progressScore}/100</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full ${level.barClass} transition-all duration-700`}
                    style={{ width: `${progressScore}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <p className="text-sm font-semibold text-slate-200">
                Prochain déblocage
              </p>
              <p className="mt-2 text-2xl font-semibold">Automatisations</p>
              <p className="mt-2 text-sm text-slate-300">
                Activez un premier scénario pour transformer EGIA en assistant
                opérationnel.
              </p>
              <Button
                className="mt-5 bg-white text-slate-950 hover:bg-slate-100"
                onClick={() => navigate("/automation")}
              >
                Voir automatisations
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Historique activité</CardTitle>
            <p className="text-sm text-slate-500">
              Les étapes qui structurent votre montée en puissance.
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-5 before:absolute before:left-3 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
              {timeline.map((item) => (
                <div key={item.title} className="relative flex gap-4">
                  <div
                    className={`z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white ${
                      item.unlocked
                        ? "border-emerald-200 text-emerald-600"
                        : "border-slate-200 text-slate-400"
                    }`}
                  >
                    {item.unlocked ? <Check size={14} /> : <Lock size={13} />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      {item.date && (
                        <span className="text-xs text-slate-500">{item.date}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Salle des trophées</CardTitle>
            <p className="text-sm text-slate-500">
              Des jalons business élégants, pensés pour garder le rythme.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {trophies.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className={`rounded-2xl border p-4 transition ${
                      item.unlocked
                        ? "border-emerald-100 bg-emerald-50/60"
                        : "border-slate-200 bg-slate-50 opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                          item.unlocked
                            ? "bg-white text-emerald-600"
                            : "bg-white text-slate-400"
                        }`}
                      >
                        {item.unlocked ? <Icon size={20} /> : <Lock size={18} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {item.title}
                          </p>
                          {item.unlocked && (
                            <CheckCircle size={15} className="text-emerald-600" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.description}
                        </p>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {item.unlocked ? item.date ?? "Débloqué" : "Verrouillé"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Fonctionnalités débloquées</CardTitle>
          <p className="text-sm text-slate-500">
            Les capacités activées à mesure que votre système devient plus mature.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.label}
                  className={`rounded-2xl border p-4 ${
                    feature.unlocked
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        feature.unlocked
                          ? "bg-slate-950 text-white"
                          : "bg-white text-slate-400"
                      }`}
                    >
                      {feature.unlocked ? <Icon size={19} /> : <Lock size={17} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {feature.label}
                        </p>
                        <Badge variant={feature.unlocked ? "success" : "neutral"}>
                          {feature.unlocked ? "Débloqué" : "À venir"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-white">
        <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <Flag size={14} />
              Passez au niveau supérieur
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Transformez vos prochains progrès en avantage commercial.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Continuez depuis le Coach EGIA, automatisez les actions répétitives
              et renforcez votre réputation locale.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
            <Button onClick={() => navigate("/coach")}>Ouvrir Coach</Button>
            <Button variant="outline" onClick={() => navigate("/automation")}>
              Voir automatisations
            </Button>
            <Button variant="outline" onClick={() => navigate("/inbox")}>
              Améliorer réputation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export { Progress };
