export type CronStateRow = {
    key: string;
    value: unknown;
    updated_at: string | null;
};

export type LocationRow = {
    id: string;
    location_title: string | null;
    location_resource_name: string;
};

export type RunRow = {
    id: string;
    started_at: string | null;
    finished_at: string | null;
    duration_ms?: number | null;
    processed: number | null;
    tags_upserted: number | null;
    errors_count: number | null;
    aborted: boolean | null;
    skip_reason: string | null;
    meta?: { location_id?: string | null; debug?: unknown } | null;
};

export type StatusValue = {
    status?: "idle" | "running" | "done" | "error";
    last_run_at?: string;
    aborted?: boolean;
    stats?: { processed?: number; tagsUpserted?: number };
    errors_count?: number;
    last_error?: string | null;
    missing_insights_count?: number;
};
