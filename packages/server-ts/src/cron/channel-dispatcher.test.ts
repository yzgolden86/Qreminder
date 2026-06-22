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

describe("dispatchToChannels email content", () => {
  it("passes rich HTML bodies to the mailer when provided", async () => {
    const send = vi.fn(async () => ({ id: "mail-rich" }));
    const result = await dispatchToChannels(
      { mailer: { send } },
      ["email"],
      {},
      "user@example.com",
      {
        title: "Qreminder · Netflix 今天即将续费",
        body: "Netflix 今天续费\n访问: https://netflix.com/",
        html: "<a href=\"https://netflix.com/\">访问订阅网站</a>",
      },
    );

    expect(result.anySuccess).toBe(true);
    expect(send).toHaveBeenCalledWith({
      to: ["user@example.com"],
      subject: "Qreminder · Netflix 今天即将续费",
      text: "Netflix 今天续费\n访问: https://netflix.com/",
      html: "<a href=\"https://netflix.com/\">访问订阅网站</a>",
    });
  });

  it("splits multiple email recipients on commas, semicolons, and new lines", async () => {
    const send = vi.fn(async () => ({ id: "mail-multi" }));
    const result = await dispatchToChannels(
      { mailer: { send } },
      ["email"],
      {
        notifyMultipleAddresses: true,
        recipientEmail: "a@example.com, b@example.com\nc@example.com; d@example.com",
      },
      "fallback@example.com",
      message,
    );

    expect(result.anySuccess).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ["a@example.com", "b@example.com", "c@example.com", "d@example.com"],
    }));
  });
});

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
