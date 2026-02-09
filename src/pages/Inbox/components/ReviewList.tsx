import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { type StatusFilter } from "../types";
import {
    formatDate,
    statusLabelMap,
    statusVariantMap,
    aiSentimentLabelMap,
    aiSentimentVariantMap,
    isReviewStatus,
    isAiSentiment
} from "../utils";
import { useInboxLogic } from "../useInboxLogic";

type ReviewListProps = Pick<ReturnType<typeof useInboxLogic>["state"],
    | "filteredReviews"
    | "reviewsLoading"
    | "reviewsHasMore"
    | "reviewsLoadingMore"
    | "selectedReviewId"
    | "statusFilter"
    | "highlightReviewId"
    | "draftByReview"
> & Pick<ReturnType<typeof useInboxLogic>["actions"],
    | "setSelectedReviewId"
    | "fetchMoreReviews"
    | "setStatusFilter"
>;

export function ReviewList({
    filteredReviews,
    reviewsLoading,
    reviewsHasMore,
    reviewsLoadingMore,
    selectedReviewId,
    setSelectedReviewId,
    statusFilter,
    setStatusFilter,
    fetchMoreReviews,
    highlightReviewId,
    draftByReview
}: ReviewListProps) {

    const statusTabs = [
        { id: "new", label: "Nouveau" },
        { id: "reading", label: "À traiter" },
        { id: "replied", label: "Répondu" },
        { id: "archived", label: "Ignoré" },
        { id: "all", label: "Tout" }
    ] as const;

    return (
        <div className="flex h-full flex-col bg-white md:border-r border-slate-200">
            <div className="border-b border-slate-100 p-4">
                <h2 className="text-lg font-semibold text-slate-900">Avis</h2>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {statusTabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={statusFilter === tab.id ? "default" : "outline"}
                            size="sm"
                            className="rounded-full px-4 text-xs"
                            onClick={() => setStatusFilter(tab.id as StatusFilter)}
                        >
                            {tab.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {reviewsLoading && filteredReviews.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                        Chargement...
                    </div>
                ) : filteredReviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                        <p>Aucun avis trouvé.</p>
                    </div>
                ) : (
                    <>
                        {filteredReviews.map((review) => {
                            const safeStatus = isReviewStatus(review.status) ? review.status : "new";
                            const safeSentiment = isAiSentiment(review.aiSentiment) ? review.aiSentiment : null;
                            const isSelected = selectedReviewId === review.id;

                            return (
                                <button
                                    key={review.id}
                                    onClick={() => setSelectedReviewId(review.id)}
                                    className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${isSelected
                                            ? "bg-slate-50 border-slate-400 ring-1 ring-slate-400"
                                            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                                        } ${highlightReviewId === review.id ? "ring-2 ring-emerald-400 ring-offset-2" : ""
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900 truncate">
                                                    {review.authorName}
                                                </span>
                                                <div className="flex text-amber-400 text-[10px]">
                                                    {"★".repeat(Math.min(5, review.rating))}
                                                    <span className="text-slate-200">
                                                        {"★".repeat(5 - Math.min(5, review.rating))}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">
                                                {review.locationName}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                            {formatDate(review.createdAt)}
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                                        {review.text}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Badge variant={statusVariantMap[safeStatus]}>
                                            {statusLabelMap[safeStatus]}
                                        </Badge>
                                        {draftByReview[review.id] && (
                                            <Badge variant="success">Brouillon</Badge>
                                        )}
                                        {review.aiPriority && (
                                            <Badge variant="warning">Prioritaire</Badge>
                                        )}
                                        {safeSentiment && (
                                            <Badge variant={aiSentimentVariantMap[safeSentiment]}>
                                                {aiSentimentLabelMap[safeSentiment]}
                                            </Badge>
                                        )}
                                    </div>
                                </button>
                            );
                        })}

                        {reviewsHasMore && (
                            <div className="pt-4 pb-8 flex justify-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => fetchMoreReviews()}
                                    disabled={reviewsLoadingMore}
                                >
                                    {reviewsLoadingMore ? "Chargement..." : "Charger plus"}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
