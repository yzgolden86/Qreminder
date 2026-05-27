import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailerAdapter } from "../adapters/mailer.js";
import { dispatchToChannels } from "./channel-dispatcher.js";

const mailer: MailerAdapter = {
  async send() {
    return { id: "test-mail" };
  },
};

const message = {
  title: "Renewal due",
  body: "Netflix renews tomorrow",
};

describe("dispatchToChannels external URL safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects private WeCom webhook URLs before fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await dispatchToChannels(
      { mailer },
      ["wechat"],
      { wechatWebhookUrl: "http://127.0.0.1:8080/hook" },
      "user@example.com",
      message,
    );

    expect(result.anySuccess).toBe(false);
    expect(result.results[0]).toMatchObject({
      channel: "wechat",
      success: false,
    });
    expect(result.results[0]?.error).toContain("Private/internal hosts");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects private Bark server URLs before fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await dispatchToChannels(
      { mailer },
      ["bark"],
      {
        barkServerUrl: "http://169.254.169.254",
        barkDeviceKey: "device-key",
      },
      "user@example.com",
      message,
    );

    expect(result.anySuccess).toBe(false);
    expect(result.results[0]).toMatchObject({
      channel: "bark",
      success: false,
    });
    expect(result.results[0]?.error).toContain("Private/internal hosts");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not follow redirects from custom webhooks", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await dispatchToChannels(
      { mailer },
      ["webhook"],
      { webhookUrl: "https://example.com/hook" },
      "user@example.com",
      message,
    );

    expect(result.anySuccess).toBe(false);
    expect(result.results[0]?.error).toContain("redirects are not allowed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
