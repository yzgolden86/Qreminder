import { describe, expect, it } from "vitest";
import { __testing__ } from "./webdav.js";

const { normalizeWebdavPath } = __testing__;

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
