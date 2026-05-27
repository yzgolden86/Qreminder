import { describe, expect, it } from "vitest";
import { __testing__ } from "./webdav.js";

const { normalizeWebdavPath, normalizeWebdavUrl, resolveWebdavHref } = __testing__;

describe("WebDAV path normalization", () => {
  it("adds a leading and trailing slash", () => {
    expect(normalizeWebdavPath("backups")).toBe("/backups/");
    expect(normalizeWebdavPath("/backups")).toBe("/backups/");
    expect(normalizeWebdavPath("backups/qreminder")).toBe("/backups/qreminder/");
  });

  it("keeps an already normalized path stable", () => {
    expect(normalizeWebdavPath("/qreminder-backup/")).toBe("/qreminder-backup/");
  });

  it("falls back to the default folder when empty", () => {
    expect(normalizeWebdavPath("   ")).toBe("/qreminder-backup/");
  });
});

describe("WebDAV URL safety", () => {
  it("normalizes public http/https WebDAV base URLs", () => {
    expect(normalizeWebdavUrl(" https://example.com/dav/ ")).toBe("https://example.com/dav");
    expect(normalizeWebdavUrl("http://8.8.8.8/backups")).toBe("http://8.8.8.8/backups");
  });

  it("rejects private or internal WebDAV base URLs", () => {
    expect(() => normalizeWebdavUrl("http://localhost:8080/dav")).toThrow();
    expect(() => normalizeWebdavUrl("http://169.254.169.254/latest")).toThrow();
    expect(() => normalizeWebdavUrl("http://metadata.google.internal/compute")).toThrow();
  });

  it("keeps restore hrefs on the configured host", () => {
    const config = {
      enabled: true,
      url: "https://example.com/dav",
      username: "u",
      password: "p",
      path: "/backups/",
    };
    expect(resolveWebdavHref("/dav/backups/qreminder.zip", config)).toBe("https://example.com/dav/backups/qreminder.zip");
    expect(resolveWebdavHref("qreminder.zip", config)).toBe("https://example.com/dav/backups/qreminder.zip");
    expect(() => resolveWebdavHref("https://evil.example/qreminder.zip", config)).toThrow();
    expect(() => resolveWebdavHref("http://127.0.0.1/qreminder.zip", config)).toThrow();
  });
});
