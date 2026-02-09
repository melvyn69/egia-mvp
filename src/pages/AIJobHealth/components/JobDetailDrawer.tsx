import { useState } from "react";
import { Drawer } from "../../../components/ui/drawer";
import { Button } from "../../../components/ui/button";
import { Copy, Check } from "lucide-react";
import type { RunRow } from "../types";
import { formatTimestamp, formatDurationSeconds, formatSkipReason } from "../utils";

interface JobDetailDrawerProps {
    run: RunRow | null;
    isOpen: boolean;
    onClose: () => void;
    locationName: string;
}

export function JobDetailDrawer({ run, isOpen, onClose, locationName }: JobDetailDrawerProps) {
    const [copyStatus, setCopyStatus] = useState<string | null>(null);

    if (!run) return null;

    const handleCopyMeta = async () => {
        if (!run.meta) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(run.meta, null, 2));
            setCopyStatus("Copié");
            setTimeout(() => setCopyStatus(null), 1500);
        } catch {
            setCopyStatus("Erreur");
            setTimeout(() => setCopyStatus(null), 1500);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Détails du traitement IA"
            className="max-w-md"
        >
            <div className="space-y-6">
                {/* Header Stats */}
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                    <div>
                        <p className="text-xs text-slate-500">Établissement</p>
                        <p className="font-medium text-slate-900 line-clamp-1">{locationName}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Date</p>
                        <p className="font-medium text-slate-900">{formatTimestamp(run.started_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Durée</p>
                        <p className="font-medium text-slate-900">
                            {formatDurationSeconds(run.started_at, run.finished_at, run.duration_ms)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Statut</p>
                        <p className="font-medium text-slate-900">
                            {run.skip_reason ? formatSkipReason(run.skip_reason) : "Terminé"}
                        </p>
                    </div>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="rounded-lg border border-slate-100 p-3">
                        <div className="text-2xl font-bold text-slate-900">{run.processed ?? 0}</div>
                        <div className="text-xs text-slate-500">Traités</div>
                    </div>
                    <div className="rounded-lg border border-slate-100 p-3">
                        <div className="text-2xl font-bold text-emerald-600">{run.tags_upserted ?? 0}</div>
                        <div className="text-xs text-slate-500">Tags</div>
                    </div>
                    <div className="rounded-lg border border-slate-100 p-3">
                        <div className={`text-2xl font-bold ${(run.errors_count ?? 0) > 0 ? "text-rose-600" : "text-slate-900"}`}>
                            {run.errors_count ?? 0}
                        </div>
                        <div className="text-xs text-slate-500">Erreurs</div>
                    </div>
                </div>

                {/* JSON Meta */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">Métadonnées techniques</h3>
                        <Button variant="ghost" size="sm" onClick={handleCopyMeta} className="h-8 text-xs gap-1">
                            {copyStatus === "Copié" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copyStatus || "Copier JSON"}
                        </Button>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                        <pre className="text-[10px] text-slate-300 font-mono leading-relaxed">
                            {JSON.stringify(run.meta ?? {}, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        </Drawer>
    );
}
