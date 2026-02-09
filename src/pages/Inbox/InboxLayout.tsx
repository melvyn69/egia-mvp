import { useInboxLogic } from "./useInboxLogic";
import { ReviewList } from "./components/ReviewList";
import { ReviewDetail } from "./components/ReviewDetail";

export default function InboxLayout() {
    const { state, actions } = useInboxLogic();

    return (
        <div className="flex h-[calc(100vh-offset)] md:h-full overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-200 shadow-sm">
            {/* List Pane */}
            <div
                className={`w-full md:w-[320px] lg:w-[380px] flex-shrink-0 flex-col md:border-r border-slate-200 bg-white ${state.selectedReviewId ? 'hidden md:flex' : 'flex'
                    }`}
            >
                <ReviewList
                    filteredReviews={state.filteredReviews}
                    reviewsLoading={state.reviewsLoading}
                    reviewsHasMore={state.reviewsHasMore}
                    reviewsLoadingMore={state.reviewsLoadingMore}
                    selectedReviewId={state.selectedReviewId}
                    setSelectedReviewId={actions.setSelectedReviewId}
                    statusFilter={state.statusFilter}
                    setStatusFilter={actions.setStatusFilter}
                    fetchMoreReviews={actions.fetchMoreReviews}
                    highlightReviewId={state.highlightReviewId}
                    draftByReview={state.draftByReview}
                />
            </div>

            {/* Detail Pane */}
            <div
                className={`flex-1 min-w-0 flex-col bg-slate-50 ${!state.selectedReviewId ? 'hidden md:flex' : 'flex'
                    }`}
            >
                <ReviewDetail
                    selectedReview={state.selectedReview}
                    tonePreset={state.tonePreset}
                    lengthPreset={state.lengthPreset}
                    replyText={state.replyText}
                    isGenerating={state.isGenerating}
                    generationError={state.generationError}
                    setTonePreset={actions.setTonePreset}
                    setLengthPreset={actions.setLengthPreset}
                    setReplyText={actions.setReplyText}
                    handleGenerate={actions.handleGenerate}
                    handleSend={actions.handleSend}
                    handleSave={actions.handleSave}
                    setSelectedReviewId={actions.setSelectedReviewId}
                    replySaving={state.replySaving}
                    replySending={state.replySending}
                    replyHistory={state.replyHistory}
                    draftReplyId={state.draftReplyId}
                    aiSuggestion={state.aiSuggestion}
                    aiSuggestionError={state.aiSuggestionError}
                />
            </div>
        </div>
    );
}
