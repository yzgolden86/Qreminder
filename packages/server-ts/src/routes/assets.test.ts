/**
 * Logo URL 候选生成器测试。
 *
 * 验证：
 * - 直接图片 URL 走 as-is
 * - 网站 URL 展开成多个候选 favicon 路径 + 兜底
 * - 私有网段 / 非 HTTP 协议被拒绝
 */
import { describe, it, expect } from "vitest";
import { __testing__ } from "./assets.js";

const { buildFetchCandidates } = __testing__;

describe("buildFetchCandidates", () => {
  it("returns a single candidate for direct image URLs", () => {
    expect(buildFetchCandidates("https://example.com/logo.png")).toEqual([
      "https://example.com/logo.png",
    ]);
    expect(buildFetchCandidates("https://example.com/icon.svg")).toEqual([
      "https://example.com/icon.svg",
    ]);
  });

  it("returns multiple favicon candidates for a website URL", () => {
    const candidates = buildFetchCandidates("https://netflix.com");
    expect(candidates).toContain("https://netflix.com/favicon.svg");
    expect(candidates).toContain("https://netflix.com/favicon.ico");
    expect(candidates).toContain("https://netflix.com/apple-touch-icon.png");
    expect(candidates[candidates.length - 1]).toContain("google.com/s2/favicons");
  });

  it("accepts bare hostnames and assumes https", () => {
    const candidates = buildFetchCandidates("netflix.com");
    expect(candidates[0]).toBe("https://netflix.com/favicon.svg");
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => buildFetchCandidates("file:///etc/passwd")).toThrow();
    expect(() => buildFetchCandidates("ftp://example.com/x.png")).toThrow();
  });

  it("blocks loopback and private hosts (defense in depth against SSRF)", () => {
    expect(() => buildFetchCandidates("http://localhost/x.png")).toThrow();
    expect(() => buildFetchCandidates("http://127.0.0.1/x.png")).toThrow();
    expect(() => buildFetchCandidates("http://10.0.0.5/x.png")).toThrow();
    expect(() => buildFetchCandidates("http://192.168.1.1/x.png")).toThrow();
    expect(() => buildFetchCandidates("http://172.16.0.1/x.png")).toThrow();
    expect(() => buildFetchCandidates("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => buildFetchCandidates("http://metadata.google.internal/computeMetadata/v1")).toThrow();
    expect(() => buildFetchCandidates("http://[::1]/x.png")).toThrow();
  });

  it("allows public IPs and proper domains", () => {
    expect(() => buildFetchCandidates("https://8.8.8.8/favicon.ico")).not.toThrow();
    expect(() => buildFetchCandidates("https://github.com")).not.toThrow();
  });
});
