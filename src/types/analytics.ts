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
