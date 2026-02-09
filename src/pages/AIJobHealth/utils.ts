export const statusStyles: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-700",
    running: "bg-amber-100 text-amber-700",
    error: "bg-rose-100 text-rose-700",
    idle: "bg-slate-100 text-slate-600"
};

export const formatTimestamp = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
};

export const formatDurationSeconds = (
    startedAt?: string | null,
    finishedAt?: string | null,
    durationMs?: number | null
) => {
    if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
        return `${Math.round(durationMs / 1000)}s`;
    }
    if (!startedAt || !finishedAt) return "—";
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return "—";
    }
    return `${Math.round((end - start) / 1000)}s`;
};

export const formatSkipReason = (value?: string | null) => {
    if (!value) return "—";
    if (value === "no_candidates") return "Aucune tâche";
    if (value === "locked") return "Verrouillé";
    return value;
};
