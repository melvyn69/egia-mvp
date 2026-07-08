import { type FormEvent, type ReactNode, useState } from "react";
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

const featureChartBars = [35, 62, 48, 78, 66, 90];

const featureInboxRows = ["Avis 5 étoiles", "Réponse à valider", "Avis urgent"];

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

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">
    {children}
  </p>
);

const PrimaryCta = ({ children = "Démarrer gratuitement" }: { children?: string }) => (
  <Link
    to="/login"
    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto"
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
      "inline-flex h-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto",
      dark
        ? "border-white/20 text-white hover:bg-white/10"
        : "border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-white"
    )}
  >
    {children}
  </a>
);

const HeroDashboardMockup = () => (
  <div className="relative mx-auto w-full max-w-[40rem]" aria-label="Aperçu du dashboard Reviewflow">
    <div className="absolute left-0 top-10 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl" />
    <div className="absolute -bottom-8 right-4 h-52 w-52 rounded-full bg-cyan-300/20 blur-3xl" />
    <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_30px_100px_-48px_rgba(30,41,59,0.65)] backdrop-blur-xl sm:p-4">
      <div className="rounded-[22px] border border-slate-200 bg-[#0e1020] p-4 text-white shadow-inner sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <EgiaLogo variant="icon" size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Cockpit réputation</p>
              <p className="text-xs text-slate-400">12 établissements suivis</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            Live
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {heroDashboardMetrics.map(({ value, label, icon: MetricIcon }) => {
            return (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold">{value}</p>
                  <MetricIcon size={17} className="text-cyan-200" />
                </div>
                <p className="mt-1 text-xs text-slate-400">{label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300/20 text-amber-200">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-50">Alerte avis négatif</p>
                <p className="mt-1 text-xs leading-5 text-amber-50/75">
                  Restaurant Saint-Paul · attente signalée 3 fois cette semaine.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
            <div className="flex items-center gap-2 text-cyan-100">
              <Sparkles size={16} />
              <p className="text-sm font-semibold">Réponse IA générée</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Merci pour votre retour. Nous avons transmis votre remarque à
              l’équipe locale afin d’améliorer votre prochaine visite.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Volume d’avis</p>
              <p className="text-xs text-slate-400">7 derniers jours</p>
            </div>
            <span className="rounded-full bg-indigo-400/15 px-2.5 py-1 text-xs font-semibold text-indigo-100">
              +18%
            </span>
          </div>
          <div className="mt-4 flex h-24 items-end gap-2">
            {heroVolumeBars.map((height, index) => (
              <span
                key={index}
                className="flex-1 rounded-t-xl bg-gradient-to-t from-indigo-500 to-cyan-300"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FeaturePreview = ({ preview }: { preview: "inbox" | "ai" | "alert" | "chart" }) => {
  if (preview === "chart") {
    return (
      <div className="mt-5 flex h-16 items-end gap-1.5 rounded-2xl bg-slate-50 p-3">
        {featureChartBars.map((height, index) => (
          <span
            key={index}
            className="flex-1 rounded-t-lg bg-gradient-to-t from-indigo-600 to-cyan-300"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    );
  }

  if (preview === "ai") {
    return (
      <div className="mt-5 rounded-2xl bg-indigo-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-700">
          <Sparkles size={14} />
          Brouillon IA
        </div>
        <div className="space-y-1.5">
          <span className="block h-2 rounded-full bg-indigo-200" />
          <span className="block h-2 w-4/5 rounded-full bg-indigo-100" />
          <span className="block h-2 w-2/3 rounded-full bg-indigo-100" />
        </div>
      </div>
    );
  }

  if (preview === "alert") {
    return (
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} />
          Signal à traiter aujourd’hui
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-3">
      {featureInboxRows.map((item) => (
        <div key={item} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
          <span className="font-medium text-slate-700">{item}</span>
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
        </div>
      ))}
    </div>
  );
};

const DemoPreview = ({ tab }: { tab: DemoTab }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-indigo-600">{tab.label}</p>
        <h3 className="mt-2 text-3xl font-semibold text-slate-950">{tab.title}</h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{tab.description}</p>
      </div>
      <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
        <p className="text-3xl font-semibold">{tab.stat}</p>
        <p className="mt-1 text-xs text-slate-400">{tab.statLabel}</p>
      </div>
    </div>

    <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
      <div className="space-y-3">
        {tab.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{row.label}</p>
              <p className="mt-1 text-xs text-slate-500">{row.value}</p>
            </div>
            <span
              className={cn(
                "h-3 w-3 shrink-0 rounded-full",
                row.tone === "good" && "bg-emerald-500",
                row.tone === "watch" && "bg-amber-500",
                row.tone === "neutral" && "bg-indigo-500"
              )}
            />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-[#111322] p-4 text-white">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Impact réputation</p>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-cyan-100">
            Live
          </span>
        </div>
        <div className="mt-5 flex h-32 items-end gap-2">
          {demoImpactBars.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-xl bg-gradient-to-t from-indigo-500 to-cyan-300"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const MarketingHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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

        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex" aria-label="Navigation principale">
          {navItems.map((item) =>
            item.href.startsWith("/") ? (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-full transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {item.label}
              </a>
            )
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <SecondaryCta>Voir la démo</SecondaryCta>
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Essai gratuit
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-landing-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-landing-menu" className="border-t border-slate-200 bg-white px-4 py-4 shadow-xl lg:hidden">
          <nav className="grid gap-1 text-sm font-semibold text-slate-700" aria-label="Navigation mobile">
            {navItems.map((item) =>
              item.href.startsWith("/") ? (
                <Link
                  key={item.href}
                  to={item.href}
                  className="rounded-2xl px-3 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl px-3 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              )
            )}
          </nav>
          <div className="mt-4 grid gap-2">
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
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#f7f8fb] text-slate-950">
      <MarketingHeader />

      <main>
        <section id="produit" className="relative overflow-hidden bg-[radial-gradient(circle_at_30%_0%,rgba(99,102,241,0.16),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f7f8fb_100%)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8 lg:py-24">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 shadow-sm">
                <Sparkles size={14} />
                Plateforme IA pour avis clients & réputation locale
              </div>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.94] text-slate-950 sm:text-6xl lg:text-7xl">
                Le copilote IA qui transforme vos avis clients en croissance
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                Centralisez vos avis Google, répondez avec l’IA, détectez les
                signaux faibles et pilotez la réputation de tous vos établissements
                depuis une seule plateforme.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrimaryCta />
                <SecondaryCta />
              </div>
              <p className="mt-5 text-sm font-medium text-slate-500">
                Essai gratuit · Sans carte bancaire · Support français
              </p>
            </div>

            <HeroDashboardMockup />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-3 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {proofKpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-3xl font-semibold text-slate-950">{kpi.value}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-2xl font-semibold text-slate-950 sm:text-3xl">
              Pensé pour les restaurants, hôtels, commerces et réseaux locaux
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {trustPills.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 shadow-sm">
                    <Icon size={17} className="text-indigo-600" />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8fb] py-14 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
            <div>
              <SectionLabel>Référencement local</SectionLabel>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
                Un socle clair pour mieux piloter votre e-réputation locale.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Reviewflow reste volontairement opérationnel : il ne remplace
                pas vos équipes, il leur donne une méthode pour répondre plus
                vite, comprendre les signaux clients et améliorer la présence
                locale des établissements français.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {seoContentBlocks.map((block) => (
                <article key={block.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-950">{block.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{block.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8fb] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Le problème</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Vos avis clients sont partout. Votre réputation ne devrait pas l’être.
              </h2>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                    <X size={18} />
                  </span>
                  <h3 className="text-2xl font-semibold text-slate-950">Avant</h3>
                </div>
                <div className="mt-6 grid gap-3">
                  {beforeItems.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_24px_80px_-50px_rgba(79,70,229,0.55)] sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <Check size={18} />
                  </span>
                  <h3 className="text-2xl font-semibold text-slate-950">Après Reviewflow</h3>
                </div>
                <div className="mt-6 grid gap-3">
                  {afterItems.map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-indigo-50/70 px-4 py-3 text-sm font-medium text-slate-800">
                      <CheckCircle2 size={16} className="shrink-0 text-indigo-600" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionLabel>Fonctionnalités premium</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Tout ce qu’il faut pour transformer les avis en avantage local.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Une plateforme pensée pour les équipes qui veulent répondre,
                comprendre, comparer et progresser sans multiplier les outils.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-card">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{feature.description}</p>
                    <FeaturePreview preview={feature.preview} />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#111322] py-16 text-white sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Comment ça marche
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
                Une routine simple pour reprendre le contrôle de votre réputation.
              </h2>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article key={step.title} className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5">
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

        <section id="demo" className="bg-[#f7f8fb] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Démo produit</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Voyez Reviewflow en action
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Changez d’onglet pour voir comment les équipes peuvent suivre
                les avis, réponses IA, alertes, benchmarks et rapports.
              </p>
            </div>

            <div
              className="mt-8 grid grid-cols-2 gap-2 rounded-[28px] border border-slate-200 bg-white p-1.5 shadow-sm sm:flex sm:rounded-full"
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
                      "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:shrink-0 sm:px-4",
                      active
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
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
              className="mt-6"
              role="tabpanel"
              aria-labelledby={`demo-tab-${activeTab.id}`}
            >
              <DemoPreview tab={activeTab} />
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionLabel>Cas d’usage</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Adapté aux réalités des établissements français.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {useCases.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <Icon size={22} className="text-indigo-600" />
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Douleur</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.pain}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Bénéfice</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.benefit}</p>
                    <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-900">{item.result}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8fb] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Témoignages</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Des équipes plus rapides, plus cohérentes, mieux informées.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {testimonials.map((item) => (
                <article key={item.name} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
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

        <section id="tarifs" className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionLabel>Tarifs</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Des plans simples pour démarrer, puis grandir.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                Tarifs indicatifs — à connecter au système billing existant si présent.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {pricingPlans.map((plan) => (
                <article
                  key={plan.name}
                  className={cn(
                    "rounded-[28px] border bg-white p-6 shadow-sm",
                    plan.highlighted
                      ? "border-indigo-300 shadow-[0_28px_90px_-54px_rgba(79,70,229,0.7)]"
                      : "border-slate-200"
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
                  <div className="mt-6 grid gap-3">
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
                      "mt-7 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      plan.highlighted
                        ? "bg-slate-950 text-white hover:bg-slate-800"
                        : "border border-slate-300 text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ressources" className="bg-[#f7f8fb] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <SectionLabel>SEO & ressources</SectionLabel>
                <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
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

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {resources.map((title) => (
                <a
                  key={title}
                  href="#"
                  className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <BookOpenText size={21} className="text-indigo-600" />
                  <h3 className="mt-5 text-lg font-semibold leading-6 text-slate-950">{title}</h3>
                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 group-hover:text-indigo-700">
                    Lire le guide
                    <ArrowRight size={15} />
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-white py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
            <div>
              <SectionLabel>FAQ SEO</SectionLabel>
              <h2 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
                Les questions clés avant de choisir un logiciel d’avis clients.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-600">
                La structure est prête pour un enrichissement FAQPage et pour
                accueillir de futures pages guides ciblées SEO.
              </p>
            </div>
            <div className="space-y-3">
              {faqs.map((item) => (
                <details key={item.question} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <summary className="cursor-pointer list-none rounded-xl text-base font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <span className="inline-flex w-full items-center justify-between gap-3">
                      {item.question}
                      <ChevronDown size={18} className="shrink-0 transition group-open:rotate-180" />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#111322] py-16 text-white sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Prêt à démarrer
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
                Transformez vos avis clients en système de croissance locale.
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PrimaryCta />
              <SecondaryCta dark />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_2fr] lg:px-8">
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
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerColumns.map(([title, ...links]) => (
              <div key={title}>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <div className="mt-4 grid gap-3">
                  {links.map((link) => (
                    <a
                      key={link}
                      href={link === "Connexion" ? "/login" : "#"}
                      className="rounded text-sm text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
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
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.16),transparent_30%),linear-gradient(135deg,#f8fafc_0%,#ffffff_42%,#eef2ff_100%)] text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-8 lg:px-8 lg:py-8">
        <section className="flex min-w-0 items-center justify-center">
          <Card className="w-full max-w-[31rem] border-slate-200/80 bg-white/92 shadow-[0_28px_90px_-54px_rgba(15,23,42,0.45)] backdrop-blur-xl">
            <CardHeader className="p-5 pb-3 sm:p-7 sm:pb-4">
              <Link
                to="/"
                className="mb-7 flex w-fit items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Retour accueil Reviewflow"
              >
                <EgiaLogo variant="icon" size="sm" />
                <EgiaLogo variant="light" size="sm" showSuite />
              </Link>

              <CardTitle className="text-4xl font-semibold tracking-normal text-slate-950">
                Bon retour
              </CardTitle>
              <p className="mt-2 text-base leading-7 text-slate-500">
                Connectez-vous à votre espace Reviewflow
              </p>
            </CardHeader>

            <CardContent className="space-y-5 p-5 pt-2 sm:p-7 sm:pt-3">
              {envMissing && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Variables d'env Supabase manquantes. Ajoutez
                  VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.
                </div>
              )}
              {authError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  {authError}
                </div>
              )}
              {authMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  {authMessage}
                </div>
              )}

              <button
                type="button"
                className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onGoogleSignIn}
                disabled={envMissing || googleSignInLoading || !onGoogleSignIn}
                title={!onGoogleSignIn ? "Connexion Google non configurée." : undefined}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-bold text-[#4285f4] shadow-sm ring-1 ring-slate-200">
                  G
                </span>
                {googleSignInLoading ? "Redirection Google..." : "Continuer avec Google"}
              </button>

              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                ou avec email
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="space-y-2">
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="auth-password" className="text-sm font-semibold text-slate-700">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      className="rounded-full text-sm font-semibold text-indigo-700 transition hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
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
                  className="h-12 w-full rounded-2xl"
                  disabled={envMissing || passwordSignInLoading}
                >
                  {passwordSignInLoading ? "Connexion..." : "Se connecter"}
                </Button>

                <button
                  type="button"
                  className="w-full rounded-full text-center text-sm font-semibold text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
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
                  className="rounded-full font-semibold text-indigo-700 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
                  onClick={onSignup ?? onMagicLink}
                  disabled={envMissing}
                >
                  Essai gratuit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3">
                {loginSecurityItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      <Icon size={14} className="shrink-0 text-indigo-600" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:hidden">
                {loginCompactProofs.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-2xl font-semibold text-slate-950">{item.value}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="hidden min-w-0 items-center justify-center lg:flex">
          <div className="relative w-full overflow-hidden rounded-[36px] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_32px_110px_-58px_rgba(15,23,42,0.8)]">
            <div className="absolute right-8 top-8 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute bottom-8 left-8 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />

            <div className="relative grid gap-5">
              <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <div>
                  <p className="text-sm font-semibold text-white">Reviewflow Live</p>
                  <p className="mt-1 text-xs text-slate-400">Cockpit multi-établissements</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Sécurisé
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {loginDashboardMetrics.map(({ value, label, icon: MetricIcon }) => {
                  return (
                    <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-3xl font-semibold">{value}</p>
                        <MetricIcon size={19} className="text-cyan-200" />
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                <div className="rounded-2xl bg-white p-4 text-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Avis client</p>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      3 étoiles
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    “Très bon accueil, mais l’attente était trop longue samedi soir.”
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <Sparkles size={17} />
                    <p className="text-sm font-semibold">Réponse IA générée</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    Merci pour votre retour. Nous sommes ravis que l’accueil ait été apprécié.
                    Votre remarque sur l’attente est transmise à l’équipe pour renforcer
                    l’organisation des services du week-end.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Impact cette semaine</p>
                  <span className="rounded-full bg-indigo-400/15 px-2.5 py-1 text-xs font-semibold text-indigo-100">
                    +18%
                  </span>
                </div>
                <div className="mt-5 flex h-24 items-end gap-2">
                  {loginImpactBars.map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t-xl bg-gradient-to-t from-indigo-500 to-cyan-300"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>

              <p className="px-2 text-center text-lg font-semibold leading-8 text-white">
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
