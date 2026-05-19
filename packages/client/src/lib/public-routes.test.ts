import { describe, expect, it } from "vitest";
import { isPublicRoutePath } from "./public-routes";

describe("isPublicRoutePath", () => {
  it("allows login, change-credentials, legal pages, and password reset pages", () => {
    expect(isPublicRoutePath("/login")).toBe(true);
    expect(isPublicRoutePath("/change-credentials")).toBe(true);
    expect(isPublicRoutePath("/forgot-password")).toBe(true);
    expect(isPublicRoutePath("/reset-password")).toBe(true);
    expect(isPublicRoutePath("/terms")).toBe(true);
    expect(isPublicRoutePath("/privacy")).toBe(true);
  });

  it("keeps application pages protected", () => {
    expect(isPublicRoutePath("/settings")).toBe(false);
    expect(isPublicRoutePath("/admin/users")).toBe(false);
  });
});
