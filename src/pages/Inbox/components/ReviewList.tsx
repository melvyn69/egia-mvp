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
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { FilterDrawer } from "./FilterDrawer";

type ReviewListProps = Pick<ReturnType<typeof useInboxLogic>["state"],
    | "filteredReviews"
    | "reviewsLoading"
    | "reviewsHasMore"
    | "reviewsLoadingMore"
    | "selectedReviewId"
    | "statusFilter"
    | "highlightReviewId"
    | "draftByReview"
    | "selectedLocation"
    | "datePreset"
    | "sentimentFilter"
    | "ratingMin"
    | "ratingMax"
    | "tagFilter"
    | "locations"
> & Pick<ReturnType<typeof useInboxLogic>["actions"],
    | "setSelectedReviewId"
    | "fetchMoreReviews"
    | "setStatusFilter"
    | "setSelectedLocation"
    | "setDatePreset"
    | "setSentimentFilter"
    | "setRatingMin"
    | "setRatingMax"
    | "setTagFilter"
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
    draftByReview,
    selectedLocation,
    datePreset,
    sentimentFilter,
    ratingMin,
    ratingMax,
    tagFilter,
    locations,
    setSelectedLocation,
    setDatePreset,
    setSentimentFilter,
    setRatingMin,
    setRatingMax,
    setTagFilter
}: ReviewListProps) {
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const statusTabs = [
        { id: "new", label: "Nouveau" },
        { id: "reading", label: "À traiter" },
        { id: "replied", label: "Répondu" },
        { id: "archived", label: "Ignoré" },
        { id: "all", label: "Tout" }
    ] as const;

    // Count active filters (excluding status which is always visible)
    const activeFiltersCount = [
        selectedLocation !== "all",
        datePreset !== "all_time",
        sentimentFilter !== "all",
        ratingMin !== "",
        ratingMax !== "",
        tagFilter !== ""
    ].filter(Boolean).length;

    return (
        <div className="flex h-full flex-col bg-white md:border-r border-slate-200">
            <div className="border-b border-slate-100 p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900">Avis</h2>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsFilterOpen(true)}
                        className={`gap-2 ${activeFiltersCount > 0 ? "border-slate-900 bg-slate-50 text-slate-900" : ""}`}
                    >
                        <SlidersHorizontal size={14} />
                        Filtres
                        {activeFiltersCount > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 py-0 text-[10px]">
                                {activeFiltersCount}
                            </Badge>
                        )}
                    </Button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                    {statusTabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={statusFilter === tab.id ? "default" : "outline"}
                            size="sm"
                            className="rounded-full px-4 text-xs whitespace-nowrap flex-shrink-0"
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
                        {activeFiltersCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-500 hover:text-slate-900 h-auto p-0 underline-offset-4 hover:underline"
                                onClick={() => {
                                    setSelectedLocation("all");
                                    setDatePreset("all_time");
                                    setSentimentFilter("all");
                                    setRatingMin("");
                                    setRatingMax("");
                                    setTagFilter("");
                                }}
                            >
                                Réinitialiser les filtres
                            </Button>
                        )}
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
                                    // Use translate-x-0 to verify horizontal constraints
                                    className={`w-full text-left rounded-xl border p-4 transition-all duration-200 select-none ${isSelected
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
                                                <div className="flex text-amber-400 text-[10px] flex-shrink-0">
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
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                                            {formatDate(review.createdAt)}
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                                        {review.text}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Badge variant={statusVariantMap[safeStatus]} className="text-[10px] h-5 px-1.5">
                                            {statusLabelMap[safeStatus]}
                                        </Badge>
                                        {draftByReview[review.id] && (
                                            <Badge variant="success" className="text-[10px] h-5 px-1.5">Brouillon</Badge>
                                        )}
                                        {review.aiPriority && (
                                            <Badge variant="warning" className="text-[10px] h-5 px-1.5">Prioritaire</Badge>
                                        )}
                                        {safeSentiment && (
                                            <Badge variant={aiSentimentVariantMap[safeSentiment]} className="text-[10px] h-5 px-1.5">
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

            <FilterDrawer
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                state={{
                    selectedLocation,
                    datePreset,
                    sentimentFilter,
                    ratingMin,
                    ratingMax,
                    tagFilter,
                    locations
                }}
                actions={{
                    setSelectedLocation,
                    setDatePreset,
                    setSentimentFilter,
                    setRatingMin,
                    setRatingMax,
                    setTagFilter
                }}
            />
        </div>
    );
}
