import {
  BarChart3,
  BellRing,
  FileText,
  Layers3,
  MessageSquareText,
  Radar,
  ScanQrCode,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FeaturePreviewKind = "inbox" | "ai" | "alert" | "chart";

type LandingFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
  preview: FeaturePreviewKind;
};

const features: LandingFeature[] = [
  {
    icon: MessageSquareText,
    title: "Centralisation des avis",
    description: "Regroupez les avis Google de tous vos établissements dans une inbox claire.",
    preview: "inbox"
  },
  {
    icon: Sparkles,
    title: "Réponses IA personnalisées",
    description: "Générez des brouillons alignés avec votre ton, vos règles et vos équipes.",
    preview: "ai"
  },
  {
    icon: BellRing,
    title: "Alertes intelligentes",
    description: "Repérez les avis sensibles, les baisses de note et les risques opérationnels.",
    preview: "alert"
  },
  {
    icon: BarChart3,
    title: "Analyse de sentiment",
    description: "Comprenez les thèmes qui tirent votre expérience client vers le haut ou le bas.",
    preview: "chart"
  },
  {
    icon: Radar,
    title: "Benchmark concurrentiel",
    description: "Comparez votre réputation locale avec les acteurs autour de chaque adresse.",
    preview: "chart"
  },
  {
    icon: FileText,
    title: "Rapports PDF / direction",
    description: "Préparez des synthèses lisibles pour dirigeants, managers et franchisés.",
    preview: "inbox"
  },
  {
    icon: Layers3,
    title: "Multi-établissements",
    description: "Pilotez des lieux, régions, marques ou franchises depuis une vue unifiée.",
    preview: "chart"
  },
  {
    icon: ScanQrCode,
    title: "QR codes & campagnes avis",
    description: "Déclenchez plus d’avis qualifiés et reliez satisfaction, fidélité et terrain.",
    preview: "ai"
  }
];

const pricingPlans = [
  {
    name: "Starter",
    target: "Indépendants et petites équipes",
    price: "49€",
    cadence: "/ mois",
    features: ["1 établissement", "Inbox avis Google", "Réponses IA", "Alertes simples"],
    cta: "Démarrer"
  },
  {
    name: "Pro",
    target: "Équipes locales en croissance",
    price: "129€",
    cadence: "/ mois",
    features: ["Jusqu’à 5 établissements", "Ton de marque", "Analyse de sentiment", "Rapports mensuels"],
    cta: "Essai gratuit",
    highlighted: true
  },
  {
    name: "Business",
    target: "Réseaux et groupes régionaux",
    price: "Sur devis",
    cadence: "",
    features: ["Multi-établissements", "Benchmark concurrentiel", "Rôles équipe", "Exports direction"],
    cta: "Voir la démo"
  },
  {
    name: "Enterprise",
    target: "Franchises et grandes organisations",
    price: "Sur mesure",
    cadence: "",
    features: ["Accompagnement dédié", "Sécurité avancée", "SLA support", "Parcours RGPD"],
    cta: "Contacter l’équipe"
  }
];

const faqs = [
  {
    question: "Qu’est-ce qu’un logiciel de gestion d’avis clients ?",
    answer:
      "C’est une plateforme qui centralise les avis Google et autres retours clients, aide les équipes à répondre, analyse les thèmes récurrents et mesure l’évolution de la réputation locale."
  },
  {
    question: "Reviewflow répond-il automatiquement aux avis Google ?",
    answer:
      "Reviewflow prépare des réponses automatiques avis Google sous forme de brouillons IA. La publication peut rester validée par vos équipes afin de préserver le contrôle qualité et le ton de marque."
  },
  {
    question: "Peut-on gérer plusieurs établissements ?",
    answer:
      "Oui. La landing et le produit sont pensés pour les réseaux, franchises, groupes hôteliers, restaurants et services locaux multi-sites."
  },
  {
    question: "L’IA respecte-t-elle le ton de ma marque ?",
    answer:
      "Le ton de marque peut être configuré afin d’obtenir des réponses cohérentes, professionnelles et adaptées à votre secteur."
  },
  {
    question: "Les données sont-elles sécurisées ?",
    answer:
      "L’accès se fait depuis un espace sécurisé, avec une logique d’organisation et des parcours compatibles avec les exigences B2B françaises."
  },
  {
    question: "Est-ce adapté aux restaurants et commerces français ?",
    answer:
      "Oui. Les cas d’usage, messages et indicateurs sont conçus pour la réputation en ligne restaurant, les hôtels, les commerces, les salons et les services locaux en France."
  },
  {
    question: "Puis-je tester sans carte bancaire ?",
    answer:
      "Oui, l’expérience marketing prévoit un essai gratuit sans carte bancaire. Le branchement commercial exact peut ensuite suivre votre système billing."
  }
];

const landingSeo = {
  title: "Logiciel avis Google & réputation locale | Reviewflow",
  description:
    "Reviewflow centralise la gestion des avis clients, les réponses IA aux avis Google et la réputation locale des restaurants, commerces et réseaux multi-établissements.",
  imagePath: "/icons/egia-icon-512.png"
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer
    }
  }))
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Reviewflow by EGIA",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Reputation management software",
  operatingSystem: "Web",
  areaServed: "FR",
  description:
    "Logiciel SaaS IA pour centraliser les avis Google, gérer les avis clients, générer des réponses, détecter les signaux faibles et piloter la réputation locale multi-établissements.",
  featureList: features.map((feature) => feature.title),
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: "49",
    offerCount: pricingPlans.length
  },
  publisher: {
    "@type": "Organization",
    name: "EGIA"
  }
};

const landingStructuredData = [softwareSchema, faqSchema];

export {
  faqs,
  features,
  landingSeo,
  landingStructuredData,
  pricingPlans
};
export type { FeaturePreviewKind, LandingFeature };
