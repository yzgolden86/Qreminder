import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing__ } from "./notifications.js";

const { buildBarkTestUrl, fetchExternalUrl, validateExternalUrl } = __testing__;

describe("notification test URL safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared external URL rules for user-provided webhook URLs", () => {
    expect(validateExternalUrl("https://example.com/hook")).toMatchObject({
      ok: true,
      url: "https://example.com/hook",
    });
    expect(validateExternalUrl("http://localhost:3000/hook")).toMatchObject({
      ok: false,
      reason: "Private/internal hosts are not allowed",
    });
    expect(validateExternalUrl("http://[::ffff:127.0.0.1]/hook")).toMatchObject({
      ok: false,
      reason: "Private/internal hosts are not allowed",
    });
  });

  it("builds Bark test URLs from a validated public server base", () => {
    expect(buildBarkTestUrl("https://api.day.app", "device-key")).toBe(
      "https://api.day.app/device-key/Qreminder%20Test/If%20you%20see%20this%2C%20Bark%20is%20configured%20correctly.",
    );
    expect(() => buildBarkTestUrl("http://169.254.169.254", "device-key")).toThrow();
  });

  it("does not follow redirects for custom notification test URLs", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchExternalUrl("https://example.com/hook")).rejects.toThrow("redirects are not allowed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
