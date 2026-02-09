import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
    formatDate,
    statusLabelMap,
    statusVariantMap,
    aiSentimentLabelMap,
    aiSentimentVariantMap,
    toneOptions,
    lengthOptions,
    isAiSentiment
} from "../utils";
import { useInboxLogic } from "../useInboxLogic";
import { ChevronLeft, Wand2, Send, Save } from "lucide-react";

type ReviewDetailProps = Pick<ReturnType<typeof useInboxLogic>["state"],
    | "selectedReview"
    | "tonePreset"
    | "lengthPreset"
    | "replyText"
    | "isGenerating"
    | "generationError"
    | "replyHistory"
    | "draftReplyId"
    | "replySaving"
    | "replySending"
    | "aiSuggestion"
    | "aiSuggestionError"
> & Pick<ReturnType<typeof useInboxLogic>["actions"],
    | "setTonePreset"
    | "setLengthPreset"
    | "setReplyText"
    | "handleGenerate"
    | "handleSend"
    | "handleSave"
    | "setSelectedReviewId"
>;

export function ReviewDetail({
    selectedReview,
    tonePreset,
    lengthPreset,
    replyText,
    isGenerating,
    generationError,
    setTonePreset,
    setLengthPreset,
    setReplyText,
    handleGenerate,
    handleSend,
    handleSave,
    setSelectedReviewId,
    replySaving,
    replySending
}: ReviewDetailProps) {

    if (!selectedReview) {
        return (
            <div className="flex h-full items-center justify-center text-slate-400">
                <div className="text-center">
                    <p>Sélectionnez un avis pour voir les détails.</p>
                </div>
            </div>
        );
    }

    const safeSentiment = isAiSentiment(selectedReview.aiSentiment) ? selectedReview.aiSentiment : null;

    return (
        <div className="flex h-full flex-col bg-slate-50 relative">
            {/* Mobile Header with Back Button */}
            <div className="md:hidden flex items-center p-4 bg-white border-b border-slate-200">
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setSelectedReviewId("")}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="ml-2 font-semibold text-slate-900">Retour</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {/* Review Card */}
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">{selectedReview.authorName}</h3>
                            <p className="text-sm text-slate-500">{selectedReview.locationName}</p>
                        </div>
                        <div className="text-right">
                            <Badge variant={statusVariantMap[selectedReview.status]}>
                                {statusLabelMap[selectedReview.status]}
                            </Badge>
                            <p className="mt-1 text-xs text-slate-400">{formatDate(selectedReview.createdAt)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 text-amber-400">
                        {"★".repeat(Math.min(5, selectedReview.rating))}
                        <span className="text-slate-200">
                            {"★".repeat(5 - Math.min(5, selectedReview.rating))}
                        </span>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl text-slate-700 text-sm italic border border-slate-100">
                        "{selectedReview.text}"
                    </div>

                    {/* AI Insights Section */}
                    {selectedReview.aiStatus === "ready" && (
                        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Sentiment</span>
                                <div className="mt-1">
                                    <Badge variant={safeSentiment ? aiSentimentVariantMap[safeSentiment] : "neutral"}>
                                        {safeSentiment ? aiSentimentLabelMap[safeSentiment] : "Inconnu"}
                                    </Badge>
                                </div>
                            </div>
                            {selectedReview.aiSummary && (
                                <div className="col-span-2">
                                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Résumé IA</span>
                                    <p className="mt-1 text-sm text-slate-600">{selectedReview.aiSummary}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Reply Section */}
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <Wand2 className="h-4 w-4 text-purple-600" />
                            Générateur de réponse
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Ton</label>
                            <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={tonePreset}
                                onChange={(e) => {
                                  const nextTone = toneOptions.find((opt) => opt.id === e.target.value)?.id;
                                  if (nextTone) {
                                    setTonePreset(nextTone);
                                  }
                                }}
                            >
                                {toneOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Longueur</label>
                            <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={lengthPreset}
                                onChange={(e) => {
                                  const nextLength = lengthOptions.find((opt) => opt.id === e.target.value)?.id;
                                  if (nextLength) {
                                    setLengthPreset(nextLength);
                                  }
                                }}
                            >
                                {lengthOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <textarea
                        className="w-full h-40 rounded-xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                        placeholder="La réponse générée apparaîtra ici..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                    />

                    {generationError && (
                        <p className="text-sm text-rose-600">{generationError}</p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 border-none"
                        >
                            {isGenerating ? "Génération..." : <><Wand2 className="mr-2 h-4 w-4" /> Générer</>}
                        </Button>

                        <Button variant="outline" onClick={handleSave} disabled={replySaving}>
                            {replySaving ? "..." : <Save className="h-4 w-4 text-slate-600" />}
                        </Button>

                        <Button
                            variant="default"
                            onClick={handleSend}
                            disabled={replySending || !replyText.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {replySending ? "Envoi..." : <><Send className="mr-2 h-4 w-4" /> Envoyer</>}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
