import {
  ArrowRight,
  Check,
  CreditCard,
  FileText,
  Lock,
  ShieldCheck
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

const usageItems = [
  { label: "Réponses IA mensuelles", current: 450, limit: 500 },
  { label: "Établissements", current: 2, limit: 3 },
  { label: "Membres d’équipe", current: 3, limit: 10 },
  { label: "Automatisations actives", current: 1, limit: 5 },
  { label: "Rapports PDF", current: 0, limit: 10 }
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
    <div className="space-y-6 rounded-3xl bg-slate-50/80 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
          Abonnement & Facturation
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Gérez votre offre et vos factures en toute transparence.
        </p>
      </div>

      <Card className="border-l-4 border-l-emerald-500 bg-white">
        <CardContent className="flex flex-col gap-5 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-950">
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
        <CardHeader>
          <CardTitle>Usage & Limites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              {usageItems.map((item) => {
                const percent = Math.min(100, (item.current / item.limit) * 100);

                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">
                        {item.label}
                      </span>
                      <span className="text-slate-500">
                        {item.current} / {item.limit}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-950 transition-all duration-700"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <h3 className="text-lg font-semibold text-slate-950">
                Besoin de plus de puissance ?
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Passez au plan supérieur pour débloquer plus de volume et des
                fonctionnalités avancées.
              </p>
              <Button className="mt-5 bg-violet-700 hover:bg-violet-800" onClick={scrollToPricing}>
                Voir les offres
                <ArrowRight size={16} />
              </Button>
            </div>
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
              <CardContent className="flex h-full flex-col pt-6">
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

                <div className="mt-6">
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
                  className={`mt-6 space-y-3 text-sm ${
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
                  className={`mt-6 w-full ${
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
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Historique factures</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Les factures apparaîtront ici dès que le portail sera connecté.
            </p>
          </div>
          <FileText size={20} className="text-slate-400" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
    </div>
  );
};

export { Billing };
