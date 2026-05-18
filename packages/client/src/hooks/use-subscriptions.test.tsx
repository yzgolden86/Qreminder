import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertDateOnly } from "@/lib/time/date-only";
import type { ApiSubscription } from "@/lib/api/schemas/subscriptions";
import type { FixedCycleSubscription, Subscription } from "@/types/subscription";
import { useCreateSubscription, useUpdateSubscription } from "./use-subscriptions";

type FixedSubscriptionDraft = Omit<FixedCycleSubscription, "id">;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function subscriptionDraft(overrides: Partial<FixedSubscriptionDraft> = {}): FixedSubscriptionDraft {
  return {
    name: "Aws",
    logo: "https://aws.amazon.com/favicon.ico",
    price: 15,
    currency: "USD",
    billingCycle: "monthly",
    customDays: undefined,
    category: "productivity",
    status: "active",
    paymentMethod: undefined,
    startDate: assertDateOnly("2026-05-14"),
    nextBillingDate: assertDateOnly("2026-06-14"),
    autoCalculateNextBillingDate: true,
    trialEndDate: undefined,
    website: undefined,
    notes: undefined,
    tags: [],
    reminderOffsets: [3],
    ...overrides,
  };
}

function apiSubscriptionFromPayload(id: string, body: Record<string, unknown>): ApiSubscription {
  const result: Record<string, unknown> = {
    id,
    name: body["name"],
    price: body["price"],
    currency: body["currency"],
    billingCycle: body["billingCycle"],
    category: body["category"],
    status: body["status"],
    startDate: body["startDate"],
    nextBillingDate: body["nextBillingDate"],
    autoCalculateNextBillingDate: body["autoCalculateNextBillingDate"],
    tags: body["tags"],
    reminderOffsets: body["reminderOffsets"],
  };
  if (body["logo"] !== null) result["logo"] = body["logo"];
  if (body["customDays"] !== null) result["customDays"] = body["customDays"];
  if (body["paymentMethod"] !== null) result["paymentMethod"] = body["paymentMethod"];
  if (body["trialEndDate"] !== null) result["trialEndDate"] = body["trialEndDate"];
  if (body["website"] !== null) result["website"] = body["website"];
  if (body["notes"] !== null) result["notes"] = body["notes"];
  return result as ApiSubscription;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("use-subscriptions mutations", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let lastBody: Record<string, unknown> | null = null;
  let lastUrl: string | null = null;
  let lastMethod: string | null = null;

  beforeEach(() => {
    fetchMock.mockReset();
    lastBody = null;
    lastUrl = null;
    lastMethod = null;
    fetchMock.mockImplementation(async (input, init) => {
      lastUrl = typeof input === "string" ? input : input.toString();
      lastMethod = init?.method ?? "GET";
      const raw = init?.body;
      lastBody = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : null;
      const subscription = apiSubscriptionFromPayload("sub-1", lastBody ?? {});
      return jsonResponse({ subscription });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts JSON body to /api/subscriptions when creating", async () => {
    const { result } = renderHook(() => useCreateSubscription(), { wrapper: createWrapper() });
    const draft = subscriptionDraft({ tags: [] });

    await act(async () => {
      await result.current.mutateAsync(draft);
    });

    expect(lastUrl).toBe("/api/subscriptions");
    expect(lastMethod).toBe("POST");
    expect(lastBody).toMatchObject({ name: "Aws", tags: [], reminderOffsets: [3] });
    expect(lastBody).not.toHaveProperty("user");
  });

  it("patches JSON body to /api/subscriptions/:id when updating", async () => {
    const { result } = renderHook(() => useUpdateSubscription(), { wrapper: createWrapper() });
    const subscription: Subscription = { id: "sub-1", ...subscriptionDraft({ tags: [] }) };

    await act(async () => {
      await result.current.mutateAsync(subscription);
    });

    expect(lastUrl).toBe("/api/subscriptions/sub-1");
    expect(lastMethod).toBe("PATCH");
    expect(lastBody).toMatchObject({ name: "Aws", tags: [] });
  });
});
