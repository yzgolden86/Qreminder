import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFaviconSearch } from "./use-favicon-search";

type ApiFetchMock = (
  url: string,
  responseSchema: unknown,
  init?: RequestInit,
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn<ApiFetchMock>(() => new Promise<unknown>(() => undefined)),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    apiFetch: mocks.apiFetch,
  };
});

describe("useFaviconSearch", () => {
  beforeEach(() => {
    mocks.apiFetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-fills and searches with autoQuery once per open", async () => {
    const generateUrls = vi.fn((query: string) => [`https://${query}.example/favicon.ico`]);

    const { result } = renderHook(() =>
      useFaviconSearch({
        autoQuery: "Netflix",
        generateUrls,
        serverSearch: { enabled: false },
      }),
    );

    act(() => {
      result.current.onOpenChange(true);
    });

    await waitFor(() => {
      expect(result.current.query).toBe("Netflix");
    });
    expect(result.current.results).toEqual(["https://Netflix.example/favicon.ico"]);
    expect(generateUrls).toHaveBeenCalledTimes(1);
  });

  it("keeps an intentionally cleared autoQuery empty and does not search with fallback text", async () => {
    const generateUrls = vi.fn((query: string) => [`https://${query}.example/favicon.ico`]);

    const { result } = renderHook(() =>
      useFaviconSearch({
        autoQuery: "Netflix",
        generateUrls,
        serverSearch: { enabled: false },
      }),
    );

    act(() => {
      result.current.onOpenChange(true);
    });
    await waitFor(() => {
      expect(result.current.query).toBe("Netflix");
    });

    act(() => {
      result.current.setQuery("");
    });
    expect(result.current.query).toBe("");

    generateUrls.mockClear();
    act(() => {
      result.current.search();
    });

    expect(result.current.query).toBe("");
    expect(generateUrls).not.toHaveBeenCalled();
  });

  it("allows autoQuery initialization again after closing and reopening", async () => {
    const generateUrls = vi.fn((query: string) => [`https://${query}.example/favicon.ico`]);

    const { result } = renderHook(() =>
      useFaviconSearch({
        autoQuery: "Netflix",
        generateUrls,
        serverSearch: { enabled: false },
      }),
    );

    act(() => {
      result.current.onOpenChange(true);
    });
    await waitFor(() => {
      expect(result.current.query).toBe("Netflix");
    });

    act(() => {
      result.current.setQuery("");
      result.current.onOpenChange(false);
    });
    expect(result.current.query).toBe("");

    act(() => {
      result.current.onOpenChange(true);
    });

    await waitFor(() => {
      expect(result.current.query).toBe("Netflix");
    });
    expect(generateUrls).toHaveBeenCalledTimes(2);
  });

  it("aborts server search and invalidates stale requests on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useFaviconSearch({
        generateUrls: (query) => [`https://${query}.example/favicon.ico`],
      }),
    );

    act(() => {
      result.current.setQuery("qreminder");
    });
    act(() => {
      result.current.search();
    });

    const init = mocks.apiFetch.mock.calls[0]?.[2];
    expect(result.current.results).toEqual(["https://qreminder.example/favicon.ico"]);
    expect(init?.signal?.aborted).toBe(false);

    unmount();
    expect(init?.signal?.aborted).toBe(true);
  });

  it("delays clearing visible state on close while aborting active server search", () => {
    vi.useFakeTimers();
    const generateUrls = vi.fn((query: string) => [`https://${query}.example/favicon.ico`]);

    const { result } = renderHook(() =>
      useFaviconSearch({
        generateUrls,
        closeResetDelayMs: 200,
      }),
    );

    act(() => {
      result.current.onOpenChange(true);
      result.current.setQuery("youtube");
    });
    act(() => {
      result.current.search();
    });

    const init = mocks.apiFetch.mock.calls[0]?.[2];
    expect(result.current.results).toEqual(["https://youtube.example/favicon.ico"]);
    expect(result.current.hasSearched).toBe(true);
    expect(init?.signal?.aborted).toBe(false);

    act(() => {
      result.current.onOpenChange(false);
    });

    expect(result.current.open).toBe(false);
    expect(init?.signal?.aborted).toBe(true);
    expect(result.current.query).toBe("youtube");
    expect(result.current.results).toEqual(["https://youtube.example/favicon.ico"]);
    expect(result.current.hasSearched).toBe(true);

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(result.current.query).toBe("youtube");
    expect(result.current.results).toEqual(["https://youtube.example/favicon.ico"]);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.hasSearched).toBe(false);
  });
});
