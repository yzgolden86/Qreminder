import { describe, expect, it } from "vitest";
import { __testing__ } from "./import.js";

const { validateExport } = __testing__;

describe("JSON import validation", () => {
  it("accepts a minimal valid Qreminder export", () => {
    const result = validateExport({
      app: "Qreminder",
      schemaVersion: 2,
      exportedAt: "2026-05-27T00:00:00.000Z",
      data: {
        subscriptions: [
          {
            name: "Netflix",
            price: 9.99,
            currency: "USD",
            billingCycle: "monthly",
            startDate: "2026-01-01",
            nextBillingDate: "2026-06-01",
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed optional data sections", () => {
    expect(validateExport({
      app: "Qreminder",
      schemaVersion: 2,
      data: { subscriptions: { name: "Netflix" } },
    })).toMatchObject({
      ok: false,
      reason: "subscriptions must be an array",
    });

    expect(validateExport({
      app: "Qreminder",
      schemaVersion: 2,
      data: { settings: [] },
    })).toMatchObject({
      ok: false,
      reason: "settings must be an object",
    });
  });

  it("rejects subscriptions that preview cannot safely render", () => {
    expect(validateExport({
      app: "Qreminder",
      schemaVersion: 2,
      data: { subscriptions: [{ price: 9.99 }] },
    })).toMatchObject({
      ok: false,
      reason: "subscriptions must include a non-empty name",
    });

    expect(validateExport({
      app: "Qreminder",
      schemaVersion: 2,
      data: { subscriptions: [{ name: "   " }] },
    })).toMatchObject({
      ok: false,
      reason: "subscriptions must include a non-empty name",
    });
  });
});
