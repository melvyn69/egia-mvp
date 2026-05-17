import { useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
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
  userId: string | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
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
  current: number | null;
  limit: number;
  projection: string;
  source: BillingDataSource;
  attention?: boolean;
};

type BillingDataSource = "real" | "estimated" | "planned";

type BusinessValueItem = {
  label: string;
  value: string;
  detail: string;
  source: BillingDataSource;
};

type KpiSummaryCache = {
  counts?: {
    reviews_total?: number | null;
    reviews_replied?: number | null;
  };
  response?: {
    response_rate_pct?: number | null;
  };
  sentiment?: {
    sentiment_samples?: number | null;
  };
};

type AiKpiCache = {
  sentiment?: {
    samples?: number | null;
  };
};

type InboxReviewRow = {
  id?: string | null;
  has_draft?: boolean | null;
  hasDraft?: boolean | null;
  draft_status?: string | null;
  draftStatus?: string | null;
};

type InboxCache = {
  pages?: Array<{
    rows?: InboxReviewRow[];
  }>;
};

type BillingCacheData = {
  kpiSummary: KpiSummaryCache | null;
  aiStats: AiKpiCache | null;
  draftCount: number | null;
  reportsCount: number | null;
  teamMembersCount: number | null;
};

const sourceMeta: Record<
  BillingDataSource,
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  real: { label: "Réel", variant: "success" },
  estimated: { label: "Estimé", variant: "warning" },
  planned: { label: "Bientôt disponible", variant: "neutral" }
};

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
    badges: ["Populaire", "Démo active"],
    features: [
      "Jusqu’à 3 établissements",
      "500 réponses IA / mois",
      "Automatisations",
      "Veille concurrentielle",
      "Rapports PDF",
      "Équipe & classement"
    ],
    cta: "Démo active",
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

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("fr-FR").format(value);

const formatPercent = (value: number): string => `${Math.round(value)}%`;

const toFiniteNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getLastCachedData = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): T | null => {
  const entries = queryClient.getQueriesData<T>({ queryKey });
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const data = entries[index]?.[1];
    if (data !== undefined && data !== null) {
      return data;
    }
  }
  return null;
};

const getCachedArrayCount = <T,>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
): number | null => {
  const data = getLastCachedData<T[]>(queryClient, queryKey);
  return Array.isArray(data) ? data.length : null;
};

const getCachedInboxDraftCount = (
  queryClient: QueryClient,
  userId: string | null
): number | null => {
  if (!userId) {
    return null;
  }

  const entries = queryClient.getQueriesData<InboxCache>({
    queryKey: ["inbox", userId]
  });
  if (entries.length === 0) {
    return null;
  }

  const countedIds = new Set<string>();
  let anonymousDrafts = 0;
  entries.forEach(([, data]) => {
    data?.pages?.forEach((page) => {
      page.rows?.forEach((row) => {
        const hasDraft =
          row.hasDraft === true ||
          row.has_draft === true ||
          row.draftStatus === "draft" ||
          row.draft_status === "draft";
        if (!hasDraft) {
          return;
        }

        if (row.id) {
          countedIds.add(row.id);
          return;
        }

        anonymousDrafts += 1;
      });
    });
  });

  return countedIds.size + anonymousDrafts;
};

const readBillingCacheData = (
  queryClient: QueryClient,
  userId: string | null
): BillingCacheData => {
  if (!userId) {
    return {
      kpiSummary: null,
      aiStats: null,
      draftCount: null,
      reportsCount: null,
      teamMembersCount: null
    };
  }

  const coachKpiSummary = getLastCachedData<KpiSummaryCache>(queryClient, [
    "coach-health-kpi",
    userId
  ]);
  const dashboardKpiSummary = getLastCachedData<KpiSummaryCache>(queryClient, [
    "kpi-summary",
    userId
  ]);

  return {
    kpiSummary: coachKpiSummary ?? dashboardKpiSummary,
    aiStats: getLastCachedData<AiKpiCache>(queryClient, ["ai-kpis", userId]),
    draftCount: getCachedInboxDraftCount(queryClient, userId),
    reportsCount:
      getCachedArrayCount<unknown>(queryClient, [
        "generated-reports",
        userId
      ]) ?? getCachedArrayCount<unknown>(queryClient, ["reports", userId]),
    teamMembersCount: getCachedArrayCount<unknown>(queryClient, [
      "team-members",
      userId
    ])
  };
};

const getUsagePercent = (item: UsageItem): number =>
  item.current === null ? 0 : Math.min(100, (item.current / item.limit) * 100);

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

const Billing = ({ isAdmin, userId, locations }: BillingProps) => {
  const queryClient = useQueryClient();
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(() => {
      setCacheVersion((version) => version + 1);
    });
  }, [queryClient]);

  const cachedBillingData = useMemo(
    () => readBillingCacheData(queryClient, userId),
    [cacheVersion, queryClient, userId]
  );
  const reviewsTotal = toFiniteNumber(
    cachedBillingData.kpiSummary?.counts?.reviews_total
  );
  const reviewsReplied = toFiniteNumber(
    cachedBillingData.kpiSummary?.counts?.reviews_replied
  );
  const responseRate = toFiniteNumber(
    cachedBillingData.kpiSummary?.response?.response_rate_pct
  );
  const aiSamples = toFiniteNumber(
    cachedBillingData.aiStats?.sentiment?.samples ??
      cachedBillingData.kpiSummary?.sentiment?.sentiment_samples
  );
  const aiUsage =
    cachedBillingData.draftCount !== null
      ? {
          current: cachedBillingData.draftCount,
          source: "real" as const,
          projection: "Donnée issue des drafts déjà présents en cache Inbox."
        }
      : aiSamples !== null
        ? {
            current: aiSamples,
            source: "estimated" as const,
            projection:
              "Estimé depuis les avis analysés IA déjà disponibles en cache."
          }
        : {
            current: null,
            source: "planned" as const,
            projection: "Bientôt disponible : aucun cache d’usage IA chargé."
          };
  const usageItems = useMemo<UsageItem[]>(
    () => [
      {
        label: "Réponses IA mensuelles",
        current: aiUsage.current,
        limit: 500,
        projection: aiUsage.projection,
        source: aiUsage.source,
        attention:
          aiUsage.current !== null && (aiUsage.current / 500) * 100 >= 85
      },
      {
        label: "Établissements",
        current: locations.length,
        limit: 3,
        projection:
          locations.length >= 3
            ? "Limite Growth de démonstration atteinte."
            : `Encore ${formatNumber(3 - locations.length)} fiche${
                3 - locations.length > 1 ? "s" : ""
              } disponible${3 - locations.length > 1 ? "s" : ""} sur Growth.`,
        source: "real"
      },
      {
        label: "Membres d’équipe",
        current: cachedBillingData.teamMembersCount,
        limit: 10,
        projection:
          cachedBillingData.teamMembersCount !== null
            ? "Donnée équipe issue du cache existant."
            : "Bientôt disponible : ouvrez l’équipe pour charger cette donnée.",
        source:
          cachedBillingData.teamMembersCount !== null ? "real" : "planned"
      },
      {
        label: "Automatisations actives",
        current: null,
        limit: 5,
        projection:
          "Bientôt disponible : aucun cache workflow n’est exposé sans fetch.",
        source: "planned"
      },
      {
        label: "Rapports PDF",
        current: cachedBillingData.reportsCount,
        limit: 10,
        projection:
          cachedBillingData.reportsCount !== null
            ? "Donnée rapports issue du cache existant."
            : "Bientôt disponible : ouvrez les rapports pour charger cette donnée.",
        source: cachedBillingData.reportsCount !== null ? "real" : "planned"
      }
    ],
    [
      aiUsage.current,
      aiUsage.projection,
      aiUsage.source,
      cachedBillingData.reportsCount,
      cachedBillingData.teamMembersCount,
      locations.length
    ]
  );
  const primaryUsage = usageItems[0];
  const primaryUsagePercent = getUsagePercent(primaryUsage);
  const usageHeaderBadge =
    primaryUsage.source === "planned"
      ? "Usage IA à brancher"
      : primaryUsage.attention
        ? "Attention volume IA"
        : "Usage suivi";
  const usageHeaderVariant =
    primaryUsage.source === "planned"
      ? "neutral"
      : primaryUsage.attention
        ? "warning"
        : "success";
  const businessValue = useMemo<BusinessValueItem[]>(
    () => [
      {
        label: "Avis synchronisés",
        value:
          reviewsTotal !== null ? formatNumber(reviewsTotal) : "Non mesuré",
        detail:
          reviewsTotal !== null
            ? "donnée KPI disponible"
            : "KPI pas encore chargé dans le cache",
        source: reviewsTotal !== null ? "real" : "planned"
      },
      {
        label: "Taux réponse",
        value:
          responseRate !== null ? formatPercent(responseRate) : "Non mesuré",
        detail:
          responseRate !== null
            ? "donnée KPI disponible"
            : "taux réponse non encore mesuré",
        source: responseRate !== null ? "real" : "planned"
      },
      {
        label: "Avis traités",
        value:
          reviewsReplied !== null
            ? formatNumber(reviewsReplied)
            : "Non mesuré",
        detail:
          reviewsReplied !== null
            ? "réponses déjà détectées"
            : "réponses non encore en cache",
        source: reviewsReplied !== null ? "real" : "planned"
      }
    ],
    [responseRate, reviewsReplied, reviewsTotal]
  );
  const roiBase =
    aiUsage.current ?? reviewsReplied ?? (reviewsTotal !== null ? 0 : null);
  const estimatedHoursSaved =
    roiBase !== null ? Math.round((roiBase * 4) / 60) : null;
  const roiHeadline =
    estimatedHoursSaved !== null
      ? `EGIA a économisé environ ${formatNumber(
          estimatedHoursSaved
        )}h estimées sur les données en cache.`
      : "ROI en préparation : temps économisé non encore mesuré.";
  const upgradeDescription =
    primaryUsage.source !== "planned" && primaryUsagePercent >= 80
      ? "Votre volume IA approche de la limite Growth. Le prochain niveau sécurise plus de capacité, de contrôle et de pilotage réseau."
      : "Les offres restent visibles pour préparer le passage Stripe, sans checkout ni portail actif pour l’instant.";
  const mobileUsageLabel =
    primaryUsage.source === "planned"
      ? "Usage IA bientôt disponible"
      : `${formatPercent(primaryUsagePercent)} du quota IA ${
          primaryUsage.source === "estimated" ? "estimé" : "utilisé"
        }`;
  const mobileUsageDetail =
    primaryUsage.source === "planned"
      ? "Données de facturation en préparation."
      : "Anticipez avant la limite mensuelle.";

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
                Plan de démonstration : Growth
              </h2>
              <Badge variant="warning">Démo</Badge>
            </div>
            <p className="max-w-2xl text-sm text-slate-500">
              Données de facturation en préparation. Les compteurs ci-dessous
              distinguent les données réelles des estimations.
            </p>
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                Prochain renouvellement : bientôt disponible
              </div>
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-500" />
                Paiement Stripe : bientôt disponible
              </div>
            </div>
          </div>
          <Button
            disabled
            title="Bientôt disponible"
            className="w-full lg:w-auto"
          >
            Gérer abonnement
            <span className="text-xs text-white/70">Portail en préparation</span>
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Usage & Limites</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Visualisez votre trajectoire sans mélanger données réelles et
                indicateurs en préparation.
              </p>
            </div>
            <Badge variant={usageHeaderVariant}>{usageHeaderBadge}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              {usageItems.map((item) => {
                const percent = getUsagePercent(item);
                const isHighUsage = percent >= 85;
                const isUnavailable = item.current === null;
                const currentDisplay =
                  item.current === null
                    ? `— / ${formatNumber(item.limit)}`
                    : `${formatNumber(item.current)} / ${formatNumber(
                        item.limit
                      )}`;
                const source = sourceMeta[item.source];

                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">
                          {item.label}
                        </span>
                        <Badge variant={source.variant}>{source.label}</Badge>
                        {item.attention && (
                          <Badge variant="warning">Presque plein</Badge>
                        )}
                      </div>
                      <span className="text-slate-500">
                        {currentDisplay}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isUnavailable
                            ? "bg-slate-300"
                            : isHighUsage
                              ? "bg-amber-500"
                              : "bg-slate-950"
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

            <div className="rounded-2xl bg-slate-100 p-5">
              <h3 className="text-lg font-semibold text-slate-950">
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
              <Button className="mt-5 bg-violet-700 hover:bg-violet-800" onClick={scrollToPricing}>
                Voir les offres
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300">
                <TrendingUp size={22} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-300">
                    ROI EGIA
                  </p>
                  <Badge variant="warning">Estimé</Badge>
                </div>
                <h2 className="mt-2 text-2xl font-semibold leading-tight">
                  {roiHeadline}
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  Estimation basée uniquement sur les drafts, avis et KPIs déjà
                  présents dans le cache frontend.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Valeur business générée</CardTitle>
            <p className="text-sm text-slate-500">
              Une lecture simple de ce que votre abonnement transforme déjà.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {businessValue.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {item.label}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-semibold text-slate-950">
                      {item.value}
                    </p>
                    <Badge variant={sourceMeta[item.source].variant}>
                      {sourceMeta[item.source].label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-gradient-to-br from-white via-violet-50 to-slate-100">
        <CardContent className="grid gap-5 pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700">
              <Sparkles size={14} />
              Upgrade recommandé
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Comparez les offres avant le branchement Stripe.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {upgradeDescription}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button className="bg-violet-700 hover:bg-violet-800" onClick={scrollToPricing}>
              Comparer les offres
            </Button>
            <Button variant="outline" disabled title="Bientôt disponible">
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
                  title={
                    plan.current
                      ? "Plan de démonstration actif"
                      : "Bientôt disponible"
                  }
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
                    Aucune facture disponible : données de facturation en
                    préparation.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-16px_36px_-24px_rgba(15,23,42,0.6)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              {mobileUsageLabel}
            </p>
            <p className="truncate text-xs text-slate-500">
              {mobileUsageDetail}
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
