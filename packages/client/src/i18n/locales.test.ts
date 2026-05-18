import { describe, expect, it, vi } from "vitest";
import { detectBrowserLocale, normalizeLocale } from "./locales";
import { getLocaleHeaders, setApiLocale } from "./api-locale";

describe("locales", () => {
  it("normalizes supported language tags", () => {
    expect(normalizeLocale("zh")).toBe("zh-CN");
    expect(normalizeLocale("zh-Hant-HK")).toBe("zh-CN");
    expect(normalizeLocale("en-GB")).toBe("en-US");
    expect(normalizeLocale("fr-FR")).toBe("zh-CN");
  });

  it("detects browser locale from navigator languages", () => {
    vi.stubGlobal("navigator", { languages: ["en-GB", "zh-CN"], language: "zh-CN" });

    expect(detectBrowserLocale()).toBe("en-US");

    vi.unstubAllGlobals();
  });
});

describe("locale headers", () => {
  it("returns Accept-Language and X-Qreminder-Locale matching the active locale", () => {
    setApiLocale("en-US");

    expect(getLocaleHeaders()).toEqual({
      "Accept-Language": "en-US",
      "X-Qreminder-Locale": "en-US",
    });

    setApiLocale("zh-CN");
  });
});
