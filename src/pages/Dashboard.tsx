import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Globe2,
  MessageSquare,
  Phone,
  RefreshCw
} from "lucide-react";
import { BusinessHealthScoreCard } from "../components/coach/BusinessHealthScore";
import { buildBusinessHealthScoreModel } from "../components/coach/businessHealthScoreModel";
import { GoogleConnectionBadge } from "../components/GoogleConnectionBadge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { buildAreaPath, buildLinePath } from "./analytics/utils";
import {
  type AppNotificationBase,
  type AppNotification,
  type NotificationKind,
  type NotificationSeverity,
  addNotificationDedup,
  getNotifications,
  STORAGE_KEY_READ_NOTIFICATIONS,
  getReadNotificationIds,
  dispatchNotificationsUpdated
} from "../lib/notifications";
import type { GoogleConnectionStatus } from "../hooks/useGoogleConnectionStatus";
import { supabase } from "../lib/supabase";
import { useCoachResult } from "../services/coach";

type DashboardProps = {
  session: Session | null;
  googleStatus: GoogleConnectionStatus;
  googleLastError?: string;
  onSyncLocations: () => void;
  syncDisabled?: boolean;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
  syncing: boolean;
};

type KpiSummary = {
  period: { preset: string; from: string | null; to: string | null; tz: string };
  scope: { locationId?: string | null; locationsCount: number };
  counts: {
    reviews_total: number;
    reviews_with_text: number;
    reviews_replied: number;
    reviews_replyable: number;
  };
  ratings: {
    avg_rating: number | null;
  };
  response: {
    response_rate_pct: number | null;
  };
  sentiment: {
    sentiment_positive_pct: number | null;
    sentiment_samples: number;
  };
  nps: {
    nps_score: number | null;
    nps_samples: number;
  };
  meta: {
    data_status: "ok" | "no_data" | "collecting";
    reasons: string[];
  };
  top_tags?: Array<{ tag: string; count: number }>;
};

type AiKpiData = {
  sentiment: {
    positivePct: number | null;
    neutralPct: number | null;
    negativePct: number | null;
    mixedPct: number | null;
    samples: number;
  };
  avgScore: number | null;
  topTags: Array<{ tag: string; count: number }>;
  trend: Array<{
    date: string;
    avgScore: number | null;
    samples: number;
    criticalCount: number;
  }>;
  priorityCount: number;
};

type AiInsightRow = {
  id: string;
  create_time: string | null;
  location_id: string | null;
  review_ai_insights?:
    | {
        sentiment?: string | null;
        sentiment_score?: number | null;
      }
    | Array<{
        sentiment?: string | null;
        sentiment_score?: number | null;
      }>
    | null;
  review_ai_tags?:
    | Array<{
        ai_tags?: { tag?: string | null } | null;
      }>
    | null;
};

type AiTagRow = {
  tag?: string | null;
  category?: string | null;
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Bonjour";
  } else if (hour >= 12 && hour < 18) {
    return "Bon après-midi";
  } else {
    return "Bonsoir";
  }
};

const getFirstName = (session: Session | null): string | null => {
  if (!session?.user) {
    return null;
  }

  const metadata = session.user.user_metadata;
  if (metadata?.first_name) {
    return metadata.first_name;
  }

  if (metadata?.full_name) {
    const parts = metadata.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  if (session.user.email) {
    const emailPart = session.user.email.split("@")[0];
    const parts = emailPart.split(/[._-]/);
    if (parts.length > 0 && parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }

  return null;
};

const formatKpiValue = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  const stringValue = String(value);
  if (
    stringValue === "undefined%" ||
    stringValue === "NaN%" ||
    stringValue === "-" ||
    stringValue.trim() === ""
  ) {
    return "—";
  }
  return stringValue;
};

const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value)}%`;

const formatRating = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}/5`;

const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : String(value);

const formatScore = (value: number | null): string =>
  value === null ? "—" : value.toFixed(2);

const formatDisplayUrl = (value: string | null): string => {
  const rawValue = value?.trim();
  if (!rawValue) {
    return "—";
  }

  try {
    const parsedUrl = new URL(
      /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`
    );
    const hostname = parsedUrl.hostname.replace(/^www\./i, "");
    const pathname =
      parsedUrl.pathname === "/" ? "" : parsedUrl.pathname.replace(/\/$/, "");
    return `${hostname}${pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return rawValue;
  }
};

const getKpiReason = (reasons?: string[]): string => {
  if (!reasons || reasons.length === 0) {
    return "Pas assez de données";
  }
  if (reasons.includes("no_locations")) {
    return "Aucune fiche connectée";
  }
  if (reasons.includes("no_reviews_in_range")) {
    return "Aucun avis sur la période";
  }
  if (reasons.includes("no_sentiment_yet")) {
    return "Analyse en cours";
  }
  if (reasons.includes("invalid_source")) {
    return "Source incompatible";
  }
  return "Pas assez de données";
};

const DashboardSparkline = ({
  values,
  tone = "neutral"
}: {
  values: Array<number | null>;
  tone?: "neutral" | "positive" | "critical";
}) => {
  const width = 150;
  const height = 38;
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const stroke =
    tone === "positive" ? "#059669" : tone === "critical" ? "#e11d48" : "#0f172a";

  if (validValues.length < 2) {
    return (
      <div className="flex h-9 items-center">
        <div className="h-px w-full bg-slate-200" />
      </div>
    );
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const lineMin = min === max ? min - 1 : min;
  const lineMax = min === max ? max + 1 : max;
  const path = buildLinePath(values, lineMin, lineMax, width, height, 5);
  const area = buildAreaPath(path, values, width, height, 5);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Mini tendance"
      className="h-9 w-full"
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity="0.08" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
};

const CompactEmptyState = ({
  icon,
  title,
  description,
  tone = "neutral"
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "success" | "info";
}) => {
  const toneClass =
    tone === "success"
      ? {
          shell: "border-emerald-200 bg-emerald-50/70",
          icon: "border-emerald-200 bg-white text-emerald-700",
          title: "text-emerald-900",
          description: "text-emerald-700/80"
        }
      : tone === "info"
        ? {
            shell: "border-sky-200 bg-sky-50/60",
            icon: "border-sky-200 bg-white text-sky-700",
            title: "text-sky-950",
            description: "text-sky-700/80"
          }
        : {
            shell: "border-slate-200 bg-slate-50/80",
            icon: "border-slate-200 bg-white text-slate-600",
            title: "text-slate-900",
            description: "text-slate-500"
          };

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass.shell}`}>
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${toneClass.icon}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-5 ${toneClass.title}`}>
            {title}
          </p>
          <p className={`mt-0.5 text-xs leading-5 ${toneClass.description}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

const getPresetLabel = (preset: string): string => {
  switch (preset) {
    case "this_week":
      return "Cette semaine";
    case "this_month":
      return "Ce mois";
    case "this_quarter":
      return "Ce trimestre";
    case "last_quarter":
      return "Trimestre précédent";
    case "this_year":
      return "Cette année";
    case "last_year":
      return "Année dernière";
    case "all_time":
      return "Depuis toujours";
    case "custom":
      return "Personnalisé";
    default:
      return "—";
  }
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getPresetRange = (
  preset: string,
  from: string,
  to: string
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  switch (preset) {
    case "this_week": {
      const day = now.getDay();
      const diff = (day + 6) % 7;
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff));
      return { start, end: endOfDay(now) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfDay(now) };
    }
    case "this_quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      return { start, end: endOfDay(now) };
    }
    case "last_quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      const lastQuarter = quarter === 0 ? 3 : quarter - 1;
      const year = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, lastQuarter * 3, 1);
      const end = endOfDay(new Date(year, lastQuarter * 3 + 3, 0));
      return { start, end };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: endOfDay(now) };
    }
    case "last_year": {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
      return { start, end };
    }
    case "custom": {
      const start = from ? startOfDay(new Date(from)) : null;
      const end = to ? endOfDay(new Date(to)) : null;
      return { start, end };
    }
    case "all_time":
    default:
      return { start: null, end: null };
  }
};

const normalizeSentiment = (value: unknown): "positive" | "neutral" | "negative" | null => {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }
  return null;
};

const asOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
};

const getInsight = (record: AiInsightRow) => {
  const insight = asOne(record.review_ai_insights);
  if (!insight) {
    return null;
  }
  return {
    sentiment: normalizeSentiment(insight.sentiment),
    score:
      typeof insight.sentiment_score === "number"
        ? insight.sentiment_score
        : null
  };
};

const getTags = (record: AiInsightRow) => {
  if (!Array.isArray(record.review_ai_tags)) {
    return [];
  }
  return record.review_ai_tags
    .map((tagRow) => {
      const tagRecord = tagRow?.ai_tags as AiTagRow | null | undefined;
      return {
        tag: typeof tagRecord?.tag === "string" ? tagRecord.tag : null,
        category:
          typeof tagRecord?.category === "string" ? tagRecord.category : null
      };
    })
    .filter((tag): tag is { tag: string; category: string | null } => !!tag.tag);
};

const getSeverityOrder = (severity: NotificationSeverity): number => {
  const order: Record<NotificationSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };
  return order[severity];
};

const getNotificationIcon = (
  kind: NotificationKind,
  severity: NotificationSeverity
) => {
  if (kind === "review") {
    if (severity === "critical" || severity === "high") {
      return <AlertTriangle size={16} className="text-red-600" />;
    }
    return <MessageSquare size={16} className="text-green-600" />;
  }
  if (kind === "sync") {
    return <RefreshCw size={16} className="text-blue-600" />;
  }
  if (kind === "connection") {
    return <CheckCircle size={16} className="text-green-600" />;
  }
  return <Bell size={16} className="text-slate-500" />;
};

const formatRelativeTime = (isoDate: string): string => {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Il y a moins d'une minute";
  } else if (diffMins < 60) {
    return `Il y a ${diffMins} minute${diffMins > 1 ? "s" : ""}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? "s" : ""}`;
  } else {
    return `Il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  }
};

type NotificationDraft = Omit<AppNotificationBase, "id" | "createdAt" | "message"> & {
  message?: string | null;
};

const createNotification = (
  partial: NotificationDraft,
  opts?: { key?: string; cooldownMs?: number }
): void => {
  const rawMessage = partial.message;
  const normalizedMessage =
    typeof rawMessage === "string" ? rawMessage.trim().toLowerCase() : "";
  const message =
    normalizedMessage === "" ||
    normalizedMessage === "undefined" ||
    normalizedMessage === "null"
      ? "Une erreur est survenue"
      : (rawMessage as string);

  const notification: AppNotificationBase = {
    ...partial,
    message,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString()
  };

  addNotificationDedup(notification, opts);
};

const Dashboard = ({
  session,
  googleStatus,
  googleLastError,
  onSyncLocations,
  syncDisabled = false,
  locations,
  locationsLoading,
  locationsError,
  syncing
}: DashboardProps) => {
  const greeting = getGreeting();
  const firstName = getFirstName(session);
  const greetingText = firstName ? `${greeting}, ${firstName}` : `${greeting}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const prevSyncingRef = useRef<boolean>(syncing);
  const prevLocationsErrorRef = useRef<string | null>(locationsError);

  const [readNotificationIds] = useState<Set<string>>(
    getReadNotificationIds
  );
  const [kpiPreset, setKpiPreset] = useState<
    | "this_week"
    | "this_month"
    | "this_quarter"
    | "last_quarter"
    | "this_year"
    | "last_year"
    | "all_time"
    | "custom"
  >("all_time");
  const [kpiFrom, setKpiFrom] = useState("");
  const [kpiTo, setKpiTo] = useState("");
  const [kpiLocationId, setKpiLocationId] = useState("");
  const queryClient = useQueryClient();
  const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);
  const [activeLocationsSaving, setActiveLocationsSaving] = useState(false);

  useEffect(() => {
    try {
      const idsArray = Array.from(readNotificationIds);
      window.localStorage.setItem(
        STORAGE_KEY_READ_NOTIFICATIONS,
        JSON.stringify(idsArray)
      );
      dispatchNotificationsUpdated();
    } catch {
      // Ignore storage errors
    }
  }, [readNotificationIds]);

  useEffect(() => {
    if (!kpiLocationId) {
      setKpiLocationId("all");
    }
  }, [kpiLocationId]);

  const canQueryKpi =
    !!session?.access_token && (kpiPreset !== "custom" || !!(kpiFrom && kpiTo));

  const kpiQuery = useQuery<KpiSummary>({
    queryKey: [
      "kpi-summary",
      session?.user?.id ?? null,
      kpiLocationId,
      kpiPreset,
      kpiFrom,
      kpiTo,
      timeZone
    ],
    queryFn: async () => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("Missing session");
      }
      const params = new URLSearchParams();
      if (kpiLocationId && kpiLocationId !== "all") {
        params.set("location_id", kpiLocationId);
      }
      params.set("preset", kpiPreset);
      params.set("tz", timeZone);
      if (kpiPreset === "custom") {
        if (kpiFrom) {
          params.set("from", kpiFrom);
        }
        if (kpiTo) {
          params.set("to", kpiTo);
        }
      }
      const response = await fetch(`/api/kpi/summary?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error("Failed to load KPIs");
      }
      return payload as KpiSummary;
    },
    enabled: canQueryKpi,
    placeholderData: (prev: KpiSummary | undefined) => prev
  });

  const aiKpiQuery = useQuery({
    queryKey: [
      "ai-kpis",
      session?.user?.id ?? null,
      kpiLocationId,
      kpiPreset,
      kpiFrom,
      kpiTo,
      timeZone
    ],
    queryFn: async () => {
      if (!supabase || !session?.user) {
        throw new Error("Missing session");
      }
      const { start, end } = getPresetRange(kpiPreset, kpiFrom, kpiTo);

      let query = supabase
        .from("google_reviews")
        .select(
          "id, create_time, location_id, review_ai_insights(sentiment, sentiment_score), review_ai_tags(ai_tags(tag, category))"
        )
        .eq("user_id", session.user.id);
      if (kpiLocationId && kpiLocationId !== "all") {
        query = query.eq("location_id", kpiLocationId);
      }
      if (start) {
        query = query.gte("create_time", start.toISOString());
      }
      if (end) {
        query = query.lte("create_time", end.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as AiInsightRow[];
      const sentimentCounts = {
        positive: 0,
        neutral: 0,
        negative: 0,
        mixed: 0,
        total: 0
      };
      let scoreSum = 0;
      let scoreCount = 0;
      const tagCounts = new Map<string, { tag: string; count: number }>();
      let priorityCount = 0;

      rows.forEach((row) => {
        const insight = getInsight(row);
        if (insight) {
          if (insight.sentiment) {
            sentimentCounts[insight.sentiment] += 1;
          } else {
            sentimentCounts.mixed += 1;
          }
          sentimentCounts.total += 1;
        }
        if (typeof insight?.score === "number") {
          scoreSum += insight.score;
          scoreCount += 1;
        }
        let hasNegativeTag = false;
        const tags = getTags(row);
        tags.forEach((tag) => {
          const normalizedTag = tag.tag.toLowerCase();
          const existing = tagCounts.get(normalizedTag);
          if (existing) {
            existing.count += 1;
          } else {
            tagCounts.set(normalizedTag, { tag: tag.tag, count: 1 });
          }
          if (tag.category === "negative") {
            hasNegativeTag = true;
          }
        });
        if (
          insight?.sentiment === "negative" ||
          (typeof insight?.score === "number" && insight.score < 0.4) ||
          hasNegativeTag
        ) {
          priorityCount += 1;
        }
      });

      const topTags = Array.from(tagCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(({ tag, count }) => ({ tag, count }));

      const totalSamples = sentimentCounts.total;
      const sentiment = {
        positivePct: totalSamples
          ? (sentimentCounts.positive / totalSamples) * 100
          : null,
        neutralPct: totalSamples
          ? (sentimentCounts.neutral / totalSamples) * 100
          : null,
        negativePct: totalSamples
          ? (sentimentCounts.negative / totalSamples) * 100
          : null,
        mixedPct: totalSamples ? (sentimentCounts.mixed / totalSamples) * 100 : null,
        samples: totalSamples
      };

      const avgScore = scoreCount ? scoreSum / scoreCount : null;

      const trendStart = startOfDay(new Date());
      trendStart.setDate(trendStart.getDate() - 29);
      const trendEnd = endOfDay(new Date());
      let trendQuery = supabase
        .from("google_reviews")
        .select("id, create_time, location_id, review_ai_insights(sentiment_score)")
        .eq("user_id", session.user.id)
        .gte("create_time", trendStart.toISOString())
        .lte("create_time", trendEnd.toISOString());
      if (kpiLocationId && kpiLocationId !== "all") {
        trendQuery = trendQuery.eq("location_id", kpiLocationId);
      }
      const { data: trendData, error: trendError } = await trendQuery;
      if (trendError) {
        throw trendError;
      }

      const buckets = new Map<
        string,
        { sum: number; analysedCount: number; criticalCount: number }
      >();
      for (let i = 0; i < 30; i += 1) {
        const day = new Date(trendStart);
        day.setDate(trendStart.getDate() + i);
        const key = day.toISOString().slice(0, 10);
        buckets.set(key, { sum: 0, analysedCount: 0, criticalCount: 0 });
      }

      (trendData ?? []).forEach((row) => {
        const record = row as AiInsightRow;
        if (!record.create_time) {
          return;
        }
        const dateKey = new Date(record.create_time).toISOString().slice(0, 10);
        const bucket = buckets.get(dateKey);
        if (!bucket) {
          return;
        }
        const insight = getInsight(record);
        if (insight) {
          bucket.analysedCount += 1;
          if (typeof insight.score === "number") {
            bucket.sum += insight.score;
          }
        }
        const hasNegativeTag = getTags(record).some(
          (tag) => tag.category === "negative"
        );
        if (
          insight?.sentiment === "negative" ||
          (typeof insight?.score === "number" && insight.score < 0.4) ||
          hasNegativeTag
        ) {
          bucket.criticalCount += 1;
        }
      });

      const trend = Array.from(buckets.entries()).map(([date, bucket]) => ({
        date,
        avgScore: bucket.analysedCount ? bucket.sum / bucket.analysedCount : null,
        samples: bucket.analysedCount,
        criticalCount: bucket.criticalCount
      }));

      return {
        sentiment,
        avgScore,
        topTags,
        trend,
        priorityCount
      } satisfies AiKpiData;
    },
    enabled: Boolean(supabase) && Boolean(session?.user),
    placeholderData: (prev) => prev
  });

  const kpiData = kpiQuery.data ?? null;
  const kpiLoading = kpiQuery.isLoading;
  const kpiError = kpiQuery.isError ? "Impossible de charger les KPIs." : null;

  const aiKpiData = aiKpiQuery.data ?? null;
  const aiKpiLoading = aiKpiQuery.isLoading;
  const aiKpiError = aiKpiQuery.isError ? "Impossible de charger l'analyse IA." : null;

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !session) {
      setSelectedActiveIds([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabaseClient
        .from("business_settings")
        .select("active_location_ids")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) {
        return;
      }
      if (error) {
        console.error("business_settings load error:", error);
        setSelectedActiveIds(locations.map((location) => location.id));
        return;
      }
      const ids = Array.isArray(data?.active_location_ids)
        ? data.active_location_ids.filter(Boolean)
        : null;
      const resolved =
        ids && ids.length > 0 ? ids : locations.map((location) => location.id);
      setSelectedActiveIds(resolved);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, locations]);

  const saveActiveLocations = async () => {
    if (!supabase || !session) {
      return;
    }
    setActiveLocationsSaving(true);
    const allIds = locations.map((location) => location.id);
    const nextActive =
      selectedActiveIds.length === 0 || selectedActiveIds.length === allIds.length
        ? null
        : selectedActiveIds;
    const payload = {
      user_id: session.user.id,
      business_id: session.user.id,
      business_name: session.user.email ?? "Business",
      active_location_ids: nextActive,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from("business_settings")
      .upsert(payload, { onConflict: "business_id" });
    if (error) {
      console.error("business_settings save error:", error);
    } else {
      setSelectedActiveIds(
        nextActive ?? locations.map((location) => location.id)
      );
    }
    setActiveLocationsSaving(false);
  };

  useEffect(() => {
    const prevSyncing = prevSyncingRef.current;
    if (prevSyncing !== syncing) {
      if (!prevSyncing && syncing) {
        createNotification({
          kind: "sync",
          severity: "info",
          title: "Synchronisation lancée",
          message: "Synchronisation des lieux en cours…"
        });
      } else if (prevSyncing && !syncing) {
        if (locationsError) {
          createNotification({
            kind: "sync",
            severity: "high",
            title: "Erreur de synchronisation",
            message: locationsError
          });
        } else {
          const count = locations.length;
          createNotification({
            kind: "sync",
            severity: "info",
            title: "Synchronisation terminée",
            message: `${count} ${count === 1 ? "lieu disponible" : "lieux disponibles"}.`
          });
        }
      }
    }
    prevSyncingRef.current = syncing;
  }, [syncing, locationsError, locations.length]);

  useEffect(() => {
    const currentError = locationsError?.trim() ?? "";
    const prevError = prevLocationsErrorRef.current?.trim() ?? "";
    if (!syncing && currentError && !prevError) {
      createNotification({
        kind: "sync",
        severity: "high",
        title: "Erreur",
        message: locationsError ?? "Une erreur est survenue"
      });
    }
    prevLocationsErrorRef.current = locationsError;
  }, [locationsError, syncing]);

  const notificationsWithStatus: AppNotification[] = getNotifications().map((notif) => ({
    ...notif,
    status: readNotificationIds.has(notif.id) ? ("read" as const) : ("unread" as const)
  }));

  const urgentActionsCount = notificationsWithStatus.filter(
    (n) => n.requiresAction === true
  ).length;
  const coach = useCoachResult({
    session,
    googleStatus,
    locations,
    notifications: notificationsWithStatus
  });
  const healthModel = useMemo(
    () => buildBusinessHealthScoreModel(coach.coachResult, coach.coachInput),
    [coach.coachInput, coach.coachResult]
  );

  const sortedNotifications = notificationsWithStatus
    .slice()
    .sort((a, b) => {
      const aRequiresAction = a.requiresAction === true;
      const bRequiresAction = b.requiresAction === true;
      if (aRequiresAction !== bRequiresAction) {
        return aRequiresAction ? -1 : 1;
      }
      if (a.status !== b.status) {
        return a.status === "unread" ? -1 : 1;
      }
      const severityDiff = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const recentActivities = sortedNotifications.slice(0, 5);

  const handleOpenInbox = () => {
    window.location.href = "/inbox";
  };

  const getLocationName = (locationId?: string | null): string => {
    if (!locationId) {
      return "—";
    }

    const location = locations.find((loc) => loc.id === locationId);
    if (!location) {
      return "—";
    }

    return location.location_title ?? location.location_resource_name ?? "—";
  };

  const kpiReason = getKpiReason(kpiData?.meta?.reasons);
  const noData = kpiData?.meta?.data_status === "no_data";
  const responseRate = kpiData?.response.response_rate_pct ?? null;
  const responseRateValid =
    responseRate !== null && responseRate >= 0 && responseRate <= 100;
  const kpiCards = [
    {
      id: "reviews_total",
      label: "Volume d'avis",
      value: noData ? "—" : formatCount(kpiData?.counts.reviews_total),
      caption: noData
        ? kpiReason
        : `Avec texte: ${formatCount(kpiData?.counts.reviews_with_text)}`
    },
    {
      id: "avg_rating",
      label: "Note moyenne",
      value: formatRating(kpiData?.ratings.avg_rating ?? null),
      caption:
        kpiData?.ratings.avg_rating === null ? kpiReason : "Sur 5"
    },
    {
      id: "response_rate",
      label: "Taux de réponse",
      value: responseRateValid ? formatPercent(responseRate) : "—",
      caption:
        !responseRateValid
          ? kpiReason
          : `Sur ${formatCount(kpiData?.counts.reviews_replyable)} avis`
    },
    {
      id: "sentiment_positive",
      label: "Sentiment positif",
      value: formatPercent(kpiData?.sentiment.sentiment_positive_pct ?? null),
      caption:
        kpiData?.sentiment.sentiment_positive_pct === null
          ? kpiReason
          : `Sur ${formatCount(kpiData?.sentiment.sentiment_samples)} avis`
    },
    {
      id: "nps",
      label: (
        <span className="inline-flex items-center gap-1">
          Indice de recommandation
          <span
            className="text-xs text-slate-400"
            title="Mesure la probabilite que vos clients vous recommandent."
          >
            ⓘ
          </span>
        </span>
      ),
      value: kpiData?.nps.nps_score ?? "—",
      caption:
        kpiData?.nps.nps_score === null
          ? kpiReason
          : `Sur ${formatCount(kpiData?.nps.nps_samples)} avis`
    }
  ];

  const aiSamples = aiKpiData?.sentiment.samples ?? 0;
  const aiTrend = aiKpiData?.trend ?? [];
  const activeAiTrend = aiTrend.filter(
    (point) =>
      point.samples > 0 ||
      point.avgScore !== null ||
      point.criticalCount > 0
  );
  const latestAiTrendPoint =
    activeAiTrend[activeAiTrend.length - 1] ?? aiTrend[aiTrend.length - 1] ?? null;
  const aiTopTags = aiKpiData?.topTags ?? [];
  const aiSentimentBreakdown = [
    {
      label: "Positif",
      value: aiKpiData?.sentiment.positivePct ?? null,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    },
    {
      label: "Neutre",
      value: aiKpiData?.sentiment.neutralPct ?? null,
      className: "border-slate-200 bg-slate-50 text-slate-600"
    },
    {
      label: "Négatif",
      value: aiKpiData?.sentiment.negativePct ?? null,
      className: "border-rose-200 bg-rose-50 text-rose-700"
    },
    {
      label: "Mixte",
      value: aiKpiData?.sentiment.mixedPct ?? null,
      className: "border-amber-200 bg-amber-50 text-amber-700"
    }
  ];
  const dominantAiSentiment = aiSentimentBreakdown.reduce<
    (typeof aiSentimentBreakdown)[number] | null
  >((current, item) => {
    if (item.value === null) {
      return current;
    }
    if (!current || item.value > (current.value ?? 0)) {
      return item;
    }
    return current;
  }, null);
  const aiMetricCards = [
    {
      label: "Score moyen",
      value: aiKpiLoading ? "…" : formatScore(aiKpiData?.avgScore ?? null),
      caption: aiSamples === 0 ? "En attente de signal" : `Sur ${aiSamples} avis`,
      sparklineValues: aiTrend.map((point) => point.avgScore),
      sparklineTone: "positive" as const
    },
    {
      label: "Avis analysés",
      value: aiKpiLoading ? "…" : formatCount(aiSamples),
      caption: aiSamples === 0 ? "Aucun avis qualifié" : "Sur la période",
      sparklineValues: aiTrend.map((point) => point.samples),
      sparklineTone: "neutral" as const
    },
    {
      label: "Avis critiques",
      value: aiKpiLoading ? "…" : formatCount(aiKpiData?.priorityCount ?? null),
      caption: aiSamples === 0 ? "Rien à prioriser" : "À traiter en priorité",
      sparklineValues: aiTrend.map((point) => point.criticalCount),
      sparklineTone: "critical" as const
    }
  ];
  const activeLocationsCount = locations.filter((location) =>
    selectedActiveIds.includes(location.id)
  ).length;

  return (
    <div className="space-y-4">
      <div className="-mb-2">
        <h2 className="text-sm font-medium text-slate-500">{greetingText}</h2>
      </div>

      <BusinessHealthScoreCard
        model={healthModel}
        variant="dashboard"
        loading={kpiLoading || aiKpiLoading || coach.isLoading}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.055)]">
        <div className="border-b border-slate-100/70 bg-gradient-to-br from-white via-white to-slate-50/80 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem]">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Lieu
              </label>
              <select
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                value={kpiLocationId}
                onChange={(event) => setKpiLocationId(event.target.value)}
              >
                <option value="all">Toutes les fiches</option>
                {locations.map((location) => (
                  <option
                    key={location.location_resource_name}
                    value={location.location_resource_name}
                  >
                    {location.location_title ?? location.location_resource_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[11rem]">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Période
              </label>
              <select
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                value={kpiPreset}
                onChange={(event) =>
                  setKpiPreset(event.target.value as typeof kpiPreset)
                }
              >
                <option value="this_week">Cette semaine</option>
                <option value="this_month">Ce mois</option>
                <option value="this_quarter">Ce trimestre</option>
                <option value="last_quarter">Trimestre précédent</option>
                <option value="this_year">Cette année</option>
                <option value="last_year">Année dernière</option>
                <option value="all_time">Depuis toujours</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {kpiPreset === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={kpiFrom}
                  onChange={(event) => setKpiFrom(event.target.value)}
                />
                <input
                  type="date"
                  className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  value={kpiTo}
                  onChange={(event) => setKpiTo(event.target.value)}
                />
              </div>
            )}
            {kpiError && (
              <span className="text-xs text-amber-700">{kpiError}</span>
            )}
            <span className="pb-3 text-xs font-medium text-slate-500">
              Période: {getPresetLabel(kpiPreset)}
            </span>
            {kpiLoading && (
              <span className="pb-3 text-xs font-medium text-slate-400">
                Actualisation...
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-full"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["kpi-summary"] });
                void queryClient.invalidateQueries({ queryKey: ["ai-kpis"] });
              }}
            >
              Rafraîchir
            </Button>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => (
            <article
              key={kpi.id}
              className="h-full min-w-0 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.07)]"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {kpi.label}
                </p>
                <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
                  {formatKpiValue(kpi.value)}
                </p>
              </div>
              <div className="mt-3">
                <DashboardSparkline values={[]} />
              </div>
              <div className="mt-3">
                <span className="text-xs text-slate-500">
                  {formatKpiValue(kpi.caption)}
                </span>
              </div>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100/70 px-5 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Tags dominants</span>
          {kpiData?.top_tags?.length
            ? kpiData.top_tags
                .map((tag) => `${tag.tag} (${tag.count})`)
                .join(", ")
            : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                  Aucun thème récurrent sur cette période
                </span>
              )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.055)]">
        <div className="flex items-center justify-between border-b border-slate-100/70 bg-slate-50/30 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">Analyse IA</h3>
          {aiKpiError && (
            <span className="text-xs text-amber-700">{aiKpiError}</span>
          )}
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <article className="h-full min-w-0 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 text-left shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.07)]">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Signal principal
            </p>
            {aiKpiLoading ? (
              <div className="mt-3 space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : aiSamples === 0 ? (
              <div className="mt-3">
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Analyse prête à se remplir"
                  description="Les signaux IA apparaîtront dès que des avis seront qualifiés."
                  tone="info"
                />
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-slate-950">
                      {dominantAiSentiment?.label ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatPercent(dominantAiSentiment?.value ?? null)} des avis analysés
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {formatCount(aiSamples)} avis
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {aiSentimentBreakdown.map((sentiment) => (
                    <div
                      key={sentiment.label}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${sentiment.className}`}
                    >
                      <span>{sentiment.label}</span>
                      <span>{formatPercent(sentiment.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {aiMetricCards.map((metric) => (
              <article
                key={metric.label}
                className="h-full min-w-0 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-left shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_rgba(15,23,42,0.07)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {metric.label}
                    </p>
                    <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">
                      {metric.value}
                    </p>
                  </div>
                  <span className="mt-1 text-xs text-slate-500">
                    {metric.caption}
                  </span>
                </div>
                <div className="mt-2">
                  <DashboardSparkline
                    values={metric.sparklineValues}
                    tone={metric.sparklineTone}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <article className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Thèmes dominants
              </p>
              <span className="text-xs font-medium text-slate-500">
                Top {aiTopTags.length || 0}
              </span>
            </div>
            <div className="mt-3">
              {aiKpiLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : aiTopTags.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {aiTopTags.map((tag, index) => (
                    <div
                      key={tag.tag}
                      className={
                        index === 0
                          ? "rounded-xl border border-slate-300 bg-slate-950 px-3 py-2 text-white"
                          : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                      }
                    >
                      <p className="truncate text-sm font-semibold">{tag.tag}</p>
                      <p
                        className={
                          index === 0
                            ? "mt-1 text-xs text-white/70"
                            : "mt-1 text-xs text-slate-500"
                        }
                      >
                        {tag.count} mention{tag.count > 1 ? "s" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Aucun thème dominant"
                  description="Les motifs récurrents seront regroupés ici dès qu’ils ressortent."
                />
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Évolution 30 jours
              </p>
              <span className="text-xs font-medium text-slate-500">
                {activeAiTrend.length}/{aiTrend.length || 30} jours actifs
              </span>
            </div>
            <div className="mt-3">
              {aiKpiLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : aiTrend.length === 0 ? (
                <CompactEmptyState
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Pas encore de tendance"
                  description="La courbe se construira dès que des avis analysés existent sur la période."
                  tone="info"
                />
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Dernier score
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {formatScore(latestAiTrendPoint?.avgScore ?? null)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {latestAiTrendPoint?.date ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Avis analysés
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {formatCount(latestAiTrendPoint?.samples)}
                      </p>
                      <p className="text-xs text-slate-500">dernier point</p>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                      <p className="text-xs font-semibold text-rose-600">
                        Critiques
                      </p>
                      <p className="mt-1 text-xl font-semibold text-rose-700">
                        {formatCount(latestAiTrendPoint?.criticalCount)}
                      </p>
                      <p className="text-xs text-rose-600/80">dernier point</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <DashboardSparkline
                      values={aiTrend.map((point) => point.avgScore)}
                      tone="positive"
                    />
                  </div>
                  <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                      Détail journalier
                    </summary>
                    <div className="mt-2 max-h-28 space-y-1.5 overflow-auto pr-2 text-xs">
                      {activeAiTrend.length === 0 ? (
                        <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-500">
                          Aucun jour actif à détailler pour l’instant.
                        </p>
                      ) : (
                        activeAiTrend.map((point) => (
                          <div
                            key={point.date}
                            className="flex items-center justify-between gap-3 border-t border-slate-200/70 pt-1.5 first:border-t-0 first:pt-0"
                          >
                            <span className="text-slate-600">{point.date}</span>
                            <span className="text-right text-slate-500">
                              Score {formatScore(point.avgScore)} · {point.samples} avis ·{" "}
                              {point.criticalCount} critiques
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </>
              )}
            </div>
          </article>
        </div>
      </section>

      <section
        id="locations-section"
        className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.055)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/70 bg-slate-50/30 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-800">
                Lieux connectés
              </h2>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {locations.length} fiche{locations.length > 1 ? "s" : ""}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {activeLocationsCount} active
                {activeLocationsCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <GoogleConnectionBadge status={googleStatus} />
              <a
                href="/connect"
                className="text-xs font-semibold text-ink underline underline-offset-2"
              >
                Gérer la connexion Google
              </a>
            </div>
            {googleStatus === "reauth_required" && googleLastError && (
              <p className="mt-1 text-xs text-amber-700">
                Dernière erreur: {googleLastError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {googleStatus === "connected" && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-full"
                onClick={onSyncLocations}
                disabled={syncing || syncDisabled}
              >
                <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-full"
              onClick={saveActiveLocations}
              disabled={activeLocationsSaving || locationsLoading}
            >
              <CheckCircle className="h-4 w-4" />
              {activeLocationsSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
        {locationsError && (
          <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {locationsError}
          </div>
        )}
        <div className="grid gap-2 p-4 md:grid-cols-2">
          {locationsLoading &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card
                key={`skeleton-${index}`}
                className="border-slate-200/70 bg-white/75 shadow-none"
              >
                <CardContent className="space-y-2 p-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          {!locationsLoading && locations.length === 0 && (
            <Card className="border-slate-200/70 bg-white/75 shadow-none md:col-span-2">
              <CardContent className="p-3">
                <CompactEmptyState
                  icon={<Globe2 className="h-4 w-4" />}
                  title="Aucune fiche connectée"
                  description="Synchronisez Google pour afficher vos fiches et gérer leur statut ici."
                  tone="info"
                />
              </CardContent>
            </Card>
          )}
          {!locationsLoading &&
            locations.map((location) => {
              const isActive = selectedActiveIds.includes(location.id);
              const displayUrl = formatDisplayUrl(location.website_uri);
              return (
                <Card
                  key={location.id}
                  className={
                    isActive
                      ? "border-emerald-200/80 bg-emerald-50/35 shadow-none"
                      : "border-slate-200/70 bg-white/80 shadow-none"
                  }
                >
                  <CardContent className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p
                          className="truncate text-sm font-semibold text-slate-900"
                          title={
                            location.location_title ??
                            location.location_resource_name
                          }
                        >
                          {location.location_title ??
                            location.location_resource_name}
                        </p>
                        <span
                          className={
                            isActive
                              ? "shrink-0 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                              : "shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500"
                          }
                        >
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </div>
                      <div className="mt-1.5 grid min-w-0 gap-1 text-xs text-slate-500">
                        {location.phone && (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{location.phone}</span>
                          </div>
                        )}
                        {location.website_uri && (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Globe2 className="h-3.5 w-3.5 shrink-0" />
                            <span
                              className="truncate font-medium text-slate-600"
                              title={location.website_uri}
                            >
                              {displayUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <label
                      className={
                        isActive
                          ? "inline-flex items-center justify-end gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
                          : "inline-flex items-center justify-end gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-slate-950"
                        checked={isActive}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedActiveIds((prev) =>
                            checked
                              ? [...prev, location.id]
                              : prev.filter((id) => id !== location.id)
                          );
                        }}
                      />
                      {isActive ? "Activée" : "Désactivée"}
                    </label>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      <section>
        <Card className="border-slate-200/70 bg-white/65 shadow-sm">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <CardTitle className="text-base">À traiter maintenant</CardTitle>
                <p className="text-xs text-slate-500">
                  File courte des points qui méritent une réponse.
                </p>
              </div>
              {urgentActionsCount === 0 ? (
                <CompactEmptyState
                  icon={<CheckCircle className="h-4 w-4" />}
                  title="Tout est sous contrôle"
                  description="Aucun avis urgent ni alerte client ne demande d’action."
                  tone="success"
                />
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900">
                    {urgentActionsCount} action
                    {urgentActionsCount > 1 ? "s" : ""} urgente
                    {urgentActionsCount > 1 ? "s" : ""}.
                  </p>
                  <p className="text-xs text-slate-500">
                    Priorité aux avis négatifs sans réponse.
                  </p>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={handleOpenInbox}>
                Aller à la boîte de réception
              </Button>
            </div>

            <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div>
                <CardTitle className="text-base">Activité récente</CardTitle>
                <p className="text-xs text-slate-500">
                  Derniers signaux utiles, limités aux 5 plus récents.
                </p>
              </div>
              <div className="mt-3 space-y-3">
                {recentActivities.length === 0 ? (
                  <CompactEmptyState
                    icon={<Bell className="h-4 w-4" />}
                    title="Aucune activité récente"
                    description="Rien de nouveau à signaler depuis la dernière synchronisation."
                  />
                ) : (
                  recentActivities.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="mt-0.5">
                        {getNotificationIcon(notif.kind, notif.severity)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {notif.title || "Événement"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {notif.message || "—"}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span>
                            {notif.locationId
                              ? `Lieu : ${getLocationName(notif.locationId)}`
                              : "Tous les lieux"}
                          </span>
                          <span>{formatRelativeTime(notif.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export { Dashboard };
