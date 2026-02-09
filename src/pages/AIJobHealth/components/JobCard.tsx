import { formatTimestamp, formatDurationSeconds, formatSkipReason } from "../utils";
import type { RunRow } from "../types";
import { Badge } from "../../../components/ui/badge";

interface JobCardProps {
    run: RunRow;
    locationName: string;
    onClick: () => void;
}

export function JobCard({ run, locationName, onClick }: JobCardProps) {
    const isError = (run.errors_count ?? 0) > 0;

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md active:scale-[0.99]"
        >
            <div className="flex items-start justify-between">
                <div className="flex flex-col">
                    <span className="font-semibold text-slate-900 line-clamp-1">
                        {locationName}
                    </span>
                    <span className="text-xs text-slate-500">
                        {formatTimestamp(run.started_at)}
                    </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {run.skip_reason ? (
                        <Badge variant="secondary" className="text-[10px] px-2 h-5">
                            {formatSkipReason(run.skip_reason)}
                        </Badge>
                    ) : isError ? (
                        <Badge variant="destructive" className="text-[10px] px-2 h-5">
                            {run.errors_count} Erreur(s)
                        </Badge>
                    ) : (
                        <Badge variant="success" className="text-[10px] px-2 h-5">
                            Succès
                        </Badge>
                    )}
                    <span className="text-[10px] text-slate-400">
                        {formatDurationSeconds(run.started_at, run.finished_at, run.duration_ms)}
                    </span>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <div>
                    <div className="text-xs text-slate-500">Traité</div>
                    <div className="font-medium text-slate-900">{run.processed ?? 0}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500">Tags</div>
                    <div className="font-medium text-slate-900">{run.tags_upserted ?? 0}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500">Erreurs</div>
                    <div className={`font-medium ${isError ? "text-rose-600" : "text-slate-900"}`}>
                        {run.errors_count ?? 0}
                    </div>
                </div>
            </div>
        </button>
    );
}
