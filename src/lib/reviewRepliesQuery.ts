export const REVIEW_REPLIES_HISTORY_LIMIT = 50;
export const REVIEW_REPLIES_STALE_TIME_MS = 5 * 60 * 1000;
export const REVIEW_REPLIES_MAX_RETRIES = 2;
export const REVIEW_REPLIES_RETRY_DELAY_MS = 100;

export class ReviewRepliesQueryError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ReviewRepliesQueryError";
    this.status = status;
  }
}

export const reviewRepliesQueryKey = (
  userId: string | null,
  reviewId: string | null
) => ["review-replies", userId, reviewId] as const;

export const shouldRetryReviewReplies = (
  failureCount: number,
  error: unknown
): boolean => {
  const status =
    error instanceof ReviewRepliesQueryError ? error.status : null;
  if (status !== null && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < REVIEW_REPLIES_MAX_RETRIES;
};
