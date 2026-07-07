import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  MessageSquareReply,
  PlayCircle,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  Users,
  Video,
  WalletCards,
  Zap,
  type LucideIcon
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { cn } from "../lib/utils";

type HelpIcon =
  | "dashboard"
  | "reviews"
  | "reply"
  | "inbox"
  | "automation"
  | "collect"
  | "qr"
  | "reports"
  | "loyalty"
  | "wallet"
  | "settings"
  | "members"
  | "team"
  | "billing"
  | "subscription"
  | "notifications"
  | "security"
  | "privacy"
  | "ai"
  | "search"
  | "support";

type HelpLink = {
  label: string;
  to: string;
};

type HelpGuide = {
  id: string;
  categoryId: string;
  icon: HelpIcon;
  title: string;
  description: string;
  objective: string;
  duration: string;
  level: "Débutant" | "Intermédiaire" | "Avancé";
  steps: string[];
  bestPractices: string[];
  commonMistakes: string[];
  usefulLinks: HelpLink[];
  cta: HelpLink;
  keywords: string[];
};

type HelpCategory = {
  id: string;
  icon: HelpIcon;
  title: string;
  description: string;
  guideIds: string[];
};

type AcademyVideo = {
  title: string;
  description: string;
  duration: string;
  level: HelpGuide["level"];
  guideId: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type SupportCard = {
  icon: HelpIcon;
  title: string;
  description: string;
  cta: string;
  detail: string;
  status: string;
};

const iconMap: Record<HelpIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  reviews: Star,
  reply: MessageSquareReply,
  inbox: Inbox,
  automation: Zap,
  collect: BadgeCheck,
  qr: QrCode,
  reports: FileText,
  loyalty: WalletCards,
  wallet: WalletCards,
  settings: Settings,
  members: UserPlus,
  team: Users,
  billing: CreditCard,
  subscription: BadgeCheck,
  notifications: Bell,
  security: ShieldCheck,
  privacy: LockKeyhole,
  ai: Bot,
  search: Search,
  support: HelpCircle
};

const helpCopy = {
  hero: {
    eyebrow: "ACADEMY EGIA",
    title: "Maîtrisez EGIA en autonomie",
    description:
      "Guides, parcours, vidéos et diagnostics pour apprendre à piloter votre réputation, vos avis, vos réponses IA, vos alertes et vos programmes de fidélité.",
    primaryCta: "Continuer mon parcours",
    secondaryCta: "Explorer les guides",
    progressLabel: "Progression Academy",
    progressValue: "36%",
    progressDetail:
      "Votre compte est configuré pour démarrer. Les modules avancés vous aideront à structurer une routine durable.",
    progressModules: ["Google", "Avis", "IA", "Rapports"],
    metrics: [
      { id: "guides", label: "Guides" },
      { id: "paths", label: "Étapes" },
      { id: "faq", label: "FAQ" }
    ]
  },
  search: {
    label: "Recherche intelligente",
    placeholder: "Rechercher un guide, une fonctionnalité ou un problème",
    emptyTitle: "Aucun guide trouvé",
    emptyDescription:
      "Essayez un mot plus simple comme avis, Google, IA, fidélité, facture ou sécurité.",
    resultSingular: "guide disponible",
    resultPlural: "guides disponibles",
    clear: "Effacer",
    suggestions: [
      "Répondre à un avis",
      "Configurer l'IA",
      "Créer un QR Code",
      "Générer un rapport",
      "Inviter un membre"
    ]
  },
  sections: {
    starter: {
      eyebrow: "PARCOURS RECOMMANDÉ",
      title: "Démarrer sans friction",
      description:
        "Suivez ces étapes dans l'ordre pour rendre votre espace EGIA opérationnel avant de former l'équipe."
    },
    categories: {
      eyebrow: "DOCUMENTATION",
      title: "Explorer par fonctionnalité",
      description:
        "Chaque module est expliqué avec son objectif, les étapes concrètes, les bonnes pratiques et les erreurs à éviter."
    },
    videos: {
      eyebrow: "ACADEMY VIDÉO",
      title: "Vidéos prêtes à brancher",
      description:
        "Les emplacements sont prévus pour les futures vidéos YouTube. Les guides restent accessibles sans contenu externe."
    },
    support: {
      eyebrow: "ACCOMPAGNEMENT",
      title: "Besoin d'un regard humain ?",
      description:
        "Les formulaires seront connectés plus tard. L'interface prépare déjà les bons parcours : rendez-vous, diagnostic et support."
    },
    faq: {
      eyebrow: "QUESTIONS FRÉQUENTES",
      title: "Réponses rapides",
      description:
        "La FAQ complète les guides. Elle sert aux clarifications courtes, pas à remplacer la formation."
    }
  },
  filters: {
    all: "Tous",
    guides: "guides"
  },
  guideLabels: {
    objective: "Objectif",
    usefulLinks: "Liens utiles",
    steps: "Étapes",
    bestPractices: "Bonnes pratiques",
    commonMistakes: "Erreurs fréquentes"
  },
  supportCards: [
    {
      icon: "team",
      title: "Demander un rendez-vous",
      description:
        "Pour structurer votre configuration, former une équipe ou améliorer vos routines opérationnelles.",
      cta: "Préparer une demande",
      detail: "15 à 30 minutes",
      status: "Interface prête"
    },
    {
      icon: "search",
      title: "Diagnostic guidé",
      description:
        "Pour comprendre pourquoi un avis, une synchronisation, une alerte ou une réponse IA ne fonctionne pas comme prévu.",
      cta: "Lancer le diagnostic",
      detail: "Résolution autonome",
      status: "Interface prête"
    },
    {
      icon: "support",
      title: "Contacter le support",
      description:
        "À utiliser uniquement si une action technique reste bloquée après les vérifications recommandées.",
      cta: "Ouvrir le formulaire",
      detail: "Connexion future",
      status: "À connecter"
    }
  ] satisfies SupportCard[]
};

const categories: HelpCategory[] = [
  {
    id: "start",
    icon: "dashboard",
    title: "Premiers pas",
    description:
      "Configurez votre compte, connectez vos établissements et comprenez les bases de la plateforme.",
    guideIds: ["dashboard", "settings", "notifications"]
  },
  {
    id: "reputation",
    icon: "reviews",
    title: "Réputation & avis",
    description:
      "Centralisez, priorisez et traitez vos avis clients avec une méthode claire.",
    guideIds: ["reviews", "inbox", "ai-replies"]
  },
  {
    id: "growth",
    icon: "qr",
    title: "Croissance locale",
    description:
      "Collectez plus d'avis, activez la fidélité, utilisez les QR Codes et simplifiez le retour client.",
    guideIds: ["review-collection", "qr-code", "loyalty", "wallet"]
  },
  {
    id: "operations",
    icon: "reports",
    title: "Pilotage & reporting",
    description:
      "Suivez vos performances, comprenez vos tendances et partagez des rapports utiles.",
    guideIds: ["reports", "team", "automation"]
  },
  {
    id: "admin",
    icon: "security",
    title: "Administration",
    description:
      "Gérez les membres, l'abonnement, la facturation, la sécurité et la confidentialité.",
    guideIds: ["members", "billing", "subscription", "security", "privacy"]
  },
  {
    id: "ai",
    icon: "ai",
    title: "IA & automatisation",
    description:
      "Utilisez l'IA EGIA pour analyser, rédiger et accélérer vos actions sans perdre le contrôle humain.",
    guideIds: ["ai", "ai-replies", "automation"]
  }
];

const guides: HelpGuide[] = [
  {
    id: "dashboard",
    categoryId: "start",
    icon: "dashboard",
    title: "Dashboard",
    description:
      "Le Dashboard est la page d'accueil opérationnelle d'EGIA. Il résume l'état de votre réputation, les avis récents, les alertes importantes et les prochaines actions à traiter.",
    objective: "Savoir chaque jour ce qui mérite votre attention.",
    duration: "5 min",
    level: "Débutant",
    steps: [
      "Ouvrez le Dashboard depuis la navigation principale.",
      "Consultez les indicateurs clés : volume d'avis, note moyenne, avis en attente et alertes.",
      "Vérifiez les notifications visibles.",
      "Identifiez les signaux prioritaires.",
      "Cliquez vers la page concernée : Boîte de réception, Alertes, Analytics ou Paramètres.",
      "Traitez les actions les plus urgentes avant d'analyser les tendances longues."
    ],
    bestPractices: [
      "Consultez le Dashboard au début de chaque journée.",
      "Commencez par les alertes et les avis sensibles.",
      "Ne vous limitez pas à la note moyenne : regardez aussi le volume, la récence et les tendances.",
      "Utilisez le Dashboard comme point d'entrée, pas comme outil d'analyse détaillée."
    ],
    commonMistakes: [
      "Ignorer une baisse récente parce que la note globale reste élevée.",
      "Lire les indicateurs sans traiter les actions associées.",
      "Oublier de vérifier si les données Google sont bien synchronisées."
    ],
    usefulLinks: [
      { label: "Dashboard", to: "/" },
      { label: "Alertes", to: "/alerts" },
      { label: "Analytics", to: "/analytics" },
      { label: "Boîte de réception", to: "/inbox" }
    ],
    cta: { label: "Ouvrir le Dashboard", to: "/" },
    keywords: ["dashboard", "accueil", "kpi", "indicateurs", "priorités"]
  },
  {
    id: "reviews",
    categoryId: "reputation",
    icon: "reviews",
    title: "Avis",
    description:
      "EGIA centralise les avis clients pour vous aider à les lire, les comprendre, les classer et les traiter avec méthode.",
    objective: "Ne laisser aucun avis important sans réponse ou sans suivi.",
    duration: "8 min",
    level: "Débutant",
    steps: [
      "Ouvrez la Boîte de réception.",
      "Filtrez les avis par statut : nouveau, à traiter, répondu, ignoré.",
      "Consultez la note, le texte, l'auteur, la date et l'établissement.",
      "Lisez le résumé IA si disponible.",
      "Repérez les tags et le sentiment détecté.",
      "Décidez de l'action : répondre, suivre, archiver ou escalader en interne."
    ],
    bestPractices: [
      "Traitez les avis négatifs rapidement.",
      "Répondez aussi aux avis positifs significatifs.",
      "Priorisez les avis selon leur impact, pas seulement selon leur date.",
      "Utilisez les tags pour identifier les sujets récurrents : accueil, délai, qualité, prix, service."
    ],
    commonMistakes: [
      "Répondre sans lire tout le commentaire.",
      "Archiver un avis sensible trop vite.",
      "Répondre de manière défensive.",
      "Traiter tous les avis avec le même ton."
    ],
    usefulLinks: [
      { label: "Boîte de réception", to: "/inbox" },
      { label: "Analytics", to: "/analytics" },
      { label: "Alertes", to: "/alerts" }
    ],
    cta: { label: "Voir les avis", to: "/inbox" },
    keywords: ["avis", "google", "note", "sentiment", "client"]
  },
  {
    id: "ai-replies",
    categoryId: "reputation",
    icon: "reply",
    title: "Réponses IA",
    description:
      "EGIA génère des brouillons de réponses adaptés au contenu de l'avis, au sentiment détecté et à votre voix de marque.",
    objective:
      "Répondre plus vite tout en gardant une réponse humaine, fiable et cohérente.",
    duration: "10 min",
    level: "Débutant",
    steps: [
      "Ouvrez un avis dans la Boîte de réception.",
      "Vérifiez la note, le commentaire et le sentiment.",
      "Générez une proposition de réponse IA.",
      "Relisez le brouillon.",
      "Ajustez le ton, la longueur ou certains détails.",
      "Vérifiez qu'aucune information sensible n'est mentionnée.",
      "Publiez uniquement lorsque la réponse est validée."
    ],
    bestPractices: [
      "Configurez la voix de marque avant d'utiliser l'IA régulièrement.",
      "Relisez systématiquement les réponses négatives ou sensibles.",
      "Ajoutez un détail spécifique quand le commentaire le permet.",
      "Reconnaissez le problème lorsqu'il est légitime."
    ],
    commonMistakes: [
      "Publier une réponse IA sans relecture.",
      "Répondre de façon trop générique.",
      "Promettre une action qui ne sera pas tenue.",
      "Mentionner un détail privé ou interne."
    ],
    usefulLinks: [
      { label: "Boîte de réception", to: "/inbox" },
      { label: "Voix de marque", to: "/settings/brand-voice" },
      { label: "Laboratoire IA", to: "/settings/test-lab" }
    ],
    cta: { label: "Configurer les réponses IA", to: "/settings/brand-voice" },
    keywords: ["réponse", "ia", "brouillon", "voix", "ton"]
  },
  {
    id: "inbox",
    categoryId: "reputation",
    icon: "inbox",
    title: "Boîte de réception",
    description:
      "La Boîte de réception est l'espace de travail principal pour traiter les avis clients selon leur statut, leur priorité et leur besoin d'action.",
    objective: "Structurer le traitement quotidien des avis.",
    duration: "7 min",
    level: "Débutant",
    steps: [
      "Ouvrez la Boîte de réception.",
      "Choisissez un statut : nouveau, à traiter, répondu, ignoré ou tout.",
      "Repérez les avis prioritaires.",
      "Ouvrez l'avis à traiter.",
      "Générez ou rédigez une réponse.",
      "Relisez la réponse.",
      "Publiez ou marquez l'avis comme traité.",
      "Archivez uniquement les avis qui ne demandent plus d'action."
    ],
    bestPractices: [
      "Traitez d'abord les avis urgents ou négatifs.",
      "Gardez une boîte propre avec des statuts à jour.",
      "Utilisez la Boîte de réception comme une file de travail.",
      "Évitez que plusieurs personnes répondent au même avis sans coordination."
    ],
    commonMistakes: [
      "Laisser tous les avis en statut nouveau.",
      "Ne pas mettre à jour le statut après traitement.",
      "Répondre deux fois au même avis.",
      "Archiver un avis avant d'avoir vérifié son contexte."
    ],
    usefulLinks: [
      { label: "Boîte de réception", to: "/inbox" },
      { label: "Alertes", to: "/alerts" },
      { label: "Voix de marque", to: "/settings/brand-voice" }
    ],
    cta: { label: "Traiter ma boîte de réception", to: "/inbox" },
    keywords: ["boîte", "inbox", "statut", "traiter", "avis"]
  },
  {
    id: "automation",
    categoryId: "operations",
    icon: "automation",
    title: "Automatisations",
    description:
      "Les automatisations déclenchent des actions selon des conditions précises : avis négatif, absence de réponse, note basse ou sentiment sensible.",
    objective:
      "Éviter les oublis et standardiser les réflexes opérationnels.",
    duration: "12 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez la page Automatisations si elle est disponible sur votre compte.",
      "Créez un nouveau scénario.",
      "Choisissez le déclencheur, par exemple Nouvel avis reçu.",
      "Ajoutez une ou plusieurs conditions : note, délai sans réponse, sentiment.",
      "Définissez l'action : créer une alerte ou préparer un suivi.",
      "Choisissez la portée : tous les établissements ou certains lieux.",
      "Vérifiez le résumé du scénario.",
      "Activez l'automatisation.",
      "Surveillez les premières alertes générées."
    ],
    bestPractices: [
      "Commencez avec une règle simple.",
      "Utilisez des conditions strictes pour éviter trop d'alertes.",
      "Gardez une validation humaine sur les cas sensibles.",
      "Testez sur un périmètre réduit avant de généraliser."
    ],
    commonMistakes: [
      "Créer trop de règles dès le départ.",
      "Utiliser des seuils trop larges.",
      "Déclencher trop de notifications.",
      "Automatiser une action sensible sans supervision."
    ],
    usefulLinks: [
      { label: "Automatisations", to: "/automation" },
      { label: "Builder", to: "/automation/builder" },
      { label: "Alertes", to: "/alerts" }
    ],
    cta: { label: "Créer une automatisation", to: "/automation/builder" },
    keywords: ["automatisation", "workflow", "règle", "alerte", "condition"]
  },
  {
    id: "review-collection",
    categoryId: "growth",
    icon: "collect",
    title: "Collecte d'avis",
    description:
      "La collecte d'avis consiste à mettre en place une routine simple pour inviter les clients à partager leur expérience après une interaction réelle.",
    objective: "Augmenter le volume d'avis authentiques et réguliers.",
    duration: "8 min",
    level: "Débutant",
    steps: [
      "Identifiez les meilleurs moments pour demander un avis : fin de prestation, passage en caisse, livraison réussie ou rendez-vous terminé.",
      "Préparez un message court.",
      "Utilisez un lien ou un QR Code.",
      "Expliquez à l'équipe quand et comment demander un avis.",
      "Suivez l'évolution du volume d'avis dans Analytics.",
      "Ajustez la routine si le volume reste faible."
    ],
    bestPractices: [
      "Demandez un avis de manière naturelle.",
      "Demandez à tous les clients satisfaits, pas uniquement à ceux susceptibles de laisser 5 étoiles.",
      "Ne conditionnez jamais une récompense à la note donnée.",
      "Facilitez l'accès au lien d'avis."
    ],
    commonMistakes: [
      "Demander uniquement des avis positifs.",
      "Offrir une récompense contre une note.",
      "Utiliser un message trop insistant.",
      "Ne pas former l'équipe."
    ],
    usefulLinks: [
      { label: "Analytics", to: "/analytics" },
      { label: "Fidélité", to: "/loyalty" },
      { label: "Établissements", to: "/settings?tab=locations" }
    ],
    cta: { label: "Structurer la collecte d'avis", to: "/analytics" },
    keywords: ["collecte", "avis", "demande", "routine", "google"]
  },
  {
    id: "qr-code",
    categoryId: "growth",
    icon: "qr",
    title: "QR Code",
    description:
      "Le QR Code donne aux clients un accès rapide à une action : laisser un avis, rejoindre un programme fidélité ou ouvrir une page client.",
    objective:
      "Réduire la friction entre l'expérience client et l'action souhaitée.",
    duration: "6 min",
    level: "Débutant",
    steps: [
      "Choisissez l'objectif du QR Code.",
      "Associez-le au bon établissement.",
      "Générez ou récupérez le lien correspondant.",
      "Testez le QR Code sur mobile.",
      "Placez-le sur un support visible.",
      "Ajoutez une phrase claire pour expliquer l'action."
    ],
    bestPractices: [
      "Utilisez un QR Code par établissement.",
      "Testez toujours avant impression.",
      "Placez le QR Code à un endroit logique : comptoir, table, ticket, email ou SMS.",
      "Ajoutez un texte simple : Scannez pour partager votre expérience."
    ],
    commonMistakes: [
      "Utiliser un QR Code qui pointe vers le mauvais établissement.",
      "Ne pas tester le lien.",
      "Mettre le QR Code sans contexte.",
      "Associer une récompense à une note."
    ],
    usefulLinks: [
      { label: "Fidélité", to: "/loyalty" },
      { label: "Scanner", to: "/loyalty/scanner" },
      { label: "Établissements", to: "/settings?tab=locations" }
    ],
    cta: { label: "Préparer un QR Code", to: "/loyalty" },
    keywords: ["qr", "code", "scanner", "lien", "mobile"]
  },
  {
    id: "reports",
    categoryId: "operations",
    icon: "reports",
    title: "Rapports",
    description:
      "Les rapports synthétisent les performances de réputation sur une période donnée : avis, note, sentiment, réponses, alertes et tendances.",
    objective:
      "Partager une lecture claire et actionnable avec la direction ou les équipes.",
    duration: "10 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez Rapports.",
      "Choisissez la période.",
      "Sélectionnez un établissement ou l'ensemble du compte.",
      "Générez le rapport.",
      "Lisez les indicateurs principaux.",
      "Identifiez les actions à suivre.",
      "Partagez le rapport aux personnes concernées."
    ],
    bestPractices: [
      "Générez les rapports à fréquence régulière.",
      "Comparez des périodes comparables.",
      "Utilisez le rapport comme support de réunion.",
      "Associez chaque constat important à une action."
    ],
    commonMistakes: [
      "Lire le rapport sans décider d'action.",
      "Comparer un mois complet avec un mois incomplet.",
      "Se concentrer uniquement sur la note.",
      "Envoyer un rapport sans contexte."
    ],
    usefulLinks: [
      { label: "Rapports", to: "/reports" },
      { label: "Analytics", to: "/analytics" },
      { label: "Équipe", to: "/team" }
    ],
    cta: { label: "Générer un rapport", to: "/reports" },
    keywords: ["rapport", "pdf", "mensuel", "reporting", "synthèse"]
  },
  {
    id: "loyalty",
    categoryId: "growth",
    icon: "loyalty",
    title: "Fidélité",
    description:
      "Le module Fidélité permet de créer un programme simple avec membres, visites, points et récompenses.",
    objective:
      "Encourager le retour client sans lier la récompense à une note d'avis.",
    duration: "12 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez Fidélité.",
      "Sélectionnez l'établissement.",
      "Activez le programme.",
      "Définissez le nom du programme.",
      "Choisissez les points par visite.",
      "Définissez le seuil de récompense.",
      "Configurez la récompense.",
      "Partagez le lien d'adhésion.",
      "Utilisez le scanner en établissement."
    ],
    bestPractices: [
      "Gardez une mécanique simple.",
      "Expliquez clairement ce que le client gagne.",
      "Formez l'équipe à utiliser le scanner.",
      "Suivez les membres proches du seuil.",
      "Ne reliez jamais la récompense à la note laissée."
    ],
    commonMistakes: [
      "Créer un programme trop complexe.",
      "Oublier d'activer le programme.",
      "Ne pas tester le lien client.",
      "Récompenser un avis positif au lieu d'une visite."
    ],
    usefulLinks: [
      { label: "Fidélité", to: "/loyalty" },
      { label: "Scanner fidélité", to: "/loyalty/scanner" }
    ],
    cta: { label: "Configurer la fidélité", to: "/loyalty" },
    keywords: ["fidélité", "points", "récompense", "visite", "client"]
  },
  {
    id: "wallet",
    categoryId: "growth",
    icon: "wallet",
    title: "Wallet",
    description:
      "Wallet permet au client de conserver une carte ou un accès fidélité directement sur son téléphone lorsque la configuration est disponible.",
    objective:
      "Simplifier l'identification client et rendre le programme fidélité plus pratique.",
    duration: "7 min",
    level: "Intermédiaire",
    steps: [
      "Vérifiez que la fidélité est activée.",
      "Vérifiez l'état Wallet dans le module Fidélité.",
      "Partagez le lien client.",
      "Demandez au client d'ajouter la carte à son téléphone.",
      "Utilisez le scanner ou le code membre lors d'une visite.",
      "Vérifiez que les points sont bien ajoutés."
    ],
    bestPractices: [
      "Activez d'abord un programme fidélité simple.",
      "Testez le parcours sur un téléphone.",
      "Proposez Wallet comme une option pratique.",
      "Gardez une alternative si le client ne souhaite pas l'utiliser."
    ],
    commonMistakes: [
      "Présenter Wallet avant d'avoir configuré la fidélité.",
      "Ne pas tester l'ajout sur mobile.",
      "Confondre Wallet et paiement.",
      "Ne pas expliquer l'intérêt au client."
    ],
    usefulLinks: [
      { label: "Fidélité", to: "/loyalty" },
      { label: "App mobile", to: "/settings?tab=mobile" }
    ],
    cta: { label: "Vérifier Wallet", to: "/loyalty" },
    keywords: ["wallet", "apple", "mobile", "carte", "fidélité"]
  },
  {
    id: "settings",
    categoryId: "start",
    icon: "settings",
    title: "Paramètres",
    description:
      "Les paramètres regroupent la configuration du compte : intégrations, établissements, équipe, profil, entreprise, application mobile et alertes.",
    objective:
      "Maintenir un compte propre, fiable et adapté à votre organisation.",
    duration: "10 min",
    level: "Débutant",
    steps: [
      "Ouvrez Paramètres.",
      "Vérifiez les intégrations.",
      "Contrôlez les établissements connectés.",
      "Configurez les informations entreprise.",
      "Vérifiez les membres et leurs rôles.",
      "Ajustez les alertes.",
      "Configurez l'app mobile si nécessaire."
    ],
    bestPractices: [
      "Revoyez les paramètres après chaque changement d'équipe.",
      "Gardez les établissements à jour.",
      "Limitez les accès admin.",
      "Vérifiez régulièrement la connexion Google."
    ],
    commonMistakes: [
      "Laisser d'anciens membres actifs.",
      "Ne pas configurer l'entreprise.",
      "Oublier les établissements inactifs.",
      "Utiliser un compte Google non maîtrisé."
    ],
    usefulLinks: [
      { label: "Paramètres", to: "/settings" },
      { label: "Connexion Google", to: "/connect" },
      { label: "Synchronisation", to: "/sync-status" }
    ],
    cta: { label: "Ouvrir les paramètres", to: "/settings" },
    keywords: ["paramètres", "configuration", "google", "établissement", "compte"]
  },
  {
    id: "members",
    categoryId: "admin",
    icon: "members",
    title: "Membres",
    description:
      "Les membres sont les utilisateurs invités dans votre espace EGIA. Chaque membre doit disposer d'un accès adapté à son rôle.",
    objective: "Donner les bons accès aux bonnes personnes.",
    duration: "6 min",
    level: "Débutant",
    steps: [
      "Ouvrez l'onglet Équipe dans les paramètres.",
      "Cliquez sur l'action d'invitation.",
      "Saisissez le prénom et l'email du membre.",
      "Choisissez le rôle.",
      "Indiquez s'il doit recevoir les rapports mensuels.",
      "Envoyez l'invitation.",
      "Vérifiez que le membre rejoint bien l'espace."
    ],
    bestPractices: [
      "Utilisez des comptes individuels.",
      "Limitez le rôle admin aux personnes responsables.",
      "Mettez à jour les accès dès qu'un membre change de poste.",
      "Expliquez à chaque membre son rôle dans EGIA."
    ],
    commonMistakes: [
      "Partager un même compte.",
      "Donner trop d'accès.",
      "Inviter une adresse personnelle par erreur.",
      "Laisser des invitations expirées sans suivi."
    ],
    usefulLinks: [
      { label: "Membres", to: "/settings?tab=team" },
      { label: "Équipe", to: "/team" }
    ],
    cta: { label: "Inviter un membre", to: "/settings?tab=team" },
    keywords: ["membre", "invitation", "accès", "rôle", "utilisateur"]
  },
  {
    id: "team",
    categoryId: "operations",
    icon: "team",
    title: "Équipe",
    description:
      "Le module Équipe permet de suivre les rôles, l'activité et la contribution des collaborateurs dans l'utilisation d'EGIA.",
    objective: "Transformer la gestion de réputation en routine collective.",
    duration: "8 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez Équipe.",
      "Consultez les membres actifs.",
      "Vérifiez les rôles.",
      "Analysez la contribution de l'équipe.",
      "Identifiez les membres à former.",
      "Ajustez les responsabilités si nécessaire.",
      "Utilisez les rapports pour animer une revue régulière."
    ],
    bestPractices: [
      "Définissez clairement qui répond aux avis.",
      "Organisez une revue courte chaque semaine.",
      "Formez les nouveaux membres avec Academy EGIA.",
      "Suivez la régularité, pas seulement le volume."
    ],
    commonMistakes: [
      "Ne pas attribuer de responsabilité.",
      "Inviter des membres sans les former.",
      "Confondre accès technique et rôle métier.",
      "Laisser les avis sans propriétaire opérationnel."
    ],
    usefulLinks: [
      { label: "Équipe", to: "/team" },
      { label: "Membres", to: "/settings?tab=team" },
      { label: "Rapports", to: "/reports" }
    ],
    cta: { label: "Voir l'équipe", to: "/team" },
    keywords: ["équipe", "manager", "rôle", "classement", "collaborateur"]
  },
  {
    id: "billing",
    categoryId: "admin",
    icon: "billing",
    title: "Facturation",
    description:
      "La facturation regroupe les informations liées aux paiements, factures et données administratives du compte EGIA.",
    objective: "Suivre clairement les documents et informations de paiement.",
    duration: "5 min",
    level: "Débutant",
    steps: [
      "Ouvrez Facturation.",
      "Consultez les informations de facturation.",
      "Vérifiez l'offre active.",
      "Téléchargez les factures si disponibles.",
      "Vérifiez les coordonnées légales dans les paramètres entreprise.",
      "Contactez la personne responsable en cas d'erreur."
    ],
    bestPractices: [
      "Gardez les informations entreprise à jour.",
      "Vérifiez les factures mensuellement.",
      "Limitez l'accès facturation aux personnes concernées.",
      "Centralisez les documents comptables."
    ],
    commonMistakes: [
      "Confondre utilisateur EGIA et contact facturation.",
      "Ne pas mettre à jour les informations légales.",
      "Donner accès à la facturation à trop de membres.",
      "Attendre la prochaine échéance pour signaler une erreur."
    ],
    usefulLinks: [
      { label: "Facturation", to: "/billing" },
      { label: "Entreprise", to: "/settings?tab=company" }
    ],
    cta: { label: "Voir la facturation", to: "/billing" },
    keywords: ["facturation", "facture", "paiement", "comptable", "billing"]
  },
  {
    id: "subscription",
    categoryId: "admin",
    icon: "subscription",
    title: "Abonnement",
    description:
      "L'abonnement détermine les fonctionnalités disponibles sur votre compte EGIA et les conditions d'utilisation associées.",
    objective: "Comprendre ce qui est inclus et quand ajuster votre offre.",
    duration: "5 min",
    level: "Débutant",
    steps: [
      "Ouvrez Facturation.",
      "Consultez l'offre active.",
      "Vérifiez les modules accessibles.",
      "Comparez les fonctionnalités disponibles avec vos besoins.",
      "Identifiez les modules non utilisés.",
      "Demandez une évolution si votre organisation grandit."
    ],
    bestPractices: [
      "Réévaluez l'abonnement lorsque vous ajoutez des établissements.",
      "Suivez l'adoption réelle des modules.",
      "Formez l'équipe avant de conclure qu'un module n'est pas utile.",
      "Vérifiez les besoins de reporting, équipe et automatisation."
    ],
    commonMistakes: [
      "Sous-utiliser des fonctionnalités incluses.",
      "Ajouter des utilisateurs sans parcours de formation.",
      "Penser qu'un changement d'offre remplace une bonne configuration.",
      "Ne pas surveiller l'adoption."
    ],
    usefulLinks: [
      { label: "Abonnement", to: "/billing" },
      { label: "Équipe", to: "/team" },
      { label: "Paramètres", to: "/settings" }
    ],
    cta: { label: "Consulter l'abonnement", to: "/billing" },
    keywords: ["abonnement", "offre", "plan", "module", "limite"]
  },
  {
    id: "notifications",
    categoryId: "start",
    icon: "notifications",
    title: "Notifications",
    description:
      "Les notifications signalent les événements importants : avis sensibles, alertes, synchronisations, actions à traiter ou rappels opérationnels.",
    objective: "Ne manquer aucun signal critique sans créer trop de bruit.",
    duration: "6 min",
    level: "Débutant",
    steps: [
      "Consultez l'icône de notification dans la barre supérieure.",
      "Ouvrez la notification.",
      "Identifiez le module concerné.",
      "Traitez l'action associée.",
      "Marquez l'alerte comme résolue si nécessaire.",
      "Ajustez les paramètres de notification si le volume est trop élevé."
    ],
    bestPractices: [
      "Priorisez les notifications critiques.",
      "Gardez les notifications utiles et actionnables.",
      "Vérifiez les notifications après une période d'absence.",
      "Ajustez les alertes après quelques semaines d'usage."
    ],
    commonMistakes: [
      "Activer trop de notifications.",
      "Ignorer les notifications récurrentes.",
      "Ne pas résoudre une alerte après traitement.",
      "Laisser plusieurs personnes traiter le même signal sans coordination."
    ],
    usefulLinks: [
      { label: "Alertes", to: "/alerts" },
      { label: "Réglages alertes", to: "/settings?tab=alerts" },
      { label: "Dashboard", to: "/" }
    ],
    cta: { label: "Configurer les notifications", to: "/settings?tab=alerts" },
    keywords: ["notification", "alerte", "signal", "rappel", "urgent"]
  },
  {
    id: "security",
    categoryId: "admin",
    icon: "security",
    title: "Sécurité",
    description:
      "La sécurité EGIA repose sur des accès individuels, des rôles maîtrisés, des intégrations contrôlées et une gestion régulière des membres.",
    objective: "Protéger votre compte, vos données et vos actions sensibles.",
    duration: "8 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez les paramètres d'équipe.",
      "Vérifiez les membres actifs.",
      "Retirez les accès inutiles.",
      "Limitez les rôles admin.",
      "Vérifiez la connexion Google.",
      "Contrôlez les intégrations.",
      "Répétez cet audit à chaque changement d'équipe."
    ],
    bestPractices: [
      "Un utilisateur doit avoir son propre compte.",
      "Ne partagez jamais un accès admin.",
      "Retirez immédiatement les anciens collaborateurs.",
      "Utilisez des emails professionnels.",
      "Donnez uniquement les accès nécessaires."
    ],
    commonMistakes: [
      "Partager un compte entre plusieurs personnes.",
      "Laisser un ancien collaborateur actif.",
      "Donner un rôle admin par défaut.",
      "Connecter Google avec un compte personnel."
    ],
    usefulLinks: [
      { label: "Équipe", to: "/settings?tab=team" },
      { label: "Intégrations", to: "/settings?tab=integrations" },
      { label: "Connexion Google", to: "/connect" }
    ],
    cta: { label: "Auditer les accès", to: "/settings?tab=team" },
    keywords: ["sécurité", "accès", "admin", "google", "rôle"]
  },
  {
    id: "privacy",
    categoryId: "admin",
    icon: "privacy",
    title: "Confidentialité",
    description:
      "EGIA traite des données liées aux avis clients, établissements, réponses, membres, paramètres et rapports.",
    objective: "Utiliser EGIA sans exposer d'informations sensibles.",
    duration: "7 min",
    level: "Débutant",
    steps: [
      "Identifiez les informations visibles dans les avis.",
      "Vérifiez les membres ayant accès aux données.",
      "Relisez les réponses avant publication.",
      "Évitez d'ajouter des informations privées dans une réponse publique.",
      "Limitez les accès aux personnes concernées.",
      "Corrigez les consignes IA si elles produisent des réponses trop détaillées."
    ],
    bestPractices: [
      "Ne mentionnez jamais une information privée dans une réponse publique.",
      "Ne copiez pas de notes internes dans une réponse.",
      "Relisez les brouillons IA.",
      "Limitez les accès aux personnes qui en ont besoin."
    ],
    commonMistakes: [
      "Publier une réponse avec un détail client privé.",
      "Copier-coller un commentaire interne.",
      "Donner accès à toute l'équipe sans distinction.",
      "Oublier que les réponses aux avis sont publiques."
    ],
    usefulLinks: [
      { label: "Boîte de réception", to: "/inbox" },
      { label: "Équipe", to: "/settings?tab=team" },
      { label: "Voix de marque", to: "/settings/brand-voice" }
    ],
    cta: { label: "Vérifier la confidentialité", to: "/settings?tab=team" },
    keywords: ["confidentialité", "données", "privé", "réponse", "client"]
  },
  {
    id: "ai",
    categoryId: "ai",
    icon: "ai",
    title: "IA",
    description:
      "L'IA EGIA analyse les avis, détecte les priorités, propose des tags, résume les signaux et génère des brouillons de réponse selon votre voix de marque.",
    objective:
      "Utiliser l'IA comme assistant opérationnel, sans remplacer le jugement humain.",
    duration: "12 min",
    level: "Intermédiaire",
    steps: [
      "Ouvrez la Voix de marque.",
      "Définissez le ton attendu.",
      "Ajoutez les règles de langage importantes.",
      "Testez plusieurs exemples dans le laboratoire.",
      "Utilisez l'IA sur des avis réels.",
      "Relisez les réponses générées.",
      "Ajustez les consignes au fil du temps.",
      "Encadrez les usages sensibles avec l'équipe."
    ],
    bestPractices: [
      "Donnez à l'IA des règles claires.",
      "Gardez une validation humaine.",
      "Testez avant de déployer à l'équipe.",
      "Soyez vigilant sur les avis négatifs.",
      "Mettez à jour la voix de marque quand votre positionnement évolue."
    ],
    commonMistakes: [
      "Croire que l'IA connaît tout le contexte.",
      "Publier sans relire.",
      "Utiliser des réponses trop longues.",
      "Ne jamais mettre à jour la voix de marque.",
      "Automatiser trop tôt."
    ],
    usefulLinks: [
      { label: "Voix de marque", to: "/settings/brand-voice" },
      { label: "Laboratoire IA", to: "/settings/test-lab" },
      { label: "Boîte de réception", to: "/inbox" },
      { label: "Automatisations", to: "/automation" }
    ],
    cta: { label: "Configurer l'IA", to: "/settings/brand-voice" },
    keywords: ["ia", "intelligence", "tags", "sentiment", "voix"]
  }
];

const starterSteps = [
  {
    title: "Connecter Google",
    description: "Autorisez EGIA à lire vos établissements et vos avis.",
    to: "/connect",
    status: "Prioritaire"
  },
  {
    title: "Vérifier les établissements",
    description: "Contrôlez les lieux actifs avant d'analyser vos données.",
    to: "/settings?tab=locations",
    status: "Recommandé"
  },
  {
    title: "Configurer la voix IA",
    description: "Définissez le ton attendu pour les réponses générées.",
    to: "/settings/brand-voice",
    status: "Recommandé"
  },
  {
    title: "Traiter les premiers avis",
    description: "Utilisez la Boîte de réception pour installer la routine.",
    to: "/inbox",
    status: "À faire"
  }
];

const academyVideos: AcademyVideo[] = [
  {
    title: "Premiers pas dans EGIA",
    description: "Comprendre le shell, le Dashboard, les modules et le parcours de configuration.",
    duration: "4 min",
    level: "Débutant",
    guideId: "dashboard"
  },
  {
    title: "Répondre efficacement aux avis",
    description: "Lire le contexte, utiliser l'IA et valider une réponse publique.",
    duration: "6 min",
    level: "Débutant",
    guideId: "ai-replies"
  },
  {
    title: "Piloter une routine hebdomadaire",
    description: "Utiliser Analytics, Alertes et Rapports pour aligner l'équipe.",
    duration: "7 min",
    level: "Intermédiaire",
    guideId: "reports"
  }
];

const faqs: FaqItem[] = [
  {
    question: "EGIA répond-il automatiquement aux avis ?",
    answer:
      "EGIA peut générer des brouillons et automatiser certains scénarios, mais la validation humaine reste recommandée. Les avis sensibles doivent toujours être relus avant publication."
  },
  {
    question: "Pourquoi mes avis Google ne remontent-ils pas ?",
    answer:
      "Vérifiez la connexion Google, la synchronisation et les établissements actifs. Si Google demande une reconnexion, relancez l'autorisation depuis la page Connexion."
  },
  {
    question: "Quelle est la différence entre Dashboard et Analytics ?",
    answer:
      "Le Dashboard montre les priorités du moment. Analytics permet d'analyser les tendances, comparer les périodes et comprendre les causes derrière les résultats."
  },
  {
    question: "Une réponse IA est-elle toujours correcte ?",
    answer:
      "Non. L'IA prépare un brouillon utile, mais elle ne connaît pas toujours le contexte complet. Vous devez relire, corriger et valider avant publication."
  },
  {
    question: "Puis-je offrir une récompense contre un avis 5 étoiles ?",
    answer:
      "Non. Une récompense ne doit jamais être conditionnée à une note ou à un avis positif. La fidélité doit récompenser une visite ou une participation neutre."
  },
  {
    question: "Quand contacter le support ?",
    answer:
      "Contactez le support si une connexion échoue malgré la reconnexion, si une donnée critique manque après synchronisation ou si une action technique reste bloquée."
  }
];

const guideById = new Map(guides.map((guide) => [guide.id, guide]));
const categoryById = new Map(categories.map((category) => [category.id, category]));

const normalizeSearchValue = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const levelVariant: Record<HelpGuide["level"], "success" | "warning" | "neutral"> = {
  Débutant: "success",
  Intermédiaire: "neutral",
  Avancé: "warning"
};

const Help = () => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0]?.id ?? "");

  const selectedGuide = guideById.get(selectedGuideId) ?? guides[0];
  const normalizedQuery = normalizeSearchValue(query.trim());
  const activeCategoryConfig = categoryById.get(activeCategory);
  const heroMetrics = helpCopy.hero.metrics.map((metric) => ({
    ...metric,
    value:
      metric.id === "guides"
        ? String(guides.length)
        : metric.id === "paths"
          ? String(starterSteps.length)
          : String(faqs.length)
  }));

  const visibleGuides = useMemo(() => {
    return guides.filter((guide) => {
      const matchesCategory =
        activeCategory === "all" ||
        activeCategoryConfig?.guideIds.includes(guide.id) ||
        guide.categoryId === activeCategory;
      const searchable = normalizeSearchValue(
        [
          guide.title,
          guide.description,
          guide.objective,
          ...guide.keywords
        ].join(" ")
      );
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeCategory, activeCategoryConfig, normalizedQuery]);
  const displayGuide =
    visibleGuides.find((guide) => guide.id === selectedGuide.id) ??
    visibleGuides[0] ??
    selectedGuide;
  const hasVisibleGuides = visibleGuides.length > 0;

  return (
    <div className="help-page min-w-0 space-y-5 overflow-x-hidden pb-4 md:space-y-7 lg:space-y-8">
      <style>
        {`
          @keyframes helpFadeUp {
            from { opacity: 0; transform: translate3d(0, 8px, 0); }
            to { opacity: 1; transform: translate3d(0, 0, 0); }
          }

          .help-motion {
            animation: helpFadeUp 360ms cubic-bezier(.22, 1, .36, 1) both;
          }

          @media (prefers-reduced-motion: reduce) {
            .help-motion {
              animation: none !important;
            }
          }
        `}
      </style>
      <section className="help-motion overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="grid min-w-0 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:p-7">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {helpCopy.hero.eyebrow}
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.02] tracking-normal text-slate-950 sm:text-4xl lg:text-5xl">
              {helpCopy.hero.title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              {helpCopy.hero.description}
            </p>
            <div className="mt-5 grid max-w-lg grid-cols-3 gap-2">
              {heroMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2"
                >
                  <p className="text-lg font-semibold leading-none text-slate-950">
                    {metric.value}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 motion-reduce:transform-none sm:w-auto"
                href="#guides"
              >
                <BookOpen className="h-4 w-4" />
                {helpCopy.hero.primaryCta}
              </a>
              <a
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 motion-reduce:transform-none sm:w-auto"
                href="#documentation"
              >
                {helpCopy.hero.secondaryCta}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {helpCopy.hero.progressLabel}
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {helpCopy.hero.progressValue}
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <Sparkles className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-ink"
                style={{ width: helpCopy.hero.progressValue }}
              />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {helpCopy.hero.progressDetail}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {helpCopy.hero.progressModules.map((item, index) => (
                <div
                  key={item}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-medium",
                    index < 2
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="help-search-title"
        className="help-motion rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:basis-1/4">
            <p
              id="help-search-title"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              {helpCopy.search.label}
            </p>
          </div>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{helpCopy.search.placeholder}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={helpCopy.search.placeholder}
              className="h-11 w-full min-w-0 rounded-full border border-slate-200 bg-slate-50/80 pl-10 pr-24 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                {helpCopy.search.clear}
              </button>
            )}
          </label>
        </div>
        <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
            {helpCopy.search.suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => setQuery(suggestion)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p className="shrink-0 text-xs font-medium text-slate-400">
            {visibleGuides.length}{" "}
            {visibleGuides.length > 1
              ? helpCopy.search.resultPlural
              : helpCopy.search.resultSingular}
          </p>
        </div>
      </section>

      <section className="help-motion grid min-w-0 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="min-w-0 shadow-sm">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {helpCopy.sections.starter.eyebrow}
            </p>
            <CardTitle>{helpCopy.sections.starter.title}</CardTitle>
            <CardDescription>{helpCopy.sections.starter.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {starterSteps.map((step, index) => (
              <Link
                key={step.title}
                to={step.to}
                className="group flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 motion-reduce:transform-none"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">{step.title}</span>
                    <Badge className="border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                      {step.status}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">
                    {step.description}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-700" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden shadow-sm">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {helpCopy.sections.videos.eyebrow}
            </p>
            <CardTitle>{helpCopy.sections.videos.title}</CardTitle>
            <CardDescription>{helpCopy.sections.videos.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {academyVideos.map((video) => (
              <button
                type="button"
                key={video.title}
                onClick={() => {
                  setActiveCategory("all");
                  setSelectedGuideId(video.guideId);
                  document.getElementById("guides")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="group min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 motion-reduce:transform-none"
              >
                <span className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-500">
                  <PlayCircle className="h-7 w-7 transition group-hover:text-slate-950" />
                </span>
                <span className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <Video className="h-3.5 w-3.5" />
                  {video.duration}
                </span>
                <span className="mt-1 block font-semibold leading-5 text-slate-950">
                  {video.title}
                </span>
                <span className="mt-1 line-clamp-3 block text-xs leading-5 text-slate-500">
                  {video.description}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      <section id="documentation" className="help-motion space-y-4">
        <SectionHeader
          eyebrow={helpCopy.sections.categories.eyebrow}
          title={helpCopy.sections.categories.title}
          description={helpCopy.sections.categories.description}
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              active={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            />
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          <CategoryPill
            active={activeCategory === "all"}
            label={helpCopy.filters.all}
            onClick={() => setActiveCategory("all")}
          />
          {categories.map((category) => (
            <CategoryPill
              key={category.id}
              active={activeCategory === category.id}
              label={category.title}
              onClick={() => setActiveCategory(category.id)}
            />
          ))}
        </div>

        <div id="guides" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <Card className="min-w-0 overflow-hidden shadow-sm">
            <CardContent className="space-y-2 p-3">
              {visibleGuides.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <HelpCircle className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 font-semibold text-slate-950">
                    {helpCopy.search.emptyTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {helpCopy.search.emptyDescription}
                  </p>
                </div>
              ) : (
                visibleGuides.map((guide) => (
                  <GuideListButton
                    key={guide.id}
                    guide={guide}
                    active={displayGuide.id === guide.id}
                    onClick={() => setSelectedGuideId(guide.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {hasVisibleGuides ? (
            <GuideDetail guide={displayGuide} />
          ) : (
            <GuideEmptyState />
          )}
        </div>
      </section>

      <section className="help-motion space-y-4">
        <SectionHeader
          eyebrow={helpCopy.sections.support.eyebrow}
          title={helpCopy.sections.support.title}
          description={helpCopy.sections.support.description}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {helpCopy.supportCards.map((card, index) => (
            <SupportActionCard
              key={card.title}
              card={card}
              emphasized={index === 0}
            />
          ))}
        </div>
      </section>

      <section className="help-motion space-y-4">
        <SectionHeader
          eyebrow={helpCopy.sections.faq.eyebrow}
          title={helpCopy.sections.faq.title}
          description={helpCopy.sections.faq.description}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition open:border-slate-300"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-xl text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
                <span>{faq.question}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-90 group-open:text-slate-700" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
      {eyebrow}
    </p>
    <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
      {title}
    </h2>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
      {description}
    </p>
  </div>
);

const CategoryCard = ({
  category,
  active,
  onClick
}: {
  category: HelpCategory;
  active: boolean;
  onClick: () => void;
}) => {
  const Icon = iconMap[category.icon];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group min-w-0 rounded-2xl border bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 motion-reduce:transform-none",
        active ? "border-slate-950" : "border-slate-200"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
            active
              ? "bg-slate-950 text-white"
              : "bg-slate-100 text-slate-700 group-hover:bg-slate-950 group-hover:text-white"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start justify-between gap-3">
            <span className="font-semibold text-slate-950">{category.title}</span>
            <Badge variant="neutral" className="shrink-0">
              {category.guideIds.length} {helpCopy.filters.guides}
            </Badge>
          </span>
          <span className="mt-1 block text-sm leading-6 text-slate-500">
            {category.description}
          </span>
        </span>
      </div>
    </button>
  );
};

const CategoryPill = ({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
      active
        ? "border-slate-950 bg-slate-950 text-white shadow-sm"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
    )}
  >
    {label}
  </button>
);

const SupportActionCard = ({
  card,
  emphasized
}: {
  card: SupportCard;
  emphasized: boolean;
}) => {
  const Icon = iconMap[card.icon];
  return (
    <Card className="min-w-0 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-card motion-reduce:transform-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              emphasized ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <Badge variant="neutral" className="shrink-0">
            {card.detail}
          </Badge>
        </div>
        <CardTitle className="text-base">{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          {card.status}
        </div>
        <Button
          type="button"
          variant={emphasized ? "default" : "outline"}
          className="w-full disabled:cursor-default disabled:opacity-100"
          disabled
          aria-disabled="true"
        >
          {card.cta}
        </Button>
      </CardContent>
    </Card>
  );
};

const GuideListButton = ({
  guide,
  active,
  onClick
}: {
  guide: HelpGuide;
  active: boolean;
  onClick: () => void;
}) => {
  const Icon = iconMap[guide.icon];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex w-full min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 motion-reduce:transform-none",
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-semibold", active ? "text-white" : "text-slate-950")}>
          {guide.title}
        </span>
        <span
          className={cn(
            "mt-1 line-clamp-2 block text-xs leading-5",
            active ? "text-slate-300" : "text-slate-500"
          )}
        >
          {guide.objective}
        </span>
      </span>
      <ChevronRight
        className={cn(
          "mt-1 h-4 w-4 shrink-0 transition",
          active ? "text-white" : "text-slate-300 group-hover:text-slate-700"
        )}
      />
    </button>
  );
};

const GuideEmptyState = () => (
  <article className="min-w-0 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      <Search className="h-5 w-5" />
    </span>
    <h2 className="mt-4 text-xl font-semibold tracking-normal text-slate-950">
      {helpCopy.search.emptyTitle}
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
      {helpCopy.search.emptyDescription}
    </p>
  </article>
);

const GuideDetail = ({ guide }: { guide: HelpGuide }) => {
  const Icon = iconMap[guide.icon];
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={levelVariant[guide.level]}>{guide.level}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                {guide.duration}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">
              {guide.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{guide.description}</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {helpCopy.guideLabels.objective}
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-800">
            {guide.objective}
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)]">
        <div className="min-w-0 space-y-5">
          <GuideSection title={helpCopy.guideLabels.steps} items={guide.steps} ordered />
          <GuideSection title={helpCopy.guideLabels.bestPractices} items={guide.bestPractices} />
          <GuideSection title={helpCopy.guideLabels.commonMistakes} items={guide.commonMistakes} muted />
        </div>
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {helpCopy.guideLabels.usefulLinks}
            </p>
            <div className="mt-3 space-y-2">
              {guide.usefulLinks.map((link) => (
                <Link
                  key={`${guide.id}-${link.to}-${link.label}`}
                  to={link.to}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-200 hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                >
                  <span className="min-w-0 truncate">{link.label}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
          <Link
            to={guide.cta.to}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 motion-reduce:transform-none"
          >
            {guide.cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </article>
  );
};

const GuideSection = ({
  title,
  items,
  ordered = false,
  muted = false
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  muted?: boolean;
}) => (
  <section className="min-w-0">
    <h3 className="text-base font-semibold text-slate-950">{title}</h3>
    {ordered ? (
      <ol className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={item} className="flex min-w-0 gap-3 rounded-xl bg-slate-50/80 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-700 shadow-sm">
              {index + 1}
            </span>
            <span className="min-w-0 text-sm leading-6 text-slate-600">{item}</span>
          </li>
        ))}
      </ol>
    ) : (
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "flex min-w-0 gap-3 rounded-xl border p-3 text-sm leading-6",
              muted
                ? "border-amber-100 bg-amber-50/70 text-amber-900"
                : "border-slate-100 bg-white text-slate-600"
            )}
          >
            <span
              className={cn(
                "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                muted ? "bg-amber-400" : "bg-emerald-500"
              )}
            />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export { Help };
