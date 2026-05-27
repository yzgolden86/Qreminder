import { describe, expect, it } from "vitest";
import {
  assertExternalHttpUrl,
  isBlockedHostname,
  resolveExternalRedirectUrl,
} from "./external-url.js";

describe("external URL safety", () => {
  it("allows public http and https URLs", () => {
    expect(assertExternalHttpUrl("https://example.com/api").hostname).toBe("example.com");
    expect(assertExternalHttpUrl("http://8.8.8.8/favicon.ico").hostname).toBe("8.8.8.8");
  });

  it("blocks non-http protocols and private targets", () => {
    expect(() => assertExternalHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertExternalHttpUrl("http://localhost:3000")).toThrow();
    expect(() => assertExternalHttpUrl("http://127.0.0.1")).toThrow();
    expect(() => assertExternalHttpUrl("http://10.0.0.2")).toThrow();
    expect(() => assertExternalHttpUrl("http://172.16.0.2")).toThrow();
    expect(() => assertExternalHttpUrl("http://192.168.1.2")).toThrow();
    expect(() => assertExternalHttpUrl("http://169.254.169.254")).toThrow();
    expect(() => assertExternalHttpUrl("http://[::1]")).toThrow();
    expect(() => assertExternalHttpUrl("http://[fd00::1]")).toThrow();
    expect(() => assertExternalHttpUrl("http://[::ffff:127.0.0.1]")).toThrow();
    expect(() => assertExternalHttpUrl("http://[::ffff:10.0.0.2]")).toThrow();
    expect(() => assertExternalHttpUrl("http://[::ffff:192.168.1.2]")).toThrow();
    expect(() => assertExternalHttpUrl("http://[::ffff:169.254.169.254]")).toThrow();
  });

  it("allows public IPv4-mapped IPv6 addresses", () => {
    expect(assertExternalHttpUrl("http://[::ffff:8.8.8.8]/favicon.ico").hostname).toBe("[::ffff:808:808]");
  });

  it("validates redirects against the same rules", () => {
    expect(resolveExternalRedirectUrl("/next", "https://example.com/a").toString()).toBe("https://example.com/next");
    expect(() => resolveExternalRedirectUrl("http://127.0.0.1/admin", "https://example.com/a")).toThrow();
  });

  it("blocks metadata-style hostnames", () => {
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
  });
});
