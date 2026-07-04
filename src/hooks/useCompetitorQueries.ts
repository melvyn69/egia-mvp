import { useQuery } from "@tanstack/react-query";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import { supabase } from "../lib/supabase";

export type LocationOption = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
  address_json?: unknown | null;
};

export type CompetitorRow = {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  distance_m: number | null;
  rating: number | null;
  user_ratings_total: number | null;
  is_followed: boolean;
  location_id: string | null;
  years_active?: number | null;
};

export type SettingsRow = {
  competitive_monitoring_enabled?: boolean | null;
  competitive_monitoring_keyword?: string | null;
  competitive_monitoring_radius_km?: number | null;
};

export type BenchmarkPayload = {
  stats?: Record<string, number | null | undefined>;
  keyword?: string | null;
  top_competitors?: Array<{
    name?: string | null;
    rating?: number | null;
    reviews?: number | null;
    user_ratings_total?: number | null;
    distance_m?: number | null;
  }>;
  swot?: Record<string, string[] | undefined>;
  plan_14_days?: string[];
  radius_km?: number | null;
  location_id?: string | null;
};

export type BenchmarkHistoryRow = {
  id: string;
  created_at: string | null;
  summary?: string | null;
  payload?: BenchmarkPayload | null;
};

export type CompetitorSelfStats = {
  avg: number | null;
  count: number | null;
};

type CompetitorQueryScope = {
  workspaceId: string | null;
  userId: string | null;
};

type CompetitorLocationScope = CompetitorQueryScope & {
  locationId: string | null;
};

type CompetitorApiQueryScope = CompetitorLocationScope & {
  token: string | null;
};

const COMPETITOR_HISTORY_LIMIT = 8;

const competitorQueryOptions = {
  staleTime: 5 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false
} as const;

const competitorScopeKey = ({ workspaceId }: CompetitorQueryScope) => ({
  workspaceId
});

const competitorFilterKey = ({
  locationId,
  mode
}: {
  locationId: string | null;
  mode: "radar" | "followed" | "self";
}) => ({
  locationId,
  mode
});

export const competitorsLocationsQueryKey = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  [
    "competitors-locations",
    userId,
    competitorScopeKey({ workspaceId, userId })
  ] as const;

export const competitorsSettingsQueryKey = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  [
    "competitors-settings",
    userId,
    competitorScopeKey({ workspaceId, userId })
  ] as const;

export const competitorsRadarQueryKey = ({
  workspaceId,
  userId,
  locationId
}: CompetitorLocationScope) =>
  [
    "competitors-radar",
    userId,
    locationId,
    competitorScopeKey({ workspaceId, userId }),
    competitorFilterKey({ locationId, mode: "radar" })
  ] as const;

export const competitorsFollowedQueryKey = ({
  workspaceId,
  userId,
  locationId
}: CompetitorLocationScope) =>
  [
    "competitors-followed",
    userId,
    locationId,
    competitorScopeKey({ workspaceId, userId }),
    competitorFilterKey({ locationId, mode: "followed" })
  ] as const;

export const competitorsSelfQueryKey = ({
  workspaceId,
  userId,
  locationId
}: CompetitorLocationScope) =>
  [
    "competitors-self",
    userId,
    locationId,
    competitorScopeKey({ workspaceId, userId }),
    competitorFilterKey({ locationId, mode: "self" })
  ] as const;

export const competitorsBenchmarkHistoryQueryKey = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  [
    "competitors-benchmark-history",
    userId,
    competitorScopeKey({ workspaceId, userId }),
    { reportType: "competitors_benchmark", limit: COMPETITOR_HISTORY_LIMIT }
  ] as const;

export const useCompetitorLocations = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  useQuery<LocationOption[]>({
    queryKey: competitorsLocationsQueryKey({ workspaceId, userId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!userId) return [];
          const { data, error } = await supabase
            .from("google_locations")
            .select("id, location_title, location_resource_name, address_json")
            .eq("user_id", userId)
            .order("location_title", { ascending: true });
          if (error) throw error;
          return (data ?? []) as LocationOption[];
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });

export const useCompetitorSettings = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  useQuery<SettingsRow | null>({
    queryKey: competitorsSettingsQueryKey({ workspaceId, userId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!userId) return null;
          const { data, error } = await supabase
            .from("business_settings")
            .select(
              "competitive_monitoring_enabled, competitive_monitoring_keyword, competitive_monitoring_radius_km"
            )
            .eq("user_id", userId)
            .maybeSingle();
          if (error) throw error;
          return (data ?? null) as SettingsRow | null;
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });

export const useCompetitorRadar = ({
  workspaceId,
  userId,
  token,
  locationId
}: CompetitorApiQueryScope) =>
  useQuery<CompetitorRow[]>({
    queryKey: competitorsRadarQueryKey({ workspaceId, userId, locationId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!token || !locationId) return [];
          const response = await fetch("/api/reports/competitors", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              action: "list",
              location_id: locationId,
              mode: "radar"
            })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.items) {
            throw new Error("Failed to load competitors");
          }
          return payload.items as CompetitorRow[];
        }
      }),
    enabled: Boolean(token && locationId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });

export const useFollowedCompetitors = ({
  workspaceId,
  userId,
  token,
  locationId
}: CompetitorApiQueryScope) =>
  useQuery<CompetitorRow[]>({
    queryKey: competitorsFollowedQueryKey({ workspaceId, userId, locationId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!token || !locationId) return [];
          const response = await fetch("/api/reports/competitors", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              action: "list",
              location_id: locationId,
              mode: "followed"
            })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.items) {
            throw new Error("Failed to load competitors");
          }
          return payload.items as CompetitorRow[];
        }
      }),
    enabled: Boolean(token && locationId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });

export const useCompetitorSelfStats = ({
  workspaceId,
  userId,
  token,
  locationId
}: CompetitorApiQueryScope) =>
  useQuery<CompetitorSelfStats | null>({
    queryKey: competitorsSelfQueryKey({ workspaceId, userId, locationId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!token || !locationId) return null;
          const response = await fetch("/api/reports/competitors", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "self", location_id: locationId })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.self) {
            return { avg: null, count: null };
          }
          const rating =
            typeof payload.self.rating === "number" ? payload.self.rating : null;
          const reviewCount =
            typeof payload.self.review_count === "number"
              ? payload.self.review_count
              : null;
          return { avg: rating, count: reviewCount };
        }
      }),
    enabled: Boolean(token && locationId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });

export const useCompetitorBenchmarkHistory = ({
  workspaceId,
  userId
}: CompetitorQueryScope) =>
  useQuery<BenchmarkHistoryRow[]>({
    queryKey: competitorsBenchmarkHistoryQueryKey({ workspaceId, userId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Competitors",
        queryKey,
        queryFn: async () => {
          if (!userId) return [];
          const { data, error } = await supabase
            .from("generated_reports")
            .select("id, created_at, summary, payload")
            .eq("report_type", "competitors_benchmark")
            .order("created_at", { ascending: false })
            .limit(COMPETITOR_HISTORY_LIMIT);
          if (error) throw error;
          return (data ?? []) as unknown as BenchmarkHistoryRow[];
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev,
    ...competitorQueryOptions
  });
