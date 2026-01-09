export type AnalyticsOverview = {
  scope: {
    preset: string;
    from: string | null;
    to: string | null;
    location_id: string | null;
    location_ids_count: number;
  };
  data_status: "ok" | "empty" | "partial";
  reasons: string[];
  kpis: {
    reviews_total: number;
    reviews_with_text: number;
    avg_rating: number | null;
    negative_share_pct: number | null;
    response_rate_pct: number | null;
    replied_count: number;
    replyable_count: number;
  };
  ratings: { "1": number; "2": number; "3": number; "4": number; "5": number };
  sentiment: null | {
    positive: number;
    neutral: number;
    negative: number;
    positive_pct: number | null;
  };
  topics: {
    strengths: Array<{ label: string; count: number }>;
    irritants: Array<{ label: string; count: number }>;
  };
};

export type AnalyticsTimeseries = {
  granularity: "day" | "week";
  points: Array<{
    date: string;
    review_count: number;
    avg_rating: number | null;
    neg_share: number | null;
    reply_rate: number | null;
  }>;
};

export type AnalyticsDrivers = {
  period: {
    preset: string;
    from: string | null;
    to: string | null;
    location_id: string | null;
  };
  totals: {
    tagged_count: number;
  };
  positives: Array<{
    label: string;
    count: number;
    share_pct: number | null;
    net_sentiment: number;
    delta: number | null;
    delta_pct: number | null;
    source: "ai" | "manual";
    tag_ids?: string[];
  }>;
  irritants: Array<{
    label: string;
    count: number;
    share_pct: number | null;
    net_sentiment: number;
    delta: number | null;
    delta_pct: number | null;
    source: "ai" | "manual";
    tag_ids?: string[];
  }>;
};

export type AnalyticsQuality = {
  reply_rate: number | null;
  avg_reply_delay_hours: number | null;
  sla_24h: number | null;
  replyable_count: number;
  replied_count: number;
  replied_with_time_count: number;
};

export type AnalyticsDrilldown = {
  items: Array<{
    id: string;
    review_id: string | null;
    rating: number | null;
    comment: string | null;
    author_name: string | null;
    create_time: string | null;
    location_id: string | null;
  }>;
  offset: number;
  limit: number;
  has_more: boolean;
};

export type AnalyticsCompare = {
  periodA: { start: string; end: string; label: string };
  periodB: { start: string; end: string; label: string };
  metrics: {
    review_count: {
      a: number;
      b: number;
      delta: number;
      delta_pct: number | null;
    };
    avg_rating: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: null;
    };
    neg_share: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: number | null;
    };
    reply_rate: {
      a: number | null;
      b: number | null;
      delta: number | null;
      delta_pct: number | null;
    };
  };
};

export type AnalyticsInsight = {
  title: string;
  detail: string;
  severity: "good" | "warn" | "bad";
  metric_keys: string[];
};

export type AnalyticsInsights = {
  mode: "ai" | "basic";
  used_ai: boolean;
  insights: AnalyticsInsight[];
};
