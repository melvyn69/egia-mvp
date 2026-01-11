import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  MapPin,
  MessageSquare,
  RefreshCw
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
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
import { mockGoogleConnected } from "../mock/mockData";
import { supabase } from "../lib/supabase";

type DashboardProps = {
  session: Session | null;
  googleConnected: boolean | null;
  onConnect: () => void;
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
  googleConnected,
  onConnect,
  onSyncLocations,
  syncDisabled = false,
  locations,
  locationsLoading,
  locationsError,
  syncing
}: DashboardProps) => {
  const connectedStatus = googleConnected ?? mockGoogleConnected;
  const greeting = getGreeting();
  const firstName = getFirstName(session);
  const greetingText = firstName ? `${greeting}, ${firstName}` : `${greeting}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const prevGoogleConnectedRef = useRef<boolean | null>(googleConnected);
  const prevSyncingRef = useRef<boolean>(syncing);
  const prevLocationsErrorRef = useRef<string | null>(locationsError);
  const didMountRef = useRef(false);

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
  >("this_month");
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

  const kpiQuery = useQuery({
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
    enabled: Boolean(session?.access_token),
    placeholderData: (prev) => prev
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
    if (!didMountRef.current) {
      didMountRef.current = true;
      prevGoogleConnectedRef.current = googleConnected;
      return;
    }

    prevGoogleConnectedRef.current = googleConnected;
  }, [googleConnected]);

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

  const connectionStatusText = connectedStatus
    ? locationsError
      ? "Synchronisation en erreur."
      : syncing
        ? "Synchronisation en cours."
        : "Synchronisation active."
    : "Aucune connexion active.";

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{greetingText}</h2>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Lieu
            </label>
            <select
              className="mt-1 w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Période
            </label>
            <select
              className="mt-1 w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={kpiFrom}
                onChange={(event) => setKpiFrom(event.target.value)}
              />
              <input
                type="date"
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={kpiTo}
                onChange={(event) => setKpiTo(event.target.value)}
              />
            </div>
          )}
          {kpiError && (
            <span className="text-xs text-amber-700">{kpiError}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["kpi-summary"] });
              void queryClient.invalidateQueries({ queryKey: ["ai-kpis"] });
            }}
          >
            Rafraîchir
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Période: {getPresetLabel(kpiPreset)}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-500">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-semibold text-slate-900">
                    {formatKpiValue(kpi.value)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatKpiValue(kpi.caption)}
                  </p>
                </div>
                <Badge variant="neutral">
                  {kpiLoading ? "..." : " "}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          Tags dominants:{" "}
          {kpiData?.top_tags?.length
            ? kpiData.top_tags
                .map((tag) => `${tag.tag} (${tag.count})`)
                .join(", ")
            : "—"}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Analyse IA</h3>
          {aiKpiError && (
            <span className="text-xs text-amber-700">{aiKpiError}</span>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Répartition des sentiments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {aiKpiLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : aiSamples === 0 ? (
                <p className="text-xs text-slate-500">Analyse en cours.</p>
              ) : (
                <>
                  <p>Positif: {formatPercent(aiKpiData?.sentiment.positivePct ?? null)}</p>
                  <p>Neutre: {formatPercent(aiKpiData?.sentiment.neutralPct ?? null)}</p>
                  <p>Négatif: {formatPercent(aiKpiData?.sentiment.negativePct ?? null)}</p>
                  <p>Mixte: {formatPercent(aiKpiData?.sentiment.mixedPct ?? null)}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Score moyen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">
                {aiKpiLoading ? "…" : formatScore(aiKpiData?.avgScore ?? null)}
              </p>
              <p className="text-xs text-slate-500">
                {aiSamples === 0 ? "Analyse en cours." : `Sur ${aiSamples} avis`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Avis analysés
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">
                {aiKpiLoading ? "…" : formatCount(aiSamples)}
              </p>
              <p className="text-xs text-slate-500">
                {aiSamples === 0 ? "Analyse en cours." : "Sur la période"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Avis critiques
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">
                {aiKpiLoading ? "…" : formatCount(aiKpiData?.priorityCount ?? null)}
              </p>
              <p className="text-xs text-slate-500">
                {aiSamples === 0 ? "Analyse en cours." : "À traiter en priorité"}
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Top 5 tags IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {aiKpiLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : aiKpiData?.topTags.length ? (
                <ul className="space-y-1">
                  {aiKpiData.topTags.map((tag) => (
                    <li key={tag.tag} className="flex items-center justify-between">
                      <span>{tag.tag}</span>
                      <span className="text-xs text-slate-500">
                        {tag.count}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Aucun tag détecté.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Évolution 30 jours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {aiKpiLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : aiTrend.length === 0 ? (
                <p className="text-xs text-slate-500">Analyse en cours.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-auto pr-2 text-xs">
                  {aiTrend.map((point) => (
                    <div
                      key={point.date}
                      className="flex items-center justify-between"
                    >
                      <span>{point.date}</span>
                      <span className="text-slate-500">
                        Score {formatScore(point.avgScore)} · {point.samples} avis ·{" "}
                        {point.criticalCount} critiques
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Statut Google Business Profile</CardTitle>
            <p className="text-sm text-slate-500">
              Liez vos etablissements pour synchroniser avis, photos et
              messages.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {googleConnected === null ? (
                <Skeleton className="h-8 w-40" />
              ) : (
                <Badge variant={connectedStatus ? "success" : "warning"}>
                  {connectedStatus ? "Google connecte" : "Connexion requise"}
                </Badge>
              )}
              <p className="text-sm text-slate-600">
                {connectionStatusText}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onConnect}>
                {connectedStatus ? "Reconnecter Google" : "Connecter Google"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="locations-section">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">
            Lieux connectes
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={saveActiveLocations}
              disabled={activeLocationsSaving || locationsLoading}
            >
              {activeLocationsSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              onClick={onSyncLocations}
              disabled={syncing || syncDisabled}
            >
              {syncing ? "Synchronisation..." : "Synchroniser les lieux"}
            </Button>
          </div>
        </div>
        {locationsError && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {locationsError}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {locationsLoading &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="space-y-3 pt-6">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          {!locationsLoading && locations.length === 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-slate-500">
                <p>Aucun lieu synchronise pour le moment.</p>
                <p>Utilisez le bouton de synchronisation pour charger vos lieux.</p>
              </CardContent>
            </Card>
          )}
          {!locationsLoading &&
            locations.map((location) => (
              <Card key={location.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {location.location_title ??
                        location.location_resource_name}
                    </p>
                    {location.phone && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                        <MapPin size={14} />
                        {location.phone}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <label className="flex items-center justify-end gap-2 text-sm font-semibold text-slate-900">
                      <input
                        type="checkbox"
                        checked={selectedActiveIds.includes(location.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedActiveIds((prev) =>
                            checked
                              ? [...prev, location.id]
                              : prev.filter((id) => id !== location.id)
                          );
                        }}
                      />
                      {selectedActiveIds.includes(location.id) ? "Actif" : "Inactif"}
                    </label>
                    {location.website_uri && (
                      <p className="text-xs text-slate-500">
                        {location.website_uri}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>À traiter maintenant</CardTitle>
            <p className="text-sm text-slate-500">
              Les actions prioritaires du moment.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {urgentActionsCount === 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  Tout est sous contrôle.
                </p>
                <p className="text-xs text-slate-500">
                  Aucun avis urgent à traiter.
                </p>
              </div>
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
            <Button onClick={handleOpenInbox}>Aller à la boîte de réception</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activité récente</CardTitle>
            <p className="text-sm text-slate-500">
              Derniers événements utiles (max 5).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune activité récente.</p>
            ) : (
              recentActivities.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
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
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
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
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export { Dashboard };
