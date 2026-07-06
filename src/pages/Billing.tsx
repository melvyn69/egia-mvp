import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type BillingProps = {
  isAdmin: boolean;
};

type PricingPlan = {
  name: string;
  price: string;
  suffix: string;
  audience: string;
  badges?: string[];
  features: string[];
  cta: string;
  current?: boolean;
  dark?: boolean;
};

type UsageItem = {
  label: string;
  current: number;
  limit: number;
  projection: string;
  attention?: boolean;
};

const usageItems: UsageItem[] = [
  {
    label: "Réponses IA mensuelles",
    current: 450,
    limit: 500,
    projection: "Projection : 540 réponses d’ici fin de mois",
    attention: true
  },
  {
    label: "Établissements",
    current: 2,
    limit: 3,
    projection: "Encore 1 fiche disponible sur Growth"
  },
  {
    label: "Membres d’équipe",
    current: 3,
    limit: 10,
    projection: "Capacité équipe confortable"
  },
  {
    label: "Automatisations actives",
    current: 1,
    limit: 5,
    projection: "4 workflows avancés encore disponibles"
  },
  {
    label: "Rapports PDF",
    current: 0,
    limit: 10,
    projection: "10 rapports inclus ce mois-ci"
  }
];

const businessValue = [
  { label: "Avis traités", value: "452", detail: "signaux consolidés" },
  { label: "Réputation améliorée", value: "+18%", detail: "pilotage plus régulier" },
  { label: "Automatisations exécutées", value: "24", detail: "actions gagnées" }
] as const;

const plans: PricingPlan[] = [
  {
    name: "Starter",
    price: "29€",
    suffix: "HT/mois",
    audience: "Pour les indépendants",
    features: [
      "1 établissement connecté",
      "150 réponses IA / mois",
      "Inbox avis Google",
      "Réponses IA",
      "Alertes de base",
      "Support email"
    ],
    cta: "Choisir Starter"
  },
  {
    name: "Growth",
    price: "79€",
    suffix: "HT/mois",
    audience: "Pour les gérants exigeants",
    badges: ["Populaire", "Plan actuel"],
    features: [
      "Jusqu’à 3 établissements",
      "500 réponses IA / mois",
      "Automatisations",
      "Veille concurrentielle",
      "Rapports PDF",
      "Équipe & classement"
    ],
    cta: "Actif",
    current: true
  },
  {
    name: "Enterprise",
    price: "Sur devis",
    suffix: "",
    audience: "Pour réseaux & franchises",
    features: [
      "Établissements illimités",
      "IA illimitée",
      "Dashboard multi-sites",
      "API & webhooks",
      "Onboarding personnalisé",
      "Facturation centralisée"
    ],
    cta: "Contacter",
    dark: true
  }
];

const scrollToPricing = () => {
  document.getElementById("billing-pricing")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
};

const AccessReserved = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <Card className="w-full border-slate-200 bg-white">
        <CardContent className="space-y-5 pt-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Lock size={22} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Accès réservé
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              La facturation est disponible uniquement pour les comptes admin.
            </p>
          </div>
          <Button onClick={() => navigate("/")}>Retour Dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
};

const Billing = ({ isAdmin }: BillingProps) => {
  if (!isAdmin) {
    return <AccessReserved />;
  }

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-6 sm:rounded-3xl sm:p-6 lg:pb-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-950 sm:text-3xl">
          Abonnement & Facturation
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Gérez votre offre et vos factures en toute transparence.
        </p>
      </div>

      <Card className="border-l-4 border-l-emerald-500 bg-white">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">
                Plan actuel : Growth
              </h2>
              <Badge variant="success">Actif</Badge>
            </div>
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                Prochain renouvellement : N/A
              </div>
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-500" />
                Paiement sécurisé via Stripe
              </div>
            </div>
          </div>
          <Button
            disabled
            title="Bientôt disponible"
            className="w-full lg:w-auto"
          >
            Gérer abonnement
            <span className="text-xs text-white/70">Bientôt disponible</span>
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Usage & Limites</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Visualisez votre trajectoire avant d’atteindre les plafonds.
              </p>
            </div>
            <Badge variant="warning">Attention volume IA</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div className="space-y-4 sm:space-y-5">
              {usageItems.map((item) => {
                const percent = Math.min(100, (item.current / item.limit) * 100);
                const isHighUsage = percent >= 85;

                return (
                  <div key={item.label} className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:border-0 sm:bg-transparent sm:p-0">
                    <div className="flex items-start justify-between gap-3 text-sm sm:items-center">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">
                          {item.label}
                        </span>
                        {item.attention && (
                          <Badge variant="warning">Presque plein</Badge>
                        )}
                      </div>
                      <span className="text-slate-500">
                        {item.current} / {item.limit}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isHighUsage ? "bg-amber-500" : "bg-slate-950"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className={isHighUsage ? "text-xs text-amber-700" : "text-xs text-slate-500"}>
                      {item.projection}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 sm:p-5">
              <h3 className="text-base font-semibold text-slate-950 sm:text-lg">
                Besoin de plus de puissance ?
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Passez au plan supérieur pour débloquer plus de volume et des
                fonctionnalités avancées.
              </p>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Zap size={15} className="text-violet-700" />
                  Débloquez les workflows avancés
                </div>
                <div className="flex items-center gap-2">
                  <BuildingIcon />
                  Passez au pilotage multi-sites
                </div>
              </div>
              <Button className="mt-5 min-h-11 w-full bg-violet-700 hover:bg-violet-800 sm:w-auto" onClick={scrollToPricing}>
                Voir les offres
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300 sm:h-12 sm:w-12">
                <TrendingUp size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-300">ROI EGIA</p>
                <h2 className="mt-2 text-xl font-semibold leading-tight sm:text-2xl">
                  EGIA vous a déjà économisé environ 11h ce mois-ci.
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  Estimation basée sur les réponses IA préparées, les avis
                  centralisés et les actions automatisées.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
            <CardTitle>Valeur business générée</CardTitle>
            <p className="text-sm text-slate-500">
              Une lecture simple de ce que votre abonnement transforme déjà.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-3 sm:grid-cols-3">
              {businessValue.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
                >
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-gradient-to-br from-white via-violet-50 to-slate-100">
        <CardContent className="grid gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700">
              <Sparkles size={14} />
              Upgrade recommandé
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950 sm:text-2xl">
              Débloquez les workflows avancés et passez au pilotage multi-sites.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Votre volume IA approche de la limite Growth. Le prochain niveau
              sécurise plus de capacité, de contrôle et de pilotage réseau.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button className="min-h-11 bg-violet-700 hover:bg-violet-800 sm:min-h-0" onClick={scrollToPricing}>
              Comparer les offres
            </Button>
            <Button variant="outline" className="min-h-11 sm:min-h-0" disabled title="Bientôt disponible">
              Contacter l’équipe
            </Button>
          </div>
        </CardContent>
      </Card>

      <section id="billing-pricing" className="scroll-mt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-950">Offres EGIA</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choisissez le niveau adapté à votre volume d’avis et à votre équipe.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.dark
                  ? "border-slate-900 bg-slate-950 text-white"
                  : plan.current
                    ? "border-slate-950 bg-white shadow-lg"
                    : "bg-white"
              }
            >
              <CardContent className="flex h-full flex-col p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      className={`text-xl font-semibold ${
                        plan.dark ? "text-white" : "text-slate-950"
                      }`}
                    >
                      {plan.name}
                    </h3>
                    <p
                      className={`mt-1 text-sm ${
                        plan.dark ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {plan.audience}
                    </p>
                  </div>
                  {plan.badges && (
                    <div className="flex flex-col gap-2">
                      {plan.badges.map((badge) => (
                        <Badge
                          key={badge}
                          variant={badge === "Populaire" ? "warning" : "success"}
                        >
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 sm:mt-6">
                  <span
                    className={`text-3xl font-semibold ${
                      plan.dark ? "text-white" : "text-slate-950"
                    }`}
                  >
                    {plan.price}
                  </span>
                  {plan.suffix && (
                    <span
                      className={`ml-2 text-sm ${
                        plan.dark ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {plan.suffix}
                    </span>
                  )}
                </div>

                <ul
                  className={`mt-4 space-y-2 text-sm sm:mt-6 sm:space-y-3 ${
                    plan.dark ? "text-slate-200" : "text-slate-600"
                  }`}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check
                        size={16}
                        className={
                          plan.dark
                            ? "mt-0.5 shrink-0 text-emerald-300"
                            : "mt-0.5 shrink-0 text-emerald-600"
                        }
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  className={`mt-5 min-h-11 w-full sm:mt-6 sm:min-h-0 ${
                    plan.dark ? "bg-white text-slate-950 hover:bg-slate-100" : ""
                  }`}
                  variant={plan.current ? "secondary" : "default"}
                  disabled={plan.current}
                  title={plan.current ? "Plan actif" : "Bientôt disponible"}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="bg-white">
        <CardHeader className="flex-row items-center justify-between gap-3 p-4 pb-2 sm:p-6 sm:pb-3">
          <div>
            <CardTitle>Historique factures</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Les factures apparaîtront ici dès que le portail sera connecté.
            </p>
          </div>
          <FileText size={20} className="text-slate-400" />
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-center text-sm text-slate-500 sm:hidden">
            Aucune facture disponible.
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase text-slate-400">
                  <th className="border-b border-slate-100 pb-3">Date</th>
                  <th className="border-b border-slate-100 pb-3">N° facture</th>
                  <th className="border-b border-slate-100 pb-3">Montant TTC</th>
                  <th className="border-b border-slate-100 pb-3">Statut</th>
                  <th className="border-b border-slate-100 pb-3">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Aucune facture disponible.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 p-2 shadow-[0_-16px_36px_-24px_rgba(15,23,42,0.6)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              90% du quota IA utilisé
            </p>
            <p className="truncate text-xs text-slate-500">
              Anticipez avant la limite mensuelle.
            </p>
          </div>
          <Button size="sm" className="bg-violet-700 hover:bg-violet-800" onClick={scrollToPricing}>
            Upgrade
          </Button>
        </div>
      </div>
    </div>
  );
};

const BuildingIcon = () => <BarChart3 size={15} className="text-violet-700" />;

export { Billing };
