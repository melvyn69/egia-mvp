import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Eye,
  Gauge,
  Lock,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
  TrendingUp,
  WalletCards,
  X
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";

type DeveloperConsoleProps = {
  session: Session | null;
  isDeveloper: boolean;
};

type KpiTone = "neutral" | "success" | "warning" | "danger" | "dark";

type MockKpi = {
  label: string;
  value: string;
  delta: string;
  detail: string;
  tone: KpiTone;
  source: "mock" | "derived";
};

type Health = "excellent" | "healthy" | "watch" | "risk";

type MockClient = {
  id: string;
  establishment: string;
  owner: string;
  plan: string;
  status: "active" | "trial" | "paused" | "at_risk";
  mrr: number;
  lastActivity: string;
  usage30d: number;
  health: Health;
  churnRisk: "low" | "medium" | "high";
  modules: string[];
  locationCount: number;
  openAlerts: number;
};

type MockAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  source: string;
  status: "sent" | "not_sent" | "simulated";
  date: string;
  action: string;
};

type MockSaasHealth = {
  label: string;
  status: "operational" | "degraded" | "watch";
  detail: string;
  lastCheck: string;
};

type MockActivity = {
  id: string;
  type: "client" | "report" | "billing" | "system" | "support";
  title: string;
  detail: string;
  at: string;
};

type MockProductMetric = {
  label: string;
  adoption: number;
  change: string;
  detail: string;
};

const mockKpis: MockKpi[] = [
  {
    label: "MRR",
    value: "14 820 EUR",
    delta: "+8.4%",
    detail: "Simulation billing",
    tone: "success",
    source: "mock"
  },
  {
    label: "ARR",
    value: "177 840 EUR",
    delta: "+11.2%",
    detail: "Projection annualisee",
    tone: "success",
    source: "mock"
  },
  {
    label: "Nouveaux clients",
    value: "12",
    delta: "+3 ce mois",
    detail: "Onboarding en cours",
    tone: "neutral",
    source: "mock"
  },
  {
    label: "Clients actifs",
    value: "86",
    delta: "74% actifs",
    detail: "Usage 30 jours",
    tone: "dark",
    source: "mock"
  },
  {
    label: "Churn mensuel",
    value: "2.1%",
    delta: "-0.4 pt",
    detail: "Estimation provisoire",
    tone: "warning",
    source: "mock"
  },
  {
    label: "Clients a risque",
    value: "7",
    delta: "3 critiques",
    detail: "Baisse usage / paiement",
    tone: "danger",
    source: "mock"
  },
  {
    label: "Erreurs critiques",
    value: "2",
    delta: "24h",
    detail: "API + cron",
    tone: "danger",
    source: "mock"
  },
  {
    label: "Cout IA estime",
    value: "286 EUR",
    delta: "+18%",
    detail: "OpenAI mock",
    tone: "warning",
    source: "mock"
  }
];

const mockClients: MockClient[] = [
  {
    id: "client_001",
    establishment: "Maison Lorette",
    owner: "Claire Martin",
    plan: "Scale",
    status: "active",
    mrr: 249,
    lastActivity: "Il y a 8 min",
    usage30d: 92,
    health: "excellent",
    churnRisk: "low",
    modules: ["Avis IA", "Rapports", "Alertes", "Loyalty"],
    locationCount: 4,
    openAlerts: 0
  },
  {
    id: "client_002",
    establishment: "Atelier Bosco",
    owner: "Nabil Benali",
    plan: "Pro",
    status: "at_risk",
    mrr: 129,
    lastActivity: "Il y a 12 j",
    usage30d: 28,
    health: "risk",
    churnRisk: "high",
    modules: ["Avis IA", "Concurrents"],
    locationCount: 1,
    openAlerts: 4
  },
  {
    id: "client_003",
    establishment: "Hotel Rivage",
    owner: "Sofia Laurent",
    plan: "Enterprise",
    status: "active",
    mrr: 690,
    lastActivity: "Il y a 1 h",
    usage30d: 81,
    health: "healthy",
    churnRisk: "low",
    modules: ["Avis IA", "Rapports", "Alertes", "Automatisations"],
    locationCount: 9,
    openAlerts: 1
  },
  {
    id: "client_004",
    establishment: "Bistro Amarone",
    owner: "Lina Moreau",
    plan: "Starter",
    status: "trial",
    mrr: 49,
    lastActivity: "Il y a 4 h",
    usage30d: 55,
    health: "watch",
    churnRisk: "medium",
    modules: ["Avis IA"],
    locationCount: 1,
    openAlerts: 2
  },
  {
    id: "client_005",
    establishment: "Clinique Opera",
    owner: "Thomas Vidal",
    plan: "Pro",
    status: "paused",
    mrr: 0,
    lastActivity: "Il y a 21 j",
    usage30d: 12,
    health: "risk",
    churnRisk: "high",
    modules: ["Rapports", "Alertes"],
    locationCount: 2,
    openAlerts: 5
  }
];

const mockAlerts: MockAlert[] = [
  {
    id: "alert_001",
    severity: "critical",
    title: "Cron IA non execute depuis 9 h",
    source: "Cron jobs",
    status: "simulated",
    date: "Il y a 14 min",
    action: "Verifier la file ai_run_history et relancer le cron."
  },
  {
    id: "alert_002",
    severity: "warning",
    title: "Client VIP inactif",
    source: "Product usage",
    status: "not_sent",
    date: "Il y a 48 min",
    action: "Contacter Maison Lorette si aucune activite sous 24 h."
  },
  {
    id: "alert_003",
    severity: "warning",
    title: "Cout IA anormalement haut",
    source: "OpenAI",
    status: "simulated",
    date: "Il y a 2 h",
    action: "Auditer les generations longues et reponses automatiques."
  }
];

const mockSaasHealth: MockSaasHealth[] = [
  {
    label: "Frontend",
    status: "operational",
    detail: "Build Vite stable",
    lastCheck: "30 s"
  },
  {
    label: "API",
    status: "operational",
    detail: "p95 280 ms",
    lastCheck: "1 min"
  },
  {
    label: "Supabase",
    status: "operational",
    detail: "RLS active",
    lastCheck: "2 min"
  },
  {
    label: "Edge Functions",
    status: "watch",
    detail: "1 retry observe",
    lastCheck: "6 min"
  },
  {
    label: "Cron jobs",
    status: "degraded",
    detail: "AI tagging en retard",
    lastCheck: "9 h"
  },
  {
    label: "OpenAI",
    status: "watch",
    detail: "Cout simule eleve",
    lastCheck: "12 min"
  }
];

const mockActivity: MockActivity[] = [
  {
    id: "activity_001",
    type: "client",
    title: "Nouveau client cree",
    detail: "Bistro Amarone a termine son premier onboarding.",
    at: "Il y a 8 min"
  },
  {
    id: "activity_002",
    type: "report",
    title: "Rapport genere",
    detail: "Hotel Rivage - benchmark concurrents.",
    at: "Il y a 36 min"
  },
  {
    id: "activity_003",
    type: "billing",
    title: "Abonnement active",
    detail: "Maison Lorette passe sur le plan Scale.",
    at: "Il y a 1 h"
  },
  {
    id: "activity_004",
    type: "system",
    title: "Erreur API detectee",
    detail: "Timeout sur synchronisation Google Reviews.",
    at: "Il y a 2 h"
  },
  {
    id: "activity_005",
    type: "support",
    title: "Client inactif signale",
    detail: "Atelier Bosco n'a pas ouvert EGIA depuis 12 jours.",
    at: "Il y a 3 h"
  }
];

const mockProductAnalytics: MockProductMetric[] = [
  {
    label: "Dashboard",
    adoption: 88,
    change: "+6%",
    detail: "Utilise par les comptes actifs"
  },
  {
    label: "Avis IA",
    adoption: 74,
    change: "+11%",
    detail: "Module coeur, forte recurrence"
  },
  {
    label: "Rapports",
    adoption: 61,
    change: "+4%",
    detail: "Hebdo et mensuel dominants"
  },
  {
    label: "Alertes",
    adoption: 49,
    change: "-2%",
    detail: "Activation encore incomplete"
  },
  {
    label: "Automatisations",
    adoption: 32,
    change: "+9%",
    detail: "Usage concentre Pro+"
  },
  {
    label: "Loyalty",
    adoption: 28,
    change: "+13%",
    detail: "Fort potentiel upsell"
  },
  {
    label: "Concurrents",
    adoption: 44,
    change: "+7%",
    detail: "Tres utilise par multi-sites"
  },
  {
    label: "Brand Voice",
    adoption: 57,
    change: "+5%",
    detail: "Bon signal onboarding"
  }
];

const mockFounderBrief = [
  "Contacter Atelier Bosco et Clinique Opera avant vendredi: usage bas, alertes ouvertes, risque churn haut.",
  "Mettre en avant Loyalty dans les comptes Starter: adoption faible mais progression forte.",
  "Auditer le cron IA avant d'activer les emails developpeur: l'alerte est simulee en V1.",
  "Prioriser un futur branchement Supabase read-only pour remplacer MRR, churn et cout IA mockes."
];

const kpiToneClass: Record<KpiTone, string> = {
  neutral: "border-slate-200 bg-white text-slate-950",
  success: "border-emerald-100 bg-emerald-50 text-emerald-900",
  warning: "border-amber-100 bg-amber-50 text-amber-900",
  danger: "border-rose-100 bg-rose-50 text-rose-900",
  dark: "border-slate-900 bg-slate-950 text-white"
};

const statusLabel: Record<MockClient["status"], string> = {
  active: "Actif",
  trial: "Essai",
  paused: "Pause",
  at_risk: "A risque"
};

const healthLabel: Record<Health, string> = {
  excellent: "Excellent",
  healthy: "Sain",
  watch: "A surveiller",
  risk: "Risque"
};

const healthClass: Record<Health, string> = {
  excellent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  healthy: "border-moss/20 bg-moss/10 text-moss",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  risk: "border-rose-200 bg-rose-50 text-rose-700"
};

const riskClass: Record<MockClient["churnRisk"], string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

const alertSeverityClass: Record<MockAlert["severity"], string> = {
  info: "border-slate-200 bg-slate-50 text-slate-600",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700"
};

const saasStatusClass: Record<MockSaasHealth["status"], string> = {
  operational: "bg-emerald-500",
  watch: "bg-amber-400",
  degraded: "bg-rose-500"
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);

const escapeCsvCell = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

const buildClientsCsv = () => {
  const headers = [
    "etablissement",
    "owner",
    "plan",
    "statut",
    "mrr_eur",
    "derniere_activite",
    "usage_30j",
    "sante",
    "risque_churn",
    "alertes_ouvertes"
  ];
  const rows = mockClients.map((client) => [
    client.establishment,
    client.owner,
    client.plan,
    statusLabel[client.status],
    client.mrr,
    client.lastActivity,
    client.usage30d,
    healthLabel[client.health],
    client.churnRisk,
    client.openAlerts
  ]);
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
};

const DeveloperAccessDenied = ({ email }: { email?: string | null }) => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-1 py-8">
      <Card className="w-full overflow-hidden border-slate-200 shadow-soft">
        <CardHeader className="gap-4 p-5 sm:p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <Lock size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
              Acces developpeur requis
            </Badge>
            <CardTitle className="mt-3 text-2xl tracking-tight text-slate-950">
              Acces refuse
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Cette console interne est reservee aux emails declares dans
              VITE_DEVELOPER_EMAILS. La session actuelle
              {email ? ` (${email})` : ""} n'est pas autorisee.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:px-7 sm:pb-7">
          <Button className="w-full sm:w-auto" onClick={() => navigate("/")}>
            Retour dashboard
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => navigate("/help")}
          >
            Centre d'aide
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

const KpiCard = ({ item }: { item: MockKpi }) => (
  <div
    className={cn(
      "min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4",
      kpiToneClass[item.tone]
    )}
  >
    <div className="flex min-w-0 items-start justify-between gap-2">
      <p
        className={cn(
          "min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.16em]",
          item.tone === "dark" ? "text-slate-300" : "text-slate-500"
        )}
        title={item.label}
      >
        {item.label}
      </p>
      <span
        className={cn(
          "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
          item.tone === "dark"
            ? "border-white/10 bg-white/10 text-slate-200"
            : "border-slate-200 bg-white/70 text-slate-500"
        )}
      >
        {item.source === "mock" ? "Mock" : "Derive"}
      </span>
    </div>
    <p className="mt-2 truncate text-2xl font-semibold leading-none tracking-tight sm:text-3xl">
      {item.value}
    </p>
    <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs">
      <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate font-semibold">{item.delta}</span>
    </div>
    <p
      className={cn(
        "mt-1 truncate text-xs",
        item.tone === "dark" ? "text-slate-400" : "text-slate-500"
      )}
      title={item.detail}
    >
      {item.detail}
    </p>
  </div>
);

const ClientActions = ({
  compact = false,
  onView,
  showView = true
}: {
  compact?: boolean;
  onView?: () => void;
  showView?: boolean;
}) => (
  <div
    className={cn(
      "grid gap-1.5",
      compact
        ? showView
          ? "grid-cols-2"
          : "grid-cols-1 sm:grid-cols-3"
        : showView
          ? "grid-cols-2 xl:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-3"
    )}
  >
    {showView && (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 min-w-0 px-2 text-xs"
        onClick={onView}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Voir</span>
      </Button>
    )}
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled
      aria-disabled="true"
      title="Impersonation non activee dans cette V1 UI mockee."
      className="h-8 min-w-0 px-2 text-xs"
    >
      <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">Entrer</span>
    </Button>
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled
      aria-disabled="true"
      title="Logs client non branches dans cette V1 UI mockee."
      className="h-8 min-w-0 px-2 text-xs"
    >
      <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">Logs</span>
    </Button>
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled
      aria-disabled="true"
      title="Facturation reelle non branchee dans cette V1."
      className="h-8 min-w-0 border border-rose-100 bg-rose-50 px-2 text-xs text-rose-700 hover:bg-rose-50"
    >
      <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">Facturation</span>
    </Button>
  </div>
);

const ClientMobileCard = ({
  client,
  onView
}: {
  client: MockClient;
  onView: () => void;
}) => (
  <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-950" title={client.establishment}>
          {client.establishment}
        </h3>
        <p className="mt-0.5 truncate text-xs text-slate-500" title={client.owner}>
          {client.owner} · {client.plan}
        </p>
      </div>
      <Badge className={cn("shrink-0 px-2 py-0.5 text-[11px]", healthClass[client.health])}>
        {healthLabel[client.health]}
      </Badge>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div className="min-w-0 rounded-xl bg-slate-50 p-2">
        <p className="text-slate-400">MRR</p>
        <p className="truncate font-semibold text-slate-950">{formatCurrency(client.mrr)}</p>
      </div>
      <div className="min-w-0 rounded-xl bg-slate-50 p-2">
        <p className="text-slate-400">Usage</p>
        <p className="font-semibold text-slate-950">{client.usage30d}%</p>
      </div>
      <div className="min-w-0 rounded-xl bg-slate-50 p-2">
        <p className="text-slate-400">Alertes</p>
        <p className="font-semibold text-slate-950">{client.openAlerts}</p>
      </div>
    </div>
    <div className="mt-3 flex min-w-0 flex-wrap gap-1">
      {client.modules.slice(0, 3).map((module) => (
        <span
          key={module}
          className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
          title={module}
        >
          {module}
        </span>
      ))}
      {client.modules.length > 3 && (
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
          +{client.modules.length - 3}
        </span>
      )}
    </div>
    <div className="mt-3">
      <ClientActions compact onView={onView} />
    </div>
  </article>
);

const DeveloperConsole = ({ session, isDeveloper }: DeveloperConsoleProps) => {
  const navigate = useNavigate();
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [selectedClient, setSelectedClient] = useState<MockClient | null>(null);
  const isAuthorized = Boolean(session && isDeveloper);

  const healthScore = useMemo(() => {
    const averageUsage =
      mockClients.reduce((sum, client) => sum + client.usage30d, 0) /
      mockClients.length;
    const riskyPenalty =
      mockClients.filter((client) => client.churnRisk === "high").length * 7;
    return Math.max(0, Math.min(100, Math.round(averageUsage + 25 - riskyPenalty)));
  }, []);

  const revenue = useMemo(() => {
    const currentMrr = mockClients.reduce((sum, client) => sum + client.mrr, 0);
    return {
      currentMrr,
      expansion: 1840,
      contraction: 420,
      churnMrr: 310,
      netMrr: currentMrr + 1840 - 420 - 310,
      arpu: Math.round(currentMrr / mockClients.length)
    };
  }, []);

  useEffect(() => {
    if (!selectedClient) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedClient(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedClient]);

  if (!isAuthorized) {
    return <DeveloperAccessDenied email={session?.user.email} />;
  }

  const handleExportCsv = () => {
    const blob = new Blob([buildClientsCsv()], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `egia-developer-console-clients-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const refreshedLabel = refreshedAt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="developer-console min-w-0 max-w-full space-y-4 overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-5 lg:pb-4">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge className="border-slate-900 bg-slate-950 text-white">
                Acces developpeur uniquement
              </Badge>
              <span className="truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                Derniere actualisation {refreshedLabel}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              God Mode
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Founder OS interne pour piloter clients, revenus, produit,
              support et infrastructure.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 px-2"
              onClick={() => setRefreshedAt(new Date())}
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Rafraichir</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 px-2"
              onClick={handleExportCsv}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Export CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="col-span-2 min-w-0 px-2 sm:col-span-1"
              onClick={() => navigate("/system-health")}
            >
              <Terminal className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Logs systeme</span>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {mockKpis.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="min-w-0 overflow-hidden border-slate-900 bg-slate-950 text-white shadow-soft">
              <CardHeader className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                      Business Health Score
                    </p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-5xl font-semibold leading-none tracking-tight">
                        {healthScore}
                      </span>
                      <span className="pb-1 text-sm font-semibold text-slate-400">
                        /100
                      </span>
                    </div>
                  </div>
                  <Badge className="border-white/10 bg-white/10 text-emerald-100">
                    Vert
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${healthScore}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
                    <p className="text-slate-400">Usage</p>
                    <p className="mt-1 font-semibold text-white">Stable</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
                    <p className="text-slate-400">Churn</p>
                    <p className="mt-1 font-semibold text-amber-100">A surveiller</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
                    <p className="text-slate-400">Infra</p>
                    <p className="mt-1 font-semibold text-rose-100">1 retard</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <CardHeader className="p-4 sm:p-5">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Revenue Intelligence</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">
                      Donnees simulees, pretes pour le branchement billing.
                    </p>
                  </div>
                  <WalletCards className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5 sm:pb-5">
                {[
                  ["MRR actuel", formatCurrency(revenue.currentMrr)],
                  ["Expansion", `+${formatCurrency(revenue.expansion)}`],
                  ["Contraction", `-${formatCurrency(revenue.contraction)}`],
                  ["Churn MRR", `-${formatCurrency(revenue.churnMrr)}`],
                  ["Net MRR", formatCurrency(revenue.netMrr)],
                  ["ARPU", formatCurrency(revenue.arpu)]
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                      {value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 max-w-full overflow-hidden">
            <CardHeader className="gap-3 p-4 sm:p-5">
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base">Clients</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    Table mockee. Actions sensibles separees et desactivees.
                  </p>
                </div>
                <Badge className="w-fit border-slate-200 bg-slate-50 text-slate-600">
                  {mockClients.length} comptes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="space-y-2 px-3 pb-3 md:hidden">
                {mockClients.map((client) => (
                  <ClientMobileCard
                    key={client.id}
                    client={client}
                    onView={() => setSelectedClient(client)}
                  />
                ))}
              </div>
              <div className="hidden md:block">
                <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.75fr_0.7fr_0.9fr_0.8fr_0.75fr_0.85fr_1.35fr] border-y border-slate-100 bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <span>Etablissement</span>
                  <span>Owner</span>
                  <span>Plan</span>
                  <span>Statut</span>
                  <span>MRR</span>
                  <span>Activite</span>
                  <span>Usage</span>
                  <span>Sante</span>
                  <span>Risque</span>
                  <span>Actions</span>
                </div>
                {mockClients.map((client) => (
                  <div
                    key={client.id}
                    className="grid min-w-0 grid-cols-[1.4fr_1fr_0.7fr_0.75fr_0.7fr_0.9fr_0.8fr_0.75fr_0.85fr_1.35fr] items-center gap-0 border-b border-slate-100 px-5 py-3 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="min-w-0 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                    >
                      <span className="block truncate font-semibold text-slate-950" title={client.establishment}>
                        {client.establishment}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {client.locationCount} lieux · {client.openAlerts} alertes
                      </span>
                    </button>
                    <span className="min-w-0 truncate pr-3 text-slate-600" title={client.owner}>
                      {client.owner}
                    </span>
                    <span className="truncate pr-3 font-medium text-slate-700">{client.plan}</span>
                    <span className="pr-3">
                      <Badge className="px-2 py-0.5 text-[11px]">
                        {statusLabel[client.status]}
                      </Badge>
                    </span>
                    <span className="truncate pr-3 font-semibold text-slate-950">
                      {formatCurrency(client.mrr)}
                    </span>
                    <span className="truncate pr-3 text-xs text-slate-500">
                      {client.lastActivity}
                    </span>
                    <span className="pr-3">
                      <span className="inline-flex min-w-12 justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                        {client.usage30d}%
                      </span>
                    </span>
                    <span className="pr-3">
                      <Badge className={cn("px-2 py-0.5 text-[11px]", healthClass[client.health])}>
                        {healthLabel[client.health]}
                      </Badge>
                    </span>
                    <span className="pr-3">
                      <Badge className={cn("px-2 py-0.5 text-[11px]", riskClass[client.churnRisk])}>
                        {client.churnRisk}
                      </Badge>
                    </span>
                    <ClientActions onView={() => setSelectedClient(client)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="p-4 sm:p-5">
              <CardTitle className="text-base">Product Analytics</CardTitle>
              <p className="text-xs text-slate-500">
                Adoption mockee par module, structure prete pour analytics reel.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:px-5 sm:pb-5">
              {mockProductAnalytics.map((metric) => (
                <div key={metric.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-700" title={metric.label}>
                      {metric.label}
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold text-moss">
                      {metric.change}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {metric.adoption}%
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-slate-950"
                      style={{ width: `${metric.adoption}%` }}
                    />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">
                    {metric.detail}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Alert Center</CardTitle>
                <ShieldAlert className="h-5 w-5 text-rose-500" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
              {mockAlerts.map((alert) => (
                <article key={alert.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge className={cn("px-2 py-0.5 text-[11px]", alertSeverityClass[alert.severity])}>
                        {alert.severity}
                      </Badge>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
                        {alert.title}
                      </h3>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-slate-400">
                      {alert.date}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {alert.source} · {alert.status === "sent" ? "Envoye" : "Non envoye"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-4 text-slate-600">
                    {alert.action}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">SaaS Health</CardTitle>
                <Gauge className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
              {mockSaasHealth.map((service) => (
                <div key={service.label} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", saasStatusClass[service.status])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {service.label}
                    </p>
                    <p className="truncate text-xs text-slate-500" title={service.detail}>
                      {service.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {service.lastCheck}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden border-amber-100 bg-amber-50">
            <CardHeader className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base text-amber-950">
                  AI Founder Brief
                </CardTitle>
                <Bot className="h-5 w-5 text-amber-700" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
              {mockFounderBrief.map((item) => (
                <div key={item} className="flex min-w-0 gap-2 rounded-xl border border-amber-100 bg-white/70 p-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <p className="min-w-0 text-xs leading-5 text-amber-950">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="p-4 sm:p-5">
              <CardTitle className="text-base">Live Activity Feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4 sm:px-5 sm:pb-5">
              {mockActivity.map((item) => (
                <div key={item.id} className="flex min-w-0 gap-3 border-l border-slate-200 pb-3 pl-3 last:pb-0">
                  <span className="-ml-[17px] mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-slate-950" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-400">{item.at}</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-4 text-slate-500">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </section>

      <section className="grid min-w-0 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <CheckCircle2 className="h-4 w-4 text-moss" aria-hidden="true" />
            Empty states prets
          </div>
          <p className="mt-2 text-xs leading-5">
            Les sections restent stables si les futures donnees reelles arrivent
            vides.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
          <div className="flex items-center gap-2 font-semibold text-slate-950">
            <Clock3 className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Loading states
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Skeleton className="h-8 rounded-xl" />
            <Skeleton className="h-8 rounded-xl" />
            <Skeleton className="h-8 rounded-xl" />
          </div>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-center gap-2 font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Actions sensibles
          </div>
          <p className="mt-2 text-xs leading-5">
            Impersonation, facturation et actions destructives restent
            desactivees en V1 UI.
          </p>
        </div>
      </section>

      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer le detail client"
            onClick={() => setSelectedClient(null)}
          />
          <aside
            className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-soft sm:rounded-3xl sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="developer-client-detail-title"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge className={cn("px-2 py-0.5 text-[11px]", healthClass[selectedClient.health])}>
                  {healthLabel[selectedClient.health]}
                </Badge>
                <h2
                  id="developer-client-detail-title"
                  className="mt-3 truncate text-xl font-semibold text-slate-950"
                >
                  {selectedClient.establishment}
                </h2>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {selectedClient.owner} · {selectedClient.plan}
                </p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                onClick={() => setSelectedClient(null)}
                aria-label="Fermer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["MRR", formatCurrency(selectedClient.mrr)],
                ["Lieux", selectedClient.locationCount],
                ["Usage 30j", `${selectedClient.usage30d}%`],
                ["Alertes", selectedClient.openAlerts]
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 truncate font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Modules actifs
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedClient.modules.map((module) => (
                  <Badge key={module} className="border-slate-200 bg-slate-50 text-slate-600">
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3">
              <p className="text-sm font-semibold text-rose-900">
                Zone actions sensibles
              </p>
              <p className="mt-1 text-xs leading-5 text-rose-700">
                Impersonation et facturation restent volontairement desactivees
                tant que les garde-fous backend ne sont pas branches.
              </p>
              <div className="mt-3">
                <ClientActions compact showView={false} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export { DeveloperConsole };
