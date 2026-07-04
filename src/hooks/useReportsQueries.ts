import { useQuery } from "@tanstack/react-query";
import type { Database } from "../database.types";
import { getActiveLegalEntityLogo } from "../lib/businessBranding";
import { instrumentQueryFetch } from "../lib/fetchInstrumentation";
import { supabase } from "../lib/supabase";

export type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
export type GeneratedReportRow =
  Database["public"]["Tables"]["generated_reports"]["Row"];

export type ReportsBranding = {
  logoUrl: string | null;
  companyName: string | null;
  legalName: string | null;
};

type ReportsQueryScope = {
  workspaceId: string | null;
  accountId: string | null;
  userId: string | null;
};

const REPORTS_SELECT =
  "id,user_id,name,locations,period_preset,from_date,to_date,timezone,status,storage_path,last_generated_at,schedule_enabled,schedule_rrule,recipients,notes,created_at,updated_at,render_mode" as const;

const GENERATED_REPORTS_SELECT =
  "id,user_id,report_type,location_id,title,summary,payload,created_at" as const;

const scopeKey = ({ workspaceId, accountId }: ReportsQueryScope) => ({
  workspaceId,
  accountId
});

export const reportsBrandingQueryKey = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  [
    "report-branding",
    userId,
    scopeKey({ workspaceId, accountId, userId })
  ] as const;

export const reportsQueryKey = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  ["reports", userId, scopeKey({ workspaceId, accountId, userId })] as const;

export const competitorBenchmarkReportsQueryKey = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  [
    "generated-reports",
    userId,
    "competitors_benchmark",
    scopeKey({ workspaceId, accountId, userId })
  ] as const;

export const useReportsBranding = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  useQuery<ReportsBranding>({
    queryKey: reportsBrandingQueryKey({ workspaceId, accountId, userId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Reports",
        queryKey,
        queryFn: async () => {
          if (!userId) {
            return {
              logoUrl: null,
              companyName: null,
              legalName: null
            };
          }
          const branding = await getActiveLegalEntityLogo(userId);
          return {
            logoUrl: branding.logoUrl,
            companyName: branding.companyName,
            legalName: branding.legalName
          };
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

export const useReports = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  useQuery<ReportRow[]>({
    queryKey: reportsQueryKey({ workspaceId, accountId, userId }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Reports",
        queryKey,
        queryFn: async () => {
          if (!userId) {
            return [];
          }
          const { data, error } = await supabase
            .from("reports")
            .select(REPORTS_SELECT)
            .order("created_at", { ascending: false });
          if (error) {
            throw error;
          }
          return (data ?? []) as ReportRow[];
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });

export const useCompetitorBenchmarkReports = ({
  workspaceId,
  accountId,
  userId
}: ReportsQueryScope) =>
  useQuery<GeneratedReportRow[]>({
    queryKey: competitorBenchmarkReportsQueryKey({
      workspaceId,
      accountId,
      userId
    }),
    queryFn: ({ queryKey }) =>
      instrumentQueryFetch({
        page: "Reports",
        queryKey,
        queryFn: async () => {
          if (!userId) {
            return [];
          }
          const { data, error } = await supabase
            .from("generated_reports")
            .select(GENERATED_REPORTS_SELECT)
            .eq("report_type", "competitors_benchmark")
            .order("created_at", { ascending: false });
          if (error) {
            throw error;
          }
          return (data ?? []) as GeneratedReportRow[];
        }
      }),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev
  });
