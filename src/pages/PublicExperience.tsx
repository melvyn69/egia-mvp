import { type CSSProperties, type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpenText,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Hotel,
  Layers3,
  MapPin,
  Menu,
  MessageSquareReply,
  MessageSquareText,
  Quote,
  Radar,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Utensils,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EgiaLogo } from "../components/brand/EgiaLogo";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";
import {
  faqs,
  features,
  pricingPlans
} from "./publicExperienceData";
import type { FeaturePreviewKind } from "./publicExperienceData";

type LoginExperienceProps = {
  authEmail: string;
  authPassword: string;
  authError: string | null;
  authMessage: string | null;
  envMissing: boolean;
  passwordSignInLoading: boolean;
  googleSignInLoading?: boolean;
  passwordResetLoading?: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onMagicLink: () => void;
  onPasswordSignIn: () => void;
  onGoogleSignIn?: () => void;
  onForgotPassword?: () => void;
  onSignup?: () => void;
};

type IconCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type DemoTabId = "reviews" | "ai" | "alerts" | "benchmark" | "reports";

type DemoTab = {
  id: DemoTabId;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  stat: string;
  statLabel: string;
  bars?: number[];
  kpis: Array<{ value: string; label: string }>;
  notification: {
    title: string;
    body: string;
  };
  draft: string;
  rows: Array<{ label: string; value: string; tone: "good" | "watch" | "neutral" }>;
};

const navItems = [
  { href: "#produit", label: "Produit" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#ressources", label: "Ressources" },
  { href: "/login", label: "Connexion" }
];

const proofKpis = [
  { value: "+12 000", label: "avis analysés" },
  { value: "97%", label: "de réponses traitées" },
  { value: "+2,1 pts", label: "de satisfaction client" },
  { value: "Multi-sites", label: "prêt franchise" }
];

const trustPills = [
  { icon: Utensils, label: "Restaurants" },
  { icon: Hotel, label: "Hôtels" },
  { icon: Building2, label: "Franchises" },
  { icon: Sparkles, label: "Salons" },
  { icon: Store, label: "Commerces" },
  { icon: MapPin, label: "Services locaux" }
];

const beforeItems = [
  "Avis dispersés",
  "Réponses oubliées",
  "Avis négatifs traités trop tard",
  "Aucun suivi concurrentiel",
  "Reporting manuel"
];

const afterItems = [
  "Tous les avis centralisés",
  "Réponses IA cohérentes avec votre marque",
  "Alertes intelligentes",
  "Analyse de sentiment",
  "Benchmark local",
  "Rapports automatiques"
];

const heroDashboardMetrics = [
  { value: "4,7", label: "note moyenne", icon: Star },
  { value: "328", label: "nouveaux avis", icon: MessageSquareText },
  { value: "94%", label: "taux de réponse", icon: CheckCircle2 },
  { value: "82%", label: "sentiment positif", icon: TrendingUp }
];

const heroVolumeBars = [42, 58, 44, 70, 62, 86, 78];

const heroSentimentBars = [58, 66, 62, 74, 82, 76, 88, 84];

const heroFloatingNotifications = [
  {
    icon: AlertTriangle,
    title: "Avis négatif détecté",
    meta: "Restaurant Saint-Paul",
    value: "à traiter"
  },
  {
    icon: Sparkles,
    title: "Réponse IA prête",
    meta: "Ton empathique validé",
    value: "42 s"
  },
  {
    icon: Radar,
    title: "Benchmark local",
    meta: "Position gagnée cette semaine",
    value: "#2"
  }
];

const heroNotificationFeed = [
  { label: "Nouvel avis 5 étoiles", meta: "Hôtel République", tone: "good" },
  { label: "Signal attente", meta: "Récurrence détectée", tone: "watch" },
  { label: "Réponse publiée", meta: "Salon Victor Hugo", tone: "neutral" }
];

const featurePreviewContent: Record<
  FeaturePreviewKind,
  {
    eyebrow: string;
    metric: string;
    metricLabel: string;
    chart: number[];
    aiTitle: string;
    aiCopy: string;
    rows: string[];
    kpis: Array<{ label: string; value: string }>;
  }
> = {
  inbox: {
    eyebrow: "Inbox réseau",
    metric: "12",
    metricLabel: "avis",
    chart: [38, 54, 46, 70, 62, 84],
    aiTitle: "Réponse à valider",
    aiCopy: "Merci pour votre retour. L’équipe locale revient vers vous avec attention.",
    rows: ["Avis 5 étoiles", "Réponse à valider", "Signal client"],
    kpis: [
      { label: "Note", value: "4,7" },
      { label: "SLA", value: "94%" },
      { label: "IA", value: "actif" }
    ]
  },
  ai: {
    eyebrow: "Studio IA",
    metric: "92%",
    metricLabel: "confiance",
    chart: [32, 48, 58, 66, 78, 90],
    aiTitle: "Brouillon généré",
    aiCopy: "Votre remarque est bien prise en compte et transmise à l’équipe terrain.",
    rows: ["Ton empathique", "Marque respectée", "Validation manager"],
    kpis: [
      { label: "Ton", value: "OK" },
      { label: "Gain", value: "42s" },
      { label: "IA", value: "92%" }
    ]
  },
  alert: {
    eyebrow: "Centre alertes",
    metric: "Urgent",
    metricLabel: "à traiter",
    chart: [72, 64, 58, 46, 42, 34],
    aiTitle: "Signal faible",
    aiCopy: "Le thème attente revient plusieurs fois et mérite une action aujourd’hui.",
    rows: ["Avis négatif", "Récurrence 3x", "Manager notifié"],
    kpis: [
      { label: "Risque", value: "haut" },
      { label: "SLA", value: "24h" },
      { label: "Sites", value: "3" }
    ]
  },
  chart: {
    eyebrow: "Analytics",
    metric: "+14%",
    metricLabel: "sentiment",
    chart: [35, 62, 48, 78, 66, 90],
    aiTitle: "Insight IA",
    aiCopy: "L’accueil progresse, mais l’attente reste le principal levier opérationnel.",
    rows: ["Sentiment positif", "Benchmark local", "Rapport prêt"],
    kpis: [
      { label: "Note", value: "4,8" },
      { label: "Rang", value: "#2" },
      { label: "Gain", value: "+0,3" }
    ]
  }
};

const demoImpactBars = [46, 52, 65, 58, 74, 84, 92];

const workflowSteps: IconCard[] = [
  {
    icon: MapPin,
    title: "Connectez vos sources d’avis",
    description: "Reliez vos établissements Google et préparez votre première vue réseau."
  },
  {
    icon: Sparkles,
    title: "L’IA analyse chaque retour client",
    description: "Note, sentiment, thèmes, urgence et prochaines actions sont qualifiés."
  },
  {
    icon: MessageSquareReply,
    title: "Vous répondez plus vite et mieux",
    description: "Vos équipes partent d’un brouillon fiable et gardent le contrôle final."
  },
  {
    icon: TrendingUp,
    title: "Vous suivez l’impact",
    description: "Réponse, satisfaction, visibilité et concurrence deviennent mesurables."
  }
];

const demoTabs: DemoTab[] = [
  {
    id: "reviews",
    label: "Avis",
    icon: MessageSquareText,
    title: "Inbox priorisée",
    description: "Visualisez les avis récents, leur niveau d’urgence et l’établissement concerné.",
    stat: "128",
    statLabel: "avis ce mois-ci",
    bars: [42, 52, 61, 58, 72, 84, 88],
    kpis: [
      { value: "94%", label: "avis qualifiés" },
      { value: "12", label: "sites connectés" },
      { value: "+18%", label: "volume récent" }
    ],
    notification: {
      title: "Nouvel avis prioritaire",
      body: "Restaurant Saint-Paul remonte dans la file avec une note basse et un thème récurrent."
    },
    draft:
      "Merci pour votre retour. Nous transmettons votre remarque à l’équipe locale afin d’améliorer l’expérience lors des prochains services.",
    rows: [
      { label: "Hôtel République", value: "4,8 · nouveau", tone: "good" },
      { label: "Restaurant Saint-Paul", value: "2,0 · urgent", tone: "watch" },
      { label: "Salon Victor Hugo", value: "5,0 · à remercier", tone: "neutral" }
    ]
  },
  {
    id: "ai",
    label: "Réponses IA",
    icon: Sparkles,
    title: "Brouillons prêts à valider",
    description: "L’IA adapte les réponses au contexte, à la note et au ton de votre marque.",
    stat: "42 s",
    statLabel: "temps moyen gagné",
    bars: [36, 44, 56, 68, 74, 86, 94],
    kpis: [
      { value: "92%", label: "confiance IA" },
      { value: "3", label: "tons proposés" },
      { value: "18", label: "brouillons prêts" }
    ],
    notification: {
      title: "Réponse prête à valider",
      body: "Le ton empathique a été choisi automatiquement pour un avis sensible."
    },
    draft:
      "Merci pour votre message. Votre remarque a bien été comprise et l’équipe locale va revenir sur ce point pour améliorer votre prochaine visite.",
    rows: [
      { label: "Empathique", value: "Avis négatif", tone: "watch" },
      { label: "Chaleureux", value: "Avis 5 étoiles", tone: "good" },
      { label: "Concise", value: "Question pratique", tone: "neutral" }
    ]
  },
  {
    id: "alerts",
    label: "Alertes",
    icon: BellRing,
    title: "Signaux faibles détectés",
    description: "Les avis à risque remontent avant d’abîmer votre note ou votre expérience client.",
    stat: "8",
    statLabel: "alertes ouvertes",
    bars: [70, 64, 58, 52, 46, 38, 32],
    kpis: [
      { value: "3x", label: "signal répété" },
      { value: "24h", label: "priorité SLA" },
      { value: "-12%", label: "risque estimé" }
    ],
    notification: {
      title: "Signal faible confirmé",
      body: "Le thème attente longue revient sur trois avis en moins de sept jours."
    },
    draft:
      "Merci d’avoir signalé ce point. Nous renforçons l’organisation sur les créneaux les plus chargés et suivrons ce sujet avec attention.",
    rows: [
      { label: "Attente trop longue", value: "Récurrence 3x", tone: "watch" },
      { label: "Accueil excellent", value: "Signal positif", tone: "good" },
      { label: "Propreté", value: "À surveiller", tone: "neutral" }
    ]
  },
  {
    id: "benchmark",
    label: "Benchmark",
    icon: Radar,
    title: "Lecture concurrentielle locale",
    description: "Comparez note, volume d’avis, rythme de réponse et opportunités par zone.",
    stat: "#2",
    statLabel: "position locale",
    bars: [44, 59, 63, 72, 68, 81, 88],
    kpis: [
      { value: "+18", label: "avis vs zone" },
      { value: "4,7", label: "note réseau" },
      { value: "#2", label: "rang local" }
    ],
    notification: {
      title: "Progression concurrentielle",
      body: "Votre volume d’avis dépasse le concurrent A sur la zone active."
    },
    draft:
      "Merci pour votre avis. Votre retour contribue à améliorer notre visibilité locale et à maintenir un niveau de service régulier.",
    rows: [
      { label: "Vous", value: "4,7 · +18 avis", tone: "good" },
      { label: "Concurrent A", value: "4,5 · +7 avis", tone: "neutral" },
      { label: "Concurrent B", value: "4,8 · +22 avis", tone: "watch" }
    ]
  },
  {
    id: "reports",
    label: "Rapports",
    icon: FileText,
    title: "Synthèses pour direction",
    description: "Exportez les enseignements clés pour les rituels managers, réseaux et CODIR.",
    stat: "1 clic",
    statLabel: "rapport prêt",
    bars: [38, 48, 60, 56, 74, 78, 90],
    kpis: [
      { value: "93%", label: "SLA réponse" },
      { value: "+0,3", label: "note moyenne" },
      { value: "5", label: "actions clés" }
    ],
    notification: {
      title: "Synthèse direction prête",
      body: "Les priorités réseau sont regroupées par impact client et établissement."
    },
    draft:
      "Merci pour votre retour. Votre expérience est intégrée à notre synthèse qualité pour prioriser les prochaines actions terrain.",
    rows: [
      { label: "Évolution note", value: "+0,3 pt", tone: "good" },
      { label: "SLA réponse", value: "93%", tone: "good" },
      { label: "Risque principal", value: "Temps d’attente", tone: "watch" }
    ]
  }
];

const useCases = [
  {
    icon: Utensils,
    title: "Restaurant indépendant",
    pain: "Les avis négatifs arrivent entre deux services.",
    benefit: "Réponses guidées, alertes rapides et suivi des thèmes clients.",
    result: "Meilleure note locale et moins de temps perdu."
  },
  {
    icon: Layers3,
    title: "Groupe multi-établissements",
    pain: "Chaque lieu travaille différemment.",
    benefit: "Vue réseau, comparaisons et routines de réponse homogènes.",
    result: "Pilotage clair pour direction et managers terrain."
  },
  {
    icon: Hotel,
    title: "Hôtel",
    pain: "Les avis influencent directement la réservation.",
    benefit: "Analyse fine de l’accueil, propreté, chambre et petit-déjeuner.",
    result: "Priorités opérationnelles visibles chaque semaine."
  },
  {
    icon: Building2,
    title: "Franchise",
    pain: "Le siège manque d’une lecture locale fiable.",
    benefit: "Standards de réponse, benchmark et reporting franchisés.",
    result: "Alignement marque sans perdre le contexte local."
  },
  {
    icon: Store,
    title: "Commerce local",
    pain: "Peu de temps pour répondre et demander des avis.",
    benefit: "Inbox simple, QR codes et campagnes d’avis activables.",
    result: "Plus d’avis récents et une réputation plus visible."
  }
];

const testimonials = [
  {
    quote:
      "Reviewflow nous aide à répondre avec le bon ton et à repérer les sujets qui reviennent dans plusieurs adresses.",
    name: "Claire M.",
    role: "Directrice opérations",
    company: "Réseau de restaurants",
    result: "+31% d’avis répondus"
  },
  {
    quote:
      "La lecture multi-sites est beaucoup plus claire. Les managers voient tout de suite ce qui mérite une action.",
    name: "Yanis B.",
    role: "Responsable expérience client",
    company: "Groupe hôtelier indépendant",
    result: "SLA réponse 24h"
  },
  {
    quote:
      "Le reporting mensuel est devenu exploitable. On sort des tableaux manuels pour parler satisfaction et concurrence.",
    name: "Sophie L.",
    role: "Fondatrice",
    company: "Franchise services locaux",
    result: "+0,4 pt de note"
  }
];

const resources = [
  "Comment répondre à un avis Google négatif ?",
  "Comment améliorer la note Google d’un restaurant ?",
  "Réponses automatiques avis Google : bonnes pratiques et limites",
  "Comment piloter la réputation d’un réseau multi-établissements ?"
];

const seoContentBlocks = [
  {
    title: "Logiciel avis Google pour équipes locales",
    body:
      "Reviewflow aide les établissements à suivre leurs avis Google au même endroit, à prioriser les retours sensibles et à garder une vision claire de la satisfaction client."
  },
  {
    title: "Gestion des avis clients sans dispersion",
    body:
      "Les équipes peuvent structurer la gestion avis clients avec des alertes, des brouillons IA, un historique de réponse et des indicateurs compréhensibles par les managers."
  },
  {
    title: "E-réputation commerce local et restaurant",
    body:
      "Pour la réputation en ligne restaurant, hôtel ou commerce de proximité, Reviewflow transforme chaque avis en signal opérationnel et en opportunité de fidélisation."
  },
  {
    title: "Logiciel réputation multi-établissements",
    body:
      "Les réseaux et franchises disposent d’un logiciel réputation multi-établissements pour comparer les lieux, homogénéiser les réponses et suivre la performance locale."
  }
];

const footerColumns = [
  ["Produit", "Fonctionnalités", "Tarifs", "Démo", "Connexion"],
  ["Ressources", "Blog", "Guides", "Centre d’aide", "FAQ"],
  ["Entreprise", "Contact", "Sécurité", "RGPD", "Statut"],
  ["Légal", "Mentions légales", "Confidentialité", "CGU", "Cookies"]
];

const loginSecurityItems = [
  { icon: ShieldCheck, label: "RGPD" },
  { icon: Building2, label: "Hébergement sécurisé" },
  { icon: MessageSquareReply, label: "Support français" },
  { icon: CheckCircle2, label: "Sauvegardes quotidiennes" }
];

const loginCompactProofs = [
  { value: "4,8/5", label: "note moyenne" },
  { value: "97%", label: "avis répondus" }
];

const loginDashboardMetrics = [
  { value: "4,8/5", label: "note moyenne", icon: Star },
  { value: "97%", label: "avis répondus", icon: CheckCircle2 },
  { value: "+245", label: "avis analysés", icon: BarChart3 },
  { value: "Alerte", label: "avis négatif détectée", icon: AlertTriangle }
];

const loginImpactBars = [48, 64, 52, 74, 68, 92, 84];

const loginLiveNotifications = [
  { label: "Google Business Profile", value: "Nouvel avis reçu", tone: "cyan" },
  { label: "Analyse IA", value: "Signal attente détecté", tone: "violet" },
  { label: "Réponse générée", value: "Brouillon prêt à valider", tone: "indigo" }
];

const loginFlowEvents = [
  { icon: BellRing, label: "Notification", value: "avis sensible", detail: "Restaurant Saint-Paul" },
  { icon: MessageSquareText, label: "Nouvel avis", value: "3 étoiles", detail: "attente samedi soir" },
  { icon: Radar, label: "IA analyse", value: "signal confirmé", detail: "thème récurrent" },
  { icon: Sparkles, label: "Réponse", value: "brouillon prêt", detail: "ton empathique" },
  { icon: TrendingUp, label: "Impact", value: "+18%", detail: "suivi cette semaine" }
];

const loginAnalysisSignals = [
  { label: "Thème détecté", value: "attente", tone: "watch" },
  { label: "Priorité", value: "24h", tone: "neutral" },
  { label: "Confiance IA", value: "92%", tone: "good" }
];

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-semibold uppercase text-indigo-600">
    {children}
  </p>
);

const demoMotionStyle = (delay: number, extra: CSSProperties = {}) =>
  ({
    ...extra,
    "--demo-delay": `${delay}ms`
  }) as CSSProperties;

const PrimaryCta = ({ children = "Démarrer gratuitement" }: { children?: string }) => (
  <Link
    to="/login"
    className="premium-cta-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto"
  >
    {children}
    <ArrowRight size={17} />
  </Link>
);

const SecondaryCta = ({
  dark = false,
  children = "Voir une démo"
}: {
  dark?: boolean;
  children?: string;
}) => (
  <a
    href="#demo"
    className={cn(
      "premium-cta-secondary inline-flex h-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto",
      dark
        ? "border-white/20 bg-white/5 text-white"
        : "border-slate-200 bg-white/76 text-slate-900"
    )}
  >
    {children}
  </a>
);

const HeroDashboardMockup = () => (
  <div className="reviewflow-hero-stage relative mx-auto w-full max-w-[47rem]" aria-label="Aperçu du dashboard Reviewflow">
    <div className="reviewflow-hero-halo" />

    <div className="reviewflow-float-card reviewflow-float-card-left hidden xl:block">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-300/12 text-violet-100 ring-1 ring-violet-200/20">
          <AlertTriangle size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Alerte critique</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">Temps d’attente cité 3 fois.</p>
        </div>
      </div>
    </div>

    <div className="reviewflow-float-card reviewflow-float-card-right hidden xl:block">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-200">IA</p>
          <p className="mt-1 text-sm font-semibold text-white">Réponse prête</p>
        </div>
        <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-200/20">
          42 s
        </span>
      </div>
    </div>

    <div className="reviewflow-dashboard-shell relative overflow-hidden rounded-[34px] p-3 sm:p-4 lg:p-5">
      <div className="reviewflow-dashboard-screen rounded-[26px] p-4 text-white sm:p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <EgiaLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Cockpit réputation</p>
              <p className="text-xs text-slate-400">12 établissements · analyse temps réel</p>
            </div>
          </div>
          <span className="reviewflow-live-pill">
            <span className="reviewflow-live-dot" />
            Live
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {heroDashboardMetrics.map(({ value, label, icon: MetricIcon }) => (
            <div key={label} className="reviewflow-metric-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold">{value}</p>
                <MetricIcon size={17} className="text-cyan-200" />
              </div>
              <p className="mt-1 text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="reviewflow-panel p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Sentiment client</p>
                <p className="mt-1 text-xs text-slate-400">Tendance sur 8 semaines</p>
              </div>
              <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-200/10">
                +14%
              </span>
            </div>
            <div className="reviewflow-line-chart mt-5">
              {heroSentimentBars.map((height, index) => (
                <span
                  key={index}
                  className="reviewflow-line-column"
                  style={{ height: `${height}%`, animationDelay: `${index * 140}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="reviewflow-panel p-4 lg:p-5">
            <div className="flex items-center gap-2 text-cyan-100">
              <Sparkles size={16} />
              <p className="text-sm font-semibold">Réponse IA générée</p>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <p className="text-xs leading-5 text-slate-300">
                Merci pour votre retour. Votre remarque sur l’attente est transmise
                à l’équipe locale afin d’améliorer le service du week-end.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>Ton empathique</span>
              <span className="text-cyan-200">Confiance 92%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="reviewflow-panel p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="mt-1 text-xs text-slate-400">Priorisées par impact</p>
              </div>
              <BellRing size={17} className="text-cyan-200" />
            </div>
            <div className="mt-5 space-y-3">
              {heroNotificationFeed.map((item) => (
                <div key={item.label} className="reviewflow-depth-notification-dark">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{item.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.meta}</p>
                  </div>
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      item.tone === "good" && "bg-cyan-300",
                      item.tone === "watch" && "bg-violet-300",
                      item.tone === "neutral" && "bg-indigo-300"
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="reviewflow-panel p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Volume d’avis</p>
                <p className="text-xs text-slate-400">7 derniers jours</p>
              </div>
              <span className="rounded-full bg-indigo-400/15 px-2.5 py-1 text-xs font-semibold text-indigo-100">
                +18%
              </span>
            </div>
            <div className="mt-5 flex h-28 items-end gap-2">
              {heroVolumeBars.map((height, index) => (
                <span
                  key={index}
                  className="reviewflow-volume-bar"
                  style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:hidden">
          {heroFloatingNotifications.map(({ icon: Icon, title, meta, value }) => (
            <div key={title} className="reviewflow-mobile-insight">
              <div className="flex items-center justify-between gap-2">
                <Icon size={15} className="text-cyan-200" />
                <span className="text-xs font-semibold text-cyan-100">{value}</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-white">{title}</p>
              <p className="mt-1 truncate text-[11px] text-slate-400">{meta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const FeaturePreview = ({ preview }: { preview: FeaturePreviewKind }) => {
  const content = featurePreviewContent[preview];

  return (
    <div className="reviewflow-feature-preview mt-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-300" />
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
        </div>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.9)]">
          {content.eyebrow}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="reviewflow-mini-dashboard">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Cockpit</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{content.metric}</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">{content.metricLabel}</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
              Live
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {content.rows.slice(0, 2).map((row, index) => (
              <div key={row} className="flex items-center justify-between rounded-xl bg-white/78 px-3 py-2 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
                <span className="truncate">{row}</span>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    index === 0 ? "bg-indigo-500" : "bg-cyan-400"
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="reviewflow-mini-chart">
          <div className="flex h-20 items-end gap-1.5 rounded-2xl border border-slate-200/70 bg-white/70 p-3">
            {content.chart.map((height, index) => (
              <span
                key={index}
                className="reviewflow-preview-bar flex-1 rounded-t-md bg-gradient-to-t from-indigo-600 via-violet-400 to-cyan-300"
                style={{ height: `${height}%`, animationDelay: `${index * 100}ms` }}
              />
            ))}
          </div>
        </div>

        <div className="reviewflow-mini-ai-response">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            {preview === "alert" ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
            {content.aiTitle}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">
            {content.aiCopy}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {content.kpis.map((kpi) => (
            <div key={kpi.label} className="reviewflow-mini-kpi-tile">
              <p className="text-[10px] font-medium text-slate-400">{kpi.label}</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-950">{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DemoPreview = ({ tab }: { tab: DemoTab }) => {
  const demoBars = tab.bars ?? demoImpactBars;

  return (
    <div className="reviewflow-demo-stage reviewflow-demo-transition">
      <div className="reviewflow-demo-dashboard">
        <div className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="reviewflow-depth-badge reviewflow-demo-chip text-indigo-700">
                {tab.label}
              </span>
              <span className="reviewflow-depth-badge reviewflow-demo-chip text-slate-600">
                Mode équipe
              </span>
            </div>
            <h3 className="reviewflow-demo-title mt-4 text-3xl font-semibold text-slate-950">{tab.title}</h3>
            <p className="reviewflow-demo-copy mt-4 max-w-xl text-sm leading-6 text-slate-600">{tab.description}</p>
          </div>
          <div className="reviewflow-demo-stat reviewflow-kpi-shift" style={demoMotionStyle(80)}>
            <p className="text-3xl font-semibold">{tab.stat}</p>
            <p className="mt-1 text-xs text-slate-400">{tab.statLabel}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {tab.kpis.map((kpi, index) => (
            <div
              key={`${tab.id}-${kpi.label}`}
              className="reviewflow-demo-mini-kpi"
              style={demoMotionStyle(120 + index * 70)}
            >
              <p className="text-lg font-semibold text-slate-950">{kpi.value}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{kpi.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="reviewflow-depth-card p-5 sm:p-6" style={demoMotionStyle(180)}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Priorités terrain</p>
                <p className="mt-1 text-xs text-slate-500">Triées par urgence et impact local</p>
              </div>
              <span className="reviewflow-depth-badge text-cyan-700">Synchronisé</span>
            </div>

            <div className="mt-5 space-y-3">
              {tab.rows.map((row, index) => (
                <div
                  key={row.label}
                  className="reviewflow-depth-notification reviewflow-demo-row"
                  style={demoMotionStyle(230 + index * 70)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{row.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.value}</p>
                  </div>
                  <span
                    className={cn(
                      "h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(148,163,184,0.12)]",
                      row.tone === "good" && "bg-cyan-500",
                      row.tone === "watch" && "bg-violet-500",
                      row.tone === "neutral" && "bg-indigo-500"
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="reviewflow-depth-card relative overflow-hidden p-5 sm:p-6" style={demoMotionStyle(240)}>
            <div className="reviewflow-depth-tooltip hidden sm:block">
              <Sparkles size={14} />
              <span>Signal IA confirmé</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Impact réputation</p>
                <p className="mt-1 text-xs text-slate-500">Projection sur les 7 prochains jours</p>
              </div>
              <span className="reviewflow-depth-badge text-indigo-700">Live</span>
            </div>
            <div className="mt-7 flex h-40 items-end gap-2 rounded-2xl border border-slate-200/70 bg-white/70 p-5">
              {demoBars.map((height, index) => (
                <span
                  key={`${tab.id}-${index}`}
                  className="reviewflow-demo-bar"
                  style={demoMotionStyle(index * 65, { height: `${height}%` })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="reviewflow-depth-card p-5" style={demoMotionStyle(330)}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <BellRing size={16} className="text-indigo-600" />
              {tab.notification.title}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              {tab.notification.body}
            </p>
          </div>

          <div className="reviewflow-depth-card p-5" style={demoMotionStyle(390)}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Sparkles size={16} className="text-indigo-600" />
              Brouillon IA contextualisé
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              {tab.draft}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const useCasePreviewBars = [
  [42, 62, 54, 78],
  [58, 70, 64, 86],
  [46, 52, 72, 80],
  [50, 66, 76, 68],
  [38, 56, 70, 74]
];

const useCasePreviewMetrics = [
  { value: "4,8", label: "note locale", response: "Réponse prête avant le prochain service." },
  { value: "12", label: "sites actifs", response: "Synthèse réseau envoyée aux managers." },
  { value: "93%", label: "SLA réponse", response: "Signal accueil intégré au rapport qualité." },
  { value: "#2", label: "rang zone", response: "Benchmark local mis à jour cette semaine." },
  { value: "+18%", label: "avis récents", response: "Campagne QR reliée aux retours clients." }
];

const UseCaseMiniPreview = ({ index }: { index: number }) => {
  const bars = useCasePreviewBars[index % useCasePreviewBars.length];
  const metric = useCasePreviewMetrics[index % useCasePreviewMetrics.length];

  return (
    <div className="reviewflow-feature-preview mt-5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">Mini cockpit</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          {metric.value}
        </span>
      </div>
      <div className="reviewflow-mini-dashboard mt-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-950">{metric.value}</p>
            <p className="text-[11px] font-medium text-slate-500">{metric.label}</p>
          </div>
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.13)]" />
        </div>
        <div className="mt-3 flex h-12 items-end gap-1.5 rounded-xl bg-white/72 p-2.5">
          {bars.map((height, barIndex) => (
            <span
              key={barIndex}
              className="reviewflow-preview-bar flex-1 rounded-t-md bg-gradient-to-t from-indigo-600 via-violet-400 to-cyan-300"
              style={{ height: `${height}%`, animationDelay: `${barIndex * 120}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="reviewflow-mini-ai-response mt-3 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
          <Sparkles size={12} />
          Réponse IA prête
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-600">{metric.response}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="reviewflow-mini-kpi-tile">
          <p className="text-[10px] font-medium text-slate-400">Avis</p>
          <p className="mt-1 text-xs font-semibold text-slate-950">+24</p>
        </div>
        <div className="reviewflow-mini-kpi-tile">
          <p className="text-[10px] font-medium text-slate-400">IA</p>
          <p className="mt-1 text-xs font-semibold text-slate-950">actif</p>
        </div>
      </div>
    </div>
  );
};

const MarketingHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/82 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Accueil Reviewflow EGIA"
        >
          <EgiaLogo variant="icon" size="sm" />
          <span className="min-w-0">
            <EgiaLogo variant="light" size="sm" showSuite />
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 p-1 text-sm font-medium text-slate-600 shadow-sm lg:flex" aria-label="Navigation principale">
          {navItems.map((item) =>
            item.href.startsWith("/") ? (
              <Link
                key={item.href}
                to={item.href}
                className="premium-nav-motion rounded-full px-3 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="premium-nav-motion rounded-full px-3 py-2 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {item.label}
              </a>
            )
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <SecondaryCta>Voir la démo</SecondaryCta>
          <Link
            to="/login"
            className="premium-cta-primary inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_38px_-22px_rgba(15,23,42,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Essai gratuit
          </Link>
        </div>

        <button
          type="button"
          className="premium-button-motion inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/86 text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-landing-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-landing-menu" className="border-t border-slate-200 bg-white/96 px-4 py-5 shadow-xl backdrop-blur lg:hidden">
          <nav className="grid gap-2 text-sm font-semibold text-slate-700" aria-label="Navigation mobile">
            {navItems.map((item) =>
              item.href.startsWith("/") ? (
                <Link
                  key={item.href}
                  to={item.href}
                  className="premium-nav-motion rounded-2xl px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className="premium-nav-motion rounded-2xl px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              )
            )}
          </nav>
          <div className="mt-5 grid gap-3">
            <PrimaryCta>Essai gratuit</PrimaryCta>
            <SecondaryCta>Voir la démo</SecondaryCta>
          </div>
        </div>
      )}
    </header>
  );
};

const MarketingLandingPage = () => {
  const [activeTabId, setActiveTabId] = useState<DemoTabId>("reviews");
  const activeTab = demoTabs.find((tab) => tab.id === activeTabId) ?? demoTabs[0];

  return (
    <div className="premium-page-background min-h-screen min-w-0 overflow-x-hidden text-slate-950">
      <MarketingHeader />

      <main>
        <section id="produit" className="premium-grid-background relative overflow-hidden border-b border-slate-200/70">
          <div className="mx-auto grid max-w-7xl gap-16 px-4 py-24 sm:gap-20 sm:px-6 sm:py-28 lg:min-h-[calc(100vh-4.5rem)] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-32 xl:min-h-[52rem] xl:gap-20 xl:py-36">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="premium-eyebrow">
                <Sparkles size={14} />
                Plateforme IA pour avis clients & réputation locale
              </div>
              <h1 className="editorial-hero-title mt-8 max-w-4xl text-slate-950">
                Le copilote IA qui transforme vos avis clients en croissance
              </h1>
              <p className="editorial-copy mt-7 max-w-2xl text-lg sm:text-xl">
                Centralisez vos avis Google, répondez avec l’IA, détectez les
                signaux faibles et pilotez la réputation de tous vos établissements
                depuis une seule plateforme.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <PrimaryCta />
                <SecondaryCta />
              </div>
              <p className="mt-6 text-sm font-medium text-slate-500">
                Essai gratuit · Sans carte bancaire · Support français
              </p>
            </div>

            <HeroDashboardMockup />
          </div>
        </section>

        <section className="premium-section-white border-y border-slate-200/80">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 sm:py-10 lg:grid-cols-4 lg:gap-5 lg:px-8">
            {proofKpis.map((kpi) => (
              <div key={kpi.label} className="premium-card rounded-2xl px-6 py-5">
                <p className="text-3xl font-semibold text-slate-950">{kpi.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-section-muted py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="editorial-section-title mx-auto max-w-4xl text-center text-slate-950">
              Pensé pour les restaurants, hôtels, commerces et réseaux locaux
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {trustPills.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="premium-card premium-card-hover flex items-center justify-center gap-2 rounded-2xl px-5 py-5 text-sm font-semibold text-slate-700">
                    <Icon size={17} className="text-indigo-600" />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="premium-section-white border-y border-slate-200/70 py-[4.5rem] sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
            <div>
              <SectionLabel>Référencement local</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Un socle clair pour mieux piloter votre e-réputation locale.
              </h2>
              <p className="editorial-copy mt-5 text-base">
                Reviewflow reste volontairement opérationnel : il ne remplace
                pas vos équipes, il leur donne une méthode pour répondre plus
                vite, comprendre les signaux clients et améliorer la présence
                locale des établissements français.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
              {seoContentBlocks.map((block) => (
                <article key={block.title} className="premium-card premium-card-hover rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-slate-950">{block.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{block.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-section-gradient py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Le problème</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Vos avis clients sont partout. Votre réputation ne devrait pas l’être.
              </h2>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:gap-8">
              <div className="premium-card rounded-[28px] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <X size={18} />
                  </span>
                  <h3 className="text-2xl font-semibold text-slate-950">Avant</h3>
                </div>
                <div className="mt-7 grid gap-3.5">
                  {beforeItems.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3.5 text-sm font-medium text-slate-700">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-indigo-200/80 bg-white p-6 shadow-[0_34px_100px_-58px_rgba(79,70,229,0.62)] sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <Check size={18} />
                  </span>
                  <h3 className="text-2xl font-semibold text-slate-950">Après Reviewflow</h3>
                </div>
                <div className="mt-7 grid gap-3.5">
                  {afterItems.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-indigo-100/80 bg-indigo-50/70 px-4 py-3.5 text-sm font-medium text-slate-800">
                      <CheckCircle2 size={16} className="shrink-0 text-indigo-600" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="premium-section-white py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl">
              <SectionLabel>Fonctionnalités premium</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Tout ce qu’il faut pour transformer les avis en avantage local.
              </h2>
              <p className="editorial-copy mt-5 max-w-3xl text-lg">
                Une plateforme pensée pour les équipes qui veulent répondre,
                comprendre, comparer et progresser sans multiplier les outils.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="premium-card premium-card-hover rounded-[24px] p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_-18px_rgba(15,23,42,0.9)]">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-slate-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{feature.description}</p>
                    <FeaturePreview preview={feature.preview} />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="premium-dark-panel py-20 text-white sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase text-cyan-200">
                Comment ça marche
              </p>
              <h2 className="editorial-section-title mt-4 text-white">
                Une routine simple pour reprendre le contrôle de votre réputation.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article key={step.title} className="rounded-[24px] border border-white/10 bg-white/[0.065] p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950">
                        <Icon size={20} />
                      </span>
                      <span className="text-sm font-semibold text-cyan-200">0{index + 1}</span>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{step.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="demo" className="premium-section-muted py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <SectionLabel>Démo produit</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Voyez Reviewflow en action
              </h2>
              <p className="editorial-copy mt-5 text-lg">
                Changez d’onglet pour voir comment les équipes peuvent suivre
                les avis, réponses IA, alertes, benchmarks et rapports.
              </p>
            </div>

            <div
              className="premium-surface mt-10 grid grid-cols-2 gap-2 rounded-[28px] p-2 sm:flex sm:rounded-full"
              role="tablist"
              aria-label="Aperçus produit Reviewflow"
            >
              {demoTabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    id={`demo-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`demo-panel-${tab.id}`}
                    className={cn(
                      "reviewflow-tab-button inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:shrink-0 sm:px-4",
                      active
                        ? "bg-slate-950 text-white shadow-[0_14px_30px_-20px_rgba(15,23,42,0.86)]"
                        : "text-slate-600"
                    )}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              id={`demo-panel-${activeTab.id}`}
              className="mt-8"
              role="tabpanel"
              aria-labelledby={`demo-tab-${activeTab.id}`}
            >
              <DemoPreview key={activeTab.id} tab={activeTab} />
            </div>
          </div>
        </section>

        <section className="premium-section-white py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionLabel>Cas d’usage</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Adapté aux réalités des établissements français.
              </h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-6">
              {useCases.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="premium-card premium-card-hover rounded-[24px] p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Icon size={21} />
                    </div>
                    <h3 className="mt-6 text-lg font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-4 text-xs font-semibold uppercase text-slate-400">Douleur</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.pain}</p>
                    <p className="mt-4 text-xs font-semibold uppercase text-indigo-600">Bénéfice</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.benefit}</p>
                    <UseCaseMiniPreview index={index} />
                    <p className="mt-5 rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-sm font-semibold text-slate-900">{item.result}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="premium-section-gradient py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Témoignages</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Des équipes plus rapides, plus cohérentes, mieux informées.
              </h2>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:gap-6">
              {testimonials.map((item) => (
                <article key={item.name} className="premium-card premium-card-hover rounded-[28px] p-7">
                  <Quote size={24} className="text-indigo-500" />
                  <p className="mt-5 text-base leading-7 text-slate-700">“{item.quote}”</p>
                  <div className="mt-6 flex items-end justify-between gap-4 border-t border-slate-100 pt-5">
                    <div>
                      <p className="font-semibold text-slate-950">{item.name}</p>
                      <p className="text-sm text-slate-500">{item.role}</p>
                      <p className="text-sm text-slate-500">{item.company}</p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                      {item.result}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="tarifs" className="premium-section-white py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Tarifs</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Des plans simples pour démarrer, puis grandir.
              </h2>
              <p className="editorial-copy mt-5 text-sm">
                Tarifs indicatifs — à connecter au système billing existant si présent.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-4 lg:gap-6">
              {pricingPlans.map((plan) => (
                <article
                  key={plan.name}
                  className={cn(
                    "premium-card premium-card-hover rounded-[28px] p-7",
                    plan.highlighted
                      ? "border-indigo-300 shadow-[0_32px_90px_-52px_rgba(79,70,229,0.72)]"
                      : ""
                  )}
                >
                  {plan.highlighted && (
                    <span className="mb-4 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      Le plus choisi
                    </span>
                  )}
                  <h3 className="text-2xl font-semibold text-slate-950">{plan.name}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{plan.target}</p>
                  <div className="mt-6 flex items-end gap-1">
                    <p className="text-4xl font-semibold text-slate-950">{plan.price}</p>
                    {plan.cadence && <p className="pb-1 text-sm text-slate-500">{plan.cadence}</p>}
                  </div>
                  <div className="mt-7 grid gap-3.5">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 size={16} className="shrink-0 text-indigo-600" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/login"
                    className={cn(
                      "mt-8 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      plan.highlighted
                        ? "premium-cta-primary bg-slate-950 text-white"
                        : "premium-cta-secondary border border-slate-300 text-slate-900"
                    )}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ressources" className="premium-section-muted py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <SectionLabel>SEO & ressources</SectionLabel>
                <h2 className="editorial-section-title mt-4 text-slate-950">
                  Guides pour développer votre réputation locale
                </h2>
              </div>
              <a
                href="#faq"
                className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Voir la FAQ
                <ArrowRight size={16} />
              </a>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {resources.map((title) => (
                <a
                  key={title}
                  href="#"
                  className="premium-card premium-card-hover group rounded-[24px] p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <BookOpenText size={21} className="text-indigo-600" />
                  <h3 className="mt-6 text-lg font-semibold leading-6 text-slate-950">{title}</h3>
                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 group-hover:text-indigo-700">
                    Lire le guide
                    <ArrowRight size={15} />
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="premium-section-white py-20 sm:py-28 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:px-8">
            <div>
              <SectionLabel>FAQ SEO</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Les questions clés avant de choisir un logiciel d’avis clients.
              </h2>
              <p className="editorial-copy mt-5 text-base">
                La structure est prête pour un enrichissement FAQPage et pour
                accueillir de futures pages guides ciblées SEO.
              </p>
            </div>
            <div className="space-y-4">
              {faqs.map((item) => (
                <details key={item.question} className="premium-card group rounded-2xl p-6">
                  <summary className="cursor-pointer list-none rounded-xl text-base font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <span className="inline-flex w-full items-center justify-between gap-3">
                      {item.question}
                      <ChevronDown size={18} className="shrink-0 transition-transform duration-200 ease-out group-open:rotate-180" />
                    </span>
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-section-gradient py-20 sm:py-24 lg:py-28">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-8">
            <div className="max-w-3xl">
              <SectionLabel>Prêt à démarrer</SectionLabel>
              <h2 className="editorial-section-title mt-4 text-slate-950">
                Transformez vos avis clients en système de croissance locale.
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <PrimaryCta />
              <SecondaryCta />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_2fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <EgiaLogo variant="icon" size="sm" />
              <EgiaLogo variant="dark" size="sm" showSuite />
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-400">
              Reviewflow by EGIA aide les établissements français à centraliser
              les avis, répondre avec l’IA et piloter leur réputation locale.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map(([title, ...links]) => (
              <div key={title}>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <div className="mt-4 grid gap-3">
                  {links.map((link) => (
                    <a
                      key={link}
                      href={link === "Connexion" ? "/login" : "#"}
                      className="rounded text-sm text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>© 2026 EGIA. Tous droits réservés.</p>
            <p>Plateforme SaaS française pour réputation locale.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const LoginExperience = ({
  authEmail,
  authPassword,
  authError,
  authMessage,
  envMissing,
  passwordSignInLoading,
  googleSignInLoading = false,
  passwordResetLoading = false,
  onEmailChange,
  onPasswordChange,
  onMagicLink,
  onPasswordSignIn,
  onGoogleSignIn,
  onForgotPassword,
  onSignup
}: LoginExperienceProps) => {
  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPasswordSignIn();
  };

  return (
    <div className="premium-grid-background min-h-screen min-w-0 overflow-x-hidden text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)] lg:gap-12 lg:px-8 lg:py-10 xl:gap-14">
        <section className="flex min-w-0 items-center justify-center">
          <Card className="premium-surface w-full max-w-[32rem] rounded-[30px]">
            <CardHeader className="p-6 pb-4 sm:p-8 sm:pb-5">
              <Link
                to="/"
                className="mb-8 flex w-fit items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Retour accueil Reviewflow"
              >
                <EgiaLogo variant="icon" size="sm" />
                <EgiaLogo variant="light" size="sm" showSuite />
              </Link>

              <CardTitle className="text-4xl font-semibold leading-tight text-slate-950 sm:text-[2.7rem]">
                Bon retour
              </CardTitle>
              <p className="mt-3 text-base leading-7 text-slate-500">
                Connectez-vous à votre espace Reviewflow
              </p>
            </CardHeader>

            <CardContent className="space-y-6 p-6 pt-3 sm:p-8 sm:pt-4">
              {envMissing && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
                  Variables d'env Supabase manquantes. Ajoutez
                  VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.
                </div>
              )}
              {authError && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
                  {authError}
                </div>
              )}
              {authMessage && (
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">
                  {authMessage}
                </div>
              )}

              <button
                type="button"
                className="premium-button-motion inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white/88 px-4 text-sm font-semibold text-slate-900 shadow-sm hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onGoogleSignIn}
                disabled={envMissing || googleSignInLoading || !onGoogleSignIn}
                title={!onGoogleSignIn ? "Connexion Google non configurée." : undefined}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-bold text-[#4285f4] shadow-sm ring-1 ring-slate-200">
                  G
                </span>
                {googleSignInLoading ? "Redirection Google..." : "Continuer avec Google"}
              </button>

              <div className="flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                ou avec email
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-5" onSubmit={handlePasswordSubmit}>
                <div className="space-y-2.5">
                  <label htmlFor="auth-email" className="text-sm font-semibold text-slate-700">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={authEmail}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="vous@entreprise.com"
                    autoComplete="email"
                    className="premium-login-input"
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="auth-password" className="text-sm font-semibold text-slate-700">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      className="premium-link-motion rounded-full text-sm font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
                      onClick={onForgotPassword}
                      disabled={envMissing || passwordResetLoading || !onForgotPassword}
                      title={!onForgotPassword ? "Réinitialisation non configurée." : undefined}
                    >
                      {passwordResetLoading ? "Envoi..." : "Mot de passe oublié ?"}
                    </button>
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    value={authPassword}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    placeholder="Votre mot de passe"
                    autoComplete="current-password"
                    className="premium-login-input"
                  />
                </div>

                <Button
                  type="submit"
                  className="premium-button-motion h-12 w-full rounded-2xl"
                  disabled={envMissing || passwordSignInLoading}
                >
                  {passwordSignInLoading ? "Connexion..." : "Se connecter"}
                </Button>

                <button
                  type="button"
                  className="premium-link-motion w-full rounded-full text-center text-sm font-semibold text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
                  onClick={onMagicLink}
                  disabled={envMissing}
                >
                  Recevoir plutôt un lien magique
                </button>
              </form>

              <div className="text-center text-sm text-slate-500">
                Pas encore de compte ?{" "}
                <button
                  type="button"
                  className="premium-link-motion rounded-full font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
                  onClick={onSignup ?? onMagicLink}
                  disabled={envMissing}
                >
                  Essai gratuit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                {loginSecurityItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex min-w-0 items-start gap-2 rounded-xl bg-white px-3.5 py-3 text-[11px] font-semibold leading-4 text-slate-600 shadow-sm ring-1 ring-slate-200/80 sm:text-xs">
                      <Icon size={14} className="shrink-0 text-indigo-600" />
                      <span className="min-w-0">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                {loginCompactProofs.map((item) => (
                  <div key={item.label} className="premium-card rounded-2xl p-5">
                    <p className="text-2xl font-semibold text-slate-950">{item.value}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="hidden min-w-0 items-center justify-center lg:flex">
          <div className="premium-dark-panel relative w-full overflow-hidden rounded-[38px] p-7 text-white xl:p-8">
	            <div className="reviewflow-login-panel-glow" />
	            <div className="relative grid gap-5">
	              <div className="reviewflow-login-card reviewflow-login-topbar flex items-center justify-between p-5">
	                <div>
	                  <p className="text-sm font-semibold text-white">Reviewflow Live</p>
	                  <p className="mt-1 text-xs text-slate-400">Cockpit multi-établissements</p>
	                </div>
	                <span className="reviewflow-login-status-pill">
                  <span className="reviewflow-live-dot" />
                  Sécurisé
                </span>
              </div>

              <div className="reviewflow-login-flow reviewflow-login-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Flux IA en direct</p>
                    <p className="mt-1 text-xs text-slate-400">Notification, analyse, réponse et impact synchronisés</p>
                  </div>
                  <span className="reviewflow-login-status-pill">
                    <span className="reviewflow-live-dot" />
	                  actif
	                </span>
	              </div>
	                <div className="mt-5 grid gap-2">
	                  {loginLiveNotifications.map((item, index) => (
	                    <div
	                      key={item.label}
	                      className={cn(
	                        "reviewflow-login-notification flex items-center justify-between gap-3",
	                        item.tone === "cyan" && "reviewflow-login-notification-cyan",
	                        item.tone === "violet" && "reviewflow-login-notification-violet",
	                        item.tone === "indigo" && "reviewflow-login-notification-indigo"
	                      )}
	                      style={{ "--login-delay": `${index * 380}ms` } as CSSProperties}
	                    >
	                      <span className="min-w-0">
	                        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{item.label}</span>
	                        <span className="mt-0.5 block truncate text-xs font-semibold text-white">{item.value}</span>
	                      </span>
	                      <span className="reviewflow-login-pulse-dot" />
	                    </div>
	                  ))}
	                </div>
	                <div className="reviewflow-login-pipeline mt-4 grid grid-cols-5 gap-2">
	                  <span className="reviewflow-login-pipeline-line" />
	                  {loginFlowEvents.map(({ icon: EventIcon, label, value, detail }, index) => (
	                    <div
	                      key={label}
	                      className="reviewflow-login-event reviewflow-login-step"
	                      style={{ animationDelay: `${index * 620}ms` }}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-200/10">
                        <EventIcon size={14} />
                      </span>
                      <p className="mt-2 text-[10px] font-semibold leading-4 text-white xl:text-[11px]">{label}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-cyan-100 xl:text-[11px]">{value}</p>
	                      <p className="mt-0.5 hidden truncate text-[10px] text-slate-500 xl:block">{detail}</p>
	                    </div>
	                  ))}
	                </div>
	              </div>

              <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
                <div className="grid grid-cols-4 gap-3 xl:grid-cols-2 xl:gap-4">
                  {loginDashboardMetrics.map(({ value, label, icon: MetricIcon }, index) => {
                    return (
                      <div
                        key={label}
                        className="reviewflow-login-metric-card"
                        style={{ animationDelay: `${index * 120}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-2xl font-semibold xl:text-3xl">{value}</p>
                          <MetricIcon size={18} className="text-cyan-200" />
                        </div>
                        <p className="mt-2 text-xs text-slate-400 xl:text-sm">{label}</p>
                      </div>
                    );
                  })}
                </div>

	                <div className="reviewflow-login-card reviewflow-login-analysis-card grid gap-4 p-5">
	                  <div className="reviewflow-login-review-card">
	                    <div className="flex items-center justify-between gap-3">
	                      <div className="flex items-center gap-2">
	                        <MessageSquareText size={16} className="text-indigo-600" />
                        <p className="text-sm font-semibold">Nouvel avis client</p>
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        3 étoiles
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
	                      “Très bon accueil, mais l’attente était trop longue samedi soir.”
	                    </p>
	                  </div>

	                  <div className="reviewflow-login-ai-scan flex items-center justify-between gap-3 rounded-[18px] px-4 py-3">
	                    <div className="flex min-w-0 items-center gap-3">
	                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-200/10">
	                        <Radar size={16} />
	                      </span>
	                      <div className="min-w-0">
	                        <p className="truncate text-xs font-semibold text-white">IA analyse l’intention client</p>
	                        <p className="mt-0.5 truncate text-[11px] text-slate-400">satisfaction positive + friction opérationnelle</p>
	                      </div>
	                    </div>
	                    <span className="reviewflow-login-status-pill shrink-0">92%</span>
	                  </div>

	                  <div className="grid grid-cols-3 gap-2">
	                    {loginAnalysisSignals.map((signal) => (
	                      <div key={signal.label} className="reviewflow-login-analysis-pill">
	                        <p className="truncate text-[10px] font-medium text-slate-400">{signal.label}</p>
                        <p
                          className={cn(
                            "mt-1 truncate text-xs font-semibold",
                            signal.tone === "good" && "text-cyan-100",
                            signal.tone === "watch" && "text-violet-100",
                            signal.tone === "neutral" && "text-indigo-100"
                          )}
                        >
                          {signal.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="reviewflow-login-ai-card">
                    <div className="flex items-center gap-2 text-cyan-100">
                      <Sparkles size={17} />
                      <p className="text-sm font-semibold">Réponse IA générée</p>
                    </div>
	                    <p className="mt-3 text-sm leading-6 text-slate-200">
	                      Merci pour votre retour. Nous sommes ravis que l’accueil ait été apprécié.
	                      Votre remarque sur l’attente est transmise à l’équipe pour renforcer
	                      l’organisation des services du week-end.
	                    </p>
	                    <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-cyan-100">
	                      <span className="reviewflow-login-response-cursor" />
	                      Ton empathique · Marque respectée · Validation prête
	                    </div>
	                  </div>
	                </div>
	              </div>

	              <div className="reviewflow-login-card reviewflow-login-graph-card p-5">
	                <div className="flex items-center justify-between">
	                  <div>
	                    <p className="text-sm font-semibold">Graphique réputation</p>
	                    <p className="mt-1 text-xs text-slate-400">Évolution après traitement IA</p>
	                  </div>
	                  <span className="reviewflow-login-status-pill">+18%</span>
	                </div>
	                <div className="reviewflow-login-graph mt-5 flex h-24 items-end gap-2">
	                  <span className="reviewflow-login-graph-cursor" />
	                  {loginImpactBars.map((height, index) => (
	                    <span
	                      key={index}
	                      className="reviewflow-login-bar flex-1 rounded-t-xl bg-gradient-to-t from-indigo-500 via-violet-400 to-cyan-300"
                      style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }}
                    />
                  ))}
                </div>
              </div>

              <p className="px-2 text-center text-base font-semibold leading-7 text-white xl:text-lg xl:leading-8">
                Chaque connexion vous rapproche d’une réputation mieux pilotée.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export {
  LoginExperience,
  MarketingLandingPage
};
