import { Button } from "../../../components/ui/button";
import { Drawer } from "../../../components/ui/drawer";
import { useInboxLogic } from "../useInboxLogic";

type FilterDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
    state: Pick<ReturnType<typeof useInboxLogic>["state"],
        | "selectedLocation"
        | "datePreset"
        | "sentimentFilter"
        | "ratingMin"
        | "ratingMax"
        | "tagFilter"
        | "locations"
    >;
    actions: Pick<ReturnType<typeof useInboxLogic>["actions"],
        | "setSelectedLocation"
        | "setDatePreset"
        | "setSentimentFilter"
        | "setRatingMin"
        | "setRatingMax"
        | "setTagFilter"
    >;
};

export function FilterDrawer({ isOpen, onClose, state, actions }: FilterDrawerProps) {

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Filtres"
        >
            <div className="space-y-6 pb-20">
                {/* Locations */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Lieu</label>
                    <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={state.selectedLocation}
                        onChange={(e) => actions.setSelectedLocation(e.target.value)}
                    >
                        {state.locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                                {loc.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Period */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Période</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: "all_time", label: "Tout le temps" },
                            { id: "this_week", label: "Cette semaine" },
                            { id: "this_month", label: "Ce mois" },
                            { id: "this_quarter", label: "Ce trimestre" },
                            { id: "this_year", label: "Cette année" },
                        ].map((preset) => (
                            <button
                                key={preset.id}
                                onClick={() => actions.setDatePreset(preset.id as any)}
                                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${state.datePreset === preset.id
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                                    }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sentiment */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Sentiment IA</label>
                    <div className="flex gap-2">
                        {[
                            { id: "all", label: "Tous" },
                            { id: "positive", label: "Positif" },
                            { id: "neutral", label: "Neutre" },
                            { id: "negative", label: "Négatif" },
                        ].map((sent) => (
                            <button
                                key={sent.id}
                                onClick={() => actions.setSentimentFilter(sent.id as any)}
                                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${state.sentimentFilter === sent.id
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                                    }`}
                            >
                                {sent.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rating */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Note étoiles</label>
                    <div className="flex items-center gap-4">
                        <select
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={state.ratingMin}
                            onChange={(e) => actions.setRatingMin(e.target.value)}
                        >
                            <option value="">Min</option>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                        </select>
                        <span className="text-slate-400">à</span>
                        <select
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={state.ratingMax}
                            onChange={(e) => actions.setRatingMax(e.target.value)}
                        >
                            <option value="">Max</option>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                        </select>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-4 flex gap-3">
                    <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                            actions.setSelectedLocation("all");
                            actions.setDatePreset("all_time");
                            actions.setSentimentFilter("all");
                            actions.setRatingMin("");
                            actions.setRatingMax("");
                            actions.setTagFilter("");
                        }}
                    >
                        Réinitialiser
                    </Button>
                    <Button className="flex-1" onClick={onClose}>
                        Voir les résultats
                    </Button>
                </div>
            </div>
        </Drawer>
    );
}
