import type { LucideIcon } from "lucide-react";

export type TrendState = "up" | "down" | "stable" | "none";
export type MetricKey = "reviews" | "avg_rating" | "neg_share" | "reply_rate";
export type KpiPanelKey =
  | "reviews"
  | "avg_rating"
  | "reply_rate"
  | "reply_delay"
  | "neg_share"
  | "sentiment";
export type DecisionLevel = "high" | "watch" | "ok";

export type AnalyticsPoint = {
  date: string;
  review_count: number;
  avg_rating: number | null;
  neg_share: number | null;
  reply_rate: number | null;
};

export type DecisionItem = {
  id: string;
  level: DecisionLevel;
  title: string;
  action: string;
  evidence: string;
  reason: string;
  consequence: string;
};

export type AssistantListItem = {
  id: string;
  title: string;
  detail: string;
  action?: string;
};

export type TodayBriefMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  Icon: LucideIcon;
  tone: "neutral" | "good" | "warn";
};

export type TodayTask = {
  id: string;
  title: string;
  detail: string;
  action?: string;
  path?: string;
  tone: "neutral" | "good" | "warn";
};

export type MultiLocationInsightCard = {
  id: string;
  title: string;
  detail: string;
  Icon: LucideIcon;
};

export type AnalyticsTopic = {
  id: string;
  label: string;
  count: number;
  share_pct: number | null;
  net_sentiment: number | null;
  delta: number | null;
  delta_pct: number | null;
  source?: "ai" | "manual";
  tag_ids?: string[];
  tone: "positive" | "negative" | "neutral";
};

export type AiSkillCard = {
  id: string;
  title: string;
  badge: string;
  Icon: LucideIcon;
  tone: "dark" | "good" | "warn" | "neutral";
  status: "active" | "empty" | "soon";
  items: Array<{ label: string; detail?: string }>;
  emptyLabel: string;
};

export type AnalyticsSentiment = {
  positive: number;
  neutral: number;
  negative: number;
  positive_pct: number | null;
};
