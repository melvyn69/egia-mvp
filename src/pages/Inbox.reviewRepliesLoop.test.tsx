// @vitest-environment jsdom

import { StrictMode } from "react";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  type RenderResult
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_REPLIES_HISTORY_LIMIT,
  REVIEW_REPLIES_MAX_RETRIES,
  ReviewRepliesQueryError,
  shouldRetryReviewReplies
} from "../lib/reviewRepliesQuery";

type MockReply = {
  id: string;
  review_id: string;
  reply_text: string;
  status: "draft" | "sent";
  created_at: string;
  sent_at: string | null;
};

type MockResponse = {
  data: MockReply[] | null;
  error: { message: string } | null;
  status: number;
};

const supabaseHarness = vi.hoisted(() => {
  type QuerySnapshot = {
    columns: string;
    eq: Array<[string, unknown]>;
    in: Array<[string, unknown[]]>;
    limit: number | null;
  };

  const state = {
    historyCalls: [] as QuerySnapshot[],
    historyResponses: [] as Array<{
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
      status: number;
    }>,
    mutationCount: 0,
    channelCount: 0,
    reviewRows: [] as Array<Record<string, unknown>>
  };

  const defaultHistoryResponse = () => ({
    data: [] as Array<Record<string, unknown>>,
    error: null,
    status: 200
  });

  class Builder {
    private readonly table: string;
    private operation: "select" | "insert" | "update" | null = null;
    private columns = "";
    private eqFilters: Array<[string, unknown]> = [];
    private inFilters: Array<[string, unknown[]]> = [];
    private rowLimit: number | null = null;
    private values: Record<string, unknown> | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select(columns: string) {
      this.operation ??= "select";
      this.columns = columns;
      return this;
    }

    insert(values: Record<string, unknown>) {
      this.operation = "insert";
      this.values = values;
      return this;
    }

    update(values: Record<string, unknown>) {
      this.operation = "update";
      this.values = values;
      return this;
    }

    eq(column: string, value: unknown) {
      this.eqFilters.push([column, value]);
      return this;
    }

    is() {
      return this;
    }

    neq() {
      return this;
    }

    not() {
      return this;
    }

    or() {
      return this;
    }

    gte() {
      return this;
    }

    lte() {
      return this;
    }

    filter() {
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilters.push([column, values]);
      return this;
    }

    order() {
      return this;
    }

    limit(value: number) {
      this.rowLimit = value;
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.execute(true));
    }

    single() {
      return Promise.resolve(this.execute(true));
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
    }

    private execute(single: boolean) {
      if (this.table === "review_replies") {
        if (this.operation === "select" && !this.values) {
          state.historyCalls.push({
            columns: this.columns,
            eq: this.eqFilters,
            in: this.inFilters,
            limit: this.rowLimit
          });
          return state.historyResponses.shift() ?? defaultHistoryResponse();
        }
        state.mutationCount += 1;
        if (this.operation === "insert" && single) {
          const now = "2026-07-22T12:00:00.000Z";
          return {
            data: {
              id: "draft-created",
              review_id: String(this.values?.review_id ?? "review-1"),
              reply_text: String(this.values?.reply_text ?? ""),
              status: "draft",
              created_at: now,
              sent_at: null
            },
            error: null,
            status: 201
          };
        }
        return { data: null, error: null, status: 204 };
      }

      if (this.table === "google_locations") {
        return single
          ? { data: null, error: null, status: 200 }
          : {
              data: [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  location_resource_name: "locations/1",
                  location_title: "Paris"
                }
              ],
              error: null,
              status: 200
            };
      }
      if (this.table === "cron_state" || this.table === "business_settings") {
        return { data: null, error: null, status: 200 };
      }
      if (this.table === "business_memory" || this.table === "google_reviews") {
        return { data: [], error: null, status: 200 };
      }
      if (this.table === "review_ai_replies") {
        return { data: null, error: null, status: 200 };
      }
      return { data: single ? null : [], error: null, status: 200 };
    }
  }

  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: "mock-access-token",
            expires_at: 4_102_444_800,
            user: { id: "user-1", email: "owner@example.com" }
          }
        },
        error: null
      }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null })
    },
    from: (table: string) => new Builder(table),
    channel: () => {
      state.channelCount += 1;
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
        unsubscribe() {
          return Promise.resolve();
        }
      };
    }
  };

  const reset = () => {
    state.historyCalls = [];
    state.historyResponses = [];
    state.mutationCount = 0;
    state.channelCount = 0;
    state.reviewRows = [
      {
        id: "review-1",
        review_id: "google-1",
        location_id: "locations/1",
        author_name: "Alice",
        rating: 5,
        comment: "Excellent",
        create_time: "2026-07-20T10:00:00.000Z",
        update_time: "2026-07-20T10:00:00.000Z",
        status: "new",
        has_draft: false,
        has_job_inflight: false,
        is_eligible_to_generate: true
      },
      {
        id: "review-2",
        review_id: "google-2",
        location_id: "locations/1",
        author_name: "Bob",
        rating: 4,
        comment: "Très bien",
        create_time: "2026-07-19T10:00:00.000Z",
        update_time: "2026-07-19T10:00:00.000Z",
        status: "new",
        has_draft: false,
        has_job_inflight: false,
        is_eligible_to_generate: true
      }
    ];
  };

  reset();
  return { client, reset, state };
});

// One initial history GET is legitimate. With no review change or mutation,
// 100 rerenders and 60 idle seconds must keep the total at this strict bound.
const INBOX_IDLE_HISTORY_GET_THRESHOLD = 1;

vi.mock("../lib/supabase", () => ({
  supabase: supabaseHarness.client,
  supabaseUrl: "https://mock.supabase.co",
  supabaseAnonKey: "mock-anon-key"
}));

import { Inbox } from "./Inbox";

const makeReply = (reviewId: string, status: "draft" | "sent" = "draft"): MockReply => ({
  id: `${reviewId}-${status}`,
  review_id: reviewId,
  reply_text: `Réponse ${reviewId}`,
  status,
  created_at: "2026-07-22T10:00:00.000Z",
  sent_at: status === "sent" ? "2026-07-22T10:01:00.000Z" : null
});

const flush = async (turns = 8) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false }
    }
  });

const renderInbox = async (strict = false, waitForHistory = true) => {
  const queryClient = createQueryClient();
  const makeElement = (tick = 0) => {
    const content = (
      <QueryClientProvider client={queryClient}>
        <div data-render-tick={tick}>
          <Inbox />
        </div>
      </QueryClientProvider>
    );
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
  const element = makeElement();
  const renderer = render(element);
  await act(async () => {
    await flush();
  });
  if (waitForHistory) {
    await waitFor(() => {
      expect(supabaseHarness.state.historyCalls.length).toBeGreaterThanOrEqual(1);
    });
  }
  return { queryClient, renderer, makeElement };
};

const unmountInbox = async (renderer: RenderResult) => {
  await act(async () => {
    renderer.unmount();
  });
};

const historyResponse = (data: MockReply[] = [], status = 200): MockResponse => ({
  data,
  error: status >= 400 ? { message: `HTTP ${status}` } : null,
  status
});

beforeEach(() => {
  supabaseHarness.reset();
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  window.history.replaceState({}, "", "/inbox");
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("action=status")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ import: { status: "idle" }, ai: { status: "idle" } })
      } as Response;
    }
    if (url.startsWith("/api/reviews?")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: supabaseHarness.state.reviewRows, nextCursor: null, total: 2 })
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("Inbox review_replies request bound", () => {
  it("does not query review_replies when no review is selected", async () => {
    supabaseHarness.state.reviewRows = [];
    const { renderer } = await renderInbox(false, false);
    await act(async () => {
      await flush();
    });
    expect(supabaseHarness.state.historyCalls).toHaveLength(0);
    await unmountInbox(renderer);
  });

  it("loads the selected review once with explicit tenant/review filters and a hard limit", async () => {
    supabaseHarness.state.historyResponses.push(historyResponse([makeReply("review-1")]));
    const { renderer } = await renderInbox();

    expect(supabaseHarness.state.historyCalls).toHaveLength(1);
    const call = supabaseHarness.state.historyCalls[0];
    expect(call.columns).toBe("id, review_id, reply_text, status, created_at, sent_at");
    expect(call.eq).toContainEqual(["user_id", "user-1"]);
    expect(call.in).toContainEqual(["review_id", ["review-1", "google-1"]]);
    expect(call.limit).toBe(REVIEW_REPLIES_HISTORY_LIMIT);

    await unmountInbox(renderer);
  });

  it("does not refetch for 100 rerenders, cache projection, reply text, tab, focus, reconnect or inactivity", async () => {
    supabaseHarness.state.historyResponses.push(historyResponse([makeReply("review-1")]));
    const { renderer, makeElement, queryClient } = await renderInbox();
    const baseline = supabaseHarness.state.historyCalls.length;

    await act(async () => {
      for (let index = 0; index < 100; index += 1) {
        renderer.rerender(makeElement(index + 1));
      }
      queryClient.setQueryData(["review-replies", "user-1", "review-1"], [
        makeReply("review-1")
      ]);
      fireEvent.change(
        renderer.container.querySelector("#reply-editor") as HTMLTextAreaElement,
        { target: { value: "Texte modifié" } }
      );
      fireEvent.click(renderer.getByRole("button", { name: "Activité" }));
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await flush();
    });

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    expect(supabaseHarness.state.historyCalls.length).toBeLessThanOrEqual(
      INBOX_IDLE_HISTORY_GET_THRESHOLD
    );
    expect(supabaseHarness.state.historyCalls).toHaveLength(baseline);
    expect(supabaseHarness.state.channelCount).toBe(0);
    await unmountInbox(renderer);
  });

  it("loads exactly once for a new review and reuses the fresh cache when returning", async () => {
    supabaseHarness.state.historyResponses.push(
      historyResponse([]),
      historyResponse([makeReply("review-2")])
    );
    const { renderer } = await renderInbox();
    expect(supabaseHarness.state.historyCalls).toHaveLength(1);

    await act(async () => {
      fireEvent.click(
        renderer.container.querySelector("#review-review-2") as HTMLElement
      );
      await flush();
    });
    await waitFor(() => {
      expect(supabaseHarness.state.historyCalls).toHaveLength(2);
    });
    expect(supabaseHarness.state.historyCalls).toHaveLength(2);

    await act(async () => {
      fireEvent.click(
        renderer.container.querySelector("#review-review-1") as HTMLElement
      );
      await flush();
    });
    expect(supabaseHarness.state.historyCalls).toHaveLength(2);
    await unmountInbox(renderer);
  });

  it("deduplicates StrictMode mounting and stays below the one-request threshold", async () => {
    supabaseHarness.state.historyResponses.push(historyResponse([]));
    const { renderer } = await renderInbox(true);
    expect(supabaseHarness.state.historyCalls).toHaveLength(1);
    await unmountInbox(renderer);
  });

  it("updates the query cache after a real draft write without another history GET", async () => {
    supabaseHarness.state.reviewRows[0] = {
      ...supabaseHarness.state.reviewRows[0],
      comment: "",
      is_eligible_to_generate: false
    };
    supabaseHarness.state.historyResponses.push(historyResponse([]));
    const { renderer } = await renderInbox();
    const baseline = supabaseHarness.state.historyCalls.length;
    const templateButton = renderer.getByRole("button", {
      name: "Modèle note seule"
    });
    await act(async () => {
      fireEvent.click(templateButton);
      await flush();
    });
    expect(supabaseHarness.state.mutationCount).toBe(1);
    expect(supabaseHarness.state.historyCalls).toHaveLength(baseline);
    await unmountInbox(renderer);
  });

  it.each([400, 401, 402, 403, 404])("never retries HTTP %s", async (status) => {
    supabaseHarness.state.historyResponses.push(historyResponse([], status));
    const { renderer } = await renderInbox();
    expect(supabaseHarness.state.historyCalls).toHaveLength(1);
    await unmountInbox(renderer);
  });

  it("bounds temporary network/server failures to two retries", async () => {
    for (let index = 0; index < REVIEW_REPLIES_MAX_RETRIES + 1; index += 1) {
      supabaseHarness.state.historyResponses.push(historyResponse([], 503));
    }
    const { renderer } = await renderInbox();
    await waitFor(() => {
      expect(supabaseHarness.state.historyCalls).toHaveLength(
        REVIEW_REPLIES_MAX_RETRIES + 1
      );
    });
    expect(supabaseHarness.state.historyCalls).toHaveLength(
      REVIEW_REPLIES_MAX_RETRIES + 1
    );
    await unmountInbox(renderer);
  });

  it("has no polling or Realtime subscription lifecycle for review_replies", async () => {
    supabaseHarness.state.historyResponses.push(historyResponse([]));
    const { renderer } = await renderInbox();
    const baseline = supabaseHarness.state.historyCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(supabaseHarness.state.historyCalls).toHaveLength(baseline);
    expect(supabaseHarness.state.channelCount).toBe(0);
    await unmountInbox(renderer);
    expect(supabaseHarness.state.channelCount).toBe(0);
  });
});

describe("review_replies retry policy", () => {
  it.each([400, 401, 402, 403, 404])("rejects retry for %s", (status) => {
    expect(
      shouldRetryReviewReplies(0, new ReviewRepliesQueryError("failure", status))
    ).toBe(false);
  });

  it("allows only the documented retry budget for non-4xx errors", () => {
    const error = new ReviewRepliesQueryError("network", null);
    expect(shouldRetryReviewReplies(0, error)).toBe(true);
    expect(shouldRetryReviewReplies(1, error)).toBe(true);
    expect(shouldRetryReviewReplies(2, error)).toBe(false);
  });
});
